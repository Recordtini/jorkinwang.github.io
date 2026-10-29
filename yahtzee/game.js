import {createRenderer} from './renderer.js';
const $=s=>document.querySelector(s);
// IDs follow the Classic handler at 004017c0, not the internal category-array order.
const rows=[[1,'Ones',1005,1021],[2,'Twos',1006,1022],[3,'Threes',1015,1023],[4,'Fours',1016,1024],[5,'Fives',1007,1025],[6,'Sixes',1038,1042],[16,'Three of a kind',1008,1107],[17,'Four of a kind',1009,1044],[18,'Full house',1010,1045],[19,'Small straight',1011,1046],[20,'Large straight',1013,1047],[21,'Yahtzee',1018,1048],[22,'Chance',1019,1049]];
let x,renderer,ui,ready=false,playing=false,lastTime=0,accumulator=0,boardIndex=-1,playerName='',lastPointerTime=0;
const cells=new Map(),categoryButtons=new Map(),outputs={};let boards=[];
const music=new Audio('assets/clasloop.wav');music.loop=true;music.preload='none';
const clickSound=new Audio('assets/cls_clk.wav');clickSound.preload='none';
// Original defaults are read with GetPrivateProfileIntA at 00418230.
let settings={advice:true,sound:true,hints:true,music:'none'};
const strip=s=>s.replaceAll('&','');
function error(e){$('#error').textContent=e.message||String(e);console.error(e);}
function soundClick(){if(settings.sound){clickSound.currentTime=0;clickSound.play().catch(error);}}
function setMusic(){if(settings.music==='loop'&&playing)music.play().catch(error);else music.pause();}
function closeMenu(){$('#popup').hidden=true;}
function closeDialog(){$('#dialog-layer').hidden=true;$('#dialog-layer').replaceChildren();}
function rect(element,r,width=427,height=295){const[a,b,c,d]=r;element.style.left=`${a/width*100}%`;element.style.top=`${b/height*100}%`;element.style.width=`${c/width*100}%`;element.style.height=`${d/height*100}%`;}
function control(id){return ui.dialogs[308].controls.find(c=>c.id===id);}
function title(command=0){if(!x.title_open(command))throw Error('Original title decoding failed');const bytes=new Uint8ClampedArray(x.memory.buffer,x.frame_ptr(),x.frame_len());$('#title-art').getContext('2d').putImageData(new ImageData(bytes,640,480),0,0);}
function showTitle(){playing=false;closeMenu();closeDialog();$('#title-screen').hidden=false;title();setMusic();$('#status').textContent='Ultimate Yahtzee — select a game';}
function start(){x.game_new(crypto.getRandomValues(new Uint32Array(1))[0]);playing=true;lastTime=0;accumulator=0;boardIndex=-1;closeMenu();closeDialog();$('#title-screen').hidden=true;refresh();draw();setMusic();}
function draw(){renderer.draw();const b=renderer.boxes.find(b=>b.i===5);if(b){const e=$('#board-roll');e.style.left=`${b.minX/6.4}%`;e.style.top=`${b.minY/4.8}%`;e.style.width=`${(b.maxX-b.minX)/6.4}%`;e.style.height=`${(b.maxY-b.minY)/4.8}%`;}}
function roll(){if(!ready||!playing||!$('#dialog-layer').hidden)return;
  if(!x.game_cup(12)){if(x.game_pickup()){closeMenu();lastPointerTime=0;refresh();draw();$('#dice3d').requestPointerLock?.()?.catch(()=>{});}return}
  if(x.game_roll()){document.exitPointerLock?.();closeMenu();accumulator=0;lastTime=0;refresh();draw();}}
