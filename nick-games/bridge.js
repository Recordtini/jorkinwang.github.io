'use strict';
// Devices, browser lifecycle, storage and fullscreen. Game logic is in Rust.
const touchInputs = new Set();
const pressed = new Set();
addEventListener("keydown", event => pressed.add(event.code));
addEventListener("keyup", event => pressed.delete(event.code));
let padPrevious = [];
const once = new Float32Array(9);
let cachedInputs = [0,0,0,0,0,0];
function pollController() {
 const pad = [...(navigator.getGamepads?.() || [])].find(p => p?.connected);
 const button = i => pad?.buttons[i]?.value || 0;
 const stick = pad?.axes[0] || 0;
 const steer = Math.abs(stick)<0.15 ? 0 : Math.sign(stick)*(Math.abs(stick)-0.15)/0.85;
 cachedInputs = [Math.max(-1,Math.min(1,steer + button(15)-button(14) + (touchInputs.has('right')?1:0)-(touchInputs.has('left')?1:0))),Math.max(button(7),button(12),touchInputs.has('up')?1:0),Math.max(button(6),button(13),button(1),touchInputs.has('down')?1:0),Math.max(button(2),button(5),touchInputs.has('action')?1:0),0,0];
 for (const [i,code] of [[9,4],[0,5],[12,6],[14,6],[13,7],[15,7],[3,8]]) {if(button(i)>.5 && !padPrevious[i] && (code<6 || code===8 || !['7','8','12'].includes(window.nickState?.screen))) once[code]=1;padPrevious[i]=button(i)>.5;}
 requestAnimationFrame(pollController);
}
requestAnimationFrame(pollController);
function browserKey(code) {
 canvas.dispatchEvent(new KeyboardEvent('keydown',{code,key:code==='Escape'?'Escape':code==='KeyP'?'p':'',bubbles:true}));
 setTimeout(()=>canvas.dispatchEvent(new KeyboardEvent('keyup',{code,key:code==='Escape'?'Escape':'p',bubbles:true})),60);
}
function goFullscreen(){if(document.fullscreenElement)document.exitFullscreen();else document.documentElement.requestFullscreen().catch(()=>{});}
document.querySelector('#fullscreen').addEventListener('click',goFullscreen);
document.querySelector('#pause').addEventListener('click',()=>{once[4]=1;});
for (const element of document.querySelectorAll('[data-control]')) {
 const key = element.dataset.control;
 element.addEventListener('pointerdown',event=>{event.preventDefault();touchInputs.add(key);element.setPointerCapture(event.pointerId);});
 for(const type of ['pointerup','pointercancel','lostpointercapture']) element.addEventListener(type,()=>touchInputs.delete(key));
}
addEventListener('blur',()=>{
 for(const code of pressed) canvas.dispatchEvent(new KeyboardEvent('keyup',{code,bubbles:true}));
 pressed.clear();touchInputs.clear();
 if(['7','8','12'].includes(window.nickState?.screen))once[4]=1;
});
document.addEventListener('visibilitychange',()=>{if(document.hidden&&window.nickState?.screen==='8')once[4]=1;});
miniquad_add_plugin({name:'nick_browser',version:1,register_plugin(imports){
 imports.env.nick_input=index=>{if(index>=4){const v=once[index];once[index]=0;return v;}return cachedInputs[index]||0;};
 imports.env.nick_storage_get=key=>{try{return Number(localStorage.getItem('nick-rust.'+key))||0;}catch{return 0;}};
 imports.env.nick_storage_set=(key,value)=>{try{localStorage.setItem('nick-rust.'+key,String(value));}catch{}};
 imports.env.nick_fullscreen=goFullscreen;
 imports.env.nick_exit_game=()=>{location.href="../";};
 imports.env.nick_selected_game=()=>document.body.dataset.game==='stupor-highway'?1:0;
 imports.env.nick_debug_state=(ptr,len)=>{try{window.nickState=JSON.parse(new TextDecoder().decode(new Uint8Array(wasm_memory.buffer,ptr,len)));document.querySelector('#telemetry').textContent=JSON.stringify(window.nickState);document.querySelector('#loading').hidden=true;}catch{}};
}});
addEventListener('error',event=>{document.querySelector('#loading').hidden=false;document.querySelector('#loading').textContent='The game could not start: '+event.message;});
load(document.body.dataset.engine || '../engine.wasm');
