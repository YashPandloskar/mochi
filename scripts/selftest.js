// Runs the server and session logic without Electron.   npm test
const http = require('http');
const assert = require('assert');
const theme = require('../src/theme');
const server = require('../src/main/server');
const SessionState = require('../src/main/session-state');

const PORT = 47999;
const TOKEN = 'test-token';
theme.timings.approvalTimeoutSeconds = 1;

const state = new SessionState({ jobs: { date: '', count: 0 }, onJobs: () => {} });
const srv = server.start({ port: PORT, token: TOKEN, state });

function post(route, body, { token = TOKEN, host } = {}) {
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const headers = { 'Content-Type': 'application/json', 'Content-Length': Buffer.byteLength(data) };
    if (token) headers['X-Mochi-Token'] = token;
    if (host) headers.Host = host;
    const req = http.request({ host: '127.0.0.1', port: PORT, path: route, method: 'POST', headers }, (res) => {
      let out = '';
      res.on('data', (c) => (out += c));
      res.on('end', () => resolve({ status: res.statusCode, body: out }));
    });
    req.on('error', reject);
    req.end(data);
  });
}

const ev = (name, extra = {}) => ({ session_id: 's1', cwd: 'C:\\x\\webshop', hook_event_name: name, ...extra });
const tick = (ms) => new Promise((r) => setTimeout(r, ms));
let passed = 0;
const ok = (name) => console.log('  ok  ' + name) || passed++;

(async () => {
  // security
  assert.strictEqual((await post('/event', ev('Stop'), { token: 'wrong' })).status, 401);
  assert.strictEqual((await post('/event', ev('Stop'), { token: null })).status, 401);
  assert.strictEqual((await post('/event', ev('Stop'), { host: 'evil.example' })).status, 403);
  ok('rejects missing/wrong token and foreign Host');

  // step derivation
  await post('/event', ev('PreToolUse', { tool_name: 'Read', tool_input: { file_path: 'a.ts' } }));
  let s = state.snapshot();
  assert.strictEqual(s.state, 'working');
  assert.strictEqual(s.step, 1);
  assert.strictEqual(s.project, 'webshop');
  assert.ok(s.startedAt);
  const started = s.startedAt;
  await post('/event', ev('PreToolUse', { tool_name: 'Edit', tool_input: { file_path: 'C:\\x\\checkout.ts', old_string: 'a', new_string: 'b\nc' } }));
  s = state.snapshot();
  assert.strictEqual(s.step, 2);
  assert.deepStrictEqual(s.diff, { file: 'checkout.ts', removed: ['a'], added: ['b', 'c'] });
  await post('/event', ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' } }));
  assert.strictEqual(state.snapshot().step, 3);
  await post('/event', ev('PostToolUse', { tool_name: 'Bash', tool_input: { command: 'npm test' }, tool_response: { stdout: 'Tests: 48 passed' } }));
  s = state.snapshot();
  assert.strictEqual(s.testResult, '48 passed');
  await post('/event', ev('PreToolUse', { tool_name: 'Bash', tool_input: { command: 'ls -la' } }));
  assert.strictEqual(state.snapshot().step, 3, 'non-test Bash keeps the step');
  assert.strictEqual(state.snapshot().startedAt, started, 'timer counts from first event');
  ok('read/edit/test steps, diff, test result, timer origin');

  // done + jobs today
  await post('/event', ev('Stop', { stop_hook_active: false, last_assistant_message: 'All done' }));
  s = state.snapshot();
  assert.strictEqual(s.state, 'done');
  assert.strictEqual(s.step, 4);
  assert.strictEqual(s.jobsToday, 1);
  assert.strictEqual(s.lastMessage, 'All done');
  await post('/event', ev('Stop', { stop_hook_active: true }));
  assert.strictEqual(state.snapshot().jobsToday, 1, 'stop_hook_active continuation is not a new job');
  ok('Stop -> done, jobs today');

  // approvals
  const allow = post('/approval', ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'rm -rf build' } }));
  await tick(100);
  s = state.snapshot();
  assert.strictEqual(s.state, 'needs');
  assert.strictEqual(s.approval.command, 'rm -rf build');
  state.resolve(s.approval.id, 'allow');
  const r1 = await allow;
  assert.deepStrictEqual(JSON.parse(r1.body), { hookSpecificOutput: { hookEventName: 'PermissionRequest', decision: { behavior: 'allow' } } });
  ok('allow returns the PermissionRequest allow JSON');

  const deny = post('/approval', ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'x' } }));
  await tick(100);
  state.resolve(state.snapshot().approval.id, 'deny');
  const r2 = JSON.parse((await deny).body);
  assert.strictEqual(r2.hookSpecificOutput.decision.behavior, 'deny');
  assert.ok(r2.hookSpecificOutput.decision.message);
  ok('deny returns the PermissionRequest deny JSON');

  const t0 = Date.now();
  const timeout = await post('/approval', ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'y' } }));
  assert.strictEqual(timeout.status, 200);
  assert.strictEqual(timeout.body, '', 'timeout prints nothing so Claude Code falls back to its own prompt');
  assert.ok(Date.now() - t0 >= 900);
  assert.strictEqual(state.snapshot().approval, null);
  ok('timeout falls back with empty output and clears the card');

  // hook process dies (answered in the terminal)
  await new Promise((resolve) => {
    const req = http.request({ host: '127.0.0.1', port: PORT, path: '/approval', method: 'POST', headers: { 'X-Mochi-Token': TOKEN } });
    req.on('error', () => {});
    req.end(JSON.stringify(ev('PermissionRequest', { tool_name: 'Bash', tool_input: { command: 'z' } })));
    setTimeout(() => (req.destroy(), resolve()), 150);
  });
  await tick(150);
  assert.strictEqual(state.snapshot().approval, null);
  ok('client disconnect clears a pending approval');

  console.log(`\n${passed} checks passed`);
  srv.close();
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
