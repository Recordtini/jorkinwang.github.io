// Contestants' Row. Rules: tpir::row (Rust/WASM), ported from the retail code (engine/src/row.rs, docs/GHIDRA.md). Look: the game's own two 3D stages (crowd/drapes behind, boxes + microphones in front,
// camera `camera_contestantrow_4_3.cam` from the stage archive) with the screen-026 overlay on top (OK button from the widget tree, four digit slots at their real positions; click the upper half of a digit to raise it, the lower half to lower it).
import { StageView } from './stageview.js?v=5'; import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=3'; import { Reg, UI } from './ui.js?v=2'; import { Sprite } from './video.js';
import { retail } from './retail.js';
const inst = async () => (await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {})).instance.exports;
const ex = await inst(), exF = await inst(), exB = await inst(); const mem = () => ex.memory.buffer;
const bytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer()); const idx = await (await fetch('zip-index.json')).json();
const CAM = 'database/stage/contestantrowtest/camera_contestantrow_4_3.cam'; const DEG = Math.PI / 180;
const back = new StageView(document.getElementById('back'), exB), front = new StageView(document.getElementById('front'), exF, { transparent: true });
await back.load(await bytes('stage/contestantrowtest/constestantrow_crowdavatars_stage.dir'), await bytes('stage/contestantrowtest/constestantrow_crowdavatars_stage.scn')); back.loadLight('database/stage/contestantrowtest/spotlight.lgt');
await front.load(await bytes('stage/contestantrowtest/constestantrow_front_stage.dir'), await bytes('stage/contestantrowtest/constestantrow_front_stage.scn')); front.loadLight('database/stage/contestantrowtest/spotlight.lgt');
const cv = document.getElementById('c'), g = cv.getContext('2d');
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 26).preload();
const au = new Audio(ex, idx); await au.addScreens([26, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const fid = Object.values(reg.by).find((e) => e.type === 1 && e.name === 'Ronnia-28-1-1')?.id; const big = (fid && await reg.font(fid)) || await Font.load(ex, 'zip/059/004162_0.GWFont');
const prizeFrame = await reg.img(0x101d);
const glow = await reg.img(Object.values(reg.by).find((e) => e.scr === 26 && e.name === 'CR_GlowLarge')?.id); const slot = await Sprite.load(ex, 'zip/026/002396_0.GWVideo');
const T = (n) => reg.text(Object.values(reg.by).find((e) => e.scr === 26 && e.type === 5 && e.name === n)?.id) || n;
// the screen tree: only the OK button is drawn from it (the rest are 3D views / runtime-bound images drawn below)
for (const n of ui.all.values()) if (n.class !== 'container' && !(n.class === 'button')) ui.hide(n.inst); const okB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'OK')[0]; ui.hide(okB.inst);
const [prod] = (await retail()).take('ContestantsRow', 0); const real = Math.ceil(prod.price);
const productId = String(prod.id).padStart(6, '0');
const pimg = await createImageBitmap(await (await fetch(`products/Product_${productId}.jpg`)).blob());
const prizeVideo = document.createElement('video'); prizeVideo.muted = true; prizeVideo.playsInline = true; prizeVideo.preload = 'auto';
prizeVideo.src = `retail-video/Product_${productId}.mp4`; prizeVideo.load();
let prizeVisible = false, videoStarted = false;
ex.tp_row_new((Math.random() * 2 ** 31) | 1, real);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); let caption = '', captionStart = 0, captionDuration = 0;
au.onCaption = (t, timing) => { caption = t; captionStart = performance.now(); captionDuration = timing?.duration || 0; };
au.onSpeechStart = (name) => {
  if (name.startsWith('Speech_ContestantsRow_ItemReveal_')) prizeVisible = true;
  if (name === productSpeech) { prizeVisible = true; videoStarted = true; prizeVideo.currentTime = 0; prizeVideo.play().catch(() => { videoStarted = false; }); }
};
const ST = () => { const p = ex.tp_row_state(); return new Float32Array(mem().slice(p, p + 4 * 20)); };
const pump = () => { const p = ex.tp_row_events(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const name = new TextDecoder().decode(m.slice(o, e)); au.say(name); if (name.startsWith('Speech_ContestantsRow_ItemReveal_')) au.say(productSpeech); o = e + 1; } };
let disposed = false; window.__disposeSegment = () => { disposed = true; prizeVideo.pause(); prizeVideo.removeAttribute('src'); prizeVideo.load(); };
const idle = () => !au.speaking && !au.speechQ.length; const wait = (ms) => new Promise((resolve, reject) => setTimeout(() => disposed ? reject(new Error('row disposed')) : resolve(), ms));
const productSpeech = au.addProduct(prod);
const SIGN = [25, 222, 417, 613], DX = [26, 63, 101, 139], DY = 388, DW = 46, DH = 59; const digits = [0, 0, 0, 0]; let editing = false, msg = '', shown = [false, false, false, false], revealed = false, done = false, lastShow = 0;
const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; }; let ptr = { x: -1, y: -1 };
cv.onpointermove = (e) => { ptr = pt(e); };
cv.onpointerdown = (e) => { ptr = pt(e); if (editing) { for (let i = 0; i < 4; i++) { const x = DX[i]; if (ptr.x >= x && ptr.x < x + DW && ptr.y >= DY - 20 && ptr.y < DY + DH + 20) { digits[i] = (digits[i] + (ptr.y < DY + DH / 2 ? 1 : 9)) % 10; return; } } } ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = (e) => { ptr = pt(e); const b = ui.hit(ptr.x, ptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
ui.handlers.set(okB.inst, () => { if (!editing) return; const v = digits.reduce((a, d) => a * 10 + d, 0); const r = ex.tp_row_bid(v); if (r === 1) { msg = T('OnOKErrorOverbid').replace('{highestPossiblePrice}', '$' + Math.round(ST()[9]).toLocaleString('en-US')); } else if (r === 2) { msg = T('OnOKErrorBidSame'); pump(); } else { msg = ''; editing = false; ui.hide(okB.inst); } });
// pacing of the round: AI bids are computed by the engine at once; they are revealed one by one in bidding order
async function run() {
  await wait(300); pump(); await until(idle); for (;;) {
    ex.tp_row_ai(); pump(); shown = [false, false, false, false]; let s = ST(); const order = [0, 1, 2, 3].map((k) => (s[1] + k) % 4);
    for (const seat of order) { s = ST(); if (seat === 0 && s[4] === 1 && !s[8] && s[0] === 0) { au.say('Speech_ContestantsRow_TurnToBid_a_A'); msg = T('HumanBidder'); editing = true; ui.show(okB.inst); await until(() => !editing); msg = ''; s = ST(); }
      s = ST(); if (!shown[seat] && s[(s[8] ? 16 : 12) + seat] > 0) { await wait(900); shown[seat] = true; } }
    s = ST(); if (s[8] === 1) { pump(); msg = T('RowResultsOver'); await until(idle); await wait(2500); msg = ''; digits.fill(0); ex.tp_row_restart(); pump(); continue; } if (s[0] === 1) break;
  }
  pump(); revealed = true; await wait(600); await until(idle); await wait(1500); const s = ST(); const win = s[5], bid = s[12 + win];
  window.__cr = { done: true, won: win === 0, bonus: s[7], diff: win === 0 ? real - bid : null, price: real, prize: prod.en, name: prod.name }; done = true;
}
const until = async (f) => { while (!disposed) { if (f()) return; await wait(100); } throw new Error('row disposed'); };
function frame() {
  if (disposed) return; requestAnimationFrame(frame); const s = ST();
  // The retail camera ends at frame 50, facing the podiums head-on. Frame 0
  // is the start of its move and does not align with screen 026's bid widgets.
  const cam = back.camAt(CAM, 50);
  if (cam) { for (const sv of [back, front]) sv.render({ eye: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]], fov: cam[6] * DEG, near: 5, far: 20000, cull: sv !== back, additiveFilter: sv===back ? d=>/lightanim/i.test(d.mn) : null, alphaBlend: sv===back, transparentSort: sv===back, time: performance.now() / 1000 }); }
  g.clearRect(0, 0, 800, 600); const offset = s[8] ? 16 : 12; const bids = [s[offset], s[offset+1], s[offset+2], s[offset+3]]; const winner = s[5], cur = s[3];
  if (prizeVisible) {
    // Screen 059's ProductWindow_Background, placed to match the retail footage.
    const x = 530, y = 25, w = 240, h = 205;
    if (prizeFrame) g.drawImage(prizeFrame, x, y, w, h);
    else { g.fillStyle = '#ddd'; g.fillRect(x, y, w, h); }
    const media = videoStarted && prizeVideo.readyState >= 2 ? prizeVideo : pimg;
    g.drawImage(media, x + 13, y + 12, w - 26, h - 24);
  }
  for (let i = 0; i < 4; i++) {
    const x0 = SIGN[i];
    const val = i === 0 && editing ? digits : (shown[i] && bids[i] > 0 ? String(bids[i]).padStart(4, '0').split('').map(Number) : null);
    for (let k = 0; k < 4; k++) { const x = x0 + (DX[k] - 26) + 1; if (val) { const t = String(val[k]); big.draw(g, t, x + (DW - big.width(t)) / 2, DY + 42, revealed && winner === i ? '#7f7' : revealed && bids[i] > real ? '#f77' : '#fff'); } else if (i === 0 && editing) { /* digits drawn above */ }
      if (slot && (i === 0 && editing)) slot.frame(g, 0, x - 2, DY - 3, DW + 4, DH + 6); }
    if (i === 0 && editing) { for (let k = 0; k < 4; k++) { g.fillStyle = '#ffd84a'; g.font = '12px system-ui'; g.fillText('▲', DX[k] + 18, DY - 6); g.fillText('▼', DX[k] + 18, DY + DH + 13); } }
    if (glow && !revealed && ((i === cur && !s[8]) || (i === 0 && editing))) { g.save(); g.globalAlpha = 0.8; g.drawImage(glow, x0 - 15, 380, 189, 73); g.restore(); }
    if (revealed && winner === i && glow) { g.save(); g.drawImage(glow, x0 - 15, 380, 189, 73); g.restore(); }
    font.draw(g, i === 0 ? 'YOU' : `CONTESTANT ${i + 1}`, x0 + 80 - font.width(i === 0 ? 'YOU' : `CONTESTANT ${i + 1}`) / 2, 380, '#cfd8ff'); }
  if (revealed) { const t = 'ACTUAL PRICE $' + real.toLocaleString('en-US'); big.draw(g, t, 400 - big.width(t) / 2, 300, '#ffd84a'); if (s[6]) font.draw(g, 'EXACT BID! +$500', 335, 330, '#7f7'); }
  if (msg) { const m = msg.length > 70 ? msg.slice(0, 70) : msg; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 490, 800, 36); font.draw(g, m, 400 - font.width(m) / 2, 514, '#ffd84a'); }
  ui.draw(g, ptr.x, ptr.y, 'btn');
  if (caption) font.retailCaption(g, caption, captionDuration ? Math.min(1, (performance.now() - captionStart) / (captionDuration * 1000)) : 1);
  if (!done) window.__cr = { done: false, real, bids, editing, shown: shown.slice(), state: Array.from(s) };
}
window.__sv = { back, front, CAM }; requestAnimationFrame(frame); window.__ready = true; run().catch(e => { if (!disposed) console.error(e); });
