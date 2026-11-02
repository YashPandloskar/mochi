const { EventEmitter } = require('events');
const fs = require('fs');
const os = require('os');
const path = require('path');
const theme = require('../theme');
const { Scanner } = require('./usage-scan');

// Usage for the Claude tile.
//  - bars:     rate_limits written by hooks/statusline.js into usage.json (official plan usage)
//  - fallback: today's tokens/cost from the local logs, labelled approximate, no bars
//  - off:      the "Show usage on Claude tile" setting is off
class Usage extends EventEmitter {
  // projectsDir / claudeJson are overridable for tests
  constructor({ dir, enabled, projectsDir, claudeJson }) {
    super();
    this.file = path.join(dir, 'usage.json');
    this.dir = dir;
    this.enabled = enabled;
    this.claudeJson = claudeJson || path.join(os.homedir(), '.claude.json');
    this.scanner = new Scanner(projectsDir);
    this.lastScan = 0;
    this.scanResult = null;
    this.last = '';
    this.timers = [];
  }

  start() {
    try {
      fs.mkdirSync(this.dir, { recursive: true });
      this.watcher = fs.watch(this.dir, (_e, name) => name === 'usage.json' && this.later(300));
      this.watcher.on('error', () => {});
    } catch {}
    // keeps countdowns/expiry honest and catches log activity (the tile reads from here, not from fs events)
    this.timers.push(setInterval(() => this.refresh(), theme.usage.scanThrottleSeconds * 1000));
    this.later(0);
  }

  stop() {
    this.watcher && this.watcher.close();
    this.timers.forEach(clearInterval);
  }

  setEnabled(on) {
    this.enabled = on;
    this.later(0);
  }

  later(ms) {
    clearTimeout(this.debounce);
    this.debounce = setTimeout(() => this.refresh(), ms);
  }

  // Official numbers only exist for claude.ai subscribers; API-key billing has no plan limits.
  apiKeyBilling() {
    if (process.env.ANTHROPIC_API_KEY) return true;
    try {
      const acct = JSON.parse(fs.readFileSync(this.claudeJson, 'utf8')).oauthAccount;
      return !acct; // not signed in with a claude.ai account
    } catch {
      return false;
    }
  }

  readWindows() {
    let raw;
    try {
      raw = JSON.parse(fs.readFileSync(this.file, 'utf8').replace(/^﻿/, '')); // tolerate a BOM
    } catch {
      return null;
    }
    const nowSec = Date.now() / 1000;
    const win = (w) => {
      if (!w || typeof w.pct !== 'number') return null;
      if (w.resetsAt && w.resetsAt <= nowSec) return { expired: true }; // window rolled over: number is stale
      return { pct: Math.max(0, Math.min(100, w.pct)), resetsAt: w.resetsAt || null };
    };
    const fiveHour = win(raw.fiveHour);
    const sevenDay = win(raw.sevenDay);
    const live = (w) => w && !w.expired;
    if (!live(fiveHour) && !live(sevenDay)) return null;
    return { fiveHour: live(fiveHour) ? fiveHour : null, sevenDay: live(sevenDay) ? sevenDay : null };
  }

  compute() {
    if (!this.enabled) return { enabled: false };
    if (!this.apiKeyBilling()) {
      const w = this.readWindows();
      if (w) return { enabled: true, mode: 'bars', ...w };
    }
    const now = Date.now();
    if (!this.scanResult || now - this.lastScan >= theme.usage.scanThrottleSeconds * 1000) {
      this.scanResult = this.scanner.scan();
      this.lastScan = now;
    }
    return { enabled: true, mode: 'fallback', approx: true, ...this.scanResult };
  }

  refresh() {
    let payload;
    try {
      payload = this.compute();
    } catch {
      payload = { enabled: this.enabled, mode: 'fallback', approx: true, tokens: 0, cost: 0 };
    }
    this.current = payload;
    const key = JSON.stringify(payload);
    if (key !== this.last) {
      this.last = key;
      this.emit('change', payload);
    }
  }
}

module.exports = Usage;
