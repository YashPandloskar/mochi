const { Tray, Menu, nativeImage, screen, app } = require('electron');
const path = require('path');

const STATES = [
  ['Idle', 'idle'],
  ['Working', 'working'],
  ['Needs you', 'needs'],
  ['Done', 'done'],
];

// The tray menu is rebuilt every time it opens, so checkboxes and the monitor list are always current.
//   getSettings() -> { paused, gameMode, sounds, showUsage, music, startup, motion, monitor }
//   actions       -> { toggle(key), setMonitor(id), setMotion(m), preview(state) }
function create({ getSettings, actions }) {
  const icon = nativeImage.createFromPath(path.join(__dirname, '..', '..', 'assets', 'tray.png'));
  const tray = new Tray(icon);
  tray.setToolTip('mochi');

  function build() {
    const s = getSettings();
    const check = (label, key, extra = {}) => ({ label, type: 'checkbox', checked: !!s[key], click: () => actions.toggle(key), ...extra });
    const displays = screen.getAllDisplays();
    const primaryId = screen.getPrimaryDisplay().id;

    return Menu.buildFromTemplate([
      check('Pause notch', 'paused', { accelerator: 'Ctrl+Alt+M', registerAccelerator: false }),
      check('Hide while gaming (Valorant, Dota 2)', 'gameMode'),
      { type: 'separator' },
      check('Sounds', 'sounds'),
      check('Show usage on Claude tile', 'showUsage'),
      check('Music module (Apple Music)', 'music'),
      check('Launch on startup', 'startup'),
      {
        label: 'Motion',
        submenu: [
          { label: 'Subtle', type: 'radio', checked: s.motion !== 'lively', click: () => actions.setMotion('subtle') },
          { label: 'Lively', type: 'radio', checked: s.motion === 'lively', click: () => actions.setMotion('lively') },
        ],
      },
      {
        label: 'Monitor',
        submenu: [
          { label: 'Primary display', type: 'radio', checked: s.monitor === 'primary', click: () => actions.setMonitor('primary') },
          ...displays.map((d, i) => ({
            label: `Display ${i + 1}${d.id === primaryId ? ' (primary)' : ''} · ${d.bounds.width}×${d.bounds.height}`,
            type: 'radio',
            checked: String(s.monitor) === String(d.id),
            click: () => actions.setMonitor(String(d.id)),
          })),
        ],
      },
      { type: 'separator' },
      { label: 'Preview state', submenu: STATES.map(([label, id]) => ({ label, click: () => actions.preview(id) })) },
      { type: 'separator' },
      { label: 'Quit mochi', click: () => app.quit() },
    ]);
  }

  const open = () => tray.popUpContextMenu(build());
  tray.on('click', open);
  tray.on('right-click', open);
  return { tray, build };
}

module.exports = { create };
