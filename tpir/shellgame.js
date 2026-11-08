// Shell Game on the original screen 055 art (layout from the GWScreen widget tree), logic from tpir::shellgame (Rust/WASM).
import { Audio } from './audio.js?v=2'; import { Font } from './font.js?v=2';
import { retail } from './retail.js';
import { decodeJ32 } from './video.js';
import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/055/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); im[n] = await (f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b]))).catch(() => null); }
const bg = idx[0x0b63] ? await (async () => { const f=idx[0x0b63], b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); return f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b])); })() : null;
const reg = await Reg.load(ex, idx), ui = await new UI(reg, 55).preload();
const higherButton=ui.buttons('Higher')[0], lowerButton=ui.buttons('Lower')[0];
for (const n of ui.all.values()) if (n.class !== 'container' && n !== higherButton && n !== lowerButton) ui.hide(n.inst);
ui.handlers.set(higherButton.inst,()=>ex.tp_sg_act(0)); ui.handlers.set(lowerButton.inst,()=>ex.tp_sg_act(1));
const au = new Audio(ex, idx); await au.addScreens([55, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
// The retail script supplies a four-item pricing tuple; preserve its membership and order.
const pick = (await retail()).take('ShellGame', 1);
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_sg_new((Math.random() * 2 ** 31) | 1, pick[0].price, pick[1].price, pick[2].price, pick[3].price, 5000);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_sg_act(2);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_sg_state(); const f = new Float32Array(mem().slice(p, p + 4 * 80)); return f; };
const SHELL = [[183, 104, 88, 90], [270, 104, 86, 91], [358, 103, 84, 93], [443, 103, 84, 91]];   // widget rects from the layout
const BTN = { higher: [204, 28, 150, 70], lower: [204, 131, 150, 70] };
let shuffleStart = null, lastSwap = -1, last = performance.now(), ptr={x:-1,y:-1};
const hit = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const point=e=>{ const r=cv.getBoundingClientRect(); return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height}; };
cv.onpointermove=e=>{ptr=point(e);};
cv.onpointerup=e=>{ptr=point(e);const b=ui.hit(ptr.x,ptr.y);if(b && b===ui.down) ui.handlers.get(b.inst)?.();ui.down=null;};
cv.onpointerdown = (e) => { ptr=point(e); const {x,y}=ptr; const s = ST();
  if (s[0] === 2) { ui.down=ui.hit(x,y); }
  else if (s[0] === 4) SHELL.forEach((r2, i) => { if (hit(x, y, r2)) ex.tp_sg_act(10 + i); });
  else if (s[0] === 7) SHELL.forEach((r2, i) => { if (hit(x, y, r2)) ex.tp_sg_act(20 + i); }); };
function frame(now) {
  requestAnimationFrame(frame); const dt = now - last; last = now; const s = ST(); const ph = s[0];
  { const p = ex.tp_sg_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const nm = new TextDecoder().decode(m.slice(o, e)); if (nm.startsWith('Sfx_')) au.sfx(nm); else au.say(nm); o = e + 1; } } }
  if (ph === 5 && shuffleStart === null && !au.speaking && !au.speechQ.length) shuffleStart = now;
  const elapsed = shuffleStart === null ? -1 : now - shuffleStart;
  if (ph === 5 && elapsed >= 0) { const step=Math.min(3,Math.floor(elapsed/1200)); if (step!==lastSwap) { lastSwap=step; au.sfx(`Sfx_ShellGame_Swap_Alt${1+Math.floor(Math.random()*3)}`); } if (elapsed>=4800) { ex.tp_sg_act(3); shuffleStart=null; } }
  if (ph === 6 && s[4] === 0 && !au.speaking && !au.speechQ.length) ex.tp_sg_act(4);
  const placed = [s[7], s[8], s[9], s[10]]; const shown = s[11], real = s[12];
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); g.save(); g.beginPath(); g.rect(0, 0, 800, 600); g.clip();
  if (bg) g.drawImage(bg, 0, 0, 946, 600); if (im.board) g.drawImage(im.board, 0, 141, 693, 346);
  // product and false price while guessing
  if (ph >= 2 && ph <= 3 && s[1] < 4) { const pi = pimg[s[1]]; const sc = Math.min(240 / pi.width, 200 / pi.height); g.drawImage(pi, 470, 250, pi.width * sc, pi.height * sc); font2.draw(g, '$' + Math.round(shown).toLocaleString('en-US'), 480, 500, '#ffd84a'); }
  // shells
  SHELL.forEach((r, i) => { const up = !!s[22+i]; const lift = up ? 40 : 0; if (im.Ball && Math.round(s[3]) === i && up) g.drawImage(im.Ball, r[0] + r[2] / 2 - 10, r[1] + r[3] + 4, 20, 24);
    let x=r[0]; if(ph===5 && elapsed>=0 && elapsed<4800) { const step=Math.floor(elapsed/1200), a=s[14+step*2], b=s[15+step*2], other=i===a?b:i===b?a:-1; if(other>=0) x+=(SHELL[other][0]-x)*Math.min(1,(elapsed-step*1200)/1000); }
    if (im.Shell) g.drawImage(im.Shell, x, r[1] - lift, r[2], r[3]); if (placed[i] && im.Chip) g.drawImage(im.Chip, r[0] + r[2] / 2 - 18, r[1] + r[3] + 28, 36, 38); });
  const lab = ['', '', 'HIGHER or LOWER?', 'Chip!', 'Place your chips', 'Shuffling…', 'Revealing…', 'Bonus: pick the ball!', s[5] ? 'You win the prize!' : 'Sorry!'][ph] || ''; font2.draw(g, lab, 20, 270, '#fff');
  font.draw(g, 'Chips: ' + s[2], 20, 300, '#fc4');
  if (ph === 2) ui.show(higherButton.inst,lowerButton.inst); else ui.hide(higherButton.inst,lowerButton.inst);
  ui.draw(g,ptr.x,ptr.y,'btn');
  g.restore(); if (caption) font.caption(g, caption);
  window.__sg = { ph, chips: s[2], ball: s[3], won: s[5], item: s[1], real, shown };
}
requestAnimationFrame(frame); window.__ready = true;
