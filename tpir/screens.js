// TPIR 2D screen viewer: the wasm engine parses a GWScreen manifest+layout; widgets are drawn with the real art on an 800x600 canvas.
const idx = await (await fetch('zip-index.json')).json();
const wasm = await WebAssembly.instantiateStreaming(fetch('tpir.wasm'), {}); const ex = wasm.instance.exports; const mem = () => ex.memory.buffer;
const cv = document.getElementById('c'), g = cv.getContext('2d'), sel = document.getElementById('scr'), info = document.getElementById('info'), msg = document.getElementById('msg');
const put = (b) => { const p = ex.tp_alloc(b.length); new Uint8Array(mem(), p, b.length).set(b); return p; };
const imgs = new Map();
async function img(id) {
  if (imgs.has(id)) return imgs.get(id); const f = idx[id]; if (!f) { imgs.set(id, null); return null; }
  let b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer());
  if (f.endsWith('.j32')) b = b.slice(4);               // 'J321' + JPEG
  const bmp = await createImageBitmap(new Blob([b])).catch(() => null); imgs.set(id, bmp); return bmp;
}
for (let i = 1; i <= 80; i++) sel.add(new Option(String(i).padStart(3, '0'), String(i).padStart(3, '0')));
async function show(n) {
  const b = new Uint8Array(await (await fetch(`zip/${n}/GWScreen`)).arrayBuffer()); const p = ex.tp_screen_json(put(b), b.length);
  if (!p) { msg.textContent = 'parse failed'; return; }
  const m = new Uint8Array(mem()); let e = p; while (m[e]) e++; const S = JSON.parse(new TextDecoder().decode(m.slice(p, e)));
  const names = Object.fromEntries(S.entries.map((x) => [x.id, x])); g.fillStyle = '#334'; g.fillRect(0, 0, 800, 600); g.save(); g.beginPath(); g.rect(0, 0, 800, 600); g.clip();
  let drawn = 0, miss = 0;
  for (const w of S.widgets) {
    if (!w.vis) continue;
    if (w.class === 'image' || w.class === 'button') {
      const im = w.res ? await img(w.res) : null;
      if (im) { g.drawImage(im, w.x, w.y, w.w || im.width, w.h || im.height); drawn++; } else if (w.res) miss++;
      if (w.class === 'button' && w.text && names[w.text]) { g.fillStyle = '#ff0'; g.font = 'bold 16px sans-serif'; g.fillText(names[w.text].text || names[w.text].name, w.x + 8, w.y + w.h / 2 + 6); }
    }
    if (document.getElementById('boxes').checked) { g.strokeStyle = { container: '#0f0', image: '#0af', button: '#f80', label: '#f0f', rect: '#ff0' }[w.class] || '#fff'; g.strokeRect(w.x + .5, w.y + .5, w.w, w.h); }
  }
  g.restore(); msg.textContent = `${S.entries.length} entries, ${S.widgets.length} widgets, ${drawn} images drawn, ${miss} unresolved ids`;
  info.textContent = S.entries.filter((x) => x.type === 5).slice(0, 12).map((x) => `${x.name}: ${x.text}`).join('\n');
  window.__ready = true;
}
sel.onchange = () => show(sel.value); document.getElementById('boxes').onchange = () => show(sel.value);
const q = new URLSearchParams(location.hash.slice(1)); if (q.get('s')) sel.value = q.get('s');
await show(sel.value);
