// TPIR audio: resolves manifest names (e.g. Speech_ShowcaseShowdown_Welcome_A) to files, decodes Vorbis with the browser and
// GWSample (4-bit ADPCM) with the wasm engine, plays speech in a queue and sfx immediately.
export class Audio {
  static all = [];
  static stopAll(keep) { for (const a of Audio.all) if (a !== keep) a.shutdown(); Audio.all = keep ? [keep] : []; }
  shutdown() { this.speechQ.length = 0; this.onIdle = null; this.onCaption = null; this.dead = true; for (const n of this.live || []) { try { n.stop(); } catch (e) { /* ignore */ } } if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {}); }
  constructor(ex, idx) { Audio.all.push(this); this.live = new Set(); this.ex = ex; this.idx = idx; this.names = new Map(); this.bufs = new Map(); this.ctx = null; this.speechQ = []; this.speaking = false; this.captions = null; this.volume = Audio.defaultVolume ?? 0.8; this.muted = false; }
  mem() { return this.ex.memory.buffer; }
  /** Register every audio entry of the given screen manifests so names can be played. */
  async addScreens(nums) {
    for (const n of nums) {
      const b = new Uint8Array(await (await fetch(`zip/${String(n).padStart(3, '0')}/GWScreen`)).arrayBuffer()); const p = this.ex.tp_alloc(b.length); new Uint8Array(this.mem(), p, b.length).set(b);
      const jp = this.ex.tp_screen_json(p, b.length); if (!jp) continue; const m = new Uint8Array(this.mem()); let e = jp; while (m[e]) e++;
      const S = JSON.parse(new TextDecoder().decode(m.slice(jp, e)));
      for (const x of S.entries) if (x.type === 4) this.names.set(x.name, { id: x.id, ms: x.ms });
      for (const x of S.entries) if (x.type === 5) (this.text ||= new Map()).set(x.name, x.text);
    }
  }
  unlock() { if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)(); if (this.ctx.state === 'suspended') this.ctx.resume(); }
  async buffer(name) {
    if (this.bufs.has(name)) return this.bufs.get(name); const nm = this.names.get(name); const f = nm && this.idx[nm.id]; if (!f) { this.bufs.set(name, null); return null; }
    let buf = null; const data = await (await fetch('zip/' + f)).arrayBuffer();
    if (f.endsWith('.vorbis') || f.endsWith('.opus')) buf = await this.ctx.decodeAudioData(data.slice(0)).catch(() => null);
    else if (f.endsWith('.GWSample')) {
      const b = new Uint8Array(data); const p = this.ex.tp_alloc(b.length); new Uint8Array(this.mem(), p, b.length).set(b); const o = this.ex.tp_gwsample(p, b.length);
      if (o) { const h = new Uint32Array(this.mem().slice(o, o + 12)); const [rate, ch, frames] = h; const pcm = new Float32Array(this.mem().slice(o + 12, o + 12 + frames * ch * 4));
        buf = this.ctx.createBuffer(ch, frames, rate); for (let c = 0; c < ch; c++) { const d = buf.getChannelData(c); for (let i = 0; i < frames; i++) d[i] = pcm[i * ch + c]; } }
    }
    this.bufs.set(name, buf); return buf;
  }
  async start(name, gain = 1) {
    if (!this.ctx || this.muted) return null; const buf = await this.buffer(name); if (!buf) return null;
    if (this.dead || this.ctx.state === 'closed') return null; const src = this.ctx.createBufferSource(); src.buffer = buf; const g = this.ctx.createGain(); g.gain.value = gain * this.volume; src.connect(g).connect(this.ctx.destination); src.start(); this.live.add(src); src.addEventListener('ended', () => this.live.delete(src)); return src;
  }
  sfx(name) { return this.start(name, 0.8); }
  /** Speech lines play one after another. */
  say(name) { this.speechQ.push(name); if (!this.speaking) this.next(); }
  async next() {
    const name = this.speechQ.shift(); if (!name) { const was = this.speaking; this.speaking = false; if (this.onCaption) this.onCaption(''); if (was && this.onIdle) this.onIdle(); return; }
    this.speaking = true; const src = await this.start(name);
    if (this.onCaption && !Audio.captionsOff) this.onCaption(this.captionFor(name));
    if (!src) { setTimeout(() => this.next(), 600); return; } src.onended = () => this.next();
  }
  /** Caption = the manifest text of the line's base name (Speech_ShowcaseShowdown_Welcome_A -> Welcome). */
  captionFor(name) { const base = name.replace(/^Speech_[A-Za-z0-9]+_/, '').replace(/_(A|B|C|D)$/, ''); return this.text?.get(base) || this.text?.get(name.replace(/^Speech_/, '').replace(/_(A|B|C|D)$/, '')) || ''; }
  /** Looping music (e.g. Music_ComeOnDown.loop). */
  async music(name, gain = 0.35) { if (!this.ctx) return null; const buf = await this.buffer(name); if (!buf || this.dead) return null; const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = this.ctx.createGain(); g.gain.value = gain * this.volume; src.connect(g).connect(this.ctx.destination); src.start(); this.live.add(src); return src; }
  clearSpeech() { this.speechQ.length = 0; }
}
