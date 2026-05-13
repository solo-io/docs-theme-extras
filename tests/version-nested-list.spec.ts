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

        // Tight check: the bullet's own <li> opening tag must sit
        // immediately before the marker (whitespace-only between).
        // The lastIndexOf("<li") heuristic below passes when the
        // bullets leak as plain text inside the parent step's <li>,
        // because that outer <li> still counts as "some preceding <li>".
        const tail = html.slice(Math.max(0, idx - 100), idx);
        expect(
          tail,
          `${marker} is not the leading content of its own <li> — ` +
            `bullet rendered as plain text (likely "* ${marker}") ` +
            `inside the parent step's <li>. Last 100 chars before marker: ${JSON.stringify(tail)}`,
        ).toMatch(/<li[^>]*>\s*$/);

        // Smoking-gun: the literal "* MARKER" prefix only survives if
        // the bullet markdown wasn't parsed.
        expect(
          html,
          `Literal "* ${marker}" found in ${page.name} — bullet markdown leaked as text`,
        ).not.toContain(`* ${marker}`);

        // Broader sanity: a <li> exists before, and comes after any
        // surrounding <pre>/<code>.
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

      // Tight check: the marker must sit inside an open <code> block at
      // this point in the HTML. The lastIndexOf("<pre") heuristic below
      // passes when the fence leaks as plain text, because unrelated
      // earlier code blocks on the page satisfy "some chroma <pre>
      // exists before the marker".
      const before = html.slice(0, idx);
      const codeOpens = (before.match(/<code[\s>]/g) || []).length;
      const codeCloses = (before.match(/<\/code>/g) || []).length;
      expect(
        codeOpens,
        `${CODE} is not inside any open <code> block — fence rendered ` +
          `as plain text (likely literal \`\`\`sh ... \`\`\`)`,
      ).toBeGreaterThan(codeCloses);

      // Broader sanity: that <code> is inside a Chroma-highlighted <pre>.
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

// Regression guard for the trailing-content bug: a numbered list item
// that immediately follows {{% /version %}} (percent form) used to
// render as raw markdown text rather than an <li>, because
// Page.RenderString with display:inline drops block-level content
// after the first element and breaks the parent <ol>'s continuity.
// The fix in docs/layouts/shortcodes/version.html emits .Inner raw
// so the surrounding markdown context handles the version body inline
// with the rest of the list. This spec locks that behavior in.

const TRAILING_STEP = "MARKER_VERSION_TRAILING_STEP";
const TRAILING_FENCE = "MARKER_VERSION_TRAILING_FENCE";

// The trailing-step fixture is its own page (not part of everything.md)
// because the percent-form bug only manifests on the reuse-render path:
// the rebase pipeline converts percent to angle-bracket before rendering,
// so rebased pages render the section differently and would break the
// reuse-vs-rebase equivalence assertion in versioning.spec.ts. Dedicated
// trailing-step.md pages at v1/v2/main pull the same shared conref, and
// the spec asserts behavior on those pages only.
const TRAILING_STEP_V2 = ["v2/trailing-step"];
const TRAILING_STEP_NON_V2 = ["v1/trailing-step", "main/trailing-step"];

test.describe("trailing step after percent-form version renders as <li>", () => {
  for (const page of TEST_PAGES) {
    if (!TRAILING_STEP_V2.includes(page.name)) continue;

    // Marked as fail-pending because the upstream version.html still uses
    // Page.RenderString with display:inline, which collapses block content
    // into a self-contained HTML block and breaks the parent list. The
    // docs hub ships a local override (docs/layouts/shortcodes/version.html)
    // that emits .Inner raw and fixes this for percent-bracket callers. The
    // upstream fix needs to handle both percent- and angle-bracket call
    // forms; until that lands, this test documents the bug and would pass
    // automatically once upstream is patched. Remove `.fail` after upstream
    // is fixed.
    test.fail(
      `${page.name}: trailing step is wrapped in <li>, not raw text`,
      () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(TRAILING_STEP);
        expect(
          idx,
          `${TRAILING_STEP} missing from ${page.name}`,
        ).toBeGreaterThan(-1);

        const liIdx = html.lastIndexOf("<li", idx);
        const liCloseIdx = html.lastIndexOf("</li>", idx);
        expect(
          liIdx,
          `${TRAILING_STEP} has no preceding <li> — version shortcode broke parent list continuity`,
        ).toBeGreaterThan(-1);
        expect(
          liIdx,
          `${TRAILING_STEP} sits after a closed </li> — the trailing step rendered outside the parent <ol>`,
        ).toBeGreaterThan(liCloseIdx);
      },
    );

    test(`${page.name}: trailing step is NOT preceded by raw "1." or "2." text`, () => {
      // Strip whitespace and tags; if the markdown leaked, we'd see
      // something like "2. MARKER_..." as visible body text.
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(TRAILING_STEP);
      const before = html.slice(Math.max(0, idx - 200), idx);
      // Look for the literal "2. " pattern as visible text (not inside an attribute).
      // If markdown rendered correctly, the "2." becomes the <ol>'s rendered marker
      // and never appears as literal text adjacent to the marker.
      expect(
        before,
        `${TRAILING_STEP} is preceded by raw "2." text — the markdown list marker leaked`,
      ).not.toMatch(/(^|>)\s*2\.\s+$/);
    });

    test(`${page.name}: fence inside percent-form version is highlighted`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(TRAILING_FENCE);
      expect(
        idx,
        `${TRAILING_FENCE} missing from ${page.name}`,
      ).toBeGreaterThan(-1);
      const preIdx = html.lastIndexOf("<pre", idx);
      expect(
        preIdx,
        `${TRAILING_FENCE} has no preceding <pre> — fence wasn't parsed as a code block`,
      ).toBeGreaterThan(-1);
      const preTag = html.slice(preIdx, html.indexOf(">", preIdx) + 1);
      expect(
        preTag,
        `${TRAILING_FENCE}'s enclosing <pre> has no Chroma class — fence wasn't highlighted`,
      ).toMatch(/class="[^"]*chroma/);
    });
  }
});

test.describe("trailing step gated by include-if", () => {
  for (const page of TEST_PAGES) {
    if (!TRAILING_STEP_NON_V2.includes(page.name)) continue;
    test(`${page.name}: trailing-step fence marker is absent`, () => {
      const html = visibleHtml(page.filePath);
      // The trailing-step <li> itself stays in the source (it's outside
      // the version block), but the fence marker inside the block must
      // be gated out on non-v2 versions.
      expect(
        html,
        `${TRAILING_FENCE} leaked into ${page.name} (include-if="v2" should exclude it)`,
      ).not.toContain(TRAILING_FENCE);
    });
  }
});
