// Grocery Game: retail screen 039 controls; podium placement is provisional.
import { Audio } from './audio.js?v=3';
import { Font } from './font.js?v=3';
import { retail } from './retail.js';
import { Reg, UI } from './ui.js';

const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {});
const ex = wasm.instance.exports, mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json();
const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = b => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const reg = await Reg.load(ex, idx), ui = await new UI(reg, 39).preload();
const digits = ['93d1031c','e4d6338a','7ddf6230','0ad852a6','94bcc705','e3bbf793','7ab2a629','0db596bf','9d0a8b2e'];
const left = '3cc0971d', right = 'e104498b', select = 'e991e0c8';
// The shared renderer does not yet apply the retail container transforms. Draw
// only the recovered controls through it, and place the remaining art separately.
for (const n of ui.all.values()) if (n.class === 'container') ui.show(n.inst); else ui.hide(n.inst);
digits.forEach((id, i) => ui.setText(id, String(i + 1)));
const bg = await reg.img(0x0b63);
const arrowLeft = await reg.img(0x0de6), arrowRight = await reg.img(0x0de7);
const podiumId = reg.by && Object.values(reg.by).find(e => e.name === 'GroceryGame_Podium')?.id;
const podium = await reg.img(podiumId);
const greenOff = await reg.img(0x7d5), redOff = await reg.img(0x7d8);
const greenOn = await reg.img(0x7d6), redOn = await reg.img(0x7d9);
const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const items = (await retail()).take('GroceryGame', 1);
const pimg = await Promise.all(items.map(async p => createImageBitmap(await (await fetch(`grocery/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
const prices = new Float32Array(items.map(p => p.price));
ex.tp_gr_new(put(new Uint8Array(prices.buffer)), items.length);
const au = new Audio(ex, idx); await au.addScreens([39, 3]);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock());
const productSpeech = items.map(item => au.addProduct(item));
au.onIdle = () => { const s = state(); if (s[0] === 0) current = 0; if (settling) { settling = false; if (s[0] === 1) current = items.findIndex((_, i) => !s[3+i]); } ex.tp_gr_act(10); };
au.onSpeechStart = name => { const i = productSpeech.indexOf(name); if (i >= 0) { current = i; presentingItems = true; } };
let caption = '', captionStart = 0, captionDuration = 0, current = 0, presentingItems = false, settling = false, choosingQuantity = false, lastAmount = 0, lastTotal = 0, ptr = {x:-1,y:-1};
au.onCaption = (t, timing) => { caption = t.replace('{value}', '$' + (/grand total/i.test(t) ? lastTotal : lastAmount).toFixed(2)); captionStart = performance.now(); captionDuration = timing?.duration || 0; };
const state = () => { const p = ex.tp_gr_state(); return new Float32Array(mem().slice(p, p + 40)); };
// 0x4c97a0 / 0x4c9960 skip purchased items and stop at either end.
function adjacent(s, step) { let i = current + step; while (i >= 0 && i < items.length && s[3+i]) i += step; return i >= 0 && i < items.length ? i : -1; }
function point(e) { const r = cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height}; }
cv.onpointermove = e => { ptr = point(e); };
cv.onpointerdown = e => { ptr = point(e); ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = e => {
  ptr = point(e); const button = ui.hit(ptr.x, ptr.y), pressed = ui.down; ui.down = null;
  if (!button || button !== pressed) return;
  const s = state(); if (s[0] !== 1 || au.speaking || au.speechQ.length) return;
  if (choosingQuantity) {
    const q = digits.indexOf(button.inst) + 1;
    if (!q) return;
    lastAmount = items[current].price * q; lastTotal = (s[1] / 100) + lastAmount;
    settling = true; ex.tp_gr_act(((current + 1) << 4) | q); choosingQuantity = false;
  } else if (button.inst === select) {
    choosingQuantity = true;
    au.say('Speech_GroceryGame_HowMany_A');
  } else if (button.inst === left || button.inst === right) {
    const next = adjacent(s, button.inst === left ? -1 : 1); if (next >= 0) current = next;
  }
};
function frame() {
  requestAnimationFrame(frame); const s = state(), ph = s[0];
  const p = ex.tp_gr_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const name = new TextDecoder().decode(m.slice(o,e)); au.say(name); if (name === 'Speech_GroceryGame_GameInstructions_A') productSpeech.forEach(n => au.say(n)); o = e + 1; } }
  g.fillStyle = '#123'; g.fillRect(0,0,800,600);
  if (bg) g.drawImage(bg,0,0,946,588);
  // Screen 039 places five products on a 1623x2000 podium. The selection
  // camera pans that retail artwork so the current product is above Select.
  // Coordinates are calibrated to the Wii reference and remain provisional for PC.
  const zoom = presentingItems || ph !== 0;
  const scale = zoom ? 1 : 0.36;
  const ox = zoom ? 339 - 110 - current * 300 : 108;
  const oy = zoom ? -743 : -4;
  if (podium) g.drawImage(podium, ox, oy + 63*scale, 1623*scale, 2000*scale);
  for (let i=0; i<items.length; i++) {
    if (s[3+i] && !(settling && i === current)) continue;
    const x=ox+(110+i*300)*scale, y=oy+970*scale;
    const pi=pimg[i]; if (pi) g.drawImage(pi,x,y,180*scale,150*scale);
  }
  const lampX=ox+1028*scale, lampY=oy+721*scale;
  const lampGreen=ph===2 ? greenOn : greenOff, lampRed=ph===3 ? redOn : redOff;
  if (lampGreen) g.drawImage(lampGreen,lampX,lampY,210*scale,110*scale);
  if (lampRed) g.drawImage(lampRed,ox+1223*scale,lampY,210*scale,110*scale);
  g.save(); g.fillStyle='#fff'; g.font=`${Math.max(9,35*scale)}px Arial`; g.textAlign='left'; g.textBaseline='middle';
  g.fillText('$'+(s[1]/100).toFixed(2),ox+1170*scale,oy+900*scale); g.restore();
  ui.hide(left,right,select,...digits);
  if (ph === 1 && !settling) {
    if (choosingQuantity) ui.show(...digits);
    else { ui.show(left,right,select); ui.disabled.clear(); if (adjacent(s,-1)<0) ui.disabled.add(left); if (adjacent(s,1)<0) ui.disabled.add(right); }
  }
  ui.draw(g,ptr.x,ptr.y,'btn');
  if (ph === 1 && !settling && !choosingQuantity) for (const [id, image] of [[left,arrowLeft],[right,arrowRight]]) {
    const n = ui.all.get(id); if (image && n) { g.save(); if (ui.disabled.has(id)) g.globalAlpha = 0.45; g.drawImage(image,n.abs[0]+(n.w-28)/2,n.abs[1]+(n.h-28)/2,28,28); g.restore(); }
  }
  if (caption) font.retailCaption(g, caption, captionDuration ? Math.min(1,(performance.now()-captionStart)/(captionDuration*1000)) : 1);
  window.__gr = { ph, total:s[1], current, choosingQuantity, idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
