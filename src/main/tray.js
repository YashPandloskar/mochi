const { Tray, Menu, nativeImage, app } = require('electron');
const path = require('path');

const STATES = [
  ['Idle', 'idle'],
  ['Working', 'working'],
  ['Needs you', 'needs'],
  ['Done', 'done'],
];

function create({ onPreview, showUsage, onToggleUsage }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('mochi');

  function refresh() {
    tray.setContextMenu(
      Menu.buildFromTemplate([
        {
          label: 'Show usage on Claude tile',
          type: 'checkbox',
          checked: showUsage,
          click: (item) => {
            showUsage = item.checked;
            onToggleUsage(showUsage);
          },
        },
        { type: 'separator' },
        { label: 'Preview state', submenu: STATES.map(([label, id]) => ({ label, click: () => onPreview(id) })) },
        { type: 'separator' },
        { label: 'Quit mochi', click: () => app.quit() },
      ])
    );
  }

  refresh();
  return { tray, refresh };
}

module.exports = { create };
