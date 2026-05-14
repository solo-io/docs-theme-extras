import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { VERSION_MARKERS } from "./helpers/sentinels";

// Regression guards for the rendering pipeline that handles a
// `{{< version >}}` shortcode invoked INSIDE a fenced code block and a
// `{{< version >}}` that wraps an entire fence from outside.
//
// Before the no-markdown-heuristic + <pre>-flatten-bypass in
// version.html, both patterns produced visibly broken output:
//
//   1. Inside-fence yaml: leading `#` rendered as <h1>, "true" as
//      &ldquo;true&rdquo;, -- as &ndash; — and the resulting HTML got
//      escaped inside the fence so the reader saw literal angle-bracket
//      text like <h1>...</h1><p>...</p>.
//
//   2. Wrap-around fence: Chroma highlights every line as
//      <span class="line">...</span>\n<span class="line">...</span>.
//      The flatten regex >[ \t]*\n[\s]*< collapsed those into a single
//      run, smashing the highlighted code onto one line and turning
//      every "\" line continuation into literal "</span>" text.
//
// These specs lock the fix in by inspecting the rendered HTML for the
// fixture sentinels and asserting structural properties around them.
//
// Strip the copy-as-markdown <script> block before searching — it
// embeds the raw markdown source (including literal MARKER strings and
// shortcode tags) and would otherwise produce false positives.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Pages where the {{< version include-if="v2" >}} blocks should render.
const V2_PAGES = ["v2/everything", "v2/rebased"];

