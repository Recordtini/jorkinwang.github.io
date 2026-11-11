// The Price Is Right 2010 — one-page shell: menus + the whole show, every segment loaded into the same stage.
// Structure and wording come from the original game's own resources (screens 067 menus, 059 UI kit, 027 tutorial, ranks and unlock challenges):
//   Main Menu -> Single Player (CLASSIC / 3 STRIKES) | Arcade | Achievements | Leaderboards | My Profile | Help & Options | Credits | Exit
//   Show (Single): Come On Down -> Contestants' Row -> pricing game -> Showcase Showdown (the wheel) -> the Showcase.
// Saves (profiles, high scores, unlocks, options) live in localStorage.
import { gameWinnings, rowWinnings } from './show-results.js';
import { arcadeCatalog } from './arcade-catalog.js';
import { Audio } from './audio.js?v=3'; import { Reg, UI } from './ui.js?v=2';
const $ = (id) => document.getElementById(id);
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const idx = await (await fetch('zip-index.json')).json();
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports;

// ------------------------------------------------------------------ original strings and art
const T = {}, ART = {};
async function manifest(n) {
  const b = new Uint8Array(await (await fetch(`zip/${String(n).padStart(3, '0')}/GWScreen`)).arrayBuffer()); const p = ex.tp_alloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b);
  const jp = ex.tp_screen_json(p, b.length); const m = new Uint8Array(ex.memory.buffer); let e = jp; while (m[e]) e++; return JSON.parse(new TextDecoder().decode(m.slice(jp, e)));
}
for (const n of [67, 59, 27, 64, 22]) { try { const S = await manifest(n); for (const x of S.entries) { if (x.type === 5) (T[n] ||= {})[x.name] = x.text; if (x.type === 3 && idx[x.id]) (ART[n] ||= {})[x.name] = idx[x.id]; } } catch (e) { /* optional */ } }
const tx = (scr, name, dflt) => ((T[scr] || {})[name] ?? dflt ?? name).replace(/\r?\n/g, ' ').replace(/\s*\/\s*/g, ' ').trim();
const artUrl = (scr, name) => (ART[scr] || {})[name] ? 'zip/' + ART[scr][name] : null;

// ------------------------------------------------------------------ saves
const SAVE_KEY = 'tpir.save.v1';
const blank = (name) => ({ name, avatar: (name.charCodeAt(0) || 0) % 8, high: { classic: 0, strikes: 0 }, shows: 0, winnings: 0, wins: 0, unlocked: {}, created: Date.now() });
let save = (() => { try { const s = JSON.parse(localStorage.getItem(SAVE_KEY)); if (s && s.profiles) return s; } catch (e) { /* none */ } return { profiles: {}, current: null, options: { music: 0.4, speech: 0.9, captions: true }, scores: [] }; })();
const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* storage unavailable */ } };
const me = () => save.profiles[save.current];
function applyOptions() { Audio.defaultVolume = save.options.speech; Audio.captionsOff = !save.options.captions; if (musicSrc?.musicGain) musicSrc.musicGain.gain.value = save.options.music; }

// ------------------------------------------------------------------ audio of the shell
const au = new Audio(ex, idx); await au.addScreens([27, 24, 10, 3]); au.onCaption = (t) => { $('scap').textContent = t; };
const reg = await Reg.load(ex, idx);   // all GWScreen manifests (resource ids -> art/fonts/styles) for the real-UI runtime (ui.js)
let musicSrc = null, musicStarting = null, musicEpoch = 0;
function stopMusic() { musicEpoch++; if (musicSrc) { try { musicSrc.stop(); } catch {} musicSrc = null; } }
async function startMusic() {
  if (inShow || musicSrc || !navigator.userActivation?.hasBeenActive) return;
  if (musicStarting) return musicStarting;
  const epoch = musicEpoch; let stale = false;
  musicStarting = (async () => {
    await au.unlock();
    const src = await au.music('Music_ComeOnDown.loop', save.options.music);
    if (epoch !== musicEpoch || inShow) { stale = true; if (src) { try { src.stop(); } catch {} } }
    else musicSrc = src;
  })();
  try { await musicStarting; } finally { musicStarting = null; if (stale && !inShow) startMusic(); }
}

