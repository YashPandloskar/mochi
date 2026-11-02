// Game mode logic (no helper process, no Electron).   npm test
const assert = require('assert');
const GameMode = require('../src/main/gamemode');
const theme = require('../src/theme');

let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

const g = new GameMode({ enabled: true });
const events = [];
g.on('change', (a) => events.push(a));

g.line('{"exe":"explorer.exe"}');
assert.strictEqual(g.active, false);
g.line('{"exe":"dota2.exe"}');
assert.strictEqual(g.active, true);
g.line('{"exe":"Discord.exe"}'); // alt-tab to Discord: the notch comes back
assert.strictEqual(g.active, false);
g.line('{"exe":"VALORANT-Win64-Shipping.exe"}');
assert.strictEqual(g.active, true);
assert.deepStrictEqual(events, [true, false, true]);
ok('hides for Dota 2 and Valorant, returns on alt-tab, one event per change');

g.line('{"exe":"valorant-win64-shipping.EXE"}');
assert.strictEqual(g.active, true);
ok('program names match case-insensitively');

g.line('{"exe":"chrome.exe"}');
assert.strictEqual(g.active, false);
g.line('{"exe":"msedge.exe"}');
g.line('{"exe":"Netflix.exe"}');
assert.strictEqual(g.active, false);
ok('browsers and video apps never hide the notch');

g.line('garbage');
g.line('{"exe":null}');
assert.strictEqual(g.active, false);
ok('garbage lines are ignored');

const off = new GameMode({ enabled: false });
off.line('{"exe":"dota2.exe"}');
assert.strictEqual(off.active, false);
ok('setting off: never hides');

g.line('{"exe":"dota2.exe"}');
g.update(''); // helper died: the notch must not stay hidden
assert.strictEqual(g.active, false);
ok('if the helper stops, the notch is shown again');

assert.deepStrictEqual(theme.games, ['VALORANT-Win64-Shipping.exe', 'dota2.exe']);
ok('game list in the theme is just your two games');

console.log(`\n${passed} game-mode checks passed`);
