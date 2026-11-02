// Checks a finished recording: size, duration, real frame rate, and stills at chosen times.
//   npx electron video\inspect.js [file.mp4] [--stills=5,20,40] [--outdir=dir]
const { app, BrowserWindow } = require('electron');
const fs = require('fs');
const path = require('path');
const file = path.resolve(process.argv.slice(2).find((a) => a.endsWith('.mp4')) || path.join(__dirname, 'out', 'mochi-launch-trailer.mp4'));
const stills = (process.argv.find((a) => a.startsWith('--stills=')) || '--stills=').slice(9).split(',').filter(Boolean).map(Number);
const outdir = (process.argv.find((a) => a.startsWith('--outdir=')) || '').slice(9) || path.join(__dirname, 'out');
app.whenReady().then(async () => {
  // shown beyond the screen edge: a hidden window decodes video to blank frames
  const win = new BrowserWindow({ x: -2100, y: 0, show: true, frame: false, width: 1920, height: 1080, webPreferences: { webSecurity: false, backgroundThrottling: false, autoplayPolicy: 'no-user-gesture-required' } });
  await win.loadURL('data:text/html,<body style="margin:0"><video id=v muted></video></body>');
  const res = await win.webContents.executeJavaScript(`new Promise(async (resolve) => {
    const v = document.getElementById('v'); v.src = ${JSON.stringify('file:///' + file.replace(/\\/g, '/'))};
    await new Promise((r, j) => { v.onloadedmetadata = r; v.onerror = () => j(v.error); });
    // MediaRecorder files often lack a duration: seek far to find it
    if (!isFinite(v.duration)) { v.currentTime = 1e9; await new Promise((r) => (v.onseeked = r)); }
    const out = { duration: v.duration, w: v.videoWidth, h: v.videoHeight, shots: {} };
    const c = document.createElement('canvas'); c.width = 1920; c.height = 1080; const g = c.getContext('2d');
    for (const t of ${JSON.stringify(stills)}) { v.currentTime = t; await new Promise((r) => (v.onseeked = r)); await new Promise((r) => setTimeout(r, 120)); g.drawImage(v, 0, 0, 1920, 1080); out.shots[t] = c.toDataURL('image/png'); }
    // real frame cadence over 6 seconds of playback from t=30
    v.currentTime = 30; await new Promise((r) => (v.onseeked = r)); v.muted = false; v.volume = 0.01;
    const ts = []; const stop = performance.now() + 6000;
    v.requestVideoFrameCallback(function cb(now, meta) { ts.push(meta.mediaTime); if (performance.now() < stop) v.requestVideoFrameCallback(cb); });
    await v.play(); await new Promise((r) => setTimeout(r, 6200)); v.pause();
    const d = ts.slice(1).map((x, i) => x - ts[i]).filter((x) => x > 0);
    out.audioDecodedBytes = v.webkitAudioDecodedByteCount; out.audioTracks = v.audioTracks ? v.audioTracks.length : 'n/a';
    out.frames = ts.length; out.avgFrameMs = d.reduce((a, b) => a + b, 0) / d.length * 1000; out.maxGapMs = Math.max(...d) * 1000; out.gapsOver25 = d.filter((x) => x > 0.025).length;
    resolve(out);
  })`);
  for (const [t, url] of Object.entries(res.shots)) fs.writeFileSync(path.join(outdir, `still-${String(t).padStart(3, '0')}.png`), Buffer.from(url.split(',')[1], 'base64'));
  delete res.shots;
  res.fileMB = +(fs.statSync(file).size / 1048576).toFixed(1);
  fs.writeFileSync(path.join(outdir, 'inspect.json'), JSON.stringify(res, null, 1));
  app.quit();
});
