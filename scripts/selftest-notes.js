// Notes file: parsing, saving, and noticing edits made outside mochi.   npm test
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Notes = require('../src/main/notes');
const { parse, serialize, clean, LIMITS } = Notes;
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------- the format ----------
const sample = '# mochi notes\n\n## To-do\n- [ ] buy milk\n- [x] send the report\n\n## Note\nfirst line\n\nsecond paragraph\n';
assert.deepStrictEqual(parse(sample), { todos: [{ text: 'buy milk', done: false }, { text: 'send the report', done: true }], note: 'first line\n\nsecond paragraph' });
assert.strictEqual(serialize(parse(sample)), sample);
ok('parses the template and writes it back byte for byte');

assert.strictEqual(serialize({ todos: [], note: '' }), '# mochi notes\n\n## To-do\n\n## Note\n\n');
assert.deepStrictEqual(parse(serialize({ todos: [], note: '' })), { todos: [], note: '' });
ok('an empty file round-trips');

const lenient = parse('## Tasks\n* [X] done one\n- plain bullet\n[ ] bare box\n\n## Notes\nhello\n## Ideas\nstill the note');
assert.deepStrictEqual(lenient.todos, [{ text: 'done one', done: true }, { text: 'plain bullet', done: false }, { text: 'bare box', done: false }]);
assert.strictEqual(lenient.note, 'hello\n## Ideas\nstill the note');
ok('hand-written files are understood: other bullet styles, [X], "Tasks"/"Notes" headings, headings inside the note');

const noHeadings = parse('- [ ] one\n- [x] two\njust some text\nmore text');
assert.deepStrictEqual(noHeadings.todos, [{ text: 'one', done: false }, { text: 'two', done: true }]);
assert.strictEqual(noHeadings.note, 'just some text\nmore text');
ok('a file with no headings: checkboxes are tasks, the rest is the note');

assert.deepStrictEqual(parse('﻿# mochi notes\r\n\r\n## To-do\r\n- [ ] windows line\r\n\r\n## Note\r\nhi\r\n'), { todos: [{ text: 'windows line', done: false }], note: 'hi' });
ok('Windows line endings and a byte-order mark are fine');

// ---------- cleaning what the notch sends ----------
const cl = clean({ todos: [{ text: '  keep  ', done: 1 }, { text: '   ' }, { text: 5 }, null, { text: 'a\nb', done: false }], note: 'n' });
assert.deepStrictEqual(cl, { todos: [{ text: 'keep', done: true }, { text: 'a b', done: false }], note: 'n' });
assert.strictEqual(clean({ todos: Array.from({ length: 500 }, (_, i) => ({ text: 't' + i })) }).todos.length, LIMITS.todos);
assert.strictEqual(clean({ todos: [{ text: 'x'.repeat(2000) }] }).todos[0].text.length, LIMITS.todoChars);
assert.strictEqual(clean({ note: 'y'.repeat(100000) }).note.length, LIMITS.noteChars);
assert.deepStrictEqual(clean(null), { todos: [], note: '' });
assert.deepStrictEqual(clean({ todos: 'nope', note: 42 }), { todos: [], note: '' });
ok('bad or oversized input is cleaned and limited');

