// TPIR bitmap text: GWFont atlas (8-bit PNG used as alpha) + glyph metrics parsed by the wasm engine.
export class Font {
  static async load(ex, url) {
    const b = new Uint8Array(await (await fetch(url)).arrayBuffer()); const p = ex.tp_alloc(b.length); new Uint8Array(ex.memory.buffer, p, b.length).set(b);
    const jp = ex.tp_font_json(p, b.length); if (!jp) throw new Error('bad font ' + url); const m = new Uint8Array(ex.memory.buffer); let e = jp; while (m[e]) e++;
    const f = new Font(); Object.assign(f, JSON.parse(new TextDecoder().decode(m.slice(jp, e))));
    f.map = new Map(f.glyphs.map((g) => [g[0], g])); const img = await createImageBitmap(new Blob([b], { type: 'image/png' }));
    f.atlas = new OffscreenCanvas(img.width, img.height); const c = f.atlas.getContext('2d'); c.drawImage(img, 0, 0);
    const d = c.getImageData(0, 0, img.width, img.height); for (let i = 0; i < d.data.length; i += 4) { const v = d.data[i]; d.data[i] = d.data[i + 1] = d.data[i + 2] = 255; d.data[i + 3] = v; } c.putImageData(d, 0, 0);
    return f;
  }
  width(s) { let w = 0; for (const ch of s) { const g = this.map.get(ch.codePointAt(0)) || this.map.get(32); if (g) w += g[2]; } return w; }
  /** Draw `s` with its baseline at y. colour = CSS colour (atlas alpha is tinted). */
  draw(ctx, s, x, y, colour = '#fff') {
    if (!this.tint || this.tintColour !== colour) { this.tint = new OffscreenCanvas(this.atlas.width, this.atlas.height); const t = this.tint.getContext('2d'); t.drawImage(this.atlas, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = colour; t.fillRect(0, 0, this.atlas.width, this.atlas.height); this.tintColour = colour; }
    let pen = x;
    for (const ch of s) { const g = this.map.get(ch.codePointAt(0)) || this.map.get(32); if (!g) continue; const [, top, adv, bottom, w, ax, ay, xoff] = g; const h = bottom - top - 1;
      ctx.drawImage(this.tint, ax, ay, w, h, pen + xoff - 1, y + top, w, h); pen += adv; }
    return pen - x;
  }
}
