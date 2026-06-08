import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the docs-hub escaping bug (gme retry-timeout / api-key).
//
// When a {{% conditional-text %}} block contains a markdown TABLE and a nested
// {{< reuse >}}, two failure modes existed:
//   1. A numbered LIST whose step contains a table was misclassified as a
//      table-row block (isTableRow fired on any `|` line) and routed through
//      the printf table-row emit path, which escaped the nested reuse's
//      rendered inline HTML (<code>) to &lt;code&gt;.
//   2. A genuine conditional table-ROW that reuses a snippet escaped the
//      reuse's <code> because the printf path stringified the shortcode output
//      (losing the placeholder), so the inline HTML was HTML-escaped.
//
// Fixes (conditional-text.html): isTableRow now anchors on the FIRST non-blank
// line, and the table-row path emits `.Inner` directly (template.HTML) instead
// of via printf. This page exercises both cases; the reused inline code must
// render as a real <code> element and the tables must still render.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/cond-reuse-table/index.html");
const MARKER = "MARKER_CONDREUSE_CODE";

// Strip the copy-as-markdown <script> source, which embeds the raw markdown
// (literal backticks) and would otherwise produce false positives.
function visibleHtml(): string {
  return readFixture(PAGE).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

test.describe("conditional-text with a table + nested reuse (no inline-HTML escape)", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: cond-reuse-table exists only in the extras fixture build");

  test("the reused inline code renders as <code>, not escaped &lt;code&gt;", () => {
    const html = visibleHtml();
    expect(html.indexOf(MARKER), `${MARKER} missing from cond-reuse-table`).toBeGreaterThan(-1);

    // The leak symptom: the reuse's <code> was escaped to &lt;code&gt; around the marker.
    expect(
      html,
      `Found escaped &lt;code&gt;${MARKER} — the nested reuse's inline HTML leaked as text`,
    ).not.toContain(`&lt;code&gt;${MARKER}`);

    // It must sit inside a real <code> element.
    expect(
      html,
      `${MARKER} is not wrapped in a <code> element`,
    ).toMatch(new RegExp(`<code>${MARKER}</code>`));
  });

  test("the conditional table row merges into a table, not a literal pipe paragraph", () => {
    const html = visibleHtml();
    // Case 2 row leaks as <p>| selector | ... |</p> when the merge breaks.
    expect(
      html,
      "A conditional table row leaked as a literal `<p>| … |` paragraph instead of merging into the table",
    ).not.toMatch(/<p>\s*\|/);
    // The `selector` cell must live inside a table cell.
    expect(html, "no <table> rendered on the page").toContain("<table");
  });
});
