// GWVideo sprite animations + J32 alpha decoding. EVIDENCE: docs/FORMATS.md (.GWVideo, .j32). Frame table parsed by the Rust crate (tp_video_json).
// J32 = "J321" + JPEG (colour) + 8-bit grayscale PNG (alpha mask, same size).  Plain PNG frames (type 0x10) already carry alpha.
const PNG = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
function lastPng(b) { outer: for (let i = b.length - 8; i > 0; i--) { for (let k = 0; k < 8; k++) if (b[i + k] !== PNG[k]) continue outer; return i; } return -1; }
export async function decodeJ32(b) {   // b: bytes starting at the 'J321' tag (or at the JPEG). Returns an ImageBitmap with alpha.
  if (b[0] === 0x4a && b[1] === 0x33 && b[2] === 0x32) b = b.subarray(4);
  const p = lastPng(b); if (p < 0) return createImageBitmap(new Blob([b]));
  const [col, a] = await Promise.all([createImageBitmap(new Blob([b.subarray(0, p)])), createImageBitmap(new Blob([b.subarray(p)]))]);
  const c = new OffscreenCanvas(col.width, col.height), g = c.getContext('2d', { willReadFrequently: true }); g.drawImage(col, 0, 0); const d = g.getImageData(0, 0, col.width, col.height);
  const m = new OffscreenCanvas(col.width, col.height), mg = m.getContext('2d', { willReadFrequently: true }); mg.drawImage(a, 0, 0, col.width, col.height); const md = mg.getImageData(0, 0, col.width, col.height).data;
  for (let i = 0; i < d.data.length; i += 4) d.data[i + 3] = md[i]; g.putImageData(d, 0, 0); return createImageBitmap(c);
}
export class Sprite {   // a GWVideo: `frames` ticks at `fps`; one stored image is held for the whole length
  static async load(ex, url) {
    const bytes = new Uint8Array(await (await fetch(url)).arrayBuffer()); const p = ex.tp_alloc(bytes.length); new Uint8Array(ex.memory.buffer, p, bytes.length).set(bytes);
    const jp = ex.tp_video_json(p, bytes.length); if (!jp) throw new Error('bad GWVideo ' + url); const m = new Uint8Array(ex.memory.buffer); let e = jp; while (m[e]) e++;
    const meta = JSON.parse(new TextDecoder().decode(m.slice(jp, e))); const s = new Sprite(); s.frames = meta.frames; s.fps = meta.fps;
    s.meta = meta.images; s.imgs = await Promise.all(meta.images.map((i) => (i.k & 2) ? decodeJ32(bytes.subarray(i.o, i.o + i.l)) : createImageBitmap(new Blob([bytes.subarray(i.o, i.o + i.l)]))));
    s.w = meta.images[0].w; s.h = meta.images[0].h; return s;   // canvas size; frames are trimmed and placed at (x,y) inside it
  }
  get ms() { return this.frames * 1000 / this.fps; }
  index(tMs, loop = false) { let t = Math.floor(tMs * this.fps / 1000); return loop ? t % this.frames : Math.min(t, this.frames - 1); }
  frame(g, i, x, y, w = this.w, h = this.h) { i = Math.max(0, Math.min(this.imgs.length - 1, i)); const m = this.meta[i], sx = w / m.w, sy = h / m.h; g.drawImage(this.imgs[i], x + m.x * sx, y + m.y * sy, this.imgs[i].width * sx, this.imgs[i].height * sy); }
  draw(g, tMs, x, y, w = this.w, h = this.h, loop = false) { const i = this.index(tMs, loop), m = this.meta[i], sx = w / m.w, sy = h / m.h; g.drawImage(this.imgs[i], x + m.x * sx, y + m.y * sy, this.imgs[i].width * sx, this.imgs[i].height * sy); }
}
// Full-screen WebM clip (converted Theora, tools/convert_video.sh). Resolves when it ends or is clicked/skipped.
export function playClip(url, { muted = true, fit = 'contain' } = {}) {
  return new Promise((res) => { const v = document.createElement('video'); v.src = url; v.muted = muted; v.playsInline = true; v.autoplay = true;
    v.style.cssText = `position:fixed;inset:0;width:100%;height:100%;object-fit:${fit};background:#000;z-index:40`; const done = () => { v.remove(); res(); };
    v.onended = done; v.onerror = done; v.onclick = done; document.body.appendChild(v); v.play().catch(done); });
}
