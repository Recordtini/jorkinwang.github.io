import {createRenderer} from './renderer.js';
const $=s=>document.querySelector(s);
// IDs follow the Classic handler at 004017c0, not the internal category-array order.
const rows=[[1,'Ones',1005,1021],[2,'Twos',1006,1022],[3,'Threes',1015,1023],[4,'Fours',1016,1024],[5,'Fives',1007,1025],[6,'Sixes',1038,1042],[16,'Three of a kind',1008,1107],[17,'Four of a kind',1009,1044],[18,'Full house',1010,1045],[19,'Small straight',1011,1046],[20,'Large straight',1013,1047],[21,'Yahtzee',1018,1048],[22,'Chance',1019,1049]];
let x,renderer,ui,ready=false,playing=false,lastTime=0,accumulator=0,boardIndex=-1,playerName='',lastPointerTime=0;
let mode='classic';
const cells=new Map(),categoryButtons=new Map(),outputs={};let boards=[];
const music=new Audio('assets/clasloop.wav');music.loop=true;music.preload='none';
const clickSound=new Audio('assets/cls_clk.wav');clickSound.preload='none';
const titleSound=new Audio('assets/title.wav');titleSound.preload='none';
const dieChannels=Array(5).fill(null);
const transientSounds=Array(10).fill(null);
let cupShake=null;
const sounds={classic:{floor:'cls_f',wall:'cls_w',die:'cls_w'},triple:{floor:'trp_f',wall:'trp_w',die:'trp_die'}};
// Original defaults are read with GetPrivateProfileIntA at 00418230.
let settings={advice:true,sound:true,hints:true,music:'none'};
try{const saved=JSON.parse(localStorage.getItem('ultimate-yahtzee-settings')||'null');if(saved&&typeof saved==='object'){for(const key of ['advice','sound','hints'])if(typeof saved[key]==='boolean')settings[key]=saved[key];if(['none','loop'].includes(saved.music))settings.music=saved.music;}}catch{}
const strip=s=>s.replaceAll('&','');
function error(e){$('#error').textContent=e.message||String(e);console.error(e);}
function playTransient(source,volume=127){if(!settings.sound)return;const slot=transientSounds.findIndex(a=>!a||a.paused||a.ended);if(slot<0)return;const audio=new Audio(source);audio.volume=Math.min(1,volume/127);transientSounds[slot]=audio;audio.play().catch(()=>{});}
function soundClick(){playTransient(clickSound.src,80);}
function collisionSounds(){let event;while((event=x.game_sound())!==0){
  if(!settings.sound)continue;
  const type=event&255,die=(event>>>8)&255,volume=(event>>>16)&255;
  const previous=dieChannels[die];if(type===3&&previous&&!previous.paused&&!previous.ended)continue;
  if(type===2&&previous&&!previous.paused)previous.pause();
  const source=`assets/${sounds[mode][type===1?'floor':type===2?'wall':'die']}.wav`;
  if(type===1){playTransient(source,volume);continue;}
  const audio=new Audio(source);audio.volume=Math.min(1,volume/127);dieChannels[die]=audio;audio.play().catch(()=>{});
}}
function setMusic(){if(settings.music==='loop'&&playing)music.play().catch(error);else music.pause();}
function closeMenu(){$('#popup').hidden=true;}
function closeDialog(){$('#dialog-layer').hidden=true;$('#dialog-layer').replaceChildren();}
function rect(element,r,width=427,height=295){const[a,b,c,d]=r;element.style.left=`${a/width*100}%`;element.style.top=`${b/height*100}%`;element.style.width=`${c/width*100}%`;element.style.height=`${d/height*100}%`;}
function control(id){return ui.dialogs[mode==='triple'?139:308].controls.find(c=>c.id===id);}
function title(command=0){if(!x.title_open(command))throw Error('Original title decoding failed');const bytes=new Uint8ClampedArray(x.memory.buffer,x.frame_ptr(),x.frame_len());$('#title-art').getContext('2d').putImageData(new ImageData(bytes,640,480),0,0);}
function showTitle(){playing=false;closeMenu();closeDialog();$('#title-screen').hidden=false;title();setMusic();if(settings.sound){titleSound.currentTime=0;titleSound.play().catch(()=>{});}$('#status').textContent='Ultimate Yahtzee — select a game';}
async function start(){try{ready=false;titleSound.pause();const seed=crypto.getRandomValues(new Uint32Array(1))[0];if(mode==='triple')x.game_new_triple(seed);else x.game_new(seed);renderer=await createRenderer($('#dice3d'),x,mode);boards=await Promise.all(Array.from({length:4},async(_,i)=>{const image=new Image();image.src=`assets/${mode==='triple'?'triple-board':'board'}${i}.png`;await image.decode();return image;}));music.src=`assets/${mode==='triple'?'triploop':'clasloop'}.wav`;clickSound.src=`assets/${mode==='triple'?'trp_clk':'cls_clk'}.wav`;setupBoard();ready=true;playing=true;lastTime=0;accumulator=0;boardIndex=-1;closeMenu();closeDialog();$('#title-screen').hidden=true;refresh();draw();setMusic();}catch(e){error(e);}}
function draw(){renderer.draw();const b=renderer.boxes.find(b=>b.i===5);if(b){const e=$('#board-roll');e.style.left=`${b.minX/6.4}%`;e.style.top=`${b.minY/4.8}%`;e.style.width=`${(b.maxX-b.minX)/6.4}%`;e.style.height=`${(b.maxY-b.minY)/4.8}%`;}}
function roll(){if(!ready||!playing||!$('#dialog-layer').hidden)return;
  if(!x.game_cup(12)){if(x.game_pickup()){closeMenu();lastPointerTime=0;refresh();draw();$('#dice3d').requestPointerLock?.()?.catch(()=>{});}return}
  if(x.game_roll()){cupShake?.pause();document.exitPointerLock?.();closeMenu();accumulator=0;lastTime=0;refresh();draw();}}
