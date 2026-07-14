/* ── Hextra main.js null-deref guard (runs immediately, before main.js) ──────
   Hextra's core/menu.js wires the mobile hamburger with no null guard:
   `querySelector('.hextra-hamburger-menu')` then `menu.querySelector('svg')` /
   `menu.addEventListener(...)`, and likewise `.hextra-sidebar-container`. On a
   consumer whose navbar omits that markup, or any page rendered without the
   navbar/sidebar (a bare landing), those elements are absent and menu.js throws
   "Cannot read properties of null" on load.

   This file is a DEFERRED <head> script, so it runs after the DOM is parsed and
   BEFORE Hextra's deferred main.js (deferred scripts execute in document order;
   this <head> script precedes main.js in the <body>). It runs IMMEDIATELY —
   deliberately NOT inside DOMContentLoaded — so the stand-ins exist before
   menu.js's own DOMContentLoaded handler queries them.

   It injects a hidden stand-in ONLY when the real element is missing, so a page
   that already renders the genuine navbar hamburger / sidebar keeps exactly one
   (no duplicate — this replaced a static footer stand-in that double-rendered
   wherever the navbar already provided the toggle). The hamburger stand-in wraps
   an <svg> because isMenuOpen() reads `menu.querySelector('svg')`; both the old
   unprefixed and current hextra-prefixed class names are set so a Hextra rename
   can't silently re-break the query. */
(function(){
  var body = document.body;
  if (!body) return;
  function standIn(className, withSvg){
    var el = document.createElement('div');
    el.className = className;
    el.setAttribute('hidden', '');
    el.style.cssText = 'display:none !important;';
    if (withSvg) el.appendChild(document.createElementNS('http://www.w3.org/2000/svg', 'svg'));
    body.appendChild(el);
  }
  if (!document.querySelector('.hextra-hamburger-menu')) {
    standIn('hamburger-menu hextra-hamburger-menu', true);
  }
  if (!document.querySelector('.hextra-sidebar-container')) {
    standIn('sidebar-container hextra-sidebar-container', false);
  }
})();

