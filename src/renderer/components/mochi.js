// Mochi: the single source of truth for the character. viewBox 0 0 48 48.
// Every screen uses this; scenes only scale, place and tint it, never redraw it.
//
//   const m = Mochi.create({ mood: 'wink', size: 60 });   // standalone <svg>
//   parent.appendChild(m.el);  m.setMood('happy');
//
//   const g = Mochi.group({ mood: 'focus' });             // bare <g> to embed inside another SVG
//
// Moods: wink, focus, curious, happy, dizzy.
// Hooks for scenes: .m-root (squish), .m-face, .m-eyes, .m-brows, .m-body.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const MOODS = ['wink', 'focus', 'curious', 'happy', 'dizzy'];
  const BLINKS = new Set(['wink', 'focus', 'curious']);
  const BODY_PATH = 'M24 7C35 7 42 15 42 26C42 37 35 42 24 42C13 42 6 37 6 26C6 15 13 7 24 7Z';

  const theme = () => window.mochi.theme.mochi;
  let styled = false;

  function ensureStyle() {
    if (styled) return;
    styled = true;
    const s = document.createElement('style');
    s.textContent = `
      .m-blink { transform-box: fill-box; transform-origin: 50% 50%;
        animation: m-blink var(--m-blink, 4s) ease-in-out infinite; }
      @keyframes m-blink { 0%, 92%, 100% { transform: scaleY(1); } 95% { transform: scaleY(var(--m-closed, .1)); } }
      .m-twinkle { transform-box: fill-box; transform-origin: 50% 50%;
        animation: m-twinkle var(--m-sparkle, 1.8s) ease-in-out infinite; }
      @keyframes m-twinkle { 0%, 100% { transform: scale(1); opacity: 1; } 50% { transform: scale(.7); opacity: .7; } }`;
    document.head.appendChild(s);
  }

  function features(mood, t) {
    const line = `fill="none" stroke="${t.ink}" stroke-width="${t.strokeWidth}" stroke-linecap="round" stroke-linejoin="round"`;
    const ink = `fill="${t.ink}"`;
    const eyes = (inner) =>
      `<g class="m-eyes${BLINKS.has(mood) ? ' m-blink' : ''}" style="animation-delay:${(-Math.random() * t.blinkSeconds).toFixed(2)}s">${inner}</g>`;
    switch (mood) {
      case 'wink':
        return (
          eyes(`<circle cx="17" cy="26" r="2.2" ${ink}/>`) +
          `<path d="M29 26q3-3.5 6 0" ${line}/><path d="M21 32q3 2.5 6 0" ${line}/>`
        );
      case 'focus':
        return (
          eyes(`<circle cx="17" cy="27" r="2.2" ${ink}/><circle cx="31" cy="27" r="2.2" ${ink}/>`) +
          `<g class="m-brows"><path d="M13 22l7 1.5M35 22l-7 1.5" ${line}/></g><path d="M21.5 33h5" ${line}/>`
        );
      case 'curious':
        return (
          eyes(
            `<circle cx="17" cy="26" r="3.2" ${ink}/><circle cx="31" cy="26" r="3.2" ${ink}/>` +
              `<circle cx="18" cy="25" r="1" fill="${t.highlight}"/><circle cx="32" cy="25" r="1" fill="${t.highlight}"/>`
          ) + `<ellipse cx="24" cy="33" rx="2" ry="2.4" ${ink}/>`
        );
      case 'happy':
        return (
          eyes(`<path d="M13 27q4-6 8 0M27 27q4-6 8 0" ${line}/>`) + `<path d="M19 31q5 7 10 0z" ${ink} stroke="${t.ink}" stroke-width="1" stroke-linejoin="round"/>`
        );
      case 'dizzy':
        return (
          eyes(`<path d="M13 23l7 7M20 23l-7 7M28 23l7 7M35 23l-7 7" ${line}/>`) + `<path d="M19 33q2.5-3 5 0t5 0" ${line}/>`
        );
    }
    return '';
  }

  function markup(mood, t) {
    const cheeks =
      `<circle cx="13" cy="31" r="3" fill="${t.cheek}" opacity="${t.cheekOpacity}"/>` +
      `<circle cx="35" cy="31" r="3" fill="${t.cheek}" opacity="${t.cheekOpacity}"/>`;
    const tilt = mood === 'curious' ? ' transform="rotate(-6 24 26)"' : '';
    const sparkle =
      mood === 'happy'
        ? `<path class="m-twinkle" d="M39 5.5l1.2 3.3 3.3 1.2-3.3 1.2-1.2 3.3-1.2-3.3-3.3-1.2 3.3-1.2z" fill="${t.gold}"/>`
        : '';
    return (
      `<path class="m-body" d="${BODY_PATH}" fill="${t.body}" stroke="${t.bodyStroke}" stroke-width="${t.bodyStrokeWidth}"/>` +
      `<g class="m-face"${tilt}>${cheeks}${features(mood, t)}</g>${sparkle}`
    );
  }

  // A <g> holding the whole character. Mochi.create wraps it in an <svg>.
  function group({ mood = 'wink', clickable = false } = {}) {
    ensureStyle();
    const t = theme();
    const shake = document.createElementNS(NS, 'g'); // dizzy head shake
    shake.setAttribute('class', 'm-shake');
    const root = document.createElementNS(NS, 'g'); // squish on entering a mood
    root.setAttribute('class', 'm-root');
    shake.appendChild(root);
    shake.style.setProperty('--m-blink', t.blinkSeconds + 's');
    shake.style.setProperty('--m-closed', t.blinkClosed);
    shake.style.setProperty('--m-sparkle', t.sparkleSeconds + 's');
    root.style.transformOrigin = '24px 42px'; // squish from the base
    shake.style.transformOrigin = '24px 42px';

    let current = null;
    let dizzyTimer = null;
    let restoreTo = null;
    let clicks = [];

    function render(next) {
      current = next;
      root.innerHTML = markup(next, t);
      shake.dataset.mood = next;
    }

    function squish() {
      const { x, y, ms, easing } = t.squish;
      root.animate([{ transform: `scale(${x}, ${y})` }, { transform: 'scale(1, 1)' }], { duration: ms, easing });
    }

    function setMood(next) {
      if (!MOODS.includes(next)) return;
      if (dizzyTimer) {
        restoreTo = next; // finish the dizzy spell first, then settle into the new mood
        return;
      }
      if (next === current) return;
      render(next);
      squish();
    }

    function startDizzy() {
      restoreTo = current;
      render('dizzy');
      squish();
      const { shakeDeg, shakeMs, durationMs } = t.dizzy;
      shake.animate(
        [{ transform: `rotate(${-shakeDeg}deg)` }, { transform: `rotate(${shakeDeg}deg)` }],
        { duration: shakeMs, iterations: Math.ceil(durationMs / shakeMs), direction: 'alternate', easing: 'ease-in-out' }
      );
      dizzyTimer = setTimeout(() => {
        dizzyTimer = null;
        const back = restoreTo;
        render(back);
        squish();
      }, durationMs);
    }

    function onClick() {
      const now = Date.now();
      clicks = clicks.filter((c) => now - c < t.dizzy.windowMs);
      clicks.push(now);
      if (clicks.length >= t.dizzy.clicks && !dizzyTimer) {
        clicks = [];
        startDizzy();
      }
    }

    if (clickable) shake.addEventListener('click', onClick);
    render(mood);
    return { el: shake, setMood, get mood() { return current; }, destroy: () => clearTimeout(dizzyTimer) };
  }

  function create({ mood = 'wink', size = 48, clickable = true } = {}) {
    const svg = document.createElementNS(NS, 'svg');
    svg.setAttribute('viewBox', '0 0 48 48');
    svg.setAttribute('width', size);
    svg.setAttribute('height', size);
    svg.style.overflow = 'visible'; // squish, shake and sparkle may leave the box
    svg.style.display = 'block';
    const g = group({ mood, clickable });
    svg.appendChild(g.el);
    return { el: svg, setMood: g.setMood, destroy: g.destroy, get mood() { return g.mood; } };
  }

  window.Mochi = { create, group, MOODS };
})();