function hold(i){if(x.game_hold(i)){soundClick();refresh();draw();}}
function score(category,column=1,playClick=true){if(x.game_commit_column(category,column)){if(playClick)playTransient(clickSound.src);closeMenu();refresh();draw();}}
function addOutput(name,id){const o=document.createElement('output');o.id=name;o.setAttribute('aria-label',name.replaceAll('-',' '));rect(o,control(id).rect_dlu);$('#cells').append(o);outputs[name]=o;}
function setupBoard(){
  $('#cells').replaceChildren();document.querySelectorAll('.category-hit,#player-total').forEach(e=>e.remove());cells.clear();categoryButtons.clear();
  for(const[id,asset] of [['top',mode==='triple'?'trptop':'clstop'],['bottom',mode==='triple'?'trpbtm':'clsbtm'],['score-art',mode==='triple'?'trpright':'clsright']])$('#'+id).src=`assets/${asset}.png`;
  const isTriple=mode==='triple',cols=isTriple?3:1;
  if(isTriple){rect($('#top'),control(1098).rect_dlu,428,295);rect($('#bottom'),control(65535).rect_dlu,428,295);rect($('#score-art'),control(1225).rect_dlu,428,295);}else{$('#top').style.cssText='';$('#bottom').style.cssText='';$('#score-art').style.cssText='';}
  const tripleIds=[[1021,1026,1061],[1022,1033,1062],[1023,1035,1063],[1024,1037,1064],[1025,1039,1065],[1042,1050,1066],[1107,1051,1069],[1044,1054,1070],[1045,1055,1071],[1046,1056,1072],[1047,1057,1073],[1048,1058,1074],[1049,1059,1075]];
  for(const [ri,[category,name,buttonId,cellId]]of rows.entries()){
    for(let column=1;column<=cols;column++){const id=isTriple?tripleIds[ri][column-1]:cellId;const b=document.createElement('button');b.dataset.category=category;b.dataset.control=id;rect(b,control(id).rect_dlu,isTriple?428:427);b.setAttribute('aria-label',`${name}${isTriple?`, column ${column}`:''}`);b.disabled=true;b.onclick=()=>score(category,column);$('#cells').append(b);cells.set(`${category}:${column}`,b);}
    const label=document.createElement('button');label.className='category-hit';label.dataset.control=buttonId;rect(label,control(buttonId).rect_dlu,isTriple?428:427);label.setAttribute('aria-label',`Select ${name}`);label.onclick=()=>{if(!isTriple)score(category);else{playTransient(clickSound.src);dialog(307,id=>{const column=({1083:1,1084:2,1103:3})[id];if(column){closeDialog();score(category,column,false);}});}};$('#game').append(label);categoryButtons.set(category,label);
  }
  for(const[name,id]of [['upper-bonus',1028],['upper-total',1029],['lower-total',1031],['grand-total',1030]])addOutput(name,id);
  if(isTriple)for(const[name,id]of [['upper-bonus-2',1040],['upper-total-2',1041],['lower-total-2',1060],['upper-bonus-3',1067],['upper-total-3',1068],['lower-total-3',1076]])addOutput(name,id);
  rect($('#player'),control(1077).rect_dlu);
  const total=document.createElement('span');total.id='player-total';total.className='player-total';$('#game').append(total);
}
function refresh(){
  if(!ready||!playing)return;
  const rolls=x.game_state(0),turns=x.game_state(1),moving=!!x.game_state(2),cols=mode==='triple'?3:1,over=turns===13*cols;
  const allHeld=Array.from({length:5},(_,i)=>x.game_die(i,13)).every(Boolean);
  $('#board-roll').disabled=moving||over||rolls===3||(rolls>0&&allHeld);
  $('#game').classList.toggle('dice-motion',moving||!!x.game_cup(12));
  const index=moving||over?3:rolls;if(index!==boardIndex){$('#background').getContext('2d').drawImage(boards[index],0,0);boardIndex=index;}
  let upper=0,lower=0;
  for(const[category,name]of rows)for(let column=1;column<=cols;column++){const b=cells.get(`${category}:${column}`),value=x.game_cell_column(category,column),preview=x.game_preview_column(category,column);
    b.disabled=preview<0;categoryButtons.get(category).disabled=Array.from({length:cols},(_,i)=>x.game_preview_column(category,i+1)).every(v=>v<0);b.className=value>=0?'scored':preview>=0?'available':'';
    // 00414890: nonzero possible scores are gray when scoring hints are enabled.
    b.textContent=value>=0?value:settings.hints&&preview>0?preview:'';
    b.setAttribute('aria-label',`${name}${cols>1?`, column ${column}`:''}${value>=0?`, scored ${value}`:preview>=0?`, score ${preview}`:''}`);
    if(column===1){if(category<=6)upper+=Math.max(0,value);else lower+=Math.max(0,value);}
  }
  const bonus=Math.max(0,x.game_cell(7));outputs['upper-bonus'].textContent=bonus||'';outputs['upper-total'].textContent=upper+bonus;outputs['lower-total'].textContent=lower;outputs['grand-total'].textContent=x.game_state(3);
  for(let col=2;col<=cols;col++){const bonus=Math.max(0,x.game_cell_column(7,col));const upper=rows.filter(r=>r[0]<=6).reduce((s,r)=>s+Math.max(0,x.game_cell_column(r[0],col)),0);const lower=rows.filter(r=>r[0]>6).reduce((s,r)=>s+Math.max(0,x.game_cell_column(r[0],col)),0);outputs[`upper-bonus-${col}`].textContent=bonus||'';outputs[`upper-total-${col}`].textContent=upper+bonus;outputs[`lower-total-${col}`].textContent=lower;}
  $('#player').textContent=playerName;$('#player-total').textContent=`${playerName} ${x.game_state(3)}`;
  $('#status').textContent=over?`Game over. ${x.game_state(3)} points.`:moving?'Rolling dice':`Turn ${turns+1}, ${rolls} rolls used. Dice: ${Array.from({length:5},(_,i)=>`${x.game_die(i,12)}${x.game_die(i,13)?' held':''}`).join(', ')}`;
  $('#dice3d').setAttribute('aria-label',$('#status').textContent);
}
// Build Win32 dialog content directly from the original templates. Browser frame
// rendering/font rasterization remains a parity gate; labels/layout aren't invented.
function dialog(id,onAction){
  closeMenu();closeDialog();const resource=ui.dialogs[id],layer=$('#dialog-layer');layer.hidden=false;
  const frame=document.createElement('section');frame.className='win-dialog';frame.setAttribute('role','dialog');frame.setAttribute('aria-modal','true');frame.setAttribute('aria-label',resource.title||'Yahtzee');
  const scale=1.5;frame.style.width=`${resource.rect_dlu[2]*scale+12}px`;
  if(resource.title){const bar=document.createElement('div');bar.className='win-title';bar.textContent=resource.title;frame.append(bar);}
  const client=document.createElement('div');client.className='win-client';client.style.aspectRatio=`${resource.rect_dlu[2]}/${resource.rect_dlu[3]*1.083333333333}`;frame.append(client);layer.append(frame);
  const controls=new Map();
  for(const c of resource.controls){const kind=c.class.ordinal,sub=c.style&15;let e;
    if(kind===128&&sub===7){e=document.createElement('fieldset');e.className='group';if(c.title){const l=document.createElement('legend');l.textContent=strip(c.title);e.append(l);}}
    else if(kind===128&&(sub===3||sub===9)){e=document.createElement('label');const input=document.createElement('input');input.type=sub===3?'checkbox':'radio';input.name=sub===9?'music':String(c.id);input.dataset.id=c.id;e.append(input,document.createTextNode(strip(c.title)));}
    else if(kind===128&&c.title==='YAHTZEEBOX'){e=document.createElement('img');e.src='assets/resource381.png';e.alt='Ultimate Yahtzee';}
    else if(kind===128){e=document.createElement('button');e.textContent=strip(c.title);e.onclick=()=>onAction(c.id,controls);}
    else if(kind===133){e=document.createElement('div');e.className='combo';const input=document.createElement('input');input.type='text';input.setAttribute('aria-label',`Player ${[1207,1208,1209,1211].indexOf(c.id)+1}`);e.append(input);const arrow=document.createElement('button');arrow.className='combo-arrow';arrow.setAttribute('aria-label','Player choices');arrow.textContent='▾';arrow.disabled=true;e.append(arrow);}
    else if(typeof c.title==='object'){e=document.createElement('img');e.src=`assets/resource${c.title.ordinal}.png`;e.alt='';}
    else{e=document.createElement('span');e.textContent=c.title;}
    rect(e,c.rect_dlu,resource.rect_dlu[2],resource.rect_dlu[3]);if(kind===133)e.style.height=`${12/resource.rect_dlu[3]*100}%`;e.dataset.control=c.id;client.append(e);controls.set(c.id,e);
  }
  return controls;
}
function choosePlayers(){
  const controls=dialog(376,(id,c)=>{if(id===2){closeDialog();return}if(id===1){playerName=c.get(1207).querySelector('input').value.trim();if(playerName)start();}});
  controls.get(1207).querySelector('input').value=playerName||ui.strings[1575];
  // AI and additional players have not been recovered for this first Classic slice.
  for(const id of [1208,1209,1211]){const input=controls.get(id).querySelector('input');input.value=ui.strings[1576];input.disabled=true;}
  controls.get(1207).querySelector('input').focus();
}
function gameSettings(){
  const c=dialog(366,(id,c)=>{if(id===2){closeDialog();return}if(id===1){settings={advice:c.get(1100).querySelector('input').checked,sound:c.get(1121).querySelector('input').checked,hints:c.get(1122).querySelector('input').checked,music:c.get(1217).querySelector('input').checked?'loop':'none'};try{localStorage.setItem('ultimate-yahtzee-settings',JSON.stringify(settings));}catch{}closeDialog();setMusic();refresh();}});
  for(const[id,key]of [[1100,'advice'],[1121,'sound'],[1122,'hints']])c.get(id).querySelector('input').checked=settings[key];
  c.get(1219).querySelector('input').checked=settings.music==='none';c.get(1217).querySelector('input').checked=settings.music==='loop';c.get(1218).querySelector('input').disabled=true;
}
const implemented=new Set([57600,32804,57665,32797,16]);
function menu(id,anchor){
  if(!ready||x.game_state(2)||!$('#dialog-layer').hidden)return;
  const p=$('#popup');if(!p.hidden&&p.dataset.menu===String(id)){closeMenu();return}p.dataset.menu=id;p.replaceChildren();p.hidden=false;p.style.left=anchor.style.left||getComputedStyle(anchor).left;
  for(const item of ui.menus[id].items){if(!item.command){p.append(document.createElement('hr'));continue}
    const b=document.createElement('button');b.setAttribute('role','menuitem');b.dataset.command=item.command;b.textContent=strip(item.text);b.disabled=!implemented.has(item.command);
    b.onclick=()=>{closeMenu();switch(item.command){case 57600:showTitle();break;case 32804:start();break;case 57665:if(confirm(ui.strings[1554]))location.href='../';break;case 32797:gameSettings();break;case 16:dialog(100,id=>{if(id===1)closeDialog();});break;}};p.append(b);
  }
}
$('#board-roll').onclick=roll;
for(const[id,n]of [[158,'file'],[159,'options'],[160,'help']])$('#'+n).onclick=()=>menu(id,$('#'+n));
$('#dice3d').onclick=event=>{if(!ready||!playing||!$('#dialog-layer').hidden)return;const r=event.currentTarget.getBoundingClientRect(),px=(event.clientX-r.left)*640/r.width,py=(event.clientY-r.top)*480/r.height;closeMenu();if(x.game_cup(12)){roll();return}const i=renderer.pick(px,py);if(i===5)roll();else if(i!==undefined)hold(i);};
$('#game').addEventListener('pointermove',event=>{
  if(!ready||!playing||!x.game_cup(12)||!$('#dialog-layer').hidden)return;
  const scale=640/$('#game').getBoundingClientRect().width;
  const millis=lastPointerTime?Math.max(1,Math.round(event.timeStamp-lastPointerTime)):16;lastPointerTime=event.timeStamp;
  const previous=x.game_cup(13),dx=event.movementX*scale,thrown=x.game_pointer(dx,event.movementY*scale,millis);
  if(thrown){cupShake?.pause();document.exitPointerLock?.();accumulator=0;lastTime=0;refresh();}
  else if(settings.sound&&(previous===0||previous*(-dx)<0)){const unheld=Array.from({length:5},(_,i)=>!x.game_die(i,13)).filter(Boolean).length;cupShake?.pause();cupShake=new Audio(`assets/bat_c${unheld===1?1:2}.wav`);cupShake.play().catch(()=>{});}
  draw();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();closeDialog();}});
