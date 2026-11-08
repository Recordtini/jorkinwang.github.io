// Grocery Game: retail screen 039 controls; podium placement is provisional.
import { Audio } from './audio.js?v=2';
import { Font } from './font.js?v=2';
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
const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const items = (await retail()).take('GroceryGame', 1);
const pimg = await Promise.all(items.map(async p => createImageBitmap(await (await fetch(`grocery/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
const prices = new Float32Array(items.map(p => p.price));
ex.tp_gr_new(put(new Uint8Array(prices.buffer)), items.length);
const au = new Audio(ex, idx); await au.addScreens([39, 3]);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock());
au.onIdle = () => ex.tp_gr_act(10);
let caption = '', current = 0, choosingQuantity = false, lastAmount = 0, lastTotal = 0, ptr = {x:-1,y:-1};
au.onCaption = t => { caption = t.replace('{value}', '$' + (/grand total/i.test(t) ? lastTotal : lastAmount).toFixed(2)); };
const state = () => { const p = ex.tp_gr_state(); return new Float32Array(mem().slice(p, p + 40)); };
// 0x4c97a0 / 0x4c9960 skip purchased items and stop at either end.
function adjacent(s, step) { let i = current + step; while (i >= 0 && i < items.length && s[3+i]) i += step; return i >= 0 && i < items.length ? i : -1; }
function point(e) { const r = cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height}; }
cv.onpointermove = e => { ptr = point(e); };
cv.onpointerdown = e => { ptr = point(e); ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = e => {
  ptr = point(e); const button = ui.hit(ptr.x, ptr.y), pressed = ui.down; ui.down = null;
  if (!button || button !== pressed) return;
  const s = state(); if (s[0] !== 1) return;
  if (choosingQuantity) {
    const q = digits.indexOf(button.inst) + 1;
    if (!q) return;
    lastAmount = items[current].price * q; lastTotal = (s[1] / 100) + lastAmount;
    ex.tp_gr_act(((current + 1) << 4) | q); choosingQuantity = false;
    const updated = state();
    // 0x4c8898 resets the carousel to the first product not yet purchased.
    if (updated[0] === 1) current = items.findIndex((_, i) => !updated[3+i]);
  } else if (button.inst === select) {
    choosingQuantity = true;
    au.say('Speech_GroceryGame_HowMany_A');
  } else if (button.inst === left || button.inst === right) {
    const next = adjacent(s, button.inst === left ? -1 : 1); if (next >= 0) current = next;
  }
};
function frame() {
  requestAnimationFrame(frame); const s = state(), ph = s[0];
  const p = ex.tp_gr_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o,e))); o = e + 1; } }
  g.fillStyle = '#123'; g.fillRect(0,0,800,600);
  if (bg) g.drawImage(bg,0,0,946,588);
  // Static approximation pending decoding of the podium's animated transform.
  if (podium) g.drawImage(podium, 195, 45, 406, 500);
  const pi = pimg[current]; if (pi) { const scale = Math.min(170/pi.width, 150/pi.height); g.drawImage(pi, 400-pi.width*scale/2, 330-pi.height*scale/2, pi.width*scale, pi.height*scale); }
  ui.hide(left,right,select,...digits);
  if (ph === 1) {
    if (choosingQuantity) ui.show(...digits);
    else { ui.show(left,right,select); ui.disabled.clear(); if (adjacent(s,-1)<0) ui.disabled.add(left); if (adjacent(s,1)<0) ui.disabled.add(right); }
  }
  ui.draw(g,ptr.x,ptr.y,'btn');
  if (ph === 1 && !choosingQuantity) for (const [id, image] of [[left,arrowLeft],[right,arrowRight]]) {
    const n = ui.all.get(id); if (image && n) { g.save(); if (ui.disabled.has(id)) g.globalAlpha = 0.45; g.drawImage(image,n.abs[0]+(n.w-28)/2,n.abs[1]+(n.h-28)/2,28,28); g.restore(); }
  }
  font2.draw(g, ph === 1 ? (choosingQuantity ? 'How many?' : 'Select an item') : ph === 2 ? 'YOU WIN!' : ph === 3 ? 'SORRY, YOU LOSE' : '', 20,50,'#fff');
  font.draw(g,'Total: $'+(s[1]/100).toFixed(2),20,82,'#fc4');
  if (caption) font.caption(g, caption);
  window.__gr = { ph, total:s[1], current, choosingQuantity };
}
requestAnimationFrame(frame); window.__ready = true;
