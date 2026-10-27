// Keeps a clicked tab button still when tabs.sync switches other groups.
//
// Hextra's tabs.js switches EVERY group with the same tab names on a synced
// click. A group above the clicked one can change height a lot (a long "UI"
// tab with screenshots becomes a short "Config file" fence), and the clicked
// button then jumps off screen. Browser scroll anchoring does not catch it.
//
// This file is ADDED to Hextra's js/core/*.js bundle, it does not replace
// tabs.js. It measures the button in a capture-phase listener, before tabs.js
// runs, and corrects the scroll in a bubble-phase listener on document, which
// runs after tabs.js has switched every group. Only trusted clicks on a synced
// group (one with data-tab-group) are corrected, so non-synced groups,
// keyboard navigation, programmatic clicks and the saved localStorage choice
// all behave exactly as in Hextra.
(function () {
  let pending = null;

  document.addEventListener(
    'click',
    function (e) {
      pending = null;
      if (!e.isTrusted || !(e.target instanceof Element)) return;
      const button = e.target.closest('.hextra-tabs-toggle');
      if (!button || !button.parentElement || !button.parentElement.dataset.tabGroup) return;
      pending = { button: button, top: button.getBoundingClientRect().top };
    },
    true
  );

  document.addEventListener('click', function () {
    if (!pending) return;
    const { button, top } = pending;
    pending = null;
    const delta = button.getBoundingClientRect().top - top;
    // 'instant' beats any `scroll-behavior: smooth` a site sets on <html>.
    if (Math.abs(delta) >= 1) window.scrollBy({ top: delta, behavior: 'instant' });
  });
})();
