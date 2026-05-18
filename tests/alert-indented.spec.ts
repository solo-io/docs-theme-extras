import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for the alert-body-as-pre-code bug. When `{{< alert >}}`
// appears in a deeply-indented context (e.g. nested sub-step at column 6),
// .Inner reaches markdownify with 6 spaces of leading whitespace per line.
// Without dedent, CommonMark's "4 spaces = indented code block" rule fires
// and the entire alert body renders inside `<pre><code>...</code></pre>`,
// with inline HTML tags appearing as escaped `&lt;code&gt;` visible text.
// alert.html dedents .Inner before markdownify; this spec locks the
// behavior in.

function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

const FIXTURE_PAGES = [
  "v1/everything",
  "v2/everything",
  "main/everything",
];

test.describe("alert body dedents source indent before markdownify", () => {
  for (const page of TEST_PAGES) {
    if (!FIXTURE_PAGES.includes(page.name)) continue;

    test(`${page.name}: MARKER_ALERT_INDENTED renders inside solo-alert-body, not <pre><code>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf("MARKER_ALERT_INDENTED");
      expect(idx, "MARKER_ALERT_INDENTED missing").toBeGreaterThan(-1);

      // The marker must sit inside a <div class="solo-alert-body">, not
      // inside a <pre><code> block. Walk back from the marker to find the
      // nearest opening tag and confirm it's solo-alert-body.
      const bodyOpen = html.lastIndexOf('<div class="solo-alert-body">', idx);
      expect(
        bodyOpen,
        "no preceding <div class=\"solo-alert-body\"> — alert structure broken",
      ).toBeGreaterThan(-1);

      // Confirm there's no <pre> between the body opener and the marker.
      // A <pre> there means the body was treated as a code block.
      const preBetween = html.slice(bodyOpen, idx).indexOf("<pre");
      expect(
        preBetween,
        "alert body wrapped in <pre> — markdownify hit the '4 spaces = code' rule because .Inner wasn't dedented. The inline <code>…</code> tags will render as escaped &lt;code&gt; text.",
      ).toBe(-1);
    });

    test(`${page.name}: indented alert's inline HTML renders as real elements`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf("MARKER_ALERT_INDENTED");
      expect(idx, "MARKER_ALERT_INDENTED missing").toBeGreaterThan(-1);

      // Extract the solo-alert-body that contains the marker.
      const bodyOpen = html.lastIndexOf('<div class="solo-alert-body">', idx);
      const bodyClose = html.indexOf("</div>", idx);
      expect(bodyOpen, "no <div class=\"solo-alert-body\"> before marker").toBeGreaterThan(-1);
      expect(bodyClose, "no </div> after marker").toBeGreaterThan(idx);
      const body = html.slice(bodyOpen, bodyClose);

      // The fixture writes <strong>MARKER_ALERT_INDENTED_HTML</strong>
      // inside the alert body. If the body got HTML-escaped (because
      // markdownify treated 6-space-indented content as a code block),
      // the marker would land inside a `&lt;strong&gt;` text run instead
      // of a real <strong> element.
      expect(
        body,
        "alert body has no real <strong>MARKER_ALERT_INDENTED_HTML</strong> element — inline HTML got escaped",
      ).toMatch(/<strong>MARKER_ALERT_INDENTED_HTML<\/strong>/);
      expect(
        body,
        "alert body contains the escaped form '&lt;strong&gt;MARKER_ALERT_INDENTED_HTML' — markdownify treated the body as code",
      ).not.toContain("&lt;strong&gt;MARKER_ALERT_INDENTED_HTML");
    });

    test(`${page.name}: indented alert stays inside its parent <li>`, () => {
      // Locks in the existing flatten behavior: the alert HTML stays on
      // one logical line so the surrounding numbered list doesn't break.
      // If this regresses we'd see <ol start="2"> for the step after the
      // alert.
      const html = visibleHtml(page.filePath);
      const before = html.indexOf("First step.");
      const indented = html.indexOf("MARKER_ALERT_INDENTED");
      const after = html.indexOf("Second step after the alert");
      expect(before, "First step marker missing").toBeGreaterThan(-1);
      expect(indented, "MARKER_ALERT_INDENTED missing").toBeGreaterThan(-1);
      expect(after, "Second step marker missing").toBeGreaterThan(-1);

      const between = html.slice(before, after);
      expect(
        between,
        "<ol start=...> between the steps — alert HTML broke list continuation",
      ).not.toMatch(/<ol\s+start=/);
    });
  }
});
