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
  };
  for (const [k, v] of Object.entries(vars)) root.setProperty(k, v);
  notch.classList.toggle('glow', theme.notchGlow);

  let state = 'idle';
  let expanded = false;
  let hover = false;
  let collapseTimer = null;
  let contentTimer = null;
  let greenTimer = null;
  let moodOverride = null;
  let lastSession = null;

  // Needs-you and Done open by themselves; Working stays as eyes until you hover.
  const autoOpens = () => state === 'needs' || state === 'done';

  // ---------- panel views ----------
  const home = window.HomeView.create();
  const working = window.WorkingView.create();
  const done = window.DoneView.create();

  // Stand-in for the Needs-you panel (next stage): one Mochi, mood follows the state.
  const mochi = window.Mochi.create({ mood: theme.mochi.moodByState.idle, size: 72 });
  const caption = document.createElement('div');
  const placeholder = document.createElement('div');
  placeholder.style.cssText = 'position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:10px;color:var(--muted);font-size:13px';
  placeholder.append(mochi.el, caption);

  content.append(home.el, working.el, done.el, placeholder);

  function showView() {
    const views = { idle: home.el, working: working.el, done: done.el };
    const active = views[state] || placeholder;
    for (const v of [home.el, working.el, done.el, placeholder]) v.style.display = v === active ? (v === placeholder ? 'flex' : '') : 'none';
    caption.textContent = `${state}  (panel arrives in a later stage)`;
    mochi.setMood(moodOverride || theme.mochi.moodByState[state]);
    if (lastSession) {
      working.update(lastSession);
      done.update(lastSession);
    }
  }

  // Replays the entrance animation of whichever panel is showing.
  function playView() {
    if (state === 'idle') home.rise();
    else if (state === 'done') done.play();
  }

  // ---------- geometry ----------
  function turnGreen() {
    notch.classList.add('green');
  }

  function applyGeometry() {
    if (expanded) {
      const p = theme.panels[theme.panelForState[state]];
      notch.style.width = theme.expanded.width + 'px';
      notch.style.height = p.height + 'px';
      notch.style.borderRadius = radius(theme.expanded.radius);
      notch.style.background = 'transparent';
      gradient.style.background = `linear-gradient(to bottom, ${p.from}, ${p.to})`;
      if (p.fromAlt) gradientAlt.style.background = `linear-gradient(to bottom, ${p.fromAlt}, ${p.toAlt})`;
      window.mochi.setHitSize({ w: theme.expanded.width, h: p.height });
    } else {
      notch.style.width = theme.collapsed.width + 'px';
      notch.style.height = theme.collapsed.height + 'px';
      notch.style.borderRadius = radius(theme.collapsed.radius);
      notch.style.background = theme.collapsed.background;
      window.mochi.setHitSize({ w: theme.collapsed.width, h: theme.collapsed.height });
    }
  }

  // Expand: resize first, then fade the content in. Collapse: fade out, then resize.
  function expand() {
    if (expanded) return;
    clearTimeout(contentTimer);
    expanded = true;
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
    set('--drift', (cfg.driftPx || 0) + 'px');
    set('--drift-s', (cfg.driftSeconds || 5) + 's');
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
    if (!theme.panelForState[next]) return;
    const changed = next !== state;
    state = next;
    moodOverride = null;
    buildEyes();

    if (changed) {
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
  });
  window.mochi.onUsage((usage) => home.update({ usage }));
  window.mochi.onMood((m) => {
    moodOverride = m;
    mochi.setMood(m);
  });

  content.style.visibility = 'hidden';
  applyGeometry();
  buildEyes();
})();
