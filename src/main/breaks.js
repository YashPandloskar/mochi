const { EventEmitter } = require('events');
const theme = require('../theme');

// Break reminders. "Working" means Claude activity (any hook event) with no gap longer than
// breakGapMinutes. After breakMinutes of that, 'due' fires once; snooze() asks again later and
// done() starts a fresh cycle. Nothing fires while canFire() says no (paused, in a game, personality off).
class BreakTimer extends EventEmitter {
  constructor({ canFire = () => true, now = () => Date.now() } = {}) {
    super();
    const p = theme.personality;
    this.cfg = { due: p.breakMinutes * 60000, gap: p.breakGapMinutes * 60000, snooze: p.breakSnoozeMinutes * 60000 };
    this.canFire = canFire;
    this.now = now;
    this.sessionStart = 0;
    this.lastActivity = 0;
    this.dueAt = 0;
    this.pending = false;
    this.timer = null;
  }

  start() {
    this.timer = setInterval(() => this.tick(), 30000);
    this.timer.unref?.();
  }

  stop() {
    clearInterval(this.timer);
  }

  activity() {
    const t = this.now();
    // a long enough gap counts as a break already taken: start a new work session
    if (!this.sessionStart || t - this.lastActivity > this.cfg.gap) {
      this.sessionStart = t;
      this.dueAt = t + this.cfg.due;
      this.pending = false;
    }
    this.lastActivity = t;
  }

  tick() {
    const t = this.now();
    if (!this.sessionStart) return;
    if (t - this.lastActivity > this.cfg.gap) {
      this.sessionStart = 0; // idle long enough: that was a break
      this.pending = false;
      return;
    }
    if (!this.pending && t >= this.dueAt && this.canFire()) {
      this.pending = true;
      this.emit('due', { minutes: Math.round((t - this.sessionStart) / 60000) });
    }
  }

  snooze() {
    this.pending = false;
    this.dueAt = this.now() + this.cfg.snooze;
  }

  // the break was taken: a new cycle starts with the next activity
  done() {
    this.pending = false;
    this.sessionStart = 0;
  }
}

module.exports = BreakTimer;
