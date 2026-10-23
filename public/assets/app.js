if ('serviceWorker' in navigator) {
  addEventListener('load', () => navigator.serviceWorker.register('/sw.js'));
}

// Install button: Chrome/Edge/Android fire beforeinstallprompt; iOS only has Share > Add to Home Screen.
(() => {
  const button = document.querySelector('[data-install]');
  const note = document.querySelector('[data-install-note]');
  if (!button || !note) return;

  const installed = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;
  const ios = /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  let prompt = null;

  if (installed) {
    button.hidden = true;
    note.textContent = 'Installed. You opened this from the home screen.';
    return;
  }
  if (ios) button.hidden = true;

  addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    prompt = event;
  });
  addEventListener('appinstalled', () => {
    button.hidden = true;
    note.textContent = 'Installed. Look for the lantern icon on your home screen.';
  });

  button.addEventListener('click', async () => {
    if (!prompt) {
      note.textContent = 'This browser keeps install in its own menu. Look for "Install app" or "Add to Home screen".';
      return;
    }
    prompt.prompt();
    await prompt.userChoice;
    prompt = null;
  });
})();
