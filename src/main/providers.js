const { EventEmitter } = require('events');
const theme = require('../theme');

// Chat with other models over their own web APIs. Every provider has the same small surface as the Claude one
// (src/main/chat.js): send(text, image) / stop() / reset() / busy, and emits 'event' with
//   { type: 'start' } { type: 'delta', text } { type: 'done', text } { type: 'error', message, code? } { type: 'stopped' }
// so the notch treats them all alike. The conversation is kept here (text only; a screenshot goes with its own
// message and is not kept).

const MAX_TURNS = 24; // messages kept for context (12 exchanges)

// what the notch lists; claude is handled by chat.js, the rest by the classes below
const META = {
  claude: { id: 'claude', label: 'Claude', needsKey: false, how: 'Uses your Claude Code sign-in.' },
  gemini: { id: 'gemini', label: 'Gemini', needsKey: true, keyUrl: 'https://aistudio.google.com/apikey', how: 'Free key from Google AI Studio.' },
  openai: { id: 'openai', label: 'ChatGPT', needsKey: true, keyUrl: 'https://platform.openai.com/api-keys', how: 'API key from your OpenAI account.' },
  ollama: { id: 'ollama', label: 'Local (Ollama)', needsKey: false, how: 'Runs on your PC. Needs Ollama installed.' },
};

// Server-sent events: yields the text of each `data:` line. NDJSON (ollama) is handled by ndjson().
async function* lines(stream, signal) {
  const reader = stream.getReader();
  const dec = new TextDecoder();
  let buf = '';
  try {
    for (;;) {
      if (signal && signal.aborted) return;
      const { value, done } = await reader.read();
      if (done) break;
      buf += dec.decode(value, { stream: true });
      let i;
      while ((i = buf.indexOf('\n')) >= 0) {
        const line = buf.slice(0, i).replace(/\r$/, '');
        buf = buf.slice(i + 1);
        yield line;
      }
    }
    if (buf.trim()) yield buf.trim();
  } finally {
    try {
      reader.releaseLock();
    } catch {}
  }
}

class ApiChat extends EventEmitter {
  // config: { id, model, baseUrl }; getKey() -> string | null; fetchFn for tests
  constructor({ id, model, baseUrl, getKey = () => null, fetchFn }) {
    super();
    this.id = id;
    this.label = META[id].label;
    this.model = model;
    this.baseUrl = baseUrl;
    this.getKey = getKey;
    this.fetch = fetchFn || ((...a) => fetch(...a));
    this.history = []; // { role: 'user' | 'assistant', text }
    this.busy = false;
    this.stopped = false;
    this.abort = null;
  }

  // subclasses: request(history, text, image, key) -> { url, headers, body }
  // and       read(res, signal) -> async generator of text pieces
  send(text, image) {
    text = String(text || '').trim();
    const okImage = image && /^image\/(jpeg|png)$/.test(image.mediaType) && typeof image.data === 'string' && image.data.length > 0 && image.data.length <= theme.chat.maxImageBytes;
    if (image && !okImage) return false;
    if ((!text && !okImage) || this.busy || text.length > theme.chat.maxChars) return false;
    if (okImage && !text) text = theme.chat.screenPrompt;
    const key = this.getKey();
    this.busy = true;
    this.stopped = false;
    this.emit('event', { type: 'start' });
    if (META[this.id].needsKey && !key) {
      this.busy = false;
      this.emit('event', { type: 'error', code: 'no-key', message: `Add your ${this.label} key to chat with ${this.label}.` });
      return true;
    }
    this.run(text, okImage ? image : null, key).catch((e) => this.fail(e));
    return true;
  }

  async run(text, image, key) {
    const ctl = new AbortController();
    this.abort = ctl;
    let idle = setTimeout(() => ctl.abort(new Error('timeout')), theme.chat.thinkingTimeoutSeconds * 1000);
    const bump = () => {
      clearTimeout(idle);
      idle = setTimeout(() => ctl.abort(new Error('timeout')), theme.chat.thinkingTimeoutSeconds * 1000);
    };
    let acc = '';
    try {
      const req = this.request(this.history.slice(-MAX_TURNS), text, image, key);
      const res = await this.fetch(req.url, { method: 'POST', headers: { 'content-type': 'application/json', ...req.headers }, body: JSON.stringify(req.body), signal: ctl.signal });
      if (!res.ok) throw await this.httpError(res);
      for await (const piece of this.read(res, ctl.signal)) {
        if (!piece) continue;
        bump();
        acc += piece;
        this.emit('event', { type: 'delta', text: piece });
      }
      if (ctl.signal.aborted && this.stopped) throw new Error('stopped');
      if (!acc.trim()) throw Object.assign(new Error(`${this.label} sent back an empty answer.`), { friendly: true });
      this.history.push({ role: 'user', text }, { role: 'assistant', text: acc });
      this.busy = false;
      this.abort = null;
      this.emit('event', { type: 'done', text: acc });
    } catch (e) {
      if (this.stopped) {
        this.busy = false;
        this.abort = null;
        return this.emit('event', { type: 'stopped', text: acc });
      }
      throw e;
    } finally {
      clearTimeout(idle);
    }
  }

