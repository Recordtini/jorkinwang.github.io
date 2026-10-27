// On-screen touch controls for phones and tablets: a steering slider on the left, gas / brake / handbrake on the
// right and a pause button, shown only while a level is being driven. Menus are used by tapping the canvas.
export function initTouch(root = document.body) {
  const coarse = matchMedia('(pointer: coarse)').matches || 'ontouchstart' in window;
  const st = { enabled: coarse, steer: 0, thr: 0, brake: false, hand: false, esc: false, shown: false, hidden: false };
  if (!coarse) return st;

  const css = document.createElement('style');
  css.textContent = `
  #tc { position: fixed; inset: 0; pointer-events: none; z-index: 4; display: none; -webkit-user-select: none; user-select: none; -webkit-touch-callout: none; }
  #tc > * { pointer-events: auto; touch-action: none; position: absolute; box-sizing: border-box; color: #fff; font: 700 14px system-ui, sans-serif;
    background: rgba(20,24,40,.38); border: 2px solid rgba(255,255,255,.45); border-radius: 18px; display: flex; align-items: center; justify-content: center; text-align: center; }
  #tc > *.on { background: rgba(255,200,40,.55); border-color: #fff; }
  #tc-steer { left: max(14px, env(safe-area-inset-left)); bottom: max(14px, env(safe-area-inset-bottom)); width: min(44vw, 340px); height: min(30vh, 120px); border-radius: 60px; }
  #tc-knob { position: absolute; top: 8%; bottom: 8%; aspect-ratio: 1; border-radius: 50%; background: rgba(255,255,255,.75); left: 50%; transform: translateX(-50%); pointer-events: none; }
  #tc-gas { right: max(14px, env(safe-area-inset-right)); bottom: max(14px, env(safe-area-inset-bottom)); width: min(22vw, 140px); height: min(34vh, 150px); }
  #tc-brake { right: calc(max(14px, env(safe-area-inset-right)) + min(22vw, 140px) + 12px); bottom: max(14px, env(safe-area-inset-bottom)); width: min(16vw, 100px); height: min(22vh, 100px); }
  #tc-hand { right: max(14px, env(safe-area-inset-right)); bottom: calc(max(14px, env(safe-area-inset-bottom)) + min(34vh, 150px) + 12px); width: min(22vw, 140px); height: min(14vh, 56px); }
  #tc-esc, #tc-fs, #tc-hide { top: max(10px, env(safe-area-inset-top)); width: 44px; height: 44px; border-radius: 10px; font-size: 18px; }
  #tc-esc { left: calc(50% - 74px); }
  #tc-fs { left: calc(50% - 22px); }
  #tc-hide { left: calc(50% + 30px); }
  #tc-show { position: fixed; z-index: 4; display: none; left: calc(50% + 30px); top: max(10px, env(safe-area-inset-top)); width: 44px; height: 44px; border-radius: 10px; font-size: 18px; color: #fff; background: rgba(20,24,40,.38); border: 2px solid rgba(255,255,255,.45); touch-action: none; }
  #tc-rot { position: fixed; left: 0; right: 0; top: 0; display: none; padding: 6px; text-align: center; font: 13px system-ui; background: rgba(0,0,0,.7); color: #fff; z-index: 7; pointer-events: none; }
  @media (orientation: portrait) { #tc-rot.show { display: block; } }
  `;
  document.head.appendChild(css);

  const mk = (id, label, parent) => { const e = document.createElement('div'); e.id = id; e.textContent = label; (parent || tc).appendChild(e); return e; };
  const tc = document.createElement('div'); tc.id = 'tc'; root.appendChild(tc);
  const steer = mk('tc-steer', '');
  const knob = document.createElement('div'); knob.id = 'tc-knob'; steer.appendChild(knob);
  const gas = mk('tc-gas', 'GAS'), brake = mk('tc-brake', 'BRAKE'), hand = mk('tc-hand', 'HANDBRAKE');
  const esc = mk('tc-esc', '⏸'), fs = mk('tc-fs', '⛶'), hide = mk('tc-hide', '🎮');
  const showBtn = document.createElement('button'); showBtn.id = 'tc-show'; showBtn.textContent = '🎮'; root.appendChild(showBtn);
  // the controls sit over menu buttons, so they can be hidden while navigating menus
  hide.addEventListener('pointerdown', (e) => { e.preventDefault(); st.hidden = true; });
  showBtn.addEventListener('pointerdown', (e) => { e.preventDefault(); st.hidden = false; });
  const rot = document.createElement('div'); rot.id = 'tc-rot'; rot.textContent = 'Rotate your phone to landscape to play'; root.appendChild(rot);

  // hold-style buttons, tracked per pointer so several fingers work at once
  const hold = (el, set) => {
    const ids = new Set();
    const up = (e) => { ids.delete(e.pointerId); if (!ids.size) { el.classList.remove('on'); set(false); } };
    el.addEventListener('pointerdown', (e) => { e.preventDefault(); el.setPointerCapture(e.pointerId); ids.add(e.pointerId); el.classList.add('on'); set(true); });
    el.addEventListener('pointerup', up); el.addEventListener('pointercancel', up); el.addEventListener('lostpointercapture', up);
  };
  hold(gas, (v) => { st.thr = v ? 1 : 0; });
  hold(brake, (v) => { st.brake = v; });
  hold(hand, (v) => { st.hand = v; });
  hold(esc, (v) => { st.esc = v; });
  fs.addEventListener('pointerdown', (e) => {
    e.preventDefault();
    if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen?.().catch(() => {});
  });

  // steering slider: analog, with a little dead zone at the centre
  const setSteer = (e) => {
    const r = steer.getBoundingClientRect();
    const half = r.width / 2 - r.height * 0.4;
    let x = Math.max(-1, Math.min(1, (e.clientX - (r.left + r.width / 2)) / half));
    st.steer = Math.abs(x) < 0.06 ? 0 : x;
    knob.style.left = (50 + st.steer * (half / r.width) * 100) + '%';
  };
  const steerEnd = () => { st.steer = 0; knob.style.left = '50%'; steer.classList.remove('on'); };
  steer.addEventListener('pointerdown', (e) => { e.preventDefault(); steer.setPointerCapture(e.pointerId); steer.classList.add('on'); setSteer(e); });
  steer.addEventListener('pointermove', (e) => { if (steer.hasPointerCapture(e.pointerId)) setSteer(e); });
  steer.addEventListener('pointerup', steerEnd); steer.addEventListener('pointercancel', steerEnd);

  st.show = (on) => {
    if (on === st.shown) return;
    st.shown = on; tc.style.display = on ? 'block' : 'none';
    if (!on) { steerEnd(); st.thr = 0; st.brake = st.hand = st.esc = false; for (const e of [gas, brake, hand, esc]) e.classList.remove('on'); }
    rot.classList.toggle('show', on);
  };
  st.syncShow = () => {
    showBtn.style.display = st.hidden ? 'block' : 'none';
  };
  return st;
}
