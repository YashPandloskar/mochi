const { EventEmitter } = require('events');
const { spawn } = require('child_process');
const path = require('path');
const theme = require('../theme');

// Tells when a program from theme.games is the active window (helpers/foreground.ps1).
// It only reads the active program's name. If the helper is not running the notch stays visible.
class GameMode extends EventEmitter {
  constructor({ enabled, helper }) {
    super();
    this.enabled = enabled;
    this.helper = helper || path.join(__dirname, '..', '..', 'helpers', 'foreground.ps1');
    this.games = new Set(theme.games.map((g) => g.toLowerCase()));
    this.exe = '';
    this.active = false;
    this.proc = null;
    this.stopping = false;
  }

  start() {
    if (!this.enabled || this.proc) return;
    this.stopping = false;
    const p = spawn('powershell.exe', ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', this.helper], {
      windowsHide: true,
      stdio: ['pipe', 'pipe', 'ignore'],
    });
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
      this.update('');
      if (!this.stopping && this.enabled) setTimeout(() => this.start(), 5000).unref?.();
    });
  }

  line(text) {
    try {
      this.update(String(JSON.parse(text).exe || ''));
    } catch {}
  }

  update(exe) {
    this.exe = exe;
    const active = this.enabled && this.games.has(exe.toLowerCase());
    if (active !== this.active) {
      this.active = active;
      this.emit('change', active);
    }
  }

  stop() {
    this.stopping = true;
    if (this.proc) {
      try {
        this.proc.stdin.end();
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
      this.update('');
    }
  }
}

module.exports = GameMode;
