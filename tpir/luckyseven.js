// Lucky Seven on the original screen 043 art; logic from tpir::luckyseven (Rust/WASM). Click a digit 1-9 to guess the next number.
import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=2'; import { Reg, UI } from './ui.js'; import { decodeJ32 } from './video.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/043/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); im[n] = await (f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b]))).catch(() => null); }
const reg = await Reg.load(ex, idx), ui = await new UI(reg,43).preload();
const keys = ['61fd79c5','16fa4953','8ff318e9','f8f4287f','6690bddc','11978d4a','889edcf0','ff99ec66','6f26f1f7'];
for (const n of ui.all.values()) if (n.class === 'container') ui.show(n.inst); else ui.hide(n.inst);
keys.forEach((id,i) => ui.setText(id,String(i+1)));
const au = new Audio(ex, idx); await au.addScreens([43, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
const prods = (await (await fetch('products/index.json')).json()).filter((p) => Math.round(p.price) >= 10000 && Math.round(p.price) <= 99999); const prod = prods[(Math.random() * prods.length) | 0];
ex.tp_l7_new(Math.round(prod.price));
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_l7_act(10);
let caption = ''; au.onCaption = (t) => { caption = t; }; const ST = () => { const p = ex.tp_l7_state(); return new Float32Array(mem().slice(p, p + 56)); };
let ptr={x:-1,y:-1}; const point=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height};};
cv.onpointermove=e=>{ptr=point(e);}; cv.onpointerdown=e=>{ptr=point(e);ui.down=ui.hit(ptr.x,ptr.y);};
cv.onpointerup=e=>{ptr=point(e);const b=ui.hit(ptr.x,ptr.y),down=ui.down;ui.down=null;if(ST()[0]!==1||au.speaking||au.speechQ.length||!b||b!==down)return;const d=keys.indexOf(b.inst)+1;if(d)ex.tp_l7_act(d);};
function frame() {
  requestAnimationFrame(frame); const s = ST(); const [ph, ix, dollars, won] = s; const real = [s[4], s[5], s[6], s[7], s[8]]; const n = s[9]; const guesses = Array.from(s.slice(10, 10 + n));
  { const p = ex.tp_l7_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } } }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.GameLuckySevenBackground) g.drawImage(im.GameLuckySevenBackground,0,0,800,600);
  // Static screen 043 rectangles; the original door-opening animations remain unimplemented.
  for (let i=0;i<5;i++) { const shown=i===0 || i<ix || (ph===2 && i<=n); const digit=im[`${real[i]}Reflection`]; if(shown && digit) g.drawImage(digit,240+i*75,173,74,453); else if(im.Door) g.drawImage(im.Door,241+i*74,169,82,461); }
  if(im.Dollar_Horizontal) g.drawImage(im.Dollar_Horizontal,62,272,53,41); font2.draw(g,String(Math.max(0,dollars)),121,305,'#fff');
  ui.hide(...keys); if(ph===1) ui.show(...keys); ui.draw(g,ptr.x,ptr.y,'btn');
  font2.draw(g, ph === 1 ? 'Guess the next number' : won === 1 ? 'YOU STILL HAVE A DOLLAR — YOU WIN!' : won === 0 ? 'OUT OF DOLLARS — YOU LOSE' : '', 20, 50, won === 0 ? '#f77' : '#fff');
  if (caption) font.caption(g, caption);
  window.__l7 = { ph, ix, dollars, won, real, price: Math.round(prod.price), idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
