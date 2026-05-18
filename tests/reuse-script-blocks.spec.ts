import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guards for the preview-deploy failures on 2026-05-18 (PR
// solo-io/docs#2537). The reuse template flattens its rendered output
// (`\n` → `&#10;`) to keep multi-block snippets on a single logical line
// so a parent numbered list isn't broken. <script>/<style> blocks need
// different handling:
//
//   1. Script/style bodies are RAW — browsers don't decode HTML entities
//      inside them. An injected `&#10;` becomes literal text inside the
//      JS/CSS source, and Hugo's --minify pipeline parses the body and
//      rejects it with "unexpected & in expression". This broke the
//      gateway and gloo-mesh-gateway preview deploys: openapi.html and
//      render.html both emit inline <script> bodies (Swagger UI init,
//      jQuery loader for the changelog), and the flatten injected
//      entities into those bodies.
//
//   2. CommonMark HTML Block Type 1 only recognizes <script>/<style>
//      when the tag starts a line. After flatten, every <script> in the
//      output lands mid-line, so Goldmark tries to parse the body as
//      markdown — smart-quoting attribute values, auto-linking URLs,
//      wrapping continuation lines in <p>. The changelog page hit this:
//      the multi-line `<script src="..." integrity="..." crossorigin>`
//      tag in render.html rendered as `<p>src=&ldquo;<a href="...">`.
//
// The reuse template extracts <script>/<style> blocks with placeholders,
// flattens the rest, then restores each block surrounded by real
// newlines. This spec locks both halves in.

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

test.describe("reuse preserves <script> block content (no &#10; injection)", () => {
  for (const page of TEST_PAGES) {
    if (!FIXTURE_PAGES.includes(page.name)) continue;

    test(`${page.name}: multi-line <script> body retains real newlines, no &#10; entities`, () => {
      const html = visibleHtml(page.filePath);
      // The fixture's script-snippet.md has a <script> body containing
      // `MARKER_SCRIPTREUSE_LISTENER` — a multi-line addEventListener
      // body that mimics openapi.html / render.html output shape.
      const idx = html.indexOf("MARKER_SCRIPTREUSE_LISTENER");
      expect(idx, "MARKER_SCRIPTREUSE_LISTENER missing").toBeGreaterThan(-1);

      // The marker must sit inside a <script> body (the lastIndexOf of
      // an opening <script that's still unclosed at idx).
      const before = html.slice(0, idx);
      const scriptOpens = (before.match(/<script[\s>][^<]*$/m) || []).length;
      const scriptOpensCount = (before.match(/<script[\s>]/g) || []).length;
      const scriptClosesCount = (before.match(/<\/script>/g) || []).length;
      expect(
        scriptOpensCount,
        `MARKER_SCRIPTREUSE_LISTENER not inside an open <script> — flatten ` +
          `moved the script tag out of place or broke it`,
      ).toBeGreaterThan(scriptClosesCount);

      // Extract the script body containing the listener marker. Walk
      // back to the nearest <script>...> opener and forward to </script>.
      const scriptOpen = html.lastIndexOf("<script", idx);
      const scriptOpenEnd = html.indexOf(">", scriptOpen) + 1;
      const scriptClose = html.indexOf("</script>", idx);
      const body = html.slice(scriptOpenEnd, scriptClose);

      expect(
        body,
        "<script> body contains '&#10;' entity — reuse flatten leaked the " +
          "entity into raw script content; Hugo --minify will reject this " +
          "with 'unexpected & in expression'",
      ).not.toContain("&#10;");

      // Sanity: the multi-line body still has real newlines (otherwise the
      // protect-and-restore lost the original structure).
      expect(
        body,
        "<script> body collapsed onto a single line — protect-and-restore " +
          "lost the original newlines",
      ).toContain("\n");
    });

    test(`${page.name}: multi-line <script> attributes are not smart-quoted or auto-linked`, () => {
      const html = visibleHtml(page.filePath);
      // The fixture's script-snippet.md has a multi-line external script
      // (mimicking the changelog's jQuery loader):
      //   <script
      //     src="https://example.com/MARKER_SCRIPTREUSE_MULTILINE.js"
      //     integrity="..."
      //     crossorigin="anonymous"></script>
      //
      // When Goldmark fails to recognize this as a Type-1 HTML block, it
      // parses the continuation lines as paragraph text: `src="..."` gets
      // smart-quoted to `src=&ldquo;...&rdquo;` and the URL gets wrapped
      // in `<a href="...">`. The script tag stays as a paragraph-text
      // fragment instead of a real <script>.
      const idx = html.indexOf("MARKER_SCRIPTREUSE_MULTILINE.js");
      expect(idx, "MARKER_SCRIPTREUSE_MULTILINE marker missing").toBeGreaterThan(-1);

      // The marker must sit inside a <script ...src="..."> attribute, not
      // inside an <a href="..."> auto-link.
      const tagOpen = html.lastIndexOf("<", idx);
      const tagName = html.slice(tagOpen, tagOpen + 8);
      expect(
        tagName,
        `MARKER_SCRIPTREUSE_MULTILINE.js is inside ${JSON.stringify(tagName)} ` +
          `— Goldmark parsed the multi-line <script> attributes as markdown ` +
          `paragraph text and auto-linked the URL. The reuse template's ` +
          `<script> protection needs to surround the block with real newlines.`,
      ).toMatch(/^<script/);

      // Surrounding text should not contain `src=&ldquo;` — the smart-quote
      // signature that appears when Goldmark renders `src="..."` as prose.
      // Strip the copy-as-md script first (handled by visibleHtml), then
      // scan a window around the marker.
      const window = html.slice(Math.max(0, idx - 200), idx + 200);
      expect(
        window,
        `'src=&ldquo;' found near MARKER_SCRIPTREUSE_MULTILINE — multi-line ` +
          `<script> opener was parsed as markdown prose, smart-quoting its ` +
          `attribute values`,
      ).not.toContain("src=&ldquo;");
    });
  }
});

test.describe("reuse preserves <script> blocks even when content is single-line", () => {
  for (const page of TEST_PAGES) {
    if (!FIXTURE_PAGES.includes(page.name)) continue;

    test(`${page.name}: single-line <script> body is unchanged by flatten`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf("MARKER_SCRIPTREUSE_SINGLELINE");
      expect(idx, "MARKER_SCRIPTREUSE_SINGLELINE missing").toBeGreaterThan(-1);

      // Sitting inside a real <script> opener (not auto-linked or
      // wrapped in a <p>).
      const scriptOpen = html.lastIndexOf("<script", idx);
      const scriptOpenEnd = html.indexOf(">", scriptOpen) + 1;
      expect(scriptOpen, "no preceding <script> tag").toBeGreaterThan(-1);
      expect(scriptOpenEnd, "preceding <script> tag has no closing >").toBeGreaterThan(scriptOpen);
      expect(
        idx,
        "single-line script marker is not inside the <script>...</script> body",
      ).toBeGreaterThan(scriptOpenEnd);
      const scriptClose = html.indexOf("</script>", idx);
      expect(scriptClose, "no closing </script> after marker").toBeGreaterThan(idx);
    });
  }
});
