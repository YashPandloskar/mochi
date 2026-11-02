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
      <div class="chat-attach" data-r="attach" hidden>
        <img data-r="thumb" alt="Screenshot">
        <span data-r="attachText">Screen attached</span>
        <button class="chat-x" data-r="x" type="button" title="Remove the screenshot">✕</button>
      </div>
      <div class="chat-input">
        <textarea data-r="ta" rows="1" maxlength="${C.maxChars}" placeholder="Ask Claude anything…"></textarea>
        <button class="chat-cam" data-r="cam" type="button" title="Attach a screenshot of your screen"></button>
        <button class="chat-send" data-r="send" type="button" title="Send"></button>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.querySelector('.chat-empty-mochi').appendChild(Mochi.create({ mood: 'happy', size: 36 }).el);
    el.appendChild(Nav.create().el);

    let busy = false;
    let capturing = false;
    let attached = null; // { base64, mediaType, url }: the screenshot that goes with the next message
    let inputFocused = false;
    let current = null; // the assistant message being filled in
    let acc = '';
    let hasMessages = false;
    let lastActive = 0;
    let renderTimer = null;

    r.cam.innerHTML = Icons.camera(16);

    // ---- screenshot: only taken when you press the camera button ----
    let noteTimer = null;
    function clearAttach() {
      attached = null;
      clearTimeout(noteTimer);
      r.attach.hidden = true;
      r.attach.classList.remove('warn');
      r.thumb.hidden = false;
      r.thumb.removeAttribute('src');
      r.ta.placeholder = 'Ask Claude anything…';
    }
    function note(text) {
      r.thumb.hidden = true;
      r.attachText.textContent = text;
      r.attach.classList.add('warn');
      r.attach.hidden = false;
      clearTimeout(noteTimer);
      noteTimer = setTimeout(() => !attached && clearAttach(), 4500);
    }
    async function attachScreen() {
      if (capturing || busy) return;
      capturing = true;
      r.cam.classList.add('busy');
      onPinChange();
      let res;
      try {
        res = await window.mochi.captureScreen();
      } catch {
        res = { error: 'Could not capture the screen.' };
      }
      capturing = false;
      r.cam.classList.remove('busy');
      if (!res || res.error) return note((res && res.error) || 'Could not capture the screen.');
      attached = { base64: res.base64, mediaType: res.mediaType, url: `data:${res.mediaType};base64,${res.base64}` };
      r.thumb.src = attached.url;
      r.thumb.hidden = false;
      r.attachText.textContent = res.black ? 'The screen looks black: some apps block screenshots' : 'Screen attached';
      r.attach.classList.toggle('warn', !!res.black);
      r.attach.hidden = false;
      r.ta.placeholder = 'Ask about your screen, or just press Enter…';
      onPinChange();
    }

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
      if ((!text && !attached) || busy || capturing) return;
      const shown = text || C.screenPrompt; // a screenshot with no typed question asks to explain the screen
      lastActive = Date.now();
      const u = add('user');
      if (attached) {
        const im = document.createElement('img');
        im.className = 'msg-img';
        im.src = attached.url;
        u.appendChild(im);
      }
      u.appendChild(document.createTextNode(shown));
      const image = attached ? { data: attached.base64, mediaType: attached.mediaType } : null;
      clearAttach();
      r.ta.value = '';
      autosize();
      current = add('assistant');
      acc = '';
      paint();
      toBottom();
      window.mochi.chatSend(shown, image);
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
    r.cam.addEventListener('click', attachScreen);
    r.x.addEventListener('click', clearAttach);
    r.new.addEventListener('click', () => {
      window.mochi.chatNew();
      clearAttach();
      r.ta.value = '';
      autosize();
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
        if (s.screen) attachScreen();
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
      pinned: () => busy || capturing || inputFocused,
      recentlyActive: (minutes) => hasMessages && Date.now() - lastActive < minutes * 60000,
      onWindowBlur() {
        inputFocused = false;
        onPinChange();
      },
    };
  }

  window.ChatView = { create };
})();
