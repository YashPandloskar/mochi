// Bottom nav bar: Home / Claude / Music / Focus. Every view that shows a nav gets its own instance;
// Nav.setActive keeps them in step. The active tab shows its label.
//   const n = Nav.create(); view.appendChild(n.el);   Nav.onSelect((id) => ...)
(() => {
  const tabs = window.mochi.theme.nav.tabs;
  const instances = [];
  let handler = () => {};
  let active = 'home';
  const labels = {}; // tab id -> label override (the Claude tab is called Assistant in Chat-only mode)
  const relabel = (items, id, text) =>
    items.forEach((b) => {
      if (b.dataset.tab !== id) return;
      b.title = text;
      const label = b.querySelector('b');
      if (label) label.textContent = text;
    });

  function create() {
    const el = document.createElement('div');
    el.className = 'nav';
    const items = tabs.map((t) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'nav-item';
      b.dataset.tab = t.id;
      b.title = t.label;
      b.innerHTML = Icons[t.icon](14) + `<b>${t.label}</b>`;
      b.addEventListener('click', () => handler(t.id));
      el.appendChild(b);
      return b;
    });
    const set = (id) => items.forEach((b) => b.classList.toggle('active', b.dataset.tab === id));
    set(active);
    const inst = { el, set, items };
    Object.entries(labels).forEach(([id, text]) => relabel(items, id, text));
    instances.push(inst);
    return inst;
  }

  window.Nav = {
    create,
    onSelect: (fn) => (handler = fn),
    go: (id) => handler(id), // switch tab from code (e.g. the notes strip on Home)
    setLabel(id, text) {
      labels[id] = text;
      instances.forEach((i) => relabel(i.items, id, text));
    },
    setActive(id) {
      active = id;
      instances.forEach((i) => i.set(id));
    },
  };
})();
