// Home panel: header, Claude / Music / Focus tiles and the nav pill.
// HomeView.create() -> { el, update({ session, usage }), rise(), tick() }
(() => {
  const theme = window.mochi.theme;
  const H = theme.home;
  const U = theme.usage;

  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    const s = sec % 60;
    return h ? `${h}:${pad2(m)}:${pad2(s)}` : `${m}:${pad2(s)}`;
  };
  const untilText = (sec) => {
    const m = Math.max(1, Math.round(sec / 60));
    if (m < 60) return `${m}m`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ${m % 60}m`;
    return `${Math.floor(h / 24)}d ${h % 24}h`;
  };
  const tokensText = (n) => (n >= 1e6 ? `${(n / 1e6).toFixed(1)}M` : n >= 1e3 ? `${Math.round(n / 1e3)}k` : String(n));
  const barColor = (pct) => (pct >= U.dangerAt ? U.colors.danger : pct >= U.warnAt ? U.colors.warn : U.colors.normal);

  const STEP_TEXT = ['Reading files', 'Reading files', 'Making changes', 'Running tests', 'Wrapping up'];

  function create() {
    const el = document.createElement('div');
    el.className = 'home';
    el.innerHTML = `
      <div class="home-head">
        <span class="home-mochi"></span>
        <span class="home-date"></span>
        <span class="home-time"></span>
      </div>
      <div class="tiles">
        <div class="tile tile-claude">
          <div class="t-label">Claude code</div>
          <span class="t-spark">${Icons.sparkle(20)}</span>
          <div class="t-big" data-r="timer">0:00</div>
          <div class="t-sub" data-r="status">Ready</div>
          <div class="t-usage" data-r="usage" hidden></div>
        </div>
        <div class="tile tile-music">
          <div class="t-label">Music <span class="eq" data-r="eq"><i></i><i></i><i></i></span></div>
          <div class="t-art" data-r="art"></div>
          <div class="t-bottom">
            <div class="t-title" data-r="title">Nothing playing</div>
            <div class="t-artist" data-r="artist">Apple Music</div>
          </div>
          <button class="t-round t-playpause" data-r="playpause" hidden>${Icons.pause(14)}</button>
        </div>
        <button class="tile tile-focus" data-r="focus" type="button">
          <div class="t-label">Focus</div>
          <span class="t-round t-play" data-r="focusBtn">${Icons.play(14)}</span>
          <div class="t-big" data-r="focusTime">${H.focusMinutes}:00</div>
          <div class="t-sub" data-r="focusSub">Ready to start</div>
        </button>
      </div>
      <div class="nav">
        <span class="nav-item active">${Icons.home(14)}<b>Home</b></span>
        <span class="nav-item">${Icons.sparkle(14)}</span>
        <span class="nav-item">${Icons.music(14)}</span>
        <span class="nav-item">${Icons.chat(14)}</span>
        <span class="nav-item">${Icons.timer(14)}</span>
        <span class="nav-item">${Icons.inbox(14)}</span>
        <span class="nav-item">${Icons.copy(14)}</span>
        <span class="nav-item">${Icons.doc(14)}</span>
      </div>`;

    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    const date = el.querySelector('.home-date');
    const time = el.querySelector('.home-time');
    el.querySelector('.home-mochi').appendChild(Mochi.create({ mood: 'wink', size: 22 }).el);

    el.querySelectorAll('.tile').forEach((t, i) => {
      t.style.setProperty('--to', Object.values(H.tileColors)[i]);
      t.style.setProperty('--delay', H.rise.delaysMs[i] + 'ms');
    });

    // ---------- Focus countdown (tap to start, tap again to reset) ----------
    const focus = { endsAt: 0, showDoneUntil: 0 };
    r.focus.addEventListener('click', () => {
      focus.endsAt = focus.endsAt ? 0 : Date.now() + H.focusMinutes * 60000;
      focus.showDoneUntil = 0;
      tick();
    });

    let session = null;
    let usage = null;

    function renderUsage() {
      const box = r.usage;
      if (!usage || !usage.enabled) {
        box.hidden = true;
        return;
      }
      box.hidden = false;
      if (usage.mode === 'bars') {
        const row = (label, w) => {
          const pct = w ? Math.round(w.pct) : null;
          return `<div class="u-row"><span class="u-label">${label} ${pct === null ? '—' : pct + '%'}</span>
            <span class="u-bar"><i style="width:${pct === null ? 0 : pct}%;background:${pct === null ? 'transparent' : barColor(pct)}"></i></span></div>`;
        };
        box.innerHTML = row('5h', usage.fiveHour) + row('Week', usage.sevenDay);
      } else {
        const cost = usage.cost >= 0.005 ? ` · ~$${usage.cost.toFixed(2)}` : ''; // only sent on API-key billing
        box.innerHTML = `<div class="u-line">~${tokensText(usage.tokens)} tokens today${cost}</div>`;
      }
    }

    // At 75% or more the status line shows when the busier window resets.
    function status() {
      if (usage && usage.enabled && usage.mode === 'bars') {
        const hot = [usage.fiveHour, usage.sevenDay].filter((w) => w && w.pct >= U.warnAt && w.resetsAt);
        if (hot.length) {
          const w = hot.sort((a, b) => b.pct - a.pct)[0];
          return `Resets in ${untilText(w.resetsAt - Date.now() / 1000)}`;
        }
      }
      if (session && session.state === 'working') return STEP_TEXT[session.step] || 'Working';
      const jobs = session && session.jobsToday;
      return jobs ? `Ready · ${jobs} job${jobs === 1 ? '' : 's'} today` : 'Ready';
    }

    function tick() {
      const now = new Date();
      date.textContent = now.toLocaleDateString('en-GB', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }).replace(',', '');
      time.textContent = now.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

      const working = session && session.state === 'working' && session.startedAt;
      r.timer.textContent = clock(working ? (Date.now() - session.startedAt) / 1000 : 0);
      r.status.textContent = status();

      if (focus.endsAt) {
        const left = (focus.endsAt - Date.now()) / 1000;
        if (left <= 0) {
          focus.endsAt = 0;
          focus.showDoneUntil = Date.now() + 8000;
        } else {
          r.focusTime.textContent = clock(left);
          r.focusSub.textContent = `${Math.ceil(left / 60)} min left`;
          r.focusBtn.innerHTML = Icons.stop(14);
          return;
        }
      }
      r.focusBtn.innerHTML = Icons.play(14);
      if (Date.now() < focus.showDoneUntil) {
        r.focusTime.textContent = '0:00';
        r.focusSub.textContent = 'Time is up';
      } else {
        r.focusTime.textContent = `${H.focusMinutes}:00`;
        r.focusSub.textContent = 'Ready to start';
      }
    }

    setInterval(tick, 1000);
    tick();

    return {
      el,
      update(next) {
        if (next.session) session = next.session;
        if (next.usage) usage = next.usage;
        renderUsage();
        tick();
      },
      // replay the staggered rise-in
      rise() {
        el.classList.remove('rise');
        void el.offsetWidth;
        el.classList.add('rise');
      },
    };
  }

  window.HomeView = { create };
})();