function frame(time){try{if(ready&&playing&&(x.game_state(2)||x.game_cup(12))&&$('#dialog-layer').hidden){accumulator+=lastTime?Math.min(100,time-lastTime):6;while(accumulator>=6&&(x.game_state(2)||x.game_cup(12))){const wasMoving=!!x.game_state(2);x.game_step();collisionSounds();if(wasMoving&&!x.game_state(2)){const face=x.game_die(0,12);if(Array.from({length:5},(_,i)=>x.game_die(i,12)).every(f=>f===face))playTransient('assets/yahtzee.wav');}accumulator-=6;}draw();if(!x.game_state(2))refresh();}lastTime=time;requestAnimationFrame(frame);}catch(e){ready=false;error(e);}}
try{
  const response=await fetch('retail_yahtzee.wasm',{cache:'no-cache'});if(!response.ok)throw Error(`WASM HTTP ${response.status}`);({instance:{exports:x}}=await WebAssembly.instantiate(await response.arrayBuffer()));
  const r=await fetch('assets/ui.json');if(!r.ok)throw Error('Original UI resources did not load');ui=await r.json();
  boards=await Promise.all(Array.from({length:4},async(_,i)=>{const image=new Image();image.src=`assets/board${i}.png`;await image.decode();return image;}));renderer=await createRenderer($('#dice3d'),x);setupBoard();
  for(const c of ui.dialogs[364].controls){const b=document.createElement('button');b.dataset.command=c.id;rect(b,c.rect_dlu);b.setAttribute('aria-label',c.id===1052?'Classic Yahtzee':c.id===1227?'Quit':ui.strings[c.id]||strip(c.title));
    if(c.id===1227){const img=document.createElement('img');img.src='assets/resource1227.png';img.alt='Quit';b.append(img);b.onclick=()=>location.href='../';}
    else{b.disabled=c.id!==1052&&c.id!==1106;b.onpointerenter=()=>title(c.id);b.onpointerleave=()=>title();b.onfocus=()=>title(c.id);b.onblur=()=>title();b.onclick=()=>{mode=c.id===1106?'triple':'classic';choosePlayers();};}
    $('#title-buttons').append(b);
  }
  ready=true;showTitle();
  new ResizeObserver(()=>{if(ready&&playing)draw();}).observe($('#dice3d'));
  window.addEventListener('resize',()=>{if(ready&&playing)draw();});
  requestAnimationFrame(frame);
}catch(e){$('#status').textContent='Game could not load';error(e);}
