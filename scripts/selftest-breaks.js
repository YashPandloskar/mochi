// Break reminder logic with a fake clock (no waiting, no Electron).   npm test
const assert = require('assert');
const BreakTimer = require('../src/main/breaks');
const theme = require('../src/theme');

const MIN = 60000;
const P = theme.personality;
let clock = 1_000_000;
let allowed = true;
const b = new BreakTimer({ now: () => clock, canFire: () => allowed });
const fired = [];
b.on('due', (i) => fired.push(i));
const advance = (min, stepMin = 1) => {
  for (let m = 0; m < min; m += stepMin) {
    clock += stepMin * MIN;
    b.activity(); // Claude keeps working
    b.tick();
  }
};
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

b.activity();
advance(P.breakMinutes - 2);
assert.strictEqual(fired.length, 0);
advance(4);
assert.strictEqual(fired.length, 1);
assert.ok(fired[0].minutes >= P.breakMinutes - 1, 'reports roughly the minutes worked');
ok(`fires once after ~${P.breakMinutes} minutes of continuous work`);

advance(10);
assert.strictEqual(fired.length, 1, 'does not nag again while the reminder is open');
ok('does not repeat while the reminder is pending');

b.snooze();
advance(P.breakSnoozeMinutes - 2);
assert.strictEqual(fired.length, 1);
advance(4);
assert.strictEqual(fired.length, 2);
ok(`snooze asks again after ${P.breakSnoozeMinutes} minutes`);

b.done();
advance(P.breakMinutes - 5);
assert.strictEqual(fired.length, 2, 'a taken break starts a fresh cycle');
advance(8);
assert.strictEqual(fired.length, 3);
ok('after a break is taken, the next one comes a full cycle later');

// a long gap without activity is itself a break
b.done();
b.activity();
advance(30);
clock += (P.breakGapMinutes + 2) * MIN; // away from the keyboard
b.tick();
b.activity();
advance(30);
assert.strictEqual(fired.length, 3, 'worked 30 + gap + 30: no reminder, the gap reset the clock');
ok('a gap in activity resets the work clock');

// never fires while paused / in a game / personality off
allowed = false;
b.done();
b.activity();
advance(P.breakMinutes + 5);
assert.strictEqual(fired.length, 3);
allowed = true;
b.tick();
assert.strictEqual(fired.length, 4, 'fires as soon as it is allowed again');
ok('held back while not allowed, delivered when allowed');

console.log(`\n${passed} break-timer checks passed`);
