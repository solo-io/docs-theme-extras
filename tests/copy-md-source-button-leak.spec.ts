import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for the Hextra copy-button leak into copy-md-source.
//
// Hextra's codeblock-copy-button partial emits multi-line HTML (one attribute
// per line). Shortcodes that flatten their rendered output via a blind
// `replace ... "\n" "&#10;"` (today: tabs.html and the flatten-rendered
// utility partial used by version/reuse/alert/conditional-text) turn each
// newline inside the opening <button> tag into a `&#10;` entity between
// attributes. transform.HTMLToMarkdown — which docs-theme-extras's
// copy-markdown.html uses to populate the page's `copy-md-source` script —
// does not normalize those entities, so it falls back to emitting the
// opening `<button class="hextra-code-copy-btn …">` as raw text. The
// markdown source then ends up with literal `<button>` opening tags
// scattered after every fenced code block, and the "View as Markdown"
// dialog renders them as visible HTML.
//
// Fix: pre-collapse the `<div class="hextra-code-copy-btn-container">…
// </button></div>` block to a single logical line BEFORE the global
// newline-to-entity replace. That keeps the button HTML on one line so
// transform.HTMLToMarkdown handles it cleanly. Both `_shortcodes/tabs.html`
// and `_partials/utils/flatten-rendered.html` carry the same pre-collapse
// pass (tabs.html doesn't go through flatten-rendered, so it needs its own).
//
// The fixture exercise: v2/everything has a "Tabs in both shortcode forms"
// section with a code fence inside a percent-form tab, which is the exact
// shape that produced the bug on solo-io/docs PR #2537's operator pages.

// Pages with at least one code block inside a {{< tabs >}}…{{% tab %}}
// block, OR a code block inside a {{% version %}} (the flatten-rendered
// path). Both code paths must produce a clean copy-md-source.
const CONTENT_PAGES = new Set([
  "v1/everything", "v1/rebased",
  "v2/everything", "v2/rebased",
  "main/everything", "main/rebased",
]);

// Pull the markdown source out of the page's hidden <script
// type="text/markdown" class="copy-md-source"> tag. Handles both the
// Hugo-dev form (`class="copy-md-source"`) and the minified form
// (`class=copy-md-source` with unquoted attrs). Returns "" if the page
// doesn't carry the tag (themes that don't include copy-markdown.html).
function copyMdSource(html: string): string {
  const m = html.match(
    /<script[^>]*copy-md-source[^>]*>([\s\S]*?)<\/script>/i,
  );
  return m ? m[1] : "";
}

test.describe("copy-md-source does not leak Hextra copy-button HTML", () => {
  for (const page of TEST_PAGES) {
    if (!CONTENT_PAGES.has(page.name)) continue;

    test(`${page.name}: no <button class="hextra-code-copy-btn"> in markdown source`, () => {
      const html = readFixture(page.filePath);
      const src = copyMdSource(html);
      expect(
        src.length,
        `${page.name}: copy-md-source script empty or missing — copy-markdown.html ` +
          `did not render its hidden source tag`,
      ).toBeGreaterThan(0);

      // The leak's distinctive fingerprint is `&amp;lt;button` followed
      // somewhere by the copy-button class. Double encoding tells us
      // transform.HTMLToMarkdown gave up on parsing the multi-line tag
      // and dumped it as escaped text: `<button` → `&lt;button` (escape
      // pass 1) → `&amp;lt;button` (embed-in-<script> pass 2). A correctly
      // stripped button leaves NO text behind in the markdown source; a
      // cleanly emitted single-line button shows up as a single-encoded
      // `&lt;button …&gt;`, which is also acceptable (the dialog renders
      // it as harmless escaped HTML, not garbled multi-line text). The
      // double-encoded form is the unambiguous bug.
      expect(
        src,
        `${page.name}: copy-md-source contains a double-encoded ` +
          `<button class="hextra-code-copy-btn …"> — Hextra's multi-line ` +
          `copy-button HTML leaked through transform.HTMLToMarkdown as raw ` +
          `text. Pre-collapse the copy-btn-container in any shortcode that ` +
          `does a blind \\n → &#10; replace on rendered output (today: ` +
          `_shortcodes/tabs.html and _partials/utils/flatten-rendered.html). ` +
          `See solo-io/docs PR #2537 for the original symptom.`,
      ).not.toMatch(/&amp;lt;button[^>]*?hextra-code-copy-btn/);
    });
  }
});
