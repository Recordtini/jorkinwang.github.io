// WebAudio side of the engine's sound channels. The engine sends text commands; the sounds themselves are
// MPEG audio blocks inside the game data, decoded here with the browser's decoder.
export class Sound {
  constructor(ex, mem) {
    this.ex = ex; this.mem = mem;
    this.ctx = null;
    this.buffers = new Map(); // key -> Promise<AudioBuffer|null>
    this.chans = new Map();   // channel -> {src, gain, token}
    this.master = 1;
    this.muted = false;
    this.dec = new TextDecoder();
    const unlock = () => { this.ensure(); };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, unlock, { passive: true });
  }
  ensure() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.out = this.ctx.createGain(); this.out.connect(this.ctx.destination);
      this.out.gain.value = this.muted ? 0 : this.master;
    }
    if (this.ctx.state === 'suspended') this.ctx.resume().catch(() => {});
    return this.ctx;
  }
  setMaster(v) { this.master = v; if (this.out) this.out.gain.value = this.muted ? 0 : v; }
  setMuted(m) { this.muted = m; if (this.out) this.out.gain.value = m ? 0 : this.master; }
  pump() {
    const n = this.ex.lw_snd_take();
    if (!n) return;
    const ptr = this.ex.lw_snd_ptr();
    const text = this.dec.decode(new Uint8Array(this.mem.buffer, ptr, n));
    for (const line of text.split('\n')) this.cmd(line.split('|'));
  }
  load(key, ptr, len) {
    const bytes = new Uint8Array(this.mem.buffer, ptr, len).slice();
    const ctx = this.ensure();
    if (!ctx) { this.buffers.set(key, Promise.resolve(null)); return; }
    this.buffers.set(key, new Promise((res) => {
      ctx.decodeAudioData(bytes.buffer, res, () => res(null));
    }).catch(() => null));
  }
  chan(c) {
    let ch = this.chans.get(c);
    if (!ch) {
      const ctx = this.ensure();
      ch = { src: null, gain: ctx.createGain(), token: 0, vol: 1 };
      ch.gain.connect(this.out);
      this.chans.set(c, ch);
    }
    return ch;
  }
  stopChan(ch) {
    ch.token++;
    if (ch.src) { try { ch.src.stop(); } catch (e) {} ch.src.disconnect(); ch.src = null; }
  }
  cmd(a) {
    switch (a[0]) {
      case 'load': this.load(+a[1], +a[2], +a[3]); break;
      case 'play': this.play(+a[1], +a[2], +a[3], +a[4], +a[5], +a[6]); break;
      case 'stop': { const ch = this.chans.get(+a[1]); if (ch) this.stopChan(ch); break; }
      case 'vol': { const ch = this.chan(+a[1]); ch.vol = +a[2] / 255; ch.gain.gain.cancelScheduledValues(0); ch.gain.gain.value = ch.vol; break; }
      case 'fade': case 'fadestop': {
        const ch = this.chan(+a[1]); const ctx = this.ctx; const to = +a[2] / 255, ms = +a[3];
        ch.gain.gain.cancelScheduledValues(ctx.currentTime);
        ch.gain.gain.setValueAtTime(ch.gain.gain.value, ctx.currentTime);
        ch.gain.gain.linearRampToValueAtTime(to, ctx.currentTime + ms / 1000);
        ch.vol = to;
        if (a[0] === 'fadestop') { const t = ch.token; setTimeout(() => { if (ch.token === t) this.stopChan(ch); }, ms + 20); }
        break;
      }
    }
  }
  async play(c, key, loops, rate, startMs, endMs) {
    const ctx = this.ensure(); if (!ctx) return;
    const ch = this.chan(c);
    this.stopChan(ch);
    const token = ch.token;
    const buf = await this.buffers.get(key);
    if (!buf || ch.token !== token) return;
    const src = ctx.createBufferSource();
    src.buffer = buf; src.playbackRate.value = rate > 0 ? rate : 1;
    src.connect(ch.gain);
    const off = Math.min(startMs / 1000, Math.max(0, buf.duration - 0.01));
    const endS = endMs > 0 ? Math.min(endMs / 1000, buf.duration) : buf.duration;
    if (loops !== 1) { src.loop = true; src.loopStart = off; src.loopEnd = endS; }
    src.start(0, off);
    if (loops > 1) src.stop(ctx.currentTime + (endS - off) * loops / src.playbackRate.value);
    else if (loops === 1 && endMs > 0) src.stop(ctx.currentTime + (endS - off) / src.playbackRate.value);
    ch.src = src;
  }
}
