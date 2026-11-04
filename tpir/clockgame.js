// Clock Game on the original screen 033 art; logic from tpir::clockgame (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/033/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const au = new Audio(ex, idx); await au.addScreens([33, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => p.price >= 1000 && p.price <= 9999); const pick = [...prods].sort(() => Math.random() - 0.5).slice(0, 2);
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_ck_new(pick[0].price, pick[1].price);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_ck_act(10, 0);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_ck_state(); return new Float32Array(mem().slice(p, p + 20)); };
const inp = document.getElementById('in'), gin = document.getElementById('g');
document.getElementById('ok').onclick = () => { const v = Math.max(0, Math.round(+gin.value || 0)); gin.value = ''; ex.tp_ck_act(1, v); gin.focus(); }; gin.onkeydown = (e) => { if (e.key === 'Enter') document.getElementById('ok').click(); };
const START = { x: 300, y: 480, w: 200, h: 60 };
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] === 1 && x >= START.x && x <= START.x + START.w && y >= START.y && y <= START.y + START.h) ex.tp_ck_act(0, 0); };
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(now - last, 100); last = now; ex.tp_ck_tick(dt); const s = ST(); const [ph, item, left, hint, prizes] = s;
  { const p = ex.tp_ck_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  inp.style.display = ph === 2 ? 'block' : 'none';
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.ClockGameMain) g.drawImage(im.ClockGameMain, 0, 0, 800, 600);
  if (ph >= 2) { const pi = pimg[Math.min(item, 1)]; const sc = Math.min(260 / pi.width, 200 / pi.height); g.drawImage(pi, 270 + (260 - pi.width * sc) / 2, 90, pi.width * sc, pi.height * sc); }
  // clock face with a sweeping hand (30 s per lap)
  const cx = 130, cy = 130, R = 90; g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.strokeStyle = '#123'; g.lineWidth = 6; g.stroke();
  const a = -Math.PI / 2 + (1 - left / 30000) * 2 * Math.PI; g.strokeStyle = '#d22'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.stroke();
  font2.draw(g, (left / 1000).toFixed(1) + ' s', 60, 260, '#fff'); font.draw(g, 'Prizes: ' + prizes + ' / 2', 60, 290, '#fc4');
  font2.draw(g, ph === 2 ? (hint === 1 ? 'HIGHER' : hint === -1 ? 'LOWER' : 'Enter your bid') : ph === 3 ? 'YOU WON BOTH PRIZES + $1000!' : ph === 4 ? "TIME'S UP!" : '', 40, 60, ph === 4 ? '#f77' : '#fff');
  if (ph === 1) { g.fillStyle = '#2a8a3a'; g.fillRect(START.x, START.y, START.w, START.h); g.strokeStyle = '#fff'; g.strokeRect(START.x, START.y, START.w, START.h); font2.draw(g, 'START', START.x + 100 - font2.width('START') / 2, START.y + 42, '#fff'); }
  if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(g, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__ck = { ph, item, left, hint, prizes, real: pick.map((p) => Math.round(p.price)) };
}
requestAnimationFrame(frame); window.__ready = true;
