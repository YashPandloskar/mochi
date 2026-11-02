// Chat backend with a fake `claude` program (no real requests, no plan usage).   npm test
// The live test against the real CLI is scripts/chat-live-test.js.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Chat = require('../src/main/chat');
const theme = require('../src/theme');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-chat-test-'));
const fake = path.join(dir, 'fake-claude.js');
fs.writeFileSync(
  fake,
  `
const args = process.argv.slice(2);
const flag = (n) => { const i = args.indexOf(n); return i >= 0 ? args[i + 1] : null; };
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (d) => (input += d));
process.stdin.on('end', () => {
  const out = (o) => process.stdout.write(JSON.stringify(o) + '\\n');
  const sid = flag('--session-id') || flag('--resume');
  const mode = flag('--session-id') ? 'new' : 'resume';
  if (input.includes('SLOW')) { out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: 'working' } } }); return setTimeout(() => {}, 60000); }
  if (input.includes('FAIL')) return out({ type: 'result', subtype: 'error', is_error: true, result: 'Not logged in. Please run /login' });
  if (input.includes('CRASH')) { process.stderr.write('boom'); process.exit(3); }
  const reply = 'echo(' + mode + '): ' + input + ' | tools=' + JSON.stringify(flag('--tools')) + ' sources=' + JSON.stringify(flag('--setting-sources')) + ' sid=' + sid + ' chat=' + process.env.MOCHI_CHAT;
  const half = Math.ceil(reply.length / 2);
  out({ type: 'system', subtype: 'init' });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.slice(0, half) } } });
  out({ type: 'stream_event', event: { type: 'content_block_delta', delta: { type: 'text_delta', text: reply.slice(half) } } });
  out({ type: 'result', subtype: 'success', is_error: false, result: reply, session_id: sid });
});
`
);

const make = () => new Chat({ claudePath: process.execPath, prefixArgs: [fake], cwd: path.join(dir, 'cwd') });
const collect = (chat) => {
  const ev = [];
  chat.on('event', (e) => ev.push(e));
  return ev;
};
const until = (chat, types) =>
  new Promise((res) => {
    const h = (e) => types.includes(e.type) && (chat.off('event', h), res(e));
    chat.on('event', h);
  });
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

(async () => {
  const chat = make();
  const ev = collect(chat);
  assert.strictEqual(chat.send('hello there\nwith "quotes" and a new line'), true);
  assert.strictEqual(chat.send('second while busy'), false, 'only one message at a time');
  const done = await until(chat, ['done', 'error']);
  assert.strictEqual(done.type, 'done');
  assert.deepStrictEqual(ev.map((e) => e.type), ['start', 'delta', 'delta', 'done']);
  assert.strictEqual(ev.filter((e) => e.type === 'delta').map((e) => e.text).join(''), done.text);
  assert.ok(done.text.includes('hello there\nwith "quotes" and a new line'), 'text with quotes/newlines arrives intact through stdin');
  ok('streams deltas, then done; text with quotes and newlines survives');

  assert.ok(done.text.includes('echo(new)'), 'first message creates the session');
  assert.ok(done.text.includes('tools=""') && done.text.includes('sources=""'), 'tools and personal settings are switched off');
  assert.ok(done.text.includes('chat=1'), 'MOCHI_CHAT=1 is set so mochi hooks ignore the run');
  const sid = chat.sessionId;
  assert.ok(sid && done.text.includes('sid=' + sid));
  ok('first message: --session-id, no tools, no settings, MOCHI_CHAT set');

  chat.send('next question');
  const d2 = await until(chat, ['done', 'error']);
  assert.ok(d2.text.includes('echo(resume)') && d2.text.includes('sid=' + sid), 'later messages resume the same session');
  ok('later messages use --resume with the same session');

  chat.reset();
  assert.strictEqual(chat.sessionId, null);
  chat.send('fresh start');
  const d3 = await until(chat, ['done']);
  assert.ok(d3.text.includes('echo(new)') && !d3.text.includes('sid=' + sid));
  ok('new chat forgets the conversation');

  // stop in the middle of an answer
  chat.send('SLOW please');
  await until(chat, ['delta']);
  chat.stop();
  const st = await until(chat, ['stopped', 'error', 'done']);
  assert.strictEqual(st.type, 'stopped');
  assert.strictEqual(st.text, 'working');
  assert.strictEqual(chat.busy, false);
  ok('stop ends the request and keeps the partial text');

  // errors become readable messages
  const c2 = make();
  c2.send('FAIL now');
  const e1 = await until(c2, ['error', 'done']);
  assert.strictEqual(e1.type, 'error');
  assert.ok(/not signed in/i.test(e1.message), e1.message);
  assert.strictEqual(c2.sessionId, null, 'a failed first message does not keep a session');
  ok('sign-in problems give a plain message and no stale session');

  const c3 = make();
  c3.send('CRASH');
  const e2 = await until(c3, ['error', 'done']);
  assert.strictEqual(e2.type, 'error');
  assert.ok(e2.message.includes('boom'));
  ok('a crash reports what the program said');

  const c4 = new Chat({ claudePath: path.join(dir, 'does-not-exist.exe'), cwd: path.join(dir, 'cwd') });
  c4.send('hi');
  const e3 = await until(c4, ['error', 'done']);
  assert.strictEqual(e3.type, 'error');
  assert.ok(/not installed|Could not/i.test(e3.message), e3.message);
  assert.strictEqual(c4.busy, false);
  ok('missing claude program gives a clear message and is not left busy');

  assert.strictEqual(make().send('x'.repeat(theme.chat.maxChars + 1)), false);
  assert.strictEqual(make().send('   '), false);
  ok('empty and oversized messages are refused');

  console.log(`\n${passed} chat checks passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
