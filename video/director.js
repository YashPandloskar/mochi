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
  const E = { inOut: bez(0.65, 0, 0.35, 1), out: bez(0.16, 1, 0.3, 1), cine: bez(0.7, 0, 0.16, 1), soft: bez(0.45, 0.05, 0.2, 1), lin: (t) => t, glide: bez(0.3, 0, 0.1, 1) };

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
  function renderCam() {
    const tx = 960 - cam.x * cam.s + shake.x;
    const ty = 540 - cam.y * cam.s + shake.y;
    world.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${cam.s.toFixed(5)})`;
    const speed = Math.abs(Math.log(cam.s / prev.s)) * 230 + (Math.hypot(cam.x - prev.x, cam.y - prev.y) * cam.s) / 20;
    const blur = Math.min(4.2, Math.max(0, speed - 1.0));
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
  // a small hit of camera shake that dies away (on impacts)
  function kick(amount = 14, dur = 0.7) {
    const sx = Math.random() > 0.5 ? 1 : -1;
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
  function cursorTo(x, y, dur = 1, ease = E.soft) {
    const a = { ...cur };
    const dx = x - a.x;
    const dy = y - a.y;
    const len = Math.max(1, Math.hypot(dx, dy));
    const nx = -dy / len;
    const ny = dx / len;
    const bow = Math.min(40, len * 0.1);
    return tween(dur, ease, (p) => {
      const arc = Math.sin(p * Math.PI) * bow;
      cur.x = a.x + dx * p + nx * arc;
      cur.y = a.y + dy * p + ny * arc;
      placeCursor();
    });
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
    await cursorTo(p.x, p.y, dur);
    await wait(0.12);
    pressFx();
    await wait(0.06);
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
  const reveal = (ws, delay = 0, step = 70) =>
    ws.forEach((w, i) =>
      w.animate(
        [{ opacity: 0, transform: 'translateY(34px)', filter: 'blur(14px)' }, { opacity: 1, transform: 'translateY(0)', filter: 'blur(0)' }],
        { duration: 950, delay: delay + i * step, easing: WORD_EASE, fill: 'forwards' }
      )
    );
  function caption(l1, l2, y = 842) {
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
    reveal(w1, 0, 75);
    reveal(w2, 380, 28);
    return {
      out() {
        [...w1, ...w2].forEach((w, i) =>
          w.animate([{ opacity: 1, transform: 'none', filter: 'blur(0)' }, { opacity: 0, transform: 'translateY(-22px)', filter: 'blur(10px)' }], {
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
  async function typeTerm(text, cps = 22) {
    let s = '';
    for (const ch of text) {
      s += ch;
      paintTerm(s);
      S.tick(S.now() + 0.002, 0.018, 2300 + Math.random() * 500);
      await wait(1 / cps + Math.random() * 0.025);
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
    // in a render the film starts on a frame boundary and audio time is film time
    t0 = RENDER ? Math.ceil((performance.now() + 350) / window.__vtime.FRAME) * window.__vtime.FRAME : performance.now() + 350;
    const T0a = RENDER ? 0 : S.now() + 0.35;
    S.scheduleScore(T0a, 102);
    window.__rec.started();
    const loop = () => {
      runTweens();
      placeCursor();
      renderCam();
      requestAnimationFrame(loop);
    };
    loop();
    const at = (t) => T0a + t; // audio time of a film time

    // ================= A. COLD OPEN  0 - 10
    S.riser(at(2.2), 2.8, 0.2);
    S.impact(at(5.0), 0.6);
    S.whoosh(at(8.6), 0.9, false, 0.1);
    setFade(0, 1.7, E.out);
    camTo({ x: 960, y: 15, s: 7.6 }, 3.2, E.lin);
    await until(1.7);
    const eyebrow = mk('eyebrow', 'Introducing', 735);
    eyebrow.animate([{ opacity: 0, letterSpacing: '1.1em', filter: 'blur(10px)' }, { opacity: 1, letterSpacing: '0.5em', filter: 'blur(0)' }], { duration: 1500, easing: WORD_EASE, fill: 'forwards' });
    await until(3.1);
    camTo({ x: 960, y: 330, s: 1.5 }, 1.9, E.cine);
    fadeOut(eyebrow, { y: -14, ms: 600, delay: 900 });
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
    logo.animate([{ opacity: 0, transform: 'scale(1.18)', filter: 'blur(22px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 1300, easing: WORD_EASE, fill: 'forwards' });
    flash(0.45, 700);
    kick(18, 0.9);
    const tag = mk('tag', 'The little friend living in your notch.', 760);
    fadeIn(tag, { delay: 650, ms: 1200 });
    await until(8.55);
    fadeOut(logo, { y: -40, ms: 800 });
    fadeOut(tag, { y: -30, ms: 700 });
    await until(8.9);
    ide.classList.add('dim');
    emit('music', { enabled: true, status: 'none' });
    camTo({ x: 960, y: 200, s: 2.35 }, 1.7, E.cine);

    // ================= B. HOME  10 - 20
    await until(9.6);
    trackNo = 0; playing = true; pos = 41;
    pushMusic(); // the little album-art bubble pops out beside the notch
    await until(10.5);
    cursorShow(true);
    cur.x = 1450; cur.y = 190; placeCursor();
    cursorTo(960, 22, 1.0, E.glide);
    await until(11.55);
    S.whoosh(S.now(), 0.55, true, 0.07);
    emit('hover', true); // the notch springs open
    await until(12.1);
    cursorTo(1010, 215, 1.2, E.out);
    let cp = caption('Your whole day, one hover away.', 'Claude, music, focus and notes. Right in the notch.');
    await until(13.9);
    const tiles = [...document.querySelectorAll('.home .tile')].filter((t) => t.offsetParent);
    const strip = vis('.notes-strip');
    for (const [i, el] of [tiles[0], tiles[1], tiles[2], strip].entries()) {
      if (!el) continue;
      highlight(el, 5);
      await until(13.9 + (i + 1) * 1.35);
    }
    unhighlight();
    await until(19.0);
    cp.out();
    cursorTo(1500, 360, 0.9, E.soft);
    await until(19.4);
    emit('hover', false);
    cursorShow(false, 0.6);

    // ================= C. CLAUDE AT WORK  20 - 42
    await until(19.9);
    camTo({ x: 960, y: 420, s: 1.12 }, 1.9, E.cine);
    ide.classList.remove('dim');
    S.whoosh(S.now(), 0.9, true, 0.08);
    await until(21.0);
    const c1 = caption('Give Claude a task.', 'Then get on with your day.', 870);
    await typeTerm('claude "add VAT to checkout and run the tests"', 26);
    await until(22.6);
    termLines.push('<span class="p">❯</span> claude "add VAT to checkout and run the tests"', '<span class="c">● Reading files…</span>');
    paintTerm(null);
    c1.out();
    setSession({ state: 'working', startedAt: Date.now(), finishedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', jobsToday: 4 }, 'working');
    camTo({ x: 960, y: 15, s: 7.2 }, 1.7, E.cine); // match cut: the whole desktop collapses into Mochi's eyes
    S.whoosh(S.now(), 1.2, true, 0.1);
    await until(23.6);
    const c2 = caption('Eyes on every task.', 'Mochi watches Claude work, so you don\'t have to.', 842);
    await until(25.4);
    termLines.push('<span class="c">● Editing checkout.ts</span>');
    paintTerm(null);
    paintCode(codeAfter);
    setSession({ step: 1, diff: DIFF }, 'working');
    await until(27.0);
    c2.out();
    // needs you
    await until(27.4);
    kick(8, 0.5);
    setSession({ approval: { id: 1, requestedAt: Date.now(), toolName: 'Bash', command: 'npm test', diff: null }, needsText: 'npm test', pendingCount: 1 }, 'needs');
    emit('chime', 'needs');
    camTo({ x: 960, y: 184, s: 2.55 }, 1.5, E.cine); // pull back as the panel springs open
    await until(29.0);
    const c3 = caption('Approve from the notch.', 'Allow or deny without leaving your flow.', 856);
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
    cursorTo(1200, 330, 1.0, E.out);
    c3.out();
    await until(34.4);
    setSession({ step: 3, testResult: '48 passed' }, 'working');
    await until(36.9);
    termLines.push('<span class="p">✔</span> 48 tests passed');
    paintTerm(null);
    setSession({ state: 'done', step: 4, finishedAt: Date.now(), testResult: '48 passed', lastMessage: 'Done! VAT is now added at checkout. All 48 tests pass.', jobsToday: 5 }, 'done');
    emit('chime', 'done');
    flash(0.22, 600);
    await until(37.7);
    const c4 = caption('Know the second it\'s done.', 'A soft chime. A tiny celebration.', 856);
    await until(41.2);
    c4.out();
    cursorTo(1500, 380, 0.9, E.soft);
    cursorShow(false, 0.7);
    await until(41.6);
    setSession({}, 'idle');
    emit('hover', false);

    // ================= D. MUSIC  42 - 51
    await until(42.1);
    camTo({ x: 990, y: 38, s: 4.6 }, 1.7, E.cine);
    ide.classList.add('dim');
    S.whoosh(S.now(), 0.9, true, 0.08);
    await until(43.0);
    const c5 = caption('Your music. Never in the way.', 'Album art beside the notch. Mochi dances along.', 852);
    await until(45.0);
    camTo({ x: 960, y: 188, s: 2.5 }, 1.4, E.cine);
    cursorShow(true);
    cur.x = 1400; cur.y = 120; placeCursor();
    cursorTo(960, 22, 0.9, E.glide);
    await until(45.7);
    emit('hover', true);
    await until(46.4);
    await pointAndClick(navItem('music'), { dur: 0.9 });
    await until(48.2);
    await pointAndClick(vis('[data-r="playpause"]'), { dur: 0.8 });
    await until(49.4);
    await pointAndClick(vis('[data-r="next"]'), { dur: 0.7 });
    await until(50.6);
    c5.out();

    // ================= E. FOCUS  51 - 62
    await until(51.0);
    S.whoosh(S.now(), 0.7, true, 0.08);
    await pointAndClick(navItem('focus'), { dur: 0.8 });
    await until(52.0);
    const c6 = caption('Pomodoro, built in.', '25 minutes on, 5 off. A chime at every switch.', 856);
    await until(53.2);
    await pointAndClick(vis('[data-r="go"]'), { dur: 0.9 });
    await until(54.1);
    cursorTo(1500, 300, 0.8, E.soft);
    cursorShow(false, 0.6);
    emit('hover', false);
    camTo({ x: 960, y: 18, s: 5.4 }, 1.6, E.cine);
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
    c6.out();
    const c7 = caption('Chimes at every switch.', 'Focus, break, focus again.', 856);
    await until(60.6);
    setRate(1);
    await until(61.0);
    c7.out();

    // ================= F. NOTES  62 - 70
    await until(61.6);
    camTo({ x: 960, y: 196, s: 2.4 }, 1.3, E.cine);
    cursorShow(true);
    cur.x = 1400; cur.y = 100; placeCursor();
    cursorTo(960, 22, 0.8, E.glide);
    await until(62.2);
    emit('hover', true);
    await until(62.9);
    await pointAndClick(navItem('notes'), { dur: 0.7 });
    await until(63.8);
    const c8 = caption('Never lose a task.', 'A to-do list and a quick note, saved as a plain file.', 852);
    const input = vis('[data-r="add"]');
    await pointAndClick(input, { dur: 0.8, then: () => input.focus() });
    const typeInto = async (el, text, cps) => {
      for (const ch of text) {
        el.value += ch;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        S.tick(S.now() + 0.002, 0.02, 2200 + Math.random() * 500);
        await wait(1 / cps + Math.random() * 0.02);
      }
    };
    const enter = () => el_enter(input);
    function el_enter(el) {
      el.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    }
    await typeInto(input, 'Ship the new checkout', 17);
    await wait(0.25);
    enter();
    await wait(0.45);
    await typeInto(input, 'Reply to Sam', 17);
    await wait(0.2);
    enter();
    await until(67.4);
    const box = [...document.querySelectorAll('.nt-box')].find((b) => b.offsetParent && !b.classList.contains('x') && b.getAttribute('aria-checked') === 'false');
    if (box) await pointAndClick(box, { dur: 0.7 });
    await until(68.4);
    c8.out();
    await pointAndClick(navItem('home'), { dur: 0.7 });
    await until(69.3);
    const strip2 = vis('.notes-strip');
    if (strip2) highlight(strip2, 5);
    await until(70.2);
    unhighlight();

    // ================= G. CHAT  70 - 81
    S.whoosh(S.now(), 0.7, true, 0.08);
    await pointAndClick(navItem('chat'), { dur: 0.8 });
    camTo({ x: 960, y: 212, s: 2.22 }, 1.2, E.cine);
    await until(71.3);
    const c9 = caption('Ask Claude anything.', 'Even about what\'s on your screen.', 886);
    await until(72.0);
    await pointAndClick(vis('[data-r="cam"]'), { dur: 0.9 });
    await until(73.6);
    const ta = vis('[data-r="ta"]');
    await pointAndClick(ta, { dur: 0.7, then: () => ta.focus() });
    await typeInto(ta, 'why is this crashing?', 15);
    await wait(0.3);
    pressFx();
    ta.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await until(79.6);
    c9.out();
    cursorTo(1500, 380, 0.9, E.soft);
    cursorShow(false, 0.7);
    await until(80.4);
    emit('hover', false);

    // ================= H. PERSONALITY  81 - 88
    await until(80.9);
    camTo({ x: 960, y: 20, s: 5.6 }, 1.5, E.cine);
    ide.classList.add('dim');
    S.whoosh(S.now(), 0.9, true, 0.08);
    await until(81.9);
    const c10 = caption('He naps when you\'re away.', 'And wakes up when you\'re back.', 852);
    emit('personality', 'night');
    await until(82.6);
    emit('personality', 'nap');
    await until(85.0);
    emit('personality', 'wake');
    emit('personality', 'normal');
    c10.out();
    await until(85.7);
    camTo({ x: 960, y: 174, s: 2.7 }, 1.3, E.cine);
    emit('break', { minutes: 52 });
    emit('chime', 'break');
    await until(86.6);
    const c11 = caption('He\'ll remind you to rest your eyes.', '', 856);
    await until(88.0);

    // ================= I. THE END  88 - 100
    c11.out();
    flash(0.55, 900);
    kick(16, 0.9);
    await setFade(1, 0.35, E.lin);
    emit('hover', false);
    document.querySelectorAll('.brk-skip').forEach((b) => b.click());
    camSet({ x: 960, y: 330, s: 1.5 });
    emit('music', { enabled: true, status: 'none' });
    await until(88.5);
    setFade(0, 1.4, E.out);
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
    logo2.animate([{ opacity: 0, transform: 'scale(1.1)', filter: 'blur(20px)' }, { opacity: 1, transform: 'scale(1)', filter: 'blur(0)' }], { duration: 1500, easing: WORD_EASE, fill: 'forwards' });
    camTo({ x: 960, y: 300, s: 1.42 }, 9, E.lin);
    await until(90.0);
    const tag2 = mk('tag', 'Your Claude Code, living in the notch.', 735);
    fadeIn(tag2, { ms: 1300 });
    await until(92.2);
    const fine = mk('fine', 'For Windows 10 and 11  ·  Runs on your PC  ·  No account', 836);
    fadeIn(fine, { ms: 1200, y: 14 });
    await until(97.4);
    fadeOut(logo2, { y: -20, ms: 1600 });
    fadeOut(tag2, { y: -16, ms: 1500 });
    fadeOut(fine, { y: -10, ms: 1400 });
    await until(98.6);
    await setFade(1, 1.6, E.inOut);
    await until(100.6);
    if (window.__rec.options.render) {
      window.__film.finished = true; // the renderer takes it from here
      return;
    }
    if (rec) await rec.flush();
    window.__rec.finish();
  }

  window.__film = {
    finished: false,
    t0: () => t0,
    now: () => now(),
    run: () =>
      film().catch((e) => {
        LOG('DIRECTOR ERROR ' + (e && e.stack ? e.stack : e));
        window.__film.finished = true;
        if (!window.__rec.options.render) window.__rec.finish();
      }),
  };
  if (!window.__rec.options.render) window.__film.run();
})();
