// The final Showcase. Rules: tpir::showcase (Rust/WASM) ported from the retail exe (ShowcaseShowdownScreen: Bid or Pass, AI bid, outcome table, $250 double - engine/src/showcase.rs, docs/GHIDRA.md).
// Look: the game's own showcase stage (camera `camcloseupp01top02.cam` from the stage archive) with the screen-075 overlay (Bid / Pass / OK buttons from the widget tree, SSpodium art, five digit slots per podium at their real positions, the WinDoubleShowcase banner).
// The showcases are the product database's `showcase-prize-S-N-...-TOTAL` groups: entries that share a TOTAL form one showcase (S = which of the two sets).
import { StageView } from './stageview.js'; import { Audio } from './audio.js?v=3'; import { Font } from './font.js?v=2'; import { Reg, UI } from './ui.js';
const ex = (await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {})).instance.exports, exS = (await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {})).instance.exports; const mem = () => ex.memory.buffer;
const bytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer()); const idx = await (await fetch('zip-index.json')).json(); const DEG = Math.PI / 180;
const sv = new StageView(document.getElementById('stage3d'), exS); await sv.load(await bytes('stage/showcase/showcase_stage.dir'), await bytes('stage/showcase/showcase_stage.scn')); sv.loadLight('database/stage/showcase/spotlight.lgt');
const CAM = 'database/stage/showcase/camcloseupp01top02.cam'; const cv = document.getElementById('c'), g = cv.getContext('2d');
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 75).preload(); const au = new Audio(ex, idx); await au.addScreens([75, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const fid = Object.values(reg.by).find((e) => e.type === 1 && e.name === 'Ronnia-28-1-1')?.id; const big = (fid && await reg.font(fid)) || await Font.load(ex, 'zip/059/004162_0.GWFont');
const A = (n) => reg.img(Object.values(reg.by).find((e) => e.scr === 75 && e.type === 3 && e.name === n)?.id); const pod = [await A('SSpodium1'), await A('SSpodium2')], banner = await A('WinDoubleShowcase'), podGlow = await A('PodiumGlowLarge');
const T = (n) => reg.text(Object.values(reg.by).find((e) => e.scr === 75 && e.type === 5 && e.name === n)?.id) || n;
// the two showcases: one group from each set, grouped by their shared total
const all = (await (await fetch('products/all.json')).json()).filter((p) => /^showcase-prize-/.test(p.name)); const groups = { 1: {}, 2: {} };
for (const p of all) { const m = p.name.match(/^showcase-prize-(\d)-(\d+)-/); (groups[m[1]][Math.round(p.price)] ||= []).push({ ...p, n: +m[2] }); }
const pickGroup = (set) => { const ks = Object.keys(groups[set]); const k = ks[(Math.random() * ks.length) | 0]; return { total: +k, items: groups[set][k].sort((a, b) => a.n - b.n) }; };
const SH = [pickGroup(1), pickGroup(Object.keys(groups[2]).length ? 2 : 1)]; const imgs = await Promise.all(SH.map((s) => Promise.all(s.items.map(async (p) => createImageBitmap(await (await fetch(`products/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob())))));
ex.tp_scs_new((Math.random() * 2 ** 31) | 1, SH[0].total, SH[1].total);
for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock()); let caption = ''; au.onCaption = (t) => { caption = t; };
const ST = () => { const p = ex.tp_scs_state(); return new Float32Array(mem().slice(p, p + 4 * 16)); };
const pump = () => { const p = ex.tp_scs_events(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } };
const wait = (ms) => new Promise((r) => setTimeout(r, ms)); const until = async (f) => { for (;;) { if (f()) return; await wait(100); } }; const idle = () => !au.speaking && !au.speechQ.length;
// widgets used from the tree
const bidB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'ButtonBid')[0], passB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'ButtonPass')[0], okB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'OK')[0];
for (const n of ui.all.values()) { if (n.class === 'container') ui.show(n.inst); else if (n.class !== 'button') ui.hide(n.inst); } ui.hide(bidB.inst, passB.inst, okB.inst); ui.setText(bidB.inst, T('ButtonBid').toUpperCase()); ui.setText(passB.inst, T('ButtonPass').toUpperCase());
const DXL = [18, 62, 104, 147, 190], DXR = [302, 338, 374, 409, 444]; const digits = [0, 0, 0, 0, 0]; let editing = false, deciding = false, msg = '', shownBids = [false, false], doneFlag = false, itemTimer = 0, itemIdx = [0, 0], revealed = false, showItems = true;
const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; }; let ptr = { x: -1, y: -1 };
cv.onpointermove = (e) => { ptr = pt(e); };
const slots = (podIdx) => (podIdx === 0 ? DXL : DXR).map((x) => ({ x, y: podIdx === 0 ? 255 : 261, w: podIdx === 0 ? 44 : 42, h: podIdx === 0 ? 62 : 59 }));
cv.onpointerdown = (e) => { ptr = pt(e); const s = ST(); if (editing) { const mine = slots(s[1]); for (let i = 0; i < 5; i++) { const r = mine[i]; if (ptr.x >= r.x && ptr.x < r.x + r.w && ptr.y >= r.y && ptr.y < r.y + r.h) { digits[i] = (digits[i] + (ptr.y < r.y + r.h / 2 ? 1 : 9)) % 10; return; } } } ui.down = ui.hit(ptr.x, ptr.y); };
cv.onpointerup = (e) => { ptr = pt(e); const b = ui.hit(ptr.x, ptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
ui.handlers.set(bidB.inst, () => { if (!deciding) return; deciding = false; ui.hide(bidB.inst, passB.inst); ex.tp_scs_choose(1); }); ui.handlers.set(passB.inst, () => { if (!deciding) return; deciding = false; ui.hide(bidB.inst, passB.inst); ex.tp_scs_choose(0); });
ui.handlers.set(okB.inst, () => { if (!editing) return; editing = false; ui.hide(okB.inst); ex.tp_scs_bid(digits.reduce((a, d) => a * 10 + d, 0)); });
async function run() {
  await wait(300); pump(); await until(idle); showItems = false; msg = T('BidOrPass').replace('{player}', 'You'); deciding = true; ui.show(bidB.inst, passB.inst); await until(() => !deciding); msg = ''; pump();
  let s = ST(); showItems = false;
  for (let round = 0; round < 2; round++) { s = ST(); if (s[0] === 3) break;
    if (s[3] === 1) { msg = T('Bidding_a').replace('{player}', 'You'); await until(idle); editing = true; ui.show(okB.inst); await until(() => !editing); msg = ''; pump(); shownBids[0] = true; }
    else { await wait(1200); shownBids[1] = true; pump(); } await wait(600); }
  s = ST(); shownBids = [true, true]; pump(); await wait(900); revealed = true; await until(idle); await wait(2200); s = ST();
  window.__sc2 = { done: true, won: s[9] === 1, double: s[7] === 1, diff: s[9] === 1 ? s[10 + s[1]] - s[4] : null, totals: [s[10], s[11]], bids: [s[4], s[5]], prize: s[8] }; doneFlag = true;
}
function frame(now) {
  requestAnimationFrame(frame); pump(); const s = ST(); const cam = sv.camAt(CAM, 0);
  if (cam) sv.render({ eye: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]], fov: cam[6] * DEG, near: 1, far: 20000, time: now / 1000 });
  g.clearRect(0, 0, 800, 600); const humanPod = s[1], aiPod = s[2];
  for (let k = 0; k < 2; k++) { const x0 = k === 0 ? -3 : 272; if (pod[k]) g.drawImage(pod[k], x0, 253, 240, 292); const mine = humanPod === k; const bid = mine ? (editing ? null : (shownBids[0] ? s[4] : -1)) : (shownBids[1] ? s[5] : -1); const rects = slots(k);
    const label = k === 0 ? T('Showcase1') : T('Showcase2'); font.draw(g, label.toUpperCase(), (k === 0 ? 51 : 323) + 72 - font.width(label.toUpperCase()) / 2, 358, '#fff');
    const val = mine && editing ? digits : (bid >= 0 ? String(Math.round(bid)).padStart(5, '0').split('').map(Number) : null);
    rects.forEach((r, i) => { if (val) { const t = String(val[i]); big.draw(g, t, r.x + (r.w - big.width(t)) / 2, r.y + r.h - 12, revealed && !mine && false ? '#fff' : '#fff'); if (mine && editing) { g.fillStyle = '#ffd84a'; g.font = '12px system-ui'; g.fillText('▲', r.x + r.w / 2 - 5, r.y - 3); g.fillText('▼', r.x + r.w / 2 - 5, r.y + r.h + 13); } } });
    if (revealed) { const total = s[10 + k]; const t = '$' + Math.round(total).toLocaleString('en-US'); big.draw(g, t, (k === 0 ? 118 : 390) - big.width(t) / 2, 330, '#ffd84a'); const over = (mine ? s[4] : s[5]) > total; if (over) font.draw(g, T('Over'), (k === 0 ? 118 : 390) - font.width(T('Over')) / 2, 300, '#f77'); }
    if (editing && mine && podGlow) { g.save(); g.globalAlpha = 0.7; g.drawImage(podGlow, x0 - 15, 253, 270, 120); g.restore(); } }
  // the items of the showcases (the product images the game shows one after another)
  if (showItems || !revealed) { const si = (Math.floor(now / 3500)) % 2; const it = imgs[si]; const j = Math.floor(now / 1750) % it.length; const im = it[j]; const sc = Math.min(250 / im.width, 190 / im.height); g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(530, 60, 250, 190); g.drawImage(im, 530 + (250 - im.width * sc) / 2, 60 + (190 - im.height * sc) / 2, im.width * sc, im.height * sc); font.draw(g, T(si === 0 ? 'Showcase1' : 'Showcase2').toUpperCase() + `  ${j + 1}/${it.length}`, 535, 52, '#fff'); }
  if (revealed && s[7] === 1 && banner) { g.drawImage(banner, 64, 140, 670, 317 * 0.6); }
  if (revealed) { const won = s[9] === 1; const t = s[6] === 3 ? T('TwoWinner') : won ? (s[7] ? T('DoubleShowcaseWinner') : T('Winner')) : T('Lose'); big.draw(g, t.slice(0, 40), 400 - big.width(t.slice(0, 40)) / 2, 120, won ? '#7f7' : '#f77'); }
  if (msg) { const m = msg.length > 76 ? msg.slice(0, 76) : msg; g.fillStyle = 'rgba(0,0,0,.7)'; g.fillRect(0, 480, 800, 36); font.draw(g, m, 400 - font.width(m) / 2, 504, '#ffd84a'); }
  ui.draw(g, ptr.x, ptr.y, 'btn'); if (caption) font.caption(g, caption);
  if (!doneFlag) window.__sc2 = { done: false, editing, deciding, state: Array.from(s) };
}
requestAnimationFrame(frame); window.__ready = true; run();
