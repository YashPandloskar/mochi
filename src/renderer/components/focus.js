// The Focus countdown, shared by the Home tile and the Focus tab. One tap starts a countdown,
// another tap resets it. When it reaches zero, main plays the chime and shows the toast.
//   Focus.toggle()   Focus.read() -> { running, left (s), total (s), finished }
(() => {
  const H = window.mochi.theme.home;
  let minutes = H.focusMinutes;
  let total = minutes * 60;
  let endsAt = 0;
  let finishedUntil = 0;

  function check() {
    if (endsAt && Date.now() >= endsAt) {
      endsAt = 0;
      finishedUntil = Date.now() + 8000;
      window.mochi.focusDone();
      changed();
    }
  }
  const listeners = [];
  const changed = () => listeners.forEach((fn) => fn());
  setInterval(check, 500); // keeps counting even while the notch is collapsed

  window.Focus = {
    get minutes() { return minutes; },
    // Changes the length (not while counting). persist=false when the value came from the saved setting.
    setMinutes(m, persist = true) {
      m = Math.max(H.focusMinMinutes, Math.min(H.focusMaxMinutes, Math.round(Number(m) || minutes)));
      if (endsAt || m === minutes) return false;
      minutes = m;
      total = m * 60;
      if (persist) window.mochi.setFocusMinutes(m);
      return true;
    },
    step(dir) {
      return this.setMinutes(minutes + dir * H.focusStepMinutes);
    },
    onChange: (fn) => listeners.push(fn), // starts, resets and finishes
    toggle() {
      endsAt = endsAt ? 0 : Date.now() + total * 1000;
      finishedUntil = 0;
      changed();
    },
    read() {
      check();
      const running = endsAt > 0;
      return { running, left: running ? Math.max(0, (endsAt - Date.now()) / 1000) : total, total, finished: !running && Date.now() < finishedUntil };
    },
  };
})();
