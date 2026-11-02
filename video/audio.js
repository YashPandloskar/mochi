// Sound for the launch trailer: Mochi's own chimes (src/theme.js sounds.notes) plus a small generated score.
// Everything is synthesised with Web Audio, so there are no audio files and nothing to license.
// Loaded before the app scripts: Mochi's chime.js calls `new AudioContext()` and gets this shared one,
// so its chimes land in the same mix (and the same recording) as the music.
(() => {
  const RENDER = !!(window.__rec && window.__rec.options.render); // frame-exact render: the whole mix is built offline
  const RealAC = window.AudioContext;
  const ctx = RENDER ? new OfflineAudioContext(2, 48000 * 108, 48000) : new RealAC({ sampleRate: 48000, latencyHint: 'playback' });
  const speakers = ctx.destination;
  const streamDest = RENDER ? null : ctx.createMediaStreamDestination(); // what gets recorded in real time
  if (RENDER) {
    // chimes and taps ask the context what time it is: in a render that is the film's clock
    Object.defineProperty(ctx, 'currentTime', { get: () => (window.__film ? window.__film.T || 0 : 0) });
  }

  const master = ctx.createGain();
  master.gain.value = 0.9;
  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -16;
  comp.knee.value = 14;
  comp.ratio.value = 3.2;
  comp.attack.value = 0.006;
  comp.release.value = 0.22;
  master.connect(comp);
  comp.connect(speakers);
  if (streamDest) comp.connect(streamDest);

  // generated reverb tail (decaying stereo noise)
  const irLen = Math.floor(ctx.sampleRate * 3.4);
  const ir = ctx.createBuffer(2, irLen, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    for (let i = 0; i < irLen; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / irLen, 2.6);
  }
  const reverb = ctx.createConvolver();
  reverb.buffer = ir;
  const revSend = ctx.createGain();
  revSend.gain.value = 0.55;
  const revOut = ctx.createGain();
  revOut.gain.value = 0.7;
  revSend.connect(reverb);
  reverb.connect(revOut);
  revOut.connect(master);

  // a dotted-eighth echo for the plucks
  const delay = ctx.createDelay(1);
  delay.delayTime.value = 0.469; // dotted eighth at 96 bpm
  const fb = ctx.createGain();
  fb.gain.value = 0.36;
  const delayLp = ctx.createBiquadFilter();
  delayLp.type = 'lowpass';
  delayLp.frequency.value = 2600;
  delay.connect(delayLp);
  delayLp.connect(fb);
  fb.connect(delay);
  const delaySend = ctx.createGain();
  delaySend.gain.value = 0.5;
  delaySend.connect(delay);
  delayLp.connect(master);
  delayLp.connect(revSend);

  // Mochi's chimes: chime.js connects to ctx.destination, which is redirected into the mix (with a little room)
  const chimeBus = ctx.createGain();
  chimeBus.gain.value = 1.0;
  chimeBus.connect(master);
  chimeBus.connect(revSend);
  Object.defineProperty(ctx, 'destination', { get: () => chimeBus });
  window.AudioContext = function () {
    return ctx;
  };

  const noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
  {
    const d = noiseBuf.getChannelData(0);
    for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  }
  const noise = () => {
    const s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    return s;
  };
  const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);
  const env = (g, t, a, peak, d, end = 0.0001) => {
    g.gain.cancelScheduledValues(t);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(peak, t + a);
    g.gain.exponentialRampToValueAtTime(end, t + a + d);
  };
  const route = (node, { dry = 1, rev = 0, echo = 0 } = {}) => {
    if (dry) {
      const g = ctx.createGain();
      g.gain.value = dry;
      node.connect(g);
      g.connect(master);
    }
    if (rev) {
      const g = ctx.createGain();
      g.gain.value = rev;
      node.connect(g);
      g.connect(revSend);
    }
    if (echo) {
      const g = ctx.createGain();
      g.gain.value = echo;
      node.connect(g);
      g.connect(delaySend);
    }
  };

  const S = {
    ctx,
    stream: streamDest ? streamDest.stream : null,
    resume: () => (RENDER ? Promise.resolve() : ctx.resume()),
    now: () => (RENDER ? window.__film.T || 0 : ctx.currentTime), // the frame being rendered, in audio time
    // a warm, slow swell: a few chord tones fade up over about two seconds and ring out
    bloom(t) {
      [57, 64, 69, 72, 76].forEach((m, i) => {
        const o = ctx.createOscillator();
        o.type = 'sine';
        o.frequency.value = hz(m);
        const g = ctx.createGain();
        g.gain.setValueAtTime(0.0001, t + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.03, t + 1.9 + i * 0.12);
        g.gain.exponentialRampToValueAtTime(0.0001, t + 6.5);
        o.connect(g);
        route(g, { dry: 0.8, rev: 0.7 });
        o.start(t + i * 0.12);
        o.stop(t + 6.6);
      });
    },
    // Mochi dozing off: a few soft notes sinking; and waking: the same notes lifting
    lullaby(t, up = false) {
      const notes = up ? [67, 72, 76, 79] : [79, 74, 70, 67];
      notes.forEach((m, i) => S.pluck(t + i * 0.34, m - 12, 0.07));
    },
    render: () => ctx.startRendering(),

    // soft evolving chord
    pad(t, midis, dur, vol = 0.05) {
      for (const m of midis) {
        for (const det of [-6, 6]) {
          const o = ctx.createOscillator();
          o.type = 'sawtooth';
          o.frequency.value = hz(m);
          o.detune.value = det;
          const lp = ctx.createBiquadFilter();
          lp.type = 'lowpass';
          lp.frequency.setValueAtTime(380, t);
          lp.frequency.linearRampToValueAtTime(1500, t + dur * 0.6);
          lp.frequency.linearRampToValueAtTime(500, t + dur);
          const g = ctx.createGain();
          g.gain.setValueAtTime(0.0001, t);
          g.gain.linearRampToValueAtTime(vol / midis.length, t + Math.min(1.1, dur * 0.4));
          g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.9);
          o.connect(lp);
          lp.connect(g);
          route(g, { dry: 0.9, rev: 0.5 });
          o.start(t);
          o.stop(t + dur + 1);
        }
      }
    },
    bass(t, midi, dur = 1.2, vol = 0.22) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = hz(midi);
      const o2 = ctx.createOscillator();
      o2.type = 'triangle';
      o2.frequency.value = hz(midi + 12);
      const g = ctx.createGain();
      const g2 = ctx.createGain();
      g2.gain.value = 0.18;
      env(g, t, 0.03, vol, dur);
      o.connect(g);
      o2.connect(g2);
      g2.connect(g);
      route(g, { dry: 1, rev: 0.12 });
      o.start(t);
      o2.start(t);
      o.stop(t + dur + 0.2);
      o2.stop(t + dur + 0.2);
    },
    pluck(t, midi, vol = 0.1) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = hz(midi);
      const o2 = ctx.createOscillator();
      o2.type = 'sine';
      o2.frequency.value = hz(midi + 12);
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(4200, t);
      lp.frequency.exponentialRampToValueAtTime(700, t + 0.5);
      const g = ctx.createGain();
      env(g, t, 0.004, vol, 0.7);
      const g2 = ctx.createGain();
      g2.gain.value = 0.25;
      o.connect(lp);
      o2.connect(g2);
      g2.connect(lp);
      lp.connect(g);
      route(g, { dry: 0.8, rev: 0.45, echo: 0.55 });
      o.start(t);
      o2.start(t);
      o.stop(t + 0.9);
      o2.stop(t + 0.9);
    },
    kick(t, vol = 0.5) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(140, t);
      o.frequency.exponentialRampToValueAtTime(44, t + 0.13);
      const g = ctx.createGain();
      env(g, t, 0.003, vol, 0.32);
      o.connect(g);
      route(g, { dry: 1, rev: 0.04 });
      o.start(t);
      o.stop(t + 0.4);
    },
    hat(t, vol = 0.05) {
      const n = noise();
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 7500;
      const g = ctx.createGain();
      env(g, t, 0.002, vol, 0.05);
      n.connect(hp);
      hp.connect(g);
      route(g, { dry: 1, rev: 0.1 });
      n.start(t, Math.random());
      n.stop(t + 0.1);
    },
    clap(t, vol = 0.12) {
      for (const dt of [0, 0.012, 0.026]) {
        const n = noise();
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.value = 1700;
        bp.Q.value = 0.9;
        const g = ctx.createGain();
        env(g, t + dt, 0.002, vol, 0.12);
        n.connect(bp);
        bp.connect(g);
        route(g, { dry: 1, rev: 0.35 });
        n.start(t + dt, Math.random());
        n.stop(t + dt + 0.2);
      }
    },
    tick(t, vol = 0.07, f = 1800) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.value = f;
      const g = ctx.createGain();
      env(g, t, 0.001, vol, 0.03);
      o.connect(g);
      route(g, { dry: 1, rev: 0.15 });
      o.start(t);
      o.stop(t + 0.06);
    },
    // soft "tap" for a click on screen
    tap(t, vol = 0.05) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(900, t);
      o.frequency.exponentialRampToValueAtTime(520, t + 0.05);
      const g = ctx.createGain();
      env(g, t, 0.002, vol, 0.07);
      o.connect(g);
      route(g, { dry: 1, rev: 0.2 });
      o.start(t);
      o.stop(t + 0.12);
    },
    riser(t, dur, vol = 0.16) {
      const n = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 1.4;
      bp.frequency.setValueAtTime(260, t);
      bp.frequency.exponentialRampToValueAtTime(9000, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.96);
      g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      n.connect(bp);
      bp.connect(g);
      route(g, { dry: 1, rev: 0.4 });
      n.start(t, Math.random());
      n.stop(t + dur + 0.1);
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(180, t);
      o.frequency.exponentialRampToValueAtTime(1500, t + dur);
      const og = ctx.createGain();
      og.gain.setValueAtTime(0.0001, t);
      og.gain.exponentialRampToValueAtTime(vol * 0.35, t + dur);
      og.gain.linearRampToValueAtTime(0.0001, t + dur + 0.04);
      o.connect(og);
      route(og, { dry: 1, rev: 0.4 });
      o.start(t);
      o.stop(t + dur + 0.1);
    },
    impact(t, vol = 0.55) {
      const o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(38, t + 1.4);
      const g = ctx.createGain();
      env(g, t, 0.004, vol, 2.2);
      o.connect(g);
      route(g, { dry: 1, rev: 0.3 });
      o.start(t);
      o.stop(t + 2.6);
      const n = noise();
      const lp = ctx.createBiquadFilter();
      lp.type = 'lowpass';
      lp.frequency.setValueAtTime(5000, t);
      lp.frequency.exponentialRampToValueAtTime(200, t + 1.1);
      const ng = ctx.createGain();
      env(ng, t, 0.002, vol * 0.5, 1.4);
      n.connect(lp);
      lp.connect(ng);
      route(ng, { dry: 0.7, rev: 0.8 });
      n.start(t, Math.random());
      n.stop(t + 1.6);
    },
    whoosh(t, dur = 0.7, up = true, vol = 0.12) {
      const n = noise();
      const bp = ctx.createBiquadFilter();
      bp.type = 'bandpass';
      bp.Q.value = 0.8;
      bp.frequency.setValueAtTime(up ? 400 : 5200, t);
      bp.frequency.exponentialRampToValueAtTime(up ? 5200 : 400, t + dur);
      const g = ctx.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol, t + dur * 0.5);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      n.connect(bp);
      bp.connect(g);
      route(g, { dry: 1, rev: 0.5 });
      n.start(t, Math.random());
      n.stop(t + dur + 0.1);
    },
    hz,
  };

  // ---- the score: Am - F - C - G at 96 bpm (one chord per 2.5 s bar), shaped by the sections of the film ----
  const BAR = 2.5;
  const BEAT = BAR / 4;
  const CH = [
    { root: 33, pad: [57, 60, 64, 67], arp: [69, 72, 76, 79, 76, 72] }, // Am
    { root: 29, pad: [57, 60, 65, 69], arp: [65, 69, 72, 77, 72, 69] }, // F
    { root: 36, pad: [55, 60, 64, 67], arp: [67, 72, 76, 79, 76, 72] }, // C
    { root: 31, pad: [55, 59, 62, 67], arp: [67, 71, 74, 79, 74, 71] }, // G
  ];
  // [from second, level]: 0 pad only; 1 + bass; 2 + arp; 3 + beat; 4 beat + fuller arp; 5 soft (no beat); 6 clock; 7 sparse
  const SECTIONS = [
    [0, 0], [7.5, 1], [10, 2], [20, 3], [28, 4], [42, 5], [51, 6], [62, 5], [70, 3], [81, 7], [90, 8],
  ];
  const levelAt = (t) => SECTIONS.reduce((l, [from, lv]) => (t >= from ? lv : l), 0);

  S.scheduleScore = (T0, total) => {
    const bars = Math.ceil(total / BAR) + 1;
    for (let b = 0; b < bars; b++) {
      const tb = b * BAR;
      const t = T0 + tb;
      const lv = levelAt(tb);
      const c = CH[b % 4];
      if (lv === 8) continue; // the finale is one long, resolved chord, scheduled below
      S.pad(t, c.pad, BAR + 0.4, lv === 7 ? 0.045 : lv === 0 ? 0.05 : 0.065);
      if (lv >= 1 && lv !== 7) S.bass(t, c.root, BAR - 0.2);
      if (lv === 7) S.bass(t, c.root, BAR - 0.2, 0.14);
      if (lv >= 2 && lv !== 7) {
        const n = lv === 4 ? 12 : lv === 5 || lv === 6 ? 6 : 8;
        for (let i = 0; i < n; i++) {
          const tt = tb + (i * BAR) / n;
          const note = c.arp[i % c.arp.length] + (lv === 4 && i % 6 === 5 ? 12 : 0);
          S.pluck(T0 + tt, note, lv === 5 || lv === 6 ? 0.07 : 0.09);
        }
      }
      if (lv === 3 || lv === 4) {
        for (let i = 0; i < 4; i++) {
          S.kick(t + i * BEAT, i % 2 === 0 ? 0.5 : 0.28);
          if (i % 2 === 1) S.clap(t + i * BEAT, 0.1);
        }
        for (let i = 0; i < 8; i++) S.hat(t + i * (BEAT / 2) + BEAT / 4, i % 2 ? 0.045 : 0.03);
      }
      if (lv === 6) {
        // the Focus scene: a quiet clock
        for (let i = 0; i < 5; i++) S.tick(t + i * (BAR / 5), i === 0 ? 0.08 : 0.05, i === 0 ? 2200 : 1700);
      }
    }
    S.pad(T0 + 90, [55, 60, 64, 67, 71], 11, 0.1);
    S.bass(T0 + 90, 36, 10, 0.26);
  };
  window.Score = S;
})();
