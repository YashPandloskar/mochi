// Break reminder: Mochi suggests a stretch or the 20-20-20 eye rest after a long stretch of work.
// BreakView.create({ onAnswer }) -> { el, show(info) }
//   "Eye rest" runs a 20 second countdown (look at something 20 feet away); "Later" snoozes; "Skip" dismisses.
(() => {
  const theme = window.mochi.theme;
  const secs = theme.personality.eyeRestSeconds;
  const R = 36;
  const C = 2 * Math.PI * R;

  function create({ onAnswer }) {
    const el = document.createElement('div');
    el.className = 'break-view';
    el.innerHTML = `
      <div class="brk-mochi"><div class="brk-sway"></div></div>
      <div class="brk-main" data-r="ask">
        <span class="brk-chip"><i></i>Break time</span>
        <div class="brk-title" data-r="title">50 minutes in</div>
        <div class="brk-text">Stand up and stretch, or rest your eyes: look at something 20 feet away for 20 seconds.</div>
        <div class="brk-actions">
          <button class="btn brk-go" data-r="eye" type="button">Eye rest · ${secs}s</button>
          <button class="btn brk-later" data-r="later" type="button">Later</button>
          <button class="btn brk-skip" data-r="skip" type="button">Skip</button>
        </div>
      </div>
      <div class="brk-main brk-rest" data-r="rest" hidden>
        <div class="brk-ring">
          <svg viewBox="0 0 84 84" width="84" height="84"><circle cx="42" cy="42" r="${R}" class="brk-track"/><circle cx="42" cy="42" r="${R}" class="brk-arc" data-r="arc" stroke-dasharray="${C.toFixed(2)}" transform="rotate(-90 42 42)"/></svg>
          <div class="brk-count" data-r="count">${secs}</div>
        </div>
        <div class="brk-resttext" data-r="resttext">Look far away…</div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    const mochi = Mochi.create({ mood: 'happy', size: 84 });
    el.querySelector('.brk-sway').appendChild(mochi.el);

    let restTimer = null;
    let autoTimer = null;

    function finish(action) {
      clearInterval(restTimer);
      clearTimeout(autoTimer);
      onAnswer(action);
    }

    r.later.addEventListener('click', () => finish('snooze'));
    r.skip.addEventListener('click', () => finish('ok'));
    r.eye.addEventListener('click', () => {
      clearTimeout(autoTimer);
      r.ask.hidden = true;
      r.rest.hidden = false;
      mochi.setMood('sleepy'); // eyes closed along with you
      const end = Date.now() + secs * 1000;
      restTimer = setInterval(() => {
        const left = Math.max(0, (end - Date.now()) / 1000);
        r.count.textContent = Math.ceil(left);
        r.arc.style.strokeDashoffset = String((C * (1 - left / secs)).toFixed(2));
        if (left <= 0) {
          clearInterval(restTimer);
          mochi.setMood('happy');
          r.resttext.textContent = 'Nice. Back to it!';
          r.count.textContent = '✓';
          setTimeout(() => finish('ok'), 1400);
        }
      }, 200);
    });

    return {
      el,
      // ignored reminders hand themselves back after a minute (as "Later")
      show(info) {
        clearInterval(restTimer);
        clearTimeout(autoTimer);
        r.ask.hidden = false;
        r.rest.hidden = true;
        r.resttext.textContent = 'Look far away…';
        r.arc.style.strokeDashoffset = '0';
        mochi.setMood('happy');
        r.title.textContent = info && info.minutes ? `${info.minutes} minutes in` : 'Time for a break';
        autoTimer = setTimeout(() => finish('snooze'), 60000);
      },
    };
  }

  window.BreakView = { create };
})();
