// Shell Game on the original screen 055 art (layout from the GWScreen widget tree), logic from tpir::shellgame (Rust/WASM).
import { Audio } from './audio.js'; import { Font } from './font.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/055/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); if (f.endsWith('.j32')) b = b.slice(4); im[n] = await createImageBitmap(new Blob([b])).catch(() => null); }
const bg = idx[0x0b63] ? await (async () => { let b = new Uint8Array(await (await fetch('zip/' + idx[0x0b63])).arrayBuffer()); if (idx[0x0b63].endsWith('.j32')) b = b.slice(4); return createImageBitmap(new Blob([b])); })() : null;
const au = new Audio(ex, idx); await au.addScreens([55, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = await (await fetch('products/index.json')).json(); const pick = [...prods].sort(() => Math.random() - 0.5).slice(0, 4);
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_sg_new((Math.random() * 2 ** 31) | 1, pick[0].price, pick[1].price, pick[2].price, pick[3].price, 5000);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_sg_act(2);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_sg_state(); const f = new Float32Array(mem().slice(p, p + 4 * 80)); return f; };
const SHELL = [[183, 104, 88, 90], [270, 104, 86, 91], [358, 103, 84, 93], [443, 103, 84, 91]];   // widget rects from the layout
const BTN = { higher: [204, 28, 150, 70], lower: [204, 131, 150, 70] };
let anim = null; let order = [0, 1, 2, 3]; let last = performance.now(), revealTimer = 0, shuffled = false;
const hit = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; const s = ST();
  if (s[0] === 2) { if (hit(x, y, BTN.higher)) ex.tp_sg_act(0); else if (hit(x, y, BTN.lower)) ex.tp_sg_act(1); }
  else if (s[0] === 4) SHELL.forEach((r2, i) => { if (hit(x, y, r2)) ex.tp_sg_act(10 + i); });
  else if (s[0] === 7) SHELL.forEach((r2, i) => { if (hit(x, y, r2)) ex.tp_sg_act(20 + i); }); };
function frame(now) {
  requestAnimationFrame(frame); const dt = now - last; last = now; const s = ST(); const ph = s[0];
  { const p = ex.tp_sg_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const nm = new TextDecoder().decode(m.slice(o, e)); if (nm.startsWith('Sfx_')) au.sfx(nm); else au.say(nm); o = e + 1; } } }
  if (ph === 5 && !shuffled) { shuffled = true; setTimeout(() => { ex.tp_sg_act(3); shuffled = false; ex.tp_sg_act(4); }, 3500); }
  const placed = [s[7], s[8], s[9], s[10]]; const shown = s[11], real = s[12];
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); g.save(); g.beginPath(); g.rect(0, 0, 800, 600); g.clip();
  if (bg) g.drawImage(bg, 0, 0, 946, 600); if (im.board) g.drawImage(im.board, 0, 141, 693, 346);
  // product and false price while guessing
  if (ph >= 2 && ph <= 3 && s[1] < 4) { const pi = pimg[s[1]]; const sc = Math.min(240 / pi.width, 200 / pi.height); g.drawImage(pi, 470, 250, pi.width * sc, pi.height * sc); font2.draw(g, '$' + Math.round(shown).toLocaleString('en-US'), 480, 500, '#ffd84a'); }
  // shells
  SHELL.forEach((r, i) => { const up = (ph === 6 || ph === 8 || ph === 7) && i < s[4]; const lift = up ? 40 : 0; if (im.Ball && (ph >= 6) && Math.round(s[3]) === i && up) g.drawImage(im.Ball, r[0] + r[2] / 2 - 10, r[1] + r[3] + 4, 20, 24);
    if (im.Shell) g.drawImage(im.Shell, r[0], r[1] - lift, r[2], r[3]); if (placed[i] && im.Chip) g.drawImage(im.Chip, r[0] + r[2] / 2 - 18, r[1] + r[3] + 28, 36, 38); });
  const lab = ['', '', 'HIGHER or LOWER?', 'Chip!', 'Place your chips', 'Shuffling…', 'Revealing…', 'Bonus: pick the ball!', s[5] ? 'You win the prize!' : 'Sorry!'][ph] || ''; font2.draw(g, lab, 20, 270, '#fff');
  font.draw(g, 'Chips: ' + s[2], 20, 300, '#fc4');
  if (ph === 2) { for (const [t, r] of [['HIGHER', BTN.higher], ['LOWER', BTN.lower]]) { g.fillStyle = '#2a5ad0'; g.fillRect(...r); g.strokeStyle = '#fff'; g.strokeRect(...r); font2.draw(g, t, r[0] + 75 - font2.width(t) / 2, r[1] + 44, '#fff'); } }
  g.restore(); if (caption) { g.fillStyle = 'rgba(0,0,0,.65)'; g.fillRect(0, 548, 800, 52); font.draw(g, caption.slice(0, 90), 400 - font.width(caption.slice(0, 90)) / 2, 580, '#fff'); }
  window.__sg = { ph, chips: s[2], ball: s[3], won: s[5], item: s[1], real, shown };
}
requestAnimationFrame(frame); window.__ready = true;
