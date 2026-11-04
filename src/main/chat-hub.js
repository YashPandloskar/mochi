const { EventEmitter } = require('events');
const { META } = require('./providers');

// Picks which model answers. Every provider keeps its own conversation; switching starts a clean one.
//   hub.send(text, image) / stop() / reset()      same as a single chat
//   hub.setCurrent(id)   -> false while an answer is arriving
//   hub.list()           -> what the notch shows: id, label, hasKey, needsKey, model, keyUrl, how
// Events (all providers): { type, ..., provider: id }
class ChatHub extends EventEmitter {
  // providers: { claude, gemini, openai, ollama } each with send/stop/reset/busy and 'event'
  constructor({ providers, current = 'claude', keys, models = {} }) {
    super();
    this.providers = providers;
    this.keys = keys;
    this.models = models;
    this.currentId = providers[current] ? current : 'claude';
    for (const [id, p] of Object.entries(providers)) p.on('event', (ev) => id === this.currentId && this.emit('event', { ...ev, provider: id }));
  }

  get current() {
    return this.currentId;
  }

  get busy() {
    return !!this.providers[this.currentId].busy;
  }

  setCurrent(id) {
    if (!this.providers[id] || this.busy) return false;
    if (id !== this.currentId) {
      this.providers[this.currentId].reset();
      this.currentId = id;
      this.providers[id].reset();
    }
    return true;
  }

  send(text, image) {
    return this.providers[this.currentId].send(text, image);
  }

  stop() {
    this.providers[this.currentId].stop();
  }

  reset() {
    this.providers[this.currentId].reset();
  }

  info(id = this.currentId) {
    const m = META[id];
    return { id, label: m.label, needsKey: !!m.needsKey, hasKey: !m.needsKey || this.keys.has(id), keyUrl: m.keyUrl || null, how: m.how, model: (this.models && this.models[id]) || (this.providers[id] && this.providers[id].model) || null };
  }

  list() {
    return { current: this.currentId, encryption: this.keys.available(), providers: Object.keys(META).map((id) => this.info(id)) };
  }
}

module.exports = ChatHub;
