/* ── Mobile navigation: theme toggle, sidebar open/close, hamburger wiring,
   version/tab chip scroller, and mobile tab structure-swap ──────────────────

   Loaded as an EXTERNAL deferred <head> script rather than inlined ON PURPOSE.
   When minified, this JS contains `<`-before-identifier comparisons (the
   `for (var i = 0; i < n.length; i++)` loops below minify to `i<n.length`).
   Spec-compliant browsers parse `<n` inside a <script> harmlessly (script-data
   state), but naive HTML parsers — notably the docs link checker's (lychee /
   html5ever) — mis-read `<n` as a start-tag and silently drop every link that
   follows it. In <head> that loses the ENTIRE page body from link extraction.
   An external .js file is never parsed as HTML, so it can't trip that. The
   toggle* / closeMobileSidebar functions stay global (consumers' nav templates
   call them inline); `defer` runs this after parse but well before any click,
   and the DOMContentLoaded wrappers preserve the original execution timing.
   See built-html-integrity.spec.ts (inlineScriptSafety) and docs-init.js. */

function toggleMobileTheme() {
  var current = localStorage.getItem('color-theme') || 'system';
  var next = current === 'dark' ? 'light' : 'dark';
  var btn = document.querySelector('.hextra-theme-toggle-options button[data-item="' + next + '"]');
  if (btn) btn.click();
}

/* Mobile sidebar open/close. Globals so consumers' nav templates can call
   them inline (agw-oss's nav.html, kgw's breadcrumb mobile trigger, etc.). */
function toggleMobileSidebar() {
  var sidebar = document.querySelector('.sidebar-mobile-panel');
  var overlay = document.querySelector('.sidebar-mobile-overlay');
  if (sidebar && overlay) {
    sidebar.classList.toggle('mobile-sidebar-open');
    overlay.classList.toggle('active');
  }
}
function closeMobileSidebar() {
  var sidebar = document.querySelector('.sidebar-mobile-panel');
  var overlay = document.querySelector('.sidebar-mobile-overlay');
  if (sidebar) sidebar.classList.remove('mobile-sidebar-open');
  if (overlay) overlay.classList.remove('active');
}

/* Wire the stock Hextra hamburger (.hextra-hamburger-menu) to our
   mobile-sidebar toggle. Hextra's own menu.js toggles a different set of
   classes (hx:max-md:[transform:...]) that don't match our .sidebar-mobile-panel
   design, so we intercept the click here. Capture phase + stopImmediatePropagation
   so Hextra's listener doesn't fight us by toggling its own classes back. */
document.addEventListener('DOMContentLoaded', function () {
  /* Reveal the theme navbar's sidebar trigger only when this page actually
     renders a sidebar (the `.sidebar-mobile-panel` aside is present). Keeps
     landing / non-docs pages from showing a dead button. Consumer navbars
     (kgw/agw) render their trigger without the `hidden` attribute, so this
     query matches only the theme-navbar instance. */
  var sbTrigger = document.querySelector('.solo-sidebar-mobile-trigger[hidden]');
  if (sbTrigger && document.querySelector('.sidebar-mobile-panel')) {
    sbTrigger.removeAttribute('hidden');
  }
  var hamburger = document.querySelector('.hextra-hamburger-menu');
  if (!hamburger) return;
  hamburger.addEventListener('click', function (e) {
    e.preventDefault();
    e.stopImmediatePropagation();
    toggleMobileSidebar();
  }, true);
});

/* Mobile version / section (tab) chip rows scroll horizontally. Show the
   < / > arrow for a direction only when there's more off-screen that way, and
   center the active chip the first time the row gains width so it never starts
   hidden. The drawer is display:none until opened, so widths are 0 until then;
   a ResizeObserver recomputes when the row first gains width. */
(function () {
  function wireScroller(scroller) {
    var track = scroller.querySelector('[data-scroll-track]');
    var prev = scroller.querySelector('.sidebar-mobile-scroll-prev');
    var next = scroller.querySelector('.sidebar-mobile-scroll-next');
    if (!track || !prev || !next) return;
    var centered = false;
    function update() {
      var max = track.scrollWidth - track.clientWidth;
      prev.hidden = track.scrollLeft <= 1;
      next.hidden = track.scrollLeft >= max - 1;
    }
    function centerActive() {
      if (centered || !track.clientWidth) return;
      var active = track.querySelector(
        '.sidebar-mobile-version-active, .sidebar-mobile-tab-active'
      );
      if (active) {
        var ar = active.getBoundingClientRect();
        var tr = track.getBoundingClientRect();
        track.scrollLeft += (ar.left - tr.left) - (tr.width - ar.width) / 2;
      }
      centered = true;
    }
    prev.addEventListener('click', function () {
      track.scrollBy({ left: -track.clientWidth * 0.7, behavior: 'smooth' });
    });
    next.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth * 0.7, behavior: 'smooth' });
    });
    // Center a chip when it's tapped, so the selected version/tab slides into
    // the middle of the row instead of staying half-hidden behind an arrow.
    track.addEventListener('click', function (e) {
      var chip = e.target.closest('a');
      if (!chip || !track.contains(chip)) return;
      var cr = chip.getBoundingClientRect();
      var tr = track.getBoundingClientRect();
      track.scrollBy({
        left: (cr.left - tr.left) - (tr.width - cr.width) / 2,
        behavior: 'smooth',
      });
    });
    track.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    if (window.ResizeObserver) {
      new ResizeObserver(function () { centerActive(); update(); }).observe(track);
    }
    centerActive();
    update();
  }
  document.addEventListener('DOMContentLoaded', function () {
    var scrollers = document.querySelectorAll('.sidebar-mobile-scroller');
    for (var i = 0; i < scrollers.length; i++) wireScroller(scrollers[i]);
  });
})();

/* Mobile tab structure-swap: in the drawer, tapping a tab shows that tab's
   pre-rendered tree in place instead of navigating to its landing page. The
   canonical .sidebar-nav holds the active tab; the other tabs' trees are
   .sidebar-mobile-tree-panel siblings. Only intercepts below the sidebar
   breakpoint — on desktop these chips are hidden and the tab band navigates. */
(function () {
  function activate(name) {
    var canonical = document.querySelector('.sidebar-nav[data-tab-panel]:not(.sidebar-mobile-tree-panel)');
    if (!canonical) return;
    var isCanonical = canonical.getAttribute('data-tab-panel') === name;
    canonical.classList.toggle('tree-panel-inactive', !isCanonical);
    var panels = document.querySelectorAll('.sidebar-mobile-tree-panel');
    for (var i = 0; i < panels.length; i++) {
      panels[i].classList.toggle(
        'tree-panel-active',
        !isCanonical && panels[i].getAttribute('data-tab-panel') === name
      );
    }
    var links = document.querySelectorAll('.sidebar-mobile-tab-link');
    for (var j = 0; j < links.length; j++) {
      links[j].classList.toggle(
        'sidebar-mobile-tab-active',
        links[j].getAttribute('data-tab-target') === name
      );
    }
  }
  document.addEventListener('DOMContentLoaded', function () {
    var links = document.querySelectorAll('.sidebar-mobile-tab-link');
    for (var i = 0; i < links.length; i++) {
      links[i].addEventListener('click', function (e) {
        if (window.innerWidth >= 1280) return; // desktop: let the tab band navigate
        e.preventDefault();
        activate(this.getAttribute('data-tab-target'));
      });
    }
  });
})();
