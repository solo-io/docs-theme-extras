/*
 * changelog-compare.js — "compare versions" for a Markdown changelog page.
 *
 * Paired with layouts/_shortcodes/changelog-compare.html, which emits one empty
 * <div data-changelog-compare> and loads this file. Nothing about the versions
 * is configured anywhere: this script reads them from the page's own headings
 * every time the page loads, so a new release appears in the dropdowns as soon
 * as its heading is on the page.
 *
 * What counts as a version heading (any h2–h5 in the page content; the toolbar
 * is moved above the first one if the shortcode was placed lower):
 *   release  "2.4.1", "v2026.11.0", "1.0.0-rc2"   (three numeric parts, optional suffix)
 *   group    "v2.4", "v2026.11"                   (two numeric parts)
 * A release section is its heading plus every following sibling up to the next
 * heading of the same or a higher level. A group heading is hidden when none of
 * the releases under it is in range.
 *
 * Order comes from the page, not from sorting the version strings. Changelogs
 * file prereleases in places no sort reproduces (kagent lists 1.0.0-rc2 under
 * v2026.11), and the page order is the order the authors meant. The script
 * only checks which END of the page is newest, by comparing the first and last
 * release numbers, so an oldest-first page also works.
 *
 * Range semantics are "changes from A through B": A, B, and every release
 * between them, both ends included. Both dropdowns default to real version
 * numbers, the oldest and newest on the page. The selection is mirrored to ?from=&to= (query, not
 * hash, so it never collides with heading anchors or anchor-landing.js).
 */
