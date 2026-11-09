// Clock Game on the original screen 033 art; logic from tpir::clockgame (Rust/WASM).
import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=2'; import { retail } from './retail.js'; import { Sprite, decodeJ32 } from './video.js'; import { Reg, UI } from './ui.js';
import { changeClockDigit } from './clock-input.js?v=1';
import { clockMediaGate } from './clock-media.js?v=4';
import { ClockPrizeView } from './clock-prize.js?v=1';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const jb = new Uint8Array(await (await fetch('zip/033/GWScreen')).arrayBuffer()); const jp = ex.tp_screen_json(put(jb), jb.length); const m8 = new Uint8Array(mem()); let je = jp; while (m8[je]) je++;
const S = JSON.parse(new TextDecoder().decode(m8.slice(jp, je))); const byName = Object.fromEntries(S.entries.filter((e) => e.type === 3).map((e) => [e.name, e.id]));
const im = {}; for (const [n, id] of Object.entries(byName)) { const f = idx[id]; if (!f) continue; const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); im[n] = await (f.endsWith('.j32') ? decodeJ32(b) : createImageBitmap(new Blob([b]))).catch(() => null); }
const reg=await Reg.load(ex,idx), ui=await new UI(reg,33).preload(), digits=await Sprite.load(ex,'zip/033/001865_0.GWVideo');
const digitContainer = ui.all.get('492255b4');
const digitBoxes = ['92bf7d1e','2d114d16','c6d898e0','de0e7e0b'].map(id => {
  const n = ui.all.get(id); return { x: digitContainer.x + n.x, y: digitContainer.y + n.y, w: n.w, h: n.h };
});
const background = await reg.img(0x0b63), prizeFrame = await reg.img(0x101d);
for (const n of ui.all.values()) if (n.class==='container') ui.show(n.inst); else ui.hide(n.inst);
const actionId='efd3bdf6';
const au = new Audio(ex, idx); await au.addScreens([33, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
// 0x4ad610 requests category 1 of the Clock Game product script.
const pick = (await retail()).take('ClockGame', 1);
const productSpeech = pick.map(p => au.addProduct(p));
const prizeVideo = document.createElement('video'); prizeVideo.muted = true; prizeVideo.playsInline = true; prizeVideo.preload = 'auto';
const prizeView = new ClockPrizeView();
let caption = '', productCaption = false, captionStart = 0;
const prizeGate = clockMediaGate({
  video: prizeVideo, audio: au, advance: () => ex.tp_ck_act(10, 0),
  onRelease: () => { if (productCaption && !au.speaking) { caption = ''; productCaption = false; } },
});
au.onSpeechStart = name => {
  const i = productSpeech.indexOf(name); if (i < 0) return;
  prizeView.present(i); captionStart = performance.now();
  prizeGate.start(`retail-video/Product_${String(pick[i].id).padStart(6,'0')}.mp4`, pick[i].en.length * 50);
};
au.onSpeechEnd = name => { if (productSpeech.includes(name)) prizeGate.deferNextSpeech(); };
window.__disposeSegment = () => prizeGate.dispose();
const pimg = await Promise.all(pick.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())));
ex.tp_ck_new(pick[0].price, pick[1].price);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock());
au.onIdle = () => {
  if (statePhase() !== 0 || !prizeGate.wait()) ex.tp_ck_act(10, 0);
};
au.onCaption = (t, timing) => {
  if (!t && productCaption && prizeGate.pending()) return;
  caption = t; productCaption = !!t && productSpeech.includes(timing?.name);
};
au.skipButton?.addEventListener('click', () => { caption = ''; productCaption = false; });
const ST = () => { const p = ex.tp_ck_state(); return new Float32Array(mem().slice(p, p + 20)); };
const statePhase = () => ST()[0];
let bid=[0,0,0,0], ptr={x:-1,y:-1}, lastItem=0;
const point=e=>{const r=cv.getBoundingClientRect();return {x:(e.clientX-r.left)*800/r.width,y:(e.clientY-r.top)*600/r.height};};
cv.onpointermove=e=>{ptr=point(e);};
cv.onpointerdown=e=>{ptr=point(e);ui.down=ui.hit(ptr.x,ptr.y);};
cv.onpointerup=e=>{ptr=point(e); const b=ui.hit(ptr.x,ptr.y), down=ui.down; ui.down=null; const s=ST();
  if(b && b===down && b.inst===actionId) { if(s[0]===1 && (au.speaking || au.speechQ.length || prizeGate.pending())) return; if(s[0]===1) ex.tp_ck_act(0,0); else if(s[0]===2) ex.tp_ck_act(1,Number(bid.join(''))); return; }
  if(s[0]===2) changeClockDigit(bid,ptr.x,ptr.y,digitBoxes);
};
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.max(0, now - last); last = now; ex.tp_ck_tick(dt); const s = ST(); const [ph, item, left, hint, prizes] = s;
  { const p = ex.tp_ck_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const name = new TextDecoder().decode(m.slice(o, e)); au.say(name); if (name === 'Speech_ClockGame_Reveal-1_A') au.say(productSpeech[0]); if (name === 'Speech_ClockGame_Reveal-2_A') au.say(productSpeech[1]); o = e + 1; } } }
  prizeView.update(ph, item);
  if(item!==lastItem) { bid=[0,0,0,0]; lastItem=item; }
  g.fillStyle = '#123'; g.fillRect(0, 0, 800, 600);
  if (background) g.drawImage(background, -4, 0, 946, 588);
  if (im.ClockGameMain) g.drawImage(im.ClockGameMain, 0, 0, 900, 1100);
  if (im.ClockGameClockFace) g.drawImage(im.ClockGameClockFace, 303, 149, 184, 184);
  if (im.CLockGameClockPointer) {
    // FUN_004accf0 schedules -180 degrees over 45,000 ms. Canvas has a
    // downward-positive Y axis, so the corresponding clockwise sweep is positive.
    g.save(); g.translate(395, 241); g.rotate(Math.PI * (1 - left / 45000));
    const pw = im.CLockGameClockPointer.width, ph = im.CLockGameClockPointer.height;
    g.drawImage(im.CLockGameClockPointer, -pw / 2, -ph, pw, ph); g.restore();
  }
  if (prizeFrame) g.drawImage(prizeFrame, 98, 168, 176, 150);
  if (prizeView.visible) {
    const pi = pimg[prizeView.product];
    const media = prizeGate.showingVideo() ? prizeVideo : pi;
    const w = media.videoWidth || media.width, h = media.videoHeight || media.height, sc = Math.min(158 / w, 133 / h);
    g.drawImage(media, 108 + (158 - w * sc) / 2, 178 + (133 - h * sc) / 2, w * sc, h * sc);
  }
  if(ph===1 || ph===2) { ui.show(actionId); ui.setText(actionId,ph===1?'START':'BID'); } else ui.hide(actionId);
  if(ph===2) bid.forEach((n,i)=>{const b=digitBoxes[i]; digits.frame(g,n,b.x,b.y,b.w,b.h);});
  ui.draw(g,ptr.x,ptr.y,'btn');
  if (caption) {
    const visible = productCaption ? caption.slice(0, Math.floor((now - captionStart) / 50)) : caption;
    if (visible) font.caption(g, visible);
  }
  window.__ck = { ph, item, left, hint, prizes, real: pick.map((p) => Math.round(p.price)), idle: !au.speaking && !au.speechQ.length };
}
requestAnimationFrame(frame); window.__ready = true;
