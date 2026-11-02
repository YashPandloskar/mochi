// Working panel: [Mochi at a laptop] [project, timer, step text] [info card], progress bar underneath.
// WorkingView.create() -> { el, update(session) }
(() => {
  const theme = window.mochi.theme;
  const W = theme.working;

  const pad2 = (n) => String(n).padStart(2, '0');
  const clock = (sec) => {
    sec = Math.max(0, Math.floor(sec));
    const h = Math.floor(sec / 3600);
    const m = Math.floor((sec % 3600) / 60);
    return h ? `${h}:${pad2(m)}:${pad2(sec % 60)}` : `${m}:${pad2(sec % 60)}`;
  };
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function create() {
    const el = document.createElement('div');
    el.className = 'work';
    el.innerHTML = `
      <div class="work-row">
        <div class="work-scene"></div>
        <div class="work-mid">
          <div class="w-project" data-r="project"></div>
          <div class="w-timer" data-r="timer">0:00</div>
          <div class="w-step" data-r="step"></div>
        </div>
        <div class="info" data-r="info"></div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.querySelector('.work-scene').appendChild(LaptopScene.create().el);
    const progress = Progress.create();
    el.appendChild(progress.el);

    let session = null;
    let renderKey = '';
    let typer = null;

    function stopTyping() {
      clearInterval(typer);
      typer = null;
    }

    // Edit step: removed lines appear at once, added lines are typed with a blinking caret.
    function renderEdit(diff) {
      stopTyping();
      const ext = (diff.file.split('.').pop() || '').slice(0, 3).toUpperCase();
      r.info.innerHTML = `
        <div class="info-head"><span class="chip">${esc(ext.length < diff.file.length ? ext : '•')}</span><b>${esc(diff.file)}</b><em>being edited</em></div>
        <div class="diff">
          ${diff.removed.slice(0, 2).map((l, i) => `<div class="dl rem"><u>${i + 1}</u><s>−</s><span>${esc(l)}</span></div>`).join('')}
          ${diff.added.slice(0, 2).map((l, i) => `<div class="dl add"><u>${i + 1}</u><s>+</s><span data-full="${esc(l)}"></span></div>`).join('')}
        </div>`;
      const targets = [...r.info.querySelectorAll('.add span')];
      if (!targets.length) return;
      let line = 0;
      let ch = 0;
      const caret = document.createElement('i');
      caret.className = 'caret';
      const tick = () => {
        const t = targets[line];
        const full = t.dataset.full;
        t.textContent = full.slice(0, ch);
        t.appendChild(caret);
        if (ch < full.length) ch++;
        else if (line < targets.length - 1) {
          line++;
          ch = 0;
        } else stopTyping(); // finished: caret stays and blinks
      };
      tick();
      typer = setInterval(tick, W.typeMsPerChar);
    }

    function renderSkeleton(head) {
      stopTyping();
      r.info.innerHTML = `<div class="info-head"><b>${esc(head)}</b></div>
        <div class="skel"><i style="width:92%"></i><i style="width:68%"></i><i style="width:80%"></i><i style="width:46%"></i></div>`;
    }

    function renderTest(s) {
      stopTyping();
      r.info.innerHTML = s.testResult
        ? `<div class="info-head"><b>Terminal</b></div><div class="passed">${esc(s.testResult)}</div>`
        : `<div class="info-head"><b>Terminal</b></div>
           <div class="cmd">$ ${esc(s.testCommand || 'npm test')}</div><div class="running">Running...</div>`;
    }

    function renderInfo(s) {
      const step = s.step || 1;
      const diffSig = s.diff ? `${s.diff.file}|${s.diff.removed.join('\n')}|${s.diff.added.join('\n')}` : '';
      let mode = 'read';
      if (step === 2 && s.diff) mode = 'edit';
      else if (step === 3 || (step === 4 && s.testResult)) mode = 'test';
      const key = [mode, mode === 'edit' ? diffSig : '', mode === 'test' ? s.testCommand + '|' + s.testResult : step === 2 ? 'x' : ''].join('#');
      if (key === renderKey) return;
      renderKey = key;
      if (mode === 'edit') renderEdit(s.diff);
      else if (mode === 'test') renderTest(s);
      else renderSkeleton(step === 2 ? 'Making changes' : step === 4 ? 'Wrapping up' : 'Reading files');
    }

    function tick() {
      if (!session) return;
      const start = session.startedAt;
      r.timer.textContent = clock(start ? (Date.now() - start) / 1000 : 0);
    }
    setInterval(tick, 1000);

    return {
      el,
      update(next) {
        session = next;
        r.project.textContent = next.project || 'Claude';
        const step = Math.max(1, Math.min(4, next.step || 1));
        r.step.textContent = `${W.stepText[step]} · step ${step} of 4`;
        progress.set(step);
        renderInfo(next);
        tick();
      },
    };
  }

  window.WorkingView = { create, clock };
})();
