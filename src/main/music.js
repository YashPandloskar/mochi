const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const theme = require('../theme');

const COMMANDS = new Set(['playpause', 'next', 'prev']);

// Apple Music now-playing and controls, through helpers/media.ps1 (Windows media controls).
// The helper only looks at the Apple Music session. It streams JSON lines; mochi never starts specific tracks.
class Music extends EventEmitter {
  constructor({ enabled, helper }) {
    super();
    this.enabled = enabled;
    this.helper = helper || path.join(__dirname, '..', '..', 'helpers', 'media.ps1');
    this.current = { enabled, status: 'none' };
    this.proc = null;
    this.stopping = false;
    this.restartTimer = null;
  }

  start() {
    if (!this.enabled || this.proc) return;
    this.stopping = false;
    const p = spawn(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.helper, '-Match', theme.music.appMatch],
      { windowsHide: true, stdio: ['pipe', 'pipe', 'ignore'] }
    );
    this.proc = p;
    let buf = '';
    p.stdout.setEncoding('utf8');
    p.stdout.on('data', (d) => {
      buf += d;
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).trim();
        buf = buf.slice(i + 1);
        if (line) this.line(line);
      }
    });
    p.stdin.on('error', () => {});
    p.on('exit', () => {
      this.proc = null;
      this.set({ enabled: this.enabled, status: 'none' });
      if (!this.stopping && this.enabled) {
        this.restartTimer = setTimeout(() => this.start(), theme.music.restartSeconds * 1000);
      }
    });
  }

  line(text) {
    let m;
    try {
      m = JSON.parse(text);
    } catch {
      return;
    }
    if (m.status === 'none') return this.set({ enabled: true, status: 'none' });
    // The helper sends the artwork only when the track changes: keep the last one while the track is the same.
    const sameTrack = this.current.artKey === m.artKey;
    this.set({
      enabled: true,
      status: m.status,
      title: m.title || '',
      artist: m.artist || '',
      album: m.album || '',
      artKey: m.artKey,
      art: m.art !== undefined ? m.art : sameTrack ? this.current.art : null,
      position: m.position || 0,
      duration: m.duration || 0,
      at: m.at || Date.now(),
    });
  }

  set(next) {
    this.current = next;
    this.emit('change', next);
  }

  stop() {
    this.stopping = true;
    clearTimeout(this.restartTimer);
    if (this.proc) {
      try {
        this.proc.stdin.end(); // the helper quits when stdin closes
      } catch {}
      const p = this.proc;
      setTimeout(() => p.exitCode === null && p.kill(), 1500).unref?.();
    }
  }

  setEnabled(on) {
    this.enabled = on;
    if (on) this.start();
    else {
      this.stop();
      this.set({ enabled: false, status: 'none' });
    }
  }

  command(cmd) {
    if (!COMMANDS.has(cmd) || !this.proc) return;
    try {
      this.proc.stdin.write(cmd + '\n');
    } catch {}
  }

  // Opens Apple Music (or raises it if it is already running) so you can pick songs yourself.
  open() {
    try {
      const script = path.join(__dirname, '..', '..', 'helpers', 'open-music.ps1');
      // Not detached: a console program started without a console exits at once and never runs the script.
      spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', script, '-AppId', theme.music.appId], {
        stdio: 'ignore',
        windowsHide: true,
      }).unref();
    } catch {}
  }
}

module.exports = Music;