// ------------------------------------------------------------------ module loader (only the active module animates)
let gen = 0; const raf = window.requestAnimationFrame.bind(window);
window.requestAnimationFrame = (f) => raf((t) => { if (f.__gen === undefined) f.__gen = gen; if (f.__gen === gen) f(t); });
const GAMES = {
  rangegame: { key: '__rg', name: 'Range Game', done: (s) => s.phase >= 4, won: (s) => s.won === 1, unlock: 'RangeGame', gated: true },
  shellgame: { key: '__sg', name: 'Shell Game', done: (s) => s.ph === 8, won: (s) => s.won === 1, unlock: 'ShellGame', gated: true, extra: (s) => s.chips === 4 },
  cliffhangers: { key: '__ch', name: 'Cliff Hangers', done: (s) => s.ph >= 3, won: (s) => s.ph === 3, unlock: 'CliffHangers', gated: true },
  mostexpensive: { key: '__me', name: 'Most Expensive', done: (s) => s.ph === 3, won: (s) => s.won === 1 },
  squeezeplay: { key: '__sq', name: 'Squeeze Play', done: (s) => s.ph === 3, won: (s) => s.won === 1 },
  flipflop: { key: '__ff', name: 'Flip Flop', done: (s) => s.ph === 3, won: (s) => s.won === 1, unlock: 'FlipFlop', gated: true },
  clockgame: { key: '__ck', name: 'Clock Game', done: (s) => s.ph >= 3 && s.idle, won: (s) => s.ph === 3 },
  grocerygame: { key: '__gr', name: 'Grocery Game', done: (s) => s.ph >= 2 && s.idle, won: (s) => s.ph === 2 },
  safecrackers: { key: '__sc', name: 'Safe Crackers', done: (s) => (s.ph === 2 || s.ph === 3) && s.idle, won: (s) => s.ph === 2 },
  luckyseven: { key: '__l7', name: 'Lucky Seven', done: (s) => s.ph === 2 && s.idle, won: (s) => s.won === 1 },
  checkgame: { key: '__cg', name: 'Check Game', done: (s) => s.done && s.idle, won: (s) => s.won === 1 },
  doubleprices: { key: '__dp', name: 'Double Prices', done: (s) => s.done && s.idle, won: (s) => s.won === 1 },
  freezeframe: { key: '__fz', name: 'Freeze Frame', done: (s) => s.done && s.idle, won: (s) => s.won === 1 },
  checkout: { key: '__co', name: 'Check Out', done: (s) => s.done && s.idle, won: (s) => s.won === 1 },
  punchabunch: { key: '__pb', name: 'Punch a Bunch', done: (s) => s.ph === 3 && s.idle, won: (s) => s.won === 1 },
  oneaway: { key: '__oa', name: 'One Away', done: (s) => s.ph === 3 && s.idle, won: (s) => s.won === 1 },
  bonkers: { key: '__bk', name: 'Bonkers', done: (s) => s.ph === 3 && s.idle, won: (s) => s.won === 1, unlock: 'Bonkers' },
  'plinko-dev': { key: '__plinko', name: 'Plinko', done: (s) => s.phase === 3 && s.idle, won: (s) => s.cash > 0 || s.smallPrizes > 0, unlock: 'Plinko', arcadeOnly: true },
};
const PRICING = Object.keys(GAMES).filter(k => !GAMES[k].arcadeOnly);
const NOT_PORTED = ['Dice Game', 'Golden Road', 'Half Off', 'Hole in One', "It's in the Bag", 'Master Key', 'Money Game', 'Push Over', 'Race Game', 'Secret X', 'Spelling Bee', 'Three Strikes'];
let styleEls = [], version = 0, inShow = false, quitting = false;
function teardown() {
  window.__disposeSegment?.(); delete window.__disposeSegment; gen++; Audio.stopAll(au);
  for (const c of document.querySelectorAll('#stage canvas')) { try { c.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext(); } catch (e) { /* 2d canvas */ } }
  $('stage').replaceChildren(); styleEls.forEach((s) => s.remove()); styleEls = []; $('scap').textContent = '';
  for (const k of [...Object.values(GAMES).map(g => g.key), '__bw', '__cr', '__sc2', '__ready']) delete window[k];
}
async function loadModule(name) {
  teardown(); const html = await (await fetch(`${name}.html`)).text(); const doc = new DOMParser().parseFromString(html, 'text/html');
  for (const st of doc.querySelectorAll('style')) { const e = document.createElement('style'); e.textContent = st.textContent.replace(/html,\s*body\s*\{[^}]*\}/, ''); document.head.appendChild(e); styleEls.push(e); }
  for (const n of [...doc.body.children]) if (n.tagName !== 'SCRIPT') $('stage').appendChild(document.importNode(n, true));
  await import(`./${name}.js?build=show16&v=${++version}`); applyOptions();
}
const until = async (fn, ms = 900000) => { const t0 = performance.now(); while (performance.now() - t0 < ms) { if (quitting) throw new Error('quit'); try { const v = fn(); if (v) return v; } catch (e) { /* not ready */ } await wait(150); } return null; };

