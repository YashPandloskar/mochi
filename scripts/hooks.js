// Installs or removes mochi's hooks and statusLine in ~/.claude/settings.json.
//   node scripts/hooks.js install    [--yes] [--dry-run]
//   node scripts/hooks.js uninstall  [--yes] [--dry-run]
// Test flags: --settings <file>  --config <file>
// Existing hooks are never touched. A backup is written and the diff is shown before anything changes.
const fs = require('fs');
const os = require('os');
const path = require('path');
const readline = require('readline');
const { spawnSync } = require('child_process');

const args = process.argv.slice(2);
const mode = args[0];
const flag = (n) => args.includes(n);
const opt = (n) => (args.includes(n) ? args[args.indexOf(n) + 1] : null);

const root = path.resolve(__dirname, '..');
const settingsPath = opt('--settings') || path.join(os.homedir(), '.claude', 'settings.json');
const mochiDir = path.join(process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming'), 'mochi');
const configPath = opt('--config') || path.join(mochiDir, 'config.json');
const sendEvent = path.join(root, 'hooks', 'send-event.ps1');
const statusScript = path.join(root, 'hooks', 'statusline.js');

// Must stay above approvalTimeoutSeconds in src/theme.js and above the 110s wait in send-event.ps1.
const APPROVAL_HOOK_TIMEOUT = 120;

function handler(extra) {
  return {
    type: 'command',
    command: 'powershell.exe',
    args: ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-File', sendEvent],
    ...extra,
  };
}

// Fire-and-forget events must never slow Claude down; approvals block until you answer.
const EVENTS = {
  PreToolUse: handler({ async: true, timeout: 10 }),
  PostToolUse: handler({ async: true, timeout: 10 }),
  Notification: handler({ async: true, timeout: 10 }),
  Stop: handler({ async: true, timeout: 10 }),
  PermissionRequest: handler({ timeout: APPROVAL_HOOK_TIMEOUT }),
};

const isMochiHook = (h) => JSON.stringify(h).includes('send-event.ps1') && /mochi/i.test(JSON.stringify(h));
const isMochiStatus = (s) => !!s && /statusline\.js/.test(JSON.stringify(s)) && /mochi/i.test(JSON.stringify(s));

function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch (e) {
    if (e.code === 'ENOENT') return fallback;
    throw new Error(`Cannot parse ${file}: ${e.message}`);
  }
}

function removeMochiHooks(settings) {
  const hooks = settings.hooks;
  if (!hooks) return;
  for (const ev of Object.keys(hooks)) {
    hooks[ev] = hooks[ev]
      .map((g) => ({ ...g, hooks: (g.hooks || []).filter((h) => !isMochiHook(h)) }))
      .filter((g) => g.hooks.length > 0);
    if (hooks[ev].length === 0) delete hooks[ev];
  }
  if (Object.keys(hooks).length === 0) delete settings.hooks;
}

function plan() {
  const current = readJson(settingsPath, {});
  const next = JSON.parse(JSON.stringify(current));
  const cfg = readJson(configPath, {});
  const cfgNext = { ...cfg };

  removeMochiHooks(next);

  if (mode === 'install') {
    next.hooks = next.hooks || {};
    for (const [ev, h] of Object.entries(EVENTS)) {
      next.hooks[ev] = [...(next.hooks[ev] || []), { hooks: [h] }];
    }
    if (!isMochiStatus(current.statusLine)) cfgNext.statusLineOriginal = current.statusLine || null;
    const orig = cfgNext.statusLineOriginal || {};
    next.statusLine = {
      type: 'command',
      command: `node "${statusScript}"`,
      ...(orig.padding !== undefined ? { padding: orig.padding } : {}),
      ...(orig.refreshInterval !== undefined ? { refreshInterval: orig.refreshInterval } : {}),
    };
  } else if (isMochiStatus(current.statusLine)) {
    if (cfg.statusLineOriginal) next.statusLine = cfg.statusLineOriginal;
    else delete next.statusLine;
    cfgNext.statusLineOriginal = null;
  }
  return { current, next, cfgNext, existed: fs.existsSync(settingsPath) };
}

function showDiff(a, b) {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-diff-'));
  const fa = path.join(tmp, 'settings.before.json');
  const fb = path.join(tmp, 'settings.after.json');
  fs.writeFileSync(fa, JSON.stringify(a, null, 2) + '\n');
  fs.writeFileSync(fb, JSON.stringify(b, null, 2) + '\n');
  const r = spawnSync('git', ['diff', '--no-index', '--color=always', '-U3', fa, fb], { encoding: 'utf8' });
  fs.rmSync(tmp, { recursive: true, force: true });
  if (r.error) return false;
  process.stdout.write(r.stdout || '');
  return (r.stdout || '').trim().length > 0;
}

function ask(q) {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((res) => rl.question(q, (a) => (rl.close(), res(a.trim().toLowerCase()))));
}

async function main() {
  if (mode !== 'install' && mode !== 'uninstall') {
    console.error('usage: node scripts/hooks.js install|uninstall [--yes] [--dry-run]');
    process.exit(2);
  }
  const { current, next, cfgNext, existed } = plan();
  console.log(`${mode} -> ${settingsPath}\n`);
  const changed = showDiff(current, next);
  if (!changed) {
    console.log('Nothing to change.');
    return;
  }
  if (flag('--dry-run')) return console.log('\n(dry run: nothing written)');
  if (!flag('--yes') && (await ask('\nApply this change? [y/N] ')) !== 'y') return console.log('Cancelled. Nothing written.');

  fs.mkdirSync(path.join(mochiDir, 'backups'), { recursive: true });
  if (existed) {
    const stamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backup = path.join(mochiDir, 'backups', `settings.${stamp}.json`);
    fs.copyFileSync(settingsPath, backup);
    console.log(`\nBackup: ${backup}`);
  }
  fs.mkdirSync(path.dirname(settingsPath), { recursive: true });
  fs.writeFileSync(settingsPath, JSON.stringify(next, null, 2) + '\n');
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, JSON.stringify(cfgNext, null, 2));
  console.log(mode === 'install' ? 'mochi hooks installed. Restart running Claude Code sessions to pick them up.' : 'mochi hooks removed.');
}

main().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
