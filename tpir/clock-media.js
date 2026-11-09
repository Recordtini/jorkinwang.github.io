// The retail prize presenter completes after its audio and video are done.
export function clockMediaGate({ video, audio, advance }) {
  let started = false, epoch = 0, waiting = false;
  const pending = () => started && !video.ended && !video.error;
  function release() {
    if (!waiting) return;
    waiting = false;
    if (audio.skipButton) audio.skipButton.style.display = 'none';
    advance();
  }
  function stop() { epoch++; started = false; video.pause(); }
  video.addEventListener('ended', release);
  video.addEventListener('error', () => { started = false; release(); });
  audio.skipButton?.addEventListener('click', () => { stop(); release(); });
  return {
    pending,
    wait() {
      if (!pending()) return false;
      waiting = true;
      if (audio.skipButton) audio.skipButton.style.display = 'block';
      return true;
    },
    start(src) {
      stop(); video.src = src; video.currentTime = 0; started = true;
      const current = epoch;
      video.play().catch(() => { if (epoch === current) { started = false; release(); } });
    },
    dispose() { waiting = false; stop(); video.removeAttribute('src'); video.load(); },
    showingVideo: () => started && video.readyState >= 2,
  };
}
