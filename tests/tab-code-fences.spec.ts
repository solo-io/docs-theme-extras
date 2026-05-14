import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for the {{% tab %}} (percent-form) double-markdownify bug.
//
// {{% tab %}} (percent form) pre-processes .Inner through Markdown before the
// shortcode template runs, producing HTML. tabs.html was calling markdownify
// on that already-rendered HTML; the CommonMark HTML-block parser (Goldmark)
// terminates <pre> at blank lines, injecting <p> tags that break code blocks
// and the Hextra copy button.
//
// Fix: tab.html sets isRendered=true when it detects block-level HTML tags at
// the start of .InnerDeindent (the percent-form path); tabs.html uses safeHTML
// for those panels and markdownify only for raw-Markdown (angle-bracket) tabs.
//
// These tests assert the invariant: blank lines inside a code fence inside a
// {{% tab %}} do NOT produce <p> tags inside the enclosing <pre>.

const PROSE  = "MARKER_TAB_BLANKFENCE_PROSE";
const BEFORE = "MARKER_TAB_BLANKFENCE_BEFORE";
const AFTER  = "MARKER_TAB_BLANKFENCE_AFTER";

// The tab is not version-gated — all content pages carry it.
const CONTENT_PAGES = new Set([
  "v1/everything", "v1/rebased",
  "v2/everything", "v2/rebased",
  "main/everything", "main/rebased",
]);

// Strip the copy-as-markdown <script> so raw marker text in the embedded
// source doesn't satisfy the presence / structure checks below.
function strippedHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

test.describe("tab panel code fences with blank lines stay intact", () => {
  for (const page of TEST_PAGES) {
    if (!CONTENT_PAGES.has(page.name)) continue;

    test(`${page.name}: pre-blank marker (${BEFORE}) is inside <code>`, () => {
      const html = strippedHtml(page.filePath);
      const idx = html.indexOf(BEFORE);
      expect(idx, `${BEFORE} missing`).toBeGreaterThan(-1);

      const before = html.slice(0, idx);
      const opens  = (before.match(/<code[\s>]/g) || []).length;
      const closes = (before.match(/<\/code>/g)   || []).length;
      expect(opens, `${BEFORE}: not inside any open <code>`).toBeGreaterThan(closes);
    });

    test(`${page.name}: post-blank marker (${AFTER}) is inside <code>, not a <p>`, () => {
      const html = strippedHtml(page.filePath);
      const idx = html.indexOf(AFTER);
      expect(idx, `${AFTER} missing`).toBeGreaterThan(-1);

      // Core: marker must still sit inside an open <code> after the blank line.
      const before = html.slice(0, idx);
      const opens  = (before.match(/<code[\s>]/g) || []).length;
      const closes = (before.match(/<\/code>/g)   || []).length;
      expect(
        opens,
        `${AFTER}: not inside any open <code> — a blank line inside the tab's code ` +
          `fence terminated the <pre> and injected a <p> (isRendered flag did not fire)`,
      ).toBeGreaterThan(closes);

      // Smoking-gun: no <p> between the enclosing <pre> and this marker.
      const preIdx = before.lastIndexOf("<pre");
      expect(preIdx, `${AFTER}: no preceding <pre> — code block was not rendered`).toBeGreaterThan(-1);
      expect(
        before.slice(preIdx),
        `${AFTER}: <p> found inside the enclosing <pre> — markdownify was called on ` +
          `already-rendered HTML from {{% tab %}}; the CommonMark parser terminated ` +
          `the <pre> at the blank line`,
      ).not.toMatch(/<p[\s>]/);
    });

    test(`${page.name}: no <p> inside any <pre> within the tab panel`, () => {
      const html = strippedHtml(page.filePath);
      const proseIdx = html.indexOf(PROSE);
      expect(proseIdx, `${PROSE} missing — tab panel not rendered`).toBeGreaterThan(-1);

      // Isolate the tab panel that contains the prose marker.
      const panelStart = html.lastIndexOf('class="hextra-tab-panel', proseIdx);
      expect(panelStart, "no .hextra-tab-panel preceding prose marker").toBeGreaterThan(-1);

      // Panel ends at the next sibling panel opening (if any).
      const nextPanel = html.indexOf("hextra-tab-panel", proseIdx + PROSE.length);
      const panelHtml = nextPanel > -1
        ? html.slice(panelStart, nextPanel)
        : html.slice(panelStart);

      // Scan every <pre>…</pre> inside the panel.
      const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
      let m: RegExpExecArray | null;
      while ((m = preRe.exec(panelHtml)) !== null) {
        expect(
          m[1],
          `${page.name}: <p> inside a <pre> in the tab panel — code block was broken ` +
            `by markdownify on already-rendered HTML from {{% tab %}}; the CommonMark ` +
            `parser terminated the <pre> at a blank line`,
        ).not.toMatch(/<p[\s>]/);
      }
    });
  }
});
