// Keyboard focus for text boxes in the notch. The notch normally never takes keyboard focus (so it cannot
// pull you out of a game). Typing.watch(input) makes one text box ask for it when you click it, and hand it
// back on Esc. While any watched box has focus the panel stays open (Typing.pinned()).
// (The Chat tab has its own, older version of the same idea.)
//
//   Typing.watch(inputOrTextarea)   Typing.pinned()   Typing.reset()   Typing.onPinChange(fn)
(() => {
  const focused = new Set();
  let onPin = () => {};

  window.Typing = {
    watch(el) {
      el.addEventListener('mousedown', () => {
        if (!document.hasFocus()) {
          window.mochi.focusWindow(true); // main makes the window focusable and focuses it
          setTimeout(() => el.focus(), 60);
        }
      });
      el.addEventListener('focus', () => {
        focused.add(el);
        onPin();
      });
      el.addEventListener('blur', () => {
        focused.delete(el);
        onPin();
      });
      el.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
          el.blur();
          if (!focused.size) window.mochi.focusWindow(false);
        }
      });
    },
    pinned: () => focused.size > 0,
    reset() {
      focused.clear();
      onPin();
    },
    onPinChange: (fn) => (onPin = fn),
  };
})();
