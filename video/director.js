// The launch trailer, scene by scene (about 100 s at 60 fps). It drives the REAL Mochi interface (src/renderer) with
// the same events Claude Code and the tray would send, plus a camera, cursor, titles and a score.
// Times are seconds on the film's clock. See video/README.md.
(() => {
  const $ = (s, r = document) => r.querySelector(s);
  const emit = window.__emit;
  const H = window.__h;
  const S = window.Score;
  const theme = window.mochi.theme;
  const world = $('#world');
  const frame = $('#frame');
  const cursorEl = $('#cursor');
  const ripple = $('#ripple');
  const hl = $('#hl');
  const titles = $('#titles');
  const flashEl = $('#flash');
  const fadeEl = $('#fade');
  const ide = $('#ide');
  const FX = 660; // the notch frame's left edge in the world
  const LOG = (m) => window.__rec.log(m);

  // ------------------------------------------------------------ easing, clock, tweens
  function bez(x1, y1, x2, y2) {
    return (t) => {
      let lo = 0;
      let hi = 1;
      for (let i = 0; i < 26; i++) {
        const m = (lo + hi) / 2;
        const x = 3 * (1 - m) * (1 - m) * m * x1 + 3 * (1 - m) * m * m * x2 + m * m * m;
        if (x < t) lo = m;
        else hi = m;
      }
      const m = (lo + hi) / 2;
      return 3 * (1 - m) * (1 - m) * m * y1 + 3 * (1 - m) * m * m * y2 + m * m * m;
    };
  }
  // damped spring: overshoots the target and settles (zeta lower = bouncier)
  const spring = (zeta = 0.55, cycles = 1.25) => {
    const a = 7 * zeta;
    const b = Math.PI * 2 * cycles;
    const f = (t) => 1 - Math.exp(-a * t) * Math.cos(b * t);
    const end = f(1);
    return (t) => f(t) / end;
  };
  const E = {
    inOut: bez(0.65, 0, 0.35, 1),
    out: bez(0.16, 1, 0.3, 1),
    cine: bez(0.7, 0, 0.16, 1),
    soft: bez(0.45, 0.05, 0.2, 1),
    lin: (t) => t,
    glide: bez(0.3, 0, 0.1, 1),
    outExpo: (t) => (t >= 1 ? 1 : 1 - Math.pow(2, -10 * t)),
    inExpo: (t) => (t <= 0 ? 0 : Math.pow(2, 10 * t - 10)),
    inQuart: bez(0.5, 0, 0.75, 0),
    whip: bez(0.86, 0, 0.12, 1), // slow start, violent middle, hard stop
    drift: bez(0.25, 0.6, 0.3, 1), // gentle, long settle
    hand: bez(0.2, 0.85, 0.3, 1), // a person's pointer: quick launch, slow landing
    spring: spring(0.5, 1.2),
    springSoft: spring(0.7, 1.0),
  };

  // seeded randomness so every render is identical
  let seed = 20241102;
  const rnd = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };

  let t0 = 0;
  const now = () => (performance.now() - t0) / 1000;
  const raf = () => new Promise((r) => requestAnimationFrame(r));
  const until = async (t) => {
    while (now() < t) await raf();
  };
  const wait = (s) => until(now() + s);

  const tweens = [];
  function tween(dur, ease, fn) {
    return new Promise((res) => tweens.push({ s: now(), dur: Math.max(dur, 0.001), ease, fn, res }));
  }
  function runTweens() {
    const n = now();
    for (let i = tweens.length - 1; i >= 0; i--) {
      const w = tweens[i];
      const p = Math.min(1, Math.max(0, (n - w.s) / w.dur));
      w.fn(w.ease(p));
      if (p >= 1) {
        tweens.splice(i, 1);
        w.res();
      }
    }
  }

  // ------------------------------------------------------------ camera
  const cam = { x: 960, y: 15, s: 6.8 };
  const prev = { ...cam };
  const shake = { x: 0, y: 0 };
  // a handheld camera is never perfectly still: slow, overlapping sways in position, a hair of roll, a slow breath
  const sway = (t) => ({
    x: 3.4 * Math.sin(t * 0.61 + 1) + 2.0 * Math.sin(t * 1.37 + 4) + 0.7 * Math.sin(t * 3.1),
    y: 2.8 * Math.sin(t * 0.53) + 1.6 * Math.sin(t * 1.11 + 2) + 0.6 * Math.sin(t * 2.7 + 1),
    r: 0.1 * Math.sin(t * 0.37 + 3) + 0.05 * Math.sin(t * 0.83),
    s: 1 + 0.007 * Math.sin(t * 0.5 + 0.5),
  });
  let swayAmt = 1; // 0 = locked off (titles), 1 = handheld
  function renderCam() {
    const h = sway(now());
    const s = cam.s * (1 + (h.s - 1) * swayAmt);
    const tx = 960 - cam.x * s + shake.x + h.x * swayAmt;
    const ty = 540 - cam.y * s + shake.y + h.y * swayAmt;
    world.style.transform = `translate(960px, 540px) rotate(${(h.r * swayAmt).toFixed(3)}deg) translate(-960px, -540px) translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${s.toFixed(5)})`;
    const speed = Math.abs(Math.log(cam.s / prev.s)) * 230 + (Math.hypot(cam.x - prev.x, cam.y - prev.y) * cam.s) / 20;
    const blur = Math.min(5.2, Math.max(0, speed - 1.0));
    world.style.filter = blur > 0.25 ? `blur(${blur.toFixed(2)}px)` : '';
    prev.x = cam.x;
    prev.y = cam.y;
    prev.s = cam.s;
  }
  function camTo(t, dur, ease = E.inOut) {
    const a = { ...cam };
    const l0 = Math.log(a.s);
    const l1 = Math.log(t.s === undefined ? a.s : t.s);
    const tx = t.x === undefined ? a.x : t.x;
    const ty = t.y === undefined ? a.y : t.y;
    return tween(dur, ease, (p) => {
      cam.x = a.x + (tx - a.x) * p;
      cam.y = a.y + (ty - a.y) * p;
      cam.s = Math.exp(l0 + (l1 - l0) * p);
    });
  }
  const camSet = (t) => Object.assign(cam, t);
  // anticipation: a small pull-back before a big push, like an operator winding up
  async function windUp(amount = 0.035, dur = 0.28) {
    await camTo({ s: cam.s * (1 - amount) }, dur, E.out);
  }
  // a small hit of camera shake that dies away (on impacts)
  function kick(amount = 14, dur = 0.7) {
    const sx = rnd() > 0.5 ? 1 : -1;
    return tween(dur, E.lin, (p) => {
      const k = Math.pow(1 - p, 2.4) * amount;
      shake.x = Math.sin(p * 38) * k * sx;
      shake.y = Math.cos(p * 31) * k * 0.7;
      if (p === 1) shake.x = shake.y = 0;
    });
  }
  function flash(peak = 0.5, ms = 520) {
    flashEl.animate([{ opacity: 0 }, { opacity: peak, offset: 0.12 }, { opacity: 0 }], { duration: ms, easing: 'cubic-bezier(.2,.7,.3,1)' });
  }
  const setFade = (to, dur, ease = E.inOut) => {
    const from = parseFloat(fadeEl.style.opacity || 1);
    return tween(dur, ease, (p) => (fadeEl.style.opacity = from + (to - from) * p));
  };

  // ------------------------------------------------------------ cursor, clicks, highlights
  const cur = { x: 1700, y: 300 };
  let curScale = 1;
  const placeCursor = () => (cursorEl.style.transform = `translate(${cur.x.toFixed(1)}px, ${cur.y.toFixed(1)}px) scale(${curScale})`);
  function cursorShow(on, dur = 0.35) {
    cursorEl.style.transition = `opacity ${dur}s`;
    cursorEl.style.opacity = on ? 1 : 0;
  }
  // A hand, not a robot: it launches quickly and lands slowly, takes a slightly curved path that is different every
  // time, overshoots long moves and corrects, and trembles a little while it travels.
  async function cursorTo(x, y, dur = 1, ease = E.hand) {
    const a = { ...cur };
    const len0 = Math.max(1, Math.hypot(x - a.x, y - a.y));
    const long = len0 > 380;
    const d = dur * (0.88 + rnd() * 0.3);
    const ox = long ? (x - a.x) / len0 * (10 + rnd() * 10) : 0; // overshoot, then correct
    const oy = long ? (y - a.y) / len0 * (10 + rnd() * 10) : 0;
    const tx = x + ox;
    const ty = y + oy;
    const dx = tx - a.x;
    const dy = ty - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const bow = (rnd() > 0.5 ? 1 : -1) * Math.min(70, len * (0.06 + rnd() * 0.1));
    const ph = rnd() * 6;
    await tween(d, ease, (p) => {
      const arc = Math.sin(p * Math.PI) * bow;
      const tremor = Math.sin(p * 40 + ph) * 0.7 * Math.sin(p * Math.PI);
      cur.x = a.x + dx * p + nx * (arc + tremor);
      cur.y = a.y + dy * p + ny * (arc + tremor * 0.8);
      placeCursor();
    });
    if (long) {
      const b = { ...cur };
      await tween(0.16 + rnd() * 0.08, E.out, (p) => {
        cur.x = b.x + (x - b.x) * p;
        cur.y = b.y + (y - b.y) * p;
        placeCursor();
      });
    }
  }
  function worldOf(el, ax = 0.5, ay = 0.5) {
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const k = f.width / 600;
    return { x: FX + (r.left - f.left + r.width * ax) / k, y: (r.top - f.top + r.height * ay) / k };
  }
  function pressFx() {
    ripple.style.left = cur.x + 'px';
    ripple.style.top = cur.y + 'px';
    ripple.animate([{ opacity: 0.9, transform: 'scale(0.6)' }, { opacity: 0, transform: 'scale(4.6)' }], { duration: 560, easing: 'cubic-bezier(.2,.7,.3,1)' });
    tween(0.2, E.lin, (p) => {
      curScale = 1 - 0.18 * Math.sin(p * Math.PI);
      placeCursor();
    });
    S.tap(S.now() + 0.005);
  }
  async function pointAndClick(el, { dur = 0.9, then = null, ax = 0.5, ay = 0.5 } = {}) {
    const p = worldOf(el, ax, ay);
    // aim at a point on the target that is not quite its centre
    await cursorTo(p.x + (rnd() - 0.5) * 8, p.y + (rnd() - 0.5) * 5, dur);
    await wait(0.1 + rnd() * 0.2); // a beat of hesitation before pressing
    pressFx();
    await wait(0.05 + rnd() * 0.05);
    if (then) then();
    else el.click();
  }
  function highlight(el, pad = 7) {
    const r = el.getBoundingClientRect();
    const f = frame.getBoundingClientRect();
    const k = f.width / 600;
    hl.style.left = (r.left - f.left) / k - pad + 'px';
    hl.style.top = (r.top - f.top) / k - pad + 'px';
    hl.style.width = r.width / k + pad * 2 + 'px';
    hl.style.height = r.height / k + pad * 2 + 'px';
    hl.style.opacity = 1;
  }
  const unhighlight = () => (hl.style.opacity = 0);
  const navItem = (tab) => [...document.querySelectorAll(`.nav-item[data-tab="${tab}"]`)].find((b) => b.offsetParent);
  const vis = (sel) => [...document.querySelectorAll(sel)].find((b) => b.offsetParent);

  // ------------------------------------------------------------ typography
  const WORD_EASE = 'cubic-bezier(.16, 1, .3, 1)';
  function words(el, text) {
    el.innerHTML = '';
    text.split(' ').forEach((w, i, a) => {
      const s = document.createElement('span');
      s.className = 'w';
      s.textContent = w;
      el.appendChild(s);
      if (i < a.length - 1) el.appendChild(document.createTextNode(' '));
    });
    return [...el.querySelectorAll('.w')];
  }
  // Four ways a line can arrive, so no two captions move the same way
  const STYLES = {
    rise: { from: { opacity: 0, transform: 'translateY(34px)', filter: 'blur(14px)' }, ms: 950, ease: WORD_EASE, step: 1 },
    spring: { from: { opacity: 0, transform: 'translateY(64px) rotate(2.5deg) scale(0.9)', filter: 'blur(6px)' }, ms: 820, ease: 'cubic-bezier(.3, 1.8, .5, 1)', step: 0.8 },
    scale: { from: { opacity: 0, transform: 'scale(1.35)', filter: 'blur(22px)' }, ms: 1000, ease: 'cubic-bezier(.2, .9, .1, 1)', step: 0.9 },
    mask: { from: { opacity: 0, transform: 'translateY(105%)', filter: 'blur(0px)' }, ms: 900, ease: 'cubic-bezier(.19, 1, .22, 1)', step: 0.9, clip: true },
  };
  const reveal = (ws, delay = 0, step = 70, style = 'rise') => {
    const st = STYLES[style];
    ws.forEach((w, i) => {
      w.animate([st.from, { opacity: 1, transform: 'none', filter: 'blur(0)' }], { duration: st.ms, delay: delay + i * step * st.step, easing: st.ease, fill: 'forwards' });
    });
  };
  function caption(l1, l2, y = 842, style = 'rise') {
    const el = document.createElement('div');
    el.className = 'cap';
    el.style.top = y + 'px';
    const a = document.createElement('div');
    a.className = 'l1';
    const b = document.createElement('div');
    b.className = 'l2';
    el.append(a, b);
    titles.appendChild(el);
    const w1 = words(a, l1);
    const w2 = words(b, l2);
    reveal(w1, 0, 75, style);
    reveal(w2, 380, 28, 'rise');
    if (style === 'mask') {
      a.style.overflow = 'hidden';
      a.style.paddingBottom = '0.16em';
      a.style.marginBottom = '-0.16em';
    }
    return {
      out(how) {
        const to = how === 'sink' ? { opacity: 0, transform: 'translateY(30px) scale(0.97)', filter: 'blur(12px)' } : how === 'shrink' ? { opacity: 0, transform: 'scale(0.85)', filter: 'blur(14px)' } : { opacity: 0, transform: 'translateY(-22px)', filter: 'blur(10px)' };
        [...w1, ...w2].forEach((w, i) =>
          w.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, to], {
            duration: 520,
            delay: i * 18,
            easing: 'cubic-bezier(.5,0,.8,.4)',
            fill: 'forwards',
          })
        );
        setTimeout(() => el.remove(), 1400);
      },
    };
  }
  function fadeIn(el, { y = 24, ms = 1100, delay = 0, blur = 12, scale = 1 } = {}) {
    el.animate(
      [{ opacity: 0, transform: `translateY(${y}px) scale(${scale})`, filter: `blur(${blur}px)` }, { opacity: 1, transform: 'none', filter: 'blur(0)' }],
      { duration: ms, delay, easing: WORD_EASE, fill: 'forwards' }
    );
  }
  function fadeOut(el, { y = -24, ms = 700, delay = 0 } = {}) {
    el.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: `translateY(${y}px)`, filter: 'blur(12px)' }], {
      duration: ms,
      delay,
      easing: 'cubic-bezier(.5,0,.8,.4)',
      fill: 'forwards',
    });
  }
  function mk(cls, html, top) {
    const d = document.createElement('div');
    d.className = cls;
    d.innerHTML = html;
    if (top !== undefined) d.style.top = top + 'px';
    titles.appendChild(d);
    return d;
  }

  // ------------------------------------------------------------ the fake desktop (editor + terminal)
  const codeBefore = [
    '<span class="k">import</span> { sum } <span class="k">from</span> <span class="s">\'./prices\'</span>',
    '<span class="k">import type</span> { Cart } <span class="k">from</span> <span class="s">\'./cart\'</span>',
    '',
    '<span class="k">export function</span> <span class="f">checkout</span>(cart: Cart) {',
    '  <span class="k">const</span> items = cart.items',
    '  <span class="k">const</span> total = <span class="f">sum</span>(items)',
    '  <span class="c">// TODO: add VAT</span>',
    '  <span class="k">return</span> { items, total }',
    '}',
  ];
  const codeAfter = codeBefore.slice();
  codeAfter[5] = '  <span class="k">const</span> net = <span class="f">sum</span>(items)';
  codeAfter[6] = '  <span class="k">const</span> total = net * (<span class="v">1</span> + <span class="v">VAT_RATE</span>)';
  codeAfter[7] = '  <span class="k">return</span> { items, net, total }';
  const paintCode = (lines) => ($('#code').innerHTML = lines.map((l, i) => `<span class="n">${i + 1}</span>${l}`).join('\n'));
  const termEl = $('#term');
  let termLines = [];
  const paintTerm = (typing = '') => {
    termEl.innerHTML = termLines.slice(-7).join('\n') + (typing !== null ? `\n<span class="p">❯</span> ${typing}<span class="caret"></span>` : '');
  };
  // typing rhythm of a person: bursts, slower after spaces and punctuation, the odd hesitation
  let burst = 0;
  function keyGap(ch, cps) {
    let g = 1 / cps;
    if (burst > 0) {
      burst--;
      g *= 0.62;
    } else if (rnd() < 0.18) burst = 2 + Math.floor(rnd() * 4);
    g *= 0.65 + rnd() * 0.85;
    if (ch === ' ') g += 0.04 + rnd() * 0.06;
    if (/[.,?!"]/.test(ch)) g += 0.08 + rnd() * 0.1;
    if (rnd() < 0.05) g += 0.18 + rnd() * 0.22; // a thinking pause
    return g;
  }
  async function typeTerm(text, cps = 22) {
    let s = '';
    for (const ch of text) {
      s += ch;
      paintTerm(s);
      S.tick(S.now() + 0.002, 0.014 + rnd() * 0.01, 2200 + rnd() * 700);
      await wait(keyGap(ch, cps));
    }
  }

  // ------------------------------------------------------------ data the interface is fed
  const sess = { state: 'idle', preview: false, project: 'webshop', startedAt: null, finishedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', needsText: '', approval: null, pendingCount: 0, jobsToday: 4 };
  function setSession(patch, state) {
    Object.assign(sess, patch);
    if (state) sess.state = state;
    emit('session', { ...sess });
    emit('state', sess.state);
  }
  const DIFF = { file: 'checkout.ts', removed: ['const total = sum(items)'], added: ['const net = sum(items)', 'const total = net * (1 + VAT_RATE)'] };

  function art(c1, c2, c3, shape = 0) {
    const c = document.createElement('canvas');
    c.width = c.height = 320;
    const g = c.getContext('2d');
    const bg = g.createLinearGradient(0, 0, 320, 320);
    bg.addColorStop(0, c1);
    bg.addColorStop(1, c2);
    g.fillStyle = bg;
    g.fillRect(0, 0, 320, 320);
    g.globalAlpha = 0.9;
    g.fillStyle = c3;
    if (shape === 0) {
      g.beginPath();
      g.arc(190, 150, 86, 0, Math.PI * 2);
      g.fill();
      g.globalAlpha = 0.35;
      g.fillRect(0, 210, 320, 110);
    } else {
      g.beginPath();
      g.arc(160, 140, 92, Math.PI, 0);
      g.fill();
      g.globalAlpha = 0.5;
      for (let i = 0; i < 4; i++) g.fillRect(50 + i * 12, 190 + i * 24, 220 - i * 24, 12);
    }
    return c.toDataURL('image/jpeg', 0.92);
  }
  const TRACKS = [
    { title: 'Golden Hour Drive', artist: 'Lumen Park', album: 'Soft Static', art: art('#ff9a62', '#8a2b6e', '#ffe29a', 0), duration: 214 },
    { title: 'Late Bloom', artist: 'Nova Tide', album: 'Paper Lanterns', art: art('#2a1f6b', '#12b5b0', '#ffe9a8', 2), duration: 187 },
  ];
  let trackNo = 0;
  let playing = true;
  let pos = 41;
  function pushMusic(status = playing ? 'playing' : 'paused') {
    const tr = TRACKS[trackNo];
    emit('music', { enabled: true, status, title: tr.title, artist: tr.artist, album: tr.album, art: tr.art, artKey: tr.title, position: pos, duration: tr.duration, at: Date.now() });
  }
  H.music = (cmd) => {
    if (cmd === 'playpause') {
      pos += 3;
      playing = !playing;
      pushMusic();
    } else if (cmd === 'next') {
      trackNo = (trackNo + 1) % TRACKS.length;
      pos = 0;
      playing = true;
      pushMusic();
    }
  };

  let notes = { todos: [{ text: 'Review the PR for checkout', done: false }, { text: 'Book dentist', done: true }], note: '' };
  window.__notes = notes;
  H.notesSave = (d) => {
    notes = { todos: d.todos.map((t) => ({ ...t })), note: d.note };
    window.__notes = notes;
    emit('notes', { ...notes, file: 'notes.md' });
  };

  H.approval = (id, decision) => {
    if (decision !== 'allow') return;
    approved = true;
  };
  let approved = false;

  H.focusPhase = (p) => {
    if (p.phase === 'break') {
      emit('chime', 'pomoBreak');
      setRate(1);
      phaseBreak = true;
    } else if (p.phase === 'focus') emit('chime', 'pomoFocus');
    else if (p.phase === 'done') emit('chime', 'focus');
  };
  let phaseBreak = false;

  H.capture = async () => {
    const c = document.createElement('canvas');
    c.width = 960;
    c.height = 540;
    const g = c.getContext('2d');
    g.fillStyle = '#12131c';
    g.fillRect(0, 0, 960, 540);
    g.fillStyle = '#1b1d2b';
    g.fillRect(0, 0, 960, 46);
    ['#ff5f57', '#febc2e', '#28c840'].forEach((col, i) => {
      g.fillStyle = col;
      g.beginPath();
      g.arc(26 + i * 22, 23, 6, 0, 7);
      g.fill();
    });
    g.font = '22px Consolas, monospace';
    const lines = [
      ['#c792ea', 'export function '],
    ];
    g.fillStyle = '#6b7090';
    g.fillText('checkout.ts', 400, 30);
    g.fillStyle = '#c792ea';
    g.fillText('export function', 60, 120);
    g.fillStyle = '#82aaff';
    g.fillText(' checkout', 250, 120);
    g.fillStyle = '#b7bbd3';
    g.fillText('(cart) {', 380, 120);
    g.fillText('  const total = cart.items.reduce(', 60, 160);
    g.fillText('    (s, i) => s + i.price, 0)', 60, 200);
    g.fillStyle = '#ff5370';
    g.fillRect(60, 270, 840, 150);
    g.fillStyle = '#fff';
    g.font = 'bold 26px Segoe UI, sans-serif';
    g.fillText('TypeError: Cannot read properties of', 90, 325);
    g.fillText("undefined (reading 'reduce')", 90, 365);
    g.font = '20px Consolas, monospace';
    g.fillStyle = '#ffd1d9';
    g.fillText('at checkout (checkout.ts:6:31)', 90, 402);
    void lines;
    const url = c.toDataURL('image/jpeg', 0.85);
    return { base64: url.split(',')[1], mediaType: 'image/jpeg' };
  };

  const REPLY = "That's a **null check** problem: `cart.items` is `undefined` on the first render, so `.reduce` throws.\n\nGuard it:\n\n```ts\nconst total = (cart?.items ?? []).reduce((s, i) => s + i.price, 0)\n```\n\nWant me to patch `checkout.ts` for you?";
  H.chatSend = async () => {
    emit('chat', { type: 'start' });
    await wait(0.9);
    const chunks = REPLY.match(/.{1,7}/gs);
    let acc = '';
    for (const c of chunks) {
      acc += c;
      emit('chat', { type: 'delta', text: c });
      await wait(0.045);
    }
    emit('chat', { type: 'done', text: REPLY });
  };

  // a clock the Focus timer can be fast-forwarded on (only Date.now; the film's own clock is separate)
  const realNow = Date.now.bind(Date);
  let wOff = realNow();
  let wBase = realNow();
  let wRate = 1;
  Date.now = () => wOff + (realNow() - wBase) * wRate;
  function setRate(r) {
    wOff = Date.now();
    wBase = realNow();
    wRate = r;
  }

  // ------------------------------------------------------------ recording
  async function startRecording() {
    const opts = window.__rec.options;
    S.resume();
    if (opts.preview || opts.render) return null;
    const vs = await navigator.mediaDevices.getDisplayMedia({ video: true, audio: false });
    try {
      await vs.getVideoTracks()[0].applyConstraints({ frameRate: 60 });
    } catch (e) {
      LOG('frameRate constraint: ' + e.message);
    }
    const stream = new MediaStream([...vs.getVideoTracks(), ...S.stream.getAudioTracks()]);
    const rec = new MediaRecorder(stream, { mimeType: 'video/mp4;codecs=avc1.640028,mp4a.40.2', videoBitsPerSecond: 20_000_000, audioBitsPerSecond: 256_000 });
    // MP4 from MediaRecorder arrives in one piece when it stops, so it is cut into slices on the way to the file
    let total = 0;
    const sending = [];
    rec.ondataavailable = (e) => {
      if (!e.data || !e.data.size) return;
      total += e.data.size;
      LOG(`chunk ${e.data.size} (total ${total})`);
      sending.push(
        (async () => {
          const SLICE = 4 * 1024 * 1024;
          for (let o = 0; o < e.data.size; o += SLICE) {
            window.__rec.chunk(new Uint8Array(await e.data.slice(o, o + SLICE).arrayBuffer()));
            await new Promise((r) => setTimeout(r, 5));
          }
        })()
      );
    };
    rec.onerror = (e) => LOG('RECORDER ERROR ' + (e.error && e.error.message));
    rec.onstart = () => LOG('recorder started ' + rec.mimeType);
    rec.start();
    rec.flush = async () => {
      await new Promise((res) => {
        rec.addEventListener('stop', res, { once: true });
        rec.stop();
      });
      await Promise.all(sending);
      LOG('written, total ' + total);
    };
    if (opts.quick) {
      setTimeout(async () => {
        await rec.flush();
        window.__rec.finish();
      }, 7000);
    }
    LOG('recording ' + JSON.stringify(vs.getVideoTracks()[0].getSettings()));
    return rec;
  }

  // ------------------------------------------------------------ speed ramps (render only)
  // Each ramp is one full period of speed around 1 in OUTPUT time, so it is time-neutral: the film slows down (or
  // speeds up) and then catches up, like a speed ramp in an edit. The hit lands inside the slow part.
  const RAMPS = [
    { a: 4.2, l: 1.9, amp: 0.6, sign: -1 }, // the logo lands in slow motion
    { a: 26.9, l: 2.0, amp: 0.55, sign: -1 }, // "needs you"
    { a: 36.2, l: 2.2, amp: 0.62, sign: -1 }, // the done burst hangs in the air
    { a: 54.6, l: 2.0, amp: 0.5, sign: 1 }, // rushing into the focus timer
    { a: 82.3, l: 2.6, amp: 0.55, sign: -1 }, // drifting off to sleep
    { a: 85.8, l: 1.6, amp: 0.5, sign: -1 }, // waking up
  ];
  const speedAt = (T) => {
    let s = 1;
    for (const r of RAMPS) if (T >= r.a && T < r.a + r.l) s += r.sign * r.amp * Math.sin((2 * Math.PI * (T - r.a)) / r.l);
    return s;
  };
  let tauTab = null;
  // output time at which film time tau happens (identity outside a render)
  function Tof(tau) {
    if (!window.__rec.options.render) return tau;
    if (!tauTab) {
      tauTab = [0];
      for (let k = 0; k < 7500; k++) tauTab.push(tauTab[k] + speedAt(k / 60) / 60);
    }
    let lo = 0;
    let hi = tauTab.length - 1;
    while (hi - lo > 1) {
      const m = (lo + hi) >> 1;
      if (tauTab[m] <= tau) lo = m;
      else hi = m;
    }
    const f = (tau - tauTab[lo]) / Math.max(1e-9, tauTab[hi] - tauTab[lo]);
    return (lo + f) / 60;
  }
  const veil = $('#veil');
  const setVeil = (to, dur, ease = E.inOut) => {
    const from = parseFloat(veil.style.opacity || 0);
    return tween(dur, ease, (p) => (veil.style.opacity = from + (to - from) * p));
  };
  // a slow push while nothing else moves, so a held shot is never dead
  const push = (k, dur) => camTo({ s: cam.s * (1 + k) }, dur, E.drift);

  // ------------------------------------------------------------ the film
  async function film() {
    // ---------- before the first frame
    paintCode(codeBefore);
    termLines = ['<span class="c">webshop on main</span>'];
    paintTerm('');
    ide.classList.add('dim');
    camSet({ x: 960, y: 15, s: 6.8 });
    placeCursor();
    fadeEl.style.opacity = 1;
    emit('settings', { personality: true, focusMinutes: 25, breakMinutes: 5, cycle: true, focusSessions: { date: new Date().toLocaleDateString('sv'), count: 2 }, motion: 'subtle' });
    emit('usage', { enabled: true, mode: 'bars', fiveHour: { pct: 41, resetsAt: Date.now() / 1000 + 7000 }, sevenDay: { pct: 18, resetsAt: Date.now() / 1000 + 300000 } });
    setSession({}, 'idle');
    emit('notes', { ...notes, file: 'notes.md' });
    emit('music', { enabled: true, status: 'none' });
    await wait(0.5);

    const rec = await startRecording();
    const RENDER = !!window.__rec.options.render;
    // in a render the film starts on a frame boundary and audio time is output time
    t0 = RENDER ? Math.ceil((performance.now() + 350) / window.__vtime.FRAME) * window.__vtime.FRAME : performance.now() + 350;
    const T0a = RENDER ? 0 : S.now() + 0.35;
    S.scheduleScore(T0a, 106);
    window.__rec.started();
    const loop = () => {
      runTweens();
      placeCursor();
      renderCam();
      requestAnimationFrame(loop);
    };
    loop();
    const at = (t) => (RENDER ? Tof(t) : T0a + t); // audio time of a film time

    // ================= A. COLD OPEN  0 - 10
    S.riser(at(2.2), 2.8, 0.2);
    S.impact(at(5.0), 0.6);
    S.whoosh(at(8.6), 0.9, false, 0.1);
    setFade(0, 1.9, E.outExpo);
    camTo({ x: 960, y: 15, s: 7.9 }, 2.95, E.drift); // a slow, breathing push toward the eyes
    await until(1.7);
    const eyebrow = mk('eyebrow', 'Introducing', 735);
    eyebrow.animate([{ opacity: 0, letterSpacing: '1.1em', filter: 'blur(10px)' }, { opacity: 1, letterSpacing: '0.5em', filter: 'blur(0)' }], { duration: 1500, easing: WORD_EASE, fill: 'forwards' });
    await until(3.05);
    await windUp(0.04, 0.3); // a breath in...
    camTo({ x: 960, y: 330, s: 1.5 }, 1.55, E.whip); // ...and the pull-back, fast in the middle
    fadeOut(eyebrow, { y: -14, ms: 600, delay: 500 });
    await until(4.98);
    const face = window.Mochi.create({ mood: 'wink', size: 210, clickable: false });
    const logo = mk('logo', '', 470);
    const faceBox = document.createElement('div');
    faceBox.appendChild(face.el);
    const word = document.createElement('div');
    word.className = 'word';
    word.textContent = 'Mochi';
    logo.append(faceBox, word);
    logo.style.opacity = 1;
    logo.animate([{ opacity: 0, transform: 'scale(1.22)', filter: 'blur(26px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 1500, easing: 'cubic-bezier(.2, .9, .1, 1)', fill: 'forwards' });
    faceBox.animate([{ transform: 'translateY(40px) scale(0.7) rotate(-14deg)' }, { transform: 'translateY(-8px) scale(1.06) rotate(3deg)', offset: 0.55 }, { transform: 'none' }], { duration: 1400, delay: 150, easing: 'cubic-bezier(.3, 1.2, .5, 1)', fill: 'backwards' });
    flash(0.45, 700);
    kick(18, 0.9);
    const tag = mk('tag', 'The little friend living in your notch.', 760);
    fadeIn(tag, { delay: 700, ms: 1300 });
    await until(8.5);
    fadeOut(logo, { y: -40, ms: 800 });
    fadeOut(tag, { y: -30, ms: 700 });
    await until(8.85);
    ide.classList.add('dim');
    emit('music', { enabled: true, status: 'none' });
    camTo({ x: 960, y: 200, s: 2.35 }, 1.9, E.drift);

    // ================= B. HOME  10 - 20
    await until(9.6);
    trackNo = 0; playing = true; pos = 41;
    pushMusic(); // the little album-art bubble pops out beside the notch
    await until(10.5);
    cursorShow(true);
    cur.x = 1450; cur.y = 190; placeCursor();
    cursorTo(960, 22, 1.0);
    await until(11.55);
    S.whoosh(S.now(), 0.55, true, 0.07);
    emit('hover', true); // the notch springs open
    await until(12.1);
    cursorTo(1010, 215, 1.2);
    let cp = caption('Your whole day, one hover away.', 'Claude, music, focus and notes. Right in the notch.', 842, 'mask');
    await until(13.9);
    push(0.05, 5.6);
    const tiles = [...document.querySelectorAll('.home .tile')].filter((t) => t.offsetParent);
    const strip = vis('.notes-strip');
    const beats = [13.9, 15.15, 16.6, 17.8];
    for (const [i, el] of [tiles[0], tiles[1], tiles[2], strip].entries()) {
      if (!el) continue;
      highlight(el, 5);
      await until(beats[i] + (i === 3 ? 1.2 : i === 0 ? 1.25 : 1.45));
    }
    unhighlight();
    await until(19.0);
    cp.out('sink');
    cursorTo(1500, 360, 0.9);
    await until(19.4);
    emit('hover', false);
    cursorShow(false, 0.6);

    // ================= C. CLAUDE AT WORK  20 - 42
    await until(19.8);
    camTo({ x: 960, y: 420, s: 1.12 }, 2.1, E.drift);
    ide.classList.remove('dim');
    S.whoosh(S.now(), 0.9, true, 0.08);
    await until(21.0);
    const c1 = caption('Give Claude a task.', 'Then get on with your day.', 870, 'rise');
    await typeTerm('claude "add VAT to checkout and run the tests"', 24);
    await until(22.7);
    termLines.push('<span class="p">❯</span> claude "add VAT to checkout and run the tests"', '<span class="c">● Reading files…</span>');
    paintTerm(null);
    c1.out('sink');
    setSession({ state: 'working', startedAt: Date.now(), finishedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', jobsToday: 4 }, 'working');
    windUp(0.05, 0.22);
    await wait(0.2);
    camTo({ x: 960, y: 15, s: 7.2 }, 1.25, E.whip); // match cut: the whole desktop collapses into Mochi's eyes
    S.whoosh(S.now(), 1.2, true, 0.1);
    await until(24.0);
    const c2 = caption('Eyes on every task.', 'Mochi watches Claude work, so you don\'t have to.', 842, 'scale');
    push(0.06, 3.4);
    await until(25.6);
    termLines.push('<span class="c">● Editing checkout.ts</span>');
    paintTerm(null);
    paintCode(codeAfter);
    setSession({ step: 1, diff: DIFF }, 'working');
    await until(27.0);
    c2.out('shrink');
    // needs you
    await until(27.4);
    kick(9, 0.55);
    setSession({ approval: { id: 1, requestedAt: Date.now(), toolName: 'Bash', command: 'npm test', diff: null }, needsText: 'npm test', pendingCount: 1 }, 'needs');
    emit('chime', 'needs');
    camTo({ x: 960, y: 184, s: 2.55 }, 1.5, E.spring); // snaps back with a little bounce as the panel springs open
    await until(29.0);
    const c3 = caption('Approve from the notch.', 'Allow or deny without leaving your flow.', 856, 'spring');
    await until(30.0);
    cursorShow(true);
    cur.x = 1560; cur.y = 220; placeCursor();
    const allow = vis('.btn.allow');
    emit('hover', true);
    await pointAndClick(allow, { dur: 1.2, then: () => {
      allow.click();
      emit('chime', 'focus');
    } });
    await wait(0.15);
    approved = true;
    termLines.push('<span class="c">● Running npm test</span>');
    paintTerm(null);
    setSession({ approval: null, needsText: '', pendingCount: 0, step: 2, testCommand: 'npm test' }, 'working');
    await until(32.2);
    cursorTo(1200, 330, 1.0);
    c3.out('sink');
    push(0.04, 4.5);
    await until(34.4);
    setSession({ step: 3, testResult: '48 passed' }, 'working');
    await until(36.9);
    termLines.push('<span class="p">✔</span> 48 tests passed');
    paintTerm(null);
    setSession({ state: 'done', step: 4, finishedAt: Date.now(), testResult: '48 passed', lastMessage: 'Done! VAT is now added at checkout. All 48 tests pass.', jobsToday: 5 }, 'done');
    emit('chime', 'done');
    flash(0.22, 600);
    kick(6, 0.5);
    await until(38.0);
    const c4 = caption('Know the second it\'s done.', 'A soft chime. A tiny celebration.', 856, 'spring');
    await until(41.2);
    c4.out('sink');
    cursorTo(1500, 380, 0.9);
    cursorShow(false, 0.7);
    await until(41.6);
    setSession({}, 'idle');
    emit('hover', false);

    // ================= D. MUSIC  42 - 51
    await until(42.1);
    camTo({ x: 990, y: 38, s: 4.6 }, 1.5, E.outExpo); // arrives fast and settles slowly
    ide.classList.add('dim');
    S.whoosh(S.now(), 0.9, true, 0.08);
    await until(43.0);
    const c5 = caption('Your music. Never in the way.', 'Album art beside the notch. Mochi dances along.', 852, 'mask');
    await until(45.0);
    camTo({ x: 960, y: 188, s: 2.5 }, 1.5, E.spring);
    cursorShow(true);
    cur.x = 1400; cur.y = 120; placeCursor();
    cursorTo(960, 22, 0.9);
    await until(45.7);
    emit('hover', true);
    await until(46.4);
    await pointAndClick(navItem('music'), { dur: 0.9 });
    await until(48.2);
    await pointAndClick(vis('[data-r="playpause"]'), { dur: 0.8 });
    await until(49.4);
    await pointAndClick(vis('[data-r="next"]'), { dur: 0.7 });
    await until(50.6);
    c5.out('sink');

    // ================= E. FOCUS  51 - 62
    await until(51.0);
    S.whoosh(S.now(), 0.7, true, 0.08);
    await pointAndClick(navItem('focus'), { dur: 0.8 });
    await until(52.0);
    const c6 = caption('Pomodoro, built in.', '25 minutes on, 5 off. A chime at every switch.', 856, 'rise');
    await until(53.2);
    await pointAndClick(vis('[data-r="go"]'), { dur: 0.9 });
    await until(54.1);
    cursorTo(1500, 300, 0.8);
    cursorShow(false, 0.6);
    emit('hover', false);
    camTo({ x: 960, y: 18, s: 5.4 }, 2.0, E.inOut);
    await until(55.0);
    setRate(300); // 25 minutes in five seconds
    const fast = () => {
      if (!phaseBreak && now() < 61.5) {
        window.Focus.tick();
        requestAnimationFrame(fast);
      }
    };
    fast();
    await until(56.0);
    c6.out('shrink');
    const c7 = caption('Chimes at every switch.', 'Focus, break, focus again.', 856, 'scale');
    await until(60.6);
    setRate(1);
    await until(61.0);
    c7.out('sink');
    await until(61.5);
    if (window.Focus.read().running) window.Focus.toggle(); // reset: the timer clears, the notch relaxes

    // ================= F. NOTES  62 - 70
    await until(61.9);
    camTo({ x: 960, y: 196, s: 2.4 }, 1.4, E.spring);
    cursorShow(true);
    cur.x = 1400; cur.y = 100; placeCursor();
    cursorTo(960, 22, 0.8);
    await until(62.4);
    emit('hover', true);
    await until(63.0);
    await pointAndClick(navItem('notes'), { dur: 0.7 });
    await until(63.9);
    const c8 = caption('Never lose a task.', 'A to-do list and a quick note, saved as a plain file.', 852, 'spring');
    const input = vis('[data-r="add"]');
    await pointAndClick(input, { dur: 0.8, then: () => input.focus() });
    const typeInto = async (el, text, cps) => {
      for (const ch of text) {
        el.value += ch;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        S.tick(S.now() + 0.002, 0.016 + rnd() * 0.01, 2100 + rnd() * 700);
        await wait(keyGap(ch, cps));
      }
    };
    const enter = () => el_enter(input);
    function el_enter(el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await typeInto(input, 'Ship the new checkout', 16);
    await wait(0.22 + rnd() * 0.15);
    enter();
    await wait(0.45 + rnd() * 0.25);
    await typeInto(input, 'Reply to Sam', 16);
    await wait(0.18 + rnd() * 0.15);
    enter();
    await until(67.6);
    const box = [...document.querySelectorAll('.nt-box')].find((b) => b.offsetParent && !b.classList.contains('x') && b.getAttribute('aria-checked') === 'false');
    if (box) await pointAndClick(box, { dur: 0.7 });
    await until(68.6);
    c8.out('sink');
    await pointAndClick(navItem('home'), { dur: 0.7 });
    await until(69.4);
    const strip2 = vis('.notes-strip');
    if (strip2) highlight(strip2, 5);
    await until(70.3);
    unhighlight();

    // ================= G. CHAT  70 - 81
    S.whoosh(S.now(), 0.7, true, 0.08);
    await pointAndClick(navItem('chat'), { dur: 0.8 });
    camTo({ x: 960, y: 212, s: 2.22 }, 1.5, E.drift);
    await until(71.4);
    const c9 = caption('Ask Claude anything.', 'Even about what\'s on your screen.', 886, 'mask');
    await until(72.1);
    await pointAndClick(vis('[data-r="cam"]'), { dur: 0.9 });
    await until(73.7);
    const ta = vis('[data-r="ta"]');
    await pointAndClick(ta, { dur: 0.7, then: () => ta.focus() });
    await typeInto(ta, 'why is this crashing?', 14);
    await wait(0.3 + rnd() * 0.2);
    pressFx();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    push(0.045, 5.5);
    await until(79.7);
    c9.out('sink');
    cursorTo(1500, 380, 0.9);
    cursorShow(false, 0.7);
    await until(80.1);
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); // Esc lets go of the text box, which would keep the notch open
    await until(80.4);
    emit('hover', false);
    emit('music', { enabled: true, status: 'none' }); // the music stops, the bubble tucks away: the room goes quiet

    // ================= H. A NAP  81 - 90
    await until(80.9);
    camTo({ x: 960, y: 17, s: 7.0 }, 2.4, E.drift);
    ide.classList.add('dim');
    S.whoosh(S.now(), 0.9, true, 0.07);
    await until(82.0);
    const c10 = caption('He naps when you\'re away.', 'And wakes up the moment you\'re back.', 852, 'scale');
    emit('personality', 'night'); // sleepy, droopy eyes
    await until(82.9);
    emit('personality', 'nap'); // the eyes slide shut, a little "z" drifts up
    S.lullaby(S.now(), false);
    setVeil(0.85, 2.2, E.drift); // the room dims
    await until(86.0);
    emit('personality', 'wake'); // ...and the wake-up blink
    emit('personality', 'normal');
    S.lullaby(S.now(), true);
    setVeil(0, 1.1, E.outExpo);
    kick(5, 0.5);
    camTo({ s: 7.55 }, 0.5, E.spring); // a little start
    c10.out('shrink');
    await until(87.2);
    camTo({ x: 960, y: 174, s: 2.7 }, 1.4, E.spring);
    emit('break', { minutes: 52 });
    emit('chime', 'break');
    await until(88.2);
    const c11 = caption('He\'ll remind you to rest your eyes.', '', 856, 'mask');
    await until(90.0);

    // ================= I. THE END  90 - 102.6
    c11.out('sink');
    flash(0.55, 900);
    kick(16, 0.9);
    await setFade(1, 0.35, E.lin);
    emit('hover', false);
    document.querySelectorAll('.brk-skip').forEach((b) => b.click());
    camSet({ x: 960, y: 330, s: 1.5 });
    emit('music', { enabled: true, status: 'none' });
    await until(90.5);
    setFade(0, 1.5, E.outExpo);
    face.el.parentNode && face.el.parentNode.remove();
    const face2 = window.Mochi.create({ mood: 'happy', size: 210, clickable: false });
    const logo2 = mk('logo', '', 470);
    const fb = document.createElement('div');
    fb.appendChild(face2.el);
    const word2 = document.createElement('div');
    word2.className = 'word';
    word2.textContent = 'Mochi';
    logo2.append(fb, word2);
    logo2.style.opacity = 1;
    logo2.animate([{ opacity: 0, transform: 'scale(1.12)', filter: 'blur(20px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 1600, easing: 'cubic-bezier(.2, .9, .1, 1)', fill: 'forwards' });
    fb.animate([{ transform: 'translateY(34px) scale(0.75) rotate(-10deg)' }, { transform: 'translateY(-6px) scale(1.05) rotate(2deg)', offset: 0.6 }, { transform: 'none' }], { duration: 1300, delay: 200, easing: 'cubic-bezier(.3, 1.2, .5, 1)', fill: 'backwards' });
    camTo({ x: 960, y: 300, s: 1.42 }, 10, E.drift);
    await until(92.0);
    const tag2 = mk('tag', 'Your Claude Code, living in the notch.', 735);
    fadeIn(tag2, { ms: 1400 });
    await until(94.2);
    const fine = mk('fine', 'For Windows 10 and 11  ·  Runs on your PC  ·  No account', 836);
    fadeIn(fine, { ms: 1200, y: 14 });
    await until(99.4);
    fadeOut(logo2, { y: -20, ms: 1600 });
    fadeOut(tag2, { y: -16, ms: 1500 });
    fadeOut(fine, { y: -10, ms: 1400 });
    await until(100.6);
    await setFade(1, 1.7, E.inOut);
    await until(102.6);
    if (window.__rec.options.render) {
      window.__film.finished = true; // the renderer takes it from here
      return;
    }
    if (rec) await rec.flush();
    window.__rec.finish();
  }

  window.__film = {
    finished: false,
    T: 0,
    t0: () => t0,
    now: () => now(),
    speed: (T) => speedAt(T),
    run: () =>
      film().catch((e) => {
        LOG('DIRECTOR ERROR ' + (e && e.stack ? e.stack : e));
        window.__film.finished = true;
        if (!window.__rec.options.render) window.__rec.finish();
      }),
  };
  if (!window.__rec.options.render) window.__film.run();
})();
