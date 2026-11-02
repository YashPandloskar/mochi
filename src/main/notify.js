const { Notification } = require('electron');

const clip = (s, n) => {
  const t = String(s || '').replace(/[*_`#>]/g, '').replace(/\s+/g, ' ').trim();
  return t.length > n ? t.slice(0, n - 1).trimEnd() + '…' : t;
};

// Windows toast (silent: mochi plays its own soft chime). Title and body come only from the
// hook events of the session being shown.
function toast(kind, snap) {
  if (!Notification.isSupported()) return;
  let title;
  let body;
  if (kind === 'done') {
    title = snap.project ? `Claude finished · ${snap.project}` : 'Claude finished';
    body = clip(snap.lastMessage, 140) || 'All steps done.';
  } else if (kind === 'needs') {
    title = 'Claude needs you';
    body = clip(snap.needsText, 140) || 'Waiting for your approval.';
  } else {
    title = 'Focus session finished';
    body = 'Time for a break.';
  }
  new Notification({ title, body, silent: true }).show();
}

module.exports = { toast };
