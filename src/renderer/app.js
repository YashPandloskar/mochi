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
    '--brk-chip': theme.breakPanel.chipColor,
    '--brk-chip-bg': theme.breakPanel.chipBackground,
    '--brk-btn': theme.breakPanel.buttonBackground,
    '--brk-btn-fg': theme.breakPanel.buttonColor,
    '--brk-ring': theme.breakPanel.ring,
    '--dance-s': theme.personality.dance.seconds + 's',
    '--dance-sway': theme.personality.dance.swayPx + 'px',
    '--dance-tilt': theme.personality.dance.tiltDeg + 'deg',
    '--dance-head-tilt': theme.personality.dance.headerTiltDeg + 'deg',
    '--dance-bob': theme.personality.dance.headerBobPx + 'px',
    '--nap-s': theme.personality.nap.closeSeconds + 's',
    '--z-s': theme.personality.nap.zSeconds + 's',
    '--chat-user': theme.chat.userBubble,
    '--chat-text': theme.chat.assistantText,
    '--chat-code': theme.chat.codeBackground,
    '--chat-input': theme.chat.inputBackground,
    '--chat-accent': theme.chat.accent,
    '--timer-break-ring': theme.companions.timer.breakRing,
    '--timer-break-text': theme.companions.timer.breakText,
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
  let breakActive = false; // the break reminder is showing
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

  // ---------- the assistant side: a chat request, or a ping from another tool ----------
  // Claude Code stays in charge of `state`. Everything below only applies while Claude Code is idle, and only changes
  // what is shown when you have chosen Chat-only mode, a tool is pinging, or a chat is being answered (the eyes).
  const chip = document.getElementById('chip');
  let assistant = { phase: 'idle', source: null, label: '' };
  let mode = 'both'; // 'both' | 'claudeCode' | 'chatOnly'
  let providerLabel = 'Claude';
  const PHASE_EYES = { thinking: 'thinking', replying: 'replying', done: 'answered', needs: 'asking', error: 'failed' };
  const eyeKey = () => (state === 'idle' && PHASE_EYES[assistant.phase]) || state;
  // the Assistant panel takes the Claude tab only in Chat-only mode, or while a tool is pinging, and never over a job
  const assistantPanel = () => state === 'idle' && (mode === 'chatOnly' || (assistant.source === 'ping' && assistant.phase !== 'idle'));
  const assistantAuto = () => assistantPanel() && ['done', 'needs', 'error'].includes(assistant.phase);

  // Needs-you and Done open by themselves; Working stays as eyes until you hover.
  const autoOpens = () => state === 'needs' || state === 'done' || breakActive || assistantAuto();

  // ---------- panel views ----------
  const home = window.HomeView.create();
  const working = window.WorkingView.create();
  const done = window.DoneView.create();
  const needs = window.NeedsView.create();
  const claudeIdle = window.ClaudeIdleView.create();
  const assistantView = window.AssistantView.create();
  const music = window.MusicView.create({
    onTint: (colour) => {
      musicTint = colour;
      if (expanded && viewKey() === 'music') applyGeometry();
    },
  });
  const focus = window.FocusView.create();
  const brk = window.BreakView.create({
    onAnswer: (action) => {
      breakActive = false;
      window.mochi.breakAnswer(action);
      if (expanded) {
        showView();
        applyGeometry();
      }
      scheduleCollapse();
    },
  });
  const chatView = window.ChatView.create({
    onPinChange: () => {
      if (!chatView.pinned() && !hover) scheduleCollapse();
    },
  });
  const notesView = window.NotesView.create();
  // any watched text box (Notes) keeps the panel open while you type
  Typing.onPinChange(() => {
    if (!Typing.pinned() && !chatView.pinned() && !hover) scheduleCollapse();
  });
  const views = { home, working, done, needs, claudeIdle, assistant: assistantView, music, focus, notes: notesView, break: brk, chat: chatView };

  content.append(...Object.values(views).map((v) => v.el));

  // Which panel is showing: Needs-you always wins; otherwise the nav tab decides.
  function viewKey() {
    if (state === 'needs') return 'needs';
    if (breakActive) return 'break';
    if (tab === 'claude') return assistantPanel() ? 'assistant' : state === 'working' ? 'working' : state === 'done' ? 'done' : 'claudeIdle';
    return tab;
  }

  // The tab to start on when the notch opens or the state changes.
  const defaultTab = () => {
    if (state === 'working' || state === 'done') return 'claude';
    if (assistantPanel() && assistant.phase !== 'idle') return 'claude'; // something is going on: show it
    return chatView.recentlyActive(theme.chat.reopenMinutes) ? 'chat' : 'home'; // back to the conversation you were having
  };

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
    notesView.commit(); // a half-typed task is kept when you leave the Notes tab
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
      let from = p.from;
      let to = key === 'music' && musicTint ? musicTint : p.to;
      if (key === 'assistant') [from, to] = theme.assistant.colors[assistant.phase] || theme.assistant.colors.idle; // the panel's colour follows what it is doing
      notch.style.width = theme.expanded.width + 'px';
      notch.style.height = h + 'px';
      notch.style.borderRadius = radius(theme.expanded.radius);
      notch.style.background = 'transparent';
      // the Focus tab turns green while on a break
      const g = key === 'focus' && Focus.read().running && Focus.read().phase === 'break' ? theme.panels.focusBreak : null;
      gradient.style.background = `linear-gradient(to bottom, ${g ? g.from : from}, ${g ? g.to : to})`;
      if (p.fromAlt) gradientAlt.style.background = `linear-gradient(to bottom, ${p.fromAlt}, ${p.toAlt})`;
      notch.classList.toggle('is-done', key === 'done'); // the green crossfade belongs to the Done panel only
      window.mochi.setHitSize({ w: theme.expanded.width, h, collapsed: false });
      bubble.classList.add('hide-expanded');
      chip.classList.add('hide-expanded');
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
      chip.style.right = `calc(50% + ${w / 2 + theme.companions.music.gap}px)`; // just left of the notch
      chip.classList.remove('hide-expanded');
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
    notesView.commit(); // keep a half-typed task
    window.mochi.focusWindow(false); // hand keyboard focus back (it is only taken while typing in Chat)
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
      if (!hover && !autoOpens() && !chatView.pinned() && !Typing.pinned()) collapse();
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
    notch.classList.toggle('timer-break', f.running && f.phase === 'break'); // green ring during a break
    if (f.running !== timerOn) {
      timerOn = f.running;
      notch.classList.toggle('timer-on', timerOn);
      if (!expanded) applyGeometry(); // widen or shrink the collapsed notch
    }
  }
  Focus.onChange(refreshTimer);
  Focus.onChange(() => {
    if (expanded && viewKey() === 'focus') applyGeometry();
  });
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
    const key = eyeKey(); // Claude Code's state, or an assistant phase while Claude Code is idle
    const cfg = e[key] || e.idle;
    const vis = cfg.like || key; // the state whose motion and shape this one reuses
    const g = e.glow;
    const set = (k, v) => eyesEl.style.setProperty(k, v);
    set('--ec', cfg.color);
    set('--ew', cfg.width + 'px');
    // time-of-day look (idle eyes only): droopy at night, wider and livelier in the morning
    const P = theme.personality;
    const look = key === 'idle' ? Personality.snapshot().look : 'day';
    const scale = look === 'night' ? P.night.eyeScale : look === 'morning' ? P.morning.eyeScale : 1;
    set('--eh', cfg.height * scale + 'px');
    set('--pulse', (cfg.pulse || 2.4) * (look === 'morning' ? P.morning.pulseScale : 1) + 's');
    set('--blink', (look === 'night' ? P.night.blinkSeconds : cfg.blink || 4) + 's');
    set('--g-near', shadow(g.near, cfg.color));
    set('--g-far', shadow(g.far, cfg.color));
    set('--g-near-p', shadow(g.nearPulse, cfg.color));
    set('--g-far-p', shadow(g.farPulse, cfg.color));
    const lively = motion === 'lively' && vis === 'working' ? theme.lively.workingEyes : null;
    set('--drift', (lively ? lively.driftPx : cfg.driftPx || 0) + 'px');
    set('--drift-s', (lively ? lively.driftSeconds : cfg.driftSeconds || 5) + 's');
    set('--sweep-s', (lively ? lively.sweepSeconds : 2) + 's');
    set('--hop', (cfg.hopPx || 0) + 'px');
    set('--hop-s', (cfg.hopSeconds || 1.8) + 's');
    set('--arc', (cfg.arcBorder || 3) + 'px');
    set('--bob', (cfg.bobPx || 0) + 'px');
    set('--bob-s', (cfg.bobSeconds || 2) + 's');
    eyesEl.dataset.state = vis;

    // Rebuild the nodes so one-shot animations (pop-in, sparks) replay on every entry.
    eyesEl.replaceChildren();
    for (let i = 0; i < 2; i++) {
      const eye = document.createElement('div');
      eye.className = 'eye';
      eyesEl.appendChild(eye);
    }
    applyEyeClasses(false);
    if (lively) {
      // lively only: a thin scanning line under the eyes (subtle mode has no sweep line)
      const sweep = document.createElement('div');
      sweep.className = 'sweep';
      eyesEl.appendChild(sweep);
    }
    if (vis === 'done') {
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
  // A text box that still has focus keeps the notch open (so it does not vanish while you type). If the pointer has
  // been away for a few seconds and nothing has been typed, let go of it, so the notch can close and the keyboard goes
  // back to the program you were using instead of staying captured.
  let lastKey = 0;
  let releaseTimer = null;
  document.addEventListener('keydown', () => (lastKey = Date.now()), true);
  function scheduleRelease() {
    clearTimeout(releaseTimer);
    releaseTimer = setTimeout(() => {
      if (hover) return;
      if (Date.now() - lastKey < ms(theme.timings.typingReleaseSeconds)) return scheduleRelease(); // still typing
      const a = document.activeElement;
      if (a && (a.tagName === 'INPUT' || a.tagName === 'TEXTAREA')) a.blur(); // blur adds a half-typed task
      window.mochi.focusWindow(false);
      chatView.onWindowBlur();
      Typing.reset();
      scheduleCollapse();
    }, ms(theme.timings.typingReleaseSeconds));
  }

  window.mochi.onHover((inside) => {
    hover = inside;
    clearTimeout(collapseTimer);
    clearTimeout(releaseTimer);
    if (inside) {
      poke();
      expand();
      if (state === 'done') turnGreen();
    } else {
      scheduleCollapse();
      scheduleRelease();
    }
  });
  window.mochi.onState((s) => {
    poke();
    setState(s);
  });
  window.mochi.onSession((session) => {
    lastSession = session;
    home.update({ session });
    working.update(session);
    done.update(session);
    needs.update(session);
    claudeIdle.update(session);
  });
  // ---------- assistant activity (chat requests, pings) ----------
  const refreshAssistantUi = () => {
    home.update({ assistant: { mode, a: assistant, label: providerLabel } });
    assistantView.update(assistant, providerLabel);
    // the chip beside the collapsed notch names who is answering
    const show = assistant.phase !== 'idle' && !!(assistant.label || providerLabel);
    chip.textContent = assistant.source === 'ping' ? assistant.label : providerLabel;
    chip.className = (show ? 'show ' : '') + (chip.classList.contains('hide-expanded') ? 'hide-expanded ' : '') + (['done', 'needs', 'error'].includes(assistant.phase) ? assistant.phase : '');
  };
  function applyMode(next) {
    mode = next;
    Nav.setLabel('claude', mode === 'chatOnly' ? 'Assistant' : 'Claude');
    refreshAssistantUi();
    if (expanded) {
      showView();
      applyGeometry();
    }
  }
  window.mochi.onAssistant((next) => {
    const was = assistant.phase;
    assistant = next && next.phase ? next : { phase: 'idle', source: null, label: '' };
    poke(); // a chat or a ping counts as activity: Mochi is not napping
    buildEyes();
    refreshAssistantUi();
    // a soft sound when the answer arrives while you are not looking at the notch
    if (!expanded && assistant.sounds && !assistant.quiet && was !== assistant.phase) {
      if (assistant.phase === 'done') window.Chime.play('done');
      else if (assistant.phase === 'needs') window.Chime.play('needs');
    }
    if (assistantAuto() && !expanded) expand();
    else if (expanded) {
      showView();
      applyGeometry();
      if (!autoOpens() && !hover) scheduleCollapse();
    }
  });

  window.mochi.onSettings((s) => {
    if (s.providerLabel) {
      providerLabel = s.providerLabel;
      refreshAssistantUi();
    }
    if (s.assistantMode && s.assistantMode !== mode) applyMode(s.assistantMode);
    if (s.personality !== undefined) Personality.setEnabled(s.personality);
    Focus.loadConfig({ focusMinutes: s.focusMinutes, breakMinutes: s.breakMinutes, cycle: s.cycle });
    if (s.focusSessions) Focus.loadSessions(s.focusSessions);
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
    Personality.setMusic(m && m.enabled && m.status === 'playing');
    refreshBubble(m);
    home.update({ music: m });
    music.update(m);
  });

  // ---------- personality: nap, dance, looks ----------
  // Nap and dance are toggled as classes (so the eyes close slowly); the time-of-day look rebuilds the eyes.
  function applyEyeClasses(wake) {
    const s = Personality.snapshot();
    const idle = eyeKey() === 'idle';
    const nap = idle && s.napping;
    eyesEl.classList.toggle('nap', nap);
    eyesEl.classList.toggle('dance', idle && s.dancing);
    let z = eyesEl.querySelector('.zzz');
    if (nap && !z) {
      z = document.createElement('span');
      z.className = 'zzz';
      z.innerHTML = '<i>z</i><i>z</i>';
      eyesEl.appendChild(z);
    }
    if (!nap && z) z.remove();
    if (wake) {
      eyesEl.classList.add('wake'); // wakes with a blink
      setTimeout(() => eyesEl.classList.remove('wake'), 700);
    }
  }

  let lastLook = 'day';
  let wasNapping = false;
  Personality.init({
    canNap: () => state === 'idle' && assistant.phase === 'idle' && !expanded && !hover && !timerOn,
    onChange: (snap) => {
      home.setLook(snap);
      music.setLook(snap);
      if (snap.look !== lastLook) {
        lastLook = snap.look;
        buildEyes();
      } else {
        applyEyeClasses(wasNapping && !snap.napping);
      }
      wasNapping = snap.napping;
    },
  });
  const poke = () => Personality.activity();
  Focus.onChange(poke);

  window.mochi.onBreak((info) => {
    poke();
    breakActive = true;
    brk.show(info);
    if (expanded) {
      showView();
      applyGeometry();
    } else expand();
  });
  window.mochi.onPersonality((kind) => Personality.preview(kind));
  window.mochi.onChat((ev) => {
    poke();
    chatView.handle(ev);
  });
  window.mochi.onWindowBlur(() => {
    notesView.commit();
    chatView.onWindowBlur();
    Typing.reset();
  });
  // A press that never reached the page but whose release did means the window's mouse input is broken (the press
  // went to whatever is behind the notch). Main rebuilds the window if it happens twice in a row.
  let pressSeen = false;
  document.addEventListener('pointerdown', () => (pressSeen = true), true);
  document.addEventListener('pointercancel', () => (pressSeen = false), true);
  document.addEventListener(
    'pointerup',
    () => {
      if (!pressSeen) window.mochi.pressDropped();
      pressSeen = false;
    },
    true
  );
  window.mochi.onNotesStatus((s) => notesView.setStatus(s));
  window.mochi.onNotes((d) => {
    notesView.update(d);
    home.update({ notes: d });
  });
  // ask for the notes at start-up (and again shortly after) rather than relying on a single push
  const pullNotes = () =>
    window.mochi.notesGet().then((d) => {
      if (!d) return;
      notesView.update(d);
      home.update({ notes: d });
    }).catch(() => {});
  pullNotes();
  setTimeout(pullNotes, 4000);

  content.style.visibility = 'hidden';
  applyGeometry();
  buildEyes();

  // The first time each panel is shown the browser has to lay it out, shape its text and rasterise it, which
  // can drop a frame or three mid-animation. Do that work once, invisibly, shortly after start-up: every panel is
  // drawn for two frames at ~0.4% opacity (below what a display can show) inside the otherwise empty window.
  function warmUp() {
    if (expanded) return;
    const keys = Object.keys(views);
    const widest = Math.max(...Object.values(theme.panels).map((p) => p.heightWithNav || p.height));
    notch.style.transition = 'none';
    notch.style.opacity = '0.004';
    notch.style.width = theme.expanded.width + 'px';
    notch.style.height = widest + 'px';
    content.style.visibility = 'visible';
    content.style.opacity = '1';
    let i = 0;
    const finish = () => {
      notch.style.transition = '';
      notch.style.opacity = '';
      content.style.opacity = '';
      if (expanded) return; // the notch was opened meanwhile: expand() has already set everything else
      content.style.visibility = 'hidden';
      showView();
      applyGeometry();
    };
    const step = () => {
      if (expanded || i >= keys.length) return finish();
      keys.forEach((k, n) => (views[k].el.style.display = n === i ? '' : 'none'));
      i++;
      requestAnimationFrame(() => requestAnimationFrame(step));
    };
    step();
  }
  setTimeout(warmUp, 300); // right at start-up, while nothing is moving yet
})();
