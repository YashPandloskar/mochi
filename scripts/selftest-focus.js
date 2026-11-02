// Pomodoro timer logic with a fake clock: whole cycles run instantly.   npm test
const assert = require('assert');
const FocusTimer = require('../src/renderer/components/focus');
const theme = require('../src/theme');
const H = theme.home;

const MIN = 60000;
let clock = new Date(2026, 10, 2, 10, 0, 0).getTime(); // 2 Nov 2026, 10:00 local
const events = { phase: [], session: [], config: [] };
const make = (extra = {}) =>
  FocusTimer.create({
    focusMinutes: 25,
    breakMinutes: 5,
    cycle: true,
    limits: { focusMin: H.focusMinMinutes, focusMax: H.focusMaxMinutes, focusStep: H.focusStepMinutes, breakMin: H.breakMinMinutes, breakMax: H.breakMaxMinutes, breakStep: H.breakStepMinutes },
    now: () => clock,
    onPhase: (p) => events.phase.push(p),
    onSession: (s) => events.session.push(s),
    onConfig: (c) => events.config.push(c),
    ...extra,
  });
const advance = (min) => {
  clock += min * MIN;
};
let passed = 0;
const ok = (n) => console.log('  ok  ' + n) || passed++;

// --- a full Pomodoro: 25 on, 5 off, 25 on ---
let t = make();
assert.deepStrictEqual([t.read().running, t.read().phase, t.read().sessions], [false, 'focus', 0]);
t.toggle();
let r = t.read();
assert.strictEqual(r.running, true);
assert.strictEqual(r.phase, 'focus');
assert.strictEqual(Math.round(r.left), 25 * 60);
advance(24.9);
assert.strictEqual(t.read().phase, 'focus');
assert.strictEqual(events.phase.length, 0, 'no chime before the switch');
advance(0.2);
r = t.read();
assert.strictEqual(r.phase, 'break');
assert.strictEqual(r.running, true);
assert.strictEqual(Math.round(r.left), 5 * 60, 'the break starts at its full length');
assert.deepStrictEqual(events.phase, [{ phase: 'break', minutes: 5 }]);
assert.strictEqual(r.sessions, 1);
ok('25 minutes of focus switch to a 5 minute break, with one chime and one session counted');

advance(5.1);
r = t.read();
assert.strictEqual(r.phase, 'focus');
assert.strictEqual(r.running, true);
assert.deepStrictEqual(events.phase.map((p) => p.phase), ['break', 'focus']);
assert.strictEqual(r.sessions, 1, 'a break is not a session');
ok('the break switches back to focus with a second chime, and does not count as a session');

advance(25.1);
assert.strictEqual(t.read().sessions, 2);
assert.strictEqual(t.read().phase, 'break');
advance(5.1);
t.read(); // the real app checks twice a second, so every phase change is seen
advance(25.1);
assert.strictEqual(t.read().sessions, 3);
assert.deepStrictEqual(events.phase.map((p) => p.phase), ['break', 'focus', 'break', 'focus', 'break']);
ok('it keeps cycling and counts each completed focus period');

// --- reset ---
t.toggle();
r = t.read();
assert.deepStrictEqual([r.running, r.phase, r.sessions], [false, 'focus', 3]);
assert.strictEqual(Math.round(r.left), 25 * 60);
const before = events.phase.length;
advance(60);
assert.strictEqual(events.phase.length, before, 'nothing happens after a reset');
ok('reset stops the cycle, keeps today\'s count and goes back to the full focus length');

t.toggle();
advance(10);
t.toggle(); // reset in the middle of a focus period
assert.strictEqual(t.read().sessions, 3, 'an unfinished focus period is not counted');
ok('resetting mid-focus does not count a session');

// --- single timer (cycle off) ---
events.phase.length = 0;
t = make({ cycle: false });
t.toggle();
advance(25.1);
r = t.read();
assert.strictEqual(r.running, false);
assert.strictEqual(r.finished, true, 'shows "Time is up" for a while');
assert.deepStrictEqual(events.phase, [{ phase: 'done', minutes: 25 }]);
assert.strictEqual(r.sessions, 1);
advance(0.1); // 6 seconds later
assert.strictEqual(t.read().finished, true);
advance(1);
assert.strictEqual(t.read().finished, false);
ok('with cycle off it finishes once, counts a session and does not start a break');

// --- lengths and limits ---
t = make();
events.config.length = 0;
assert.strictEqual(t.step('focus', +1), true);
assert.strictEqual(t.read().focusMinutes, 30);
assert.strictEqual(t.step('break', +1), true);
assert.strictEqual(t.read().breakMinutes, 6);
assert.deepStrictEqual(events.config[events.config.length - 1], { focusMinutes: 30, breakMinutes: 6, cycle: true });
for (let i = 0; i < 40; i++) t.step('focus', +1);
assert.strictEqual(t.read().focusMinutes, H.focusMaxMinutes);
for (let i = 0; i < 60; i++) t.step('break', -1);
assert.strictEqual(t.read().breakMinutes, H.breakMinMinutes);
for (let i = 0; i < 60; i++) t.step('break', +1);
assert.strictEqual(t.read().breakMinutes, H.breakMaxMinutes);
ok('focus and break lengths step within their limits and are reported for saving');

t = make();
t.toggle();
assert.strictEqual(t.step('focus', +1), false);
assert.strictEqual(t.step('break', -1), false);
assert.strictEqual(t.setCycle(false), false);
assert.deepStrictEqual([t.read().focusMinutes, t.read().breakMinutes, t.read().cycle], [25, 5, true]);
ok('lengths and the cycle switch are locked while counting');

t = make();
t.setMinutes('break', 10);
t.toggle();
advance(25.1);
assert.strictEqual(Math.round(t.read().left), 10 * 60);
ok('a changed break length is used');

// --- loading saved values ---
t = make();
events.config.length = 0;
t.loadConfig({ focusMinutes: 45, breakMinutes: 10, cycle: false });
assert.deepStrictEqual([t.read().focusMinutes, t.read().breakMinutes, t.read().cycle], [45, 10, false]);
assert.strictEqual(events.config.length, 0, 'loading saved values does not save them again');
ok('saved settings load without being saved again');

// --- the day's session count ---
t = make();
t.loadSessions({ date: new Date(clock).toLocaleDateString('sv'), count: 4 });
assert.strictEqual(t.read().sessions, 4);
events.session.length = 0;
t.toggle();
advance(25.1);
assert.strictEqual(t.read().sessions, 5);
assert.deepStrictEqual(events.session, [{ date: new Date(clock).toLocaleDateString('sv'), count: 5 }]);
ok('the day\'s count continues from the saved value and is reported for saving');

t = make();
t.loadSessions({ date: '2026-11-01', count: 7 }); // yesterday
assert.strictEqual(t.read().sessions, 0, 'a new day starts at zero');
t.toggle();
advance(25.1);
assert.strictEqual(t.read().sessions, 1);
ok('a new day starts the count at zero');

// midnight passing while the app stays open
t = make();
t.loadSessions({ date: new Date(clock).toLocaleDateString('sv'), count: 3 });
advance(15 * 60); // 10:00 -> 01:00 next day
assert.strictEqual(t.read().sessions, 0);
ok('the count resets at midnight even if mochi keeps running');

console.log(`\n${passed} focus-timer checks passed`);
