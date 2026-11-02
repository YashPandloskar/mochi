(() => {
  const theme = window.mochi.theme;
  const root = document.documentElement.style;
  const notch = document.getElementById('notch');
  const eyesEl = document.getElementById('eyes');
  const content = document.getElementById('content');
  const gradient = notch.querySelector('.gradient');
  const gradientAlt = notch.querySelector('.gradient-alt');
  const ms = (s) => Math.round(s * 1000);
  const radius = (r) => r.map((v) => v + 'px').join(' ');
  const shadow = ([x, blur], c) => `${x}px 0 ${blur}px ${c}`.replace(/^0px 0 /, '0 0 ');

  // ---------- theme -> CSS variables ----------
  const H = theme.home;
  const W = theme.working;
  const vars = {
    '--text': theme.colors.text,
    '--muted': theme.colors.muted,
    '--resize': theme.timings.resize + 's',
    '--easing': theme.timings.easing,
    '--fade': theme.timings.fade + 's',
    '--done-fade': theme.timings.doneCrossfade + 's',
    '--collapsed-h': theme.collapsed.height + 'px',
    '--eye-gap': theme.eyes.gap + 'px',
    '--home-pad': H.padding + 'px',
    '--label': H.labelColor,
    '--tile-h': H.tile.height + 'px',
    '--tile-radius': H.tile.radius + 'px',
    '--tile-pad': H.tile.padding + 'px',
    '--tile-gap': H.tile.gap + 'px',
    '--tile-top': H.tile.topColor,
    '--rise-ms': H.rise.ms + 'ms',
    '--rise-ease': H.rise.easing,
    '--spark-s': H.sparkleSpinSeconds + 's',
    '--breathe-s': H.playBreatheSeconds + 's',
    '--eq-1': H.equaliserSeconds[0] + 's',
    '--eq-2': H.equaliserSeconds[1] + 's',
    '--eq-3': H.equaliserSeconds[2] + 's',
    '--nav-h': H.nav.height + 'px',
    '--nav-bg': H.nav.background,
    '--nav-active': H.nav.activeBackground,
    '--nav-icon': H.nav.icon,
    '--bar-h': theme.usage.barHeight + 'px',
    '--bar-track': theme.usage.track,
    '--card-w': W.cardWidth + 'px',
    '--card-bg': W.cardBackground,
    '--card-border': W.cardBorder,
    '--skel-s': W.skeletonSeconds + 's',
    '--rem-bg': W.removed.background,
    '--rem-fg': W.removed.color,
    '--add-bg': W.added.background,
    '--add-fg': W.added.color,
    '--passed': W.passed,
    '--bar-h2': W.barHeight + 'px',
    '--bar-gap': W.barGap + 'px',
    '--bar-track2': W.barTrack,
    '--bar-fill': W.barFill,
    '--bar-s': W.barSeconds + 's',
    '--needs-fg': theme.needs.chipColor,
    '--needs-chip-bg': theme.needs.chipBackground,
    '--chip-s': theme.needs.chipPulseSeconds + 's',
    '--box-bg': theme.needs.boxBackground,
    '--box-border': theme.needs.boxBorder,
    '--allow-bg': theme.needs.allowBackground,
    '--allow-fg': theme.needs.allowColor,
    '--allow-s': theme.needs.allowBreatheSeconds + 's',
    '--deny-bg': theme.needs.denyBackground,
    '--wobble-deg': theme.needs.wobbleDeg + 'deg',
    '--wobble-s': theme.needs.wobbleSeconds + 's',
    '--q-s': theme.needs.questionSeconds + 's',
    '--ring-size': theme.companions.timer.ringSize + 'px',
    '--ring-stroke': theme.companions.timer.ringStroke,
    '--timer-ring': theme.companions.timer.ring,
    '--timer-text': theme.companions.timer.text,
    '--timer-font': theme.companions.timer.fontSize + 'px',
    '--bubble-w': theme.companions.music.width + 'px',
    '--bubble-h': theme.companions.music.height + 'px',
    '--bubble-radius': radius(theme.companions.music.radius),
    '--bubble-bg': theme.companions.music.background,
    '--bubble-art': theme.companions.music.art + 'px',
    '--bubble-paused': theme.companions.music.pausedOpacity,
    '--lean': theme.lively.leanScale,
    '--lean-s': theme.lively.leanSeconds + 's',
    '--dots-s': theme.lively.typingDotsSeconds + 's',
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  notch.classList.toggle('glow', theme.notchGlow);

  let state = 'idle';
  let expanded = false;
  let hover = false;
  let collapseTimer = null;
  let contentTimer = null;
  let greenTimer = null;
  let lastSession = null;
  let lastMusic = null;
  let timerOn = false; // the Focus timer is counting: the collapsed notch widens to show it
  const bubble = document.getElementById('bubble');
  const bart = document.getElementById('bart');
  const cArc = document.getElementById('cr-arc');
  const cTime = document.getElementById('ctime');
  const RING_C = 2 * Math.PI * 7;
  cArc.style.strokeDasharray = RING_C.toFixed(2);
  let tab = 'home'; // nav tab: home | claude | music | focus
  let musicTint = null; // album colour for the Music panel gradient
  let motion = theme.motion; // "subtle" or "lively" (tray setting overrides the theme default)
  document.documentElement.dataset.motion = motion;

  // Needs-you and Done open by themselves; Working stays as eyes until you hover.
  const autoOpens = () => state === 'needs' || state === 'done';

  // ---------- panel views ----------
  const home = window.HomeView.create();
  const working = window.WorkingView.create();
  const done = window.DoneView.create();
  const needs = window.NeedsView.create();
  const claudeIdle = window.ClaudeIdleView.create();
  const music = window.MusicView.create({
    onTint: (colour) => {
      musicTint = colour;
      if (expanded && viewKey() === 'music') applyGeometry();
    },
  });
  const focus = window.FocusView.create();
  const views = { home, working, done, needs, claudeIdle, music, focus };

  content.append(...Object.values(views).map((v) => v.el));

  // Which panel is showing: Needs-you always wins; otherwise the nav tab decides.
  function viewKey() {
    if (state === 'needs') return 'needs';
    if (tab === 'claude') return state === 'working' ? 'working' : state === 'done' ? 'done' : 'claudeIdle';
    return tab;
  }

  // The tab to start on when the notch opens or the state changes.
  const defaultTab = () => (state === 'working' || state === 'done' ? 'claude' : 'home');

  function showView() {
    const key = viewKey();
    for (const [k, v] of Object.entries(views)) v.el.style.display = k === key ? '' : 'none';
    Nav.setActive(tab);
    if (lastSession) {
      working.update(lastSession);
      done.update(lastSession);
      needs.update(lastSession);
      claudeIdle.update(lastSession);
    }
  }

  // Replays the entrance animation of whichever panel is showing.
  function playView() {
    const key = viewKey();
    if (key === 'home') home.rise();
    else if (key === 'done') done.play();
  }

  // Tapping a nav icon switches the panel.
  Nav.onSelect((id) => {
    if (id === tab) return;
    tab = id;
    if (!expanded) return;
    showView();
    applyGeometry();
    playView();
  });

  // ---------- geometry ----------
  function turnGreen() {
    notch.classList.add('green');
  }

  function applyGeometry() {
    if (expanded) {
      const key = viewKey();
      const p = theme.panels[key];
      const h = p.heightWithNav && theme.nav.onPanels ? p.heightWithNav : p.height;
      const to = key === 'music' && musicTint ? musicTint : p.to;
      notch.style.width = theme.expanded.width + 'px';
      notch.style.height = h + 'px';
      notch.style.borderRadius = radius(theme.expanded.radius);
      notch.style.background = 'transparent';
      gradient.style.background = `linear-gradient(to bottom, ${p.from}, ${to})`;
      if (p.fromAlt) gradientAlt.style.background = `linear-gradient(to bottom, ${p.fromAlt}, ${p.toAlt})`;
      notch.classList.toggle('is-done', key === 'done'); // the green crossfade belongs to the Done panel only
      window.mochi.setHitSize({ w: theme.expanded.width, h, collapsed: false });
      bubble.classList.add('hide-expanded');
    } else {
      const w = timerOn ? theme.collapsed.timerWidth : theme.collapsed.width;
      notch.style.width = w + 'px';
      notch.style.height = theme.collapsed.height + 'px';
      notch.style.borderRadius = radius(theme.collapsed.radius);
      notch.style.background = theme.collapsed.background;
      notch.classList.toggle('timer-on', timerOn);
      // the bubble sits just right of the notch and follows it when it widens
      bubble.style.left = `calc(50% + ${w / 2 + theme.companions.music.gap}px)`;
      bubble.classList.remove('hide-expanded');
      window.mochi.setHitSize({ w, h: theme.collapsed.height, collapsed: true });
    }
  }

  // Expand: resize first, then fade the content in. Collapse: fade out, then resize.
  function expand() {
    if (expanded) return;
    clearTimeout(contentTimer);
    expanded = true;
    tab = defaultTab();
    notch.classList.remove('content-visible');
    content.style.visibility = 'visible';
    showView();
    applyGeometry();
    notch.classList.add('expanded');
    contentTimer = setTimeout(() => {
      notch.classList.add('content-visible');
      playView();
    }, ms(theme.timings.resize * 0.6));
  }

  function collapse() {
    if (!expanded) return;
    clearTimeout(contentTimer);
    notch.classList.remove('content-visible');
    contentTimer = setTimeout(() => {
      expanded = false;
      notch.classList.remove('expanded');
      applyGeometry();
      // stop painting hidden animations once the shrink has finished
      contentTimer = setTimeout(() => (content.style.visibility = 'hidden'), ms(theme.timings.resize));
    }, ms(theme.timings.fade));
  }

  function scheduleCollapse() {
    clearTimeout(collapseTimer);
    collapseTimer = setTimeout(() => {
      if (!hover && !autoOpens()) collapse();
    }, ms(theme.timings.collapseDelay));
  }

  // ---------- collapsed companions ----------
  const mmss = (sec) => `${Math.floor(sec / 60)}:${String(Math.floor(sec % 60)).padStart(2, '0')}`;

  function refreshTimer() {
    const f = Focus.read();
    if (f.running) {
      cTime.textContent = mmss(f.left);
      cArc.style.strokeDashoffset = (RING_C * (1 - f.left / f.total)).toFixed(2);
    }
    if (f.running !== timerOn) {
      timerOn = f.running;
      notch.classList.toggle('timer-on', timerOn);
      if (!expanded) applyGeometry(); // widen or shrink the collapsed notch
    }
  }
  Focus.onChange(refreshTimer);
  setInterval(refreshTimer, 500);

  function refreshBubble(m) {
    const live = !!(m && m.enabled && (m.status === 'playing' || m.status === 'paused'));
    bubble.classList.toggle('show', live);
    bubble.classList.toggle('paused', live && m.status === 'paused');
    bart.style.backgroundImage = live && m.art ? `url("${m.art}")` : '';
  }

  // ---------- eyes ----------
  function buildEyes() {
    const e = theme.eyes;
    const cfg = e[state] || e.idle;
    const g = e.glow;
    const set = (k, v) => eyesEl.style.setProperty(k, v);
    set('--ec', cfg.color);
    set('--ew', cfg.width + 'px');
    set('--eh', cfg.height + 'px');
    set('--pulse', (cfg.pulse || 2.4) + 's');
    set('--blink', (cfg.blink || 4) + 's');
    set('--g-near', shadow(g.near, cfg.color));
    set('--g-far', shadow(g.far, cfg.color));
    set('--g-near-p', shadow(g.nearPulse, cfg.color));
    set('--g-far-p', shadow(g.farPulse, cfg.color));
    const lively = motion === 'lively' && state === 'working' ? theme.lively.workingEyes : null;
    set('--drift', (lively ? lively.driftPx : cfg.driftPx || 0) + 'px');
    set('--drift-s', (lively ? lively.driftSeconds : cfg.driftSeconds || 5) + 's');
    set('--sweep-s', (lively ? lively.sweepSeconds : 2) + 's');
    set('--hop', (cfg.hopPx || 0) + 'px');
    set('--hop-s', (cfg.hopSeconds || 1.8) + 's');
    set('--arc', (cfg.arcBorder || 3) + 'px');
    set('--bob', (cfg.bobPx || 0) + 'px');
    set('--bob-s', (cfg.bobSeconds || 2) + 's');
    eyesEl.dataset.state = state;

    // Rebuild the nodes so one-shot animations (pop-in, sparks) replay on every entry.
    eyesEl.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const eye = document.createElement('div');
      eye.className = 'eye';
      eyesEl.appendChild(eye);
    }
    if (lively) {
      // lively only: a thin scanning line under the eyes (subtle mode has no sweep line)
      const sweep = document.createElement('div');
      sweep.className = 'sweep';
      eyesEl.appendChild(sweep);
    }
    if (state === 'done') {
      const sparks = document.createElement('div');
      sparks.className = 'sparks';
      for (let i = 0; i < cfg.sparks; i++) {
        const a = (i / cfg.sparks) * Math.PI * 2;
        const s = document.createElement('span');
        s.className = 'spark';
        s.style.setProperty('--dx', Math.round(Math.cos(a) * cfg.sparkRadius) + 'px');
        s.style.setProperty('--dy', Math.round(Math.sin(a) * cfg.sparkRadius) + 'px');
        sparks.appendChild(s);
      }
      eyesEl.appendChild(sparks);
    }
  }

  function setState(next) {
    if (!['idle', 'working', 'needs', 'done'].includes(next)) return;
    const changed = next !== state;
    state = next;
    buildEyes();

    if (changed) {
      // working/done show the Claude tab; back to idle returns to Home unless you picked Music or Focus
      if (state === 'working' || state === 'done') tab = 'claude';
      else if (state === 'idle' && tab === 'claude') tab = 'home';
      // Done starts blue and turns green on hover or after a few seconds.
      clearTimeout(greenTimer);
      notch.classList.remove('green');
      if (state === 'done') greenTimer = setTimeout(turnGreen, ms(theme.done.turnGreenAfterSeconds));
    }

    if (autoOpens() && !expanded) expand();
    else if (expanded) {
      showView();
      applyGeometry();
      if (changed) playView();
      if (!autoOpens() && !hover) scheduleCollapse();
    }
  }

  // ---------- hover (reported by the main process) ----------
  window.mochi.onHover((inside) => {
    hover = inside;
    clearTimeout(collapseTimer);
    if (inside) {
      expand();
      if (state === 'done') turnGreen();
    } else scheduleCollapse();
  });
  window.mochi.onState(setState);
  window.mochi.onSession((session) => {
    lastSession = session;
    home.update({ session });
    working.update(session);
    done.update(session);
    needs.update(session);
    claudeIdle.update(session);
  });
  window.mochi.onSettings((s) => {
    if (s.focusMinutes) Focus.setMinutes(s.focusMinutes, false);
    if (s.motion && s.motion !== motion) {
      motion = s.motion;
      document.documentElement.dataset.motion = motion;
      buildEyes();
    }
  });
  window.mochi.onChime((kind) => window.Chime.play(kind));
  window.mochi.onUsage((usage) => home.update({ usage }));
  window.mochi.onMusic((m) => {
    lastMusic = m;
    refreshBubble(m);
    home.update({ music: m });
    music.update(m);
  });

  content.style.visibility = 'hidden';
  applyGeometry();
  buildEyes();
})();
