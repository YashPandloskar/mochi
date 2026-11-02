// Claude tab while nothing is running: the last job's time and message, or a hint.
// ClaudeIdleView.create() -> { el, update(session) }
(() => {
  const tidy = (text) => {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
    const max = window.mochi.theme.done.bubbleChars;
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  };

  function create() {
    const el = document.createElement('div');
    el.className = 'work';
    el.innerHTML = `
      <div class="work-row">
        <div class="done-mochi"><div class="jumper"></div></div>
        <div class="work-mid">
          <div class="w-project" data-r="project">Claude Code</div>
          <div class="w-timer" data-r="timer">0:00</div>
          <div class="w-step" data-r="sub">Ready</div>
        </div>
        <div class="bubble" data-r="bubble"></div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.querySelector('.jumper').appendChild(Mochi.create({ mood: 'wink', size: 60 }).el);
    const progress = Progress.create();
    el.appendChild(progress.el);
    if (window.mochi.theme.nav.onPanels) el.appendChild(Nav.create().el);

    return {
      el,
      update(s) {
        const last = s && s.finishedAt && s.startedAt;
        r.project.textContent = (s && s.project) || 'Claude Code';
        r.timer.textContent = last ? WorkingView.clock((s.finishedAt - s.startedAt) / 1000) : '0:00';
        const jobs = s && s.jobsToday;
        r.sub.textContent = jobs ? `Ready · ${jobs} job${jobs === 1 ? '' : 's'} today` : 'Ready';
        r.bubble.textContent = last && s.lastMessage ? tidy(s.lastMessage) : 'Nothing running right now. Start a task in Claude Code and it shows up here.';
        progress.set(last ? 4 : 0);
      },
    };
  }

  window.ClaudeIdleView = { create };
})();
