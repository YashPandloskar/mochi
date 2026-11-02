const { EventEmitter } = require('events');
const path = require('path');
const theme = require('../theme');

const READ = new Set(theme.steps.read);
const EDIT = new Set(theme.steps.edit);
const TEST_RE = new RegExp(theme.steps.testCommand, 'i');
const STEP = { read: 1, edit: 2, test: 3, done: 4 };

const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
const lines = (s, max) =>
  String(s || '')
    .split(/\r?\n/)
    .slice(0, max)
    .map((l) => clip(l, 90));

function toolSummary(name, input = {}) {
  if (name === 'Bash') return input.command || '';
  if (input.file_path) return `${name} ${input.file_path}`;
  if (input.pattern) return `${name} ${input.pattern}`;
  return name;
}

function diffFrom(name, input = {}) {
  if (name === 'Edit' && input.file_path) {
    return { file: path.basename(input.file_path), removed: lines(input.old_string, 3), added: lines(input.new_string, 3) };
  }
  if (name === 'MultiEdit' && input.file_path && Array.isArray(input.edits) && input.edits[0]) {
    const e = input.edits[0];
    return { file: path.basename(input.file_path), removed: lines(e.old_string, 3), added: lines(e.new_string, 3) };
  }
  if (name === 'Write' && input.file_path) {
    return { file: path.basename(input.file_path), removed: [], added: lines(input.content, 3) };
  }
  return null;
}

// Turns Claude Code hook events into what the notch shows.
// Tracks several sessions; the one with the latest activity is displayed.
class SessionState extends EventEmitter {
  constructor({ jobs, onJobs }) {
    super();
    this.sessions = new Map();
    this.currentId = null;
    this.pending = []; // approvals waiting for Allow/Deny, oldest first
    this.nextApprovalId = 1;
    this.jobs = jobs; // { date, count }
    this.onJobs = onJobs;
    this.override = null; // tray "Preview state"
    setInterval(() => this.sweep(), 5000).unref?.();
  }

