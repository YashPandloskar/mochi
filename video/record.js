// Records the Mochi launch trailer.   npx electron video\record.js            -> video\out\mochi-launch-trailer.mp4
//                                    npx electron video\record.js --preview  -> plays it without recording
// Quit Mochi first (tray -> Quit): the trailer runs its own copy of the interface on a fake desktop and does not
// touch your real Mochi, your notes or your settings. Only this window is captured, never the rest of your screen.
const { app, BrowserWindow, ipcMain, session, desktopCapturer } = require('electron');
const fs = require('fs');
const path = require('path');

const preview = process.argv.includes('--preview');
const shotsArg = process.argv.find((a) => a.startsWith('--shots='));
const shots = shotsArg ? shotsArg.slice(8).split(',').map(Number) : [];
const outDir = path.join(__dirname, 'out');
const outFile = path.join(outDir, 'mochi-launch-trailer.mp4');
const shotDir = process.env.TRAILER_SHOTS || outDir;
const logFile = path.join(outDir, 'record.log');

app.commandLine.appendSwitch('autoplay-policy', 'no-user-gesture-required');
// Supersampling: the page is drawn at SS times the pixel density (1 CSS px = SS real pixels) and every frame is then
// reduced to exactly 1920x1080 with a high-quality filter. Edges, text and close-ups come out crisp, never pixelated.
// A render uses 2x unless told otherwise (--ss=1 to turn it off, --ss=3 for more).
const ssArg = process.argv.find((a) => a.startsWith('--ss='));
const SS = ssArg ? Number(ssArg.slice(5)) : process.argv.includes('--render') ? 2 : 1;
// A window cannot be larger than the screen, so supersampling uses an off-screen-rendered page (no window at all) that
// is SS times larger than the film and zoomed by SS: the layout stays 1920x1080 CSS px, drawn with SS times the pixels.
app.commandLine.appendSwitch('force-device-scale-factor', '1');
app.commandLine.appendSwitch('disable-renderer-backgrounding');
app.commandLine.appendSwitch('disable-background-timer-throttling');

fs.mkdirSync(outDir, { recursive: true });
let stream = null;
let win = null;
const log = (m) => fs.appendFileSync(logFile, `${new Date().toISOString().slice(11, 23)} ${m}\n`);

const render = process.argv.includes('--render');
ipcMain.on('rec:options', (e) => (e.returnValue = { preview, render, quick: process.argv.includes('--quick') }));
const grabImage = async () => {
  const img = await win.webContents.capturePage();
  return SS > 1 ? img.resize({ width: 1920, height: 1080, quality: 'best' }) : img;
};
ipcMain.handle('rec:grab', async () => (await grabImage()).toBitmap());
const stopArg = process.argv.find((a) => a.startsWith('--stop='));
ipcMain.on('rec:log', (_e, m) => log(m));
ipcMain.on('rec:chunk', (_e, u8) => stream && stream.write(Buffer.from(u8)));
ipcMain.on('rec:started', () => {
  log('timeline started');
  const t0 = Date.now();
  if (stopArg) setTimeout(() => app.quit(), Number(stopArg.slice(7)) * 1000); // rehearsal only: stop early
  for (const s of shots) {
    setTimeout(async () => {
      try {
        const img = await grabImage();
        fs.writeFileSync(path.join(shotDir, `shot-${String(s).padStart(3, '0')}.png`), img.toPNG());
      } catch (e) {
        log('shot failed ' + e.message);
      }
    }, Math.max(0, s * 1000 - (Date.now() - t0)));
  }
});
ipcMain.on('rec:finish', () => {
  log('finished');
  const done = () => app.quit();
  if (stream) stream.end(done);
  else done();
});

app.whenReady().then(async () => {
  // rehearsal and --render play beyond the screen edge, out of your way (frames are read from the page itself)
  const offscreen = process.argv.includes('--offscreen') || render;
  win = new BrowserWindow({
    x: offscreen ? -(1920 * SS + 300) : 0,
    y: 0,
    width: 1920 * SS,
    height: 1080 * SS,
    useContentSize: true,
    frame: false,
    resizable: false,
    hasShadow: false,
    backgroundColor: '#000000',
    alwaysOnTop: true,
    skipTaskbar: true,
    title: 'MOCHI-TRAILER-STAGE',
    show: false,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: false,
      sandbox: false,
      nodeIntegration: false,
      backgroundThrottling: false,
      autoplayPolicy: 'no-user-gesture-required',
      offscreen: SS > 1,
    },
  });
  if (SS > 1) {
    win.webContents.setFrameRate(60);
    win.webContents.setZoomFactor(SS);
  }
  win.setAlwaysOnTop(true, 'screen-saver');
  if (!preview) stream = fs.createWriteStream(outFile);
  if (render) win.setAlwaysOnTop(false);

  // getDisplayMedia hands back only this window, never the screen
  session.defaultSession.setDisplayMediaRequestHandler(async (_req, cb) => {
    const sources = await desktopCapturer.getSources({ types: ['window', 'screen'], thumbnailSize: { width: 0, height: 0 } });
    const id = win.getMediaSourceId();
    log(`capture: want ${id}; sources: ${sources.map((s) => s.id + '=' + s.name).join(' | ')}`);
    // the stage window if the system lists it; otherwise the primary screen, which it covers completely
    const mine = sources.find((s) => s.id === id) || sources.find((s) => s.id.startsWith('screen:'));
    if (mine) cb({ video: mine });
    else cb(null);
  }, { useSystemPicker: false });

  win.webContents.on('console-message', (e) => log('console: ' + (e.message || '')));
  win.webContents.on('render-process-gone', (_e, d) => log('renderer gone ' + d.reason));
  await win.loadFile(path.join(__dirname, 'stage.html'));
  win.show();
  log('stage ready, bounds ' + JSON.stringify(win.getContentBounds()));
});
