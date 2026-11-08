// One Away on the game's own screen 047 (ui.js: background, panels, Up/Down arrow buttons, OK; digit tiles from the game's Block/Black/Blue/Red images); rules from tpir::oneaway (Rust/WASM).
import { Audio } from './audio.js?v=2'; import { Font } from './font.js?v=2'; import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 47).preload();
const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre)));
const byName = (n) => reg.scr[47].entries.find((e) => e.type === 3 && e.name === n)?.id;
const D = { black: [], blue: [], red: [] }; for (let d = 0; d < 10; d++) { D.black.push(await reg.img(byName('Black' + d))); D.blue.push(await reg.img(byName('Blue' + d))); D.red.push(await reg.img(byName('Red' + d))); }
const block = await reg.img(byName('Block'));
const au = new Audio(ex, idx); await au.addScreens([47, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/all.json')).json()).filter((p) => p.price >= 10000 && p.price <= 99999); const prod = prods[(Math.random() * prods.length) | 0];
const pimg = await createImageBitmap(await (await fetch(`products/Product_${String(prod.id).padStart(6, '0')}.jpg`)).blob());
ex.tp_oa_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); let caption = ''; au.onCaption = (t) => { caption = t; };
const COLX = [211, 278, 343, 409, 478];   // the real arrow-button columns of screen 047
const wide = pick('192b'); ui.show(wide.inst); const play = pick('dc7b');
for (const n of play.children) { const nm = n.class === 'image' ? reg.by[n.res]?.name : ''; if (['Block', 'Black0'].includes(nm) || !n.res) ui.hide(n.inst); }
for (const k of ['2680']) { const n = pick(k); if (n) ui.hide(n.inst); }
const btnBox = pick('1ca3'); const arrows = btnBox.children.filter((c) => c.class === 'button' && !reg.by[c.text]); const okB = btnBox.children.find((c) => c.class === 'button' && reg.by[c.text]);
arrows.slice(0, 5).forEach((b, i) => ui.handlers.set(b.inst, () => ex.tp_oa_act(10 + i * 2 + 1))); arrows.slice(5, 10).forEach((b, i) => ui.handlers.set(b.inst, () => ex.tp_oa_act(10 + i * 2)));
ui.handlers.set(okB.inst, () => ex.tp_oa_act(0)); ui.setText(okB.inst, 'OK');
const ST = () => { const p = ex.tp_oa_state(); return new Float32Array(mem().slice(p, p + 80)); };
const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; }; let ptr = { x: -1, y: -1 };
cv.onpointermove = (e) => { ptr = pt(e); }; cv.onpointerdown = (e) => { ptr = pt(e); ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = (e) => { ptr = pt(e); const b = ui.hit(ptr.x, ptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
const say = () => { const p = ex.tp_oa_events(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } };
let last = performance.now(), countWait = false;
function frame(now) {
  requestAnimationFrame(frame); last = now; say(); const s = ST(); const [ph, won, r1, rn] = s; const dir = [s[4], s[5], s[6], s[7], s[8]], shown = [s[9], s[10], s[11], s[12], s[13]], real = [s[14], s[15], s[16], s[17], s[18]];
  if (ph === 1 && !countWait) { countWait = true; const t = setInterval(() => { if (!au.speaking && !au.speechQ.length) { clearInterval(t); ex.tp_oa_act(1); countWait = false; } }, 300); }
  const allSet = dir.every((d) => d !== 0); ui[allSet && (ph === 0 || ph === 2) ? 'show' : 'hide'](okB.inst); if (ph === 1 || ph === 3) ui.hide(okB.inst);
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); ui.draw(g, ptr.x, ptr.y);
  for (let i = 0; i < 5; i++) {   // digit tiles between the arrows (real tile art is 133 px; the arrow columns are 67 px apart, so half size)
    const x = COLX[i], y = 205, w = 67, h = 62; if (block) g.drawImage(block, x, y, w, h);
    const chosen = dir[i] !== 0; const val = chosen ? shown[i] + dir[i] : shown[i]; const showRes = ph === 1 || ph === 3; const col = showRes ? (val === real[i] ? D.blue : D.red) : (chosen ? D.blue : D.black); const im = col[Math.max(0, Math.min(9, val))];
    if (im) g.drawImage(im, x + 6, y + 4, w - 12, h - 8);
    if (ph === 3 && D.black[real[i]]) g.drawImage(D.black[real[i]], x + 6, 385 - 4, w - 12, h - 8);   // the actual price digits
  }
  if (ph === 3) font2.draw(g, 'ACTUAL PRICE', 215, 380, '#fff');
  const sc = Math.min(170 / pimg.width, 120 / pimg.height); g.drawImage(pimg, 14, 430, pimg.width * sc, pimg.height * sc);
  if (ph === 1) font2.draw(g, `${r1} RIGHT`, 290, 360, '#fff'); if (ph === 3) font2.draw(g, won ? 'YOU WIN!' : 'NOT THIS TIME', 290, 440, won ? '#7f7' : '#f77');
  if (caption) font.caption(g, caption);
  window.__oa = { ph, won, r1, rn, dir, shown, real, idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
