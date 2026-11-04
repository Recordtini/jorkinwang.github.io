// Safe Crackers on the original screen 053 art; logic from tpir::safecrackers (Rust/WASM). Click the upper/lower half of a dial.
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/053/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([53, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => { const s = String(Math.round(p.price)); return s.length === 4 && new Set(s).size === 4; }); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_sc_new(Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_sc_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; }; const ST = () => { const p = ex.tp_sc_state(); return new Float32Array(mem().slice(p, p + 24)); };
const DIAL = (i) => ({ x: 130 + i * 150, y: 300, w: 120, h: 140 }); const OPEN = { x: 300, y: 470, w: 200, h: 60 };
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1) return;
  for (let i = 0; i < 4; i++) { const d = DIAL(i); if (x >= d.x && x <= d.x + d.w && y >= d.y && y <= d.y + d.h) ex.tp_sc_act(20 + 2 * i + (y < d.y + d.h / 2 ? 0 : 1)); }
  if (x >= OPEN.x && x <= OPEN.x + OPEN.w && y >= OPEN.y && y <= OPEN.y + OPEN.h) ex.tp_sc_act(11); };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, inv] = s; const d = [s[2], s[3], s[4], s[5]];
  { const p = ex.tp_sc_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); const bg = im['SafeCrackers1600x1200']; if (bg) g.drawImage(bg, 0, 0, 800, 600);
  const sc = Math.min(220 / pimg.width, 150 / pimg.height); g.drawImage(pimg, 290 + (220 - pimg.width * sc) / 2, 110, pimg.width * sc, pimg.height * sc);
  for (let i = 0; i < 4; i++) { const r = DIAL(i); g.fillStyle = '#e8e8f0'; g.fillRect(r.x, r.y, r.w, r.h); g.strokeStyle = '#123'; g.lineWidth = 4; g.strokeRect(r.x, r.y, r.w, r.h); font2.draw(g, '▲', r.x + 50, r.y + 22, '#c22'); font2.draw(g, '▼', r.x + 50, r.y + 132, '#c22'); font2.draw(g, String(d[i]), r.x + 60 - font2.width(String(d[i])) / 2, r.y + 88, '#123'); }
  if (ph === 1) { g.fillStyle = '#2a8a3a'; g.fillRect(OPEN.x, OPEN.y, OPEN.w, OPEN.h); g.strokeStyle = '#fff'; g.strokeRect(OPEN.x, OPEN.y, OPEN.w, OPEN.h); font2.draw(g, 'OPEN', OPEN.x + 100 - font2.width('OPEN') / 2, OPEN.y + 42, '#fff'); }
  font2.draw(g, inv ? 'Each digit may only be used once!' : ph === 1 ? 'Turn the dials!' : ph === 2 ? 'THE SAFE OPENS — YOU WIN!' : ph === 3 ? 'WRONG COMBINATION — YOU LOSE' : '', 20, 50, ph === 3 || inv ? '#f77' : '#fff');
  if (ph >= 2) font2.draw(g, '$' + Math.round(prod.price), 330, 575, '#ffd84a');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__sc = { ph, inv, d, real: String(Math.round(prod.price)).split('').map(Number) };
}
requestAnimationFrame(frame); window.__ready = true;