// ------------------------------------------------------------------ progress: ranks and unlock challenges (names from screen 059)
const RANKS = [0, 1000, 5000, 15000, 40000, 100000, 250000];   // RECONSTRUCTED thresholds; labels are the game's own Rank1..Rank7
const rankOf = (w) => { let r = 0; RANKS.forEach((t, i) => { if (w >= t) r = i; }); return r + 1; };
const CHALLENGES = ['ContestantsRow', 'Showcase', 'ShowcaseShowdown', 'RangeGame', 'FlipFlop', 'CliffHangers', 'ShellGame', 'ThreeStrikes', 'Bonkers', 'CheckOut', 'FreezeFrame', 'HoleInOne', 'ItsInTheBag', 'MasterKey', 'MoneyGame', 'Plinko', 'PunchABunch', 'PushOver', 'RaceGame'];
const PORTED = new Set(['ContestantsRow', 'Showcase', 'ShowcaseShowdown', 'RangeGame', 'FlipFlop', 'CliffHangers', 'ShellGame', 'ThreeStrikes']);
async function unlock(key) { const p = me(); if (p.unlocked[key]) return; p.unlocked[key] = Date.now(); persist(); toast(tx(59, 'Unlocked' + key, key + ' unlocked!')); }
function toast(msg) { const t = document.createElement('div'); t.className = 'toast'; t.textContent = msg; document.body.appendChild(t); setTimeout(() => t.remove(), 5200); }

// ------------------------------------------------------------------ menu framework

