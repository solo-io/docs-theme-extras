import { test, expect } from "@playwright/test";
import fs from "node:fs";
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

// ---------------------------------------------------------------------------
// Regression guard for the docs-hub FULL-TABLE escaping bug
// (gloo-mesh-enterprise about-databases #byo-local, solo-io/docs#2726 follow-up).
//
// A conditional-text block that wraps a WHOLE markdown table (header +
// `|---|---|` delimiter + rows) — as opposed to a single appended row — must
// keep inline HTML in its cells intact and render a real <table>. Two failure
// modes existed in the docs LOCAL conditional-text override:
//   - Case 3 (percent form, table reused via a conref): the raw-emitted table
//     was reparsed in the nested reuse RenderString and `<ul><li>` sizing lists
//     in cells leaked as escaped `&lt;ul&gt;` text.
//   - Case 4 (angle form): angle output bypasses markdown, so a raw-emitted
//     table never rendered at all — the whole table leaked as literal text and
//     its cell `<ul>` escaped.
// Fix: conditional-text detects a self-contained table ($isFullTable) and
// renders it with RenderString(display:block) + flatten-rendered, so cell HTML
// is preserved and the table always renders. The extras conditional-text emits
// the table-row body as bare `{{ .Inner }}` and already renders these cleanly;
// these cases guard BOTH the extras template and any consumer's local override.
//
// Unlike the Case 1/2 block above (which is extras-fixture-only because its
// list/row shapes render differently under a consumer's local override), these
// cases must hold on EVERY build that ships the fixture — that is the whole
// point of guarding a consumer's override. They self-skip when the build
// predates the fixture (markers absent) or on products that have no fixture.
test.describe("conditional-text wrapping a full table (no HTML-list / table leak)", () => {
  const pageExists = fs.existsSync(PAGE);
  const html = pageExists ? visibleHtml() : "";

  // Return the HTML of the section that starts at the <h2> preceding `marker`
  // and ends at the next <h2> (or end of document), so a leak elsewhere on the
  // page can't mask or falsely trip a per-case assertion.
  function sectionFor(marker: string): string | null {
    const i = html.indexOf(marker);
    if (i < 0) return null;
    const start = html.lastIndexOf("<h2", i);
    const next = html.indexOf("<h2", i);
    return html.slice(start < 0 ? 0 : start, next < 0 ? html.length : next);
  }

  for (const { name, marker, form } of [
    { name: "Case 3 — percent form, table reused via conref", marker: "MARKER_HTMLLIST_CPU", form: "{{% %}}" },
    { name: "Case 4 — angle form, table inline", marker: "MARKER_ANGLETABLE", form: "{{< >}}" },
  ]) {
    test(`${name}: cell <ul> stays real HTML and the table renders`, () => {
      test.skip(!pageExists, "cond-reuse-table fixture not present in this build");
      const section = sectionFor(marker);
      test.skip(section === null, `fixture predates the full-table cases (${marker} absent)`);

      // Leak symptom 1: the cell's <ul>/<li> escaped to literal &lt;ul&gt; text.
      expect(
        section,
        `${form} conditional-text full table escaped a cell list to &lt;ul&gt; (inline HTML leaked as text)`,
      ).not.toContain("&lt;ul&gt;");
      expect(
        section,
        `${form} conditional-text full table dropped its cell <ul> (list did not render)`,
      ).toContain("<ul>");

      // Leak symptom 2: the whole markdown table leaked as literal pipes
      // instead of rendering (angle-form failure mode).
      expect(
        section,
        `${form} conditional-text full table did not render as a <table>`,
      ).toContain("<table");
      expect(
        section,
        `${form} conditional-text full table leaked as a literal \`| … |\` paragraph`,
      ).not.toMatch(/<p>\s*\|/);
    });
  }
});
