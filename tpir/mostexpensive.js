// Most Expensive on the original screen 046 art; logic from tpir::mostexpensive (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/046/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([46, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = await (await fetch('products/index.json')).json(); const pick = [...prods].sort(() => Math.random() - 0.5).slice(0, 3);
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_me_new(pick[0].price, pick[1].price, pick[2].price);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_me_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_me_state(); return new Float32Array(mem().slice(p, p + 24)); };
const CARD = (i) => ({ x: 40 + i * 250, y: 120, w: 220, h: 300 });
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1) return; for (let i = 0; i < 3; i++) { const c = CARD(i); if (x >= c.x && x <= c.x + c.w && y >= c.y && y <= c.y + c.h) ex.tp_me_act(i); } };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, sel, won] = s;
  { const p = ex.tp_me_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); const bg = im.Bckg; if (bg) g.drawImage(bg, 0, 0, 800, 600);
  for (let i = 0; i < 3; i++) { const c = CARD(i); g.fillStyle = i === sel ? '#ffd84a' : '#1b2f66'; g.fillRect(c.x - 4, c.y - 4, c.w + 8, c.h + 8); g.fillStyle = '#fff'; g.fillRect(c.x, c.y, c.w, c.h);
    const pi = pimg[i]; const sc = Math.min(200 / pi.width, 200 / pi.height); g.drawImage(pi, c.x + 10 + (200 - pi.width * sc) / 2, c.y + 20, pi.width * sc, pi.height * sc);
    if (s[3 + i]) font2.draw(g, '$' + Math.round(pick[i].price).toLocaleString('en-US'), c.x + 20, c.y + 270, '#123'); }
  font2.draw(g, ph === 1 ? 'Pick the most expensive prize' : ph === 3 ? (won === 1 ? 'YOU WIN!' : 'SORRY, YOU LOSE') : '', 40, 70, won === 0 ? '#f77' : '#fff');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__me = { ph, sel, won, prices: pick.map((p) => p.price) };
}
requestAnimationFrame(frame); window.__ready = true;
