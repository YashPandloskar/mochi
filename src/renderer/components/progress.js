// Four-segment progress bar with labels (Read / Edit / Test / Done), used by Working and Done.
//   const p = Progress.create();  p.set(2);  p.sweep();
// Step n: earlier segments full, the current one half (in progress), later ones empty. Step 4 = all full.
(() => {
  function create() {
    const W = window.mochi.theme.working;
    const el = document.createElement('div');
    el.className = 'progress';
    el.innerHTML = W.labels
      .map((l) => `<div class="seg"><div class="seg-track"><i></i></div><span>${l}</span></div>`)
      .join('');
    const segs = [...el.querySelectorAll('.seg')];
    const fills = segs.map((s) => s.querySelector('i'));

    function set(step) {
      const s = Math.max(0, Math.min(4, step || 0));
      fills.forEach((f, i) => {
        f.style.transitionDelay = '0s';
        f.style.width = s === 4 || i < s - 1 ? '100%' : i === s - 1 ? '50%' : '0%';
      });
      segs.forEach((seg, i) => seg.classList.toggle('current', s !== 0 && i === Math.min(s, 4) - 1));
    }

    // Done: restart from empty and fill each segment in turn.
    function sweep(staggerSeconds) {
      fills.forEach((f) => {
        f.style.transition = 'none';
        f.style.width = '0%';
      });
      void el.offsetWidth;
      fills.forEach((f, i) => {
        f.style.transition = '';
        f.style.transitionDelay = `${(i * staggerSeconds).toFixed(2)}s`;
        f.style.width = '100%';
      });
      segs.forEach((seg, i) => seg.classList.toggle('current', i === 3));
    }

    return { el, set, sweep };
  }

  window.Progress = { create };
})();
