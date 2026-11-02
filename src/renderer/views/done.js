// Done panel: happy Mochi jumps three times with confetti, "Done" pops in, Claude's final message slides up.
// DoneView.create() -> { el, update(session), play() }
(() => {
  const theme = window.mochi.theme;
  const D = theme.done;

  const tidy = (text) => {
    const t = String(text || '').replace(/```[\s\S]*?```/g, ' ').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
    if (!t) return 'All steps finished.';
    return t.length > D.bubbleChars ? t.slice(0, D.bubbleChars - 1).trimEnd() + '…' : t;
  };

  function create() {
    const el = document.createElement('div');
    el.className = 'work done-view';
    el.innerHTML = `
      <div class="work-row">
        <div class="done-mochi"><div class="jumper"></div><div class="confetti"></div></div>
        <div class="work-mid">
          <div class="w-project" data-r="project"></div>
          <div class="w-timer" data-r="timer">0:00</div>
          <div class="w-done"><b>Done</b> <span>every step</span></div>
        </div>
        <div class="bubble" data-r="bubble"></div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.style.setProperty('--jump-px', D.jumpPx + 'px');
    el.style.setProperty('--jump-s', D.jumpSeconds + 's');
    el.style.setProperty('--bubble-bg', D.bubbleBackground);
    const mochi = Mochi.create({ mood: 'happy', size: 60 });
    el.querySelector('.jumper').appendChild(mochi.el);
    const progress = Progress.create();
    el.appendChild(progress.el);
    const confetti = el.querySelector('.confetti');
    const jumper = el.querySelector('.jumper');

    function burst() {
      confetti.replaceChildren();
      for (let i = 0; i < D.confettiPieces; i++) {
        const a = (i / D.confettiPieces) * Math.PI * 2 + Math.random() * 0.4;
        const dist = 34 + Math.random() * 26;
        const p = document.createElement('i');
        p.style.setProperty('--dx', Math.round(Math.cos(a) * dist) + 'px');
        p.style.setProperty('--dy', Math.round(Math.sin(a) * dist - 10) + 'px');
        p.style.setProperty('--rot', Math.round((Math.random() - 0.5) * 540) + 'deg');
        p.style.background = D.confettiColors[i % D.confettiColors.length];
        p.style.animationDelay = (Math.random() * 0.12).toFixed(2) + 's';
        confetti.appendChild(p);
      }
    }

    return {
      el,
      update(s) {
        r.project.textContent = s.project || 'Claude';
        const from = s.startedAt;
        const to = s.finishedAt || Date.now();
        r.timer.textContent = from ? WorkingView.clock((to - from) / 1000) : '0:00';
        r.bubble.textContent = tidy(s.lastMessage);
      },
      // replay every entrance animation (called when the panel is shown for a finished job)
      play() {
        el.classList.remove('play');
        jumper.style.animation = 'none';
        void el.offsetWidth;
        jumper.style.animation = '';
        burst();
        progress.sweep(D.sweepStaggerSeconds);
        el.classList.add('play');
      },
    };
  }

  window.DoneView = { create };
})();
