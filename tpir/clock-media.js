// The retail prize presenter completes after its audio and video are done.
export function clockMediaGate({ video, audio, advance, onTextDone = () => {}, onRelease = () => {}, schedule = setTimeout, cancel = clearTimeout }) {
  let started = false, epoch = 0, waiting = false, held = [], heldIntro = false, textPending = false, textTimer = null;
  const pending = () => textPending || (started && !video.ended && !video.error);
  function release() {
    if (!waiting || pending()) return;
    waiting = false;
    if (audio.skipButton) audio.skipButton.style.display = 'none';
    onRelease();
    const queued = held; held = [];
    if (queued.length) {
      if (heldIntro) audio.introActive = true;
      heldIntro = false;
      for (const name of queued) audio.say(name);
    } else { heldIntro = false; advance(); }
  }
  function stop() { epoch++; started = false; video.pause(); if (textTimer !== null) cancel(textTimer); textTimer = null; textPending = false; }
  video.addEventListener('ended', release);
  video.addEventListener('error', () => { started = false; release(); });
  audio.skipButton?.addEventListener('click', () => { held = []; heldIntro = false; stop(); release(); });
  return {
    pending,
    deferNextSpeech() {
      if (!pending() || !audio.speechQ.length) return false;
      held = audio.speechQ.splice(0); heldIntro = audio.introActive; waiting = true;
      return true;
    },
    wait() {
      if (!pending()) return false;
      waiting = true;
      if (audio.skipButton) audio.skipButton.style.display = 'block';
      return true;
    },
    textPending: () => textPending,
    start(src, textMs = 0) {
      stop(); video.src = src; video.currentTime = 0; started = true;
      const current = epoch;
      if (textMs > 0) {
        textPending = true;
        textTimer = schedule(() => { if (epoch !== current) return; textTimer = null; textPending = false; onTextDone(); release(); }, textMs);
      }
      video.play().catch(() => { if (epoch === current) { started = false; release(); } });
    },
    dispose() { waiting = false; held = []; heldIntro = false; stop(); video.removeAttribute('src'); video.load(); },
    showingVideo: () => started && video.readyState >= 2,
  };
}
