// Options and cheat panel (F1 or the gear button).
const CHEAT = { UNLOCK: 1, ADD_TIME: 2, ADD_POINTS: 3, UPRIGHT: 4, RESET: 5, JUMP: 6, NITRO: 7, POWER: 8, GRAVITY: 9, SPEED: 10, INF_TIME: 11 };

export function buildMenu({ el, gear, settings, save, ex, snd, onChange, setPaused }) {
  const rows = [];
  const h = (tag, attrs = {}, ...kids) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) { if (k === 'class') e.className = v; else if (k.startsWith('on')) e.addEventListener(k.slice(2), v); else e.setAttribute(k, v); }
    for (const kid of kids) e.append(kid);
    return e;
  };
  const section = (t) => rows.push(h('h4', {}, t));
  const select = (label, key, opts, note) => {
    const s = h('select', { onchange: () => { settings[key] = isNaN(+s.value) ? s.value : +s.value; save(); onChange(key); } });
    for (const [v, t] of opts) { const o = h('option', { value: v }, t); if (String(settings[key]) === String(v)) o.selected = true; s.append(o); }
    rows.push(h('label', {}, h('span', {}, label), s));
    if (note) rows.push(h('div', { class: 'note' }, note));
  };
  const check = (label, key, note) => {
    const c = h('input', { type: 'checkbox', onchange: () => { settings[key] = c.checked; save(); onChange(key); } });
    c.checked = !!settings[key];
    rows.push(h('label', {}, h('span', {}, label), c));
    if (note) rows.push(h('div', { class: 'note' }, note));
  };
  const range = (label, key, min, max, step) => {
    const r = h('input', { type: 'range', min, max, step, oninput: () => { settings[key] = +r.value; save(); onChange(key); } });
    r.value = settings[key];
    rows.push(h('label', {}, h('span', {}, label), r));
  };
  const button = (label, fn) => h('button', { onclick: fn }, label);
  const buttons = (...bs) => rows.push(h('div', { class: 'btns' }, ...bs));
  const cheat = (id, arg = 0) => () => { if (ex.lw_cheat) ex.lw_cheat(id, arg); };
  const toggleCheat = (label, id, key, note) => {
    const c = h('input', { type: 'checkbox', onchange: () => { settings[key] = c.checked; save(); ex.lw_cheat(id, c.checked ? 1 : 0); } });
    c.checked = !!settings[key];
    if (c.checked) ex.lw_cheat(id, 1);
    rows.push(h('label', {}, h('span', {}, label), c));
    if (note) rows.push(h('div', { class: 'note' }, note));
  };
  const cheatSelect = (label, id, key, opts) => {
    const s = h('select', { onchange: () => { settings[key] = +s.value; save(); ex.lw_cheat(id, +s.value); } });
    for (const [v, t] of opts) { const o = h('option', { value: v }, t); if (+settings[key] === v) o.selected = true; s.append(o); }
    ex.lw_cheat(id, +settings[key]);
    rows.push(h('label', {}, h('span', {}, label), s));
  };

  section('Display');
  select('Render resolution', 'rscale', [[0.5, '0.5× window'], [0.75, '0.75×'], [1, '1× (native)'], [1.5, '1.5×'], [2, '2× (supersampled)']], 'Relative to the window size and display scaling.');
  select('Window fit', 'fit', [['window', 'Fill window'], ['fit', 'Keep 4:3'], [1, '640×480'], [2, '1280×960']], 'Menus stay 4:3 with side bars; the 3D view fills the whole window.');
  check('Smooth scaling', 'smooth');
  select('Texture filtering', 'aniso', [[1, 'Bilinear + mipmaps'], [4, 'Anisotropic 4×'], [16, 'Anisotropic 16×']]);
  select('Anti-aliasing', 'msaa', [[0, 'Off (original)'], [4, 'MSAA 4×']], 'Takes effect after a reload.');
  buttons(button('Fullscreen', () => { if (document.fullscreenElement) document.exitFullscreen(); else document.documentElement.requestFullscreen().catch(() => {}); }));
  check('Smooth 3D motion', 'smooth3d', 'Draws the 3D scene at your display\'s refresh rate by blending between logic ticks. The game logic itself still runs at the chosen logic rate.');
  check('Show FPS', 'showFps');

  section('Timing');
  select('Logic rate', 'fps', [[40, '40 fps (original tempo)'], [60, '60 fps'], [80, '80 fps']], 'The original game ran at 40 frames per second. Other rates change how quickly steering ramps up.');
  check('Pause while this menu is open', 'pauseOnMenu');

  section('Audio');
  range('Volume', 'volume', 0, 1, 0.05);
  check('Mute', 'mute');

  section('Cheats');
  buttons(button('Unlock all levels', cheat(CHEAT.UNLOCK)), button('+60 s', cheat(CHEAT.ADD_TIME, 60)), button('+1000 pts', cheat(CHEAT.ADD_POINTS, 1000)));
  buttons(button('Flip upright', cheat(CHEAT.UPRIGHT)), button('Back to start', cheat(CHEAT.RESET)), button('Super jump', cheat(CHEAT.JUMP, 300)));
  toggleCheat('Infinite time', CHEAT.INF_TIME, 'cInfTime', 'Keeps the countdown topped up.');
  toggleCheat('Nitro (always on)', CHEAT.NITRO, 'cNitro');
  cheatSelect('Engine power', CHEAT.POWER, 'cPower', [[1, '1× (original)'], [1.5, '1.5×'], [2, '2×'], [3, '3×']]);
  cheatSelect('Gravity', CHEAT.GRAVITY, 'cGravity', [[1, 'Normal'], [0.5, 'Moon'], [0.2, 'Floaty'], [1.5, 'Heavy']]);
  cheatSelect('Game speed', CHEAT.SPEED, 'cSpeed', [[0.5, 'Slow motion'], [1, 'Normal'], [1.5, 'Fast'], [2, 'Very fast']]);

  section('Keys');
  rows.push(h('div', { class: 'note' }, '↑ ↓ drive/brake · ← → steer · Space handbrake · Esc leave a level · F1 this menu · F11 fullscreen. Gamepad: stick/d-pad steer, A or RT drive, B or LT brake, X handbrake, Start = Esc.'));

  el.replaceChildren(h('h3', {}, 'Options & cheats'), ...rows);
  const toggle = (on) => {
    const open = on === undefined ? el.style.display !== 'block' : on;
    el.style.display = open ? 'block' : 'none';
    setPaused(open && !!settings.pauseOnMenu);
  };
  gear.addEventListener('click', () => toggle());
  window.addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); toggle(); } });
  el.addEventListener('keydown', (e) => e.stopPropagation());
  return { toggle, isOpen: () => el.style.display === 'block' };
}
