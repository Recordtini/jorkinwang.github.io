import {WheelGame, LETTERS, VOWELS, money} from './game.js?v=20261006-podiums';
import {Studio} from './scene.js?v=20261006-podiums';
import {automaticView,solveTiles,fillSolution} from './presentation.js?v=20261006-podiums';

const $ = selector => document.querySelector(selector);
const colors=['#e87555','#f4c94e','#65a1ef'];
let studio, game, manifest, puzzles, muted=false, started=false, aiTimer=null, bonusTimer=null, bonusEnd=0, audioContext;
const soundBuffers=new Map();
let music;
let presenting=false, presentationTimer=null, presentationGeneration=0, automaticCamera=true;
let solving=false, solveDraft={}, solveCursor=null;
const nameInput=slot=>$(slot===0?'#player-name':`#player-name-${slot}`);
function roster(){return Array.from({length:3},(_,slot)=>({slot,name:nameInput(slot).value.trim()||`Player ${slot+1}`,type:$(`#player-type-${slot}`).value}));}
function updateRoster(){for(const {slot,type} of roster()){nameInput(slot).disabled=type==='off';nameInput(slot).closest('.roster-row').classList.toggle('empty',type==='off');}}
function preset(mode){if(mode!=='custom'){const types=mode==='single'?['local','off','off']:mode==='local'?['local','local','local']:['local','cpu','cpu'];types.forEach((type,i)=>{$(`#player-type-${i}`).value=type;});}updateRoster();}
function messageError(error){console.error(error);$('#message').textContent=error.message;}
function store(key,value){try{localStorage.setItem(key,value);}catch{}}
function stored(key){try{return localStorage.getItem(key);}catch{return null;}}
function playSound(id,volume=.6){
  if(muted||!manifest)return;
  const entry=manifest.audio.find(a=>a.id===id);if(!entry)return;
  // Decoded buffers let overlapping wheel ticks play without allocating elements.
  if(audioContext){
    const promise=soundBuffers.get(id)??fetch(entry.url).then(r=>r.arrayBuffer()).then(b=>audioContext.decodeAudioData(b));
    soundBuffers.set(id,promise);
    promise.then(buffer=>{if(muted)return;const source=audioContext.createBufferSource();source.buffer=buffer;const gain=audioContext.createGain();gain.gain.value=volume;source.connect(gain).connect(audioContext.destination);source.start();}).catch(()=>{});
  }
}
function activateSound(){
  audioContext??=new (window.AudioContext||window.webkitAudioContext)();audioContext.resume().catch(()=>{});
}
function setMusic(){
  music?.pause();
  const track=manifest.audio.find(a=>a.id==='Wof8BarTheme');
  if(track&&!muted){music=new Audio(track.url);music.loop=true;music.volume=.12;music.play().catch(()=>{});}
}
function setCamera(view){studio.setView(view);document.querySelectorAll('[data-view]').forEach(button=>button.classList.toggle('selected',button.dataset.view===view));}
function setAutomaticCamera(enabled){automaticCamera=enabled;$('#camera-mode').value=enabled?'auto':'manual';store('wheel3d-camera',enabled?'auto':'manual');if(enabled&&game.state)setCamera(automaticView(game.state));}
function returnToLobby(){
  clearTimeout(aiTimer);clearInterval(bonusTimer);$('#mystery-choice')?.remove();
  clearTimeout(presentationTimer);presentationGeneration++;presenting=false;studio.cancelPresentation();
  closeSolve();started=false;music?.pause();$('#game-ui').hidden=true;$('#lobby').hidden=false;
  studio.setBonusVisible(false);studio.drawScreens(null);setCamera('show');
}
function render(state,event,completed=false){
  if(!state)return;
  if(!completed){
    const duration=studio.update(state,event),generation=++presentationGeneration;
    clearTimeout(presentationTimer);presenting=duration>0;
    if(presenting)presentationTimer=setTimeout(()=>{if(generation!==presentationGeneration||!started)return;presenting=false;render(game.state,event,true);},duration+40);
  }
  const current=state.players[state.turn],human=!current.ai;
  if(solving&&(!human||['spinning','spinning-bonus','round-over','finished','bonus-spin','bonus-select','mystery'].includes(state.phase)||event==='miss'&&state.round!==5))closeSolve();
  $('#round-label').textContent=state.round===5?'BONUS ROUND':`ROUND ${state.round}${state.round===2?' / JACKPOT':state.round===3?' / MYSTERY':''}`;
  $('#category').textContent=state.puzzle.category;
  $('#turn-label').textContent=current.name.toUpperCase();$('#message').textContent=state.message;
  $('#scoreboard').style.setProperty('--score-width',`${state.players.length*210+(state.players.length-1)*9}px`);
  $('#scoreboard').replaceChildren(...state.players.map((player,i)=>{
    const card=document.createElement('div');card.className='player'+(i===state.turn?' active':'');card.style.setProperty('--player-color',colors[player.slot]);
    card.setAttribute('aria-current',String(i===state.turn));
    const name=document.createElement('div');name.className='name';name.textContent=player.name;
    if(player.ai){const ai=document.createElement('small');ai.textContent='CPU';name.append(ai);}
    const cash=document.createElement('div');cash.className='money';cash.textContent=money(player.cash);
    const bank=document.createElement('div');bank.className='bank';bank.textContent=`BANK ${money(player.bank)}`;
    card.append(name,cash,bank);return card;
  }));
  $('#spin').disabled=presenting||!['action','bonus-spin'].includes(state.phase)||!human;
  $('#vowel').disabled=presenting||state.phase!=='action'||!human||current.cash<250||[...VOWELS].every(l=>state.used.includes(l));
  $('#solve').disabled=presenting||!['action','consonant','vowel','bonus-solve'].includes(state.phase)||!human;
  $('#next').disabled=presenting;
  $('#next').hidden=!['round-over','finished'].includes(state.phase);
  $('#next').textContent=state.phase==='finished'?'PLAY AGAIN':state.round===4?'BONUS ROUND':'NEXT ROUND';
  $('#spin').hidden=state.round===5&&state.phase!=='bonus-spin'&&state.phase!=='spinning-bonus';$('#vowel').hidden=state.round===5;
  $('#spin').firstChild.textContent=state.round===5?'SPIN THE BONUS WHEEL ':'SPIN THE WHEEL ';
  $('#bonus-hint').hidden=state.phase!=='bonus-select';
  for(const button of $('#alphabet').children){
    const letter=button.textContent;button.disabled=presenting||!human||!game.canGuess(letter);
    button.className=(VOWELS.includes(letter)?'vowel ':'')+(state.used.includes(letter)?state.puzzle.answer.toUpperCase().includes(letter)?'used':'miss':'');
    if(state.bonusChoices.includes(letter)&&state.round===5)button.classList.add('chosen');
  }
  if(!human||['spinning','spinning-bonus','round-over','finished','bonus-spin','bonus-select','mystery'].includes(state.phase))$('#solve-form').hidden=true;
  store('wheel3d-save',game.save());
  if(!completed&&automaticCamera)setCamera(automaticView(state,event));
  if(!completed){
    if(event==='win')playSound('PuzzleWin',.7);
    if(event==='letter')playSound(VOWELS.includes(state.used.at(-1))?'LetterVowel':'LetterConsonant',.6);
    if(event==='miss'||event==='lose-turn')playSound('Incorrect',.5);
    if(event==='bankrupt')playSound('Bankrupt',.7);
    if(event==='start')playSound('WofChant',.35);
    if(event==='land'&&state.lastWedge==='MYSTERY')playSound('LandOnMysteryWedge');
    if(event==='round'||event==='bonus-letters')playSound('PuzzleReveal');
    if(event==='win'&&state.phase==='finished')playSound('BonusRoundTotal',.6);
  }
  if(event==='bonus-ready'&&!presenting&&state.phase==='bonus-solve')startBonusClock();
  if(state.phase==='finished'){clearInterval(bonusTimer);bonusTimer=null;music?.pause();}
  if(state.phase==='mystery'&&human&&!presenting)showMystery();
  scheduleAI();
}
function showMystery(){
  $('#solve-form').hidden=true;
  let choice=$('#mystery-choice');
  if(!choice){choice=document.createElement('div');choice.id='mystery-choice';choice.className='actions';choice.style.marginTop='12px';$('.console').append(choice);}
  choice.replaceChildren();
  for(const [risk,label] of [[false,'KEEP THE CASH'],[true,'RISK IT FOR $10,000']]){
    const button=document.createElement('button');button.textContent=label;
    button.onclick=()=>{choice.remove();game.mystery(risk);};choice.append(button);
  }
}
function startBonusClock(){
  clearInterval(bonusTimer);bonusEnd=performance.now()+30000;
  bonusTimer=setInterval(()=>{
    if(game.state.phase!=='bonus-solve'){clearInterval(bonusTimer);return;}
    const seconds=Math.max(0,Math.ceil((bonusEnd-performance.now())/1000));
    $('#message').textContent=`${seconds} seconds. Solve the bonus puzzle!`;
    if(!seconds){playSound('TimesUp');game.finishBonus(false);}
  },200);
  if(!game.player.ai)openSolve();
}
function closeSolve(){solving=false;solveDraft={};solveCursor=null;$('#solve-form').hidden=true;$('#game-ui').classList.remove('solving');studio?.setSolveDraft(null);}
function syncSolve(){studio.setSolveDraft(solveDraft,solveCursor);$('#lock-solve').disabled=fillSolution(game.state,solveDraft)===null;}
function enterSolveLetter(letter){
  if(!solving||solveCursor===null||!/^[A-Z]$/.test(letter))return;
  solveDraft[solveCursor]=letter;const input=$(`#solve-tiles input[data-index="${solveCursor}"]`);input.value=letter;
  const inputs=[...$('#solve-tiles').querySelectorAll('input')],at=inputs.indexOf(input);inputs[at+1]?.focus();syncSolve();
}
function openSolve(){
  if($('#solve').disabled)return;closeSolve();solving=true;$('#solve-form').hidden=false;$('#game-ui').classList.add('solving');
  const tiles=solveTiles(game.state);$('#solve-tiles').replaceChildren(...tiles.map(tile=>{
    if(!tile.editable){const span=document.createElement('span');span.textContent=tile.text.trim();span.className=tile.text.trim()?'known':'';return span;}
    const input=document.createElement('input');input.maxLength=1;input.autocomplete='off';input.spellcheck=false;input.dataset.index=tile.index;
    input.setAttribute('aria-label',`Missing letter row ${tile.row+1} column ${tile.column+1}`);
    input.onfocus=()=>{solveCursor=tile.index;input.select();syncSolve();};
    input.oninput=()=>{const letter=input.value.toUpperCase().replace(/[^A-Z]/g,'').at(-1)??'';input.value=letter;if(letter)enterSolveLetter(letter);else{delete solveDraft[tile.index];syncSolve();}};
    input.onkeydown=event=>{
      const inputs=[...$('#solve-tiles').querySelectorAll('input')],at=inputs.indexOf(input);
      if(event.key==='ArrowLeft'||event.key==='ArrowRight'){event.preventDefault();inputs[at+(event.key==='ArrowLeft'?-1:1)]?.focus();}
      if(event.key==='Backspace'&&!input.value){event.preventDefault();const previous=inputs[at-1];if(previous){previous.value='';delete solveDraft[previous.dataset.index];previous.focus();syncSolve();}}
    };
    input.onpaste=event=>{event.preventDefault();for(const letter of (event.clipboardData.getData('text').toUpperCase().match(/[A-Z]/g)??[])){const before=solveCursor;enterSolveLetter(letter);if(solveCursor===before)break;}};
    return input;
  }));
  syncSolve();$('#solve-tiles input')?.focus();setCamera('board');
}
async function spin(){
  if(presenting)return;
  const session=presentationGeneration;
  if(game.isBonus){
    if(!game.beginBonusSpin())return;
    await studio.spinBonus(()=>playSound('WheelClick',.18));if(started&&session+1===presentationGeneration)game.finishBonusSpin();return;
  }
  const index=game.beginSpin();if(index===null)return;
  await studio.spin(index,game.wedges(),()=>playSound('WheelClick',.18));
  if(automaticCamera&&started&&session+1===presentationGeneration){studio.setView('wheel',true,true);const value=game.wedges()[index].value;$('#message').textContent=`${typeof value==='number'?money(value):value}. The wheel has landed.`;await new Promise(resolve=>setTimeout(resolve,1400));}
  if(started&&session+1===presentationGeneration)game.finishSpin(index);
}
function scheduleAI(){
  clearTimeout(aiTimer);
  const state=game.state;if(presenting||!started||!game.player.ai||['spinning','spinning-bonus','round-over','finished'].includes(state.phase))return;
  const currentTurn=state.turn,phase=state.phase;
  aiTimer=setTimeout(()=>{
    if(game.state.turn!==currentTurn||game.state.phase!==phase)return;
    const unknown=[...state.puzzle.answer.toUpperCase()].filter(l=>LETTERS.includes(l)&&!state.used.includes(l));
    const remaining=[...LETTERS].filter(l=>game.canGuess(l));
    const priority='RSTLNCDBMPHGFYWVZKJXQAEIOU';
    const choose=()=>remaining.sort((a,b)=>priority.indexOf(a)-priority.indexOf(b))[0];
    if(phase==='action'){
      const total=[...state.puzzle.answer].filter(l=>/[A-Z]/.test(l)).length;
      if(unknown.length/total<.36){game.solve(state.puzzle.answer);}
      else if(game.player.cash>=500 && [...VOWELS].some(l=>!state.used.includes(l)) && Math.random()<.4)game.buyVowel();
      else spin().catch(messageError);
    }else if(phase==='bonus-spin')spin().catch(messageError);
    else if(phase==='consonant'||phase==='vowel'||phase==='bonus-select'){
      if(remaining.length)game.guess(choose());else if(phase==='consonant')game.solve(state.puzzle.answer);
    }else if(phase==='mystery')game.mystery(game.player.cash<3500);
    else if(phase==='bonus-solve'){
      if(unknown.length<=Math.max(3,state.puzzle.answer.length*.4))game.solve(state.puzzle.answer);
      else game.finishBonus(false);
    }
  },phase==='bonus-solve'?4500:1400);
}
async function startGame(){
  clearTimeout(aiTimer);clearInterval(bonusTimer);$('#mystery-choice')?.remove();
  clearTimeout(presentationTimer);presentationGeneration++;presenting=false;studio.cancelPresentation();
  activateSound();
  const lineup=roster(),players=lineup.filter(p=>p.type!=='off').map(p=>({name:p.name,ai:p.type==='cpu',slot:p.slot}));
  if(!players.length||players.every(p=>p.ai)){$('#setup-error').hidden=false;$('#setup-error').textContent='Choose at least one local player.';return;}
  closeSolve();$('#setup-error').hidden=true;
  started=true;$('#lobby').hidden=true;$('#game-ui').hidden=false;
  game.start(players,$('#mode').value);
  setMusic();
  store('wheel3d-preferences',JSON.stringify({lineup,mode:$('#mode').value,stage:$('#stage-select').value}));
}
async function changeStage(id){
  $('#change-stage').disabled=true;
  try{await studio.setStage(id);$('#stage-select').value=id;$('#change-stage').value=id;}
  catch(error){messageError(error);}
  finally{$('#change-stage').disabled=false;}
}
async function boot(){
  try{
    [manifest,puzzles]=await Promise.all(['manifest','puzzles'].map(name=>fetch(`assets/${name}.json`).then(response=>{if(!response.ok)throw new Error('The game assets could not be loaded. Please reload.');return response.json();})));
    studio=new Studio($('#scene'),(text,progress)=>{$('#load-status').textContent=text;$('#load-progress').value=progress;});
    game=new WheelGame(puzzles,{onChange:render});studio.game=game;
    automaticCamera=stored('wheel3d-camera')!=='manual';$('#camera-mode').value=automaticCamera?'auto':'manual';
    // Keep score cards above the console when a solve or mystery choice expands it.
    new ResizeObserver(()=>{
      const consolePanel=$('.console');
      const bottom=parseFloat(getComputedStyle(consolePanel).bottom);
      $('#scoreboard').style.bottom=`${bottom+consolePanel.getBoundingClientRect().height+16}px`;
      if(started&&studio.view==='board')studio.setView('board',true);
    }).observe($('.console'));
    for(const select of [$('#stage-select'),$('#change-stage')]){
      select.replaceChildren(...manifest.stages.filter(stage=>stage.id!=='base').map(stage=>new Option(stage.name,stage.id)));
    }
    $('#stage-select').value='la';$('#change-stage').value='la';
    let preferences=null;try{preferences=JSON.parse(stored('wheel3d-preferences')||'null');}catch{}
    if(preferences){
      if(typeof preferences.name==='string')$('#player-name').value=preferences.name;
      $('#mode').value=['solo','single','local','custom'].includes(preferences.mode)?preferences.mode:'solo';preset($('#mode').value);
      if(Array.isArray(preferences.lineup))for(const p of preferences.lineup){if(!Number.isInteger(p.slot)||p.slot<0||p.slot>2)continue;if(typeof p.name==='string')nameInput(p.slot).value=p.name;if(['off','cpu','local'].includes(p.type))$(`#player-type-${p.slot}`).value=p.type;}updateRoster();
      if(manifest.stages.some(stage=>stage.id===preferences.stage&&stage.id!=='base')){
        $('#stage-select').value=preferences.stage;$('#change-stage').value=preferences.stage;
      }
    }
    $('#asset-count').textContent=`${manifest.puzzleCount.toLocaleString()} original puzzles · ${manifest.stages.length-1} themed studios · original game audio`;
    $('#credits').textContent=`Recovered: ${manifest.models.length} set and prop models, ${manifest.audio.length} audio tracks, and ${manifest.puzzleCount.toLocaleString()} puzzles.`;
    for(const letter of LETTERS){const button=document.createElement('button');button.textContent=letter;button.setAttribute('aria-label',`Choose ${letter}`);button.onclick=()=>{if(!presenting)game.guess(letter);};$('#alphabet').append(button);}
    await studio.initialize(manifest);await studio.setStage($('#stage-select').value);
    studio.drawScreens(null);
    for(const camera of studio.cameraCatalog.cameras)$('#source-camera').append(new Option(camera.name,camera.name));
    studio.drawBoard({puzzle:{rows:['              ','    WHEEL     ','  OF FORTUNE  ','              ']},used:[...LETTERS]});
    $('#load-progress').value=100;$('#loading').hidden=true;$('#lobby').hidden=false;
    // An explicit resume button avoids starting computer turns on page load.
    if(stored('wheel3d-save')){
      const resume=document.createElement('button');resume.textContent='RESUME SAVED GAME';resume.style.width='100%';resume.style.marginTop='8px';
      resume.onclick=()=>{
        activateSound();started=true;
        if(game.restore(stored('wheel3d-save'))){$('#lobby').hidden=true;$('#game-ui').hidden=false;setMusic();if(game.state.phase==='bonus-select'&&game.state.bonusChoices.length===4){game.state.phase='bonus-solve';render(game.state,'bonus-ready');}}
        else{started=false;resume.remove();}
      };$('#setup-form').after(resume);
    }
    $('#setup-form').onsubmit=event=>{event.preventDefault();startGame().catch(messageError);};
    $('#stage-select').onchange=()=>changeStage($('#stage-select').value);
    $('#change-stage').onchange=()=>changeStage($('#change-stage').value);
    $('#spin').onclick=()=>{activateSound();spin().catch(messageError);};$('#vowel').onclick=()=>{if(!presenting)game.buyVowel();};$('#solve').onclick=openSolve;
    $('#next').onclick=()=>{if(game.state.phase==='finished')returnToLobby();else game.nextRound();};
    $('#solve-form').onsubmit=event=>{event.preventDefault();const answer=fillSolution(game.state,solveDraft);if(!presenting&&answer!==null){game.solve(answer);if(game.state.phase!=='bonus-solve')closeSolve();}};
    $('#cancel-solve').onclick=closeSolve;
    $('#mode').onchange=()=>preset($('#mode').value);
    for(let i=0;i<3;i++)$(`#player-type-${i}`).onchange=()=>{$('#mode').value='custom';updateRoster();};
    $('#source-camera').onchange=()=>{if(!$('#source-camera').value)return;setAutomaticCamera(false);studio.view='source';studio.setSourceCamera($('#source-camera').value);$('#studio-dialog').close();};
    $('#sound').onclick=()=>{muted=!muted;$('#sound').textContent=muted?'SOUND OFF':'SOUND ON';$('#sound').setAttribute('aria-pressed',String(!muted));if(muted)music?.pause();else{activateSound();if(started)setMusic();}};
    $('#settings').onclick=()=>$('#studio-dialog').showModal();
    $('#quality').onchange=()=>studio.quality($('#quality').value);
    $('#camera-mode').onchange=()=>setAutomaticCamera($('#camera-mode').value==='auto');
    $('#restart').onclick=()=>{$('#studio-dialog').close();returnToLobby();};
    document.querySelectorAll('[data-view]').forEach(button=>button.onclick=()=>{setAutomaticCamera(false);setCamera(button.dataset.view);});
    const library=$('#library');
    for(const entry of manifest.models.filter(m=>m.url.includes('/animation/'))){
      const button=document.createElement('button');button.textContent=entry.id.replaceAll('_',' ');button.onclick=()=>{studio.previewPart(entry).catch(messageError);$('#studio-dialog').close();setCamera('orbit');};library.append(button);
    }
    const audioLibrary=document.createElement('div');audioLibrary.className='audio-library';
    const audioHeading=document.createElement('p');audioHeading.textContent='Original sound banks';audioLibrary.append(audioHeading);
    for(const entry of manifest.audio){
      const button=document.createElement('button');button.textContent=entry.id.replace(/([a-z])([A-Z])/g,'$1 $2');
      button.onclick=()=>{activateSound();playSound(entry.id,.5);};audioLibrary.append(button);
    }
    library.after(audioLibrary);
    document.addEventListener('keydown',event=>{
      if(presenting||!started||$('#studio-dialog').open||/INPUT|SELECT|TEXTAREA/.test(document.activeElement.tagName)||event.ctrlKey||event.metaKey||event.altKey||game.player.ai)return;
      const letter=event.key.toUpperCase();if(letter.length===1&&LETTERS.includes(letter)){if(solving)enterSolveLetter(letter);else game.guess(letter);}
      if(event.code==='Space'&&!$('#spin').disabled){event.preventDefault();spin().catch(messageError);}
    });
    document.addEventListener('visibilitychange',()=>{if(document.hidden){music?.pause();audioContext?.suspend();}else if(started&&!muted){audioContext?.resume();music?.play().catch(()=>{});}});
    window.wheel3d={studio,game,manifest,get state(){return game.state;}};
  }catch(error){console.error(error);$('#load-status').textContent=error.message+' Reload to try again.';$('#loading h1').textContent='Studio could not open';}
}
boot();
