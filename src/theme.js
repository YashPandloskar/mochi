// mochi theme: every colour, size, radius, timing and the motion setting lives here.
// Loaded by the main process and sent to the renderer over IPC.

const theme = {
  // "subtle" (default) or "lively"
  motion: 'subtle',

  // Notch and panels are flat dark shapes. Set true to add a soft glow around them.
  notchGlow: false,

  colors: {
    text: '#f4f1ec',
    muted: '#9d968a',
  },

  // Fixed transparent window the notch animates inside (extra room for spring overshoot).
  window: { width: 600, height: 400 }, // tall enough for the Chat panel plus spring overshoot

  collapsed: {
    width: 120,
    timerWidth: 196, // the collapsed notch widens to this while the Focus timer runs (ring, eyes, time)
    height: 30,
    radius: [0, 0, 14, 14],
    background: '#0b0b0b',
  },

  // Small extras that sit with the collapsed notch while something is going on.
  companions: {
    timer: { ring: '#b56cf0', text: '#c9a7ff', breakRing: '#6fe3a8', breakText: '#a9f5cd', ringSize: 15, ringStroke: 2.2, fontSize: 11 },
    // round album-art bubble beside the notch while Apple Music is playing or paused
    music: { width: 34, height: 30, radius: [0, 0, 15, 15], gap: 6, art: 22, background: '#0b0b0b', pausedOpacity: 0.5 },
  },

  expanded: {
    width: 520,
    radius: [0, 0, 28, 28],
  },

  // The bottom nav bar switches between these views. Needs-you never has it (it must stay focused on the question).
  nav: {
    tabs: [
      { id: 'home', label: 'Home', icon: 'home' },
      { id: 'claude', label: 'Claude', icon: 'sparkle' },
      { id: 'music', label: 'Music', icon: 'music' },
      { id: 'focus', label: 'Focus', icon: 'timer' },
      { id: 'notes', label: 'Notes', icon: 'checklist' },
      { id: 'chat', label: 'Chat', icon: 'chat' },
    ],
    // Show the nav bar under the Working and Done panels too (they then use heightWithNav).
    onPanels: true,
  },

  // Expanded panel heights and vertical gradients (top to bottom).
  // heightWithNav is used when nav.onPanels is true.
  panels: {
    home: { height: 266, from: '#040404', to: '#17140f' }, // tiles, notes strip, nav
    notes: { height: 300, from: '#07070a', to: '#211b0b' },
    working: { height: 200, heightWithNav: 240, from: '#0b0604', to: '#4a2410' },
    claudeIdle: { height: 200, heightWithNav: 240, from: '#0b0604', to: '#4a2410' },
    music: { height: 232, from: '#040404', to: '#4a1824' }, // `to` is replaced by the album colour when there is art
    focus: { height: 250, from: '#07040f', to: '#3b1d6e' },
    focusBreak: { from: '#04100a', to: '#14573a' }, // the Focus tab while on a break (same height as focus)
    chat: { height: 340, from: '#060606', to: '#1d1309' },
    needs: { height: 176, from: '#0b0803', to: '#4a3309' },
    break: { height: 184, from: '#04100d', to: '#14503f' },
    done: {
      height: 214,
      heightWithNav: 252,
      from: '#040916',
      to: '#1b4fc4',
      // crossfades to this on hover or after doneTurnGreenAfter seconds
      fromAlt: '#030d07',
      toAlt: '#1d7040',
    },
  },

  timings: {
    resize: 0.55, // width, height, radius
    easing: 'cubic-bezier(.34,1.4,.5,1)',
    fade: 0.2, // panel content fade out/in around the resize
    collapseDelay: 0.3, // pointer must stay away this long before collapsing
    doneTurnGreenAfter: 4.5,
    doneCrossfade: 0.8,
    hoverPollMs: 50,
    assistantErrorSeconds: 8, // a chat error stays on the notch this long
    typingReleaseSeconds: 4, // pointer away and nothing typed for this long: a focused text box is let go so the notch can close
    hitHoldMs: 2500, // after switching to a shorter panel the old, taller area still counts as "on the notch"
    hoverDwell: 0.3, // the pointer must rest on the collapsed notch this long before it expands
    doneToIdleSeconds: 9, // "Done" holds this long (blue, then green) before the session returns to idle
    staleWorkingSeconds: 300, // no events for this long while working: fall back to idle
    approvalTimeoutSeconds: 100, // then Claude Code's normal prompt takes over
  },

  // Hook side: tool names -> progress step. Step 4 (Done) comes from the Stop event.
  steps: {
    read: ['Read', 'Grep', 'Glob'],
    edit: ['Edit', 'Write', 'MultiEdit', 'NotebookEdit'],
    // a Bash command matching this counts as running tests
    testCommand: '\\b(npm|pnpm|yarn|bun)\\s+(run\\s+)?t(est)?\\b|\\b(jest|vitest|pytest|mocha|phpunit|rspec|ctest)\\b|\\b(go|cargo|dotnet|gradle|mvn)\\s+test\\b',
  },

  // Expanded Home panel.
  home: {
    padding: 16,
    labelColor: 'rgba(244, 241, 236, 0.72)',
    tile: { height: 114, radius: 18, padding: 12, gap: 10, topColor: '#0a0a0a' },
    tileColors: { claude: '#e0793a', music: '#e23a50', focus: '#8f4fe0' },
    rise: { ms: 600, easing: 'cubic-bezier(.34,1.56,.64,1)', delaysMs: [0, 80, 160] }, // staggered spring
    sparkleSpinSeconds: 8,
    playBreatheSeconds: 2,
    equaliserSeconds: [0.9, 1.1, 0.7],
    focusMinutes: 25, // default; change it in the Focus tab (remembered) or here
    // Pomodoro: focus, then a break, then focus again, until you reset (switch off with "Cycle" for a single timer)
    breakMinutes: 5,
    breakStepMinutes: 1,
    breakMinMinutes: 1,
    breakMaxMinutes: 30,
    cycle: true,
    breakTileColor: '#2fa36b', // the Focus tile turns green during a break
    focusStepMinutes: 5, // the Focus tab's - and + buttons
    focusMinMinutes: 5,
    focusMaxMinutes: 120,
    nav: { height: 30, background: 'rgba(255, 255, 255, 0.07)', activeBackground: 'rgba(255, 255, 255, 0.12)', icon: 'rgba(244, 241, 236, 0.55)' },
  },

  // Working and Done panels.
  working: {
    labels: ['Read', 'Edit', 'Test', 'Done'],
    stepText: ['Reading files', 'Reading files', 'Making changes', 'Running tests', 'Wrapping up'],
    cardWidth: 200,
    barHeight: 4,
    barGap: 6,
    barTrack: 'rgba(244, 241, 236, 0.16)',
    barFill: '#f4f1ec',
    barSeconds: 0.7, // smooth width transitions
    skeletonSeconds: 2.4, // skeleton lines and "Running..." pulse
    typeMsPerChar: 32,
    cardBackground: 'rgba(255, 255, 255, 0.06)',
    cardBorder: 'rgba(255, 255, 255, 0.1)',
    removed: { background: 'rgba(255, 96, 96, 0.18)', color: '#ff9d9d' },
    added: { background: 'rgba(80, 220, 120, 0.16)', color: '#8df0a8' },
    passed: '#8df0a8',
  },
  done: {
    confettiPieces: 12,
    confettiColors: ['#ffd07a', '#7dffa8', '#ff9a5c', '#8fb8ff', '#ff7a9c', '#f4f1ec'],
    jumps: 3,
    jumpPx: 14,
    jumpSeconds: 1.5,
    sweepStaggerSeconds: 0.15,
    bubbleBackground: 'rgba(255, 255, 255, 0.12)',
    bubbleChars: 170,
    turnGreenAfterSeconds: 4.5,
  },

  // Mochi's personality (tray: "Mochi personality"). All of it is optional charm.
  personality: {
    napMinutes: 10, // idle this long (nothing happening, not hovered) and his eyes slowly close
    nap: { closeSeconds: 2.4, zSeconds: 3.2 },
    // break reminder after this much continuous work (a gap of breakGapMinutes without any Claude activity ends it)
    breakMinutes: 50,
    breakGapMinutes: 5,
    breakSnoozeMinutes: 10,
    eyeRestSeconds: 20, // the 20-20-20 rule: every 20 minutes look 20 feet away for 20 seconds
    // hours are local time; "from" to "to" may wrap past midnight
    night: { from: 23, to: 5, eyeScale: 0.68, blinkSeconds: 6.5 }, // sleepy, droopy eyes
    morning: { from: 6, to: 10, eyeScale: 1.12, pulseScale: 0.7 }, // wider, brighter, livelier
    dance: { seconds: 1.3, swayPx: 3, tiltDeg: 3.5, headerTiltDeg: 9, headerBobPx: 1.5 },
    // a small celebration when "jobs today" reaches one of these
    milestones: [5, 10, 15, 20, 30, 40, 50],
    milestoneConfettiPieces: 26,
  },

  // Game mode: while one of these programs is the active window the notch is hidden completely
  // (no eyes, no hover, no panels, no sounds or toasts). Add games by their .exe name.
  games: ['VALORANT-Win64-Shipping.exe', 'dota2.exe'],

  // Soft chime for Done / Needs you / Focus finished. Generated in code, no audio files.
  sounds: {
    volume: 0.16,
    notes: {
      // f = frequency Hz, at = start offset s, len = length s
      done: [{ f: 659.25, at: 0, len: 0.55 }, { f: 987.77, at: 0.14, len: 0.8 }],
      needs: [{ f: 783.99, at: 0, len: 0.4 }, { f: 783.99, at: 0.22, len: 0.55 }],
      break: [{ f: 659.25, at: 0, len: 0.5 }, { f: 523.25, at: 0.2, len: 0.9 }],
      // Pomodoro: a falling phrase when a break starts, a rising one when it is time to focus again
      pomoBreak: [{ f: 783.99, at: 0, len: 0.5 }, { f: 587.33, at: 0.18, len: 0.5 }, { f: 440, at: 0.36, len: 0.9 }],
      pomoFocus: [{ f: 440, at: 0, len: 0.5 }, { f: 587.33, at: 0.18, len: 0.5 }, { f: 783.99, at: 0.36, len: 0.9 }],
      focus: [{ f: 523.25, at: 0, len: 0.5 }, { f: 659.25, at: 0.15, len: 0.5 }, { f: 783.99, at: 0.3, len: 0.5 }, { f: 1046.5, at: 0.45, len: 0.9 }],
    },
  },

  // Extras added by the "lively" motion setting (the default "subtle" adds none of them).
  lively: {
    workingEyes: { driftPx: 7, driftSeconds: 2.6, sweepSeconds: 2.2 }, // scanning eyes + a thin sweep line
    typingDotsSeconds: 1.2,
    leanScale: 1.05, // Mochi leans in towards the laptop
    leanSeconds: 3.2,
  },

  // Music module: Apple Music desktop app only. Every other media session is ignored.
  music: {
    appMatch: 'AppleMusic', // matched against each media session's app id
    appId: 'AppleInc.AppleMusicWin_nzyj5cx40ttqa!App', // used by "Open Apple Music"
    restartSeconds: 5, // helper restart delay if it dies
  },

  // Notes tab and the strip on Home: to-do and a quick note, kept in a Markdown file you can also edit yourself.
  notes: {
    stripHeight: 34,
    accent: '#ffd07a',
    saveDelayMs: 400, // the note is saved this long after you stop typing
    placeholderTask: 'Add a task…',
    placeholderNote: 'Jot something down…',
  },

  // Chat tab: day-to-day questions to Claude, through your own Claude Code login (no API key).
  chat: {
    maxChars: 20000, // longest message you can send
    maxImageBytes: 8_000_000, // largest picture (base64 characters) that can be attached
    screenPrompt: 'Explain what is on my screen.', // used when you attach a screenshot and type nothing
    reopenMinutes: 10, // the notch reopens on Chat if you chatted this recently
    thinkingTimeoutSeconds: 120, // no output for this long and the request is stopped
    userBubble: 'rgba(224, 121, 58, 0.22)',
    assistantText: '#f4f1ec',
    codeBackground: 'rgba(0, 0, 0, 0.38)',
    inputBackground: 'rgba(255, 255, 255, 0.08)',
    accent: '#e0793a',
    systemPrompt:
      'You are Claude, chatting with the user through a small panel on their desktop. Keep answers short and easy to scan unless they ask for depth. For plans, use short numbered steps. You cannot use tools or access files here.',
    // chips under the empty chat: they fill the input so you can finish the sentence
    suggestions: [
      { label: 'Plan my day', text: 'Help me plan my day. Here is what I need to do: ' },
      { label: 'Explain something simply', text: 'Explain this to me simply: ' },
      { label: 'Help me write a message', text: 'Help me write a message to ' },
      { label: 'Explain my screen', text: 'Explain what is on my screen.', screen: true }, // also attaches a screenshot
    ],
  },

  // Break reminder panel.
  breakPanel: {
    chipColor: '#9be8c4',
    chipBackground: 'rgba(155, 232, 196, 0.16)',
    buttonBackground: '#9be8c4',
    buttonColor: '#08241a',
    ring: '#9be8c4',
  },

  // Needs-approval panel.
  needs: {
    chipBackground: 'rgba(255, 208, 122, 0.16)',
    chipColor: '#ffd07a',
    chipPulseSeconds: 1.2,
    boxBackground: 'rgba(0, 0, 0, 0.38)',
    boxBorder: 'rgba(255, 208, 122, 0.18)',
    allowBackground: '#ffd07a',
    allowColor: '#2a1d05',
    allowBreatheSeconds: 2.4, // gentle
    denyBackground: 'rgba(255, 255, 255, 0.1)',
    wobbleDeg: 7,
    wobbleSeconds: 1.6,
    questionSeconds: 2.2,
    commandChars: 400,
  },

  // Mochi at a laptop (viewBox 96x88). Mochi himself is the unchanged component; this only places and tints him.
  laptop: {
    mochiTransform: 'translate(13.2 2) scale(1.45)',
    lid: '#d8d5ce',
    lidStroke: '#b9b5ab',
    logo: '#e0793a',
    leak: '#cfe9ff',
    base: '#bcb8ae',
    tint: '#bfe4ff',
    tintOpacity: [0.5, 0.62],
    tintSeconds: 4,
    reflection: '#d6ecff',
    driftPx: 1.2,
    driftSeconds: 5,
    breatheScale: 1.012,
    breatheSeconds: 6,
  },

  // Claude tile usage footer. Bars come from the status line; the fallback scans local logs.
  usage: {
    barHeight: 3,
    track: 'rgba(244, 241, 236, 0.16)',
    colors: { normal: '#f4f1ec', warn: '#ffd07a', danger: '#ff7a6b' },
    warnAt: 75, // from here the bar turns amber and the status line becomes a reset countdown
    dangerAt: 90,
    scanThrottleSeconds: 30,
    // fallback cost estimate, USD per million tokens. Estimates, edit to match your pricing.
    // Cache writes are 1.25x (5 min) or 2x (1 h) of input, cache reads 0.1x.
    prices: [
      { match: 'opus', input: 5, output: 25 },
      { match: 'fable', input: 5, output: 25 },
      { match: 'sonnet', input: 3, output: 15 },
      { match: 'haiku', input: 1, output: 5 },
    ],
    defaultPrice: { input: 3, output: 15 },
  },

  // The Mochi character (src/renderer/components/mochi.js). Every screen uses the same drawing.
  mochi: {
    body: '#fffaf2',
    bodyStroke: '#e5dccb',
    bodyStrokeWidth: 1.5,
    cheek: '#f6b3ae',
    cheekOpacity: 0.8,
    ink: '#2b2824',
    highlight: '#ffffff',
    gold: '#f5c542',
    strokeWidth: 2,
    blinkSeconds: 4, // eyes close for a moment every ~4s
    blinkClosed: 0.1, // scaleY while blinking
    sparkleSeconds: 1.8,
    squish: { x: 1.15, y: 0.85, ms: 380, easing: 'cubic-bezier(.34,1.5,.5,1)' }, // on entering a mood
    dizzy: { clicks: 4, windowMs: 1500, durationMs: 2000, shakeDeg: 7, shakeMs: 240 },
    // which mood each notch state uses where a single Mochi is shown
    moodByState: { idle: 'wink', working: 'focus', needs: 'curious', done: 'happy' },
  },

  // Collapsed-state eyes. Colour and shape follow the state.
  eyes: {
    gap: 16,
    glow: { near: [0, 4], far: [0, 10], nearPulse: [0, 7], farPulse: [0, 22] }, // [x, blur] pairs
    idle: { color: '#ffd9c9', width: 9, height: 13, blink: 4, pulse: 2.4 },
    working: { color: '#ff9a5c', width: 12, height: 7, blink: 5, pulse: 3.6, driftPx: 3, driftSeconds: 5 },
    needs: { color: '#ffd07a', width: 9, height: 17, pulse: 1, hopPx: 4, hopSeconds: 1.8 },
    done: { color: '#7dffa8', width: 13, height: 7, arcBorder: 3, bobPx: 2, bobSeconds: 2.2, sparks: 8, sparkRadius: 15 },
  },
};

module.exports = theme;