// ---- real-UI runtime: draws the game's own GWScreen widget trees (ui.js) on a 4:3 canvas; pages = visibility sets over the real containers
const uic = document.createElement('canvas'); uic.width = 800; uic.height = 600; uic.style.cssText = 'position:fixed;left:50%;top:50%;transform:translate(-50%,-50%);width:min(100vw,133.33vh);height:min(75vw,100vh);z-index:31;display:none;background:#000;cursor:default'; document.body.appendChild(uic);
const uig = uic.getContext('2d'); const UIS = {}; let curUI = null, uiGen = 0, ptr = { x: -1, y: -1 };
const uiPt = (e) => { const r = uic.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
uic.addEventListener('pointermove', (e) => { ptr = uiPt(e); const d = curUI && curUI.drag; if (d) d.move(ptr.x); });
uic.addEventListener('pointerdown', (e) => { au.unlock(); startMusic(); ptr = uiPt(e); if (!curUI) return; const b = curUI.hit(ptr.x, ptr.y); curUI.down = b; const d = b && curUI.drags && curUI.drags.get(b.inst); if (d) { curUI.drag = d; d.move(ptr.x); } });
uic.addEventListener('pointerup', (e) => { ptr = uiPt(e); if (!curUI) return; if (curUI.drag) { curUI.drag.done?.(); curUI.drag = null; curUI.down = null; return; } const b = curUI.hit(ptr.x, ptr.y); const was = curUI.down; curUI.down = null; if (b && b === was) { const h = curUI.handlers.get(b.inst); if (h) { Audio_click(); h(); } } });
const Audio_click = () => { try { au.say('Sfx_Button_Click'); } catch (e) { /* sound optional */ } };
async function getUI(n) { if (!UIS[n]) UIS[n] = await new UI(reg, n).preload(); const ui = UIS[n]; ui.vis.clear(); ui.txt.clear(); ui.handlers.clear(); ui.disabled.clear(); ui.fills.clear(); ui.overlay = null; ui.drags = new Map(); ui.drag = null; ui.below = null; for (const n2 of ui.all.values()) delete n2.crop; return ui; }
function showUI(ui) { curUI = ui; $('ov').style.display = 'none'; uic.style.display = 'block'; const gen = ++uiGen; (function f() { if (gen !== uiGen) return; requestAnimationFrame(f); uig.fillStyle = '#000'; uig.fillRect(0, 0, 800, 600); for (let u = ui.below; u; u = u.below) { /* lower layers are drawn first */ } const layers = []; for (let u = ui; u; u = u.below) layers.unshift(u); layers.forEach((u, i) => u.draw(uig, i === layers.length - 1 ? ptr.x : -1, i === layers.length - 1 ? ptr.y : -1)); uic.style.cursor = ui.hover ? 'pointer' : 'default'; })(); }
function uiOff() { uiGen++; curUI = null; uic.style.display = 'none'; }
function panel(html, { clear = false } = {}) { uiOff(); const o = $('ov'); o.className = clear ? 'clear' : ''; o.style.display = 'flex'; o.innerHTML = html; const bg = artUrl(64, 'LoadScreen'); if (!clear && bg) o.style.backgroundImage = `linear-gradient(#0a1030cc,#0a1030ee),url(${bg})`; else o.style.backgroundImage = ''; return o; }
const hide = () => { $('ov').style.display = 'none'; };
const btn = (id, label, dis) => `<button id="${id}" ${dis ? 'disabled' : ''}>${label}</button>`;
const bind = (id, fn) => { const e = $(id); if (e) e.onclick = () => { au.unlock(); startMusic(); fn(); }; };
const AV = ['#e84a4a', '#e8a23a', '#d8d83a', '#4ae86a', '#3ad8d8', '#4a7ae8', '#a04ae8', '#e84ab0'];
const avatar = (i, name, size = 46) => `<span class="av" style="width:${size}px;height:${size}px;background:${AV[i % 8]};font-size:${size * 0.5}px">${(name || '?')[0].toUpperCase()}</span>`;

async function setupMain(ui) {   // 067 = menu hub: root container a8f3 holds every page; the main menu is 0db8 (background + avatar frame) + 4185 (buttons + logo)
  const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre))); const top = ui.root.children[0];
  for (const c of top.children) if (c.class === 'container') ui.hide(c.inst);
  ui.show(pick('0db8').inst, pick('4185').inst);
  for (const k of ['94fb', '4d7f', '3a96', '1825', 'c351', 'd2e8', 'ab48']) { const n = pick(k); if (n) ui.hide(n.inst); }   // avatar/inventory/exit/multiplayer are not part of this port
  ui.hide(pick('4c4c').inst, pick('b490').inst);   // Party Mode is not part of this port
  profileCard(ui); return pick;
}
async function mainMenu() {
  quitting = false; inShow = false; teardown(); $('shud').style.display = 'none'; startMusic();
  if (!save.current) return profileMenu(true);
  const ui = await getUI(67); const pick = await setupMain(ui);
  const set = (pre, fn) => { const n = pick(pre); if (n) ui.handlers.set(n.inst, () => { startMusic(); fn(); }); };
  set('c226', singleMenu); set('1c1d', optionsMenu); set('bcb2', achievementsMenu); set('f76a', arcadeMenu); set('6484', profileMenu);
  ui.setText(pick('f76a').inst, tx(67, 'ReturnToArcade', 'Arcade'));
  showUI(ui);
}
async function singleMenu() {
  const ui = await getUI(67); const pick = await setupMain(ui); ui.hide(pick('f76a').inst);
  for (const k of ['c226', '1c1d', 'bcb2', '6484']) { const n = pick(k); if (n) ui.disabled.add(n.inst); }   // the mode popup is modal over the menu
  ui.show(pick('00c5').inst); ui.fills.set(pick('69cb').inst, { fill: 'rgba(12,30,78,.94)', stroke: '#9fc4ff' }); for (const k of ['1c1d', 'bcb2', '6484', 'c226']) { const n = pick(k); if (n) ui.hide(n.inst); }
  const h = (pre, fn) => ui.handlers.set(pick(pre).inst, fn);
  h('61fd', () => runShow('classic')); h('fc14', () => runShow('strikes')); h('d209', mainMenu);
  showUI(ui);
}
const rankFonts = [4170, 4171, 4161];
function profileCard(ui) {   // no avatars in this port: the avatar frame (067 fee9/290d/76f3) shows the player's name, rank and totals instead
  const p = me(); const f = [reg.fonts.get(4161), reg.fonts.get(4170)].find((x) => x && !x.then);
  ui.overlay = (g) => { if (!f) return; const cx = 133; const line = (t, y, col) => f.draw(g, t, cx - f.width(t) / 2, y, col); line(p.name.toUpperCase(), 230, '#ffffff'); line(tx(59, 'Rank' + rankOf(p.winnings)).toUpperCase(), 262, '#ffd84a'); line('$' + p.winnings.toLocaleString('en-US'), 294, '#9fe39f'); line('SHOWS ' + p.shows + '  WINS ' + p.wins, 326, '#cfd8ff'); };
}
let arcadePage = 0;
async function arcadeMenu(page = arcadePage) {   // real art: screen 069's 2x2 tile layout (Button_Locked tiles, Game_Background) + the game logos from screen 001; paged, since there are more games than tiles
  const list = arcadeCatalog(GAMES, NOT_PORTED);
  const pages = Math.ceil(list.length / 4); arcadePage = Math.max(0, Math.min(pages - 1, page));
  const ui = await getUI(69); const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre)));
  const tiles = [['5b4f', '74be'], ['2c48', '8eb1'], ['b541', '6826'], ['c246', '9229']].map(([b, im]) => ({ btn: pick(b), img: pick(im) }));
  ui.fills.set(pick('de87').inst, { fill: 'rgba(10,22,60,.9)', stroke: '#9fc4ff' }); ui.setText(pick('f756').inst, reg.text(1291) || 'CHOOSE YOUR GAME!');
  const page4 = list.slice(arcadePage * 4, arcadePage * 4 + 4); const imgs = {};
  await Promise.all(page4.map(async (g) => { if (g.logo) imgs[g.logo] = await reg.img(g.logo); }));
  tiles.forEach((t2, i) => { const g = page4[i]; if (!g) { ui.hide(t2.btn.inst, t2.img.inst); return; } if (g.lock) ui.disabled.add(t2.btn.inst); else { ui.hide(t2.img.inst); ui.handlers.set(t2.btn.inst, () => playArcade(g.k)); } });
  const top = pick('39a4'); const prev = ui.addButton(top, { inst: 'prev' + arcadePage, x: 60, y: 520, w: 120, h: 55, res: 0xbee }); const next = ui.addButton(top, { inst: 'next' + arcadePage, x: 620, y: 520, w: 120, h: 55, res: 0xbee }); const back = ui.addButton(top, { inst: 'back' + arcadePage, x: 300, y: 520, w: 200, h: 60, res: 0xbed });
  ui.setText(prev.inst, '‹ PREV'); ui.setText(next.inst, 'NEXT ›'); ui.setText(back.inst, reg.text(1293) || 'MAIN MENU'); if (arcadePage === 0) ui.disabled.add(prev.inst); if (arcadePage >= pages - 1) ui.disabled.add(next.inst);
  ui.handlers.set(prev.inst, () => arcadeMenu(arcadePage - 1)); ui.handlers.set(next.inst, () => arcadeMenu(arcadePage + 1)); ui.handlers.set(back.inst, mainMenu);
  const f = reg.fonts.get(4161);
  ui.overlay = (g) => { tiles.forEach((t2, i) => { const gm = page4[i]; if (!gm) return; const im = gm.logo && imgs[gm.logo]; const b = t2.btn; g.save(); g.globalAlpha = gm.lock ? 0.45 : 1; if (im) { const sc = Math.min((b.w - 24) / im.width, (b.h - 34) / im.height); g.drawImage(im, b.abs[0] + (b.w - im.width * sc) / 2, b.abs[1] + 8, im.width * sc, im.height * sc); } g.restore();
    if (f) { const label = gm.lock ? (gm.hint || 'locked') : gm.name; const c = label.length > 34 ? label.slice(0, 34) + '…' : label; f.draw(g, c, b.abs[0] + (b.w - f.width(c)) / 2, b.abs[1] + b.h - 8, gm.lock ? '#b9c3e6' : '#fff'); } }); const pg = `${arcadePage + 1} / ${pages}`; if (f) f.draw(g, pg, 665 - f.width(pg), 206, '#9fc4ff'); };
  showUI(ui);
}
function achievementsMenu() {
  const p = me(); const rows = CHALLENGES.map((k) => { const done = p.unlocked[k]; const text = done ? tx(59, 'Unlocked' + k) : tx(59, 'ToUnlock' + k); const np = !PORTED.has(k) ? ' <small>(game not yet ported)</small>' : '';
    return `<div class="row ${done ? 'done' : ''}"><b>${done ? '✔' : '○'} ${tx(59, k, k)}</b><span>${text}${done ? '' : np}</span></div>`; }).join('');
  panel(`<h1>${tx(67, 'Achievements', 'ACHIEVEMENTS')}</h1><div class="list">${rows}</div><div class="col">${btn('back', tx(67, 'Back', 'BACK'))}</div>`); bind('back', mainMenu);
}
function leaderboards() {
  const rows = save.scores.slice().sort((a, b) => b.score - a.score).slice(0, 10).map((s, i) => `<div class="row"><b>${i + 1}. ${s.name}</b><span>${s.mode === 'classic' ? 'Classic' : '3 Strikes'} — $${s.score.toLocaleString('en-US')}</span></div>`).join('') || '<p>No scores yet — play a show!</p>';
  panel(`<h1>${tx(67, 'Leaderboards', 'LEADERBOARDS')}</h1><div class="list">${rows}</div><div class="col">${btn('back', tx(67, 'Back', 'BACK'))}</div>`); bind('back', mainMenu);
}
function profileMenu(first) {
  const names = Object.keys(save.profiles); const p = save.current ? me() : null;
  panel(`<h1>${first === true ? 'WHAT\'S YOUR NAME?' : tx(67, 'MyProfile', 'MY PROFILE')}</h1>
    ${p ? `<div class="who"><div style="text-align:left"><b>${p.name}</b><br>${tx(59, 'Rank' + rankOf(p.winnings))}<br>Shows ${p.shows} · Games won ${p.wins} · Winnings $${p.winnings.toLocaleString('en-US')}</div></div>` : ''}
    <div class="col"><input id="pname" maxlength="14" placeholder="Enter a name" value="">${btn('create', tx(67, 'Create', 'CREATE') + ' / ' + tx(67, 'Select', 'SELECT'))}
    ${names.length ? `<p class="small">${tx(67, 'ChangePlayer', 'CHANGE PLAYER')}:</p>${names.map((n) => `<button class="game pl" data-n="${n}">${n}</button>`).join('')}` : ''}
    ${save.current ? btn('back', tx(67, 'Back', 'BACK')) : ''}</div>`);
  document.querySelectorAll('.pl').forEach((b) => { b.onclick = () => { save.current = b.dataset.n; persist(); mainMenu(); }; });
  bind('create', () => { const n = $('pname').value.trim(); if (!n) return; if (save.profiles[n] && save.current !== n && !names.includes(n)) { toast(tx(67, 'DuplicateProfileName')); return; } if (!save.profiles[n]) save.profiles[n] = blank(n); save.current = n; persist(); mainMenu(); });
  bind('back', mainMenu);
}
async function optionsMenu() {   // real screen 025: Options window (89e7 > d817 sliders, 1b87 full-screen checkbox + Done/About)
  const o = save.options; const base = await getUI(67); await setupMain(base); for (const n of base.all.values()) if (n.class === 'button') base.disabled.add(n.inst); base.handlers.clear();
  const ui = await getUI(25); const pick = (pre) => ui.all.get([...ui.all.keys()].find((k) => k.startsWith(pre))); const top = ui.root.children[0];
  for (const c of top.children) if (c.class === 'container') ui.hide(c.inst);
  ui.show(pick('89e7').inst, pick('d817').inst); ui.hide(pick('2ec2').inst); ui.below = base; { const prev = base.overlay; base.overlay = (g) => { prev?.(g); g.fillStyle = 'rgba(0,0,0,.72)'; g.fillRect(0, 0, 800, 600); }; }   // BlackFiller is opaque in the data: used here as a dim over the menu for (const k of ['573d', '62e1', '4848']) ui.hide(pick(k).inst);
  const panel0 = pick('d817'); const sliders = [['cd9c', '92d5', '3e61', () => o.music, (v) => { o.music = v; applyOptions(); }, 'Music'], ['7f16', '5e85', '3001', () => o.speech, (v) => { o.speech = v; applyOptions(); }, 'Voice'], ['55bf', '742c', '1aa8', () => o.sfx ?? 0.8, (v) => { o.sfx = v; }, 'SoundEffects']];
  for (const [tr, kn, lb, get, set, name] of sliders) { const track = pick(tr), knob = pick(kn), label = pick(lb); ui.setText(label.inst, tx(25, name, name === 'SoundEffects' ? 'Sound FX' : name).toUpperCase()); const img = track.children[0];
    const place = () => { const v = get(); img.crop = v; knob.x = track.x + v * track.w - knob.w / 2; };
    place(); ui.drags.set(knob.inst, { move: (px) => { const v = Math.min(1, Math.max(0, (px - panel0.abs[0] - track.x) / track.w)); set(v); place(); }, done: persist }); }
  ui.show(pick('1b87').inst); const fsLabel = ui.all.get([...pick('1b87').children].find((c) => c.class === 'label')?.inst); if (fsLabel) ui.setText(fsLabel.inst, tx(25, 'FullScreen', 'FULL SCREEN'));
  const fsBtn = pick('1b87').children.find((c) => c.class === 'button' && !reg.by[c.text]);
  if (fsBtn) ui.handlers.set(fsBtn.inst, () => { if (document.fullscreenElement) document.exitFullscreen?.(); else document.documentElement.requestFullscreen?.().catch(() => {}); });
  ui.handlers.set(pick('2c7c').inst, () => { persist(); mainMenu(); }); ui.handlers.set(pick('4c28').inst, () => helpMenu());
  showUI(ui);
}
function helpMenu() {   // reached from Options > About: how to play (the game's own tutorial text), captions, tutorial replay, erase data
  const o = save.options; const lines = ['Single_1', 'Single_2', 'Single_3', 'Single_4', 'Single_5', 'Single_6', 'Single_7'].map((k) => `<p>${tx(27, 'Transition_' + k)}</p>`).join('');
  panel(`<h1>${tx(25, 'About', 'ABOUT').toUpperCase()} / HOW TO PLAY</h1><div class="list" style="text-align:left">${lines}<p>${tx(27, 'Transition_Classic_3')}</p><p>${tx(27, 'Transition_Classic_5')}</p></div>
    <div class="col"><label><input id="oc" type="checkbox" ${o.captions ? 'checked' : ''}> Captions</label>${btn('reset', 'ERASE SAVED DATA')}${btn('back', tx(25, 'Done', 'DONE'))}</div>`);
  $('oc').onchange = (e) => { o.captions = e.target.checked; persist(); applyOptions(); };
  bind('reset', () => { if (confirm('Erase all profiles, scores and unlocks?')) { save = { profiles: {}, current: null, options: o, scores: [] }; persist(); mainMenu(); } });
  bind('back', optionsMenu);
}
async function credits() {
  const names = Object.keys(T[67] || {}).filter((k) => /^Credits\d+$/.test(k)).sort(); const lines = names.map((k) => T[67][k].replace(/\r?\n/g, ' ').trim()).filter((x) => x);
  panel(`<h1>CREDITS</h1><div class="list" style="text-align:left;max-height:60vh">${lines.map((l) => `<p>${l.replace(/</g, '&lt;')}</p>`).join('')}</div><div class="col">${btn('back', tx(67, 'Back', 'BACK'))}</div>`); bind('back', mainMenu);
}

