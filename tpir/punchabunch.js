// Punch a Bunch on the game's own screen 049 (ui.js: background, podium, Higher/Lower/Keep/Continue buttons; the punch board is the game's `punchBoardFull` art, a 10 x 5 grid of coin holes); rules from tpir::punchabunch (Rust/WASM).
import { Audio } from './audio.js?v=2'; import { Font } from './font.js?v=2'; import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 49).preload();
const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre)));
const byName = (n) => reg.scr[49].entries.find((e) => e.type === 3 && e.name === n)?.id;
const board = await reg.img(byName('punchBoardFull')), paper = await reg.img(byName('paper')), token = await reg.img(byName('punchabunchToken'));
const au = new Audio(ex, idx); await au.addScreens([49, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const all = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 20 && p.price <= 3000); const prods = [...all].sort(() => Math.random() - 0.5).slice(0, 4);
const pimgs = await Promise.all(prods.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_pb_new((Math.random() * 2 ** 31) | 1, ...prods.map((p) => Math.round(p.price)));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); let caption = ''; au.onCaption = (t) => { caption = t; };
// page: only the background and the first podium come from the widget tree; the rest is drawn here
const wide = pick('bf64'); ui.show(wide.inst);
for (const n of wide.children) if (n.class === 'container' && !pick('568a').inst.startsWith(n.inst) && !n.inst.startsWith('897c')) ui.hide(n.inst);
const pod = pick('897c'); pod.x = 190; for (const c of pod.children) { const nm = c.class === 'image' ? reg.by[c.res]?.name : ''; if (nm === 'Cover' || (c.class === 'image' && !c.res) || c.class === 'label' && c.vis === false) ui.hide(c.inst); }
for (const n of wide.children) if (n.class === 'image' || n.class === 'label') ui.hide(n.inst);
const priceLabel = pod.children.find((c) => c.class === 'label' && c.vis !== false && reg.by[c.res]?.name === 'Ronnia-28-1-1');
const hiB = pick('6b42'), loB = pick('c1be'), keepB = pick('16b1'), contB = pick('7633'); ui.hide(keepB.inst, contB.inst);
ui.handlers.set(hiB.inst, () => ex.tp_pb_act(0)); ui.handlers.set(loB.inst, () => ex.tp_pb_act(1)); ui.handlers.set(keepB.inst, () => ex.tp_pb_act(2)); let choosing = false; ui.handlers.set(contB.inst, () => { choosing = true; });
const ST = () => { const p = ex.tp_pb_state(); return new Float32Array(mem().slice(p, p + 4 * 120)); };
const OX = 80, coin = (h) => ({ x: OX + 97 + 50.1 * (h % 10), y: 190 + 53.5 * Math.floor(h / 10) });
const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; }; let ptr = { x: -1, y: -1 };
cv.onpointermove = (e) => { ptr = pt(e); };
cv.onpointerdown = (e) => { ptr = pt(e); const s = ST(); if (s[0] === 1 || (s[0] === 2 && choosing)) { for (let h = 0; h < 50; h++) { const c = coin(h); if (Math.hypot(ptr.x - c.x, ptr.y - c.y) < 25 && !s[15 + h]) { choosing = false; ex.tp_pb_act(10 + h); return; } } } ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = (e) => { ptr = pt(e); const b = ui.hit(ptr.x, ptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
const say = () => { const p = ex.tp_pb_events(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } };
const money = (v) => '$' + Math.abs(v).toLocaleString('en-US');
function frame(now) {
  requestAnimationFrame(frame); say(); const s = ST(); const [ph, item, chips, cash, pending, total, won] = s; const tag = [s[7], s[8], s[9], s[10]], punched = Array.from(s.slice(15, 65)), vals = Array.from(s.slice(65, 115));
  const quiz = ph === 0; ui[quiz ? 'show' : 'hide'](pod.inst, hiB.inst, loB.inst); if (priceLabel && quiz) ui.setText(priceLabel.inst, money(tag[Math.min(item, 3)]));
  ui[ph === 2 && !choosing ? 'show' : 'hide'](keepB.inst); ui.hide(contB.inst); if (ph === 2 && !choosing) ui.show(contB.inst);
    g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); ui.labelColor = '#222'; ui.labelCenter = true; ui.draw(g, ptr.x, ptr.y, 'nobtn');
  if (quiz) { const pi = pimgs[Math.min(item, 3)], sc = Math.min(180 / pi.width, 150 / pi.height); g.drawImage(pi, pod.x + 13 + (180 - pi.width * sc) / 2, 9 + (150 - pi.height * sc) / 2, pi.width * sc, pi.height * sc);
    font2.draw(g, `ITEM ${Math.min(item, 3) + 1} OF 4`, 480, 220, '#fff'); font.draw(g, 'Higher or lower than the tag?', 450, 200, '#ffd84a'); }
  else if (board) {
    g.drawImage(board, OX, 0, 644, 601);
    for (let h = 0; h < 50; h++) { const c = coin(h); if (punched[h]) { g.fillStyle = '#10163a'; g.beginPath(); g.ellipse(c.x, c.y, 22, 22, 0, 0, 7); g.fill(); g.fillStyle = '#fff'; font.draw(g, money(vals[h]).replace('$', ''), c.x - font.width(money(vals[h]).replace('$', '')) / 2, c.y + 5, vals[h] < 0 ? '#ffd84a' : '#fff'); }
      else if ((ph === 1 || (ph === 2 && choosing)) && Math.hypot(ptr.x - c.x, ptr.y - c.y) < 25) { g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.ellipse(c.x, c.y, 24, 24, 0, 0, 7); g.stroke(); } }
    font2.draw(g, `CHIPS ${chips}`, 10, 40, '#fff'); font.draw(g, `SLIPS ${money(total)}`, 10, 70, '#9fe39f');
    if (ph === 2 && !choosing && paper) { g.drawImage(paper, 150, 168, 513, 256); const t = `YOU GOT ${money(total)}`; font2.draw(g, t, 400 - font2.width(t) / 2, 280, '#222'); font.draw(g, 'Keep this slip or punch one more space?', 400 - font.width('Keep this slip or punch one more space?') / 2, 310, '#222'); }
    if (pending) font.draw(g, 'SECOND CHANCE — punch another space (free)', 240, 580, '#ffd84a');
    if (ph === 3) { const m = won ? `YOU WON ${money(cash)}!` : 'NO CASH THIS TIME'; font2.draw(g, m, 400 - font2.width(m) / 2, 300, won ? '#7f7' : '#f77'); }
  }
  ui.draw(g, ptr.x, ptr.y, 'btn');   // buttons last, above the board and the slip paper
  if (ph === 3 && s[2] === 0 && !won && punched.every((p) => !p)) font2.draw(g, 'NO CHIPS — NO CASH', 270, 300, '#f77');
  if (caption) font.caption(g, caption);
  window.__pb = { ph, item, chips, cash, won, total, pending, tag, real: [s[11], s[12], s[13], s[14]], punched, vals, idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
