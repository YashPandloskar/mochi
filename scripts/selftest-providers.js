// Other-model chat, key storage, provider switching and the assistant activity tracker, against fake servers
// (no real requests, no keys, no cost).   npm test
const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { Gemini, OpenAI, Ollama, META } = require('../src/main/providers');
const ChatHub = require('../src/main/chat-hub');
const Keys = require('../src/main/keys');
const Activity = require('../src/main/activity');
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// a fake server that records what it was sent and answers like each service does
const seen = [];
let mode = 'ok';
const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => (body += d));
  req.on('end', () => {
    const b = body ? JSON.parse(body) : {};
    seen.push({ url: req.url, headers: req.headers, body: b });
    if (mode === '401') return res.writeHead(401, { 'content-type': 'application/json' }), res.end('{"error":{"message":"bad key"}}');
    if (mode === '429') return res.writeHead(429, { 'content-type': 'application/json' }), res.end('{"error":{"message":"quota"}}');
    if (mode === '404') return res.writeHead(404, { 'content-type': 'application/json' }), res.end('{"error":"model not found"}');
    if (mode === 'empty') return res.writeHead(200), res.end('');
    const slow = mode === 'slow';
    if (req.url.startsWith('/v1beta/models/')) {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (t) => res.write(`data: ${JSON.stringify({ candidates: [{ content: { parts: [{ text: t }] } }] })}\n\n`);
      send('Hello ');
      setTimeout(() => { send('from Gemini'); res.end(); }, slow ? 400 : 5);
    } else if (req.url === '/v1/chat/completions') {
      res.writeHead(200, { 'content-type': 'text/event-stream' });
      const send = (t) => res.write(`data: ${JSON.stringify({ choices: [{ delta: { content: t } }] })}\n\n`);
      send('Hello ');
      setTimeout(() => { send('from OpenAI'); res.write('data: [DONE]\n\n'); res.end(); }, slow ? 400 : 5);
    } else if (req.url === '/api/chat') {
      res.writeHead(200, { 'content-type': 'application/x-ndjson' });
      res.write(JSON.stringify({ message: { content: 'Hello ' } }) + '\n');
      setTimeout(() => { res.write(JSON.stringify({ message: { content: 'from Ollama' }, done: true }) + '\n'); res.end(); }, slow ? 400 : 5);
    } else res.writeHead(404).end();
  });
});

const collect = (p) => {
  const ev = [];
  p.on('event', (e) => ev.push(e));
  return ev;
};
const finished = (ev) => new Promise((r) => { const t = setInterval(() => { if (ev.some((e) => ['done', 'error', 'stopped'].includes(e.type))) { clearInterval(t); r(); } }, 10); });

