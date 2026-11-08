// Small shared toolkit for the simpler pricing games: wasm + the game's own screen assets (by name) + audio events + number entry.
import { Audio } from './audio.js?v=2'; import { Font } from './font.js?v=2'; import { Reg } from './ui.js';
export async function kit(screen) {
  const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
  const idx = await (await fetch('zip-index.json')).json(); const cv = document.getElementById('c'), g = cv.getContext('2d'); const reg = await Reg.load(ex, idx);
  const au = new Audio(ex, idx); await au.addScreens([screen, 3]); const font = await Font.load(ex, 'zip/059/004161_0.GWFont'); const font2 = await Font.load(ex, 'zip/059/004162_0.GWFont');
  const K = { ex, mem, idx, cv, g, reg, au, font, font2, caption: '', ptr: { x: -1, y: -1 }, clicks: [] };
  au.onCaption = (t) => { K.caption = t; }; for (const e of ['pointerdown', 'keydown']) addEventListener(e, () => au.unlock());
  const pt = (e) => { const r = cv.getBoundingClientRect(); return { x: (e.clientX - r.left) * 800 / r.width, y: (e.clientY - r.top) * 600 / r.height }; };
  cv.onpointermove = (e) => { K.ptr = pt(e); }; cv.onpointerdown = (e) => { K.ptr = pt(e); K.clicks.push(K.ptr); };
  K.img = async (name) => { const e = reg.scr[screen].entries.find((x) => x.type === 3 && x.name === name); return e ? reg.img(e.id) : null; };
  K.product = async (dir, p) => createImageBitmap(await (await fetch(`${dir}/Product_${String(p.id).padStart(6, '0')}.jpg`)).blob());
  K.pump = (fn) => { const p = fn(); if (!p) return; const m = new Uint8Array(mem()); let o = p; for (;;) { let e = o; while (m[e]) e++; if (e === o) break; au.say(new TextDecoder().decode(m.slice(o, e))); o = e + 1; } };
  K.f32 = (fn, n = 24) => { const p = fn(); return new Float32Array(mem().slice(p, p + 4 * n)); };
  K.idle = () => !au.speaking && !au.speechQ.length;
  K.drawCaption = () => { if (K.caption) font.caption(g, K.caption); };
  K.contain = (im, x, y, w, h) => { const sc = Math.min(w / im.width, h / im.height); g.drawImage(im, x + (w - im.width * sc) / 2, y + (h - im.height * sc) / 2, im.width * sc, im.height * sc); };
  K.text = (t, x, y, col = '#fff', big = false) => (big ? font2 : font).draw(g, t, x, y, col);
  K.center = (t, y, col = '#fff', big = false) => { const f = big ? font2 : font; f.draw(g, t, 400 - f.width(t) / 2, y, col); };
  K.money = (v) => '$' + Math.round(v).toLocaleString('en-US'); K.cents = (c) => '$' + (c / 100).toFixed(2);
  K.ask = (label = 'Price? $', step = 1) => new Promise((res) => { const box = document.getElementById('in'), inp = document.getElementById('g'); box.firstChild.textContent = label + ' '; inp.step = step; box.style.display = 'block'; inp.value = ''; inp.focus();
    const go = () => { const v = +inp.value; if (!(v >= 0) || inp.value === '') return; box.style.display = 'none'; res(v); }; document.getElementById('ok').onclick = go; inp.onkeydown = (e) => { if (e.key === 'Enter') go(); }; });
  return K;
}
