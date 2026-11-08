// TPIR audio: resolves manifest names (e.g. Speech_ShowcaseShowdown_Welcome_A) to files, decodes Vorbis with the browser and
// GWSample (4-bit ADPCM) with the wasm engine, plays speech in a queue and sfx immediately.
export class Audio {
  static all = [];
  static stopAll(keep) { for (const a of Audio.all) if (a !== keep) a.shutdown(); Audio.all = keep ? [keep] : []; }
  shutdown() { this.speechToken++; this.skipButton?.remove(); this.speechQ.length = 0; this.onIdle = null; this.onCaption = null; this.onSpeechStart = null; this.onSpeechEnd = null; this.dead = true; for (const n of this.live || []) { try { n.stop(); } catch (e) { /* ignore */ } } if (this.ctx && this.ctx.state !== 'closed') this.ctx.close().catch(() => {}); }
  constructor(ex, idx) { Audio.all.push(this); this.live = new Set(); this.ex = ex; this.idx = idx; this.names = new Map(); this.bufs = new Map(); this.ctx = null; this.speechQ = []; this.speaking = false; this.speechToken = 0; this.introActive = false; this.activeSpeech = null; this.captions = null; this.volume = Audio.defaultVolume ?? 0.8; this.muted = false; }
  mem() { return this.ex.memory.buffer; }
  /** Register every audio entry of the given screen manifests so names can be played. */
  async addScreens(nums) {
    // Pricing-game openings may be skipped without discarding later gameplay cues.
    if (nums.some(n => n >= 29 && n <= 58) && typeof document !== 'undefined') {
      this.introActive = true;
      const b = document.createElement('button'); b.textContent = 'Skip introduction';
      b.type = 'button'; b.setAttribute('aria-label', 'Skip introduction voiceover');
      b.style.cssText = 'position:fixed;right:18px;top:18px;z-index:1000;padding:10px 16px;border:1px solid #b3c9f3;border-radius:7px;background:#10244c;color:white;font:600 15px system-ui;cursor:pointer;display:none';
      b.onclick = () => this.skipIntro(); document.body.appendChild(b); this.skipButton = b;
    }
    for (const n of nums) {
      const b = new Uint8Array(await (await fetch(`zip/${String(n).padStart(3, '0')}/GWScreen`)).arrayBuffer()); const p = this.ex.tp_alloc(b.length); new Uint8Array(this.mem(), p, b.length).set(b);
      const jp = this.ex.tp_screen_json(p, b.length); if (!jp) continue; const m = new Uint8Array(this.mem()); let e = jp; while (m[e]) e++;
      const S = JSON.parse(new TextDecoder().decode(m.slice(jp, e)));
      for (const x of S.entries) if (x.type === 4) this.names.set(x.name, { id: x.id, ms: x.ms });
      for (const x of S.entries) if (x.type === 5) (this.text ||= new Map()).set(x.name, x.text);
    }
  }
  addProduct(product) {
    const name = `Product_${String(product.id).padStart(6, '0')}`;
    this.names.set(name, { file: `retail-audio/${name}.vorbis`, caption: product.en });
    return name;
  }
  async unlock() {
    if (this.dead) return;
    if (!this.ctx) this.ctx = new (window.AudioContext || window.webkitAudioContext)();
    if (this.ctx.state === 'suspended') await this.ctx.resume();
    if (!this.speaking && this.speechQ.length) this.next();
  }
  async buffer(name) {
    if (this.bufs.has(name)) return this.bufs.get(name); const nm = this.names.get(name); const f = nm && (nm.file || this.idx[nm.id]); if (!f) { this.bufs.set(name, null); return null; }
    let buf = null; const data = await (await fetch(nm.file || 'zip/' + f)).arrayBuffer();
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
  say(name) {
    if (this.dead) return;
    if (name.startsWith('Sfx_')) { this.sfx(name); return; }
    this.speechQ.push(name);
    // A locked browser must retain the intro instead of silently dropping each line
    // after the old 600ms fallback. A gesture on the shell also permits new segments.
    if (!this.ctx && navigator.userActivation?.hasBeenActive) this.unlock();
    else if (!this.speaking && this.ctx?.state === 'running') this.next();
  }
  skipIntro() {
    if (!this.introActive || !this.speaking || this.dead) return;
    this.introActive = false; this.speechQ.length = 0; this.speechToken++;
    const src = this.activeSpeech; this.activeSpeech = null;
    this.speaking = false; if (this.skipButton) this.skipButton.style.display = 'none';
    if (src) { try { src.stop(); } catch {} }
    if (this.onCaption) this.onCaption('');
    if (this.onIdle) this.onIdle();
  }
  async next() {
    if (this.dead || !this.ctx || this.ctx.state !== 'running') { this.speaking = false; return; }
    const name = this.speechQ.shift();
    if (!name) {
      const was = this.speaking; this.speaking = false; this.activeSpeech = null;
      if (was && this.introActive) { this.introActive = false; if (this.skipButton) this.skipButton.style.display = 'none'; }
      if (this.onCaption) this.onCaption(''); if (was && this.onIdle) this.onIdle(); return;
    }
    this.speaking = true; const token = this.speechToken;
    if (this.introActive && this.skipButton) this.skipButton.style.display = 'block';
    const src = await this.start(name);
    if (this.dead || token !== this.speechToken) { if (src) { try { src.stop(); } catch {} } return; }
    this.activeSpeech = src;
    const duration = src?.buffer?.duration || (this.names.get(name)?.ms || 0) / 1000;
    if (this.onCaption && !Audio.captionsOff) this.onCaption(this.captionFor(name), { name, duration });
    if (this.onSpeechStart) this.onSpeechStart(name, { duration, source: src });
    const finish = () => { if (this.dead || token !== this.speechToken) return; this.activeSpeech = null; if (this.onSpeechEnd) this.onSpeechEnd(name); this.next(); };
    if (!src) { setTimeout(finish, 600); return; } src.onended = finish;
  }
  /** Caption = the manifest text of the line's base name (Speech_ShowcaseShowdown_Welcome_A -> Welcome). */
  captionFor(name) { if (this.names.get(name)?.caption) return this.names.get(name).caption; const base = name.replace(/^Speech_[A-Za-z0-9]+_/, '').replace(/_(A|B|C|D)$/, ''); return this.text?.get(base) || this.text?.get(name.replace(/^Speech_/, '').replace(/_(A|B|C|D)$/, '')) || ''; }
  /** Looping music (e.g. Music_ComeOnDown.loop). */
  async music(name, gain = 0.35) { if (!this.ctx) return null; const buf = await this.buffer(name); if (!buf || this.dead) return null; const src = this.ctx.createBufferSource(); src.buffer = buf; src.loop = true; const g = this.ctx.createGain(); g.gain.value = gain; src.musicGain = g; src.connect(g).connect(this.ctx.destination); src.start(); this.live.add(src); return src; }
  clearSpeech() { this.speechQ.length = 0; }
}
