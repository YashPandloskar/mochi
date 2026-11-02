const fs = require('fs');
const os = require('os');
const path = require('path');
const theme = require('../theme');

// Fallback usage: today's tokens and estimated cost from Claude Code's local logs.
// Read-only. Each log line is parsed in memory and only the usage metadata is kept
// (model, token counts, message id). Message content is never stored, logged or sent anywhere.

const NEWLINE = 0x0a;

function priceFor(model) {
  const m = String(model || '').toLowerCase();
  const hit = theme.usage.prices.find((p) => m.includes(p.match));
  return hit || theme.usage.defaultPrice;
}

function costOf(e) {
  const p = priceFor(e.model);
  const perToken = (rate) => rate / 1e6;
  const cache5 = e.cacheWrite5m + (e.cacheWriteTotal - e.cacheWrite5m - e.cacheWrite1h); // unsplit counts as 5m
  return (
    e.input * perToken(p.input) +
    e.output * perToken(p.output) +
    cache5 * perToken(p.input * 1.25) +
    e.cacheWrite1h * perToken(p.input * 2) +
    e.cacheRead * perToken(p.input * 0.1)
  );
}

class Scanner {
  constructor(root = path.join(os.homedir(), '.claude', 'projects')) {
    this.root = root;
    this.reset(this.dayKey());
  }

  dayKey() {
    return new Date().toLocaleDateString('sv');
  }

  reset(day) {
    this.day = day;
    this.files = new Map(); // file -> { pos, tail: Buffer }
    this.entries = new Map(); // message id -> usage entry
  }

  midnight() {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  }

  *walk(dir, since) {
    let items;
    try {
      items = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const it of items) {
      const p = path.join(dir, it.name);
      if (it.isDirectory()) yield* this.walk(p, since);
      else if (it.name.endsWith('.jsonl')) {
        try {
          const st = fs.statSync(p);
          if (st.mtimeMs >= since) yield { path: p, size: st.size };
        } catch {}
      }
    }
  }

  readNew(file) {
    const st = this.files.get(file.path) || { pos: 0, tail: Buffer.alloc(0) };
    if (file.size < st.pos) Object.assign(st, { pos: 0, tail: Buffer.alloc(0) }); // truncated or replaced
    this.files.set(file.path, st);
    if (file.size === st.pos) return;
    let fd;
    try {
      fd = fs.openSync(file.path, 'r');
      const CHUNK = 4 * 1024 * 1024;
      while (st.pos < file.size) {
        const len = Math.min(CHUNK, file.size - st.pos);
        const buf = Buffer.alloc(len);
        fs.readSync(fd, buf, 0, len, st.pos);
        st.pos += len;
        let data = Buffer.concat([st.tail, buf]);
        let start = 0;
        let nl;
        while ((nl = data.indexOf(NEWLINE, start)) !== -1) {
          this.line(data.subarray(start, nl));
          start = nl + 1;
        }
        st.tail = data.subarray(start);
      }
    } catch {
      // unreadable right now: try again on the next scan
    } finally {
      if (fd !== undefined) fs.closeSync(fd);
    }
  }

  line(buf) {
    if (!buf.includes('"usage"')) return; // cheap filter before parsing
    let o;
    try {
      o = JSON.parse(buf.toString('utf8'));
    } catch {
      return;
    }
    const u = o && o.type === 'assistant' && o.message && o.message.usage;
    if (!u || o.message.model === '<synthetic>') return;
    const ts = Date.parse(o.timestamp);
    if (!(ts >= this.midnight())) return;
    const cc = u.cache_creation || {};
    const entry = {
      model: o.message.model || '',
      input: u.input_tokens || 0,
      output: u.output_tokens || 0,
      cacheWriteTotal: u.cache_creation_input_tokens || 0,
      cacheWrite5m: cc.ephemeral_5m_input_tokens || 0,
      cacheWrite1h: cc.ephemeral_1h_input_tokens || 0,
      cacheRead: u.cache_read_input_tokens || 0,
    };
    // One API response is logged on several lines with growing output counts: keep the last/largest.
    const id = o.message.id || o.requestId || `${ts}:${this.entries.size}`;
    const prev = this.entries.get(id);
    if (!prev || entry.output >= prev.output) this.entries.set(id, entry);
  }

  // { tokens, cost } for today. Tokens = input + cache writes + output (cache reads excluded).
  scan() {
    const today = this.dayKey();
    if (today !== this.day) this.reset(today);
    for (const f of this.walk(this.root, this.midnight())) this.readNew(f);
    let tokens = 0;
    let cost = 0;
    for (const e of this.entries.values()) {
      tokens += e.input + e.output + e.cacheWriteTotal;
      cost += costOf(e);
    }
    return { tokens, cost };
  }
}

module.exports = { Scanner, costOf };
