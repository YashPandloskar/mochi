(() => {
  const theme = window.mochi.theme;
  const root = document.documentElement.style;
  const notch = document.getElementById('notch');
  const eyesEl = document.getElementById('eyes');
  const content = document.getElementById('content');
  const gradient = notch.querySelector('.gradient');
  const ms = (s) => Math.round(s * 1000);
  const radius = (r) => r.map((v) => v + 'px').join(' ');
  const shadow = ([x, blur], c) => `${x}px 0 ${blur}px ${c}`.replace(/^0px 0 /, '0 0 ');

  // ---------- theme -> CSS variables ----------
  root.setProperty('--text', theme.colors.text);
  root.setProperty('--muted', theme.colors.muted);
  root.setProperty('--resize', theme.timings.resize + 's');
  root.setProperty('--easing', theme.timings.easing);
  root.setProperty('--fade', theme.timings.fade + 's');
  root.setProperty('--collapsed-h', theme.collapsed.height + 'px');
  root.setProperty('--eye-gap', theme.eyes.gap + 'px');
  notch.classList.toggle('glow', theme.notchGlow);

  let state = 'idle';
  let expanded = false;
  let hover = false;
  let collapseTimer = null;
  let contentTimer = null;

  // ---------- geometry ----------
  function applyGeometry() {
    if (expanded) {
      const p = theme.panels[state];
      notch.style.width = theme.expanded.width + 'px';
      notch.style.height = p.height + 'px';
      notch.style.borderRadius = radius(theme.expanded.radius);
      notch.style.background = 'transparent';
      gradient.style.background = `linear-gradient(to bottom, ${p.from}, ${p.to})`;
      window.mochi.setHitSize({ w: theme.expanded.width, h: p.height });
    } else {
      notch.style.width = theme.collapsed.width + 'px';
      notch.style.height = theme.collapsed.height + 'px';
      notch.style.borderRadius = radius(theme.collapsed.radius);
      notch.style.background = theme.collapsed.background;
      window.mochi.setHitSize({ w: theme.collapsed.width, h: theme.collapsed.height });
    }
  }

  function setContent() {
    content.textContent = expanded ? `${state}  (panel arrives in a later stage)` : '';
  }

  // Expand: resize first, then fade the content in. Collapse: fade out, then resize.
  function expand() {
    if (expanded) return;
    clearTimeout(contentTimer);
    expanded = true;
    notch.classList.remove('content-visible');
    setContent();
    applyGeometry();
    notch.classList.add('expanded');
    contentTimer = setTimeout(() => notch.classList.add('content-visible'), ms(theme.timings.resize * 0.6));
  }

  function collapse() {
    if (!expanded) return;
    clearTimeout(contentTimer);
    notch.classList.remove('content-visible');
    contentTimer = setTimeout(() => {
      expanded = false;
      notch.classList.remove('expanded');
      applyGeometry();
    }, ms(theme.timings.fade));
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
    if (!theme.panels[next]) return;
    state = next;
    buildEyes();
    if (expanded) {
      setContent();
      applyGeometry();
    }
  }

  // ---------- hover (reported by the main process) ----------
  window.mochi.onHover((inside) => {
    hover = inside;
    clearTimeout(collapseTimer);
    if (inside) expand();
    else collapseTimer = setTimeout(() => !hover && collapse(), ms(theme.timings.collapseDelay));
  });
  window.mochi.onState(setState);

  applyGeometry();
  buildEyes();
})();
