// Focus tab: Pomodoro timer with a progress ring, focus / break lengths, the Cycle switch and today's sessions.
// Tap Start to begin a focus period; with Cycle on it rolls into a break and back until you press Reset.
// FocusView.create() -> { el }
(() => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
  const R = 44;
  const C = 2 * Math.PI * R;
  const MAX_DOTS = 8;

  function create() {
    const el = document.createElement('div');
    el.className = 'focus-view';
    el.innerHTML = `
      <div class="fv-row">
        <div class="fv-ring">
          <svg viewBox="0 0 100 100" width="108" height="108">
            <circle cx="50" cy="50" r="${R}" class="fv-track"/>
            <circle cx="50" cy="50" r="${R}" class="fv-arc" data-r="arc" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="0" transform="rotate(-90 50 50)"/>
          </svg>
          <div class="fv-time" data-r="time">25:00</div>
        </div>
        <div class="fv-side">
          <div class="fv-label" data-r="label">Focus</div>
          <div class="fv-sub" data-r="sub">Ready to start</div>
          <div class="fv-steps" data-r="steps">
            <div class="fv-step-row"><em>Focus</em>
              <button class="fv-step" data-r="fminus" type="button" title="Shorter focus">−</button><span data-r="fmins">25 min</span><button class="fv-step" data-r="fplus" type="button" title="Longer focus">+</button>
            </div>
            <div class="fv-step-row"><em>Break</em>
              <button class="fv-step" data-r="bminus" type="button" title="Shorter break">−</button><span data-r="bmins">5 min</span><button class="fv-step" data-r="bplus" type="button" title="Longer break">+</button>
            </div>
          </div>
          <div class="fv-actions">
            <button class="fv-go" data-r="go" type="button">${Icons.play(14)}<span>Start</span></button>
            <button class="fv-cycle" data-r="cycle" type="button" role="switch" title="Pomodoro: focus, break, focus again, until you reset">Cycle</button>
          </div>
        </div>
      </div>
      <div class="fv-sessions" data-r="sessions"></div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.appendChild(Nav.create().el);

    const act = (fn) => () => (fn(), tick());
    r.fminus.addEventListener('click', act(() => Focus.step('focus', -1)));
    r.fplus.addEventListener('click', act(() => Focus.step('focus', 1)));
    r.bminus.addEventListener('click', act(() => Focus.step('break', -1)));
    r.bplus.addEventListener('click', act(() => Focus.step('break', 1)));
    r.cycle.addEventListener('click', act(() => Focus.setCycle(!Focus.read().cycle)));
    r.go.addEventListener('click', act(() => Focus.toggle()));

    function tick() {
      const f = Focus.read();
      const onBreak = f.running && f.phase === 'break';
      el.classList.toggle('break', onBreak);
      r.label.textContent = onBreak ? 'Break' : 'Focus';
      r.time.textContent = f.running ? clock(f.left) : f.finished ? '0:00' : clock(f.total);
      r.sub.textContent = f.running
        ? `${Math.ceil(f.left / 60)} min left${f.cycle ? '' : ''}`
        : f.finished
        ? 'Time is up'
        : f.sessions
        ? `Session ${f.sessions + 1} next`
        : 'Ready to start';
      r.go.innerHTML = (f.running ? Icons.stop(14) : Icons.play(14)) + `<span>${f.running ? 'Reset' : 'Start'}</span>`;
      r.fmins.textContent = `${f.focusMinutes} min`;
      r.bmins.textContent = `${f.breakMinutes} min`;
      r.steps.classList.toggle('locked', f.running); // lengths cannot change while counting
      r.cycle.classList.toggle('on', f.cycle);
      r.cycle.classList.toggle('locked', f.running);
      r.cycle.setAttribute('aria-checked', String(f.cycle));
      r.cycle.textContent = f.cycle ? 'Cycle on' : 'Cycle off';
      const used = f.running ? 1 - f.left / f.total : 0;
      r.arc.style.strokeDashoffset = String((C * used).toFixed(2));

      // today's finished focus periods as dots
      const n = f.sessions;
      const dots = Math.min(n, MAX_DOTS);
      r.sessions.innerHTML = n
        ? `<span class="fv-dots">${'<i></i>'.repeat(dots)}${n > MAX_DOTS ? `<b>+${n - MAX_DOTS}</b>` : ''}</span> ${n} focus session${n === 1 ? '' : 's'} today`
        : 'No focus sessions yet today';
    }
    Focus.onChange(tick);
    setInterval(tick, 500);
    tick();

    return { el };
  }

  window.FocusView = { create };
})();
