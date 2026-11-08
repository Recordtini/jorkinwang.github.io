// Range Game on the original screen 052 (layout + art), logic from tpir::rangegame (Rust/WASM).
import { Audio } from './audio.js?v=2';
import { Font } from './font.js?v=2';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/052/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const texts = Object.fromEntries(S.entries.filter((e) => e.type === 5).map((e) => [e.name, e.text]));
const images = new Map(); const img = async (id) => { if (images.has(id)) return images.get(id); const f = idx[id]; let r = null; if (f) { let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); r = await createImageBitmap(new Blob([b])).catch(() => null); } images.set(id, r); return r; };
const W = {}; for (const w of S.widgets) if (w.class === 'image' && w.res) (W[w.res] ||= []).push(w);
const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const au = new Audio(ex, idx); await au.addScreens([52, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = await (await fetch('products/index.json')).json(); const prod = prods[(Math.random() * prods.length) | 0];
const prodImg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_rg_new((Math.random() * 2 ** 31) | 1, prod.price);
const need = ['Board', 'Door', 'Zone', 'Ruler', 'Price', 'ItemGlowLarge']; for (const n of need) await img(byName[n]); await img(0x0fad);
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => au.unlock());
let caption = ''; au.onCaption = (t) => { caption = t; };
// the scripted intro advances each time the speech queue drains
au.onIdle = () => ex.tp_rg_act(2);
const S_ = () => { const p = ex.tp_rg_state(); return new Float32Array(mem().slice(p, p + 28)); };
let last = performance.now(), mouse = null;
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); mouse = [(e.clientX - r.left) * 800 / r.width, (e.clientY - r.top) * 600 / r.height];
  const s = S_(); const b = { x: 70, y: 300, w: 200, h: 70 }; if (mouse[0] >= b.x && mouse[0] <= b.x + b.w && mouse[1] >= b.y && mouse[1] <= b.y + b.h) { if (s[0] === 2) ex.tp_rg_act(0); else if (s[0] === 3) ex.tp_rg_act(1); } };
const RULER_TOP = 135, RULER_H = 198;     // the visible window (Rect 414,135 144x198): the board scrolls through it
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(now - last, 100); last = now; ex.tp_rg_tick(dt);
  { const p = ex.tp_rg_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  const s = S_(); const [phase, pos, zlo, zhi, won] = s;
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); g.save(); g.beginPath(); g.rect(0, 0, 800, 600); g.clip();
  const d = (name, x, y, w, h) => { const im = images.get(byName[name]); if (im) g.drawImage(im, x, y, w ?? im.width, h ?? im.height); };
  const bg = images.get(0x0fad); if (bg) g.drawImage(bg, -298, 0, 1600, 693);
  d('Board', 0, 0, 804, 1074);
  d('Door', 78, 189, 330, 273);
  // prize picture inside the door frame
  { const sc = Math.min(290 / prodImg.width, 230 / prodImg.height); g.fillStyle = '#111'; g.fillRect(92, 205, 300, 240); g.drawImage(prodImg, 92 + (300 - prodImg.width * sc) / 2, 205 + (240 - prodImg.height * sc) / 2, prodImg.width * sc, prodImg.height * sc); }
  // ruler window with the zone and the rising indicator (RECONSTRUCTED geometry)
  const rx = 414, ry = 135, rw = 144, rh = 198; g.fillStyle = '#0b2a14'; g.fillRect(rx, ry, rw, rh);
  g.save(); g.beginPath(); g.rect(rx, ry, rw, rh); g.clip();
  for (let k = 0; k <= 10; k++) { const y = ry + rh - 8 - (rh - 16) * k / 10; g.fillStyle = '#cfe'; g.fillRect(rx + 4, y, 30, 2); font.draw(g, String(k * 10), rx + 40, y + 5, '#cfe'); }
  const zy0 = ry + rh - 8 - (rh - 16) * zhi, zy1 = ry + rh - 8 - (rh - 16) * zlo; g.fillStyle = 'rgba(255,220,60,.35)'; g.fillRect(rx + 2, zy0, rw - 4, zy1 - zy0); g.strokeStyle = '#ffd84a'; g.strokeRect(rx + 2, zy0, rw - 4, zy1 - zy0);
  const iy = ry + rh - 8 - (rh - 16) * pos; g.fillStyle = '#f33'; g.fillRect(rx, iy - 2, rw, 4); g.beginPath(); g.moveTo(rx, iy); g.lineTo(rx - 12, iy - 8); g.lineTo(rx - 12, iy + 8); g.fill(); g.restore();
  if (phase >= 4) { const t = '$' + Math.round(prod.price).toLocaleString('en-US'); font2.draw(g, t, 560, 470, '#ffd84a'); }
  // buttons
  const bt = phase === 2 ? 'START' : phase === 3 ? 'STOP' : ''; if (bt) { g.fillStyle = phase === 2 ? '#2a8a3a' : '#b02020'; g.fillRect(70, 300, 200, 70); g.strokeStyle = '#fff'; g.strokeRect(70, 300, 200, 70); font2.draw(g, bt, 170 - font2.width(bt) / 2, 345, '#fff'); }
  if (phase === 4 || phase === 5) font2.draw(g, won === 1 ? 'YOU WIN!' : 'SORRY!', 80, 270, won === 1 ? '#7f7' : '#f77');
  g.restore();
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const words = caption; font.draw(g, words, 400 - font.width(words) / 2, 580, '#fff'); }
  window.__rg = { phase, pos, won, price: prod.price, zlo, zhi };
}
requestAnimationFrame(frame); window.__ready = true;
