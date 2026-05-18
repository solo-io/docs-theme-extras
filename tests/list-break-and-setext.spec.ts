import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guards for two production bugs in gloo-mesh ambient
// multicluster pages (2026-05):
//
//   1. List-break artifact: `{{< reuse "..." >}}` whose snippet contains
//      multi-block content (paragraph + code fence + tabs) inside a
//      numbered list item produced `<ol start="N">` fragments. The
//      expansion's first line lands at the list-item content column but
//      newline-separated continuation lines land at column 0, so
//      Goldmark's list-continuation rule closes the parent list early.
//      Symptom: tabs and trailing steps appear outside the parent <ol>,
//      and downstream alerts/headings/tables render as plain body text.
//
//   2. Setext H1 from a no-language fenced code block: the block's body
//      contained intentional blank-line separators with `=== Section ===`
//      underline-style lines. CommonMark HTML block type 6 (started by
//      the theme's outer `<div class="hextra-code-block">`) terminates
//      at any blank line. The block closed early and Goldmark reparsed
//      the rest of the code body as markdown — `=== Cluster ===` lines
//      became Setext H1 headings, and the copy button's HTML attribute
//      text became visible text.
//
// Both bugs share a structural signature in the rendered HTML:
//   - `<ol start="N">` after a `</ol>` at the same nesting level
//   - `<h1>` whose body is dominated by `=`, `-`, or `*` decorations
//     (the Setext-underline content gets re-parsed as a heading)

// Strip the Copy-as-Markdown <script> block before searching. That block
// embeds the raw markdown source (including literal `===` separators and
// `1. ` list markers) and would false-positive these checks.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Pages where the fixture sections are present. The fixture is built into
// v1/v2/main/everything copies; all three exercise the same content.
const FIXTURE_PAGES = [
  "v1/everything",
  "v2/everything",
  "main/everything",
];

test.describe("multi-block reuse inside numbered list stays inside <ol>", () => {
  for (const page of TEST_PAGES) {
    if (!FIXTURE_PAGES.includes(page.name)) continue;

    test(`${page.name}: list-before/middle/after markers share the same <ol>`, () => {
      const html = visibleHtml(page.filePath);
      const before = html.indexOf("MARKER_LISTBREAK_BEFORE");
      const middle = html.indexOf("MARKER_MULTIBLOCK_LEAD");
      const after = html.indexOf("MARKER_LISTBREAK_AFTER");
      expect(before, "MARKER_LISTBREAK_BEFORE missing").toBeGreaterThan(-1);
      expect(middle, "MARKER_MULTIBLOCK_LEAD missing").toBeGreaterThan(-1);
      expect(after, "MARKER_LISTBREAK_AFTER missing").toBeGreaterThan(-1);
      expect(middle, "lead marker should follow the before-step").toBeGreaterThan(before);
      expect(after, "after-step should follow the middle reuse").toBeGreaterThan(middle);

      // Walk between markers and confirm no `<ol>` opens or closes. If the
      // list broke, we'd see </ol>...<ol start="3"> between MARKER_*_BEFORE
      // and MARKER_*_AFTER.
      const between = html.slice(before, after);
      expect(
        between,
        "</ol> appears between list markers — list closed early around the multi-block reuse",
      ).not.toMatch(/<\/ol>/);
      expect(
        between,
        "<ol start=...> appears between list markers — list was split and restarted",
      ).not.toMatch(/<ol\s+start=/);
    });

    test(`${page.name}: tabs from the multi-block reuse stay nested inside the parent <li>`, () => {
      const html = visibleHtml(page.filePath);
      const tabA = html.indexOf("MARKER_MULTIBLOCK_TAB_A");
      const tabB = html.indexOf("MARKER_MULTIBLOCK_TAB_B");
      expect(tabA, "MARKER_MULTIBLOCK_TAB_A missing").toBeGreaterThan(-1);
      expect(tabB, "MARKER_MULTIBLOCK_TAB_B missing").toBeGreaterThan(-1);

      // For each tab marker: the nearest preceding open structural element
      // must be <li>, not the outer <article>/<main>. The list-break bug
      // moves tabs out of <li>.
      for (const [name, idx] of [
        ["MARKER_MULTIBLOCK_TAB_A", tabA] as const,
        ["MARKER_MULTIBLOCK_TAB_B", tabB] as const,
      ]) {
        const liOpen = html.lastIndexOf("<li", idx);
        const liClose = html.lastIndexOf("</li>", idx);
        expect(
          liOpen,
          `${name} has no preceding <li> — tab hoisted outside the parent list`,
        ).toBeGreaterThan(-1);
        expect(
          liOpen,
          `${name} sits after a closed </li> — tab rendered outside the parent <ol>`,
        ).toBeGreaterThan(liClose);
      }
    });

    test(`${page.name}: trailing paragraph from the snippet stays inside the parent <li>`, () => {
      const html = visibleHtml(page.filePath);
      const trail = html.indexOf("MARKER_MULTIBLOCK_TRAIL");
      expect(trail, "MARKER_MULTIBLOCK_TRAIL missing").toBeGreaterThan(-1);
      const liOpen = html.lastIndexOf("<li", trail);
      const liClose = html.lastIndexOf("</li>", trail);
      expect(
        liOpen,
        "MARKER_MULTIBLOCK_TRAIL not inside an <li> — trailing block hoisted outside",
      ).toBeGreaterThan(liClose);
    });
  }
});

