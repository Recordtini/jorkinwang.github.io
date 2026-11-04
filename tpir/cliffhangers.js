// Cliff Hangers on the original screen 032 art; logic from tpir::cliffhangers (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/032/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([32, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = await (await fetch('products/index.json')).json(); const pick = [...prods].sort(() => Math.random() - 0.5).slice(0, 3);
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_ch_new((Math.random() * 2 ** 31) | 1, pick[0].price, pick[1].price, pick[2].price, 30000);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_ch_act(0, 0);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_ch_state(); return new Float32Array(mem().slice(p, p + 16)); };
const inp = document.getElementById('in'), gin = document.getElementById('g');
document.getElementById('ok').onclick = () => { const v = Math.max(0, Math.round(+gin.value || 0)); gin.value = ''; ex.tp_ch_act(1, v); };
gin.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('ok').click(); };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, item, pos, steps] = s;
  { const p = ex.tp_ch_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const nm = new TextDecoder().decode(m.slice(o, e)); if (nm.startsWith('Sfx_')) au.sfx(nm); else au.say(nm); o = e + 1; } } }
  inp.style.display = ph === 1 ? 'block' : 'none';
  g.fillStyle = '#245'; g.fillRect(0, 0, 800, 600);
  if (im.CH_full) g.drawImage(im.CH_full, 0, 0, 800, 600); else if (im.CH_podium) g.drawImage(im.CH_podium, 0, 300);
  // mountain path: 26 steps from bottom-left to the summit (RECONSTRUCTED geometry), hiker marker
  const px = (k) => 120 + (560) * (k / 25), py = (k) => 500 - 330 * (k / 25) - Math.sin(k / 25 * Math.PI) * 30;
  g.strokeStyle = 'rgba(255,255,255,.5)'; g.lineWidth = 3; g.beginPath(); for (let k = 0; k <= 25; k++) k ? g.lineTo(px(k), py(k)) : g.moveTo(px(k), py(k)); g.stroke();
  const hk = Math.min(pos, 25); const hi = ph === 4 ? im.CHSmallClimber : (im.CH_climber || im.CHSmallClimber); if (hi) g.drawImage(hi, px(hk) - 20, py(hk) - 50 + (ph === 4 ? 70 : 0), 40, 50); else { g.fillStyle = '#f80'; g.fillRect(px(hk) - 8, py(hk) - 30, 16, 30); }
  font2.draw(g, ph === 3 ? 'YOU WIN!' : ph === 4 ? 'THE HIKER FELL!' : `Item ${Math.min(item + 1, 3)} of 3`, 20, 40, ph === 4 ? '#f77' : '#fff'); font.draw(g, `Step ${pos} of 25`, 20, 70, '#fc4');
  if (ph === 1 && item < 3) { const pi = pimg[item]; const sc = Math.min(220 / pi.width, 180 / pi.height); g.drawImage(pi, 20, 100, pi.width * sc, pi.height * sc); }
  if (ph >= 3) font2.draw(g, 'Last price: $' + Math.round(pick[Math.min(item, 2)].price), 20, 330, '#ffd84a');
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__ch = { ph, item, pos, steps, real: pick.map((p) => Math.round(p.price)) };
}
requestAnimationFrame(frame); window.__ready = true;