function hold(i){if(x.game_hold(i)){soundClick();refresh();draw();}}
function score(category){if(x.game_commit(category)){closeMenu();refresh();draw();}}
function addOutput(name,id){const o=document.createElement('output');o.id=name;o.setAttribute('aria-label',name.replaceAll('-',' '));rect(o,control(id).rect_dlu);$('#cells').append(o);outputs[name]=o;}
function setupBoard(){
  for(const[category,name,buttonId,cellId]of rows){
    const b=document.createElement('button');b.dataset.category=category;b.dataset.control=cellId;rect(b,control(cellId).rect_dlu);b.setAttribute('aria-label',name);b.disabled=true;b.onclick=()=>score(category);$('#cells').append(b);cells.set(category,b);
    const label=document.createElement('button');label.className='category-hit';label.dataset.control=buttonId;rect(label,control(buttonId).rect_dlu);label.setAttribute('aria-label',`Select ${name}`);label.onclick=()=>score(category);$('#game').append(label);categoryButtons.set(category,label);
  }
  for(const[name,id]of [['upper-bonus',1028],['upper-total',1029],['lower-total',1031],['grand-total',1030]])addOutput(name,id);
  rect($('#player'),control(1077).rect_dlu);
  const total=document.createElement('span');total.id='player-total';total.className='player-total';$('#game').append(total);
}
function refresh(){
  if(!ready||!playing)return;
  const rolls=x.game_state(0),turns=x.game_state(1),moving=!!x.game_state(2),over=turns===13;
  const allHeld=Array.from({length:5},(_,i)=>x.game_die(i,13)).every(Boolean);
  $('#board-roll').disabled=moving||over||rolls===3||(rolls>0&&allHeld);
  $('#game').classList.toggle('dice-motion',moving||!!x.game_cup(12));
  const index=moving||over?3:rolls;if(index!==boardIndex){$('#background').getContext('2d').drawImage(boards[index],0,0);boardIndex=index;}
  let upper=0,lower=0;
  for(const[category,name]of rows){const b=cells.get(category),value=x.game_cell(category),preview=x.game_preview(category);
    b.disabled=preview<0;categoryButtons.get(category).disabled=preview<0;b.className=value>=0?'scored':preview>=0?'available':'';
    // 00414890: nonzero possible scores are gray when scoring hints are enabled.
    b.textContent=value>=0?value:settings.hints&&preview>0?preview:'';
    b.setAttribute('aria-label',`${name}${value>=0?`, scored ${value}`:preview>=0?`, score ${preview}`:''}`);
    if(category<=6)upper+=Math.max(0,value);else lower+=Math.max(0,value);
  }
  const bonus=Math.max(0,x.game_cell(7));outputs['upper-bonus'].textContent=bonus||'';outputs['upper-total'].textContent=upper+bonus;outputs['lower-total'].textContent=lower;outputs['grand-total'].textContent=x.game_state(3);
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
  const c=dialog(366,(id,c)=>{if(id===2){closeDialog();return}if(id===1){settings={advice:c.get(1100).querySelector('input').checked,sound:c.get(1121).querySelector('input').checked,hints:c.get(1122).querySelector('input').checked,music:c.get(1217).querySelector('input').checked?'loop':'none'};closeDialog();setMusic();refresh();}});
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
  if(x.game_pointer(event.movementX*scale,event.movementY*scale,millis)){document.exitPointerLock?.();accumulator=0;lastTime=0;refresh();}draw();
});
document.addEventListener('keydown',event=>{if(event.key==='Escape'){closeMenu();closeDialog();}});
function frame(time){try{if(ready&&playing&&(x.game_state(2)||x.game_cup(12))&&$('#dialog-layer').hidden){accumulator+=lastTime?Math.min(100,time-lastTime):6;while(accumulator>=6&&(x.game_state(2)||x.game_cup(12))){x.game_step();accumulator-=6;}draw();if(!x.game_state(2))refresh();}lastTime=time;requestAnimationFrame(frame);}catch(e){ready=false;error(e);}}
try{
  const response=await fetch('retail_yahtzee.wasm',{cache:'no-cache'});if(!response.ok)throw Error(`WASM HTTP ${response.status}`);({instance:{exports:x}}=await WebAssembly.instantiate(await response.arrayBuffer()));
  const r=await fetch('assets/ui.json');if(!r.ok)throw Error('Original UI resources did not load');ui=await r.json();
  boards=await Promise.all(Array.from({length:4},async(_,i)=>{const image=new Image();image.src=`assets/board${i}.png`;await image.decode();return image;}));renderer=await createRenderer($('#dice3d'),x);setupBoard();
  for(const c of ui.dialogs[364].controls){const b=document.createElement('button');b.dataset.command=c.id;rect(b,c.rect_dlu);b.setAttribute('aria-label',c.id===1052?'Classic Yahtzee':c.id===1227?'Quit':ui.strings[c.id]||strip(c.title));
    if(c.id===1227){const img=document.createElement('img');img.src='assets/resource1227.png';img.alt='Quit';b.append(img);b.onclick=()=>location.href='../';}
    else{b.disabled=c.id!==1052;b.onpointerenter=()=>title(c.id);b.onpointerleave=()=>title();b.onfocus=()=>title(c.id);b.onblur=()=>title();b.onclick=choosePlayers;}
    $('#title-buttons').append(b);
  }
  ready=true;showTitle();requestAnimationFrame(frame);
}catch(e){$('#status').textContent='Game could not load';error(e);}