document.addEventListener('DOMContentLoaded', function(){

  /* ── Reveal sidebar after Hextra's sidebar.js scrolls to active item ──
     rAF queues this for the next frame, after all DOMContentLoaded handlers
     have run synchronously (including Hextra's scrollToActiveItem). */
  requestAnimationFrame(function(){
    document.documentElement.classList.remove('sidebar-loading');
  });

  /* ── Tab switching ── */
  document.querySelectorAll('.hextra-tabs').forEach(function(group){
    var btns = group.querySelectorAll(':scope > nav > .hextra-tab-btn');
    var panes = group.querySelectorAll(':scope > .hextra-tab-panels > .hextra-tab-panel');
    btns.forEach(function(btn, idx){
      btn.addEventListener('click', function(){
        btns.forEach(function(b, i){
          if(i === idx){
            b.classList.add('active','hx:border-primary-600','hx:text-primary-600','dark:hx:text-primary-400');
            b.classList.remove('hx:border-transparent','hx:text-gray-500');
          } else {
            b.classList.remove('active','hx:border-primary-600','hx:text-primary-600','dark:hx:text-primary-400');
            b.classList.add('hx:border-transparent','hx:text-gray-500');
          }
        });
        panes.forEach(function(p, i){
          if(i === idx) p.classList.remove('hx:hidden');
          else p.classList.add('hx:hidden');
        });
      });
    });
  });

  /* ── Sidebar chevron toggle + localStorage persistence ──
     The sidebar tree is rendered server-side with each branch's
     `<li data-sidebar-item>` carrying a `data-expanded` flag the server
     pre-set for ancestors of the current page. The chevron `<button>`
     toggles expansion without firing the link's navigation; preferences
     persist in sessionStorage keyed by branch href.

     sessionStorage (not localStorage) scopes the expanded set to a single
     tab: a new tab starts clean and the state can't bleed across tabs. A
     hard refresh additionally clears it so the sidebar resets to only the
     current page's ancestors (server-rendered). Normal navigation between
     pages within the same tab preserves manually expanded sections. */
  (function(){
    var STORAGE_KEY = 'solo-sidebar-expanded';
    function loadState(){
      try { var raw = sessionStorage.getItem(STORAGE_KEY); return raw ? JSON.parse(raw) : {}; }
      catch(_) { return {}; }
    }
    function saveState(s){
      try { sessionStorage.setItem(STORAGE_KEY, JSON.stringify(s)); }
      catch(_) {}
    }
    function getKey(item){
      var link = item.querySelector(':scope > .sidebar-link-wrapper > .sidebar-link');
      return link ? link.getAttribute('href') : null;
    }
    function setExpanded(item, expanded){
      item.setAttribute('data-expanded', expanded ? 'true' : 'false');
      var btn = item.querySelector(':scope > .sidebar-link-wrapper > .sidebar-toggle');
      if (btn) btn.setAttribute('aria-expanded', expanded ? 'true' : 'false');
      var children = item.querySelector(':scope > .sidebar-children');
      if (children) {
        if (expanded) children.removeAttribute('hidden');
        else children.setAttribute('hidden', '');
      }
    }

    /* Clear saved state on hard refresh so the sidebar starts clean. */
    var navEntry = performance.getEntriesByType('navigation')[0];
    var isReload = navEntry && navEntry.type === 'reload';
    if (isReload) {
      try { sessionStorage.removeItem(STORAGE_KEY); } catch(_) {}
    }

    var state = isReload ? {} : loadState();

    /* Save ancestors of the current page so they stay expanded as the user
       navigates to sibling pages within the same section. */
    var stateDirty = false;
    document.querySelectorAll('[data-sidebar-item]').forEach(function(item){
      if (item.querySelector('a[aria-current="page"]')) {
        var key = getKey(item);
        if (key && state[key] !== true) { state[key] = true; stateDirty = true; }
      }
    });
    if (stateDirty) saveState(state);

    /* Apply saved state to sections not containing the current page. */
    document.querySelectorAll('[data-sidebar-item]').forEach(function(item){
      if (item.querySelector('a[aria-current="page"]')) return;
      var key = getKey(item);
      if (key && key in state) setExpanded(item, state[key]);
    });

    document.querySelectorAll('.sidebar-toggle').forEach(function(btn){
      btn.addEventListener('click', function(e){
        e.preventDefault();
        e.stopPropagation();
        var item = btn.closest('[data-sidebar-item]');
        if (!item) return;
        var wasExpanded = item.getAttribute('data-expanded') === 'true';
        var newExpanded = !wasExpanded;
        setExpanded(item, newExpanded);
        var key = getKey(item);
        if (key) { state[key] = newExpanded; saveState(state); }
      });
    });

    /* Title clicks: expanded → collapse in place (no nav); collapsed → navigate
       to section index. State is written to localStorage before navigating so
       the new page renders the branch expanded without a client-side re-expand
       step. Modifier clicks fall through for new-tab etc. */
    document.querySelectorAll('[data-sidebar-item] > .sidebar-link-wrapper > .sidebar-link').forEach(function(link){
      link.addEventListener('click', function(e){
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey || e.button !== 0) return;
        var item = link.closest('[data-sidebar-item]');
        if (!item) return;
        var wasExpanded = item.getAttribute('data-expanded') === 'true';
        var key = getKey(item);
        if (wasExpanded) {
          e.preventDefault();
          setExpanded(item, false);
          if (key) { state[key] = false; saveState(state); }
        } else {
          if (key) { state[key] = true; saveState(state); }
          /* fall through — browser navigates; new page reads localStorage and
             renders the branch expanded without a client-side pre-expand */
        }
      });
    });
  })();

  /* ── Preserve the sidebar scroll position across navigations ──
     The site is static: every nav link is a plain <a href>, so the sidebar
     re-renders fresh on each load and its desktop scroll region
     (.sidebar-nav-wrapper) would otherwise snap back to the top. Save its
     scrollTop on the way out and restore it here so the scrollbar stays put
     while the (brand-new) content pane lands at the top. sessionStorage
     scopes it to the tab. This runs after the expand/collapse state above so
     the tree is at full height before we set scrollTop, and before the rAF
     above removes .sidebar-loading — so the wrapper (hidden by the
     html.sidebar-loading rule in CSS) is revealed already at the right
     offset, no top-then-jump flash. Back/forward via bfcache restores scroll
     natively and skips this. */
  (function(){
    var KEY = 'solo-sidebar-scrolltop';
    var nav = document.querySelector('.sidebar-nav-wrapper');
    if (!nav) return;
    try {
      var saved = parseInt(sessionStorage.getItem(KEY), 10);
      if (saved > 0) nav.scrollTop = saved;
    } catch (_) {}
    window.addEventListener('pagehide', function(){
      try { sessionStorage.setItem(KEY, String(nav.scrollTop)); } catch (_) {}
    });
  })();

  /* ── Mobile icons dropdown ── */
  var mobileIconsToggle = document.getElementById('mobile-icons-toggle');
  var mobileIconsMenu = document.getElementById('mobile-icons-menu');
  if (mobileIconsToggle && mobileIconsMenu) {
    mobileIconsToggle.addEventListener('click', function(e) {
      e.stopPropagation();
      var isOpen = !mobileIconsMenu.classList.contains('hx:hidden');
      mobileIconsMenu.classList.toggle('hx:hidden');
      mobileIconsToggle.setAttribute('aria-expanded', String(!isOpen));
    });
    /* Close the drawer on clicks anywhere EXCEPT inside the drawer itself
       or on the toggle button. Without this guard, clicking the search
       field, a link, or any other interactive element inside the drawer
       would close it immediately because the document click handler fires
       on every click (the toggle's `stopPropagation` only protects clicks
       on the toggle itself). */
    document.addEventListener('click', function(e) {
      if (mobileIconsMenu.contains(e.target)) return;
      if (mobileIconsToggle.contains(e.target)) return;
      mobileIconsMenu.classList.add('hx:hidden');
      mobileIconsToggle.setAttribute('aria-expanded', 'false');
    });
  }

  /* ── Version dropdown toggle ── */
  document.querySelectorAll('.version-dropdown').forEach(function(dd){
    var btn = dd.querySelector('.version-dropdown-btn');
    if(!btn) return;
    btn.addEventListener('click', function(e){
      e.stopPropagation();
      var wasOpen = dd.classList.contains('open');
      /* Close all dropdowns first */
      document.querySelectorAll('.version-dropdown.open').forEach(function(d){
        d.classList.remove('open');
        d.querySelector('.version-dropdown-btn').setAttribute('aria-expanded','false');
      });
      if(!wasOpen){
        dd.classList.add('open');
        btn.setAttribute('aria-expanded','true');
      }
    });
  });
  document.addEventListener('click', function(){
    document.querySelectorAll('.version-dropdown.open').forEach(function(d){
      d.classList.remove('open');
      d.querySelector('.version-dropdown-btn').setAttribute('aria-expanded','false');
    });
  });

  /* ── Copy as Markdown ── */
  function processCopyMd(wrapper) {
    var source = wrapper.querySelector('.copy-md-source');
    if (!source) return null;
    var md = source.textContent;
    function decodeEntities(str) {
      var el = document.createElement('textarea');
      var prev = '';
      while (prev !== str) { prev = str; el.innerHTML = str; str = el.value; }
      return str;
    }
    md = decodeEntities(md);
    md = md.replace(/\[([^\]]*?)\s*\\\s*\n\\?\s*\n?([^\]]*?)\]\(([^)]+)\)/g, '[$1 — $2]($3)');
    md = md.replace(/```\n(\s*(?:flowchart|graph|sequenceDiagram|classDiagram|stateDiagram|erDiagram|gantt|pie|gitGraph|journey)\b)/g, '<!-- Mermaid diagram -->\n```mermaid\n$1');
    return md;
  }

  function doCopyMd(wrapper, feedbackBtn) {
    var md = processCopyMd(wrapper);
    if (!md) return;
    navigator.clipboard.writeText(md).then(function(){
      var label = feedbackBtn && feedbackBtn.querySelector('.copy-md-label, .copy-md-dialog-copy-label');
      var orig = label ? label.textContent : null;
      if (label) label.textContent = 'Copied!';
      if (feedbackBtn) feedbackBtn.classList.add('copied');
      setTimeout(function(){
        if (label) label.textContent = orig;
        if (feedbackBtn) feedbackBtn.classList.remove('copied');
      }, 2000);
    });
  }

  document.querySelectorAll('.copy-md-wrapper').forEach(function(wrapper){
    var mainBtn     = wrapper.querySelector('.copy-md-btn');
    var toggle      = wrapper.querySelector('.copy-md-toggle');
    var dropdown    = wrapper.querySelector('.copy-md-dropdown');
    var dialog      = wrapper.querySelector('.copy-md-dialog');
    var dialogClose = wrapper.querySelector('.copy-md-dialog-close');
    var dialogCopy     = wrapper.querySelector('.copy-md-dialog-copy');
    var dialogDownload = wrapper.querySelector('.copy-md-dialog-download');
    var dialogPre      = wrapper.querySelector('.copy-md-dialog-pre');

    if (mainBtn) mainBtn.addEventListener('click', function(){ doCopyMd(wrapper, mainBtn); });

    if (toggle && dropdown) {
      toggle.addEventListener('click', function(e){
        e.stopPropagation();
        var open = dropdown.classList.toggle('open');
        toggle.setAttribute('aria-expanded', String(open));
      });
    }

    if (dropdown) {
      dropdown.querySelectorAll('[data-action]').forEach(function(item){
        item.addEventListener('click', function(e){
          e.stopPropagation();
          dropdown.classList.remove('open');
          if (toggle) toggle.setAttribute('aria-expanded', 'false');
          if (item.dataset.action === 'copy') {
            doCopyMd(wrapper, mainBtn);
          } else if (item.dataset.action === 'view' && dialog && dialogPre) {
            var md = processCopyMd(wrapper);
            if (md) { dialogPre.textContent = md; dialog.showModal(); }
          } else if (item.dataset.action === 'connect-docs-mcp') {
            window.open('https://search.solo.io/', '_blank', 'noopener');
          } else if (item.dataset.action === 'open-claude' || item.dataset.action === 'open-chatgpt' || item.dataset.action === 'open-perplexity') {
            var action = item.dataset.action;
            var pageUrl = wrapper.dataset.pageUrl || '';
            if (pageUrl.indexOf('https://') === 0) {
              var prompt = 'Give me a summary of this page and prepare for me to ask you questions about it: ' + pageUrl;
              var chatBase = action === 'open-claude' ? 'https://claude.ai/new?q='
                : action === 'open-chatgpt' ? 'https://chatgpt.com/?q='
                : 'https://www.perplexity.ai/?q=';
              window.open(chatBase + encodeURIComponent(prompt), '_blank', 'noopener');
            } else {
              var md = processCopyMd(wrapper);
              if (md) {
                var fallbackUrl = action === 'open-claude' ? 'https://claude.ai/new'
                  : action === 'open-chatgpt' ? 'https://chatgpt.com/'
                  : 'https://www.perplexity.ai/';
                window.open(fallbackUrl, '_blank', 'noopener');
                navigator.clipboard.writeText(md).then(function(){
                  if (mainBtn) {
                    var lbl = mainBtn.querySelector('.copy-md-label');
                    var orig = lbl ? lbl.textContent : null;
                    if (lbl) lbl.textContent = 'Copied — paste in chat';
                    mainBtn.classList.add('copied');
                    setTimeout(function(){ if (lbl) lbl.textContent = orig; mainBtn.classList.remove('copied'); }, 3000);
                  }
                });
              }
            }
          } else if (item.dataset.action === 'download-codeblocks') {
            (function(){
              var content = document.querySelector('.content');
              if (!content) return;
              var blocks = [];
              var shellLangs = ['shell', 'bash', 'sh'];
              Array.from(content.querySelectorAll('pre code')).forEach(function(code) {
                var lntd = code.closest('td.lntd');
                if (lntd && !lntd.previousElementSibling) return;
                var lang = '';
                code.classList.forEach(function(cls) {
                  if (cls.startsWith('language-')) { lang = cls.replace('language-', ''); }
                });
                if (shellLangs.indexOf(lang) === -1) return;
                var text = code.textContent.replace(/\n$/, '');
                blocks.push(text);
              });
              if (!blocks.length) return;
              navigator.clipboard.writeText(blocks.join('\n\n'));
            })();
          } else if (item.dataset.action === 'print') {
            window.print();
          }
        });
      });
    }

    if (dialogClose && dialog) dialogClose.addEventListener('click', function(){ dialog.close(); });
    if (dialogCopy) dialogCopy.addEventListener('click', function(){ doCopyMd(wrapper, dialogCopy); });
    if (dialogDownload) {
      dialogDownload.addEventListener('click', function(){
        var md = processCopyMd(wrapper);
        if (!md) return;
        var filename = (document.title || 'page').replace(/\s*[|\-–—].*$/, '').trim().replace(/[^a-z0-9]+/gi, '-').toLowerCase() + '.md';
        var blob = new Blob([md], {type: 'text/markdown'});
        var blobUrl = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = blobUrl; a.download = filename; a.click();
        URL.revokeObjectURL(blobUrl);
      });
    }
    if (dialog) dialog.addEventListener('click', function(e){ if (e.target === dialog) dialog.close(); });
  });

  document.addEventListener('click', function(){
    document.querySelectorAll('.copy-md-dropdown.open').forEach(function(dd){
      var tog = dd.closest('.copy-md-split') && dd.closest('.copy-md-split').querySelector('.copy-md-toggle');
      dd.classList.remove('open');
      if (tog) tog.setAttribute('aria-expanded', 'false');
    });
  });

  /* ── TOC scroll-spy: highlight the section currently in view ── */
  (function(){
    var toc = document.querySelector('.hextra-toc');
    if (!toc) return;
    var links = toc.querySelectorAll('a[href^="#"]');
    if (!links.length) return;

    var idToLink = {};
    var targets = [];
    links.forEach(function(a){
      var id = decodeURIComponent(a.getAttribute('href').slice(1));
      var el = document.getElementById(id);
      if (el) {
        idToLink[id] = a;
        targets.push(el);
      }
    });
    if (!targets.length) return;

    // The heading list scrolls inside .solo-toc-inner while the "On this
    // page" heading and the back-to-top footer stay pinned as fixed flex
    // rows, so the active link can never scroll behind the footer.
    var tocScroller = toc.querySelector('.solo-toc-inner > .solo-toc-sublist')
      || toc.querySelector('.hextra-scrollbar') || toc;
    var lastActive = null;
    function setActive(el){
      if (!el || !idToLink[el.id]) return;
      var link = idToLink[el.id];
      if (link === lastActive) return;
      // Scroll TOC into position FIRST so the new active link is in its
      // final position before we paint the highlight. Otherwise on rapid
      // scrolls the class swap and the TOC scroll can land in different
      // paint frames, producing a perceived color/bg stagger.
      var linkRect = link.getBoundingClientRect();
      var scrollerRect = tocScroller.getBoundingClientRect();
      if (linkRect.top < scrollerRect.top){
        tocScroller.scrollTop += linkRect.top - scrollerRect.top - 8;
      } else if (linkRect.bottom > scrollerRect.bottom){
        tocScroller.scrollTop += linkRect.bottom - scrollerRect.bottom + 8;
      }
      // Now swap the highlight in one tick so color and bg paint together.
      // Use inline style for text color so it wins over Tailwind's layered CSS.
      var isDark = document.documentElement.classList.contains('dark');
      if (lastActive) {
        lastActive.classList.remove('toc-active');
        lastActive.style.removeProperty('color');
      }
      link.classList.add('toc-active');
      link.style.color = isDark ? '#f9fafb' : '#111827';
      lastActive = link;
    }

    function update(){
      // If scrolled to (near) the bottom of the page, lock to the last heading
      // — short final sections may never reach the threshold from the top.
      var atBottom = (window.innerHeight + window.scrollY) >= (document.documentElement.scrollHeight - 4);
      if (atBottom){
        setActive(targets[targets.length - 1]);
        return;
      }
      // Otherwise pick the last heading whose top is at or above 120px from the viewport top.
      // Falls back to the first heading if none are above the threshold yet.
      var threshold = 120;
      var current = null;
      for (var i = 0; i < targets.length; i++){
        if (targets[i].getBoundingClientRect().top <= threshold){
          current = targets[i];
        } else {
          break;
        }
      }
      setActive(current || targets[0]);
    }

    update();
    var ticking = false;
    window.addEventListener('scroll', function(){
      if (!ticking){
        window.requestAnimationFrame(function(){ update(); ticking = false; });
        ticking = true;
      }
    }, { passive: true });
    window.addEventListener('resize', update);
  })();

});
