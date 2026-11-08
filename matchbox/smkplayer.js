'use strict';
// Smacker video player for the port (intro `MIIntro` + `opening`, mission cut-scenes `sqNNscNN`). The decoding is all Rust (src/smk.rs,
// exports smk_*): this file only streams the ORIGINAL .smk bytes from the server, feeds frame after frame to the decoder, shows the
// frames on a canvas and plays the audio with WebAudio. The file is read as one sequential fetch stream (the frames are stored in
// playing order), so it works on any static server and never holds more than a few MB of a 40 MB video.
// Original (xgame.exe smack_play 0x4032f0): the video is centred in the screen at its own size, or doubled when the screen is
// at least twice as large; here it is scaled to the window keeping the 4:3 aspect (black bars, no stretching).
// Skip: Esc / Space / Enter.
const SMK = { active: false };

class SmkStream {
  constructor(url, maxBuf = 6 << 20) {
    this.chunks = []; this.avail = 0; this.done = false; this.err = null; this.waiters = []; this.drain = null; this.stopped = false;
    this.max = maxBuf; this.ctrl = new AbortController(); this.run(url);
  }
  async run(url) {
    try {
      const r = await fetch(url, { signal: this.ctrl.signal });
      if (!r.ok) throw new Error(url + ' ' + r.status);
      const rd = r.body.getReader();
      for (;;) {
        while (this.avail > this.max && !this.stopped) await new Promise(f => { this.drain = f; });
        if (this.stopped) break;
        const { done, value } = await rd.read();
        if (done) break;
        this.chunks.push(value); this.avail += value.length; this.wake();
      }
    } catch (e) { if (!this.stopped) this.err = e; }
    this.done = true; this.wake();
  }
  wake() { const w = this.waiters; this.waiters = []; w.forEach(f => f()); }
  stop() { this.stopped = true; try { this.ctrl.abort() } catch (e) {} if (this.drain) this.drain(); this.wake(); }
  // copy exactly n bytes into dst
  async read(n, dst) {
    while (this.avail < n) {
      if (this.err) throw this.err;
      if (this.done) throw new Error('video file truncated');
      await new Promise(f => this.waiters.push(f));
    }
    let o = 0;
    while (o < n) {
      const c = this.chunks[0], t = Math.min(c.length, n - o);
      dst.set(c.subarray(0, t), o); o += t;
      if (t == c.length) this.chunks.shift(); else this.chunks[0] = c.subarray(t);
    }
    this.avail -= n;
    if (this.drain) { const d = this.drain; this.drain = null; d(); }
  }
}

