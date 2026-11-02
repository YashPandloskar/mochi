// Needs-approval panel: curious Mochi, "Needs you" chip, the command, Allow and Deny.
// NeedsView.create() -> { el, update(session) }
(() => {
  const theme = window.mochi.theme;
  const N = theme.needs;
  const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

  function create() {
    const el = document.createElement('div');
    el.className = 'needs';
    el.innerHTML = `
      <div class="needs-mochi"><span class="qmark">?</span><div class="wobble"></div></div>
      <div class="needs-main">
        <div class="needs-top">
          <span class="needs-chip"><i></i>Needs you</span>
          <span class="needs-more" data-r="more"></span>
        </div>
        <div class="needs-title" data-r="title">Allow this command?</div>
        <div class="cmd-box"><span data-r="cmd"></span><i class="caret"></i></div>
        <div class="needs-actions" data-r="actions">
          <button class="btn allow" data-r="allow" type="button">Allow</button>
          <button class="btn deny" data-r="deny" type="button">Deny</button>
          <span class="handback" data-r="hand"></span>
        </div>
      </div>`;
    const r = {};
    el.querySelectorAll('[data-r]').forEach((n) => (r[n.dataset.r] = n));
    el.querySelector('.wobble').appendChild(Mochi.create({ mood: 'curious', size: 84 }).el);

    let approval = null;
    let answered = false;

    function answer(decision) {
      if (!approval || answered) return;
      answered = true; // the card disappears when the next state arrives
      r.allow.disabled = r.deny.disabled = true;
      window.mochi.resolveApproval(approval.id, decision);
    }
    r.allow.addEventListener('click', () => answer('allow'));
    r.deny.addEventListener('click', () => answer('deny'));

    function tick() {
      if (!approval) return;
      const left = Math.max(0, Math.ceil((approval.requestedAt + theme.timings.approvalTimeoutSeconds * 1000 - Date.now()) / 1000));
      r.hand.textContent = `Hands back to Claude in ${Math.floor(left / 60)}:${String(left % 60).padStart(2, '0')}`;
    }
    setInterval(tick, 1000);

    return {
      el,
      update(s) {
        const next = s.approval;
        if (!next || !approval || next.id !== approval.id) {
          answered = false;
          r.allow.disabled = r.deny.disabled = false;
        }
        approval = next;
        const text = (next ? next.command : s.needsText) || '';
        r.cmd.textContent = text.length > N.commandChars ? text.slice(0, N.commandChars) + '…' : text;
        r.title.textContent = !next ? 'Claude needs you' : next.toolName === 'Bash' ? 'Allow this command?' : 'Allow this action?';
        // A permission notification without a held request cannot be answered from here.
        r.actions.classList.toggle('answer-in-claude', !next);
        if (!next) r.hand.textContent = 'Answer it in Claude Code';
        r.more.textContent = s.pendingCount > 1 ? `+${s.pendingCount - 1} more waiting` : '';
        tick();
      },
    };
  }

  window.NeedsView = { create };
})();
