// Assistant panel: what a chat request (or a ping from another tool) is doing, in the same style as the Claude Code
// panels. It replaces the Claude tab only in Chat-only mode, or while a tool is pinging, and only when Claude Code
// itself is idle, so it never gets in the way of a coding job.
// AssistantView.create() -> { el, update(assistant, label) }
(() => {
  const theme = window.mochi.theme;
  const A = theme.assistant;
  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (sec) => `${Math.floor(sec / 60)}:${pad2(Math.floor(sec % 60))}`;
  const tidy = (text) => {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
    const max = theme.done.bubbleChars;
    return t.length > max ? t.slice(0, max - 1).trimEnd() + '…' : t;
  };
  const MOOD = { idle: 'wink', thinking: 'focus', replying: 'happy', needs: 'curious', done: 'happy', error: 'dizzy' };

  function create() {
    const el = document.createElement('div');
    el.className = 'work assistant';
    el.dataset.phase = 'idle';
    el.innerHTML = `
      <div class="work-row">
        <div class="a-scene">
          <div class="a-mochi"></div>
          <div class="a-cloud"><i></i><i></i><i></i></div>
          <svg class="a-pad" viewBox="0 0 44 52" aria-hidden="true">
            <rect x="3" y="3" width="38" height="46" rx="6" class="a-paper"/>
            <path d="M11 17h22M11 26h22M11 35h14" class="a-line"/>
          </svg>
          <span class="a-pencil"></span>
          <span class="a-spark s1"></span><span class="a-spark s2"></span><span class="a-spark s3"></span>
          <span class="a-q">?</span>
        </div>
        <div class="work-mid">
          <div class="w-project" data-r="project">Assistant</div>
          <div class="w-timer" data-r="timer">0:00</div>
          <div class="w-step" data-r="sub">Ready</div>
        </div>
        <div class="bubble" data-r="bubble"></div>
      </div>
      <div class="a-bar" data-r="bar"><i></i></div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    const mochi = Mochi.create({ mood: 'wink', size: 60 });
    el.querySelector('.a-mochi').appendChild(mochi.el);
    if (theme.nav.onPanels) el.appendChild(Nav.create().el);

    let a = null;
    let label = 'Assistant';
    let lastPhase = '';

    function tick() {
      if (!a) return;
      const live = a.phase === 'thinking' || a.phase === 'replying';
      const secs = live && a.startedAt ? (Date.now() - a.startedAt) / 1000 : a.finishedAt && a.startedAt ? (a.finishedAt - a.startedAt) / 1000 : 0;
      r.timer.textContent = clock(secs);
    }
    setInterval(tick, 1000);

    return {
      el,
      update(next, who) {
        a = next || { phase: 'idle' };
        label = who || (a && a.label) || 'Assistant';
        const phase = a.phase || 'idle';
        const ping = a.source === 'ping';
        el.dataset.phase = phase;
        if (phase !== lastPhase) {
          lastPhase = phase;
          mochi.setMood(MOOD[phase] || 'wink');
        }
        r.project.textContent = ping && a.label ? a.label : label;
        const n = a.chatsToday || 0;
        const chats = n ? ` · ${n} chat${n === 1 ? '' : 's'} today` : '';
        r.sub.textContent =
          phase === 'thinking' ? 'Thinking…' : phase === 'replying' ? 'Writing the answer…' : phase === 'done' ? (ping ? 'Done' : 'Answered') + chats : phase === 'needs' ? 'Needs you' : phase === 'error' ? 'Could not answer' : ping ? 'Ready' : 'Ready' + chats;
        r.bubble.textContent = phase === 'idle' ? (ping ? A.pingHint : A.waitingHint) : phase === 'thinking' || phase === 'replying' ? (ping ? tidy(a.message) : '') : tidy(a.message);
        r.bubble.classList.toggle('empty', !r.bubble.textContent);
        tick();
      },
    };
  }

  window.AssistantView = { create };
})();