// Play `name` (without extension) from `base` ('game/videos/'). opts: au = the page's {ctx, master} audio state, unlock = function
// that creates / resumes it from a user gesture, volume() = 0..1, onStart / onEnd. Resolves 'done' | 'skipped' | 'error'.
async function smkPlay(M, name, opts = {}) {
  if (SMK.active) return 'error';
  SMK.active = true;
  const base = opts.base || 'game/videos/';
  const cv = document.createElement('canvas');
  cv.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;object-fit:contain;background:#000;z-index:30;image-rendering:auto';
  const note = document.createElement('div');
  note.style.cssText = 'position:fixed;left:0;right:0;bottom:6%;text-align:center;color:#aaa;font:16px sans-serif;z-index:31;pointer-events:none';
  document.body.append(cv, note);
  const ctx2 = cv.getContext('2d', { alpha: false });
  let skipped = false, stream = null, sources = [], result = 'done', wake = null;
  const onKey = e => { if (e.code == 'Escape' || e.code == 'Space' || e.code == 'Enter') { skipped = true; if (wake) wake(); e.preventDefault(); e.stopImmediatePropagation() } };
  addEventListener('keydown', onKey, true);
  if (opts.onStart) opts.onStart();
  try {
    // browsers start audio only after a user gesture: wait for one before the first (intro) video
    const au = opts.au;
    if (au && (!au.ctx || au.ctx.state != 'running')) {
      note.textContent = 'Press any key or click to play';
      cv.width = 320; cv.height = 240; ctx2.fillStyle = '#000'; ctx2.fillRect(0, 0, 320, 240);
      await new Promise(res => {
        const go = e => { removeEventListener('keydown', go, true); removeEventListener('pointerdown', go, true); res() };
        addEventListener('keydown', go, true); addEventListener('pointerdown', go, true);
      });
      if (opts.unlock) opts.unlock();
      if (au.ctx && au.ctx.state != 'running') { try { await au.ctx.resume() } catch (e) {} }
      note.textContent = '';
    }
    if (skipped) throw 'skip';
    // preferred: the VP9/Opus transcode (tools/transcode_videos.py) in a native <video>; the raw Smacker decoder below is the fallback
    if (!opts.raw && await smkHasWebm(base + name + '.webm')) {
      const v = document.createElement('video');
      v.style.cssText = cv.style.cssText; v.playsInline = true; v.preload = 'auto';
      v.volume = Math.max(0, Math.min(1, opts.volume ? opts.volume() : 1));
      cv.replaceWith(v); v.src = base + name + '.webm';
      const ok = await new Promise(res => {
        wake = () => res('skip'); v.onended = () => res('end'); v.onerror = () => res('err');
        v.play().catch(() => res('err'));
      });
      wake = null; v.pause(); v.removeAttribute('src'); v.load(); v.remove();
      if (ok == 'skip') throw 'skip';
      if (ok == 'end') return result;
      document.body.append(cv);   // the webm would not play: fall back to the Smacker decode
    }
    stream = new SmkStream(base + name + '.smk');
    const hdr = new Uint8Array(104);
    await stream.read(104, hdr);
    const dv = new DataView(hdr.buffer);
    const sig = String.fromCharCode(...hdr.subarray(0, 4));
    if (sig != 'SMK2' && sig != 'SMK4') throw new Error(name + ': not a Smacker file');
    const stored = dv.getUint32(12, true) + (dv.getUint32(20, true) & 1), need = 104 + stored * 5 + dv.getUint32(52, true);
    const p0 = M.g_alloc(need);
    new Uint8Array(M.memory.buffer, p0, 104).set(hdr);
    await stream.read(need - 104, new Uint8Array(M.memory.buffer, p0 + 104, need - 104));
    const r = M.smk_open(p0, need);
    if (r != 0) throw new Error(name + ': smk_open ' + r + smkError(M));
    const W = M.smk_w(), H = M.smk_h(), frames = M.smk_frames(), dur = M.smk_frame_us() / 1e6;
    const rate = M.smk_audio_rate(), ach = M.smk_audio_channels();
    cv.width = W; cv.height = H;
    const maxf = M.smk_max_frame(), buf = M.g_alloc(maxf);
    const ac = opts.au && opts.au.ctx && opts.au.ctx.state == 'running' ? opts.au.ctx : null;
    const gain = ac ? ac.createGain() : null;
    if (gain) { gain.gain.value = opts.volume ? opts.volume() : 1; gain.connect(ac.destination) }
    const queue = [];       // decoded frames waiting for their time
    let decoded = 0, finished = false, t0 = null, aT = 0, shown = -1;
    const lead = 0.25;      // seconds between the first decoded data and the first frame
    const clock = () => ac ? ac.currentTime : performance.now() / 1000;
    // decoder loop: runs ahead of the clock by a few frames
    const pump = (async () => {
      for (let i = 0; i < stored && !skipped; i++) {
        while (queue.length >= 10 && !skipped) await new Promise(f => setTimeout(f, 8));
        if (skipped) break;
        const n = M.smk_frame_size(i);
        await stream.read(n, new Uint8Array(M.memory.buffer, buf, n));
        if (M.smk_decode(i, buf, n) < 0) throw new Error(name + ' frame ' + i + ': ' + smkError(M));
        if (t0 === null) { t0 = clock() + lead; aT = t0 }
        const na = M.smk_audio_len();
        if (ac && rate && na) {
          const s16 = new Int16Array(M.memory.buffer, M.smk_audio_ptr(), na), fr = Math.floor(na / ach);
          const ab = ac.createBuffer(ach, fr, rate);
          for (let c = 0; c < ach; c++) { const d = ab.getChannelData(c); for (let k = 0; k < fr; k++) d[k] = s16[k * ach + c] / 32768 }
          const src = ac.createBufferSource(); src.buffer = ab; src.connect(gain);
          src.start(Math.max(aT, ac.currentTime)); aT += fr / rate; sources.push(src);
        }
        if (i < frames) queue.push({ i, px: new Uint8ClampedArray(M.memory.buffer, M.smk_rgba(), W * H * 4).slice() });
        decoded = i + 1;
      }
      finished = true;
    })();
    pump.catch(() => {});
    // display loop
    await new Promise((res, rej) => {
      const tick = () => {
        if (skipped) return res();
        if (t0 !== null) {
          const t = clock() - t0;
          let f = null;
          while (queue.length && queue[0].i * dur <= t) f = queue.shift();
          if (f) { ctx2.putImageData(new ImageData(f.px, W, H), 0, 0); shown = f.i }
          if (finished && !queue.length && shown >= frames - 1 && t >= frames * dur) return res();
        }
        requestAnimationFrame(tick);
      };
      pump.then(() => {}, rej);
      requestAnimationFrame(tick);
    });
    if (skipped) result = 'skipped';
  } catch (e) {
    if (e === 'skip' || skipped) result = 'skipped'; else { console.warn('video', name, e); result = 'error' }
  } finally {
    removeEventListener('keydown', onKey, true);
    for (const s of sources) { try { s.stop() } catch (e) {} }
    if (stream) stream.stop();
    cv.remove(); note.remove();
    SMK.active = false;
    if (opts.onEnd) opts.onEnd(result);
  }
  return result;
}
async function smkHasWebm(url) {
  try { const r = await fetch(url, { method: 'HEAD' }); return r.ok && /webm|video|octet/.test(r.headers.get('content-type') || 'webm'); } catch (e) { return false }
}
function smkError(M) {
  const n = M.smk_error_len();
  return n ? ' ' + new TextDecoder().decode(new Uint8Array(M.memory.buffer, M.smk_error_ptr(), n)) : '';
}
// the game logic's pending cut-scene request (smk_take_request), or ''
function smkTakeRequest(M) {
  const n = M.smk_take_request();
  return n ? new TextDecoder().decode(new Uint8Array(M.memory.buffer, M.smk_req_ptr(), n)) : '';
}
