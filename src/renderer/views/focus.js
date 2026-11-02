// Focus tab: the 25 minute countdown with a progress ring. Tap the button to start, tap again to reset.
// FocusView.create() -> { el }
(() => {
  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
  const R = 44;
  const C = 2 * Math.PI * R;

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
          <div class="fv-label">Focus</div>
          <div class="fv-sub" data-r="sub">Ready to start</div>
          <button class="fv-go" data-r="go" type="button">${Icons.play(14)}<span>Start</span></button>
        </div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.appendChild(Nav.create().el);

    r.go.addEventListener('click', () => {
      Focus.toggle();
      tick();
    });

    function tick() {
      const f = Focus.read();
      r.time.textContent = f.running ? clock(f.left) : f.finished ? '0:00' : clock(f.total);
      r.sub.textContent = f.running ? `${Math.ceil(f.left / 60)} min left` : f.finished ? 'Time is up' : 'Ready to start';
      r.go.innerHTML = (f.running ? Icons.stop(14) : Icons.play(14)) + `<span>${f.running ? 'Reset' : 'Start'}</span>`;
      const used = f.running ? 1 - f.left / f.total : 0;
      r.arc.style.strokeDashoffset = String((C * used).toFixed(2));
    }
    setInterval(tick, 500);
    tick();

    return { el };
  }

  window.FocusView = { create };
})();
