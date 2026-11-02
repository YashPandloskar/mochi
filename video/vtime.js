// Virtual clock for frame-exact rendering (record.js --render). Everything on the page that depends on time
// (timers, requestAnimationFrame, performance.now, Date.now, CSS animations and transitions) is stepped by the
// renderer one 1/60 s frame at a time, so a slow machine can never drop or stretch a frame.
// Without --render this file does nothing and the page runs in real time.
(() => {
  if (!window.__rec || !window.__rec.options.render) return;
  const FRAME = 1000 / 60;
  const EPOCH = Date.now();
  const real = {
    raf: window.requestAnimationFrame.bind(window),
    setTimeout: window.setTimeout.bind(window),
  };
  let vt = 0;
  let nextId = 1;
  const timers = new Map();
  let rafQ = [];

  window.setTimeout = (fn, ms = 0, ...a) => {
    const id = nextId++;
    timers.set(id, { due: vt + Math.max(0, Number(ms) || 0), fn, a, interval: null });
    return id;
  };
  window.setInterval = (fn, ms = 0, ...a) => {
    const id = nextId++;
    const iv = Math.max(1, Number(ms) || 1);
    timers.set(id, { due: vt + iv, fn, a, interval: iv });
    return id;
  };
  window.clearTimeout = window.clearInterval = (id) => timers.delete(id);
  window.requestAnimationFrame = (cb) => {
    const id = nextId++;
    rafQ.push({ id, cb });
    return id;
  };
  window.cancelAnimationFrame = (id) => {
    rafQ = rafQ.filter((r) => r.id !== id);
  };
  performance.now = () => vt;
  Date.now = () => EPOCH + vt;

  function stepAnimations(dt) {
    for (const a of document.getAnimations()) {
      if (!a.__v) {
        a.__v = true;
        a.pause();
        a.currentTime = 0;
        continue;
      }
      if (a.playState === 'finished') continue;
      a.currentTime = (a.currentTime || 0) + dt;
    }
  }

  // moves the virtual clock to frame number n and runs everything that was due
  function advance(n) {
    const target = n * FRAME;
    const dt = target - vt;
    for (;;) {
      let best = null;
      let bestId = 0;
      for (const [id, t] of timers) {
        if (t.due <= target && (!best || t.due < best.due || (t.due === best.due && id < bestId))) {
          best = t;
          bestId = id;
        }
      }
      if (!best) break;
      vt = Math.max(vt, best.due);
      if (best.interval !== null) best.due += best.interval;
      else timers.delete(bestId);
      try {
        best.fn(...best.a);
      } catch (e) {
        console.error('timer: ' + (e && e.stack ? e.stack : e));
      }
    }
    vt = target;
    const q = rafQ;
    rafQ = [];
    for (const r of q) {
      try {
        r.cb(vt);
      } catch (e) {
        console.error('raf: ' + (e && e.stack ? e.stack : e));
      }
    }
    stepAnimations(dt);
  }

  window.__vtime = { FRAME, advance, now: () => vt, real };
})();
