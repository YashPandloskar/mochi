const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

let tray = null;

function create({ onDebugState }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  tray = new Tray(icon);
  tray.setToolTip('mochi');

  const states = [
    ['Idle', 'idle'],
    ['Working', 'working'],
    ['Needs you', 'needs'],
    ['Done', 'done'],
  ];

  tray.setContextMenu(
    Menu.buildFromTemplate([
      {
        label: 'Preview state',
        submenu: states.map(([label, id]) => ({ label, click: () => onDebugState(id) })),
      },
      { type: 'separator' },
      { label: 'Quit mochi', click: () => app.quit() },
    ])
  );
  return tray;
}

module.exports = { create };
