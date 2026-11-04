// Lucky Seven on the original screen 043 art; logic from tpir::luckyseven (Rust/WASM). Click a digit 1-9 to guess the next number.
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/043/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([43, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => Math.round(p.price) >= 10000 && Math.round(p.price) <= 99999); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_l7_new(Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_l7_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; }; const ST = () => { const p = ex.tp_l7_state(); return new Float32Array(mem().slice(p, p + 40)); };
const KEY = (d) => ({ x: 70 + (d - 1) * 75, y: 470, w: 65, h: 60 });
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1) return; for (let d = 1; d <= 9; d++) { const k = KEY(d); if (x >= k.x && x <= k.x + k.w && y >= k.y && y <= k.y + k.h) ex.tp_l7_act(d); } };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, ix, dollars, won] = s; const real = [s[4], s[5], s[6], s[7], s[8]]; const n = s[9]; const guesses = Array.from(s.slice(10, 10 + n));
  { const p = ex.tp_l7_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); const bgk = Object.keys(im)[0]; if (im[bgk]) g.drawImage(im[bgk], 0, 0, 800, 600);
  const sc = Math.min(240 / pimg.width, 150 / pimg.height); g.drawImage(pimg, 280 + (240 - pimg.width * sc) / 2, 90, pimg.width * sc, pimg.height * sc);
  for (let i = 0; i < 5; i++) { const x = 130 + i * 110; g.fillStyle = '#e8e8f0'; g.fillRect(x, 270, 90, 110); g.strokeStyle = '#123'; g.lineWidth = 3; g.strokeRect(x, 270, 90, 110);
    const shown = i === 0 || i < ix || ph === 2; if (shown) font2.draw(g, String(real[i]), x + 45 - font2.width(String(real[i])) / 2, 340, '#123');
    if (i >= 1 && i - 1 < guesses.length) font.draw(g, 'you: ' + guesses[i - 1], x + 8, 372, '#c22'); }
  g.fillStyle = '#2a8a3a'; for (let k = 0; k < Math.max(0, dollars); k++) { g.fillRect(40 + k * 40, 410, 34, 18); } font.draw(g, `$${Math.max(0, dollars)} left`, 40, 450, '#fc4');
  if (ph === 1) for (let d = 1; d <= 9; d++) { const k = KEY(d); g.fillStyle = '#2a5ad0'; g.fillRect(k.x, k.y, k.w, k.h); g.strokeStyle = '#fff'; g.strokeRect(k.x, k.y, k.w, k.h); font2.draw(g, String(d), k.x + 32 - font2.width(String(d)) / 2, k.y + 42, '#fff'); }
  font2.draw(g, ph === 1 ? 'Guess the next number' : won === 1 ? 'YOU STILL HAVE A DOLLAR — YOU WIN!' : won === 0 ? 'OUT OF DOLLARS — YOU LOSE' : '', 20, 50, won === 0 ? '#f77' : '#fff');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__l7 = { ph, ix, dollars, won, real };
}
requestAnimationFrame(frame); window.__ready = true;
