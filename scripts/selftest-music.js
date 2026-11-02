// Music module logic (no helper process, no Electron).   npm test
const assert = require('assert');
const Music = require('../src/main/music');

const m = new Music({ enabled: true });
const seen = [];
m.on('change', (s) => seen.push(s));
const feed = (o) => m.line(JSON.stringify(o));
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

feed({ status: 'playing', title: 'A', artist: 'X', album: 'Y', artKey: 'A|X|Y', art: 'data:image/jpeg;base64,AAAA', position: 10, duration: 100, at: 1 });
assert.strictEqual(m.current.art, 'data:image/jpeg;base64,AAAA');
// periodic resync from the helper carries no artwork: the last one is kept for the same track
feed({ status: 'playing', title: 'A', artist: 'X', album: 'Y', artKey: 'A|X|Y', position: 15, duration: 100, at: 2 });
assert.strictEqual(m.current.art, 'data:image/jpeg;base64,AAAA');
assert.strictEqual(m.current.position, 15);
ok('artwork is kept across timeline resyncs of the same track');

// Apple Music can report a placeholder first and the real cover later: a new cover for the same track replaces it
feed({ status: 'playing', title: 'A', artist: 'X', album: 'Y', artKey: 'A|X|Y', art: 'data:image/jpeg;base64,REALCOVER', position: 20, duration: 100, at: 3 });
assert.strictEqual(m.current.art, 'data:image/jpeg;base64,REALCOVER');
ok('a later, different cover for the same track replaces the placeholder');

// a new track without artwork must not show the previous cover
feed({ status: 'playing', title: 'B', artist: 'X', album: 'Y', artKey: 'B|X|Y', position: 0, duration: 90, at: 3 });
assert.strictEqual(m.current.art, null);
ok('a new track never shows the old cover');

feed({ status: 'paused', title: 'B', artist: 'X', album: 'Y', artKey: 'B|X|Y', art: 'data:image/jpeg;base64,BBBB', position: 5, duration: 90, at: 4 });
assert.strictEqual(m.current.status, 'paused');
feed({ status: 'none' });
assert.deepStrictEqual(m.current, { enabled: true, status: 'none' });
ok('paused and no-session states');

const before = seen.length;
m.line('not json');
m.line('');
assert.strictEqual(seen.length, before);
ok('garbage lines are ignored');

// commands: only the three known ones, and nothing is written without a running helper
let wrote = [];
m.proc = { stdin: { write: (t) => wrote.push(t) } };
for (const c of ['playpause', 'next', 'prev', 'rm -rf', 'open', '']) m.command(c);
assert.deepStrictEqual(wrote, ['playpause\n', 'next\n', 'prev\n']);
m.proc = null;
m.command('playpause');
assert.strictEqual(wrote.length, 3);
ok('only playpause/next/prev are forwarded to the helper');

console.log(`\n${passed} music checks passed`);
