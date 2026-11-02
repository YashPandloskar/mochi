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
