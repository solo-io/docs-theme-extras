// Keeps a tab bar still when tabs.sync switches other groups.
//
// Hextra's tabs.js switches EVERY group with the same tab names on a synced
// switch. A group above the one the reader used can change height a lot (a
// long "UI" tab with screenshots becomes a short "Config file" fence), and the
// tab bar the reader used then jumps off screen. Browser scroll anchoring does
// not catch it.
//
// Both ways of switching are covered. A click (and Enter or Space, which fire
// a click) switches in tabs.js's click handler. Arrow keys, Home and End switch
// in its keydown handler, which then calls focus() on the new tab, and that
// focus() scrolls on its own. In both cases this file measures the tab bar in
// a capture-phase listener, before tabs.js runs, and corrects the scroll in a
// bubble-phase listener on document, which runs after tabs.js has switched
// every group (and, for keys, after its focus() has scrolled).
//
// This file is ADDED to Hextra's js/core/*.js bundle, it does not replace
// tabs.js. Only trusted events on a synced group (one with data-tab-group) are
// corrected, so non-synced groups, programmatic clicks and the saved
// localStorage choice all behave exactly as in Hextra. It applies to Hextra's
// data-tab-group sync only; a site with its own tab-sync script is untouched.
(function () {
  const SWITCH_KEYS = ['ArrowRight', 'ArrowDown', 'ArrowLeft', 'ArrowUp', 'Home', 'End'];
  let pending = null;

  function measure(e) {
    pending = null;
    if (!e.isTrusted || !(e.target instanceof Element)) return;
    if (e.type === 'keydown' && SWITCH_KEYS.indexOf(e.key) === -1) return;
    const button = e.target.closest('.hextra-tabs-toggle');
    const bar = button && button.parentElement;
    if (!bar || !bar.dataset.tabGroup) return;
    pending = { bar: bar, top: bar.getBoundingClientRect().top };
  }

  function correct() {
    if (!pending) return;
    const { bar, top } = pending;
    pending = null;
    const delta = bar.getBoundingClientRect().top - top;
    if (Math.abs(delta) < 1) return;
    // 'instant' beats any `scroll-behavior: smooth` a site sets on <html>. A
    // browser that rejects the value falls back to a plain scroll.
    try {
      window.scrollBy({ top: delta, behavior: 'instant' });
    } catch (err) {
      window.scrollBy(0, delta);
    }
  }

  ['click', 'keydown'].forEach(function (type) {
    document.addEventListener(type, measure, true);
    document.addEventListener(type, correct);
  });
})();
