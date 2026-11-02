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
  window: { width: 600, height: 280 },

  collapsed: {
    width: 120,
    height: 30,
    radius: [0, 0, 14, 14],
    background: '#0b0b0b',
  },

  expanded: {
    width: 520,
    radius: [0, 0, 28, 28],
  },

  // Which panel each notch state expands to.
  panelForState: { idle: 'home', working: 'working', needs: 'needs', done: 'done' },

  // Expanded panel heights and vertical gradients (top to bottom).
  panels: {
    home: { height: 222, from: '#040404', to: '#17140f' },
    working: { height: 200, from: '#0b0604', to: '#4a2410' },
    needs: { height: 176, from: '#0b0803', to: '#4a3309' },
    done: {
      height: 214,
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
    focusMinutes: 25,
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
