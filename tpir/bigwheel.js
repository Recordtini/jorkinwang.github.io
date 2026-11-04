// Big Wheel: the real stage + wheel model driven by the Rust game logic (tpir::bigwheel).
import { StageView } from './stageview.js';
import { Audio } from './audio.js'; import { Font } from './font.js'; import { Reg, UI } from './ui.js';
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const cv = document.getElementById('c'); const sv = new StageView(cv, ex);
const bytes = async (u) => new Uint8Array(await (await fetch(u)).arrayBuffer());
const idx = await (await fetch('zip-index.json')).json(); const au = new Audio(ex, idx); await au.addScreens([2, 6, 3]);
let caption = ''; au.onCaption = (t) => { caption = t; };
// HUD = the game's own wheel screen (002): right-hand player panel with the ScoreBoard (score shown as d.dd: the Showdown is "closest to $1.00"), Spin / Stay buttons, Reflex_Detail glare
const reg = await Reg.load(ex, idx); const ui = await new UI(reg, 2).preload(); const hud = document.getElementById('hud2').getContext('2d'); const font = await Font.load(ex, 'zip/059/004161_0.GWFont');
const fid = Object.values(reg.by).find((e) => e.type === 1 && e.name === 'Ronnia-28-1-1')?.id; const big = (fid && await reg.font(fid)) || await Font.load(ex, 'zip/059/004162_0.GWFont');
const IM = async (n) => reg.img((Object.values(reg.by).find((e) => e.scr === 2 && e.type === 3 && e.name === n) || Object.values(reg.by).find((e) => e.type === 3 && e.name === n))?.id); const imScore = await IM('ScoreBoard'), imWin = await IM('TPIR_PlayerWindow_Avatar'), imReflex = await IM('Reflex_Detail'), imPoint = await IM('WheelDigitPoint');
for (const n of ui.all.values()) if (n.class !== 'container' && n.class !== 'button') ui.hide(n.inst); for (const n of ui.all.values()) if (n.class === 'container') ui.show(n.inst);
const spinB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'Spin')[0], stayB = ui.find((n) => n.class === 'button' && reg.by[n.text]?.name === 'Stay')[0];
let hptr = { x: -1, y: -1 }; const hpt = (e) => { const r = hud.canvas.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
hud.canvas.onpointermove = (e) => { hptr = hpt(e); }; hud.canvas.onpointerdown = (e) => { hptr = hpt(e); ui.down = ui.hit(hptr.x, hptr.y); }; hud.canvas.onpointerup = (e) => { hptr = hpt(e); const b = ui.hit(hptr.x, hptr.y); if (b && b === ui.down) { const h = ui.handlers.get(b.inst); if (h) h(); } ui.down = null; };
ui.handlers.set(spinB.inst, () => { const ph = window.__bw && window.__bw.phase; ex.tp_bw_act(ph === 2 ? 1 : 0); }); ui.handlers.set(stayB.inst, () => ex.tp_bw_act(2));
for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => au.unlock(), { once: false });
await sv.load(await bytes('stage/bigwheel/bigwheel_stage.dir'), await bytes('stage/bigwheel/bigwheel_stage.scn')); sv.loadLight('database/stage/bigwheel/spotlight.lgt');
const q = new URLSearchParams(location.hash.slice(1));
const players = +(q.get('humans') ?? 1), ais = +(q.get('ais') ?? 2); ex.tp_bw_new((Math.random() * 2 ** 31) | 1, players, ais);
const CAM = 'database/stage/bigwheel/camera.cam';
const PH = ['spin', 'spinning', 'choose', 'bonus', 'bonus spinning', 'tie-break', 'over'];
const CENTER = [0, 2.3, 0]; const DEG = Math.PI / 180;
let wheelAngle = (+q.get('angle') || 0) * DEG;                    // radians about the wheel's X axis
const S = () => { const p = ex.tp_bw_state(); return new Float32Array(mem().slice(p, p + 4 * 7 + 16 * 8)); };
let last = performance.now();
function frame(now) {
  requestAnimationFrame(frame); const dt = Math.min(now - last, 100); last = now; ex.tp_bw_tick(dt);
  { const p = ex.tp_bw_events(); if (p) { const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; const nm = new TextDecoder().decode(m.slice(o, e)); if (nm.startsWith('Sfx_')) au.sfx(nm); else au.say(nm); o = e + 1; } } }
  const s = S(); const phase = s[0], cur = s[1], pos = s[2], speed = s[3], win = s[4], n = s[5];
  const ang = q.has('angle') ? wheelAngle : -(pos * 18 + 9) * DEG;     // slot k is centred on the pointer at -(k*18+9) deg (verified against the model)
  const c = Math.cos(ang), sn = Math.sin(ang);
  const R = new Float32Array([1,0,0,0, 0,c,sn,0, 0,-sn,c,0, 0,0,0,1]);               // rotation about X (row-vector convention)
  const cam = sv.camAt(CAM, 0);
  sv.render({ time: now / 1000, eye: [cam[0], cam[1], cam[2]], target: [cam[3], cam[4], cam[5]], fov: cam[6] * DEG,
    xform: (d) => d.tn.includes('/wheel_') || d.tn.includes('wheel_') ? R : null });
  const mine = s[1] === 0; const canSpin = mine && (phase === 0 || phase === 2 || phase === 3 || phase === 5), canStay = mine && phase === 2;
  ui[canSpin ? 'show' : 'hide'](spinB.inst); ui[canStay ? 'show' : 'hide'](stayB.inst); ui.setText(spinB.inst, (phase === 2 ? 'SPIN AGAIN' : 'SPIN')); ui.setText(stayB.inst, 'STAY');
  hud.clearRect(0, 0, 800, 600); const score = s[7 + cur * 4]; const f2 = (v) => (v / 100).toFixed(2);
  if (imWin) hud.drawImage(imWin, 587, 61, 192, 147); font.draw(hud, cur === 0 ? 'YOU' : `CONTESTANT ${cur + 1}`, 683 - font.width(cur === 0 ? 'YOU' : `CONTESTANT ${cur + 1}`) / 2, 140, '#fff');
  if (imScore) hud.drawImage(imScore, 630, 271, 112, 70); const txt = f2(score), cx = [635, 670, 702]; const dg = txt.replace('.', ''); for (let k = 0; k < 3; k++) big.draw(hud, dg[k] || '0', cx[k], 322, score > 100 ? '#f77' : '#fff'); if (imPoint) hud.drawImage(imPoint, 654, 313, 22, 22);
  for (let i = 0; i < n; i++) { const o = 7 + i * 4; const t = `${i === 0 ? 'YOU' : 'P' + (i + 1)}: ${f2(s[o])}${s[o + 2] ? ' BUST' : ''}${s[o + 3] ? '  +$' + s[o + 3] : ''}`; font.draw(hud, (i === cur ? '▶ ' : '   ') + t, 596, 392 + i * 22, i === cur ? '#ffd84a' : '#cfd8ff'); }
  if (phase === 6) { const m = win >= 0 ? (win === 0 ? 'YOU WIN THE SHOWDOWN!' : `CONTESTANT ${win + 1} WINS`) : 'EVERYONE BUSTED'; big.draw(hud, m, 400 - big.width(m) / 2, 90, win === 0 ? '#7f7' : '#ffd84a'); }
  if (imReflex) { hud.save(); hud.globalAlpha = 0.35; hud.drawImage(imReflex, 280, 44, 210, 485); hud.restore(); }
  ui.draw(hud, hptr.x, hptr.y, 'btn'); if (caption) { hud.fillStyle = 'rgba(0,0,0,.65)'; hud.fillRect(0, 548, 800, 52); const t = caption.slice(0, 90); font.draw(hud, t, 400 - font.width(t) / 2, 580, '#fff'); }
  window.__bw = { phase, cur, pos, speed, win, ang, totals: Array.from({ length: n }, (_, i) => s[7 + i * 4]) }; 
}
requestAnimationFrame(frame); window.__ready = true;