(async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'mochi-notes-'));
  const file = path.join(dir, 'sub', 'notes.md');

  // ---------- the file ----------
  const n = new Notes({ file });
  assert.deepStrictEqual(n.load(), { todos: [], note: '' });
  assert.ok(fs.existsSync(file), 'the file is created on first load');
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mochi notes\n\n## To-do\n\n## Note\n\n');
  ok('the file and its folder are created with the template');

  assert.strictEqual(n.save({ todos: [{ text: 'one', done: false }], note: 'hello' }), true);
  assert.strictEqual(fs.readFileSync(file, 'utf8'), '# mochi notes\n\n## To-do\n- [ ] one\n\n## Note\nhello\n');
  assert.strictEqual(n.save({ todos: [{ text: 'one', done: false }], note: 'hello' }), false, 'identical content is not rewritten');
  assert.deepStrictEqual(fs.readdirSync(path.dirname(file)), ['notes.md'], 'no temp files are left behind');
  ok('saving writes the Markdown atomically and skips identical content');

  // ---------- edits made outside mochi ----------
  const external = [];
  n.on('external', (d) => external.push(d));
  n.watch();
  n.save({ todos: [{ text: 'two', done: false }], note: 'ours' });
  await sleep(700);
  assert.strictEqual(external.length, 0, 'mochi\'s own writes are not reported back as external edits');
  ok('its own writes are not mistaken for outside edits');

  fs.writeFileSync(file, '# mochi notes\n\n## To-do\n- [x] edited in notepad\n- [ ] and added\n\n## Note\nchanged outside\n');
  await sleep(900);
  assert.strictEqual(external.length, 1);
  assert.deepStrictEqual(external[0], { todos: [{ text: 'edited in notepad', done: true }, { text: 'and added', done: false }], note: 'changed outside' });
  ok('an edit made in another editor is noticed and parsed');

  // a replace-by-rename save (how many editors write)
  const tmp = file + '.editor';
  fs.writeFileSync(tmp, '# mochi notes\n\n## To-do\n- [ ] via rename\n\n## Note\n\n');
  fs.renameSync(tmp, file);
  await sleep(900);
  assert.strictEqual(external.length, 2);
  assert.deepStrictEqual(external[1].todos, [{ text: 'via rename', done: false }]);
  ok('editors that save by replacing the file are noticed too');

  // saving after an outside edit writes the new state, not a stale one
  n.save({ todos: [{ text: 'via rename', done: true }], note: '' });
  assert.ok(fs.readFileSync(file, 'utf8').includes('- [x] via rename'));
  n.stop();
  ok('saving after an outside edit works');

  // ---------- when Windows refuses the write ----------
  const eperm = () => Object.assign(new Error('operation not permitted'), { code: 'EPERM' });
  const realRename = fs.renameSync;
  const realWrite = fs.writeFileSync;
  const f2 = path.join(dir, 'flaky', 'notes.md');
  const flaky = new Notes({ file: f2 });
  flaky.load();
  const ext2 = [];
  flaky.on('external', (d) => ext2.push(d));

  // a rename that fails twice and then works: retried, the task is saved
  let fails = 2;
  fs.renameSync = (...a) => (fails-- > 0 ? (() => { throw eperm(); })() : realRename(...a));
  try {
    assert.strictEqual(flaky.save({ todos: [{ text: 'saved after retries', done: false }], note: '' }), true);
  } finally {
    fs.renameSync = realRename;
  }
  assert.ok(fs.readFileSync(f2, 'utf8').includes('saved after retries'));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f2)), ['notes.md'], 'no temp file left behind');
  ok('a rename that fails briefly is retried and the task is saved');

  // a rename that never works: the file is overwritten directly instead
  fs.renameSync = () => { throw eperm(); };
  try {
    assert.strictEqual(flaky.save({ todos: [{ text: 'saved by fallback', done: false }], note: '' }), true);
  } finally {
    fs.renameSync = realRename;
  }
  assert.ok(fs.readFileSync(f2, 'utf8').includes('saved by fallback'));
  assert.deepStrictEqual(fs.readdirSync(path.dirname(f2)), ['notes.md']);
  ok('if renaming never works, the file is overwritten directly rather than losing the task');

  // nothing works at all: the save throws, nothing is recorded as saved, and a stale file is not mistaken for the truth
  const before = fs.readFileSync(f2, 'utf8');
  fs.renameSync = () => { throw eperm(); };
  fs.writeFileSync = () => { throw eperm(); };
  let threw = false;
  try {
    flaky.save({ todos: [{ text: 'will fail', done: false }], note: '' });
  } catch (e) {
    threw = e.code === 'EPERM';
  } finally {
    fs.renameSync = realRename;
    fs.writeFileSync = realWrite;
  }
  assert.strictEqual(threw, true, 'a failed save is reported, not swallowed');
  assert.strictEqual(fs.readFileSync(f2, 'utf8'), before);
  flaky.check(); // the file on disk is the old content: that is NOT an outside edit
  assert.strictEqual(ext2.length, 0, 'the old file is not reported as an outside edit (which would revert the list in the notch)');
  assert.strictEqual(flaky.save({ todos: [{ text: 'will fail', done: false }], note: '' }), true, 'the same change is tried again, not skipped as "already saved"');
  assert.ok(fs.readFileSync(f2, 'utf8').includes('will fail'));
  ok('a save that fails completely is reported, not marked as saved, and succeeds when retried');

  console.log(`\n${passed} notes checks passed`);
  fs.rmSync(dir, { recursive: true, force: true });
  process.exit(0);
})().catch((e) => {
  console.error('FAIL', e);
  process.exit(1);
});
