// Flip Flop on the original screen 036 art; logic from tpir::flipflop (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/036/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([36, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => p.price >= 1000 && p.price <= 9999); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_ff_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_ff_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_ff_state(); return new Float32Array(mem().slice(p, p + 28)); };
const PANEL = [{ x: 100, y: 330, w: 280, h: 110 }, { x: 420, y: 330, w: 280, h: 110 }]; const DONE = { x: 300, y: 470, w: 200, h: 56 };
const hit = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1) return; if (hit(x, y, PANEL[0])) ex.tp_ff_act(0); else if (hit(x, y, PANEL[1])) ex.tp_ff_act(1); else if (hit(x, y, DONE)) ex.tp_ff_act(2); };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, won, flips] = s; const d = [s[3], s[4], s[5], s[6]];
  { const p = ex.tp_ff_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.Board) g.drawImage(im.Board, 0, 0, 800, 600);
  const sc = Math.min(300 / pimg.width, 200 / pimg.height); g.drawImage(pimg, 250 + (300 - pimg.width * sc) / 2, 90, pimg.width * sc, pimg.height * sc);
  PANEL.forEach((p, i) => { g.fillStyle = ph === 1 ? '#f4f4ff' : '#ccd'; g.fillRect(p.x, p.y, p.w, p.h); g.strokeStyle = '#c22'; g.lineWidth = 4; g.strokeRect(p.x, p.y, p.w, p.h);
    const t = `${d[i * 2]}  ${d[i * 2 + 1]}`; font2.draw(g, t, p.x + p.w / 2 - font2.width(t) / 2, p.y + 72, '#123'); });
  if (ph === 1) { g.fillStyle = flips ? '#2a8a3a' : '#555'; g.fillRect(DONE.x, DONE.y, DONE.w, DONE.h); g.strokeStyle = '#fff'; g.strokeRect(DONE.x, DONE.y, DONE.w, DONE.h); font2.draw(g, 'DONE', DONE.x + 100 - font2.width('DONE') / 2, DONE.y + 38, '#fff'); }
  font2.draw(g, ph === 1 ? 'Click a panel to flip it' : ph === 3 ? (won === 1 ? 'THE PRICES MATCH! YOU WIN!' : 'SORRY, YOU LOSE') : '', 40, 60, won === 0 ? '#f77' : '#fff');
  if (ph >= 2) font2.draw(g, '$' + Math.round(prod.price).toLocaleString('en-US'), 310, 560, '#ffd84a');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__ff = { ph, won, flips, digits: d, real: Math.round(prod.price) };
}
requestAnimationFrame(frame); window.__ready = true;
