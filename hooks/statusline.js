// mochi statusLine command.
// 1. Reads Claude Code's status JSON from stdin.
// 2. Writes rate_limits (five_hour / seven_day) atomically to %APPDATA%\mochi\usage.json.
// 3. Runs the user's original statusLine command (saved by the installer) with the same stdin
//    and prints its output, so the existing status line keeps working.
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const dir = path.join(process.env.APPDATA || '', 'mochi');

function readStdin() {
  try {
    return fs.readFileSync(0, 'utf8');
  } catch {
    return '';
  }
}

function atomicWrite(file, text) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, text);
  try {
    fs.renameSync(tmp, file);
  } catch {
    // Windows can refuse a rename onto a file mid-read: retry once
    fs.renameSync(tmp, file);
  }
}

function windowOf(w) {
  if (!w || typeof w.used_percentage !== 'number') return null;
  return { pct: w.used_percentage, resetsAt: typeof w.resets_at === 'number' ? w.resets_at : null };
}

const raw = readStdin();

try {
  const data = JSON.parse(raw);
  const rl = data && data.rate_limits;
  if (rl) {
    const fiveHour = windowOf(rl.five_hour);
    const sevenDay = windowOf(rl.seven_day);
    if (fiveHour || sevenDay) {
      fs.mkdirSync(dir, { recursive: true });
      atomicWrite(path.join(dir, 'usage.json'), JSON.stringify({ updatedAt: Date.now(), fiveHour, sevenDay }));
    }
  }
} catch {
  // never break the status line
}

try {
  const cfg = JSON.parse(fs.readFileSync(path.join(dir, 'config.json'), 'utf8'));
  const original = cfg.statusLineOriginal;
  if (original && original.command) {
    const r = spawnSync(original.command, { shell: true, input: raw, encoding: 'utf8', timeout: 5000 });
    if (r.stdout) process.stdout.write(r.stdout);
  }
} catch {
  // no original status line
}