  async httpError(res) {
    let detail = '';
    try {
      const j = await res.json();
      detail = (j && (j.error && (j.error.message || j.error))) || j.message || '';
      if (typeof detail !== 'string') detail = JSON.stringify(detail);
    } catch {}
    const e = new Error(detail);
    e.status = res.status;
    return e;
  }

  fail(e) {
    this.busy = false;
    this.abort = null;
    this.emit('event', { type: 'error', code: e && e.status === 401 ? 'bad-key' : undefined, message: this.explain(e) });
  }

  explain(e) {
    const s = e && e.status;
    const detail = String((e && e.message) || '').slice(0, 200);
    if (e && e.friendly) return e.message;
    if (s === 401 || s === 403 || (s === 400 && /api key|api_key|invalid key/i.test(detail))) return `${this.label} did not accept that key. Check it in the chat settings.`;
    if (s === 429) return `${this.label} says you have hit a rate limit or your quota. Try again in a bit.`;
    if (s === 404) return `${this.label} could not find the model "${this.model}". Change it in the config file (providerModels).`;
    if (s) return `${this.label} returned an error (${s}). ${detail}`.trim();
    if (e && /timeout/.test(String(e.message))) return `${this.label} took too long to answer.`;
    return this.offline(e);
  }

  offline() {
    return `Could not reach ${this.label}. Check your internet connection.`;
  }

  stop() {
    if (!this.busy || !this.abort) return;
    this.stopped = true;
    try {
      this.abort.abort(new Error('stopped'));
    } catch {}
  }

  reset() {
    this.stop();
    this.history = [];
  }
}

class Gemini extends ApiChat {
  constructor(o) {
    super({ id: 'gemini', baseUrl: 'https://generativelanguage.googleapis.com', ...o });
  }
  request(history, text, image, key) {
    const parts = (t, img) => [...(img ? [{ inlineData: { mimeType: img.mediaType, data: img.data } }] : []), { text: t }];
    return {
      url: `${this.baseUrl}/v1beta/models/${encodeURIComponent(this.model)}:streamGenerateContent?alt=sse`,
      headers: { 'x-goog-api-key': key },
      body: {
        systemInstruction: { parts: [{ text: theme.chat.systemPrompt }] },
        contents: [...history.map((m) => ({ role: m.role === 'user' ? 'user' : 'model', parts: [{ text: m.text }] })), { role: 'user', parts: parts(text, image) }],
      },
    };
  }
  async *read(res, signal) {
    for await (const line of lines(res.body, signal)) {
      if (!line.startsWith('data:')) continue;
      let j;
      try {
        j = JSON.parse(line.slice(5));
      } catch {
        continue;
      }
      if (j.promptFeedback && j.promptFeedback.blockReason) throw Object.assign(new Error(`${this.label} declined to answer that.`), { friendly: true });
      const c = j.candidates && j.candidates[0];
      const t = c && c.content && c.content.parts ? c.content.parts.map((p) => p.text || '').join('') : '';
      if (t) yield t;
    }
  }
}

class OpenAI extends ApiChat {
  constructor(o) {
    super({ id: 'openai', baseUrl: 'https://api.openai.com', ...o });
  }
  request(history, text, image, key) {
    const user = image ? [{ type: 'text', text }, { type: 'image_url', image_url: { url: `data:${image.mediaType};base64,${image.data}` } }] : text;
    return {
      url: `${this.baseUrl}/v1/chat/completions`,
      headers: { authorization: `Bearer ${key}` },
      body: { model: this.model, stream: true, messages: [{ role: 'system', content: theme.chat.systemPrompt }, ...history.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: user }] },
    };
  }
  async *read(res, signal) {
    for await (const line of lines(res.body, signal)) {
      if (!line.startsWith('data:')) continue;
      const d = line.slice(5).trim();
      if (d === '[DONE]') return;
      let j;
      try {
        j = JSON.parse(d);
      } catch {
        continue;
      }
      const t = j.choices && j.choices[0] && j.choices[0].delta && j.choices[0].delta.content;
      if (t) yield t;
    }
  }
}

class Ollama extends ApiChat {
  constructor(o) {
    super({ id: 'ollama', baseUrl: 'http://127.0.0.1:11434', ...o });
  }
  request(history, text, image) {
    return {
      url: `${this.baseUrl}/api/chat`,
      headers: {},
      body: {
        model: this.model,
        stream: true,
        messages: [{ role: 'system', content: theme.chat.systemPrompt }, ...history.map((m) => ({ role: m.role, content: m.text })), { role: 'user', content: text, ...(image ? { images: [image.data] } : {}) }],
      },
    };
  }
  async *read(res, signal) {
    for await (const line of lines(res.body, signal)) {
      if (!line.trim()) continue;
      let j;
      try {
        j = JSON.parse(line);
      } catch {
        continue;
      }
      if (j.error) throw Object.assign(new Error(String(j.error).slice(0, 200)), { friendly: true });
      const t = j.message && j.message.content;
      if (t) yield t;
      if (j.done) return;
    }
  }
  offline() {
    return 'Ollama is not running. Start it (or install it from ollama.com) and try again.';
  }
  explain(e) {
    if (e && e.status === 404) return `Ollama does not have the model "${this.model}". Run: ollama pull ${this.model}`;
    return super.explain(e);
  }
}

module.exports = { META, Gemini, OpenAI, Ollama, ApiChat, lines, MAX_TURNS };
