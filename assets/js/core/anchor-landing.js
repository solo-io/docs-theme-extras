// Makes a #anchor link land on its target, and STAY there.
//
// The browser's own anchor scroll (plus the scroll-margin-top in
// docs-theme-extras.css) handles the common case. This file covers the two it
// can't:
//
// 1. Target inside a hidden tab or a closed <details>. The browser can't scroll
//    to an element that isn't rendered, so the link did nothing: the page
//    stayed where it was and the tab stayed shut. reveal() selects every tab
//    that hides the target (outermost first, so nested tabs work) and opens any
//    closed <details> (Chrome opens those itself; older Safari and Firefox
//    don't). Tabs are selected by clicking their button, so a synced tab group
//    switches on this page as if the reader had clicked it, but the reader's
//    saved tab choice is put back (see clickKeepingSavedTab). tabs-sync-scroll.js ignores these clicks (they aren't trusted events), so
//    it doesn't fight the scroll below.
//
// 2. Content above the target that grows AFTER the scroll. The Swagger UI
//    block fetches its spec and renders late; on a slow connection it pushed
//    the heading 160px down after it had landed, and nothing brought it back.
//    settle() watches the page height for a few seconds and re-aligns the
//    target when it drifts, and stops the moment the reader scrolls, clicks or
//    types, so it never pulls the page away from them.
//
// Handles same-page link clicks, hashchange (back/forward, typed hashes), and
// page load (called from the hash-landing script in head-end.html through
// window.soloAnchorLanding). It never calls preventDefault: on a click it only
// reveals the target before the browser's default scroll runs.
(function () {
  var SETTLE_MS = 10000;

  function targetFor(hash) {
    if (!hash || hash.length < 2) return null;
    var id;
    try { id = decodeURIComponent(hash.slice(1)); } catch (e) { id = hash.slice(1); }
    return document.getElementById(id);
  }

  // The button that selects `panel`, if `panel` is a hidden tab panel.
  // Hextra's tabs shortcode: .hextra-tabs-panel, selected = data-state.
  // The docs hub's own tabs shortcode: .hextra-tab-panel, hidden = hx:hidden.
  function hiddenTabButton(panel) {
    if (panel.classList.contains('hextra-tabs-panel')) {
      if (panel.dataset.state === 'selected') return null;
      if (panel.id) {
        var b = document.querySelector('[aria-controls="' + CSS.escape(panel.id) + '"]');
        if (b) return b;
      }
      var panels = panel.parentElement;
      var bar = panels && panels.previousElementSibling;
      var idx = Array.prototype.indexOf.call(panels.children, panel);
      var btns = bar ? bar.querySelectorAll('.hextra-tabs-toggle') : [];
      return btns[idx] || null;
    }
    if (panel.classList.contains('hextra-tab-panel')) {
      if (!panel.classList.contains('hx:hidden')) return null;
      var group = panel.closest('.hextra-tabs');
      if (!group) return null;
      var panes = group.querySelectorAll(':scope > .hextra-tab-panels > .hextra-tab-panel');
      var i = Array.prototype.indexOf.call(panes, panel);
      return group.querySelectorAll(':scope > nav > .hextra-tab-btn')[i] || null;
    }
    return null;
  }

  // Click a tab button without changing the reader's saved tab choice. Hextra
  // saves a synced group's selection to localStorage ('hextra-tab-<group>') on
  // every click, so a link into the "Config file" tab would otherwise switch
  // every later page to "Config file" too, though the reader never chose it.
  // The tabs on THIS page still switch together, as a click would.
  function clickKeepingSavedTab(btn) {
    var group = btn.parentElement && btn.parentElement.dataset.tabGroup;
    var key = group ? 'hextra-tab-' + encodeURIComponent(group) : null;
    var saved = null;
    try { if (key) saved = localStorage.getItem(key); } catch (e) { key = null; }
    btn.click();
    if (!key) return;
    try {
      if (saved === null) localStorage.removeItem(key);
      else localStorage.setItem(key, saved);
    } catch (e) {}
  }

  // Unhide everything between the document and `el`. Returns true if it
  // changed anything (the caller then has to scroll itself, since the
  // browser's scroll already ran, or found nothing to scroll to).
  function reveal(el) {
    var changed = false;
    var chain = [];
    for (var n = el.parentElement; n; n = n.parentElement) chain.unshift(n);
    chain.forEach(function (n) {
      if (n.tagName === 'DETAILS' && !n.open) {
        n.open = true;
        changed = true;
        return;
      }
      var btn = hiddenTabButton(n);
      if (btn) {
        clickKeepingSavedTab(btn);
        changed = true;
      }
    });
    return changed;
  }

  function align(el) {
    try {
      el.scrollIntoView({ behavior: 'instant', block: 'start' });
    } catch (e) {
      el.scrollIntoView(true);
    }
  }

  // ── settle: keep the target aligned while late content loads ──
  var stopSettle = null;
  var USER_INPUT = ['wheel', 'touchstart', 'keydown', 'mousedown'];

  function settle(el) {
    if (stopSettle) stopSettle();
    if (typeof ResizeObserver === 'undefined') return;
    var timer;
    // Act only when the page height really changed. A ResizeObserver fires
    // once as soon as it starts observing; aligning then would cut a smooth
    // in-page scroll short (it'd see the target mid-flight and jump).
    var lastHeight = document.body.getBoundingClientRect().height;
    var ro = new ResizeObserver(function () {
      var h = document.body.getBoundingClientRect().height;
      if (Math.abs(h - lastHeight) < 1) return;
      lastHeight = h;
      var want = parseFloat(getComputedStyle(el).scrollMarginTop) || 0;
      if (Math.abs(el.getBoundingClientRect().top - want) > 2) align(el);
    });
    function stop() {
      ro.disconnect();
      clearTimeout(timer);
      USER_INPUT.forEach(function (t) { window.removeEventListener(t, stop, true); });
      if (stopSettle === stop) stopSettle = null;
    }
    USER_INPUT.forEach(function (t) {
      window.addEventListener(t, stop, { capture: true, passive: true });
    });
    timer = setTimeout(stop, SETTLE_MS);
    ro.observe(document.body);
    stopSettle = stop;
  }

  // Page load: head-end.html scrolls to the hash at DOMContentLoaded and again
  // at window.load; it calls this first so a hidden target is shown before it
  // scrolls, and starts settle() after.
  window.soloAnchorLanding = { reveal: reveal, settle: settle, align: align };

  // Same-page link click. Bubble phase on document, so a handler that cancels
  // the click (a tab button, a copy button) has already run; if it did,
  // nothing happens here. Revealing now, before the default action, lets the
  // browser's own scroll find the target.
  document.addEventListener('click', function (e) {
    if (e.defaultPrevented || e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var a = e.target instanceof Element ? e.target.closest('a[href*="#"]') : null;
    if (!a || a.target === '_blank') return;
    if (a.origin !== location.origin || a.pathname !== location.pathname || a.search !== location.search) return;
    var el = targetFor(a.hash);
    if (!el) return;
    // Runs before the default action, so the browser's own (possibly smooth)
    // scroll then finds a visible target. No align() here: it would cut a
    // smooth scroll short.
    reveal(el);
    requestAnimationFrame(function () { settle(el); });
  });

  // Back/forward and typed hashes. A click also fires this after the click
  // handler above; reveal() is then a no-op and settle() just restarts.
  window.addEventListener('hashchange', function () {
    var el = targetFor(location.hash);
    if (!el) return;
    if (reveal(el)) align(el);
    settle(el);
  });
})();
