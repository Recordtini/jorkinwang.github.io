import {JeopardyGame,cash,clueReadingSeconds,timerLightCount,cpuBuzzDelayMs,cpuAnswerDelayMs} from './game.js?v=20261009-fair-cpu';
import {JeopardyStudio} from './scene.js?v=20261009-fair-cpu';
import {RetailAudio} from '../wheel/audio.js';

const $=id=>document.getElementById(id),SAVE='jeopardy-3d-save-v1';
let studio,audio,game,clock=null,scheduled=[],lastTime=performance.now(),musicId=null,scheduleGeneration=0,autoResults=false,resultTransition=false,resultAutoAllowed=false;
const paused=()=>document.hidden||$('options').open||!$('lobby').hidden;
function cancel(){scheduled=[];clock=null;scheduleGeneration++;}
function later(ms,callback){scheduled.push({remaining:ms,callback});}
function seconds(value,callback){clock={remaining:value,total:value,callback};}
function button(text,fn,disabled=false){const b=document.createElement('button');b.textContent=text;b.disabled=disabled;b.onclick=()=>{audio.activate();fn();};return b;}
function music(id){if(id===musicId)return;musicId=id;if(id)audio.music(id).catch(console.warn);else audio.stopMusic();}
function cue(id){audio.play(id).catch(console.warn);}
function highlightChoice(index){
  $('answers').querySelectorAll('button').forEach((b,i)=>{b.classList.toggle('cpu-selected',i===index);b.setAttribute('aria-current',String(i===index));});
}
function arrange(){document.documentElement.style.setProperty('--scores-bottom',`${$('console').getBoundingClientRect().height+52}px`);}
function continueResult(){
  if(resultTransition||!['result','rebound'].includes(game.state.phase))return;
  resultTransition=true;cancel();$('continue').hidden=true;
  if(studio.auto)studio.cut('board');$('console').classList.add('board-beat');
  later(1000,()=>game.next());
}
function scheduleResult(){
  if(resultTransition||!['result','rebound'].includes(game.state.phase))return;
  cancel();$('continue').hidden=false;
  if(autoResults&&resultAutoAllowed)later(3000,continueResult);
}
function render(s,event){
  cancel();resultTransition=false;$('clock').hidden=true;$('response-timer').hidden=true;
  if(event==='start'||event==='round')studio.categoryIntro.start(s,()=>cue('categorybeep'),()=>render(game.state,'category-intro-end'));
  else if(s.phase!=='board')studio.categoryIntro.stop();
  studio.update(s);studio.follow(s,event);$('console').classList.remove('board-beat');
  try{localStorage.setItem(SAVE,game.save());}catch{}
  $('round-title').textContent=['','JEOPARDY!','DOUBLE JEOPARDY!','FINAL JEOPARDY!'][s.round];
  $('category').textContent=s.active?.category??s.final?.category.name??'';
  $('turn').textContent=game.player.name+ (game.player.ai?' / CPU':'');$('message').textContent=s.message;
  const takeover=s.phase!=='board';$('console').classList.toggle('takeover',takeover);$('console').classList.toggle('daily-double',s.phase==='wager');
  const outcome=['result','rebound'].includes(s.phase);
  $('console').classList.toggle('outcome',outcome);$('console').classList.toggle('responding',['answer','final-answer'].includes(s.phase));
  $('console').classList.toggle('stage-response',['answer','final-answer','wager','final-wager','result','rebound','final-pass','finished'].includes(s.phase));
  $('game-ui').classList.toggle('clue-open',takeover);$('clue-options').hidden=!takeover;
  $('board-controls').hidden=s.phase!=='board';$('board-controls').replaceChildren();
  if(s.phase==='board')s.board.forEach((category,c)=>{
    const column=document.createElement('div');column.className='board-column';const title=document.createElement('b');title.textContent=category.name;column.append(title);
    category.played.forEach((played,r)=>column.append(button(played?'':cash((r+1)*200*s.round),()=>game.select(c,r),played||game.player.ai||studio.inputLocked)));$('board-controls').append(column);
  });
  const showClue=s.active&&['reading','buzz','answer','final-reading','final-answer'].includes(s.phase);
  $('clue-panel').hidden=!showClue;$('clue-meta').textContent=s.active?(s.active.double?'DAILY DOUBLE / ':'')+s.active.category+(s.round<3?' / '+cash(s.active.value):''):'';
  $('clue-text').textContent=showClue?s.active.clue.question:'';
  $('response-category').hidden=!['wager','final-wager'].includes(s.phase);
  $('response-category').textContent=s.active?.category??s.final?.category.name??'';
  $('response').hidden=!outcome||!s.result;
  $('response-text').textContent=s.result?(s.result.timedOut?"TIME'S UP":s.result.response?`${s.active.clue.prefix} ${s.result.response}`:'RESPONSE LOCKED'):'';
  $('response-result').textContent=s.result?`${s.result.correct?'CORRECT':'INCORRECT'} / ${s.result.correct?'+':'-'}${cash(s.result.amount)}`:'';
  $('response').dataset.correct=String(s.result?.correct??false);
  $('buzzers').replaceChildren();$('answers').replaceChildren();
  if(s.phase==='buzz')s.players.forEach((player,i)=>$('buzzers').append(button(`${player.name} / BUZZ ${i+1}`,()=>game.buzz(i),player.ai||s.active.locked.includes(i))));
  if(['answer','final-answer'].includes(s.phase))s.choices.forEach((choice,i)=>$('answers').append(button(`${'ABCD'[i]}. ${s.active.clue.prefix} ${choice}`,()=>game.answer(i),game.player.ai)));
  const wager=['wager','final-wager'].includes(s.phase);$('wager-form').hidden=!wager;
  if(wager){const min=s.phase==='wager'?1:0,max=game.maxWager();$('wager-label').textContent=`${game.player.name}: wager ${cash(min)} to ${cash(max)}${s.phase==='final-wager'?' (pass the device privately)':''}`;$('wager').min=min;$('wager').max=max;$('wager').value=min;$('wager').disabled=game.player.ai;$('wager-form').querySelector('button').disabled=game.player.ai;}
  $('wager-score').hidden=s.phase!=='wager';$('wager-score').textContent=`${game.player.name} / SCORE ${cash(game.player.score)}`;
  $('wager-opponents').replaceChildren();$('wager-opponents').hidden=s.phase!=='wager'||s.players.length===1;
  if(s.phase==='wager')s.players.forEach((player,i)=>{
    if(i===s.turn)return;
    const score=document.createElement('div'),name=document.createElement('b'),amount=document.createElement('span');
    name.textContent=player.name;amount.textContent=cash(player.score);score.append(name,amount);$('wager-opponents').append(score);
  });
  $('true-daily-double').hidden=s.phase!=='wager';$('true-daily-double').disabled=game.player.ai||game.player.score<=0;
  $('true-daily-double').textContent=`TRUE DAILY DOUBLE${game.player.score>0?' / '+cash(game.player.score):''}`;
  resultAutoAllowed=outcome&&event!=='reveal';
  $('continue').hidden=!['result','rebound','round-end','final-pass','finished'].includes(s.phase);$('continue').textContent=s.phase==='finished'?'NEW GAME':s.phase==='round-end'?'NEXT ROUND':'CONTINUE';
  if(event==='start'||event==='round')cue('boardfill');if(event==='daily-double')cue('dailydouble');
  if(event==='correct')cue('Applause1');if(event==='incorrect')cue('SlightDisappointment1');if(event==='timeout')cue('timesup');if(event==='finish')cue('ApplauseCheer1');
  music(s.phase==='final-answer'?'ThinkMusic':s.phase==='finished'?'gameover':null);
  if(['reading','final-reading'].includes(s.phase)){
    seconds(clueReadingSeconds(s.active.clue.question),()=>game.openBuzzers());
  }
  if(s.phase==='buzz'){
    seconds(10,()=>game.timeout());
    for(let i=0;i<s.players.length;i++)if(s.players[i].ai&&!s.active.locked.includes(i))later(cpuBuzzDelayMs(s.difficulty),()=>game.buzz(i));
  }
  if(['answer','final-answer'].includes(s.phase)){
    seconds(s.phase==='final-answer'?30:10,()=>game.timeout());
    if(game.player.ai)later(cpuAnswerDelayMs(s.difficulty),()=>{
      const probability={easy:.45,medium:.7,hard:.88}[s.difficulty]??.7,correct=Math.random()<probability;
      const options=s.choices.map((choice,i)=>({choice,i})).filter(o=>(o.choice===game.clue.answer)===correct);
      const index=options[Math.floor(Math.random()*options.length)].i;
      for(let i=0;i<=index;i++)later(i*350,()=>highlightChoice(i));
      later(index*350+1000,()=>game.answer(index));
    });
  }
  if(wager&&game.player.ai)later(1000,()=>game.wager(Math.max(s.phase==='wager'?1:0,Math.floor(game.maxWager()*.5))));
  if(s.phase==='board'&&game.player.ai&&!studio.inputLocked)later(1500,()=>{
    const cells=s.board.flatMap((c,column)=>c.played.map((played,row)=>({column,row,played}))).filter(c=>!c.played),cell=cells[Math.floor(Math.random()*cells.length)];game.select(cell.column,cell.row);
  });
  if(outcome)scheduleResult();
  if(s.phase==='final-pass'&&game.player.ai)later(2200,()=>game.next());
  requestAnimationFrame(arrange);
}
function lobby(){cancel();studio.categoryIntro.stop();music(null);$('options').close();$('game-ui').hidden=true;$('lobby').hidden=false;studio.play('cam_animation_idle',null,true);try{$('resume').hidden=!localStorage.getItem(SAVE);}catch{$('resume').hidden=true;}}
function enter(){audio.activate();$('lobby').hidden=true;$('game-ui').hidden=false;}
function preset(){const types={solo:['local','cpu','cpu'],single:['local','off','off'],local:['local','local','local']}[$('mode').value];if(types)types.forEach((type,i)=>{$(`type-${i}`).value=type;});}
async function boot(){
  try{
    const [content,manifest]=await Promise.all(['content','manifest'].map(name=>fetch(`assets/${name}.json`).then(r=>{if(!r.ok)throw Error(`Missing ${name}`);return r.json();})));
    await Promise.all(['18px "Jeopardy UI"','24px "Jeopardy Category"','24px "Jeopardy Podium"','24px "Jeopardy Score"','24px "Jeopardy Clue"','24px "Jeopardy Name"'].map(font=>document.fonts.load(font)));
    studio=new JeopardyStudio($('scene'));audio=new RetailAudio(manifest.audio);game=new JeopardyGame(content,{onChange:render});
    try{autoResults=localStorage.getItem('jeopardy-auto-results')==='true';}catch{}
    $('auto-results').checked=autoResults;
    $('auto-results').onchange=()=>{autoResults=$('auto-results').checked;try{localStorage.setItem('jeopardy-auto-results',String(autoResults));}catch{}scheduleResult();};
    await studio.load(value=>{$('progress').value=value*100;});studio.onSelect=(c,r)=>{if(!game.player.ai){audio.activate();game.select(c,r);}};
    $('reflections').onchange=()=>studio.reflections.setEnabled($('reflections').checked);
    $('asset-count').textContent=`157 original meshes / ${manifest.cameras} recovered cameras / ${manifest.content.clues.toLocaleString()} retail clues`;
    $('loading').hidden=true;lobby();
    for(const camera of studio.data.cameras){const option=document.createElement('option');option.value=option.textContent=camera.name;$('camera-inspector').append(option);}
    $('camera-inspector').onchange=()=>{studio.auto=false;$('auto').setAttribute('aria-pressed','false');const name=$('camera-inspector').value;if(!studio.play(name))studio.cut(name);};
    $('mode').onchange=preset;for(let i=0;i<3;i++)$(`type-${i}`).onchange=()=>{$('mode').value='custom';};
    $('setup').onsubmit=event=>{event.preventDefault();audio.activate();$('setup-error').textContent='';const players=[];for(let i=0;i<3;i++){const type=$(`type-${i}`).value;if(type!=='off')players.push({slot:i,name:$(`name-${i}`).value,ai:type==='cpu'});}try{studio.auto=true;$('auto').setAttribute('aria-pressed','true');game.start(players,{difficulty:$('difficulty').value});enter();arrange();}catch(error){$('setup-error').textContent=error.message;}};
    $('resume').onclick=()=>{enter();if(!game.restore(localStorage.getItem(SAVE))){lobby();$('setup-error').textContent='The saved show could not be restored.';}};
    $('wager-form').onsubmit=event=>{event.preventDefault();if(!game.player.ai)game.wager(Number($('wager').value));};
    $('true-daily-double').onclick=()=>{audio.activate();if(!game.player.ai)game.trueDailyDouble();};
    $('skip-categories').onclick=()=>studio.categoryIntro.stop(true);
    $('continue').onclick=()=>game.state.phase==='finished'?lobby():['result','rebound'].includes(game.state.phase)?continueResult():game.next();
    $('auto').onclick=()=>{studio.auto=!studio.auto;$('auto').setAttribute('aria-pressed',String(studio.auto));if(studio.auto)studio.follow(game.state);};
    document.querySelectorAll('[data-view]').forEach(b=>b.onclick=()=>{studio.auto=false;$('auto').setAttribute('aria-pressed','false');studio.cut(b.dataset.view);});
    $('settings').onclick=$('clue-options').onclick=()=>$('options').showModal();$('reveal').onclick=()=>{game.reveal();$('options').close();};$('new-game').onclick=lobby;
    $('sound').onclick=()=>{audio.activate();audio.setMuted(!audio.muted);$('sound').textContent=audio.muted?'SOUND OFF':'SOUND ON';};
    $('music').onclick=()=>{audio.activate();audio.setMusicMuted(!audio.musicMuted);$('music').textContent=audio.musicMuted?'MUSIC OFF':'MUSIC ON';if(!audio.musicMuted&&musicId)audio.music(musicId).catch(console.warn);};
    document.addEventListener('keydown',event=>{
      if(event.repeat||paused()||/INPUT|SELECT|TEXTAREA/.test(event.target.tagName))return;
      const key=event.key.toUpperCase(),s=game.state;
      if(studio.inputLocked){if(key==='ENTER'){event.preventDefault();studio.categoryIntro.stop(true);}return;}
      if(s.phase==='board'&&!game.player.ai&&(/^ARROW(UP|DOWN|LEFT|RIGHT)$/.test(key)||key==='ENTER')){
        event.preventDefault();studio.cursor??={column:0,row:0};const c=studio.cursor;
        if(key==='ARROWLEFT')c.column=(c.column+5)%6;if(key==='ARROWRIGHT')c.column=(c.column+1)%6;
        if(key==='ARROWUP')c.row=(c.row+4)%5;if(key==='ARROWDOWN')c.row=(c.row+1)%5;
        if(key==='ENTER')studio.onSelect(c.column,c.row);else studio.update(s);
      }
      if(s.phase==='buzz'&&(key===' '||/^[123]$/.test(key))){event.preventDefault();audio.activate();const i=key===' '?s.players.findIndex((p,i)=>!p.ai&&!s.active.locked.includes(i)):Number(key)-1;if(!s.players[i]?.ai)game.buzz(i);}
      if(['answer','final-answer'].includes(s.phase)&&!game.player.ai&&/^[ABCD]$/.test(key)){audio.activate();game.answer('ABCD'.indexOf(key));}
    });
    new ResizeObserver(arrange).observe($('console'));
    window.jeopardy3d={game,studio,audio,get clock(){return clock;}};
    setInterval(()=>{
      const now=performance.now(),elapsed=Math.min(now-lastTime,250);lastTime=now;studio.paused=document.hidden||$('options').open;if(paused())return;
      const due=[];for(const task of scheduled){task.remaining-=elapsed;if(task.remaining<=0)due.push(task);}scheduled=scheduled.filter(task=>task.remaining>0);
      const generation=scheduleGeneration;
      for(const task of due){if(generation!==scheduleGeneration)break;task.callback();}
      if(clock){
        clock.remaining=Math.max(0,clock.remaining-elapsed/1000);$('clock').textContent=String(Math.ceil(clock.remaining));
        const answering=['answer','final-answer'].includes(game.state.phase),visible=answering||game.state.phase==='buzz';
        $('clock').hidden=!visible;$('response-timer').hidden=!visible;$('response-timer').dataset.answer=String(answering);
        const count=answering?timerLightCount(clock.remaining,clock.total):0;
        $('response-timer').querySelectorAll('[data-level]').forEach(light=>light.classList.toggle('lit',Number(light.dataset.level)<count));
        studio.update(game.state,clock.remaining,clock.total);if(clock.remaining===0){const callback=clock.callback;clock=null;callback();}
      }
      else{$('clock').hidden=true;$('response-timer').hidden=true;}
    },50);
    document.addEventListener('visibilitychange',()=>{if(audio.context){if(document.hidden)audio.context.suspend();else audio.context.resume().catch(()=>{});}});
  }catch(error){console.error(error);$('load-status').textContent=`Could not open the studio: ${error.message}. Reload to retry.`;}
}
boot();
