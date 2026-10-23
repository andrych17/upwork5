// Demo-only copy deterrent: app/layout.js loads it as /assets/rt.js when DEMO=1, and build-demo.mjs
// writes that file. It slows down casual copying
// (right-click, select, copy, view-source and DevTools shortcuts); it cannot stop
// someone who opens DevTools from the browser menu, disables JS or uses curl.
(() => {
  const style = document.createElement('style');
  style.textContent =
    'html,body,body *{-webkit-user-select:none!important;user-select:none!important;-webkit-touch-callout:none!important}' +
    'img,svg{-webkit-user-drag:none;user-drag:none}' +
    'input,textarea{-webkit-user-select:text!important;user-select:text!important}' +
    '@media print{body{display:none!important}}';
  document.documentElement.appendChild(style);

  const editable = (target) => {
    const el = target instanceof Element ? target : target && target.parentElement;
    return !!(el && el.closest('input, textarea, [contenteditable="true"]'));
  };
  const stop = (event) => {
    if (editable(event.target)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  for (const type of ['contextmenu', 'copy', 'cut', 'dragstart', 'selectstart']) {
    document.addEventListener(type, stop, { capture: true });
  }

  // Codes, not keys, so Option-modified letters on macOS still match.
  const blocked = (e) => {
    const mod = e.ctrlKey || e.metaKey;
    if (e.code === 'F12') return true;
    if (mod && (e.shiftKey || e.altKey) && ['KeyI', 'KeyJ', 'KeyC', 'KeyK', 'KeyU'].includes(e.code)) return true;
    if (mod && ['KeyU', 'KeyS', 'KeyP'].includes(e.code)) return true;
    if (mod && ['KeyA', 'KeyC', 'KeyX'].includes(e.code) && !editable(e.target)) return true;
    return false;
  };
  addEventListener('keydown', (e) => {
    if (!blocked(e)) return;
    e.preventDefault();
    e.stopPropagation();
  }, { capture: true });
})();