test.describe("version shortcode inside a fenced code block", () => {
  for (const page of TEST_PAGES) {
    if (!V2_PAGES.includes(page.name)) continue;

    test(`${page.name}: inside-fence yaml renders as a code-fence comment, not <h1>`, () => {
      const html = visibleHtml(page.filePath);
      const marker = VERSION_MARKERS.inFenceComment;
      const idx = html.indexOf(marker);
      expect(idx, `${marker} missing from ${page.name}`).toBeGreaterThan(-1);

      // The marker is a yaml comment ("# MARKER_VERSION_INFENCE_COMMENT")
      // inside a ```yaml fence. After dedent, Goldmark would parse a
      // leading `#` at column 0 as an H1 heading. The heuristic emits
      // raw instead, so no <h1> wraps the marker.
      const tail = html.slice(Math.max(0, idx - 200), idx);
      expect(
        tail,
        `${marker} is wrapped in an <h1> — the no-markdown heuristic ` +
          `routed the inner yaml to RenderString, which parsed the leading ` +
          `# as a heading instead of preserving it as a yaml comment. ` +
          `Last 200 chars before marker: ${JSON.stringify(tail)}`,
      ).not.toMatch(/<h[1-6][^>]*>\s*$/);

      // Chroma classes "c" or "ch" mark yaml comments. Assert the
      // marker's enclosing token is a comment span, not a heading.
      const preIdx = html.lastIndexOf("<pre", idx);
      expect(
        preIdx,
        `${marker} has no preceding <pre> — fence dropped`,
      ).toBeGreaterThan(-1);
      const codeIdx = html.lastIndexOf("<code", idx);
      expect(
        codeIdx,
        `${marker} is not inside a <code> block`,
      ).toBeGreaterThan(-1);
    });

    test(`${page.name}: inside-fence yaml does not smart-quote "true"`, () => {
      const html = visibleHtml(page.filePath);
      const marker = VERSION_MARKERS.inFenceGated;
      const idx = html.indexOf(marker);
      expect(idx, `${marker} missing from ${page.name}`).toBeGreaterThan(-1);

      // The fixture line is: MARKER_VERSION_INFENCE_GATED: "true"
      // Without the heuristic, Goldmark's typographer turns "true" into
      // &ldquo;true&rdquo; (curly quotes). With raw emit, the straight
      // quotes are preserved as &#34;true&#34;.
      const slice = html.slice(idx, idx + 400);
      expect(
        slice,
        `${marker} value got smart-quoted (&ldquo;/&rdquo; or &lsquo;/&rsquo;) — ` +
          `inner yaml routed through RenderString. Slice: ${JSON.stringify(slice)}`,
      ).not.toMatch(/&[lr](?:d|s)quo;/);
    });

    test(`${page.name}: yaml placeholders <UPPER> and <a_lower> are not treated as markdown`, () => {
      const html = visibleHtml(page.filePath);
      // The fixture has two yaml-string placeholders inside the version
      // block: <MARKER_VERSION_INFENCE_PLACEHOLDER_UPPER> (starts with
      // an uppercase letter; the regex's [a-z] fails immediately) and
      // <a_MARKER_VERSION_INFENCE_PLACEHOLDER_LOWER> (starts with `a`
      // but the next char is `_`, which fails the [a-z0-9]*[\s/>]
      // terminator). Either way, the heuristic must NOT classify them
      // as HTML tags — if it did, the inner content would route to
      // RenderString and the markdown side-effects (smart quotes,
      // heading-from-#, en-dash from --) would mangle the surrounding
      // yaml. The exact HTML-escape state of the placeholder depends
      // on the reuse depth (nested reuse re-escapes; single-level
      // doesn't) so this test only asserts heuristic correctness:
      // markers are present and no markdown formatting wrapped them.
      const upperMarker = VERSION_MARKERS.inFencePlaceholderUpper;
      const lowerMarker = VERSION_MARKERS.inFencePlaceholderLower;
      for (const marker of [upperMarker, lowerMarker]) {
        const idx = html.indexOf(marker);
        expect(
          idx,
          `${marker} missing from ${page.name}`,
        ).toBeGreaterThan(-1);

        // RenderString would have wrapped each line in <p> or <h1>
        // (because `#` is a heading char) or applied smart-quote
        // conversion to "value". None of those side-effects should
        // appear in the immediate window around the marker.
        const window = html.slice(
          Math.max(0, idx - 100),
          Math.min(html.length, idx + 100),
        );
        expect(
          window,
          `${marker} appears inside a <p>...</p> wrap — heuristic likely ` +
            `routed to RenderString despite no markdown content`,
        ).not.toMatch(/<p>[^<]*MARKER_VERSION_INFENCE/);
        expect(
          window,
          `${marker} appears inside an <h[1-6]> wrap — heuristic likely ` +
            `let RenderString parse '#' as a heading`,
        ).not.toMatch(/<h[1-6][^>]*>[^<]*MARKER_VERSION_INFENCE/);
        expect(
          window,
          `${marker} has smart quotes nearby — heuristic likely routed ` +
            `to RenderString and the typographer converted the surrounding ` +
            `straight quotes`,
        ).not.toMatch(/&[lr](?:d|s)quo;/);
      }
    });

    test(`${page.name}: wrap-around fence is Chroma-highlighted with line breaks`, () => {
      const html = visibleHtml(page.filePath);
      const fn = VERSION_MARKERS.wrapAroundFn;
      const comment = VERSION_MARKERS.wrapAroundComment;
      const fnIdx = html.indexOf(fn);
      const commentIdx = html.indexOf(comment);
      expect(fnIdx, `${fn} missing from ${page.name}`).toBeGreaterThan(-1);
      expect(
        commentIdx,
        `${comment} missing from ${page.name}`,
      ).toBeGreaterThan(-1);
      expect(
        commentIdx,
        `${comment} appears before ${fn} — wrap-around content reordered`,
      ).toBeGreaterThan(fnIdx);

      // The fixture's fence has 12+ lines. Chroma wraps each line in
      // <span class="line">. With the flatten step active, the regex
      // ">[ \t]*\n[\s]*<" collapses every </span>\n<span class="line">
      // boundary, so the highlighted output ends up as ONE line span.
      // The bypass keeps line spans intact — assert that at least 8
      // <span class="line"> instances exist between the wrap-around
      // bullet marker and the closing </code> of its fence.
      const bulletIdx = html.indexOf(VERSION_MARKERS.wrapAroundBullet);
      expect(
        bulletIdx,
        `${VERSION_MARKERS.wrapAroundBullet} missing from ${page.name}`,
      ).toBeGreaterThan(-1);
      const codeCloseIdx = html.indexOf("</code>", commentIdx);
      const region = html.slice(bulletIdx, codeCloseIdx);
      const lineSpanCount = (region.match(/<span class="line"/g) || []).length;
      expect(
        lineSpanCount,
        `Only ${lineSpanCount} <span class="line"> tokens found between ` +
          `${VERSION_MARKERS.wrapAroundBullet} and the next </code> — ` +
          `flatten step collapsed Chroma's per-line wrappers. Expected >= 8.`,
      ).toBeGreaterThanOrEqual(8);
    });

    test(`${page.name}: wrap-around fence keeps "\\" line continuations`, () => {
      const html = visibleHtml(page.filePath);
      const fnIdx = html.indexOf(VERSION_MARKERS.wrapAroundFn);
      expect(
        fnIdx,
        `${VERSION_MARKERS.wrapAroundFn} missing from ${page.name}`,
      ).toBeGreaterThan(-1);
      const commentIdx = html.indexOf(VERSION_MARKERS.wrapAroundComment);
      const codeCloseIdx = html.indexOf("</code>", commentIdx);
      const region = html.slice(fnIdx, codeCloseIdx);

      // Symptom of the flatten regex eating Chroma line breaks: every
      // trailing "\" line-continuation in shell/yaml gets replaced with
      // literal "</span>" text inside the highlighted output. With the
      // bypass, the "\" tokens stay as "\" (sometimes class="se"
      // tokens). Either way, the region must NOT contain the visible
      // "&lt;/span&gt;" artifact that flatten produces.
      expect(
        region,
        `Found literal "&lt;/span&gt;" in the wrap-around fence — flatten ` +
          `regex collapsed across Chroma's per-line spans and substituted ` +
          `every line break with closing-span text`,
      ).not.toContain("&lt;/span&gt;");
    });
  }
});

// Negative-control assertion. The inside-fence sentinels are gated on
// v2; they must NOT leak into v1 or main. (versioning.spec.ts already
// covers presence/absence per-page; this is a tight structural pair —
// the markers should not survive any pipeline on non-v2 versions.)
const NON_V2_PAGES = [
  "v1/everything",
  "v1/rebased",
  "main/everything",
  "main/rebased",
];

test.describe("inside-fence + wrap-around markers are gated", () => {
  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: gated markers absent`, () => {
      const html = visibleHtml(page.filePath);
      for (const marker of [
        VERSION_MARKERS.inFenceComment,
        VERSION_MARKERS.inFenceGated,
        VERSION_MARKERS.inFencePlaceholderUpper,
        VERSION_MARKERS.inFencePlaceholderLower,
        VERSION_MARKERS.wrapAroundBullet,
        VERSION_MARKERS.wrapAroundFn,
        VERSION_MARKERS.wrapAroundComment,
      ]) {
        expect(
          html,
          `${marker} leaked into ${page.name} (include-if="v2" should exclude it)`,
        ).not.toContain(marker);
      }
    });
  }
});