test.describe("no-language code block with Setext-like separators renders inside <pre>", () => {
  for (const page of TEST_PAGES) {
    if (!FIXTURE_PAGES.includes(page.name)) continue;

    test(`${page.name}: '=== Section ===' lines render as code, not <h1>`, () => {
      const html = visibleHtml(page.filePath);
      const head = html.indexOf("MARKER_SETEXT_PROSE_HEAD");
      const tail = html.indexOf("MARKER_SETEXT_PROSE_TAIL");
      const cluster1 = html.indexOf("MARKER_SETEXT_CLUSTER_1");
      const cluster2 = html.indexOf("MARKER_SETEXT_CLUSTER_2");
      expect(head, "MARKER_SETEXT_PROSE_HEAD missing").toBeGreaterThan(-1);
      expect(tail, "MARKER_SETEXT_PROSE_TAIL missing").toBeGreaterThan(-1);
      expect(cluster1, "MARKER_SETEXT_CLUSTER_1 missing").toBeGreaterThan(-1);
      expect(cluster2, "MARKER_SETEXT_CLUSTER_2 missing").toBeGreaterThan(-1);

      // All four markers must sit inside the same <pre>...</pre> block.
      // The bug closed the outer hextra-code-block <div> early at the
      // first blank line, so cluster2 would land outside the <pre> and
      // the `=== Cluster: cluster2 ===` line would become a Setext H1.
      for (const [name, idx] of [
        ["MARKER_SETEXT_PROSE_HEAD", head] as const,
        ["MARKER_SETEXT_CLUSTER_1", cluster1] as const,
        ["MARKER_SETEXT_CLUSTER_2", cluster2] as const,
        ["MARKER_SETEXT_PROSE_TAIL", tail] as const,
      ]) {
        const preOpen = html.lastIndexOf("<pre", idx);
        const preClose = html.lastIndexOf("</pre>", idx);
        expect(
          preOpen,
          `${name} has no preceding <pre> — block didn't render as code`,
        ).toBeGreaterThan(-1);
        expect(
          preOpen,
          `${name} sits after a closed </pre> — the no-language code block ` +
            `terminated early at a blank line, and the rest of the body got ` +
            `reparsed as markdown (likely Setext H1 from '=== ===' lines)`,
        ).toBeGreaterThan(preClose);
      }
    });

    test(`${page.name}: no <h1> contains '=== Cluster' (Setext-from-code regression)`, () => {
      const html = visibleHtml(page.filePath);
      // Heading whose body is dominated by Setext-underline characters
      // — `=`, `-` — interleaved with the cluster name from the fixture.
      // The bug produced `<h1>=== Cluster: cluster2 ===</h1>` when the
      // outer code-block <div> terminated early.
      const setextH1 = html.match(/<h[12][^>]*>[^<]*=== Cluster[^<]*<\/h[12]>/);
      expect(
        setextH1,
        setextH1
          ? `Setext-style heading leaked from a code block: ${JSON.stringify(setextH1[0])}`
          : "no Setext-from-code regression",
      ).toBeNull();
    });
  }
});
