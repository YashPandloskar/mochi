// Films the REAL Mochi interface, state by state, for the website.
//   set FFMPEG=C:\path\to\ffmpeg.exe
//   electron video\shots.js [--only=tour,stills,eyes-idle,eyes-working]   -> video\out\shots\*.mp4, *.png, tour.json
// Nothing is faked: src/renderer/index.html runs unchanged, fed the same kind of events Claude Code sends.
// It renders off-screen (no window appears) at a zoom, so UI text stays sharp.
const { app, BrowserWindow } = require('electron');
const { spawn } = require('child_process');
const fs = require('fs');
const path = require('path');

app.commandLine.appendSwitch('force-device-scale-factor', '1'); // one CSS pixel = one device pixel before the zoom
app.commandLine.appendSwitch('disable-renderer-backgrounding');
const ffmpeg = process.env.FFMPEG || 'ffmpeg';
const outDir = path.join(__dirname, 'out', 'shots');
fs.mkdirSync(outDir, { recursive: true });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const only = process.argv.find((a) => a.startsWith('--only='));
const wanted = only ? only.slice(7).split(',') : null;

// a quiet desktop behind the notch, like the film's
const BACKDROP = `
  html { background: linear-gradient(160deg, #0a0b18 0%, #130c24 55%, #0b0814 100%) !important; }
  body { background: transparent !important; }
  body::before { content: ''; position: fixed; left: -80px; top: 40px; width: 420px; height: 320px; border-radius: 50%; background: #4b3dff; filter: blur(80px); opacity: .5; z-index: -1; }
  body::after { content: ''; position: fixed; right: -100px; top: 120px; width: 380px; height: 300px; border-radius: 50%; background: #ff4f9a; filter: blur(80px); opacity: .3; z-index: -1; }
`;

async function film(sc) {
  const Z = sc.zoom;
  // the window is just the crop (a window cannot exceed the screen); the notch is centred, so a centred crop keeps its layout
  const W = Math.round(sc.crop[2] * Z);
  const H = Math.round(sc.crop[3] * Z);
  const win = new BrowserWindow({
    x: -(W + 300), y: 0, width: W, height: H, useContentSize: true, show: false, frame: false, resizable: false,
    transparent: !!sc.transparent, backgroundColor: sc.transparent ? '#00000000' : '#0a0b18',
    webPreferences: { preload: path.join(__dirname, 'shots-preload.js'), contextIsolation: false, sandbox: false, nodeIntegration: false, backgroundThrottling: false, offscreen: true },
  });
  win.showInactive();
  win.webContents.setFrameRate(30);
  win.webContents.setZoomFactor(Z);
  const X = (code) => win.webContents.executeJavaScript(code);
  const S = (call) => X('window.__shots.' + call);
  let last = null;
  let rec = null;
  let t0 = 0;
  const marks = {};
  const mark = (n) => { marks[n] = +((Date.now() - (t0 || Date.now())) / 1000).toFixed(2); };
  win.webContents.on('paint', (_e, _d, image) => {
    last = image;
    if (rec) {
      if (!t0) t0 = Date.now();
      rec.write(image.toBitmap());
    }
  });
  win.webContents.on('console-message', (e) => { if (/error/i.test(e.level || '')) console.log('page:', e.message); });
  for (let k = 0; ; k++) {
    try { await win.loadFile(path.join(__dirname, '..', 'src', 'renderer', 'index.html')); break; } catch (e) { if (k >= 3) throw e; await sleep(700); }
  }
  win.webContents.setZoomFactor(Z); // after the load, so it sticks
  await win.webContents.insertCSS(sc.transparent ? 'html, body { background: transparent !important; }' : BACKDROP);
  await sleep(900);
  console.log(sc.name, 'frame', last && JSON.stringify(last.getSize()), 'zoom', win.webContents.getZoomFactor());
  await S('init()');
  await sleep(500);

  let ff = null;
  if (sc.video) {
    const file = path.join(outDir, sc.name + '.mp4');
    ff = spawn(ffmpeg, ['-y', '-loglevel', 'error', '-f', 'rawvideo', '-pix_fmt', 'bgra', '-video_size', `${W}x${H}`, '-use_wallclock_as_timestamps', '1', '-i', '-',
      '-vf', `scale=${sc.outW}:-2:flags=lanczos,fps=30`, '-c:v', 'libx264', '-preset', 'slow', '-crf', '21', '-pix_fmt', 'yuv420p', '-movflags', '+faststart', file], { stdio: ['pipe', 'inherit', 'inherit'] });
    rec = ff.stdin;
  }
  const still = (name, crop) => {
    if (!last) return;
    const c = crop || sc.crop;
    const x = Math.round((c[0] - sc.crop[0]) * Z);
    const y = Math.round((c[1] - sc.crop[1]) * Z);
    const w = Math.min(W - x, Math.round(c[2] * Z));
    const h = Math.min(H - y, Math.round(c[3] * Z));
    fs.writeFileSync(path.join(outDir, name + '.png'), last.crop({ x, y, width: w, height: h }).toPNG());
  };
  await sc.run({ S, X, sleep, still, mark });
  if (sc.video) fs.writeFileSync(path.join(outDir, sc.name + '.json'), JSON.stringify(marks, null, 1));
  if (rec) {
    await sleep(300);
    rec.end();
    await new Promise((r) => ff.on('close', r));
  }
  win.destroy();
  console.log('filmed', sc.name);
}

