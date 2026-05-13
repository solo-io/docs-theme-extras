import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for solo-io/docs#2480. A version block that wraps
// bullets and fenced code inside a nested numbered list (continuation at
// 6+ space indent) used to render the bullets as a literal <pre><code>
// because CommonMark's "4 spaces = code block" rule bit RenderString on
// the raw indented .Inner. The fixture in everything.md exercises this
// shape; version.html dedents .Inner, flattens structural newlines in
// the rendered output, and escapes any remaining \n as &#10; so the
// inserted HTML stays cohesive inside the surrounding list. This spec
// locks that behavior in.

const BULLETS = [
  "MARKER_VERSION_NESTED_BULLET_1",
  "MARKER_VERSION_NESTED_BULLET_2",
  "MARKER_VERSION_NESTED_BULLET_3",
] as const;
const CODE = "MARKER_VERSION_NESTED_CODE";

// Strip the copy-as-markdown <script> block before searching — it
// embeds the raw markdown source (including literal ``` fences and
// indented asterisks) and would otherwise match the marker first.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

const V2_PAGES = ["v2/everything", "v2/rebased"];
const NON_V2_PAGES = [
  "v1/everything",
  "v1/rebased",
  "main/everything",
  "main/rebased",
];

test.describe("nested version block renders bullets and code", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: each bullet's closest enclosing tag is <li>, not <pre>`, () => {
      const html = visibleHtml(page.filePath);
      for (const marker of BULLETS) {
        const idx = html.indexOf(marker);
        expect(idx, `${marker} missing from ${page.name}`).toBeGreaterThan(-1);
        const liIdx = html.lastIndexOf("<li", idx);
        const preIdx = html.lastIndexOf("<pre", idx);
        const codeIdx = html.lastIndexOf("<code", idx);
        expect(
          liIdx,
          `${marker} has no preceding <li> — bullet didn't parse as a list item`,
        ).toBeGreaterThan(-1);
        expect(
          liIdx,
          `${marker} is inside <pre> (literal text) instead of <li> — ` +
            `version.html lost or stopped dedenting indented .Inner content`,
        ).toBeGreaterThan(preIdx);
        expect(
          liIdx,
          `${marker} is inside <code> instead of <li>`,
        ).toBeGreaterThan(codeIdx);
      }
    });

    test(`${page.name}: fenced code is Chroma-highlighted, not literal`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CODE);
      expect(idx, `${CODE} missing from ${page.name}`).toBeGreaterThan(-1);
      const preIdx = html.lastIndexOf("<pre", idx);
      expect(preIdx, `${CODE} has no preceding <pre>`).toBeGreaterThan(-1);
      const preTag = html.slice(preIdx, html.indexOf(">", preIdx) + 1);
      expect(
        preTag,
        `${CODE}'s enclosing <pre> has no Chroma class — fence wasn't parsed as a code block`,
      ).toMatch(/class="[^"]*chroma/);
    });

    test(`${page.name}: rendered block stays inside the parent <ol>`, () => {
      // The shortcode output is inserted at 6-space source indent inside
      // an <li>. Embedded newlines in the output would let column-0 <li>
      // tags trigger CommonMark Type 6 HTML blocks that close out the
      // surrounding <ol> early. Assert that the FIRST bullet is preceded
      // by the parent <ol><li> structure (not orphaned outside it).
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(BULLETS[0]);
      // Walk back to find the nearest <ol — must be open at this point.
      const olOpen = html.lastIndexOf("<ol", idx);
      const olClose = html.lastIndexOf("</ol>", idx);
      expect(
        olOpen,
        `${BULLETS[0]} not inside an <ol> — outer numbered list was closed before the bullet`,
      ).toBeGreaterThan(olClose);
    });
  }
});

test.describe("nested version block respects include-if gating", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: bullet and code markers are absent`, () => {
      const html = visibleHtml(page.filePath);
      for (const marker of [...BULLETS, CODE]) {
        expect(
          html,
          `${marker} leaked into ${page.name} (include-if="v2" should exclude it)`,
        ).not.toContain(marker);
      }
    });
  }
});
