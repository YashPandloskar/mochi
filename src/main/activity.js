const { EventEmitter } = require('events');
const theme = require('../theme');

// What the assistant side of mochi is doing: a chat request, or a ping from another tool.
// Deliberately separate from SessionState, which stays the single owner of Claude Code's jobs and approvals.
//
//   phase: 'idle' | 'thinking' | 'replying' | 'needs' | 'done' | 'error'
//   snapshot(): { source: 'chat' | 'ping' | null, label, phase, message, startedAt, finishedAt, chatsToday }
const STATES = new Set(['working', 'needs', 'done', 'idle', 'error']);
const clean = (v, max) => String(v == null ? '' : v).replace(/[\u0000-\u001f\u007f]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, max);

class Activity extends EventEmitter {
  constructor({ chats = { date: '', count: 0 }, onChats } = {}) {
    super();
    this.chats = chats;
    this.onChats = onChats;
    this.s = { source: null, label: '', phase: 'idle', message: '', startedAt: null, finishedAt: null };
    this.timer = null;
    this.sweeper = setInterval(() => this.sweep(), 5000);
    if (this.sweeper.unref) this.sweeper.unref();
  }

  snapshot() {
    const today = new Date().toLocaleDateString('sv');
    return { ...this.s, chatsToday: this.chats.date === today ? this.chats.count : 0 };
  }

  set(patch) {
    clearTimeout(this.timer);
    this.s = { ...this.s, ...patch };
    if (this.s.phase === 'done' || this.s.phase === 'error') {
      const secs = this.s.phase === 'done' ? theme.timings.doneToIdleSeconds : theme.timings.assistantErrorSeconds;
      this.timer = setTimeout(() => {
        this.s = { ...this.s, phase: 'idle' };
        this.emit('change', this.snapshot());
      }, secs * 1000);
      if (this.timer.unref) this.timer.unref();
    }
    this.emit('change', this.snapshot());
  }

  // chat events from the hub: { type: 'start' | 'delta' | 'done' | 'error' | 'stopped', provider, ... }
  chat(ev, label) {
    const base = { source: 'chat', label: clean(label, 40) };
    if (ev.type === 'start') this.set({ ...base, phase: 'thinking', message: '', startedAt: Date.now(), finishedAt: null });
    else if (ev.type === 'delta') {
      if (this.s.source !== 'chat' || this.s.phase !== 'replying') this.set({ ...base, phase: 'replying', startedAt: this.s.startedAt || Date.now() });
    } else if (ev.type === 'done') {
      this.countChat();
      this.set({ ...base, phase: 'done', message: clean(ev.text, 400), finishedAt: Date.now() });
    } else if (ev.type === 'error') this.set({ ...base, phase: 'error', message: clean(ev.message, 200), finishedAt: Date.now() });
    else if (ev.type === 'stopped') this.set({ ...base, phase: 'idle', message: '' });
  }

  // { state: 'working' | 'needs' | 'done' | 'idle' | 'error', label, message } from another tool. Returns false if invalid.
  ping(body) {
    if (!body || typeof body !== 'object' || !STATES.has(body.state)) return false;
    const base = { source: 'ping', label: clean(body.label, 40) || 'Assistant', message: clean(body.message, 300) };
    if (body.state === 'working') this.set({ ...base, phase: 'thinking', startedAt: this.s.source === 'ping' && this.s.phase === 'thinking' && this.s.startedAt ? this.s.startedAt : Date.now(), finishedAt: null });
    else if (body.state === 'needs') this.set({ ...base, phase: 'needs' });
    else if (body.state === 'done') this.set({ ...base, phase: 'done', finishedAt: Date.now() });
    else if (body.state === 'error') this.set({ ...base, phase: 'error', finishedAt: Date.now() });
    else this.set({ ...base, phase: 'idle', message: '' });
    return true;
  }

  countChat() {
    const today = new Date().toLocaleDateString('sv');
    if (this.chats.date !== today) this.chats = { date: today, count: 0 };
    this.chats.count += 1;
    if (this.onChats) this.onChats(this.chats);
  }

  // a tool that said "working" and then went quiet must not leave the notch busy forever
  sweep() {
    if (this.s.source === 'ping' && (this.s.phase === 'thinking' || this.s.phase === 'needs') && Date.now() - (this.s.startedAt || 0) > theme.timings.staleWorkingSeconds * 1000) {
      this.set({ phase: 'idle', message: '' });
    }
  }

  stop() {
    clearInterval(this.sweeper);
    clearTimeout(this.timer);
  }
}

module.exports = Activity;
