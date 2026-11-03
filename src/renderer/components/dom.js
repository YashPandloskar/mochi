// setHtml(el, html): like el.innerHTML = html, but does nothing when the content is unchanged.
// Anything refreshed on a timer must use this: rebuilding an element's children while the mouse is pressed on it
// makes the browser drop the click (the pressed element is gone by the time the button is released).
(() => {
  window.setHtml = (el, html) => {
    if (el.__html === html) return;
    el.__html = html;
    el.innerHTML = html;
  };
})();
