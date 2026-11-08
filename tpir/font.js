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
  // Provisional optical spacing until the retail kerning table is decoded.
  advance(ch, g) { return ch === ' ' ? g[2] + 2 : Math.max(1, g[2] - 2); }
  width(s) { let w = 0; for (const ch of s) { const g = this.map.get(ch.codePointAt(0)) || this.map.get(32); if (g) w += this.advance(ch, g); } return w; }
  caption(ctx, text) {
    // Browser text shaping provides consistent word and character spacing while
    // the retail bitmap font's remaining layout data is being decoded.
    ctx.save();
    ctx.font = 'bold 20px "Arial Narrow", Arial, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    const lines = []; let line = '';
    for (const word of text.trim().split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > 760) { lines.push(line); line = word; } else line = candidate;
    }
    if (line) lines.push(line);
    const lineHeight = 24, height = Math.max(52, lines.length * lineHeight + 14);
    ctx.fillStyle = 'rgba(0,0,0,.7)'; ctx.fillRect(0, 600-height, 800, height);
    ctx.fillStyle = '#fff';
    lines.forEach((s, i) => ctx.fillText(s, 400, 600-height+height/2+(i-(lines.length-1)/2)*lineHeight));
    ctx.restore();
  }
  // Retail footage shows a two-line dialogue panel whose text is revealed
  // progressively during speech. Timing is proportional, not word-aligned.
  retailCaption(ctx, text, progress = 1) {
    ctx.save(); ctx.font = '20px "Arial Narrow", Arial, sans-serif';
    const full = text.trim(), visible = full.slice(0, Math.ceil(full.length * Math.max(0, Math.min(1, progress))));
    const lines = []; let line = '';
    for (const word of visible.split(/\s+/)) {
      const candidate = line ? `${line} ${word}` : word;
      if (line && ctx.measureText(candidate).width > 620) { lines.push(line); line = word; } else line = candidate;
    }
    if (line) lines.push(line);
    ctx.fillStyle = 'rgba(17,18,25,.82)'; ctx.strokeStyle = '#aeb4c0'; ctx.lineWidth = 2;
    ctx.beginPath(); ctx.roundRect(50, 478, 700, 90, 7); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.textAlign = 'left'; ctx.textBaseline = 'top';
    lines.slice(-2).forEach((s, i) => ctx.fillText(s, 122, 486 + i * 27));
    ctx.restore();
  }
  /** Draw `s` with its baseline at y. colour = CSS colour (atlas alpha is tinted). */
  draw(ctx, s, x, y, colour = '#fff') {
    if (!this.tint || this.tintColour !== colour) { this.tint = new OffscreenCanvas(this.atlas.width, this.atlas.height); const t = this.tint.getContext('2d'); t.drawImage(this.atlas, 0, 0); t.globalCompositeOperation = 'source-in'; t.fillStyle = colour; t.fillRect(0, 0, this.atlas.width, this.atlas.height); this.tintColour = colour; }
    let pen = x;
    for (const ch of s) { const g = this.map.get(ch.codePointAt(0)) || this.map.get(32); if (!g) continue; if (ch === ' ') { pen += this.advance(ch, g); continue; } const [, top, , bottom, w, ax, ay] = g; const h = bottom - top - 1;
      // The stored width excludes the cell's two-pixel left padding. Include
      // it without sampling the neighboring glyph on the right.
      const cellWidth = Math.min(w + 2, this.atlas.width - ax);
      ctx.drawImage(this.tint, ax, ay, cellWidth, h, pen - 1, y + top, cellWidth, h); pen += this.advance(ch, g); }
    return pen - x;
  }
}
