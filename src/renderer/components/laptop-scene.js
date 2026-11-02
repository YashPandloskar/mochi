// Mochi at a silver laptop, seen from the back. viewBox 0 0 96 88.
// This is the SAME Mochi component: the scene only places, scales and tints him. The lid covers his
// body, so only his brows, eyes and the top of his head show.
(() => {
  const NS = 'http://www.w3.org/2000/svg';
  const BODY = 'M24 7C35 7 42 15 42 26C42 37 35 42 24 42C13 42 6 37 6 26C6 15 13 7 24 7Z';
  let seq = 0;

  const el = (name, attrs = {}, parent) => {
    const n = document.createElementNS(NS, name);
    for (const [k, v] of Object.entries(attrs)) n.setAttribute(k, v);
    if (parent) parent.appendChild(n);
    return n;
  };

  function create() {
    const L = window.mochi.theme.laptop;
    const id = ++seq;
    const svg = el('svg', { viewBox: '0 0 96 88', width: 96, height: 88 });
    svg.style.overflow = 'visible';
    svg.style.display = 'block';
    svg.style.setProperty('--lap-drift', (L.driftPx / 1.45).toFixed(3) + 'px'); // Mochi-local units
    svg.style.setProperty('--lap-drift-s', L.driftSeconds + 's');
    svg.style.setProperty('--lap-tint-a', L.tintOpacity[0]);
    svg.style.setProperty('--lap-tint-b', L.tintOpacity[1]);
    svg.style.setProperty('--lap-tint-s', L.tintSeconds + 's');
    svg.style.setProperty('--lap-breathe', L.breatheScale);
    svg.style.setProperty('--lap-breathe-s', L.breatheSeconds + 's');

    // Screen light: radial gradient centred at (24,38), r22, in Mochi-local coordinates, clipped to his body.
    const defs = el('defs', {}, svg);
    const grad = el('radialGradient', { id: `lap-grad-${id}`, cx: 24, cy: 38, r: 22, gradientUnits: 'userSpaceOnUse' }, defs);
    el('stop', { offset: 0, 'stop-color': L.tint, 'stop-opacity': 0.9 }, grad);
    el('stop', { offset: 1, 'stop-color': L.tint, 'stop-opacity': 0 }, grad);
    const clip = el('clipPath', { id: `lap-clip-${id}` }, defs);
    el('path', { d: BODY }, clip);

    function decorate(root, mood) {
      const body = root.querySelector('.m-body');
      const tint = el('g', { 'clip-path': `url(#lap-clip-${id})` });
      el('circle', { class: 'lap-tint', cx: 24, cy: 38, r: 22, fill: `url(#lap-grad-${id})` }, tint);
      body.after(tint);

      // slow eye drift: eyes move inside the blinking group so blink and drift do not fight
      const eyes = root.querySelector('.m-eyes');
      const drift = el('g', { class: 'lap-drift' });
      while (eyes.firstChild) drift.appendChild(eyes.firstChild);
      eyes.appendChild(drift);
      if (mood === 'focus') {
        el('circle', { cx: 16.3, cy: 26.2, r: 0.7, fill: L.reflection }, drift);
        el('circle', { cx: 30.3, cy: 26.2, r: 0.7, fill: L.reflection }, drift);
      }
    }

    const m = window.Mochi.group({ mood: 'focus', clickable: true, cheeks: false, decorate });

    const breathe = el('g', { class: 'lap-breathe' }, svg);
    const placed = el('g', { transform: L.mochiTransform }, breathe);
    placed.appendChild(m.el);

    // laptop, back view: lid, logo, light leak along the lid top, base
    el('rect', { x: 12, y: 46, width: 72, height: 34, rx: 6, fill: L.lid, stroke: L.lidStroke }, svg);
    el('circle', { cx: 48, cy: 63, r: 4, fill: L.logo }, svg);
    el('line', { x1: 17, y1: 46.8, x2: 79, y2: 46.8, stroke: L.leak, 'stroke-width': 1.6, 'stroke-linecap': 'round' }, svg);
    el('rect', { x: 6, y: 80, width: 84, height: 5, rx: 2.5, fill: L.base }, svg);

    return { el: svg, mochi: m };
  }

  window.LaptopScene = { create };
})();
