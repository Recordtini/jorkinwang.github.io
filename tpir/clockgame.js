// Clock Game on the original screen 033 art; logic from tpir::clockgame (Rust/WASM).
import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=2'; import { retail } from './retail.js'; import { Sprite, decodeJ32 } from './video.js'; import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/033/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); im[n] = await (f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b]))).catch(() => null); }
const reg=await Reg.load(ex,idx), ui=await new UI(reg,33).preload(), digits=await Sprite.load(ex,'zip/033/001865_0.GWVideo');
for (const n of ui.all.values()) if (n.class==='container') ui.show(n.inst); else ui.hide(n.inst);
const actionId='efd3bdf6';
const au = new Audio(ex, idx); await au.addScreens([33, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
// 0x4ad610 requests category 1 of the Clock Game product script.
const pick = (await retail()).take('ClockGame', 1);
const productSpeech = pick.map(p => au.addProduct(p));
let presentedProduct = -1;
au.onSpeechStart = name => { const i = productSpeech.indexOf(name); if (i >= 0) presentedProduct = i; };
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_ck_new(pick[0].price, pick[1].price);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); au.onIdle = () => ex.tp_ck_act(10, 0);
let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_ck_state(); return new Float32Array(mem().slice(p, p + 20)); };
let bid=[0,0,0,0], ptr={x:-1,y:-1}, lastItem=0;
const point=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height};};
cv.onpointermove=e=>{ptr=point(e);};
cv.onpointerdown=e=>{ptr=point(e);ui.down=ui.hit(ptr.x,ptr.y);};
cv.onpointerup=e=>{ptr=point(e); const b=ui.hit(ptr.x,ptr.y), down=ui.down; ui.down=null; const s=ST();
  if(b && b===down && b.inst===actionId) { if(s[0]===1 && (au.speaking || au.speechQ.length)) return; if(s[0]===1) ex.tp_ck_act(0,0); else if(s[0]===2) ex.tp_ck_act(1,Number(bid.join(''))); return; }
  if(s[0]!==2) return; for(let i=0;i<4;i++) { const x=235+i*90; if(ptr.x>=x && ptr.x<x+80 && ptr.y>=344 && ptr.y<424) { bid[i]=(bid[i]+(ptr.y<384?1:9))%10; return; } }
};
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.max(0, now - last); last = now; ex.tp_ck_tick(dt); const s = ST(); const [ph, item, left, hint, prizes] = s;
  { const p = ex.tp_ck_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const name = new TextDecoder().decode(m.slice(o, e)); au.say(name); if (name === 'Speech_ClockGame_Reveal-1_A') au.say(productSpeech[0]); if (name === 'Speech_ClockGame_Reveal-2_A') au.say(productSpeech[1]); o = e + 1; } } }
  if(item!==lastItem) { bid=[0,0,0,0]; lastItem=item; }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600); if (im.ClockGameMain) g.drawImage(im.ClockGameMain, 0, 0, 800, 600);
  if (presentedProduct >= 0 || ph >= 2) { const pi = pimg[presentedProduct >= 0 ? presentedProduct : Math.min(item, 1)]; const sc = Math.min(260 / pi.width, 200 / pi.height); g.drawImage(pi, 270 + (260 - pi.width * sc) / 2, 90, pi.width * sc, pi.height * sc); }
  // Provisional clock rendering; the original face and timing animation need verification.
  const cx = 130, cy = 130, R = 90; g.fillStyle = '#f4f4f4'; g.beginPath(); g.arc(cx, cy, R, 0, 7); g.fill(); g.strokeStyle = '#123'; g.lineWidth = 6; g.stroke();
  const a = -Math.PI / 2 + (1 - left / 45000) * 2 * Math.PI; g.strokeStyle = '#d22'; g.lineWidth = 5; g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * (R - 12), cy + Math.sin(a) * (R - 12)); g.stroke();
  font2.draw(g, (left / 1000).toFixed(1) + ' s', 60, 260, '#fff'); font.draw(g, 'Prizes: ' + prizes + ' / 2', 60, 290, '#fc4');
  font2.draw(g, ph === 2 ? (hint === 1 ? 'HIGHER' : hint === -1 ? 'LOWER' : 'Enter your bid') : ph === 3 ? 'YOU WON BOTH PRIZES + $1000!' : ph === 4 ? "TIME'S UP!" : '', 40, 60, ph === 4 ? '#f77' : '#fff');
  if(ph===1 || ph===2) { ui.show(actionId); ui.setText(actionId,ph===1?'START':'BID'); } else ui.hide(actionId);
  if(ph===2) bid.forEach((n,i)=>digits.frame(g,n,235+i*90,344,80,80));
  ui.draw(g,ptr.x,ptr.y,'btn');
  if (caption) font.caption(g, caption);
  window.__ck = { ph, item, left, hint, prizes, real: pick.map((p) => Math.round(p.price)), idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
