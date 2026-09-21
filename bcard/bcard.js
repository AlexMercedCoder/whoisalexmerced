(() => {
  'use strict';
  const button = document.getElementById('copy-link');
  const status = document.getElementById('copy-status');
  if (!navigator.clipboard || !window.isSecureContext) return;
  button.hidden = false;
  button.addEventListener('click', async () => {
    try {
      await navigator.clipboard.writeText('https://whoisalexmerced.com/bcard/');
      status.textContent = 'Board link copied.';
    } catch {
      status.textContent = 'Copy this link: https://whoisalexmerced.com/bcard/';
    }
  });
})();
