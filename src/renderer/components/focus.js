// The Focus timer, shared by the Home tile, the Focus tab and the collapsed notch.
//
// Pomodoro: a focus period, then a break, then focus again, until you reset. With "cycle" switched
// off it is a single countdown that finishes after the focus period. Every completed focus period
// counts as a session for the day. The logic has no DOM and takes its clock as a parameter, so
// scripts/selftest-focus.js can run whole cycles in milliseconds.
//
//   const t = FocusTimer.create({ focusMinutes, breakMinutes, cycle, limits, now, onPhase, onSession, onConfig })
//   t.toggle()  t.read()  t.step('focus' | 'break', +1 | -1)  t.setCycle(bool)  t.onChange(fn)  t.tick()
(function (root, factory) {
  const api = factory();
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.FocusTimer = api;
})(typeof self !== 'undefined' ? self : this, function () {
  function create(opts) {
    const o = Object.assign({ now: Date.now, onPhase() {}, onSession() {}, onConfig() {} }, opts);
    const L = o.limits;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, Math.round(Number(v)) || lo));

    let focusMinutes = o.focusMinutes;
    let breakMinutes = o.breakMinutes;
    let cycle = o.cycle;
    let running = false;
    let phase = 'focus';
    let endsAt = 0;
    let total = focusMinutes * 60;
    let finishedUntil = 0;
    let sessions = { date: '', count: 0 };
    const listeners = [];
    const changed = () => listeners.forEach((fn) => fn());
    const today = () => new Date(o.now()).toLocaleDateString('sv'); // local yyyy-mm-dd

    function startPhase(p) {
      phase = p;
      total = (p === 'focus' ? focusMinutes : breakMinutes) * 60;
      endsAt = o.now() + total * 1000;
      running = true;
    }

    function countSession() {
      const d = today();
      sessions = { date: d, count: (sessions.date === d ? sessions.count : 0) + 1 };
      o.onSession({ ...sessions });
    }

    // Moves to the next phase when the current one has run out.
    function tick() {
      if (!running || o.now() < endsAt) return;
      if (phase === 'focus') {
        countSession();
        if (cycle) {
          startPhase('break');
          o.onPhase({ phase: 'break', minutes: breakMinutes });
        } else {
          running = false;
          phase = 'focus';
          total = focusMinutes * 60;
          finishedUntil = o.now() + 8000;
          o.onPhase({ phase: 'done', minutes: focusMinutes });
        }
      } else {
        startPhase('focus');
        o.onPhase({ phase: 'focus', minutes: focusMinutes });
      }
      changed();
    }

    const api = {
      tick,
      onChange: (fn) => listeners.push(fn),

      read() {
        tick();
        const d = today();
        return {
          running,
          phase,
          left: running ? Math.max(0, (endsAt - o.now()) / 1000) : total,
          total,
          finished: !running && o.now() < finishedUntil,
          cycle,
          focusMinutes,
          breakMinutes,
          sessions: sessions.date === d ? sessions.count : 0,
        };
      },

      // tap to start; tap again to reset (a reset never counts a session)
      toggle() {
        if (running) {
          running = false;
          phase = 'focus';
          total = focusMinutes * 60;
        } else {
          startPhase('focus');
        }
        finishedUntil = 0;
        changed();
      },

      // Lengths and the cycle switch cannot change while counting. persist=false for values loaded from settings.
      setMinutes(kind, m, persist = true) {
        if (running) return false;
        const next = kind === 'break' ? clamp(m, L.breakMin, L.breakMax) : clamp(m, L.focusMin, L.focusMax);
        if (kind === 'break') {
          if (next === breakMinutes) return false;
          breakMinutes = next;
        } else {
          if (next === focusMinutes) return false;
          focusMinutes = next;
          total = next * 60;
        }
        if (persist) o.onConfig({ focusMinutes, breakMinutes, cycle });
        changed();
        return true;
      },
      step(kind, dir) {
        return api.setMinutes(kind, (kind === 'break' ? breakMinutes + dir * L.breakStep : focusMinutes + dir * L.focusStep));
      },
      setCycle(on, persist = true) {
        if (running || !!on === cycle) return false;
        cycle = !!on;
        if (persist) o.onConfig({ focusMinutes, breakMinutes, cycle });
        changed();
        return true;
      },

      // values saved by main, applied at start-up (not saved again)
      loadConfig(c) {
        if (!c || running) return;
        if (c.focusMinutes) api.setMinutes('focus', c.focusMinutes, false);
        if (c.breakMinutes) api.setMinutes('break', c.breakMinutes, false);
        if (typeof c.cycle === 'boolean') api.setCycle(c.cycle, false);
      },
      loadSessions(s) {
        if (s && typeof s.count === 'number') {
          sessions = { date: String(s.date || ''), count: s.count };
          changed();
        }
      },
    };
    return api;
  }

  return { create };
});

// In the notch window: one shared timer, wired to main for chimes, toasts and saving.
if (typeof window !== 'undefined' && window.mochi && window.FocusTimer) {
  const H = window.mochi.theme.home;
  window.Focus = window.FocusTimer.create({
    focusMinutes: H.focusMinutes,
    breakMinutes: H.breakMinutes,
    cycle: H.cycle,
    now: () => Date.now(), // looked up each time, so tests can fast-forward the clock
    limits: { focusMin: H.focusMinMinutes, focusMax: H.focusMaxMinutes, focusStep: H.focusStepMinutes, breakMin: H.breakMinMinutes, breakMax: H.breakMaxMinutes, breakStep: H.breakStepMinutes },
    onPhase: (p) => window.mochi.focusPhase(p), // main plays the chime and shows the toast unless paused / in a game
    onSession: (s) => window.mochi.focusSession(s),
    onConfig: (c) => window.mochi.focusConfig(c),
  });
  setInterval(() => window.Focus.tick(), 500); // keeps counting even while the notch is collapsed
}
