// Squeeze Play on the original screen 057 art; logic from tpir::squeezeplay (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/057/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const bgId = 0x0fad; { const f = idx[bgId]; if (f) { let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im.bg = await createImageBitmap(new Blob([b])).catch(() => null); } }
const au = new Audio(ex, idx); await au.addScreens([57, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/090'.replace('090', '059') + '/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => p.price >= 1000 && p.price <= 9999); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_sq_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_sq_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_sq_state(); return new Float32Array(mem().slice(p, p + 36)); };
const BX = (i) => 130 + i * 110;
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1 || y < 300 || y > 420) return; for (let i = 1; i <= 3; i++) if (x >= BX(i) && x <= BX(i) + 100) ex.tp_sq_act(i); };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, rem, won, result] = s; const d = [s[4], s[5], s[6], s[7], s[8]];
  { const p = ex.tp_sq_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.bg) g.drawImage(im.bg, 0, 0, 800, 600);
  const sc = Math.min(260 / pimg.width, 190 / pimg.height); g.drawImage(pimg, 270 + (260 - pimg.width * sc) / 2, 70, pimg.width * sc, pimg.height * sc);
  const showDigits = ph >= 2 ? d.filter((_, i) => i !== rem) : d;
  showDigits.forEach((v, i) => { const x = ph >= 2 ? 180 + i * 110 : BX(i); const mid = ph < 2 && i >= 1 && i <= 3; g.fillStyle = mid ? '#ffd84a' : '#e8e8f0'; g.fillRect(x, 320, 100, 100); g.strokeStyle = '#123'; g.lineWidth = 3; g.strokeRect(x, 320, 100, 100); font2.draw(g, String(v), x + 50 - font2.width(String(v)) / 2, 390, '#123'); });
  font2.draw(g, ph === 1 ? 'Remove one of the three middle numbers' : ph === 3 ? (won === 1 ? 'YOU WIN!' : 'SORRY, YOU LOSE') : ph === 2 ? 'Squeezing…' : '', 40, 60, won === 0 ? '#f77' : '#fff');
  if (ph >= 2) font2.draw(g, '$' + Math.round(prod.price).toLocaleString('en-US'), 290, 480, '#ffd84a');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__sq = { ph, rem, won, result, shown: d, real: Math.round(prod.price) };
}
requestAnimationFrame(frame); window.__ready = true;
