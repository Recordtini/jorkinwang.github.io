// Generic GWScreen UI runtime: draws the game's own screen layouts (widget trees from the GWScreen trailer) on an 800x600 canvas.
// EVIDENCE (docs/FORMATS.md "GWScreen widgets"): containers carry the number of direct child records that follow; Image.res / Button.res are global resource ids
// (Button.res = a Style entry: 4 x 38-byte state records {u16 image, ffffffff, 8 zero, u16 font, rgba} = normal, pressed, over, disabled); ids are file numbers.
import { Font } from './font.js?v=2';
import { decodeJ32 } from './video.js';
const SCREENS = Array.from({ length: 80 }, (_, i) => i + 1);
// Extracted GW image frames retain their 16-byte big-endian crop rectangle
// after the PNG IEND. x/y locate the trimmed pixels in the original canvas.
export function imagePlacement(bytes) {
  const n=bytes.length; if(n<18) return null;
  const i=n-28;
  const png=i>=0 && bytes[i]===0 && bytes[i+1]===0 && bytes[i+2]===0 && bytes[i+3]===0 &&
     bytes[i+4]===73 && bytes[i+5]===69 && bytes[i+6]===78 && bytes[i+7]===68;
  const jpeg=bytes[n-18]===255 && bytes[n-17]===217;
  if(!png && !jpeg) return null;
  const v=new DataView(bytes.buffer,bytes.byteOffset+n-16,16);
  const x=v.getUint32(0),y=v.getUint32(4),w=v.getUint32(8),h=v.getUint32(12);
  return w>0 && h>0 && x<w && y<h && w<=16384 && h<=16384 ? {x,y,w,h} : null;
}
function drawPlaced(g,b,x,y,w,h,m) {
  if (!m) { g.drawImage(b,x,y,w,h); return; }
  const sx=w/m.w, sy=h/m.h;
  g.drawImage(b,x+m.x*sx,y+m.y*sy,b.width*sx,b.height*sy);
}
export class Reg {                      // all manifests: resource id -> entry (name, type, text, style body), plus file index
  static async load(ex, idx) {
    const r = new Reg(); r.ex = ex; r.idx = idx; r.by = {}; r.scr = {}; r.imgs = new Map(); r.fonts = new Map(); r.meta = new Map();
    await Promise.all(SCREENS.map(async (n) => { try { const jb = new Uint8Array(await (await fetch(`zip/${String(n).padStart(3, '0')}/GWScreen`)).arrayBuffer()); const S = Reg.parse(ex, jb); r.scr[n] = S; for (const e of S.entries) (r.by[e.id] ||= e).scr ??= n; } catch (e) { /* missing screen */ } }));
    return r;
  }
  static parse(ex, jb) { const p = ex.tp_alloc(jb.length); new Uint8Array(ex.memory.buffer, p, jb.length).set(jb); const jp = ex.tp_screen_json(p, jb.length); const m = new Uint8Array(ex.memory.buffer); let e = jp; while (m[e]) e++; return JSON.parse(new TextDecoder().decode(m.slice(jp, e))); }
  async img(id) { if (!id || !this.idx[id]) return null; if (this.imgs.has(id)) return this.imgs.get(id); const f = this.idx[id]; const pr = (async () => { try { const b = new Uint8Array(await (await fetch('zip/' + f)).arrayBuffer()); const meta=imagePlacement(b); if(meta) this.meta?.set(id,meta); return f.endsWith('.j32') ? await decodeJ32(b) : await createImageBitmap(new Blob([b])); } catch (e) { return null; } })(); this.imgs.set(id, pr); return pr; }
  async font(id) { if (this.fonts.has(id)) return this.fonts.get(id); const f = this.idx[id]; const pr = (async () => { try { return f ? await Font.load(this.ex, 'zip/' + f) : null; } catch (x) { return null; } })(); this.fonts.set(id, pr); return pr; }
  text(id) { const e = this.by[id]; return e && e.text != null ? e.text.replace(/\r?\n/g, ' ') : null; }
  style(id) { const e = this.by[id]; if (!e || e.type !== 6 || !e.body) return null; const b = e.body.match(/../g).map((h) => parseInt(h, 16)); const u16 = (o) => (b[o] << 8) | b[o + 1];
    return [0, 1, 2, 3].map((i) => { const o = 4 + 38 * i; return { img: u16(o), font: u16(o + 14), rgba: b.slice(o + 16, o + 20) }; }); }   // normal, pressed, over, disabled
}
export class UI {
  constructor(reg, scr) { this.reg = reg; this.scr = scr; this.S = reg.scr[scr]; this.vis = new Map(); this.txt = new Map(); this.handlers = new Map(); this.hover = null; this.down = null; this.disabled = new Set(); this.fills = new Map(); this.overlay = null; this.root = this.build(); }
  build() {   // rebuild the tree from the flat pre-order list: a container's `kids` = number of direct children that follow (each with its own subtree)
    const W = this.S.widgets; let i = 0; const node = () => { const w = W[i++]; const n = { ...w, children: [], abs: [0, 0] }; if (w.class === 'container') for (let k = 0; k < w.kids && i < W.length; k++) n.children.push(node()); return n; };
    const roots = []; while (i < W.length) roots.push(node()); const root = { class: 'container', inst: 'root', x: 0, y: 0, w: 800, h: 600, vis: true, children: roots }; this.all = new Map(); const walk = (n) => { this.all.set(n.inst, n); n.children.forEach(walk); }; walk(root); return root;
  }
  addButton(parent, { inst, x, y, w, h, res }) { const n = { class: 'button', inst, x, y, w, h, vis: true, res, text: 0, kids: 0, children: [], abs: [0, 0] }; parent.children.push(n); this.all.set(inst, n); return n; }
  find(pred) { const out = []; for (const n of this.all.values()) if (pred(n)) out.push(n); return out; }
  buttons(textName) { return this.find((n) => n.class === 'button' && this.reg.by[n.text]?.name === textName); }
  isVisible(n) { return this.vis.has(n.inst) ? this.vis.get(n.inst) : n.vis; }
  show(...insts) { insts.forEach((i) => this.vis.set(i, true)); } hide(...insts) { insts.forEach((i) => this.vis.set(i, false)); }
  setText(inst, s) { this.txt.set(inst, s); }
  async preload() { const ids = new Set(), fonts = new Set(); for (const n of this.all.values()) { if (n.class === 'image' && n.res) ids.add(n.res); if (n.class === 'button') { const st = this.reg.style(n.res); if (st) st.forEach((s) => { ids.add(s.img); fonts.add(s.font); }); } if (n.class === 'label' && n.res) fonts.add(n.res); }
    await Promise.all([...[...ids].map(async (i) => this.reg.imgs.set(i, await this.reg.img(i))), ...[...fonts].map(async (f) => this.reg.fonts.set(f, await this.reg.font(f)))]); return this; }
  draw(g, mx = -1, my = -1, mode = 'all') {   // mode: 'all' | 'nobtn' (everything but buttons) | 'btn' (only buttons) - lets a game draw its own art between the two
    if (mode !== 'nobtn') this.hover = null; const walk = (n, ox, oy) => { if (!this.isVisible(n) && n !== this.root) return; const x = ox + n.x, y = oy + n.y; n.abs = [x, y];
      if (n.class === 'image' && mode !== 'btn') { const im = this.reg.imgs.get(n.res); const b = im && im.then ? null : im; if (b) { if (n.crop != null) g.drawImage(b, 0, 0, Math.max(1, b.width * n.crop), b.height, x, y, (n.w || b.width) * n.crop, n.h || b.height); else drawPlaced(g,b,x,y,n.w || b.width,n.h || b.height,this.reg.meta?.get(n.res)); } else if (im && im.then) im.then((v) => this.reg.imgs.set(n.res, v)); }
      else if (n.class === 'button' && mode !== 'nobtn') { const st = this.reg.style(n.res); const inside = mx >= x && mx < x + n.w && my >= y && my < y + n.h; const dis = this.disabled.has(n.inst); if (inside && !dis) this.hover = n;
        const si = dis ? 3 : (inside && this.down === n) ? 1 : inside ? 2 : 0; const s = st && st[si]; const b = s && this.reg.imgs.get(s.img); if (b && !b.then) drawPlaced(g,b,x,y,n.w,n.h,this.reg.meta?.get(s.img)); else if (b && b.then) b.then((v) => this.reg.imgs.set(s.img, v));
        const label = this.txt.get(n.inst) ?? this.reg.by[n.text]?.text ?? ''; if (label && s) { const f = this.reg.fonts.get(s.font); if (f && !f.then) { const c = s.rgba; const col = `rgba(${c[0]},${c[1]},${c[2]},${c[3] / 255})`; const lines = label.toUpperCase().split(/\r?\n/).map(t=>t.trim()).filter(Boolean); const lineHeight=f.lineHeight || 20; const widest=Math.max(1,...lines.map(t=>f.width(t))); const scale=Math.min(1,(n.w-16)/widest,(n.h-12)/(lineHeight*lines.length)); g.save(); g.translate(x+n.w/2,y+n.h/2); g.scale(scale,scale); lines.forEach((t,i)=>f.draw(g,t,-f.width(t)/2,(i-(lines.length-1)/2)*lineHeight+7,col)); g.restore(); } } }
      else if (n.class === 'rect' && mode !== 'btn' && this.fills.has(n.inst)) { const f = this.fills.get(n.inst); g.save(); g.fillStyle = f.fill; g.strokeStyle = f.stroke || 'transparent'; g.lineWidth = 3; g.beginPath(); g.roundRect(x, y, n.w, n.h, f.r ?? 18); g.fill(); if (f.stroke) g.stroke(); g.restore(); }
      else if (n.class === 'label' && mode !== 'btn') { const f = this.reg.fonts.get(n.res); const t = this.txt.get(n.inst); if (t && f && !f.then) f.draw(g, t, x + (this.labelCenter ? (n.w - f.width(t)) / 2 : 0), y + n.h / 2 + 10, this.labelColor || '#fff'); }
      n.children.forEach((c) => walk(c, x, y)); }; walk(this.root, 0, 0); if (this.overlay && mode !== 'nobtn') this.overlay(g);
  }
  hit(x, y) { let best = null; const walk = (n) => { if (!this.isVisible(n) && n !== this.root) return; if (n.class === 'button' && !this.disabled.has(n.inst) && x >= n.abs[0] && x < n.abs[0] + n.w && y >= n.abs[1] && y < n.abs[1] + n.h) best = n; n.children.forEach(walk); }; walk(this.root); return best; }
}
