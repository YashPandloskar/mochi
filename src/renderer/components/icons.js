// Small inline icons (24x24 grid, drawn for mochi). Usage: Icons.home(14) -> SVG string.
(() => {
  const wrap = (body, fill) => (size = 16) =>
    `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="${fill || 'none'}" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;

  window.Icons = {
    home: wrap('<path d="M3.5 11.5 12 4l8.5 7.5"/><path d="M6 10.5V20h12v-9.5"/>'),
    // eight-ray sparkle, used on the Claude tile
    sparkle: wrap('<path d="M12 3v18M3 12h18M5.6 5.6l12.8 12.8M18.4 5.6 5.6 18.4"/>'),
    music: wrap('<path d="M9 18V6l10-2v12"/><circle cx="6.5" cy="18" r="2.5"/><circle cx="16.5" cy="16" r="2.5"/>'),
    chat: wrap('<path d="M5 5h14a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2h-7l-5 4v-4H5a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2z"/>'),
    timer: wrap('<circle cx="12" cy="13" r="8"/><path d="M12 9v4l2.5 2M9.5 3h5"/>'),
    inbox: wrap('<path d="M3 13l2.5-7.5A2 2 0 0 1 7.4 4h9.2a2 2 0 0 1 1.9 1.5L21 13v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><path d="M3 13h5l1.5 2.5h5L16 13h5"/>'),
    copy: wrap('<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/>'),
    doc: wrap('<path d="M7 3h7l5 5v11a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>'),
    play: wrap('<path d="M8 5.5v13l11-6.5z"/>', 'currentColor'),
    camera: wrap('<path d="M4 8h3l1.5-2h7L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>'),
    send: wrap('<path d="M12 19V5M5 12l7-7 7 7"/>'),
    stop: wrap('<rect x="6.5" y="6.5" width="11" height="11" rx="2"/>', 'currentColor'),
    prev: wrap('<path d="M18 5.5v13L8.5 12z"/><path d="M6 5.5v13"/>', 'currentColor'),
    next: wrap('<path d="M6 5.5v13L15.5 12z"/><path d="M18 5.5v13"/>', 'currentColor'),
    pause: wrap('<rect x="6.5" y="5" width="3.6" height="14" rx="1"/><rect x="13.9" y="5" width="3.6" height="14" rx="1"/>', 'currentColor'),
  };
})();
