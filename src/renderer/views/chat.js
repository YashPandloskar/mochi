// Chat tab: day-to-day questions to Claude (through your own Claude Code login, no API key).
// ChatView.create({ onPinChange }) -> { el, handle(event), pinned(), recentlyActive(minutes), onWindowBlur() }
//
// The notch normally never takes keyboard focus. Clicking the input asks main for focus (focusWindow),
// and focus is handed back on Esc, when the window loses it, or when the notch closes.
// While you are typing or an answer is arriving the panel stays open (pinned()).
(() => {
  const theme = window.mochi.theme;
  const C = theme.chat;

  function create({ onPinChange }) {
    const el = document.createElement('div');
    el.className = 'chat-view';
    el.innerHTML = `
      <div class="chat-head">
        <div class="chat-title">Chat <span>with Claude</span></div>
        <button class="chat-new" data-r="new" type="button">New chat</button>
      </div>
      <div class="chat-list" data-r="list">
        <div class="chat-empty" data-r="empty">
          <div class="chat-empty-mochi"></div>
          <div class="chat-empty-text">Ask me anything: plan something, explain something, draft a message.</div>
          <div class="chat-chips" data-r="chips"></div>
        </div>
      </div>
      <div class="chat-input">
        <textarea data-r="ta" rows="1" maxlength="${C.maxChars}" placeholder="Ask Claude anything…"></textarea>
        <button class="chat-send" data-r="send" type="button" title="Send"></button>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.querySelector('.chat-empty-mochi').appendChild(Mochi.create({ mood: 'happy', size: 44 }).el);
    el.appendChild(Nav.create().el);

    let busy = false;
    let inputFocused = false;
    let current = null; // the assistant message being filled in
    let acc = '';
    let hasMessages = false;
    let lastActive = 0;
    let renderTimer = null;

    const setSend = () => {
      r.send.innerHTML = busy ? Icons.stop(14) : Icons.send(16);
      r.send.title = busy ? 'Stop' : 'Send';
      r.send.classList.toggle('stop', busy);
    };
    setSend();

    const nearBottom = () => r.list.scrollHeight - r.list.scrollTop - r.list.clientHeight < 70;
    const toBottom = () => (r.list.scrollTop = r.list.scrollHeight);

    function add(role) {
      r.empty.hidden = true;
      hasMessages = true;
      const m = document.createElement('div');
      m.className = `msg ${role}`;
      r.list.appendChild(m);
      return m;
    }

    function paint() {
      if (!current) return;
      const stick = nearBottom();
      current.innerHTML = acc ? Md.render(acc) : '<span class="dots"><i></i><i></i><i></i></span>';
      if (stick) toBottom();
    }
    const paintSoon = () => {
      if (renderTimer) return;
      renderTimer = setTimeout(() => {
        renderTimer = null;
        paint();
      }, 60);
    };

    function send(text) {
      text = (text || r.ta.value).trim();
      if (!text || busy) return;
      lastActive = Date.now();
      const u = add('user');
      u.textContent = text;
      r.ta.value = '';
      autosize();
      current = add('assistant');
      acc = '';
      paint();
      toBottom();
      window.mochi.chatSend(text);
    }

    function autosize() {
      r.ta.style.height = 'auto';
      r.ta.style.height = Math.min(96, r.ta.scrollHeight) + 'px';
      r.ta.style.overflowY = r.ta.scrollHeight > 96 ? 'auto' : 'hidden'; // no scroll arrows for one or two lines
    }

    function releaseFocus() {
      inputFocused = false;
      window.mochi.focusWindow(false);
      onPinChange();
    }

    // ---- input ----
    r.ta.addEventListener('mousedown', () => {
      if (!inputFocused) {
        window.mochi.focusWindow(true); // main makes the window focusable and focuses it
        setTimeout(() => r.ta.focus(), 60);
      }
    });
    r.ta.addEventListener('focus', () => {
      inputFocused = true;
      onPinChange();
    });
    r.ta.addEventListener('blur', () => {
      inputFocused = false;
      onPinChange();
    });
    r.ta.addEventListener('input', autosize);
    r.ta.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && !e.shiftKey && !e.isComposing) {
        e.preventDefault();
        send();
      } else if (e.key === 'Escape') {
        r.ta.blur();
        releaseFocus();
      }
    });
    r.send.addEventListener('click', () => (busy ? window.mochi.chatStop() : send()));
    r.new.addEventListener('click', () => {
      window.mochi.chatNew();
      busy = false;
      current = null;
      hasMessages = false;
      for (const m of [...r.list.querySelectorAll('.msg')]) m.remove();
      r.empty.hidden = false;
      setSend();
      onPinChange();
    });

    // starter suggestions fill the input so you can finish the sentence
    C.suggestions.forEach((s) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'chat-chip';
      b.textContent = s.label;
      b.addEventListener('click', () => {
        r.ta.value = s.text;
        autosize();
        window.mochi.focusWindow(true);
        setTimeout(() => {
          r.ta.focus();
          r.ta.setSelectionRange(r.ta.value.length, r.ta.value.length);
        }, 60);
      });
      r.chips.appendChild(b);
    });

    return {
      el,
      // events from the Claude process, forwarded by main
      handle(ev) {
        lastActive = Date.now();
        if (ev.type === 'start') {
          busy = true;
          if (!current) {
            current = add('assistant');
            acc = '';
          }
          setSend();
          paint();
        } else if (ev.type === 'delta') {
          acc += ev.text;
          paintSoon();
        } else if (ev.type === 'done') {
          acc = ev.text || acc;
          busy = false;
          clearTimeout(renderTimer);
          renderTimer = null;
          paint();
          current = null;
          setSend();
          onPinChange();
        } else if (ev.type === 'stopped') {
          busy = false;
          clearTimeout(renderTimer);
          renderTimer = null;
          if (current) {
            current.innerHTML = (acc ? Md.render(acc) : '') + '<p class="note">Stopped.</p>';
            current = null;
          }
          setSend();
          onPinChange();
        } else if (ev.type === 'error') {
          busy = false;
          clearTimeout(renderTimer);
          renderTimer = null;
          if (!current) current = add('assistant');
          current.classList.add('error');
          current.textContent = ev.message;
          current = null;
          setSend();
          onPinChange();
        }
      },
      pinned: () => busy || inputFocused,
      recentlyActive: (minutes) => hasMessages && Date.now() - lastActive < minutes * 60000,
      onWindowBlur() {
        inputFocused = false;
        onPinChange();
      },
    };
  }

  window.ChatView = { create };
})();
