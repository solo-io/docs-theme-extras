// Change-highlights overlay (non-production builds only; see
// layouts/_partials/utils/change-highlights.html).
//
// Fetches the manifest written by scripts/changes_manifest.py, keeps the
// entries for this page's source files, and:
//   - paints each added fragment with the CSS Custom Highlight API, which
//     leaves the DOM untouched, so tabs, copy buttons, and code blocks keep
//     working;
//   - drops an empty marker element where text was deleted. Its icon is CSS
//     generated content, so it adds no text to innerText or to a copy-button
//     copy.
// Hovering a highlight that replaced older text shows the older text.
//
// The manifest is polled, so a rewrite from `changes_manifest.py --watch`
// repaints the page without a reload.
(function () {
  "use strict";

  var script = document.currentScript;
  var manifestUrl = script && script.dataset.manifest;
  var HL_NAME = "extras-changed";
  var POLL_MS = 2000;
  if (!manifestUrl) return;

  var sources = [];
  var lastHash = null;
  var lastManifest = null;
  var enabled = true;
  try { enabled = localStorage.getItem("extras-change-highlights") !== "off"; } catch (e) {}

  // ── Normalization ─────────────────────────────────────────────────────
  // Applied identically to page text and fragments. Hugo's typographer turns
  // quotes and dashes into curly quotes and en/em dashes while code blocks
  // keep the originals, so both sides collapse to plain forms. Whitespace is
  // dropped entirely: context can come from a neighboring line, and the page
  // may or may not have whitespace between the two block elements.
  function normChar(c) {
    switch (c) {
      case "‘": case "’": return "'";
      case "“": case "”": return '"';
      case "–": case "—": return "-";
      case "…": return "...";
    }
    return c;
  }
  function normalize(s) {
    var out = "";
    for (var i = 0; i < s.length; i++) out += normChar(s[i]);
    return out.replace(/\s+/g, "").replace(/-+/g, "-");
  }

  // ── Page text index ───────────────────────────────────────────────────
  // One normalized string for the content area, plus a map from each
  // normalized character back to its text node and offset.
  function indexPage(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || p.closest("script,style,noscript,.extras-changes-panel")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var text = "", map = [], node;
    while ((node = walker.nextNode())) {
      var v = node.nodeValue;
      for (var i = 0; i < v.length; i++) {
        var c = normChar(v[i]);
        for (var k = 0; k < c.length; k++) {
          var ch = c[k];
          if (/\s/.test(ch)) continue;
          if (ch === "-" && text[text.length - 1] === "-") continue;
          text += ch;
          map.push([node, i]);
        }
      }
    }
    return { text: text, map: map };
  }

  function rangeFor(index, start, len) {
    var a = index.map[start], b = index.map[start + len - 1];
    var r = document.createRange();
    r.setStart(a[0], a[1]);
    r.setEnd(b[0], b[1] + 1);
    return r;
  }

  // Collapsed range just before normalized char `at`, or just after the char
  // before it when `at` is past the end.
  function pointFor(index, at) {
    var r = document.createRange();
    if (at < index.map.length) {
      r.setStart(index.map[at][0], index.map[at][1]);
    } else {
      var last = index.map[index.map.length - 1];
      r.setStart(last[0], last[1] + 1);
    }
    r.collapse(true);
    return r;
  }

  // Each candidate is [needle, offset of the change inside the needle].
  // Candidates run from most to least specific. Bare text on its own is only
  // trusted when it is long enough to be unlikely to match in the wrong place.
  //
  // With `all`, returns every unused match of the most specific candidate
  // that matches at all. That is for a snippet pulled in by `reuse`: the
  // manifest lists its change once, but the page can include it many times.
  function findMatches(index, candidates, used, all) {
    for (var t = 0; t < candidates.length; t++) {
      var needle = candidates[t][0], from = 0, at, found = [];
      if (!needle) continue;
      while ((at = index.text.indexOf(needle, from)) !== -1) {
        var start = at + candidates[t][1];
        if (!used[start]) {
          used[start] = true;
          found.push(start);
          if (!all) return found;
        }
        from = at + 1;
      }
      if (found.length) return found;
    }
    return [];
  }

  function locateAdded(index, frag, used, all) {
    var text = normalize(frag.text), before = normalize(frag.before || ""), after = normalize(frag.after || "");
    if (!text) return [];
    var c = [];
    if (before && after) c.push([before + text + after, before.length]);
    if (before) c.push([before + text, before.length]);
    if (after) c.push([text + after, 0]);
    if (text.length >= 8 || (!before && !after)) c.push([text, 0]);
    return findMatches(index, c, used, all).map(function (start) {
      return rangeFor(index, start, text.length);
    });
  }

  function locateRemoved(index, frag, used, all) {
    var before = normalize(frag.before || ""), after = normalize(frag.after || "");
    var c = [];
    if (before && after) c.push([before + after, before.length]);
    if (before) c.push([before, before.length]);
    if (after) c.push([after, 0]);
    // Prefer the end of the text before the deletion over the start of the
    // text after it: when a whole paragraph is deleted, the start of the next
    // text is often inside the next heading.
    return findMatches(index, c, used, all).map(function (at) {
      return before && at > 0 ? pointAfter(index, at - 1) : pointFor(index, at);
    });
  }

  function pointAfter(index, i) {
    var r = document.createRange();
    r.setStart(index.map[i][0], index.map[i][1] + 1);
    r.collapse(true);
    return r;
  }

  // ── Manifest → entries for this page ──────────────────────────────────
  function matchesSource(key) {
    for (var i = 0; i < sources.length; i++) {
      var s = sources[i];
      if (s === key) return true;
      // Page sources are absolute paths; reuse sources are relative to
      // assets/. Manifest keys are repo-relative. Either can be a suffix.
      if (s.slice(-(key.length + 1)) === "/" + key) return true;
      if (key.slice(-(s.length + 1)) === "/" + s) return true;
    }
    return false;
  }
  function matchesPageFile(key) {
    var page = sources[0] || "";
    return page === key || page.slice(-(key.length + 1)) === "/" + key;
  }

  // ── Panel ─────────────────────────────────────────────────────────────
  var panel;
  function renderPanel(state) {
    if (!panel) {
      panel = document.createElement("div");
      panel.className = "extras-changes-panel";
      document.body.appendChild(panel);
      panel.addEventListener("click", function (e) {
        var btn = e.target.closest("[data-action]");
        if (!btn) return;
        if (btn.dataset.action === "toggle") {
          enabled = !enabled;
          try { localStorage.setItem("extras-change-highlights", enabled ? "on" : "off"); } catch (err) {}
          if (lastManifest) apply(lastManifest);
        } else if (btn.dataset.action === "details") {
          panel.classList.toggle("is-open");
        }
      });
    }
    if (!state) { panel.hidden = true; return; }
    panel.hidden = false;
    var parts = [];
    if (state.isNew) parts.push("New page");
    if (state.found) parts.push(state.found + " added");
    if (state.removed) parts.push(state.removed + " removed");
    if (state.missed.length) parts.push(state.missed.length + " not shown");
    if (!parts.length) parts.push("Changed (no visible text)");
    var list = state.missed.map(function (f) {
      return "<li>" + (f.kind === "removed" ? "Removed: " : "") + escapeHtml(f.text) +
        " <span>(" + escapeHtml(f.file) + ")</span></li>";
    }).join("");
    panel.innerHTML =
      '<div class="extras-changes-bar">' +
        '<span class="extras-changes-dot"></span>' +
        '<button type="button" data-action="details" title="Compared with ' + escapeHtml(state.base) +
          (list ? ". Click to list the changes that could not be placed." : "") + '">' +
          escapeHtml(parts.join(" · ")) + "</button>" +
        '<button type="button" data-action="toggle">' + (enabled ? "Hide" : "Show") + "</button>" +
      "</div>" +
      (list ? '<ul class="extras-changes-missed">' + list + "</ul>" : "");
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"]/g, function (c) {
      return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c];
    });
  }

  // ── "Was" tooltip for replaced text ───────────────────────────────────
  var replaced = [];   // [Range, old text]
  var tip;
  function onMove(e) {
    if (!enabled) return;
    var hit = null;
    // Removal markers use this tooltip too, not CSS ::after: callouts clip
    // overflow, which cut a CSS tooltip off at the callout's edge.
    var marker = e.target && e.target.closest && e.target.closest(".extras-removed");
    if (marker) hit = [null, marker.getAttribute("data-removed"), "Removed: "];
    for (var i = 0; i < replaced.length && !hit; i++) {
      var rects = replaced[i][0].getClientRects();
      for (var j = 0; j < rects.length; j++) {
        var r = rects[j];
        if (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom) {
          hit = replaced[i]; break;
        }
      }
    }
    if (!tip) {
      tip = document.createElement("div");
      tip.className = "extras-changes-tip";
      document.body.appendChild(tip);
    }
    if (!hit) { tip.hidden = true; return; }
    tip.textContent = (hit[2] || "Was: ") + hit[1];
    tip.hidden = false;
    tip.style.left = Math.min(e.clientX + 12, window.innerWidth - tip.offsetWidth - 8) + "px";
    tip.style.top = (e.clientY + 16) + "px";
  }
  document.addEventListener("mousemove", onMove, { passive: true });

  // ── Paint ─────────────────────────────────────────────────────────────
  function clearMarkers(root) {
    var parents = [];
    root.querySelectorAll(".extras-removed").forEach(function (m) {
      parents.push(m.parentNode);
      m.remove();
    });
    // Re-join the text nodes the markers split, so the next index is clean.
    parents.forEach(function (p) { if (p && p.isConnected) p.normalize(); });
  }

  function apply(manifest) {
    var root = document.getElementById("content") || document.querySelector("main") || document.body;
    if (window.CSS && CSS.highlights) CSS.highlights.delete(HL_NAME);
    clearMarkers(root);
    root.classList.remove("extras-changed-new");
    replaced = [];
    if (tip) tip.hidden = true;

    var entries = [];
    Object.keys(manifest.files || {}).forEach(function (key) {
      if (matchesSource(key)) entries.push([key, manifest.files[key]]);
    });
    if (!entries.length) { renderPanel(null); return; }

    var index = indexPage(root), usedA = {}, usedR = {};
    var ranges = [], points = [], missed = [], isNew = false;
    entries.forEach(function (e) {
      var file = e[0], info = e[1];
      var isPage = matchesPageFile(file);
      if (info.new) { isNew = isNew || isPage; return; }
      // A snippet can appear on the page more than once; mark every copy.
      var all = !isPage;
      (info.added || []).forEach(function (frag) {
        var rs = locateAdded(index, frag, usedA, all);
        if (!rs.length) { missed.push({ kind: "added", text: frag.text, file: file }); return; }
        rs.forEach(function (r) {
          ranges.push(r);
          if (frag.was) replaced.push([r, frag.was]);
        });
      });
      (info.removed || []).forEach(function (frag) {
        var ps = locateRemoved(index, frag, usedR, all);
        if (!ps.length) { missed.push({ kind: "removed", text: frag.text, file: file }); return; }
        ps.forEach(function (p) { points.push([p, frag.text]); });
      });
    });

    if (enabled) {
      if (window.CSS && CSS.highlights && window.Highlight) {
        CSS.highlights.set(HL_NAME, new Highlight(...ranges));
      }
      // Insert markers last-first so earlier points are not shifted. Ranges
      // are live, so the highlight ranges follow the text-node splits.
      points.reverse().forEach(function (pt) {
        var m = document.createElement("span");
        m.className = "extras-removed";
        m.setAttribute("data-removed", pt[1].length > 160 ? pt[1].slice(0, 157) + "..." : pt[1]);
        m.setAttribute("aria-hidden", "true");
        pt[0].insertNode(m);
      });
      if (isNew) root.classList.add("extras-changed-new");
    }
    renderPanel({ found: ranges.length, removed: points.length, missed: missed, isNew: isNew, base: manifest.base });
  }

  function refresh() {
    fetch(manifestUrl, { cache: "no-store" })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (m) {
        if (!m) { renderPanel(null); return; }
        if (m.hash === lastHash) return;
        lastHash = m.hash;
        lastManifest = m;
        apply(m);
      })
      .catch(function () { /* no manifest: overlay stays off */ });
  }

  function start() {
    try {
      sources = JSON.parse(document.getElementById("extras-change-sources").textContent) || [];
    } catch (e) { /* no sources: nothing to match */ }
    refresh();
    setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