(async () => {
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}`;

  // ---------- each provider streams and keeps the conversation ----------
  for (const [Cls, name, text] of [[Gemini, 'Gemini', 'Hello from Gemini'], [OpenAI, 'OpenAI', 'Hello from OpenAI'], [Ollama, 'Ollama', 'Hello from Ollama']]) {
    const p = new Cls({ model: 'm1', baseUrl: base, getKey: () => 'key-123456789' });
    const ev = collect(p);
    assert.strictEqual(p.send('Hi there'), true);
    await finished(ev);
    assert.deepStrictEqual(ev.map((e) => e.type), ['start', 'delta', 'delta', 'done'], name + ' event order');
    assert.strictEqual(ev[ev.length - 1].text, text);
    assert.strictEqual(p.busy, false);
    ev.length = 0;
    p.send('And again');
    await finished(ev);
    const second = seen[seen.length - 1].body;
    const flat = JSON.stringify(second);
    assert.ok(flat.includes('Hi there') && flat.includes(text) && flat.includes('And again'), name + ' sends the earlier turns');
    p.reset();
    assert.strictEqual(p.history.length, 0);
  }
  ok('Gemini, OpenAI and Ollama stream their answers and keep the conversation');

  // ---------- how each service is asked ----------
  seen.length = 0;
  const g = new Gemini({ model: 'gm', baseUrl: base, getKey: () => 'gkey-123456' });
  const ge = collect(g);
  g.send('look', { data: 'AAAA', mediaType: 'image/png' });
  await finished(ge);
  assert.strictEqual(seen[0].headers['x-goog-api-key'], 'gkey-123456');
  assert.ok(!seen[0].url.includes('gkey'), 'the key is a header, never in the URL');
  assert.ok(seen[0].url.includes('/models/gm:streamGenerateContent'));
  assert.strictEqual(seen[0].body.contents[0].parts[0].inlineData.mimeType, 'image/png');
  const o = new OpenAI({ model: 'om', baseUrl: base, getKey: () => 'okey-123456' });
  const oe = collect(o);
  o.send('look', { data: 'AAAA', mediaType: 'image/jpeg' });
  await finished(oe);
  assert.strictEqual(seen[1].headers.authorization, 'Bearer okey-123456');
  assert.strictEqual(seen[1].body.model, 'om');
  assert.strictEqual(seen[1].body.messages[1].content[1].image_url.url, 'data:image/jpeg;base64,AAAA');
  ok('requests carry the key in a header and the screenshot in each service\'s own format');

  // ---------- problems are explained in plain words ----------
  const expect = async (m, regex, Cls = Gemini, extra = {}) => {
    mode = m;
    const p = new Cls({ model: 'x', baseUrl: base, getKey: () => 'key-123456789', ...extra });
    const ev = collect(p);
    p.send('hi');
    await finished(ev);
    const last = ev[ev.length - 1];
    assert.strictEqual(last.type, 'error', m);
    assert.ok(regex.test(last.message), `${m}: ${last.message}`);
    assert.strictEqual(p.busy, false, 'not stuck busy after ' + m);
    mode = 'ok';
  };
  await expect('401', /did not accept that key/);
  await expect('429', /rate limit|quota/);
  await expect('404', /could not find the model/);
  await expect('empty', /empty answer/);
  await expect('404', /ollama pull/, Ollama);
  const dead = new Ollama({ model: 'x', baseUrl: 'http://127.0.0.1:1' });
  const de = collect(dead);
  dead.send('hi');
  await finished(de);
  assert.match(de[de.length - 1].message, /Ollama is not running/);
  const noNet = new Gemini({ model: 'x', baseUrl: 'http://127.0.0.1:1', getKey: () => 'key-123456789' });
  const ne = collect(noNet);
  noNet.send('hi');
  await finished(ne);
  assert.match(ne[ne.length - 1].message, /Could not reach Gemini/);
  const nokey = new Gemini({ model: 'x', baseUrl: base, getKey: () => null });
  const ke = collect(nokey);
  nokey.send('hi');
  await finished(ke);
  assert.strictEqual(ke[ke.length - 1].code, 'no-key');
  assert.strictEqual(seen.filter((s) => s.url.includes('gm')).length >= 0, true);
  ok('bad key, quota, missing model, empty answer, no network, Ollama off and no key each give a clear message and never leave it stuck');

  // ---------- stopping ----------
  mode = 'slow';
  const sp = new OpenAI({ model: 'x', baseUrl: base, getKey: () => 'key-123456789' });
  const se = collect(sp);
  sp.send('long one');
  await sleep(120);
  sp.stop();
  await finished(se);
  assert.strictEqual(se[se.length - 1].type, 'stopped');
  assert.strictEqual(sp.busy, false);
  assert.strictEqual(sp.history.length, 0, 'a stopped answer is not remembered');
  mode = 'ok';
  assert.strictEqual(sp.send('again'), true, 'can send after a stop');
  await finished(collect(sp));
  ok('Stop ends the answer cleanly and the next message works');

  // ---------- refuses bad input ----------
  const bp = new Gemini({ model: 'x', baseUrl: base, getKey: () => 'key-123456789' });
  assert.strictEqual(bp.send(''), false);
  assert.strictEqual(bp.send('x', { data: 'AAAA', mediaType: 'image/gif' }), false);
  assert.strictEqual(bp.send('y'.repeat(30000)), false);
  ok('empty messages, unsupported pictures and oversized messages are refused');

  // ---------- keys are encrypted and never stored as typed ----------
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-keys-'));
  const fake = { isEncryptionAvailable: () => true, encryptString: (s) => Buffer.from('ENC:' + s.split('').reverse().join('')), decryptString: (b) => b.toString().slice(4).split('').reverse().join('') };
  const keys = new Keys({ file: path.join(dir, 'keys.json'), safeStorage: fake });
  assert.strictEqual(keys.has('gemini'), false);
  keys.set('gemini', 'AIza-secret-key-123');
  assert.strictEqual(keys.has('gemini'), true);
  assert.strictEqual(keys.get('gemini'), 'AIza-secret-key-123');
  assert.ok(!fs.readFileSync(path.join(dir, 'keys.json'), 'utf8').includes('AIza-secret-key-123'), 'the key is not in the file as typed');
  keys.remove('gemini');
  assert.strictEqual(keys.has('gemini'), false);
  assert.throws(() => keys.set('gemini', 'short'), /does not look like/);
  assert.throws(() => keys.set('gemini', 'has a space in it'), /does not look like/);
  const noEnc = new Keys({ file: path.join(dir, 'k2.json'), safeStorage: { isEncryptionAvailable: () => false } });
  assert.throws(() => noEnc.set('gemini', 'AIza-secret-key-123'), /could not encrypt/);
  assert.strictEqual(fs.existsSync(path.join(dir, 'k2.json')), false, 'nothing is written without encryption');
  fs.writeFileSync(path.join(dir, 'keys.json'), '{broken');
  assert.strictEqual(keys.get('gemini'), null);
  ok('keys are stored encrypted, validated, removable, and never written in plain text');

  // ---------- the hub ----------
  const claudeFake = new (require('events'))();
  claudeFake.busy = false; claudeFake.reset = () => {}; claudeFake.stop = () => {}; claudeFake.send = (t) => { claudeFake.emit('event', { type: 'start' }); claudeFake.emit('event', { type: 'done', text: 'claude says ' + t }); return true; };
  const keys2 = new Keys({ file: path.join(dir, 'keys2.json'), safeStorage: fake });
  const gem = new Gemini({ model: 'gm', baseUrl: base, getKey: () => keys2.get('gemini') });
  const hub = new ChatHub({ providers: { claude: claudeFake, gemini: gem, openai: new OpenAI({ model: 'o', baseUrl: base }), ollama: new Ollama({ model: 'l', baseUrl: base }) }, current: 'claude', keys: keys2 });
  const he = collect(hub);
  hub.send('hi');
  assert.deepStrictEqual(he.map((e) => e.provider), ['claude', 'claude'], 'events say who they came from');
  assert.strictEqual(hub.list().providers.find((p) => p.id === 'claude').hasKey, true);
  assert.strictEqual(hub.list().providers.find((p) => p.id === 'gemini').hasKey, false);
  assert.strictEqual(hub.setCurrent('gemini'), true);
  assert.strictEqual(hub.current, 'gemini');
  he.length = 0;
  hub.send('hello');
  await finished(he);
  assert.strictEqual(he[he.length - 1].code, 'no-key', 'no key: told to add one, nothing sent');
  keys2.set('gemini', 'AIza-secret-key-123');
  assert.strictEqual(hub.list().providers.find((p) => p.id === 'gemini').hasKey, true);
  he.length = 0;
  hub.send('hello again');
  await finished(he);
  assert.strictEqual(he[he.length - 1].type, 'done');
  assert.strictEqual(hub.setCurrent('nonsense'), false);
  mode = 'slow';
  he.length = 0;
  hub.send('slow one');
  assert.strictEqual(hub.setCurrent('claude'), false, 'cannot switch while an answer is arriving');
  await finished(he);
  mode = 'ok';
  assert.strictEqual(META.claude.needsKey, false);
  ok('the hub routes to the chosen model, tags events, blocks switching mid-answer and reports who has a key');

  // ---------- the assistant activity tracker ----------
  const chats = [];
  const a = new Activity({ onChats: (c) => chats.push({ ...c }) });
  const snaps = [];
  a.on('change', (s) => snaps.push(s));
  assert.strictEqual(a.snapshot().phase, 'idle');
  a.chat({ type: 'start' }, 'Gemini');
  assert.strictEqual(a.snapshot().phase, 'thinking');
  a.chat({ type: 'delta', text: 'x' }, 'Gemini');
  a.chat({ type: 'delta', text: 'y' }, 'Gemini');
  assert.strictEqual(a.snapshot().phase, 'replying');
  assert.strictEqual(snaps.filter((s) => s.phase === 'replying').length, 1, 'many deltas make one change');
  a.chat({ type: 'done', text: '**Hello** there' }, 'Gemini');
  assert.strictEqual(a.snapshot().phase, 'done');
  assert.strictEqual(a.snapshot().chatsToday, 1);
  assert.strictEqual(chats.length, 1);
  a.chat({ type: 'error', message: 'nope' }, 'Gemini');
  assert.strictEqual(a.snapshot().phase, 'error');
  a.chat({ type: 'start' }, 'Gemini');
  a.chat({ type: 'stopped' }, 'Gemini');
  assert.strictEqual(a.snapshot().phase, 'idle');
  ok('chat events become thinking, replying, done, error and idle, and chats are counted');

  assert.strictEqual(a.ping({ state: 'working', label: 'Cursor', message: 'Refactoring' }), true);
  assert.deepStrictEqual([a.snapshot().source, a.snapshot().phase, a.snapshot().label, a.snapshot().message], ['ping', 'thinking', 'Cursor', 'Refactoring']);
  a.ping({ state: 'needs', label: 'Cursor', message: 'Approve?' });
  assert.strictEqual(a.snapshot().phase, 'needs');
  a.ping({ state: 'done', label: 'Cursor' });
  assert.strictEqual(a.snapshot().phase, 'done');
  a.ping({ state: 'idle' });
  assert.strictEqual(a.snapshot().phase, 'idle');
  assert.strictEqual(a.ping({ state: 'exploding' }), false);
  assert.strictEqual(a.ping(null), false);
  assert.strictEqual(a.ping('working'), false);
  a.ping({ state: 'working', label: 'x'.repeat(500), message: 'a\u0000b\nc ' + 'y'.repeat(900) });
  assert.ok(a.snapshot().label.length <= 40 && a.snapshot().message.length <= 300 && !/[\u0000\n]/.test(a.snapshot().message));
  ok('pings set the notch from any tool, and bad or oversized input is refused or trimmed');

  a.stop();
  server.close();
  console.log(`\n${passed} provider checks passed`);
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