(function () {
  "use strict";

  var RELEASE = /^v?(\d+)\.(\d+)\.(\d+)(?:[-+.][0-9A-Za-z.+-]*)?$/;
  var GROUP = /^v?\d+\.\d+$/;
  var HIDDEN = "changelog-compare-hidden";

  function headingText(h) {
    // Hextra appends an empty permalink <a>; some themes put a "#" in it.
    return (h.textContent || "").replace(/[#¶]/g, "").trim();
  }

  function level(el) {
    var m = /^H([1-6])$/.exec(el.tagName);
    return m ? Number(m[1]) : 0;
  }

  /** Elements from the heading up to the next heading of level <= its own. */
  function sectionOf(h) {
    var lv = level(h);
    var els = [h];
    for (var n = h.nextElementSibling; n; n = n.nextElementSibling) {
      var l = level(n);
      if (l && l <= lv) break;
      els.push(n);
    }
    return els;
  }

  /** Group heading plus anything before its first child heading. */
  function groupHead(h) {
    var els = [h];
    for (var n = h.nextElementSibling; n; n = n.nextElementSibling) {
      if (level(n)) break;
      els.push(n);
    }
    return els;
  }

  function numeric(text) {
    var m = RELEASE.exec(text);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  }

  function cmp(a, b) {
    for (var i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] - b[i];
    return 0;
  }

  /** A heading's anchor id. Hextra puts it on an inner <span>, not the <hN>. */
  function anchorId(h) {
    if (h.id) return h.id;
    var inner = h.querySelector("[id]");
    return inner ? inner.id : "";
  }

  /** In-page links to a heading id outside the changelog (the TOC). */
  function tocItems(root, h) {
    var id = anchorId(h);
    if (!id) return [];
    var sel = 'a[href="#' + (window.CSS && CSS.escape ? CSS.escape(id) : id) + '"]';
    var out = [];
    document.querySelectorAll(sel).forEach(function (a) {
      if (root.contains(a)) return;
      out.push(a.closest("li") || a);
    });
    return out;
  }

  function el(tag, attrs, text) {
    var e = document.createElement(tag);
    for (var k in attrs) e.setAttribute(k, attrs[k]);
    if (text != null) e.textContent = text;
    return e;
  }

  function init(holder) {
    var root = holder.closest(".content") || holder.parentElement;
    var releases = [];
    var groups = [];
    var current = null; // the group heading most recently passed, in page order
    var headings = Array.prototype.slice.call(root.querySelectorAll("h2, h3, h4, h5"));

    // The whole page is scanned, not just what follows the placeholder, and
    // the toolbar moves up to sit above the first version heading. A sync
    // script that inserts a new minor section straight after the front matter
    // (agentregistry's does) lands it above the shortcode line; without this,
    // the newest release would be missing from the dropdowns and the toolbar
    // would sit below it. Moved BEFORE sections are collected, so the
    // placeholder never ends up inside a section that gets hidden.
    var first = null;
    for (var i = 0; i < headings.length && !first; i++) {
      var ht = headingText(headings[i]);
      if (RELEASE.test(ht) || GROUP.test(ht)) first = headings[i];
    }
    if (first && first.compareDocumentPosition(holder) & Node.DOCUMENT_POSITION_FOLLOWING) {
      first.parentNode.insertBefore(holder, first);
    }

    headings.forEach(function (h) {
      var t = headingText(h);
      if (RELEASE.test(t)) {
        var r = { version: t, heading: h, els: sectionOf(h).concat(tocItems(root, h)) };
        releases.push(r);
        if (current && level(h) > level(current.heading)) current.members.push(r);
      } else if (GROUP.test(t)) {
        current = { heading: h, els: groupHead(h).concat(tocItems(root, h)), members: [] };
        groups.push(current);
      } else if (current && level(h) <= level(current.heading)) {
        current = null; // an unrelated heading closes the group
      }
    });

    if (releases.length < 2) return; // nothing to compare; leave the page alone

    // rank: higher = newer. Page order, flipped if the page is oldest-first.
    var newestFirst = cmp(numeric(releases[0].version), numeric(releases[releases.length - 1].version)) >= 0;
    releases.forEach(function (r, i) {
      r.rank = newestFirst ? releases.length - 1 - i : i;
    });
    var byVersion = {};
    releases.forEach(function (r) {
      if (!(r.version in byVersion)) byVersion[r.version] = r;
    });

    // Newest first in both dropdowns, whatever the page order.
    var ordered = releases.slice().sort(function (a, b) { return b.rank - a.rank; });
    var seen = {};
    ordered = ordered.filter(function (r) {
      if (seen[r.version]) return false;
      return (seen[r.version] = true);
    });

    var uid = "changelog-compare-" + Math.random().toString(36).slice(2, 8);
    var bar = el("div", { class: "changelog-toolbar changelog-compare-toolbar", role: "group", "aria-label": "Compare versions" });
    var fromLabel = el("label", { class: "changelog-toolbar-field", for: uid + "-from" });
    // Both ends are INCLUDED, so the default can be real version numbers: the
    // oldest and newest on the page. With an exclusive start ("since X"), the
    // default start would hide the oldest entry, which is why the label is
    // "from", not "since".
    fromLabel.appendChild(el("span", { class: "changelog-toolbar-label" }, "Changes from"));
    var fromSel = el("select", { id: uid + "-from", class: "changelog-toolbar-select", "data-compare": "from" });
    var toLabel = el("label", { class: "changelog-toolbar-field", for: uid + "-to" });
    toLabel.appendChild(el("span", { class: "changelog-toolbar-label" }, "through"));
    var toSel = el("select", { id: uid + "-to", class: "changelog-toolbar-select", "data-compare": "to" });
    ordered.forEach(function (r) {
      fromSel.appendChild(el("option", { value: r.version }, r.version));
      toSel.appendChild(el("option", { value: r.version }, r.version));
    });
    var reset = el("button", { type: "button", class: "changelog-compare-reset" }, "Reset");
    fromLabel.appendChild(fromSel);
    toLabel.appendChild(toSel);
    bar.appendChild(fromLabel);
    bar.appendChild(toLabel);
    bar.appendChild(reset);
    var status = el("p", { class: "changelog-compare-status", "aria-live": "polite" });
    holder.appendChild(bar);
    holder.appendChild(status);
    holder.hidden = false;

    var newest = ordered[0];
    var oldest = ordered[ordered.length - 1];
    fromSel.value = oldest.version;

    function syncToOptions() {
      var from = byVersion[fromSel.value] || oldest;
      Array.prototype.forEach.call(toSel.options, function (o) {
        o.disabled = byVersion[o.value].rank < from.rank;
      });
      if (toSel.selectedOptions[0] && toSel.selectedOptions[0].disabled) toSel.value = newest.version;
    }

    function apply(writeUrl) {
      syncToOptions();
      var from = byVersion[fromSel.value] || oldest;
      var to = byVersion[toSel.value] || newest;
      var shown = 0;
      releases.forEach(function (r) {
        var on = r.rank >= from.rank && r.rank <= to.rank;
        if (on) shown++;
        r.visible = on;
        r.els.forEach(function (e) { e.classList.toggle(HIDDEN, !on); });
      });
      groups.forEach(function (g) {
        var on = g.members.length === 0 || g.members.some(function (r) { return r.visible; });
        g.els.forEach(function (e) { e.classList.toggle(HIDDEN, !on); });
      });
      var filtered = from !== oldest || to !== newest;
      reset.hidden = !filtered;
      status.textContent = filtered
        ? "Showing " + shown + (shown === 1 ? " release" : " releases") + ", " + from.version + " through " + to.version + "."
        : "";
      if (writeUrl && window.history && history.replaceState) {
        var url = new URL(window.location.href);
        if (from !== oldest) url.searchParams.set("from", from.version); else url.searchParams.delete("from");
        if (to !== newest) url.searchParams.set("to", to.version); else url.searchParams.delete("to");
        history.replaceState(history.state, "", url.toString());
      }
    }

    fromSel.addEventListener("change", function () { apply(true); });
    toSel.addEventListener("change", function () { apply(true); });
    reset.addEventListener("click", function () {
      fromSel.value = oldest.version;
      toSel.value = newest.version;
      apply(true);
    });

    // Restore a shared link. Unknown versions fall back to the full list.
    var params = new URLSearchParams(window.location.search);
    if (byVersion[params.get("from")]) fromSel.value = params.get("from");
    if (byVersion[params.get("to")]) toSel.value = params.get("to");
    apply(false);
  }

  function boot() {
    // The shortcode emits this script once per call, so a page with two
    // placeholders loads it twice. Each placeholder initializes only once.
    document.querySelectorAll("[data-changelog-compare]:not([data-changelog-compare-ready])").forEach(function (h) {
      h.setAttribute("data-changelog-compare-ready", "");
      init(h);
    });
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", boot);
  else boot();
})();
