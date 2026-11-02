const { EventEmitter } = require('events');
const fs = require('fs');
const path = require('path');

// Quick notes and to-do, backed by one plain Markdown file you can also edit yourself:
//
//   # mochi notes
//
//   ## To-do
//   - [ ] buy milk
//   - [x] send the report
//
//   ## Note
//   anything you like, as free text
//
// Edits made in the file (any editor) appear in the notch; edits made in the notch are written to the file.
// The parser is forgiving: "- text", "[ ] text" and "[x] text" lines in the To-do section are tasks too.

const LIMITS = { todos: 200, todoChars: 500, noteChars: 50000 };

const TODO_RE = /^\s*(?:[-*+]\s*)?\[( |x|X)\]\s*(.*)$/; // - [ ] task, [x] task
const BULLET_RE = /^\s*[-*+]\s+(.*)$/; // - task (open)

function parse(text) {
  const lines = String(text || '').replace(/^﻿/, '').split(/\r?\n/);
  const todos = [];
  const note = [];
  let section = null; // 'todo' | 'note' | null (before any recognised heading)
  for (const line of lines) {
    const h = /^#{1,6}\s*(.*?)\s*#*\s*$/.exec(line);
    if (h) {
      const title = h[1].toLowerCase();
      if (/^mochi notes?$/.test(title)) continue; // the file's own title
      if (/to-?do|task/.test(title)) {
        section = 'todo';
        continue;
      }
      if (/^notes?\b/.test(title)) {
        section = 'note';
        continue;
      }
      // any other heading is ordinary content inside the note
    }
    if (section === 'note') {
      note.push(line);
      continue;
    }
    const m = TODO_RE.exec(line);
    if (m) {
      if (m[2].trim()) todos.push({ text: m[2].trim(), done: m[1] !== ' ' });
      continue;
    }
    if (section === 'todo') {
      const b = BULLET_RE.exec(line);
      if (b && b[1].trim()) todos.push({ text: b[1].trim(), done: false });
      continue;
    }
    note.push(line); // a file with no headings: lines that are not checkboxes are the note
  }
  return {
    todos: todos.slice(0, LIMITS.todos),
    note: note.join('\n').replace(/^\s*\n+/, '').replace(/\s+$/, '').slice(0, LIMITS.noteChars),
  };
}

function serialize({ todos, note }) {
  const items = (todos || []).map((t) => `- [${t.done ? 'x' : ' '}] ${String(t.text).replace(/\r?\n/g, ' ')}`);
  return `# mochi notes\n\n## To-do\n${items.join('\n')}${items.length ? '\n' : ''}\n## Note\n${String(note || '').replace(/\s+$/, '')}\n`;
}

// Keeps what the renderer sends within sane limits and the right types.
function clean(data) {
  const todos = Array.isArray(data && data.todos) ? data.todos : [];
  return {
    todos: todos
      .filter((t) => t && typeof t.text === 'string' && t.text.trim())
      .slice(0, LIMITS.todos)
      .map((t) => ({ text: t.text.replace(/\r?\n/g, ' ').trim().slice(0, LIMITS.todoChars), done: !!t.done })),
    note: typeof (data && data.note) === 'string' ? data.note.slice(0, LIMITS.noteChars) : '',
  };
}

class Notes extends EventEmitter {
  constructor({ file }) {
    super();
    this.file = file;
    this.lastText = null; // the text last written or read, to tell our own writes from your edits
    this.timer = null;
    this.watcher = null;
  }

  // Reads the file; creates it (with the template) if it does not exist yet.
  load() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch (e) {
      if (e.code !== 'ENOENT') throw e;
      text = serialize({ todos: [], note: '' });
      fs.mkdirSync(path.dirname(this.file), { recursive: true });
      this.writeAtomic(text);
    }
    this.lastText = text;
    return parse(text);
  }

  writeAtomic(text) {
    const tmp = `${this.file}.${process.pid}.tmp`;
    fs.writeFileSync(tmp, text);
    try {
      fs.renameSync(tmp, this.file);
    } catch {
      fs.renameSync(tmp, this.file); // Windows can refuse a rename onto a file that is open: retry once
    }
  }

  save(data) {
    const text = serialize(clean(data));
    if (text === this.lastText) return false;
    this.lastText = text; // set first so the file watcher recognises this as our own write
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    this.writeAtomic(text);
    return true;
  }

  // Emits 'external' with the parsed contents when the file is changed by something else.
  watch() {
    try {
      this.watcher = fs.watch(path.dirname(this.file), (_evt, name) => {
        if (name && name !== path.basename(this.file)) return;
        clearTimeout(this.timer);
        this.timer = setTimeout(() => this.check(), 250);
      });
      this.watcher.on('error', () => {});
    } catch {}
  }

  check() {
    let text;
    try {
      text = fs.readFileSync(this.file, 'utf8');
    } catch {
      return;
    }
    if (text === this.lastText) return; // our own write
    this.lastText = text;
    this.emit('external', parse(text));
  }

  stop() {
    clearTimeout(this.timer);
    this.watcher && this.watcher.close();
  }
}

module.exports = Notes;
module.exports.parse = parse;
module.exports.serialize = serialize;
module.exports.clean = clean;
module.exports.LIMITS = LIMITS;
