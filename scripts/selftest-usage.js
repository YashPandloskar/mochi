// Usage backend tests (no Electron).   npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { Scanner } = require('../src/main/usage-scan');
const Usage = require('../src/main/usage');

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-usage-'));
const projects = path.join(tmp, 'projects', 'p1');
fs.mkdirSync(projects, { recursive: true });
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

const now = new Date();
const today = now.toISOString();
const yesterday = new Date(now.getTime() - 36 * 3600e3).toISOString();
const assistant = (id, ts, usage, model = 'claude-sonnet-5-5') =>
  JSON.stringify({ type: 'assistant', timestamp: ts, message: { id, model, role: 'assistant', content: [{ type: 'text', text: 'SECRET CONTENT' }], usage } });

const lines = [
  // one response logged twice with a growing output count: counted once, at the larger value
  assistant('msg_1', today, { input_tokens: 1000, output_tokens: 50, cache_creation_input_tokens: 4000, cache_read_input_tokens: 10000, cache_creation: { ephemeral_5m_input_tokens: 4000, ephemeral_1h_input_tokens: 0 } }),
  assistant('msg_1', today, { input_tokens: 1000, output_tokens: 2000, cache_creation_input_tokens: 4000, cache_read_input_tokens: 10000, cache_creation: { ephemeral_5m_input_tokens: 4000, ephemeral_1h_input_tokens: 0 } }),
  assistant('msg_old', yesterday, { input_tokens: 999999, output_tokens: 999999 }), // not today
  assistant('msg_syn', today, { input_tokens: 5, output_tokens: 5 }, '<synthetic>'), // ignored
  JSON.stringify({ type: 'user', timestamp: today, message: { content: 'text mentioning "usage" and input_tokens: 77777' } }), // not an assistant line
  'not json but has "usage" in it',
];
const file = path.join(projects, 's.jsonl');
// last line deliberately incomplete (no newline): must be picked up only once finished
fs.writeFileSync(file, lines.join('\n') + '\n' + assistant('msg_2', today, { input_tokens: 10, output_tokens: 20 }).slice(0, 40));

const scanner = new Scanner(path.join(tmp, 'projects'));
let r = scanner.scan();
assert.strictEqual(r.tokens, 1000 + 2000 + 4000, 'input + output + cache writes, once per message, today only');
assert.ok(Math.abs(r.cost - 0.051) < 1e-9, `cost was ${r.cost}`); // 1000*3 + 2000*15 + 4000*3.75 + 10000*0.3 per million
ok('tokens and cost: dedupe by message id, skip yesterday/synthetic/non-assistant/garbage');

// finish the partial line and append another file: incremental scan picks up only the new data
const full = assistant('msg_2', today, { input_tokens: 10, output_tokens: 20 });
fs.writeFileSync(file, lines.join('\n') + '\n' + full + '\n');
r = scanner.scan();
assert.strictEqual(r.tokens, 1000 + 2000 + 4000 + 30);
ok('incremental scan completes a partial trailing line');

fs.writeFileSync(path.join(projects, 'sub.jsonl'), assistant('msg_3', today, { input_tokens: 1, output_tokens: 1 }) + '\n');
assert.strictEqual(scanner.scan().tokens, 7000 + 30 + 2);
ok('picks up new files');

// the scanner never exposes content
assert.ok(!JSON.stringify([...scanner.entries.values()]).includes('SECRET'));
ok('keeps no message content');

// ---------- Usage: bars vs fallback ----------
const dir = path.join(tmp, 'cfg');
fs.mkdirSync(dir);
const claudeJson = path.join(tmp, 'claude.json');
fs.writeFileSync(claudeJson, JSON.stringify({ oauthAccount: { billingType: 'stripe_subscription' } }));
const mk = (extra = {}) => new Usage({ dir, enabled: true, projectsDir: path.join(tmp, 'projects'), claudeJson, ...extra });
const soon = Math.floor(Date.now() / 1000) + 1800;
const later = Math.floor(Date.now() / 1000) + 86400;
const writeUsage = (o) => fs.writeFileSync(path.join(dir, 'usage.json'), JSON.stringify(o));

writeUsage({ fiveHour: { pct: 39.2, resetsAt: soon }, sevenDay: { pct: 15, resetsAt: later } });
let u = mk().compute();
assert.strictEqual(u.mode, 'bars');
assert.strictEqual(u.fiveHour.pct, 39.2);
ok('subscription + fresh usage.json -> bars');

writeUsage({ fiveHour: { pct: 80, resetsAt: Math.floor(Date.now() / 1000) - 5 }, sevenDay: { pct: 15, resetsAt: later } });
u = mk().compute();
assert.strictEqual(u.mode, 'bars');
assert.strictEqual(u.fiveHour, null, 'expired 5h window shows no stale number');
assert.strictEqual(u.sevenDay.pct, 15);
ok('expired window is dropped, the other stays');

writeUsage({ fiveHour: { pct: 80, resetsAt: 1 }, sevenDay: { pct: 15, resetsAt: 2 } });
u = mk().compute();
assert.strictEqual(u.mode, 'fallback');
assert.strictEqual(u.approx, true);
assert.ok(u.tokens > 0);
ok('all windows expired -> approximate fallback');

fs.rmSync(path.join(dir, 'usage.json'));
assert.strictEqual(mk().compute().mode, 'fallback');
ok('no usage.json (status line never fired) -> fallback');

writeUsage({ fiveHour: { pct: 39, resetsAt: soon }, sevenDay: null });
process.env.ANTHROPIC_API_KEY = 'sk-test';
assert.strictEqual(mk().compute().mode, 'fallback');
delete process.env.ANTHROPIC_API_KEY;
fs.writeFileSync(claudeJson, JSON.stringify({}));
assert.strictEqual(mk().compute().mode, 'fallback');
ok('API-key billing (env key or no claude.ai account) -> fallback only, no bars');

fs.writeFileSync(claudeJson, JSON.stringify({ oauthAccount: {} }));
assert.deepStrictEqual(mk({ enabled: false }).compute(), { enabled: false });
ok('setting off -> nothing computed');

console.log(`\n${passed} usage checks passed`);
fs.rmSync(tmp, { recursive: true, force: true });
