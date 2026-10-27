// LEGO Supersonic RC web shell: loads the original game files, runs the wasm engine, draws with WebGL.
import { Renderer } from './gl.js';
import { Sound } from './audio.js';
import { buildMenu } from './menu.js';
import { initTouch } from './touch.js';

const STAGE_W = 640, STAGE_H = 480;
const canvas = document.getElementById('stage');
const statusEl = document.getElementById('status');
const errEl = document.getElementById('err');

const DEFAULTS = { smooth3d: true, rscale: 1, fit: 'window', smooth: true, aniso: 16, msaa: 0, fps: 40, showFps: false, pauseOnMenu: true, volume: 0.8, mute: false,
  padDead: 0.12, padCurve: 1.4, cScore: 1, cInfTime: false, cNitro: false, cPower: 1, cGravity: 1, cSpeed: 1 };
let settings = Object.assign({}, DEFAULTS);
try { Object.assign(settings, JSON.parse(localStorage.getItem('lsrc.settings') || '{}')); } catch (e) { /* storage unavailable */ }
const saveSettings = () => { try { localStorage.setItem('lsrc.settings', JSON.stringify(settings)); } catch (e) { /* ignore */ } };

function fail(msg) {
  errEl.style.display = 'flex';
  errEl.innerHTML = '<div><h2>Cannot start</h2><p>' + msg + '</p></div>';
}

async function fetchBytes(url) {
  const r = await fetch(url);
  if (!r.ok) throw new Error(url + ' → HTTP ' + r.status);
  return new Uint8Array(await r.arrayBuffer());
}

// Mac virtual key codes (Director's keyPressed(n))
const KEYMAP = {
  ArrowLeft: 123, ArrowRight: 124, ArrowDown: 125, ArrowUp: 126, Escape: 53, Space: 49, Enter: 36,
  KeyA: 0, KeyS: 1, KeyD: 2, KeyF: 3, KeyH: 4, KeyG: 5, KeyZ: 6, KeyX: 7, KeyC: 8, KeyV: 9, KeyB: 11,
  KeyQ: 12, KeyW: 13, KeyE: 14, KeyR: 15, KeyY: 16, KeyT: 17, Digit1: 18, Digit2: 19, Digit3: 20,
  Digit4: 21, Digit6: 22, Digit5: 23, Digit9: 25, Digit7: 26, Digit8: 28, Digit0: 29, KeyO: 31,
  KeyU: 32, KeyI: 34, KeyP: 35, KeyL: 37, KeyJ: 38, KeyK: 40, KeyN: 45, KeyM: 46, Tab: 48, Backspace: 51,
};

// ---- text members: layout and rasterisation with the browser's font engine ----
const tctx = document.createElement('canvas').getContext('2d', { willReadFrequently: true });
const layoutCache = new Map();
function fontOf(sp, size) { return (sp.italic ? 'italic ' : '') + (sp.bold ? 'bold ' : '') + size + 'px Arial, Helvetica, sans-serif'; }
function textLayout(json) {
  let L = layoutCache.get(json);
  if (L) return L;
  const sp = JSON.parse(json);
  if (new URLSearchParams(location.search).has('dbgtext')) console.log('text spec', json);
  const rows = [];
  let maxW = 0;
  for (const [lsz, runs] of sp.lines) {
    let cur = { runs: [], w: 0, size: lsz };
    const push = () => { rows.push(cur); maxW = Math.max(maxW, cur.w); cur = { runs: [], w: 0, size: lsz }; };
    for (const [t, r, g, b] of runs) {
      tctx.font = fontOf(sp, lsz);
      const w = tctx.measureText(t).width;
      if (sp.w > 0 && cur.w + w > sp.w && cur.runs.length && t.trim()) push();
      cur.runs.push({ t, c: [r, g, b], w, size: lsz }); cur.w += w;
    }
    push();
  }
  const lh = (r) => sp.fls > 0 ? sp.fls : Math.round(r.size * 1.2);
  let h = 0; for (const r of rows) h += lh(r);
  L = { sp, rows, w: Math.max(1, sp.w > 0 ? sp.w : Math.ceil(maxW)), h: Math.max(1, sp.h > 0 ? sp.h : h), lh, textH: h };
  if (layoutCache.size > 200) layoutCache.clear();
  layoutCache.set(json, L);
  return L;
}
function textRaster(L) {
  const cv = tctx.canvas; cv.width = L.w; cv.height = L.h;
  tctx.clearRect(0, 0, L.w, L.h); tctx.textBaseline = 'alphabetic';
  let y = L.sp.h > 0 ? Math.max(0, (L.h - L.textH) / 2) : 0;
  for (const r of L.rows) {
    const lh = L.lh(r);
    let x = L.sp.align === 1 ? (L.w - r.w) / 2 : L.sp.align === 2 ? L.w - r.w : 0;
    for (const run of r.runs) {
      tctx.font = fontOf(L.sp, run.size); tctx.fillStyle = `rgb(${run.c[0]},${run.c[1]},${run.c[2]})`;
      tctx.fillText(run.t, x, y + lh * 0.82);
      if (L.sp.ul) tctx.fillRect(x, y + lh * 0.9, run.w, 1);
      x += run.w;
    }
    y += lh;
  }
  return tctx.getImageData(0, 0, L.w, L.h).data;
}

