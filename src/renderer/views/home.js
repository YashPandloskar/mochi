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

  const STEP_TEXT = theme.working.stepText;

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
          <button class="t-art" data-r="art" type="button" title="Open Apple Music"></button>
          <div class="t-bottom">
            <div class="t-title" data-r="title">Nothing playing</div>
            <div class="t-artist" data-r="artist">Apple Music</div>
            <button class="pill" data-r="open" type="button" hidden>Open Apple Music</button>
          </div>
          <div class="t-ctl" data-r="ctl" hidden>
            <button class="t-mini" data-r="prev" type="button" title="Previous">${Icons.prev(12)}</button>
            <button class="t-mini" data-r="next" type="button" title="Next">${Icons.next(12)}</button>
          </div>
          <button class="t-round t-playpause" data-r="playpause" type="button" hidden>${Icons.pause(14)}</button>
        </div>
        <button class="tile tile-focus" data-r="focus" type="button">
          <div class="t-label" data-r="focusLabel">Focus</div>
          <span class="t-round t-play" data-r="focusBtn">${Icons.play(14)}</span>
          <div class="t-big" data-r="focusTime">${H.focusMinutes}:00</div>
          <div class="t-sub" data-r="focusSub">Ready to start</div>
        </button>
      </div>
      <button class="notes-strip" data-r="notes" type="button" title="Open Notes">
        <span class="ns-icon">${Icons.checklist(14)}</span>
        <span class="ns-title" data-r="notesTitle">To-do</span>
        <span class="ns-next" data-r="notesNext">Add a task or jot a note</span>
        <span class="ns-go">${Icons.chevron(13)}</span>
      </button>
      `;
    el.appendChild(Nav.create().el);

    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    const date = el.querySelector('.home-date');
    const time = el.querySelector('.home-time');
    const headerMochi = Mochi.create({ mood: 'wink', size: 22 });
    const headerBox = el.querySelector('.home-mochi');
    headerBox.appendChild(headerMochi.el);

    el.querySelectorAll('.tile').forEach((t, i) => {
      t.style.setProperty('--to', Object.values(H.tileColors)[i]);
      t.style.setProperty('--delay', H.rise.delaysMs[i] + 'ms');
    });

    // ---------- Focus countdown (tap to start, tap again to reset; shared with the Focus tab) ----------
    r.focus.addEventListener('click', () => {
      Focus.toggle();
      tick();
    });

    let session = null;
    let usage = null;

    // ---------- Music tile (Apple Music) ----------
    const tileMusic = el.querySelector('.tile-music');
    const send = (cmd) => window.mochi.musicCommand(cmd);
    r.playpause.addEventListener('click', () => send('playpause'));
    r.prev.addEventListener('click', () => send('prev'));
    r.next.addEventListener('click', () => send('next'));
    r.open.addEventListener('click', () => send('open'));
    r.art.addEventListener('click', () => send('open'));

    // ---------- Notes strip: how far the to-do list is, and what is next ----------
    r.notes.addEventListener('click', () => Nav.go('notes'));
    function renderNotes(d) {
      const todos = (d && d.todos) || [];
      const done = todos.filter((t) => t.done).length;
      const next = todos.find((t) => !t.done);
      r.notesTitle.textContent = todos.length ? 'To-do · ' + done + ' of ' + todos.length : 'To-do';
      r.notesNext.textContent = next ? next.text : todos.length ? 'All done' : d && d.note ? 'A note is saved' : 'Add a task or jot a note';
      r.notes.classList.toggle('all-done', !!todos.length && !next);
    }

    function renderMusic(m) {
      const live = m && m.enabled && m.status && m.status !== 'none';
      const playing = !!(m && m.status === 'playing');
      r.eq.classList.toggle('playing', playing);
      tileMusic.classList.toggle('has-button', !!live);
      r.playpause.hidden = !live;
      r.ctl.hidden = !live;
      r.open.hidden = !(m && m.enabled && !live);
      r.artist.hidden = !live && !!(m && m.enabled);
      if (live) {
        r.title.textContent = m.title || 'Unknown track';
        r.artist.textContent = m.artist || '';
        setHtml(r.playpause, playing ? Icons.pause(14) : Icons.play(14));
        r.playpause.title = playing ? 'Pause' : 'Play';
        r.art.style.backgroundImage = m.art ? `url("${m.art}")` : '';
      } else {
        r.title.textContent = m && m.enabled === false ? 'Music off' : 'Nothing playing';
        r.artist.textContent = m && m.enabled === false ? 'Turn it on from the tray' : 'Apple Music';
        r.art.style.backgroundImage = '';
      }
    }

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

      const f = Focus.read();
      const onBreak = f.running && f.phase === 'break';
      r.focusLabel.textContent = onBreak ? 'Break' : 'Focus';
      r.focus.style.setProperty('--to', onBreak ? H.breakTileColor : H.tileColors.focus); // green while on a break
      setHtml(r.focusBtn, f.running ? Icons.stop(14) : Icons.play(14));
      r.focusTime.textContent = f.running ? clock(f.left) : f.finished ? '0:00' : clock(f.total);
      r.focusSub.textContent = f.running
        ? `${Math.ceil(f.left / 60)} min left`
        : f.finished
        ? 'Time is up'
        : f.sessions
        ? `${f.sessions} session${f.sessions === 1 ? '' : 's'} today`
        : 'Ready to start';
    }

    setInterval(tick, 1000);
    tick();

    return {
      el,
      update(next) {
        if (next.session) session = next.session;
        if (next.usage) usage = next.usage;
        if (next.music) renderMusic(next.music);
        if (next.notes) renderNotes(next.notes);
        renderUsage();
        tick();
      },
      // personality: sleepy when napping or late at night, swaying while music plays
      setLook({ napping, dancing, look }) {
        headerMochi.setMood(napping || look === 'night' ? 'sleepy' : 'wink');
        headerBox.classList.toggle('dancing', !!dancing);
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
