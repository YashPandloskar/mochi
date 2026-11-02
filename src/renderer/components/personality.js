// Mochi's personality: when he naps, dances and what mood the time of day gives him.
// Pure logic, no drawing. app.js turns the snapshot into eyes, classes and panels.
//
//   Personality.init({ canNap: () => boolean, onChange: (snap) => void })
//   Personality.activity()      something happened: wakes him and restarts the idle clock
//   Personality.setMusic(bool)  Apple Music is playing: he dances (and does not nap)
//   Personality.setEnabled(b)   the tray setting
//   Personality.preview(kind)   tray previews: nap | wake | night | morning | normal
//   Personality.snapshot() -> { enabled, napping, dancing, look: 'night' | 'morning' | 'day' }
(() => {
  const P = window.mochi.theme.personality;
  let enabled = true;
  let napping = false;
  let dancing = false;
  let forcedLook = null; // tray preview of the night / morning look
  let lastActivity = Date.now();
  let canNap = () => true;
  let onChange = () => {};
  let lastKey = '';

  const inRange = (h, { from, to }) => (from <= to ? h >= from && h < to : h >= from || h < to);

  function look() {
    if (forcedLook) return forcedLook;
    const h = new Date().getHours();
    if (inRange(h, P.night)) return 'night';
    if (inRange(h, P.morning)) return 'morning';
    return 'day';
  }

  function snapshot() {
    return { enabled, napping: enabled && napping, dancing: enabled && dancing, look: enabled ? look() : 'day' };
  }

  function emit(force) {
    const s = snapshot();
    const key = JSON.stringify(s);
    if (force || key !== lastKey) {
      lastKey = key;
      onChange(s, force);
    }
  }

  // Called by tick() and by anything that wants a fresh decision.
  function evaluate() {
    if (enabled && !napping && !dancing && canNap() && Date.now() - lastActivity >= P.napMinutes * 60000) napping = true;
    emit(false);
  }

  window.Personality = {
    init(opts) {
      canNap = opts.canNap || canNap;
      onChange = opts.onChange || onChange;
      setInterval(evaluate, 10000); // also catches the hour changing
      emit(true);
    },
    activity() {
      lastActivity = Date.now();
      if (napping) {
        napping = false;
        emit(true); // forced: the wake-up blink plays even if nothing else changed
      }
    },
    setMusic(playing) {
      playing = !!playing;
      if (playing === dancing) return;
      dancing = playing;
      if (playing) this.activity();
      emit(false);
    },
    setEnabled(on) {
      enabled = !!on;
      if (!enabled) napping = false;
      emit(true);
    },
    preview(kind) {
      if (kind === 'nap') napping = true;
      else if (kind === 'wake') napping = false;
      else if (kind === 'night' || kind === 'morning') forcedLook = kind;
      else if (kind === 'normal') forcedLook = null;
      emit(true);
    },
    get enabled() {
      return enabled;
    },
    snapshot,
    evaluate,
  };
})();