const now = 'Date.now()';
const working = (step) => `session({ state: 'working', startedAt: ${now}, finishedAt: null, step: ${step}, diff: null, testCommand: '', testResult: '', lastMessage: '', jobsToday: 4 }, 'working')`;
const needs = "session({ approval: { id: 1, requestedAt: Date.now(), toolName: 'Bash', command: 'npm test', diff: null }, needsText: 'npm test', pendingCount: 1 }, 'needs')";
const allowed = (extra = '') => `session({ approval: null, needsText: '', pendingCount: 0, step: 3, testCommand: 'npm test'${extra} }, 'working')`;
const done = "session({ state: 'done', step: 4, finishedAt: Date.now(), testResult: '48 passed', lastMessage: 'Done! VAT is now added at checkout. All 48 tests pass.', jobsToday: 5 }, 'done')";
const edit = 'session({ step: 2, diff: window.__shots.DIFF }, "working")';
const typeChat = `(() => { const ta = [...document.querySelectorAll('[data-r=ta]')].find((x) => x.offsetParent); ta.value = 'Why does checkout.ts throw on the first render?'; ta.dispatchEvent(new Event('input', { bubbles: true })); })()`;

const SC = [
  // The whole story in one take: eyes, Home, Claude working, an approval, done, back to sleep. marks = seconds into the clip.
  {
    name: 'tour', zoom: 3, crop: [40, 0, 520, 290], outW: 1300, video: true,
    async run({ S, sleep, mark }) {
      await S("music('playing')"); // the little album-art bubble sits beside the notch
      mark('idle'); await sleep(2600);
      mark('home'); await S('hover(true)'); await sleep(3600);
      await S('hover(false)'); await sleep(1500);
      mark('working-eyes'); await S(working(0)); await sleep(3200);
      mark('working'); await S('hover(true)'); await S("session({ step: 1 }, 'working')"); await sleep(2600);
      await S(edit); await sleep(2800);
      mark('needs'); await S(needs); await S("chime('needs')"); await sleep(3400);
      await S("click('.btn.allow')"); await S(allowed()); await sleep(2600);
      await S("session({ step: 3, testResult: '48 passed' }, 'working')"); await sleep(2600);
      mark('done'); await S(done); await sleep(7200);
      mark('end'); await S("session({}, 'idle')"); await S('hover(false)'); await sleep(2200);
    },
  },
  // Close-ups of the eyes on the collapsed notch.
  { name: 'eyes-idle', zoom: 5, crop: [180, 0, 240, 96], outW: 1200, video: true, async run({ sleep }) { await sleep(6500); } },
  { name: 'eyes-working', zoom: 5, crop: [180, 0, 240, 96], outW: 1200, video: true, async run({ S, sleep }) { await S(working(0)); await sleep(6500); } },
  // Every panel as a transparent still (they sit on the website's own backgrounds).
  {
    name: 'stills', zoom: 3, crop: [40, 0, 520, 350], outW: 1300, video: false, transparent: true,
    async run({ S, X, sleep, still }) {
      await S("music('playing')"); await sleep(1500);
      await S('hover(true)'); await sleep(2200); still('home', [40, 0, 520, 270]);
      await S("click('[data-r=focus]')"); await sleep(1200);
      await S("tab('music')"); await sleep(2000); still('music', [40, 0, 520, 236]);
      await S("tab('focus')"); await sleep(2000); still('focus', [40, 0, 520, 254]);
      await S("tab('notes')"); await sleep(1800); still('notes', [40, 0, 520, 304]);
      await S("tab('chat')"); await sleep(1800); still('chat-empty', [40, 0, 520, 344]);
      await X(typeChat); await S("click('[data-r=send]')"); await sleep(5200); still('chat', [40, 0, 520, 344]);
      await S("tab('claude')"); await sleep(1800); still('claude-idle', [40, 0, 520, 244]);
      await S(working(1)); await sleep(2200); still('working-0', [40, 0, 520, 244]);
      await S(edit); await sleep(2500); still('working-1', [40, 0, 520, 244]);
      await S(needs); await sleep(3000); still('needs', [40, 0, 520, 180]);
      await S("click('.btn.allow')"); await S(allowed(", testResult: '48 passed'")); await sleep(2500); still('working-3', [40, 0, 520, 244]);
      await S(done); await sleep(2800); still('done-blue', [40, 0, 520, 256]);
      await sleep(3200); still('done-green', [40, 0, 520, 256]);
    },
  },
];

app.on('window-all-closed', () => {}); // keep going between scenes
app.whenReady().then(async () => {
  for (const sc of SC) {
    if (wanted && !wanted.includes(sc.name)) continue;
    try { await film(sc); } catch (e) { console.log('FAILED', sc.name, e.message); }
  }
  app.quit();
});
