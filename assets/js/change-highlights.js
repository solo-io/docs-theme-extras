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
  // Poll only under `hugo server` (the template sets data-poll there), where
  // the watcher rewrites the manifest as an author saves. A built preview's
  // manifest never changes, so it is fetched once.
  var polling = !!(script && script.dataset.poll);
  var timer = null;
  if (!manifestUrl) return;

  // { page: "<project-relative path>", snippets: [{resolved, written}, ...] }
  var sources = { page: "", snippets: [] };
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
  // One normalized string for the content area, plus, for each normalized
  // character, the index of its text node and its offset in that node. Two
  // flat number arrays rather than a [node, offset] pair per character: on a
  // large generated reference page that was millions of small arrays per
  // repaint.
  function indexPage(root) {
    var walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        var p = n.parentElement;
        if (!p || p.closest("script,style,noscript,.extras-changes-panel")) return NodeFilter.FILTER_REJECT;
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var parts = [], nodes = [], nodeOf = [], offsetOf = [], last = "", node;
    while ((node = walker.nextNode())) {
      var n = nodes.push(node) - 1;
      var v = node.nodeValue;
      for (var i = 0; i < v.length; i++) {
        var c = normChar(v[i]);
        for (var k = 0; k < c.length; k++) {
          var ch = c[k];
          if (/\s/.test(ch)) continue;
          if (ch === "-" && last === "-") continue;
          parts.push(ch);
          last = ch;
          nodeOf.push(n);
          offsetOf.push(i);
        }
      }
    }
    return { text: parts.join(""), nodes: nodes, nodeOf: nodeOf, offsetOf: offsetOf, length: nodeOf.length };
  }

  function nodeAt(index, i) { return index.nodes[index.nodeOf[i]]; }

  function rangeFor(index, start, len) {
    var end = start + len - 1;
    var r = document.createRange();
    r.setStart(nodeAt(index, start), index.offsetOf[start]);
    r.setEnd(nodeAt(index, end), index.offsetOf[end] + 1);
    return r;
  }

  // Collapsed range just before normalized char `at`, or just after the char
  // before it when `at` is past the end.
  function pointFor(index, at) {
    var r = document.createRange();
    if (at < index.length) {
      r.setStart(nodeAt(index, at), index.offsetOf[at]);
    } else {
      r.setStart(nodeAt(index, index.length - 1), index.offsetOf[index.length - 1] + 1);
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
    r.setStart(nodeAt(index, i), index.offsetOf[i] + 1);
    r.collapse(true);
    return r;
  }

  // ── Manifest → entries for this page ──────────────────────────────────
  // Manifest keys are relative to the git root. The page path is relative to
  // the Hugo project, which can sit in a subdirectory of the repository, and
  // snippet paths are relative to assets/. So a source matches a key that
  // equals it or ends in "/" + it.
  function keyMatches(key, path) {
    return !!path && (key === path || key.slice(-(path.length + 1)) === "/" + path);
  }

  function matchesPageFile(key) {
    return keyMatches(key, sources.page);
  }

  // The manifest keys this page was built from. For each snippet, the
  // resolved path wins and the written path is only a fallback: on a site
  // with a real per-version override, the written path also matches the
  // unversioned copy, and an edit to that copy must not mark this page. The
  // fallback is for an assembled site, which MOUNTS the written file at the
  // resolved path, so only the written path is in its diff.
  function pageKeys(keys) {
    var out = {};
    keys.forEach(function (k) { if (matchesPageFile(k)) out[k] = true; });
    (sources.snippets || []).forEach(function (s) {
      var resolved = keys.filter(function (k) { return keyMatches(k, s.resolved); });
      if (!resolved.length && s.written !== s.resolved) {
        resolved = keys.filter(function (k) { return keyMatches(k, s.written); });
      }
      resolved.forEach(function (k) { out[k] = true; });
    });
    return out;
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

    var files = manifest.files || {};
    var entries = Object.keys(pageKeys(Object.keys(files))).map(function (key) {
      return [key, files[key]];
    });
    if (!entries.length) { renderPanel(null); setState("none"); return; }

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
      // insertNode splits a text node, and every Range already created
      // (the other markers' points and the highlight ranges) is live, so the
      // browser moves them to the new nodes. That is what keeps the order of
      // insertion from mattering; nothing here relies on document order.
      points.forEach(function (pt) {
        var m = document.createElement("span");
        m.className = "extras-removed";
        m.setAttribute("data-removed", pt[1].length > 160 ? pt[1].slice(0, 157) + "..." : pt[1]);
        m.setAttribute("aria-hidden", "true");
        pt[0].insertNode(m);
      });
      if (isNew) root.classList.add("extras-changed-new");
    }
    renderPanel({ found: ranges.length, removed: points.length, missed: missed, isNew: isNew, base: manifest.base });
    setState(enabled ? "painted" : "hidden");
  }

  // A signal for tests and for anyone debugging a preview: <html
  // data-extras-changes="..."> says what the overlay last concluded.
  //   painted / hidden  the manifest had entries for this page
  //   none              the manifest had nothing for this page
  //   no-manifest       there is no manifest (or it could not be read)
  function setState(state) {
    document.documentElement.setAttribute("data-extras-changes", state);
  }

  function refresh() {
    fetch(manifestUrl, { cache: "no-store" })
      .then(function (r) {
        // No manifest: stop asking. A site that never set the watcher up
        // would otherwise log a 404 every two seconds on every dev page. When
        // the watcher starts later, its first write is a static-file change,
        // which reloads the page, and the new page finds the manifest.
        if (r.status === 404) { stopPolling(); return null; }
        return r.ok ? r.json() : null;
      })
      .then(function (m) {
        if (!m) { renderPanel(null); setState("no-manifest"); return; }
        if (m.hash === lastHash) return;
        lastHash = m.hash;
        lastManifest = m;
        apply(m);
      })
      .catch(function () { renderPanel(null); setState("no-manifest"); });
  }

  function stopPolling() {
    if (timer) { clearInterval(timer); timer = null; }
  }

  function start() {
    try {
      var parsed = JSON.parse(document.getElementById("extras-change-sources").textContent);
      if (parsed && typeof parsed === "object") sources = parsed;
    } catch (e) { /* no sources: nothing to match */ }
    refresh();
    if (polling) timer = setInterval(function () { if (!document.hidden) refresh(); }, POLL_MS);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start);
  else start();
})();
