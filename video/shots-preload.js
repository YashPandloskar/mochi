// Product shots: stands in for src/preload.js so the REAL Mochi interface (src/renderer/index.html) can be filmed
// state by state for the website. It gives the interface a fake `window.mochi`, plus window.__shots to feed it data.
const theme = require('../src/theme.js');
theme.sounds.volume = 0; // silent: these are pictures and clips for the web

const bus = {};
const on = (ch) => (cb) => (bus[ch] = bus[ch] || []).push(cb);
const emit = (ch, payload) => (bus[ch] || []).forEach((cb) => cb(payload));
window.__emit = emit;
const noop = () => {};

let notes = { todos: [{ text: 'Review the PR for checkout', done: false }, { text: 'Book dentist', done: true }], note: '' };

window.mochi = {
  theme,
  setHitSize: noop,
  onHover: on('hover'),
  onState: on('state'),
  onUsage: on('usage'),
  onMusic: on('music'),
  musicCommand: noop,
  onSettings: on('settings'),
  onChime: on('chime'),
  notesSave: (d) => { notes = { todos: d.todos.map((t) => ({ ...t })), note: d.note }; emit('notes', { ...notes, file: 'notes.md' }); },
  notesGet: () => Promise.resolve(notes),
  notesOpen: noop,
  onNotes: on('notes'),
  onNotesStatus: on('notesStatus'),
  chatSend: async () => {
    const REPLY = "That's a **null check** problem: `cart.items` is `undefined` on the first render, so `.reduce` throws.\n\nGuard it:\n\n```ts\nconst total = (cart?.items ?? []).reduce((s, i) => s + i.price, 0)\n```\n\nWant me to patch `checkout.ts` for you?";
    emit('chat', { type: 'start' });
    await new Promise((r) => setTimeout(r, 700));
    let acc = '';
    for (const c of REPLY.match(/.{1,7}/gs)) {
      acc += c;
      emit('chat', { type: 'delta', text: c });
      await new Promise((r) => setTimeout(r, 40));
    }
    emit('chat', { type: 'done', text: REPLY });
  },
  captureScreen: () => Promise.resolve({ error: 'no screen' }),
  chatProviders: () => Promise.resolve({ current: 'claude', encryption: true, providers: [{ id: 'claude', label: 'Claude', needsKey: false, hasKey: true, how: '' }] }),
  setChatProvider: () => Promise.resolve(true),
  setChatKey: () => Promise.resolve({ ok: true }),
  removeChatKey: () => Promise.resolve({ ok: true }),
  openKeyPage: noop,
  onChatProviders: on('chatProviders'),
  onAssistant: on('assistant'),
  pressDropped: noop,
  chatStop: noop,
  chatNew: noop,
  onChat: on('chat'),
  focusWindow: noop,
  onWindowBlur: on('windowBlur'),
  onBreak: on('break'),
  breakAnswer: noop,
  onPersonality: on('personality'),
  focusConfig: noop,
  focusSession: noop,
  focusPhase: noop,
  resolveApproval: noop,
  onSession: on('session'),
};

function art(c1, c2, c3) {
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
  g.beginPath();
  g.arc(190, 150, 86, 0, Math.PI * 2);
  g.fill();
  g.globalAlpha = 0.35;
  g.fillRect(0, 210, 320, 110);
  return c.toDataURL('image/jpeg', 0.92);
}

const sess = { state: 'idle', preview: false, project: 'webshop', startedAt: null, finishedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', needsText: '', approval: null, pendingCount: 0, jobsToday: 4 };
const DIFF = { file: 'checkout.ts', removed: ['const total = sum(items)'], added: ['const net = sum(items)', 'const total = net * (1 + VAT_RATE)'] };
const TRACK = { title: 'Golden Hour Drive', artist: 'Lumen Park', album: 'Soft Static', art: art('#ff9a62', '#8a2b6e', '#ffe29a'), duration: 214 };

window.__shots = {
  DIFF,
  // the same starting data the trailer uses
  init() {
    emit('settings', { personality: true, focusMinutes: 25, breakMinutes: 5, cycle: true, focusSessions: { date: new Date().toLocaleDateString('sv'), count: 2 }, motion: 'subtle' });
    emit('usage', { enabled: true, mode: 'bars', fiveHour: { pct: 41, resetsAt: Date.now() / 1000 + 7000 }, sevenDay: { pct: 18, resetsAt: Date.now() / 1000 + 300000 } });
    emit('notes', { ...notes, file: 'notes.md' });
    emit('music', { enabled: true, status: 'none' });
    this.session({}, 'idle');
  },
  session(patch, state) {
    Object.assign(sess, patch);
    if (state) sess.state = state;
    emit('session', { ...sess });
    emit('state', sess.state);
  },
  music(status = 'playing') {
    emit('music', { enabled: true, status, title: TRACK.title, artist: TRACK.artist, album: TRACK.album, art: TRACK.art, artKey: TRACK.title, position: 41, duration: TRACK.duration, at: Date.now() });
  },
  hover(v) { emit('hover', !!v); },
  chime(n) { emit('chime', n); },
  // click the visible nav button of a tab
  tab(id) {
    const b = [...document.querySelectorAll('.nav-item[data-tab="' + id + '"]')].find((x) => x.offsetParent);
    if (b) b.click();
    return !!b;
  },
  click(sel) {
    const b = [...document.querySelectorAll(sel)].find((x) => x.offsetParent);
    if (b) b.click();
    return !!b;
  },
};
