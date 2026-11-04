// Grocery Game on the original screen 039 art; logic from tpir::grocerygame (Rust/WASM). Click an item, then a quantity 1-9.
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/039/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([39, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const all = await (await fetch('grocery/index.json')).json(); const items = [...all].sort(() => Math.random() - 0.5).slice(0, 6);
const pimg = await Promise.all(items.map(async (p) => createImageBitmap(await (await fetch(`grocery/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
const pb = new Float32Array(items.map((p) => p.price)); ex.tp_gr_new(put(new Uint8Array(pb.buffer)), items.length);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_gr_act(10);
let caption = '', sel = -1; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_gr_state(); return new Float32Array(mem().slice(p, p + 40)); };
const CARD = (i) => ({ x: 30 + (i % 3) * 250, y: 100 + ((i / 3) | 0) * 190, w: 230, h: 175 }); const QTY = (q) => ({ x: 40 + (q - 1) * 80, y: 490, w: 70, h: 50 });
const hit = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; const s = ST(); if (s[0] !== 1) return;
  if (sel >= 0) { for (let q = 1; q <= 9; q++) if (hit(x, y, QTY(q))) { ex.tp_gr_act(((sel + 1) << 4) | q); sel = -1; return; } }
  for (let i = 0; i < items.length; i++) if (!s[3 + i] && hit(x, y, CARD(i))) sel = i; };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, total] = s;
  { const p = ex.tp_gr_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.GroceryGame_Podium) g.drawImage(im.GroceryGame_Podium, 0, 0, 800, 600);
  items.forEach((it, i) => { const c = CARD(i); const used = s[3 + i]; g.fillStyle = used ? '#555' : i === sel ? '#ffd84a' : '#f4f4ff'; g.fillRect(c.x, c.y, c.w, c.h); const pi = pimg[i]; const sc = Math.min(200 / pi.width, 110 / pi.height); g.globalAlpha = used ? 0.35 : 1; g.drawImage(pi, c.x + 15 + (200 - pi.width * sc) / 2, c.y + 8, pi.width * sc, pi.height * sc); g.globalAlpha = 1; font2.draw(g, '$' + it.price.toFixed(2), c.x + 20, c.y + 152, '#123'); });
  if (sel >= 0 && ph === 1) for (let q = 1; q <= 9; q++) { const r = QTY(q); g.fillStyle = '#2a5ad0'; g.fillRect(r.x, r.y, r.w, r.h); g.strokeStyle = '#fff'; g.strokeRect(r.x, r.y, r.w, r.h); font2.draw(g, String(q), r.x + 35 - font2.width(String(q)) / 2, r.y + 36, '#fff'); }
  font2.draw(g, ph === 1 ? (sel >= 0 ? 'How many?' : 'Pick an item') : ph === 2 ? 'BETWEEN $20 AND $21 — YOU WIN!' : ph === 3 ? 'SORRY, YOU LOSE' : '', 20, 50, ph === 3 ? '#f77' : '#fff'); font.draw(g, 'Total: $' + (total / 100).toFixed(2), 20, 82, '#fc4');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__gr = { ph, total, prices: items.map((p) => Math.round(p.price * 100)) };
}
requestAnimationFrame(frame); window.__ready = true;
