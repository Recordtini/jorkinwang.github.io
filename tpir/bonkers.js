// Bonkers on the game's own screen 029 (drawn by ui.js: background, BonkersBoard, ClockArrow, chips, Start/Check buttons); rules from tpir::bonkers (Rust/WASM, engine/src/bonkers.rs).
import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=2'; import { Reg, UI } from './ui.js'; import { Sprite } from './video.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 29).preload();
const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre)));
const byName = (n) => reg.scr[29].entries.find((e) => e.type === 3 && e.name === n)?.id;
const chipBoard = await reg.img(byName('ChipOnBoard')), chipShelf = await reg.img(byName('ChipOnShelf')), arrow = await reg.img(byName('ClockArrow')), glow = await reg.img(byName('CircleGlowDown'));
const digits = await Sprite.load(ex, 'zip/029/002842_0.GWVideo');   // BonkersNumber: 10 frames = the digits 0..9
const au = new Audio(ex, idx); await au.addScreens([29, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 1000 && p.price <= 9999); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_bk_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); let caption = ''; au.onCaption = (t) => { caption = t; };
// layout: widget positions are the real ones from the 029 tree
const COLX = [265, 375, 485, 594], CHIPX = [276, 386, 496, 607], SHELFX = [274, 388, 497, 610];
const HI = (i) => ({ x: CHIPX[i], y: 130, w: 86, h: 90 }), LO = (i) => ({ x: CHIPX[i], y: 317, w: 86, h: 90 });
// page: show the game container, hide the widgets we draw ourselves
const root = pick('2928'); ui.show(root.inst);
for (const n of ui.all.values()) { const nm = n.class === 'image' ? reg.by[n.res]?.name : ''; if (['ChipOnShelf', 'ChipOnBoard', 'CircleGlowDown'].includes(nm) || (n.class === 'image' && !n.res) || (n.class === 'container' && n.w === 70)) ui.hide(n.inst); }
const startB = pick('1ee0'), checkB = pick('bd17'); ui.hide(checkB.inst); ui.setText(startB.inst, reg.by[startB.text]?.text || 'START');
const ST = () => { const p = ex.tp_bk_state(); return new Float32Array(mem().slice(p, p + 64)); };
ui.handlers.set(startB.inst, () => { ex.tp_bk_act(0); }); ui.handlers.set(checkB.inst, () => { ex.tp_bk_act(1); });
const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
const inR = (p, r) => p.x >= r.x && p.x < r.x + r.w && p.y >= r.y && p.y < r.y + r.h; let ptr = { x: -1, y: -1 };
cv.onpointermove = (e) => { ptr = pt(e); };
cv.onpointerdown = (e) => { ptr = pt(e); const s = ST(); if (s[0] === 2) { for (let i = 0; i < 4; i++) { if (inR(ptr, HI(i))) { ex.tp_bk_act(10 + i * 2 + 1); return; } if (inR(ptr, LO(i))) { ex.tp_bk_act(10 + i * 2); return; } } } ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = (e) => { ptr = pt(e); const b = ui.hit(ptr.x, ptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
const say = () => { const p = ex.tp_bk_events(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } };
let last = performance.now(), doneAt = 0;
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(now - last, 100); last = now; ex.tp_bk_tick(dt); say(); const s = ST(); const [ph, verdict, left, placed] = s; const real = [s[4], s[5], s[6], s[7]], shown = [s[8], s[9], s[10], s[11]], choice = [s[12], s[13], s[14], s[15]];
  if (ph === 2) { ui.hide(startB.inst); ui.show(checkB.inst); ui.disabled[placed === 4 ? 'delete' : 'add'](checkB.inst); } else if (ph === 3) { ui.hide(startB.inst, checkB.inst); }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); ui.draw(g, ptr.x, ptr.y);
  const sc = Math.min(210 / pimg.width, 200 / pimg.height); g.drawImage(pimg, 20 + (210 - pimg.width * sc) / 2, 200, pimg.width * sc, pimg.height * sc);   // the item on the left of the board
  const revealed = ph === 3;
  for (let i = 0; i < 4; i++) {
    digits.frame(g, shown[i], COLX[i], 231, 104, 88);                         // displayed (wrong) digits
    if (revealed) digits.frame(g, real[i], COLX[i] - 11, 472, 104, 88);       // real price digits
    if (choice[i] !== 0) { const r = choice[i] > 0 ? HI(i) : LO(i); if (chipBoard) g.drawImage(chipBoard, r.x, r.y, r.w, r.h); }
    if (ph === 2 && glow && (inR(ptr, HI(i)) || inR(ptr, LO(i)))) { const r = inR(ptr, HI(i)) ? HI(i) : LO(i); g.save(); g.globalAlpha = 0.5; g.fillStyle = '#fff'; g.fillRect(r.x, r.y + 10, r.w, r.h - 20); g.restore(); }
  }
  for (let i = 0; i < 4 - placed; i++) if (chipShelf) g.drawImage(chipShelf, SHELFX[i], 408, 86, 60);                // chips still on the shelf
  if (arrow) { const frac = ph === 2 ? 1 - left / 30000 : ph === 3 ? 1 - left / 30000 : 0; g.save(); g.translate(741 + 35, 175 + 35); g.rotate(frac * Math.PI * 2); g.drawImage(arrow, -35, -35, 70, 70); g.restore(); }
  if (ph === 2) { const t = Math.ceil(left / 1000) + 's'; font2.draw(g, t, 776 - font2.width(t) / 2, 262, '#fff'); }
  if (ph === 3) { const won = verdict === 1 || verdict === 2; const msg = won ? 'YOU WIN!' : 'SORRY — NOT THIS TIME'; font2.draw(g, msg, 20, 150, won ? '#7f7' : '#f77'); if (!doneAt) doneAt = now; }
  if (caption) font.caption(g, caption);
  window.__bk = { ph, won: verdict === 1 || verdict === 2 ? 1 : 0, verdict, left, placed, real, shown, choice, idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
