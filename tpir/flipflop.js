// Flip Flop on the original screen 036 art; logic from tpir::flipflop (Rust/WASM).
import { retail } from './retail.js';
import { Audio } from './audio.js?v=2'; import { Font } from './font.js?v=2'; import { Sprite, decodeJ32 } from './video.js'; import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/036/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); im[n] = await (f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b]))).catch(() => null); }
const reg = await Reg.load(ex,idx), ui = await new UI(reg,36).preload();
for (const n of ui.all.values()) if (n.class === 'container') ui.show(n.inst); else ui.hide(n.inst);
const doneId = 'f846dec9', numbers = await Sprite.load(ex,'zip/036/002825_0.GWVideo');
const redNumbers = Object.create(numbers); redNumbers.imgs = numbers.imgs.map(img => { const c = new OffscreenCanvas(img.width,img.height), x = c.getContext('2d'); x.drawImage(img,0,0); x.globalCompositeOperation='source-in'; x.fillStyle='#d82824'; x.fillRect(0,0,c.width,c.height); return c; });
const background = await reg.img(0x0b63);
const au = new Audio(ex, idx); await au.addScreens([36, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
// 0x4bbed0 selects script index 8 (FlipFlop), category 0.
const [prod] = (await retail()).take('FlipFlop', 0);
ex.tp_ff_new((Math.random() * 2 ** 31) | 1, Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_ff_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_ff_state(); return new Float32Array(mem().slice(p, p + 32)); };
const PANEL = [{ x: 295, y: 131, w: 139, h: 129 }, { x: 443, y: 131, w: 139, h: 129 }]; const DONE = { x: 343, y: 283, w: 200, h: 70 };
const hit = (x, y, r) => x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
cv.onpointerdown = (e) => { const r = cv.getBoundingClientRect(); const x = (e.clientX - r.left) * 800 / r.width, y = (e.clientY - r.top) * 600 / r.height; if (ST()[0] !== 1) return; if (hit(x, y, PANEL[0])) ex.tp_ff_act(0); else if (hit(x, y, PANEL[1])) ex.tp_ff_act(1); else if (hit(x, y, DONE)) ex.tp_ff_act(2); };
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, won, flips] = s; const d = [s[3], s[4], s[5], s[6]];
  { const p = ex.tp_ff_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (background) g.drawImage(background,0,0,946,588); if (im.BoardZoom) g.drawImage(im.BoardZoom,0,0,776,531);
  PANEL.forEach((p, i) => { const panel = (s[7] & (1 << i)) ? im.PanelWhite : im.PanelRed; if (panel) g.drawImage(panel, p.x, p.y, p.w, p.h); else { g.fillStyle = '#ddd'; g.fillRect(p.x, p.y, p.w, p.h); }
    for(let j=0;j<2;j++) ((s[7] & (1<<i)) ? redNumbers : numbers).frame(g,d[i*2+j],p.x+8+j*60,146,64,100); });
  if (ph < 2 && im.Door) g.drawImage(im.Door,291,263,295,144);
  if (ph >= 2) { const real=String(Math.round(prod.price)).padStart(4,'0'); for(let i=0;i<2;i++) if(im.PriceRed) g.drawImage(im.PriceRed,294+i*146,265,143,138); for(let i=0;i<4;i++) numbers.frame(g,Number(real[i]),303+i*60+(i>=2?28:0),283,64,100); }
  if(ph===1) { ui.show(doneId); if(!flips) ui.disabled.add(doneId); else ui.disabled.delete(doneId); } else ui.hide(doneId);
  ui.draw(g,-1,-1,'btn');
  if (caption) font.caption(g, caption);
  window.__ff = { ph, won, flips, digits: d, real: Math.round(prod.price) };
}
requestAnimationFrame(frame); window.__ready = true;
