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

/* Mobile drawer wiring: the chip-row scrollers, the tab structure-swap, and the
   AJAX section/version swap. All three are bound by bindDrawer(root) so they
   keep working after an AJAX swap replaces the drawer's contents. */
(function () {
  /* The drawer exists only below the sidebar breakpoint (xl). At or above it the
     same aside IS the desktop sidebar, the chip rows are display:none, and every
     drawer behavior here has to stand down. Kept in one place because three
     handlers and the resize watcher all have to agree with the CSS bound in
     docs-theme-extras.css (`@media (max-width: 1279px)`). */
  var DRAWER_MAX = 1280;
  function isDesktop() {
    return window.innerWidth >= DRAWER_MAX;
  }

  /* Chip rows (version / tab / section) scroll horizontally. Show the < / >
     arrow for a direction only when there's more off-screen that way, and center
     the active chip the first time the row gains width so it never starts hidden.
     The drawer is display:none until opened, so widths are 0 until then; a
     ResizeObserver recomputes when the row first gains width. */
  function wireScroller(scroller, signal) {
    var track = scroller.querySelector('[data-scroll-track]');
    var prev = scroller.querySelector('.sidebar-mobile-scroll-prev');
    var next = scroller.querySelector('.sidebar-mobile-scroll-next');
    if (!track || !prev || !next) return;
    var centered = false;
    function update() {
      var max = track.scrollWidth - track.clientWidth;
      var atStart = track.scrollLeft <= 1;
      var atEnd = track.scrollLeft >= max - 1;
      prev.hidden = atStart;
      next.hidden = atEnd;
      // Fade the row's content toward whichever edge can still scroll, so the
      // tab / version text dissolves before it reaches the < / > arrows instead
      // of sliding under and overlapping them (CSS masks on the .scroll-fade-*
      // classes).
      track.classList.toggle('scroll-fade-start', !atStart);
      track.classList.toggle('scroll-fade-end', !atEnd);
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
    }, { signal: signal });
    next.addEventListener('click', function () {
      track.scrollBy({ left: track.clientWidth * 0.7, behavior: 'smooth' });
    }, { signal: signal });
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
    }, { signal: signal });
    track.addEventListener('scroll', update, { passive: true, signal: signal });
    /* The window listener and the ResizeObserver are the two registrations that
       do NOT die with the markup when a swap replaces the drawer's innerHTML —
       window outlives it, and an observer keeps its detached target alive. Both
       are torn down explicitly in bindDrawer. */
    window.addEventListener('resize', update, { signal: signal });
    if (window.ResizeObserver) {
      var ro = new ResizeObserver(function () { centerActive(); update(); });
      ro.observe(track);
      boundObservers.push(ro);
    }
    centerActive();
    update();
  }

  /* Tab structure-swap: in the drawer, tapping a tab shows that tab's
     pre-rendered tree in place instead of navigating. The canonical .sidebar-nav
     holds the active tab; the other tabs' trees are .sidebar-mobile-tree-panel
     siblings. Below the sidebar breakpoint only — on desktop these chips are
     hidden and the tab band navigates. */
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
  function onTabClick(e) {
    if (isDesktop()) return; // desktop: let the tab band navigate
    e.preventDefault();
    activate(this.getAttribute('data-tab-target'));
  }

  /* AJAX section/version swap: the section (Kubernetes/Standalone) and version
     chips point to a DIFFERENT content tree than the current page, so — unlike
     the tab chips — their trees aren't already in the DOM. Rather than navigate
     (which would close the drawer mid-selection), fetch the target page, lift
     its drawer nav, and swap it in place so the reader can keep picking section
     -> version -> topic. Any failure falls back to plain navigation, so the chip
     always does something. Below the sidebar breakpoint only. */
  /* Monotonic token identifying the most recent swap request. The chip rows sit
     OUTSIDE .sidebar-nav-wrapper (the only thing .drawer-loading dims), and even
     with the lock widened below, taps can still land between the click and the
     class being applied. Two in-flight fetches are therefore possible, and they
     can resolve out of order — without a token the earlier response would win
     and the drawer would show a tree the reader did not pick last. Each request
     claims a token; a response only applies if it still holds the latest one. */
  var swapToken = 0;

  /* The drawer's own markup, as the current page rendered it, snapshotted before
     the FIRST swap of a session.

     A swap changes only the drawer — the page underneath, its URL, and the
     navbar's version dropdown all still belong to the version the reader
     started on. That divergence is fine while the drawer is open (the reader is
     mid-selection and will commit by tapping a topic), but it must not outlive
     the drawer: closing without picking a topic is a cancel, and leaving the
     swapped tree in place would tell a reader who reopens the drawer that they
     are on a version they are not.

     So closing RESETS rather than commits. Commit-on-close was the alternative
     and is rejected: it would navigate a reader who only wanted to peek at
     another version's contents. Reset can never produce a surprising
     navigation, so it fails safe. Tapping a topic still commits normally —
     that path is a real navigation and never reaches this code. */
  var pristineDrawer = null;

  /* How long a swap fetch may hang before the chip gives up and navigates.
     .drawer-loading dims the header and nav wrapper and turns off their pointer
     events, and there is no spinner, so an indefinite wait on a bad phone
     network reads as a drawer that simply stopped working. (Not a hard trap —
     the overlay is a sibling of the panel, so tap-outside still closes — but
     the reader has to discover that.) An abort lands in the same catch as any
     other failure, which navigates, so the chip always does something. */
  var SWAP_TIMEOUT_MS = 5000;

  function restoreDrawer(panel) {
    if (pristineDrawer === null) return; // never swapped; nothing to undo
    swapToken++; // invalidate any in-flight swap so it can't repaint after us
    panel.classList.remove('drawer-loading');
    panel.innerHTML = pristineDrawer;
    pristineDrawer = null;
    bindDrawer(panel);
  }

  function swapDrawer(href, panel) {
    if (pristineDrawer === null) pristineDrawer = panel.innerHTML;
    var token = ++swapToken;
    panel.classList.add('drawer-loading');
    /* AbortController + setTimeout rather than AbortSignal.timeout: the latter
       is newer than the APIs this file already feature-detects (AbortController,
       MutationObserver, ResizeObserver), and a manual timer degrades to "no
       timeout" where the constructor is missing instead of throwing on a
       property that isn't there. The timer is cleared once the body has been
       read, so the budget covers headers AND body — a response that starts
       streaming and then stalls still falls back. */
    var ctl = window.AbortController ? new AbortController() : null;
    var timer = ctl
      ? setTimeout(function () {
          ctl.abort();
        }, SWAP_TIMEOUT_MS)
      : null;
    var opts = { credentials: 'same-origin' };
    if (ctl) opts.signal = ctl.signal;
    fetch(href, opts)
      .then(function (r) {
        if (!r.ok) throw new Error('status ' + r.status);
        return r.text();
      })
      .then(function (html) {
        if (timer) clearTimeout(timer);
        if (token !== swapToken) return; // superseded by a later tap
        var next = new DOMParser()
          .parseFromString(html, 'text/html')
          .querySelector('.sidebar-mobile-panel');
        if (!next) throw new Error('no drawer in response');
        panel.innerHTML = next.innerHTML;
        panel.classList.remove('drawer-loading');
        bindDrawer(panel);
        /* innerHTML replacement drops focus to <body>. Move it to the swapped-in
           nav so keyboard and screen-reader users stay inside the drawer they
           are still working in, and announce the change since no navigation
           occurred to do it for them. */
        var nav = panel.querySelector('.sidebar-nav');
        if (nav) {
          nav.setAttribute('tabindex', '-1');
          nav.focus({ preventScroll: true });
        }
      })
      .catch(function () {
        if (timer) clearTimeout(timer);
        if (token !== swapToken) return; // a later tap owns the drawer now
        window.location.href = href;
      });
  }
  function onSectionVersionClick(e) {
    if (isDesktop()) return; // desktop: chips are hidden; navigate
    var href = this.getAttribute('href');
    var panel = document.querySelector('.sidebar-mobile-panel');
    if (!href || !panel) return; // no target/drawer: let the link navigate
    e.preventDefault();
    swapDrawer(href, panel);
  }

  /* Teardown handles for the CURRENT binding. Listeners registered on elements
     inside the drawer die with the markup when a swap replaces innerHTML, but
     the window listener and the ResizeObserver in wireScroller do not: window
     outlives the swap, and an observer holds its detached target alive. Since
     bindDrawer now re-runs on every swap AND on every drawer reset, those would
     accumulate without bound over a session of version-hopping. One
     AbortController per binding makes teardown deterministic — every listener
     gets its signal, and the previous controller is aborted before rebinding —
     which is also why wireScroller no longer needs isConnected guards. */
  var boundAbort = null;
  var boundObservers = [];

  /* (Re)bind every interactive piece within a drawer root, releasing whatever
     the previous call registered. Runs on load, after each AJAX swap, and after
     a reset-on-close restore. */
  function bindDrawer(root) {
    if (boundAbort) boundAbort.abort();
    for (var o = 0; o < boundObservers.length; o++) boundObservers[o].disconnect();
    boundObservers = [];
    boundAbort = window.AbortController ? new AbortController() : null;
    var signal = boundAbort ? boundAbort.signal : undefined;

    var scrollers = root.querySelectorAll('.sidebar-mobile-scroller');
    for (var i = 0; i < scrollers.length; i++) wireScroller(scrollers[i], signal);
    var tabs = root.querySelectorAll('.sidebar-mobile-tab-link');
    for (var j = 0; j < tabs.length; j++) {
      tabs[j].addEventListener('click', onTabClick, { signal: signal });
    }
    var chips = root.querySelectorAll(
      '.sidebar-mobile-section-link, .sidebar-mobile-version-link'
    );
    for (var k = 0; k < chips.length; k++) {
      chips[k].addEventListener('click', onSectionVersionClick, { signal: signal });
    }
  }

  document.addEventListener('DOMContentLoaded', function () {
    var panel = document.querySelector('.sidebar-mobile-panel');
    if (!panel) return;
    bindDrawer(panel);

    /* Crossing UP past the breakpoint with the drawer open (tablet rotation, a
       desktop window drag) has to end the drawer session. Two reasons, and the
       swap makes the first one worse:
         - A swapped tree would otherwise persist as the DESKTOP sidebar, while
           the page, its URL, and the navbar version dropdown all still belong to
           the version the reader started on — the drawer's temporary divergence
           silently promoted to a permanent lie.
         - `.sidebar-mobile-overlay.active` carries no media query, so the
           full-screen scrim would stay over the desktop page.
       closeMobileSidebar clears both classes, and clearing .mobile-sidebar-open
       is the open -> closed edge the observer below watches, so the reset falls
       out of the existing path rather than duplicating it. */
    window.addEventListener('resize', function () {
      if (isDesktop() && panel.classList.contains('mobile-sidebar-open')) {
        closeMobileSidebar();
      }
    });

    /* Watch the open/close class rather than wrapping toggleMobileSidebar /
       closeMobileSidebar: those are globals that consumers' nav templates call
       inline, and some (kgw's breadcrumb trigger, agw's nav.html) manipulate the
       drawer themselves. Observing the class catches every close path, including
       ones this file doesn't know about. */
    if (!window.MutationObserver) return;
    var wasOpen = panel.classList.contains('mobile-sidebar-open');
    new MutationObserver(function () {
      var isOpen = panel.classList.contains('mobile-sidebar-open');
      // Only the open -> closed edge. restoreDrawer itself removes
      // .drawer-loading, which re-enters here harmlessly (wasOpen is already
      // false by then, so no second restore).
      if (wasOpen && !isOpen) restoreDrawer(panel);
      wasOpen = isOpen;
    }).observe(panel, { attributes: true, attributeFilter: ['class'] });
  });
})();