  session(id, cwd) {
    let s = this.sessions.get(id);
    if (!s) {
      s = { id, project: '', state: 'idle', startedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', needsHint: '', lastEvent: 0, doneTimer: null };
      this.sessions.set(id, s);
    }
    if (cwd) s.project = path.basename(cwd);
    return s;
  }

  handle(ev) {
    this.emit('activity');
    const id = ev.session_id || 'unknown';
    const s = this.session(id, ev.cwd);
    const now = Date.now();
    s.lastEvent = now;
    this.currentId = id;
    this.override = null;

    switch (ev.hook_event_name) {
      case 'PreToolUse':
      case 'PostToolUse':
        this.begin(s, now);
        this.tool(s, ev);
        break;
      case 'Notification':
        if (ev.notification_type === 'permission_prompt') {
          this.begin(s, now);
          s.needsHint = ev.message || 'Claude needs your permission';
        }
        break;
      case 'Stop':
        this.stop(s, ev);
        break;
      default:
        break;
    }
    this.emitChange();
  }

  // A new job starts at the first event after idle/done; the timer counts from there.
  begin(s, now) {
    if (s.state === 'done' || s.state === 'idle') {
      clearTimeout(s.doneTimer);
      Object.assign(s, { state: 'working', startedAt: now, finishedAt: null, step: 0, diff: null, testCommand: '', testResult: '', lastMessage: '', needsHint: '' });
    }
  }

  tool(s, ev) {
    const name = ev.tool_name || '';
    const input = ev.tool_input || {};
    s.needsHint = '';
    s.state = 'working';
    if (READ.has(name)) s.step = STEP.read;
    else if (EDIT.has(name)) {
      s.step = STEP.edit;
      if (ev.hook_event_name === 'PreToolUse') s.diff = diffFrom(name, input);
    } else if (name === 'Bash' && TEST_RE.test(input.command || '')) {
      s.step = STEP.test;
      s.testCommand = clip(input.command, 120);
      if (ev.hook_event_name === 'PreToolUse') s.testResult = '';
      if (ev.hook_event_name === 'PostToolUse') {
        const out = JSON.stringify(ev.tool_response || '');
        const m = out.match(/(\d+)\s+(passed|passing)\b/i);
        if (m) s.testResult = `${m[1]} passed`;
      }
    } else if (!s.step) s.step = STEP.read;
  }

  stop(s, ev) {
    s.step = STEP.done;
    s.state = 'done';
    s.needsHint = '';
    s.lastMessage = ev.last_assistant_message || '';
    if (!s.startedAt) s.startedAt = Date.now();
    s.finishedAt = Date.now();
    if (!ev.stop_hook_active) this.countJob();
    clearTimeout(s.doneTimer);
    s.doneTimer = setTimeout(() => {
      s.state = 'idle';
      this.emitChange();
    }, theme.timings.doneToIdleSeconds * 1000);
  }

  countJob() {
    const today = new Date().toLocaleDateString('sv'); // local YYYY-MM-DD
    if (this.jobs.date !== today) this.jobs = { date: today, count: 0 };
    this.jobs.count += 1;
    this.onJobs?.(this.jobs);
  }

  sweep() {
    const now = Date.now();
    let changed = false;
    for (const s of this.sessions.values()) {
      if (s.state === 'working' && now - s.lastEvent > theme.timings.staleWorkingSeconds * 1000) {
        s.state = 'idle';
        s.startedAt = null;
        changed = true;
      }
    }
    if (changed) this.emitChange();
  }

  // ---------- approvals ----------

  // Holds until resolve() is called. Resolves with 'allow' | 'deny' | 'timeout' | 'gone'.
  requestApproval(ev) {
    this.emit('activity');
    const s = this.session(ev.session_id || 'unknown', ev.cwd);
    s.lastEvent = Date.now();
    this.currentId = s.id;
    this.override = null;
    const approval = {
      id: this.nextApprovalId++,
      requestedAt: Date.now(),
      sessionId: s.id,
      toolName: ev.tool_name || '',
      command: toolSummary(ev.tool_name, ev.tool_input),
      diff: diffFrom(ev.tool_name, ev.tool_input),
    };
    this.begin(s, Date.now());
    const promise = new Promise((resolve) => {
      approval.resolve = resolve;
    });
    this.pending.push(approval);
    this.emitChange();
    return { approval, promise };
  }

  resolve(id, decision) {
    const i = this.pending.findIndex((a) => a.id === id);
    if (i < 0) return false;
    const [a] = this.pending.splice(i, 1);
    a.resolve(decision);
    this.emitChange();
    return true;
  }

  // ---------- output ----------

  preview(state) {
    this.override = state;
    this.emit('change', this.snapshot());
  }

  demo(state) {
    const now = Date.now();
    const base = {
      project: 'webshop',
      startedAt: now - 125000,
      finishedAt: null,
      step: 2,
      diff: { file: 'checkout.ts', removed: ['const total = 0'], added: ['const total = sum(items)'] },
      testCommand: 'npm test',
      testResult: '',
      lastMessage: '',
    };
    if (state === 'done') {
      return { ...base, step: 4, startedAt: now - 7000, finishedAt: now, jobsToday: 5, testResult: '48 passed', lastMessage: 'Done! The total now adds VAT the right way. All 48 tests pass.' };
    }
    return base;
  }

  // Brings back a Done that finished while the notch was hidden (game mode / paused).
  replayDone() {
    const s = this.sessions.get(this.currentId);
    if (!s || !s.finishedAt || s.state !== 'idle') return false;
    s.state = 'done';
    clearTimeout(s.doneTimer);
    s.doneTimer = setTimeout(() => {
      s.state = 'idle';
      this.emitChange();
    }, theme.timings.doneToIdleSeconds * 1000);
    this.emitChange();
    return true;
  }

  emitChange() {
    this.emit('change', this.snapshot());
  }

  snapshot() {
    const s = this.sessions.get(this.currentId);
    let approval = this.pending[0] || null;
    if (this.override === 'needs') {
      approval = { id: -1, requestedAt: Date.now(), toolName: 'Bash', command: 'rm -rf build && npm run build', diff: null }; // tray preview sample
    }
    let state = s ? s.state : 'idle';
    if (approval || (s && s.needsHint)) state = 'needs';
    if (this.override) state = this.override;
    const demo = this.override ? this.demo(this.override) : null; // tray "Preview state" shows sample content
    return {
      state,
      preview: !!this.override, // tray "Preview state": no sounds or toasts
      ...(demo || {
        project: s ? s.project : '',
        startedAt: s ? s.startedAt : null,
        finishedAt: s ? s.finishedAt || null : null,
        step: s ? s.step : 0,
        diff: s ? s.diff : null,
        testCommand: s ? s.testCommand : '',
        testResult: s ? s.testResult : '',
        lastMessage: s ? s.lastMessage : '',
      }),
      needsText: approval ? approval.command : s ? s.needsHint : '',
      approval: approval && { id: approval.id, requestedAt: approval.requestedAt, toolName: approval.toolName, command: approval.command, diff: approval.diff },
      pendingCount: this.pending.length,
      jobsToday: demo && demo.jobsToday !== undefined ? demo.jobsToday : this.jobs.date === new Date().toLocaleDateString('sv') ? this.jobs.count : 0,
    };
  }
}

module.exports = SessionState;