window.__text = { get textLayout() { return textLayout; }, get textRaster() { return textRaster; } };
async function main() {
  let dcr, cct;
  try {
    [dcr, cct] = await Promise.all([fetchBytes('game/game.dcr'), fetchBytes('game/GUILibrary.cct')]);
  } catch (e) {
    return fail('Could not load the original game files from <code>OriginalGame/</code>.<br>' + e.message +
      '<br><br>Serve the repository root with a static web server, e.g. <code>python3 -m http.server</code>, and open <code>/web/</code>.');
  }
  let mem;
  const dec = new TextDecoder();
  const imports = { env: {
    js_log(ptr, len) { console.log('[engine]', dec.decode(new Uint8Array(mem.buffer, ptr, len))); },
    js_text_layout(ptr, len, out) {
      const L = textLayout(dec.decode(new Uint8Array(mem.buffer, ptr, len)));
      const o = new Int32Array(mem.buffer, out, 2); o[0] = L.w; o[1] = L.h;
    },
    js_text_draw(ptr, len, px) {
      const L = textLayout(dec.decode(new Uint8Array(mem.buffer, ptr, len)));
      new Uint8ClampedArray(mem.buffer, px, L.w * L.h * 4).set(textRaster(L));
    },
  } };
  const wasm = await WebAssembly.instantiateStreaming(fetch('engine.wasm'), imports).catch(async () =>
    WebAssembly.instantiate(await (await fetch('engine.wasm')).arrayBuffer(), imports));
  const ex = wasm.instance.exports;
  mem = ex.memory;
  const put = (bytes) => { const p = ex.lw_alloc(bytes.length); new Uint8Array(mem.buffer, p, bytes.length).set(bytes); return p; };
  const pd = put(dcr), pc = put(cct);
  if (ex.lw_init(pd, dcr.length, pc, cct.length) !== 0) return fail('Engine failed to load the game data (see console).');
  statusEl.textContent = '';

  const gl = window.__gl = new Renderer(canvas, ex, mem, STAGE_W, STAGE_H, settings);
  const snd = new Sound(ex, mem);
  snd.setMaster(settings.volume); snd.setMuted(settings.mute);
  window.__lw = { snd, ex };
  let paused = false;
  const touch = initTouch();
  const apply = (key) => {
    const dpr = Math.min(window.devicePixelRatio || 1, touch.enabled ? 2 : 4);
    let cw, ch;
    if (settings.fit === 'window') { cw = innerWidth; ch = innerHeight; }
    else if (settings.fit === 'fit') { const k = Math.min(innerWidth / STAGE_W, innerHeight / STAGE_H); cw = Math.floor(STAGE_W * k); ch = Math.floor(STAGE_H * k); }
    else { cw = STAGE_W * settings.fit; ch = STAGE_H * settings.fit; }
    canvas.style.width = cw + 'px'; canvas.style.height = ch + 'px'; canvas.style.maxWidth = canvas.style.maxHeight = 'none';
    // render resolution: window pixels x device pixel ratio x the chosen quality factor (capped for sanity)
    const q = settings.rscale * dpr;
    canvas.width = Math.max(320, Math.min(4096, Math.round(cw * q))); canvas.height = Math.max(240, Math.min(4096, Math.round(ch * q)));
    canvas.style.imageRendering = settings.smooth ? 'auto' : 'pixelated';
    snd.setMaster(settings.volume); snd.setMuted(settings.mute);
    gl.setFiltering(settings.aniso);
    statusEl.style.display = settings.showFps ? 'block' : 'none';
    if (key === 'msaa') location.reload();
  };
  apply();
  addEventListener('resize', () => apply());
  buildMenu({ el: document.getElementById('cheat'), gear: document.getElementById('gear'), settings, save: saveSettings, ex, snd, onChange: apply, setPaused: (p) => { paused = p; } });
  addEventListener('keydown', (e) => { if (e.code === 'F11') { e.preventDefault(); if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); } });

  const toStage = (e) => {
    const r = canvas.getBoundingClientRect();
    const px = (e.clientX - r.left) * canvas.width / r.width, py = (e.clientY - r.top) * canvas.height / r.height;
    gl.layout();
    return [(px - gl.ox) / gl.s, (py - gl.oy) / gl.s];
  };
  let down = 0, mx = 0, my = 0;
  canvas.addEventListener('mousemove', (e) => { [mx, my] = toStage(e); ex.lw_mouse(mx, my, down); });
  canvas.addEventListener('mousedown', (e) => { [mx, my] = toStage(e); down = 1; ex.lw_mouse(mx, my, 1); e.preventDefault(); });
  window.addEventListener('mouseup', () => { down = 0; ex.lw_mouse(mx, my, 0); });
  // touch on the canvas acts as the mouse (menus); pointerdown is cancelled so no duplicate compatibility mouse events follow
  canvas.style.touchAction = 'none';
  // a quick tap can press and release inside one 25 ms logic tick; hold the press long enough for the game to see it
  let downAt = 0;
  const tp = (e, d) => {
    if (e.pointerType === 'mouse') return;
    e.preventDefault(); [mx, my] = toStage(e);
    if (d) downAt = performance.now();
    const apply = () => { down = d; ex.lw_mouse(mx, my, d); };
    const wait = d ? 0 : 90 - (performance.now() - downAt);
    if (wait > 0) setTimeout(apply, wait); else apply();
  };
  canvas.addEventListener('pointerdown', (e) => tp(e, 1));
  canvas.addEventListener('pointermove', (e) => { if (e.pointerType !== 'mouse' && down) tp(e, 1); });
  canvas.addEventListener('pointerup', (e) => tp(e, 0));
  canvas.addEventListener('pointercancel', (e) => tp(e, 0));
  const key = (e, d) => {
    if (document.getElementById('cheat').contains(e.target)) return;
    const code = KEYMAP[e.code];
    if (code === undefined && !(e.key && e.key.length === 1)) return;
    ex.lw_key(code === undefined ? -1 : code, e.key && e.key.length === 1 ? e.key.codePointAt(0) : 0, d);
    if (code !== undefined) e.preventDefault();
  };
  window.addEventListener('keydown', (e) => { if (!e.repeat) key(e, 1); });
  window.addEventListener('keyup', (e) => key(e, 0));

  // Game controller (Xbox / XInput pads arrive through the browser's Gamepad API with the standard layout):
  // left stick = analog steering, RT = analog throttle (A also floors it), LT / B = brake and reverse,
  // X = handbrake, Start = Esc, d-pad = digital drive and steer. Without a pad the keyboard works as before.
  const pad = { 125: false, 49: false, 53: false };
  const setPad = (code, on) => { if (pad[code] !== on) { pad[code] = on; ex.lw_key(code, code === 49 ? 32 : 0, on ? 1 : 0); } };
  let padOn = false;
  function pollPad() {
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    let g = null;
    for (const c of pads) if (c && c.connected) { g = c; break; }
    if (!g && touch.shown) {
      padOn = true;
      ex.lw_analog(1, touch.steer, touch.thr);
      setPad(125, touch.brake); setPad(49, touch.hand); setPad(53, touch.esc);
      return;
    }
    if (!g) { if (padOn) { padOn = false; ex.lw_analog(0, 0, 0); setPad(125, false); setPad(49, false); setPad(53, false); } return; }
    padOn = true;
    const btn = (i) => (g.buttons[i] ? g.buttons[i].value : 0);
    const dead = settings.padDead;
    let x = g.axes[0] || 0, y = g.axes[1] || 0;
    const mag = Math.hypot(x, y);
    if (mag < dead) x = 0; else x = Math.sign(x) * Math.min(1, (Math.abs(x) - dead * 0.5) / (1 - dead * 0.5));
    x = Math.sign(x) * Math.pow(Math.abs(x), settings.padCurve);
    if (btn(14) > 0.5) x = -1; if (btn(15) > 0.5) x = 1;
    const throttle = Math.max(btn(7), btn(0), btn(12));
    setPad(125, btn(6) > 0.3 || btn(1) > 0.5 || btn(13) > 0.5);
    setPad(49, btn(2) > 0.5 || btn(5) > 0.5);
    setPad(53, btn(9) > 0.5);
    ex.lw_analog(1, x, throttle < 0.04 ? 0 : throttle);
    if (g.vibrationActuator && false) { /* reserved */ }
  }

  // Logic runs on a fixed clock (40 Hz like the original tempo); drawing happens on every display refresh and,
  // when smoothing is on, blends the 3D scene between the last two logic ticks.
  let acc = 0, last = performance.now(), clock = last, frames = 0, fpsT = last;
  function loop(now) {
    requestAnimationFrame(loop);
    const dt = now - last; last = now;
    if (paused) { acc = 0; clock = now; return; }
    if (touch.enabled) { touch.show(gl.in3d && !touch.hidden && document.getElementById('cheat').style.display !== 'block'); touch.syncShow(); }
    pollPad();
    const step = 1000 / settings.fps;
    acc = Math.min(acc + dt, step * 6);
    let ticked = false;
    while (acc >= step) {
      clock += step; acc -= step;
      ex.lw_tick(clock);
      snd.pump();
      ticked = true;
    }
    const smooth = settings.smooth3d;
    ex.lw_set_smooth(smooth ? 1 : 0);
    if (!ticked && !smooth) return;
    ex.lw_render(smooth ? acc / step : 1);
    gl.draw();
    frames++;
    if (now - fpsT > 1000) { statusEl.textContent = frames + ' fps'; frames = 0; fpsT = now; }
  }
  requestAnimationFrame(loop);
}
main().catch((e) => { console.error(e); fail(String(e)); });
