import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for utils/unhide-tabs.html, which flattens Hextra tab
// groups for every linear-reading context: the PDF/book stitching, the
// `markdown` output format, and the "Copy as Markdown" button.
//
// WHY THIS EXISTS. The partial had NO coverage, and it handled only ONE of the
// two live tab markups: a consumer with a tabs override (solo-io/docs) hit
// patterns that matched nothing here, so its book shipped unlabelled, stacked
// options. Nobody noticed, because copy-markdown.html carried its own copy that
// handled both, so the visible button looked fine. The next attempt fixed the
// wrong half — it anchored on `class="hextra-tab-panel"`, which only the ACTIVE
// panel of each group carries, so it labelled the first option of every group
// and skipped the rest. The one after that dropped the id -> name map and
// labelled stock-Hextra panels `Option: tabs-tab-tabs-14-0`. All three were
// found by a human reading output.
//
// So this spec asserts a COUNTING invariant rather than the presence of any
// one string: every tab group in the rendered page contributes exactly one
// lead-in sentence, and every panel contributes exactly one "Option:" label.
// A pattern that matches only the first panel of a group fails it; a pattern
// that matches nothing at all fails it.
//
// It reads the copy-as-markdown payload because that is the flattened output
// present on every built page. The book output goes through the same partial.
//
// TWO markups are counted, because a consumer produces one or the other and
// this module's own fixture produces the second one:
//   A. a consumer overriding Hextra's tabs shortcode (solo-io/docs) — the
//      button bar is a <nav> inside .hextra-tabs, panels carry data-tab-name.
//   B. stock Hextra v0.12 — the bar is [role="tablist"], panels are
//      .hextra-tabs-panel[aria-labelledby].
// Only B is exercised here. A is exercised when this suite runs against a
// consumer that has the override (`make test CONFIG=…`).

const SENTENCE = "You can choose from the following options.";

// The rendered page's own markup, minus the embedded markdown payload — so
// counting tab groups here can never pick up the flattened copy of them.
function bodyMarkup(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*class=["']copy-md-source["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

function markdownPayload(filePath: string): string {
  const m = readFixture(filePath).match(
    /<script[^>]*class=["']copy-md-source["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  return m ? m[1] : "";
}

function count(haystack: string, re: RegExp): number {
  return (haystack.match(re) || []).length;
}

test.describe("tab groups flatten with one lead-in and one label per option", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name}`, () => {
      const body = bodyMarkup(page.filePath);
      // Variant A's `<div class="hextra-tabs "` prefix also matches variant
      // B's `hextra-tabs-panel`, so A's group is anchored on the <nav> that
      // only A has.
      const groups =
        count(body, /<div class="hextra-tabs[^"]*"[^>]*>(?:\s|&#10;)*<nav/g) +
        count(body, /role="tablist"/g);
      const panels =
        count(body, /data-tab-name="/g) +
        count(body, /<div class="hextra-tabs-panel/g);

      test.skip(groups === 0, "page has no tab groups");

      const md = markdownPayload(page.filePath);
      expect(md, "page has no copy-as-markdown payload").not.toBe("");

      // One lead-in per GROUP. Without it the reader gets several "Option:"
      // blocks and nothing saying they are alternatives rather than a
      // sequence of steps to work through in order.
      expect(count(md, new RegExp(SENTENCE.replace(/\./g, "\\."), "g"))).toBe(groups);

      // One label per PANEL — the assertion that catches an anchor which
      // matches only each group's active panel.
      expect(count(md, /\*\*Option: /g)).toBe(panels);

      // Every label names the tab the reader would have clicked, not the DOM
      // id the panel's aria-labelledby points at. Stock Hextra's ids all look
      // like `tabs-tab-tabs-14-0`, so an id leaking through as a label is
      // recognizable on sight — and it is what ships if the id -> name map in
      // unhide-tabs.html is dropped or built AFTER the button bar is stripped.
      expect(md).not.toMatch(/\*\*Option: tabs-tab-/);

      // The button bar is a dead control once there is no JS to switch tabs,
      // so it must not survive into the flattened output.
      expect(md).not.toContain("hextra-tab-btn");
      expect(md).not.toContain("hextra-tab-panel");
      expect(md).not.toContain("hextra-tabs-panel");
      expect(md).not.toContain('role="tab');
    });
  }
});