// ------------------------------------------------------------------ the show
const state = { mode: 'strikes', strikes: 0, winnings: 0, round: 1, won: 0, chances: 6 };
function hud() { const h = $('shud'); h.style.display = 'block'; h.innerHTML = `<span>${state.mode === 'classic' ? `Chances ${state.chances}` : `Strikes ${'✖'.repeat(state.strikes)}${'·'.repeat(3 - state.strikes)}`}</span> · <span>Winnings $${state.winnings.toLocaleString('en-US')}</span> <button id="hmenu">MENU</button>`;
  $('hmenu').onclick = () => { quitting = true; }; }

async function playGame(name) {
  const G = GAMES[name]; await loadModule(name); await until(() => { const s = window[G.key]; return s && G.done(s) ? s : null; }); const s = window[G.key]; const won = G.won(s); const extra = G.extra ? G.extra(s) : false; const cash = gameWinnings(name, s, won); await wait(3500); return { won, extra, cash };
}
async function runShow(mode) {
  const p = me(); Object.assign(state, { mode, strikes: 0, winnings: 0, round: 1, won: 0, chances: 6 }); inShow = true; quitting = false; stopMusic(); hud(); uiOff(); hide(); await au.unlock();
  let ended = 'over'; const ob = { gotShowcase: false };
  try {
    for (;;) {
      hud(); if (mode === 'classic' && state.chances < 6) { au.say(`Speech_ContestantsRow_ClassicChance${Math.max(1, state.chances)}`); }
      await loadModule('contestantsrow'); const cr = await until(() => window.__cr && window.__cr.done ? window.__cr : null);
      if (!cr.won) {
        if (mode === 'classic') { state.chances--; hud(); if (state.chances <= 0) break; }
        else { state.strikes++; hud(); if (state.strikes >= 3) break; }
        state.round++; continue;
      }
      if (cr.diff != null && cr.diff <= 50) unlock('ContestantsRow'); state.winnings += rowWinnings(cr); hud();
      const avail = PRICING.filter((k) => !GAMES[k].unlock || me().unlocked[GAMES[k].unlock] || true); const name = avail[(Math.random() * avail.length) | 0];
      const g = await playGame(name);
      const prize = g.cash; // null means this game's prize value is not connected yet
      if (g.won) { state.winnings += prize ?? 0; state.won++; me().wins++; if (GAMES[name].unlock) unlock(GAMES[name].unlock); if (name === 'shellgame' && g.extra) unlock('ShellGame'); }
      else if (g.cash > 0) state.winnings += g.cash;
      hud();
      await loadModule('bigwheel'); const bw = await until(() => window.__bw && window.__bw.phase === 6 ? window.__bw : null); await wait(3500);
      if (bw.totals && bw.totals[0] === 100) unlock('ShowcaseShowdown'); const wheelWon = bw.win === 0;
      if (!wheelWon) { if (mode === 'classic') break; state.round++; continue; }
      await loadModule('showcase'); const sc = await until(() => window.__sc2 && window.__sc2.done ? window.__sc2 : null); state.winnings += sc.prize; hud();
      if (sc.won && sc.diff != null && sc.diff <= 1000) unlock('Showcase'); if (sc.won && mode === 'strikes') unlock('ThreeStrikes'); ob.gotShowcase = true;
      if (mode === 'classic') { ended = 'done'; break; } state.round++;
    }
  } catch (e) { if (e.message !== 'quit') throw e; ended = 'quit'; }
  teardown(); $('shud').style.display = 'none'; inShow = false; if (ended === 'quit') return mainMenu();
  const pr = me(); pr.shows++; pr.winnings += state.winnings; const prev = pr.high[mode]; const newHigh = state.winnings > prev; if (newHigh) pr.high[mode] = state.winnings; save.scores.push({ name: pr.name, mode, score: state.winnings, t: Date.now() }); save.scores = save.scores.sort((a, b) => b.score - a.score).slice(0, 50); persist();
  mainMenu();
}
async function playArcade(k) {
  quitting = false; inShow = true; stopMusic(); $('shud').style.display = 'block'; $('shud').innerHTML = `<span>Arcade — ${GAMES[k].name}</span> <button id="hmenu">MENU</button>`; $('hmenu').onclick = () => { quitting = true; };
  try { uiOff(); hide(); const g = await playGame(k); if (g.won && GAMES[k].unlock) unlock(GAMES[k].unlock); } catch (e) { if (e.message !== 'quit') throw e; }
  teardown(); $('shud').style.display = 'none'; inShow = false; arcadeMenu();
}

// ------------------------------------------------------------------ boot
applyOptions(); window.__show = state; window.__save = () => save;
if (!save.current) { save.current = 'Player'; save.profiles.Player ||= blank('Player'); persist(); }
mainMenu().catch(fail);
function fail(e) { console.error(e); $('err').style.display = 'flex'; $('err').textContent = 'Something went wrong: ' + e + ' (the retail game files must be placed next to this page)'; }
window.addEventListener('unhandledrejection', (e) => { if (!String(e.reason).includes('quit')) fail(e.reason); });
