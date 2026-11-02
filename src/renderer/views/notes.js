// Notes tab: a to-do list and a quick note, kept in a Markdown file (notes.md) that you can also edit yourself.
// Edits in the notch are saved to the file; edits made to the file elsewhere appear here.
// NotesView.create() -> { el, update({ todos, note, file }) }
(() => {
  const theme = window.mochi.theme;
  const N = theme.notes;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function create() {
    const el = document.createElement('div');
    el.className = 'notes-view';
    el.innerHTML = `
      <div class="nt-cols">
        <div class="nt-col nt-todo">
          <div class="nt-head"><b>To-do</b><span data-r="count">Nothing yet</span><button class="nt-link" data-r="clear" type="button" title="Remove the ticked tasks">Clear done</button></div>
          <div class="nt-list" data-r="list"></div>
          <div class="nt-add"><input data-r="add" type="text" maxlength="500" placeholder="${esc(N.placeholderTask)}"><button class="nt-plus" data-r="plus" type="button" title="Add the task">+</button></div>
        </div>
        <div class="nt-col nt-notecol">
          <div class="nt-head"><b>Quick note</b><button class="nt-link" data-r="open" type="button" title="Open notes.md in your editor">Open file</button></div>
          <textarea data-r="note" placeholder="${esc(N.placeholderNote)}" maxlength="50000"></textarea>
        </div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.appendChild(Nav.create().el);
    Typing.watch(r.add);
    Typing.watch(r.note);

    let todos = [];
    let editing = -1; // index of the task being renamed
    let saveTimer = null;

    const send = () => window.mochi.notesSave({ todos: todos.map((t) => ({ text: t.text, done: t.done })), note: r.note.value });
    const saveNow = () => {
      clearTimeout(saveTimer);
      send();
    };
    const saveSoon = () => {
      clearTimeout(saveTimer);
      saveTimer = setTimeout(send, N.saveDelayMs);
    };

    function render() {
      const done = todos.filter((t) => t.done).length;
      r.count.textContent = todos.length ? `${done} of ${todos.length} done` : 'Nothing yet';
      r.clear.hidden = !done;
      r.list.replaceChildren();
      if (!todos.length) {
        const empty = document.createElement('div');
        empty.className = 'nt-empty';
        empty.textContent = 'No tasks yet. Add one below.';
        r.list.appendChild(empty);
        return;
      }
      todos.forEach((t, i) => {
        const row = document.createElement('div');
        row.className = 'nt-item' + (t.done ? ' done' : '');
        const box = document.createElement('button');
        box.type = 'button';
        box.className = 'nt-box';
        box.setAttribute('role', 'checkbox');
        box.setAttribute('aria-checked', String(t.done));
        box.innerHTML = t.done ? Icons.check(12) : '';
        box.addEventListener('click', () => {
          t.done = !t.done;
          render();
          saveNow();
        });
        row.appendChild(box);

        if (editing === i) {
          const inp = document.createElement('input');
          inp.className = 'nt-edit';
          inp.type = 'text';
          inp.maxLength = 500;
          inp.value = t.text;
          Typing.watch(inp);
          let finished = false;
          const finish = (commit) => {
            if (finished) return;
            finished = true;
            const v = inp.value.trim();
            if (commit && v) t.text = v;
            else if (commit && !v) todos.splice(i, 1); // an emptied task is removed
            editing = -1;
            render();
            if (commit) saveNow();
          };
          inp.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') finish(true);
            else if (e.key === 'Escape') finish(false);
          });
          inp.addEventListener('blur', () => finish(true));
          row.appendChild(inp);
          setTimeout(() => {
            window.mochi.focusWindow(true);
            setTimeout(() => inp.focus(), 60);
          }, 0);
        } else {
          const text = document.createElement('span');
          text.className = 'nt-text';
          text.textContent = t.text;
          text.title = 'Double-click to rename';
          text.addEventListener('dblclick', () => {
            editing = i;
            render();
          });
          row.appendChild(text);
          const del = document.createElement('button');
          del.type = 'button';
          del.className = 'nt-del';
          del.title = 'Delete the task';
          del.textContent = '✕';
          del.addEventListener('click', () => {
            todos.splice(i, 1);
            render();
            saveNow();
          });
          row.appendChild(del);
        }
        r.list.appendChild(row);
      });
    }

    function add() {
      const v = r.add.value.trim();
      if (!v) return;
      todos.push({ text: v, done: false });
      r.add.value = '';
      render();
      r.list.scrollTop = r.list.scrollHeight;
      saveNow();
    }
    r.add.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') add();
    });
    r.plus.addEventListener('click', add);
    r.clear.addEventListener('click', () => {
      todos = todos.filter((t) => !t.done);
      render();
      saveNow();
    });
    r.open.addEventListener('click', () => window.mochi.notesOpen());
    r.note.addEventListener('input', saveSoon);
    r.note.addEventListener('blur', saveNow);

    return {
      el,
      // from main: the file was read at start-up, or changed by another editor
      update(d) {
        if (!d) return;
        if (editing < 0) {
          todos = (d.todos || []).map((t) => ({ text: t.text, done: !!t.done }));
          render();
        }
        if (document.activeElement !== r.note) r.note.value = d.note || ''; // never overwrite what you are typing
        if (d.file) r.open.title = `Open ${d.file}`;
      },
    };
  }

  window.NotesView = { create };
})();
