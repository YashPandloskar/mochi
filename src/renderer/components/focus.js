// The Focus countdown, shared by the Home tile and the Focus tab. One tap starts a countdown,
// another tap resets it. When it reaches zero, main plays the chime and shows the toast.
//   Focus.toggle()   Focus.read() -> { running, left (s), total (s), finished }
(() => {
  const total = window.mochi.theme.home.focusMinutes * 60;
  let endsAt = 0;
  let finishedUntil = 0;

  function check() {
    if (endsAt && Date.now() >= endsAt) {
      endsAt = 0;
      finishedUntil = Date.now() + 8000;
      window.mochi.focusDone();
    }
  }
  setInterval(check, 500); // keeps counting even while the notch is collapsed

  window.Focus = {
    total,
    toggle() {
      endsAt = endsAt ? 0 : Date.now() + total * 1000;
      finishedUntil = 0;
    },
    read() {
      check();
      const running = endsAt > 0;
      return { running, left: running ? Math.max(0, (endsAt - Date.now()) / 1000) : total, total, finished: !running && Date.now() < finishedUntil };
    },
  };
})();
