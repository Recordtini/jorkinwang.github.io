// Safe Crackers: screen 053 assets and the retail three-position dial rules.
import { Audio } from './audio.js?v=2';
import { Reg, UI } from './ui.js';
import { Sprite } from './video.js';
import { Font } from './font.js?v=2';
import { retail } from './retail.js';
const ex = (await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {})).instance.exports;
const idx = await (await fetch('zip-index.json')).json();
const reg = await Reg.load(ex, idx), ui = await new UI(reg, 53).preload();
const cv = document.getElementById('c'), g = cv.getContext('2d');
const [prod] = (await retail()).take('SafeCrackers', 1);
const [grand] = (await retail()).take('Prize4', 0);
const productImage = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
const asset = name => reg.img(reg.scr[53].entries.find(e => e.name === name)?.id);
const [background, door, fan] = await Promise.all(['SafeCrackers1600x1200','DoorZoom','Fan1'].map(asset));
const [digits, title, green, red] = await Promise.all([3122,3139,3128,3129].map(id => Sprite.load(ex, `zip/053/${String(id).padStart(6,'0')}_0.GWVideo`)));
const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const au = new Audio(ex, idx); await au.addScreens([53,3]); const productSpeech = au.addProduct(prod);
let caption = '', ptr = {x:-1,y:-1}; au.onCaption = t => caption = t; au.onIdle = () => ex.tp_sc_act(10);
const button = ui.buttons('OpenBtn')[0];
for (const n of ui.all.values()) if (n.class !== 'container' && n !== button) ui.hide(n.inst);
ui.handlers.set(button.inst, () => ex.tp_sc_act(11));
const state = () => { const p = ex.tp_sc_state(); return new Float32Array(ex.memory.buffer.slice(p,p+20)); };
const pos = e => { const r = cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height}; };
cv.onpointermove = e => { ptr = pos(e); };
cv.onpointerdown = e => { au.unlock(); ptr = pos(e); if (state()[0] === 1) for (let i=0;i<3;i++) { const x=[160,280,399][i]; if (ptr.x>=x && ptr.x<x+99 && ptr.y>=290 && ptr.y<389) { ex.tp_sc_act(20+2*i); return; } } ui.down=ui.hit(ptr.x,ptr.y); };
cv.onpointerup = e => { ptr=pos(e); const b=ui.hit(ptr.x,ptr.y); if (b && b===ui.down) ui.handlers.get(b.inst)?.(); ui.down=null; };
addEventListener('keydown', () => au.unlock());
ex.tp_sc_new(Math.ceil(prod.price));
function pump() { const p=ex.tp_sc_events(); if (!p) return; const m=new Uint8Array(ex.memory.buffer); let o=p; for (;;) { let e=o; while(m[e]) e++; if(e===o) break; const name=new TextDecoder().decode(m.slice(o,e)); au.say(name); if(name==='Speech_SafeCrackers_GameIntro_A') au.say(productSpeech); o=e+1; } }
function frame() {
  requestAnimationFrame(frame); pump(); const [ph,invalid,...values]=state();
  g.clearRect(0,0,800,600); if(background) g.drawImage(background,0,0,800,600);
  if(ph===0) { const scale=Math.min(260/productImage.width,180/productImage.height); g.drawImage(productImage,400-productImage.width*scale/2,160,productImage.width*scale,productImage.height*scale); }
  else {
    if(door) g.drawImage(door,0,0,763,708);
    const choices=String(Math.ceil(prod.price)).split('').map(Number).sort((a,b)=>a-b);
    for(let i=0;i<3;i++) { const x=[160,280,399][i]; if(fan) g.drawImage(fan,x,290,99,99);
      const selected=choices.indexOf(values[i]);
      for(let k=0;k<3;k++) { g.save(); g.translate(x+49.5,339.5); g.rotate((k-selected)*Math.PI*2/3); digits.frame(g,choices[k],-10,-37,20,24); g.restore(); }
    }
    title.frame(g,0,129,133,565,93);
    if(ph===2) green.frame(g,green.imgs.length-1,576,239,101,64);
    if(ph===3) red.frame(g,red.imgs.length-1,589,313,75,43);
  }
  if(ph===1) ui.show(button.inst); else ui.hide(button.inst); ui.draw(g,ptr.x,ptr.y,'btn');
  if(invalid) font.draw(g,reg.scr[53].entries.find(e=>e.name==='InvalidPrice').text,20,510,'#fff');
  if (caption) font.caption(g, caption);
  window.__sc={ph,invalid,d:values,real:String(Math.ceil(prod.price)).split('').map(Number),idle:!au.speaking&&!au.speechQ.length,winnings:ph===2?Math.ceil(prod.price)+Math.ceil(grand.price):0};
}
requestAnimationFrame(frame); window.__ready=true;
