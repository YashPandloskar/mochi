const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

const STATES = [
  ['Idle', 'idle'],
  ['Working', 'working'],
  ['Needs you', 'needs'],
  ['Done', 'done'],
];

function create({ onPreview, onResolve }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('mochi');

  function refresh(snap) {
    const items = [];
    // Stand-in for the Allow/Deny buttons until the approval panel exists (stage 6).
    if (snap && snap.approval) {
      const a = snap.approval;
      items.push(
        { label: `Approve? ${a.command.slice(0, 50)}`, enabled: false },
        { label: 'Allow', click: () => onResolve(a.id, 'allow') },
        { label: 'Deny', click: () => onResolve(a.id, 'deny') },
        { type: 'separator' }
      );
    }
    items.push(
      { label: 'Preview state', submenu: STATES.map(([label, id]) => ({ label, click: () => onPreview(id) })) },
      { type: 'separator' },
      { label: 'Quit mochi', click: () => app.quit() }
    );
    tray.setContextMenu(Menu.buildFromTemplate(items));
  }

  refresh(null);
  return { tray, refresh };
}

module.exports = { create };
