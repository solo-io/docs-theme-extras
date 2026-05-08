import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PAGES, TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { SHORTCODE_MARKERS, CONDITIONAL_MARKERS } from "./helpers/sentinels";
import { target } from "./helpers/target";

// Normalize the configured baseURL to a leading-slash, no-trailing-slash
// form for use in href-resolution checks below.
const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");

function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Strip out elements that legitimately contain raw markdown-looking text
// (the Copy-as-Markdown <script> tag, code/pre blocks, <style> blocks with
// `#id` selectors, and inline <svg> elements with text/path data that can
// trigger false positives on the markdown-leak regexes below). We assert
// against what's actually rendered as prose, not the embedded markdown
// source or styling.
function visibleHtml(html: string): string {
  return html
    .replace(/<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi, "")
    .replace(/<pre[\s\S]*?<\/pre>/gi, "")
    .replace(/<code[\s\S]*?<\/code>/gi, "")
    .replace(/<style[\s\S]*?<\/style>/gi, "")
    .replace(/<svg[\s\S]*?<\/svg>/gi, "");
}

test.describe("fixture build artifacts exist", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} renders to disk`, () => {
      expect(fs.existsSync(page.filePath), `${page.filePath} should exist`).toBe(true);
      const html = readFixture(page.filePath);
      expect(html).toContain("<html");
      if (page.name === "landing") {
        // The product landing is a Hugo-generated redirect stub to the
        // default version. It should contain a refresh meta and a link
        // pointing into a versioned subtree under BASE_URL.
        expect(html).toMatch(/http-equiv=["']refresh["']/i);
        const versionLinkRe = new RegExp(
          `${escapeRegex(BASE_URL)}/(${target.versions.join("|") || "[^/]+"})/`,
        );
        expect(html, "landing should link into a versioned subtree").toMatch(versionLinkRe);
      } else {
        expect(html.length).toBeGreaterThan(500);
      }
    });
  }
});

test.describe("no shortcode leaks", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} contains no unresolved shortcode delimiters`, () => {
      const html = readFixture(page.filePath);
      const visible = visibleHtml(html);
      // Catches {{<, {{%, {{ <, {{ % patterns that escaped rendering.
      expect(visible, "shortcode opening delimiter found").not.toMatch(/\{\{\s*[%<]/);
      expect(visible, "shortcode closing delimiter found").not.toMatch(/[%>]\s*\}\}/);
    });
  }
});

test.describe("no raw markdown links rendered as text", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} has no [text](url) leaking into prose`, () => {
      const html = readFixture(page.filePath);
      const visible = visibleHtml(html);
      // A markdown-link pattern in visible HTML means goldmark didn't convert
      // it to <a>. Covers both relative paths (./, ../) and absolute URLs
      // (http(s)://) — earlier the test only caught relative, which let
      // shortcodes like {{< github >}} leak whole markdown documents full of
      // absolute-URL links into the page as raw text.
      expect(visible, "raw markdown link pattern in rendered output").not.toMatch(
        /\][\s]*\((?:\.\.?\/[^)]+|https?:\/\/[^)]+)\)/,
      );
    });
  }
});

test.describe("no raw markdown headings rendered as text", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} has no leaked '# Heading' lines in prose`, () => {
      const html = readFixture(page.filePath);
      const visible = visibleHtml(html);
      // Lines that start with 1–6 `#` then a space then non-space, anchored
      // to the start of a line. Headings should always render as <h1>–<h6>;
      // a leaked literal `# Foo` line means a shortcode dumped raw markdown
      // without running it through the goldmark renderer.
      const match = visible.match(/^#{1,6}[ \t]+\S[^\n]*/m);
      expect(
        match,
        match
          ? `Found leaked markdown heading: ${JSON.stringify(match[0])}`
          : "no leaked heading",
      ).toBeNull();
    });
  }
});

test.describe("no raw markdown table rows rendered as text", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} has no leaked '| col | col |' rows in prose`, () => {
      const html = readFixture(page.filePath);
      const visible = visibleHtml(html);
      // The most distinctive table-leak signal is the alignment row
      // (`| --- | --- |` or `|:---|---:|`) — almost nothing legitimate
      // produces that pattern. We also catch generic header/data rows
      // that have at least two pipes and content between them.
      const separatorMatch = visible.match(
        /^[ \t]*\|[ \t]*:?-{2,}:?[ \t]*(?:\|[ \t]*:?-{2,}:?[ \t]*)+\|?[ \t]*$/m,
      );
      expect(
        separatorMatch,
        separatorMatch
          ? `Found leaked markdown table separator row: ${JSON.stringify(separatorMatch[0])}`
          : "no leaked table separator row",
      ).toBeNull();

      const dataRowMatch = visible.match(
        /^[ \t]*\|[^|\n]+\|[^|\n]+\|[^\n]*$/m,
      );
      expect(
        dataRowMatch,
        dataRowMatch
          ? `Found leaked markdown table row: ${JSON.stringify(dataRowMatch[0])}`
          : "no leaked table row",
      ).toBeNull();
    });
  }
});

test.describe("images have non-empty alt text", () => {
  for (const page of TEST_PAGES) {
    test(`${page.name} <img> tags all have alt`, () => {
      const html = readFixture(page.filePath);
      // Find all <img ...> tags and assert each has a non-empty alt attribute.
      // Mermaid renders <text> nodes inside <svg>, not <img>, so this is safe.
      const imgs = html.match(/<img\b[^>]*>/gi) ?? [];
      for (const img of imgs) {
        const altMatch = img.match(/\balt="([^"]*)"/i);
        expect(altMatch, `img missing alt: ${img}`).not.toBeNull();
        expect(altMatch![1].trim().length, `img alt is empty: ${img}`).toBeGreaterThan(0);
      }
    });
  }
});

test.describe("copy-as-markdown source is present and parseable", () => {
  for (const page of TEST_PAGES) {
    if (page.name === "landing") continue; // landing intentionally has minimal body
    test(`${page.name} embeds copy-as-md script tag`, () => {
      const html = readFixture(page.filePath);
      const match = html.match(
        /<script[^>]*type=["']text\/markdown["'][^>]*>([\s\S]*?)<\/script>/i,
      );
      expect(match, "<script type=text/markdown> not found").not.toBeNull();
      const md = match![1].trim();
      expect(md.length, "copy-as-md content empty").toBeGreaterThan(50);
      // Should contain at least one absolute URL, not just relative paths.
      expect(md, "copy-as-md should canonicalize to absolute URLs").toMatch(
        /https?:\/\//,
      );
    });
  }
});

test.describe("code blocks render with language classes and chroma highlighting", () => {
  for (const page of TEST_PAGES) {
    if (page.name === "landing") continue;
    test(`${page.name} has chroma-highlighted code with language-* classes`, () => {
      const html = readFixture(page.filePath);
      // Chroma adds class="chroma" to the wrapping <pre>, and the inner <code>
      // gets class="language-<lang>".
      expect(html, "chroma <pre> not found").toMatch(/<pre[^>]*class="[^"]*chroma/);
      expect(html, "no language-* code class found").toMatch(
        /<code[^>]*class="language-[a-z]+/,
      );
    });
  }
});

test.describe(`internal ${BASE_URL}/ hrefs resolve to files on disk`, () => {
  // Match href values starting with the configured baseURL prefix.
  const hrefRegex = new RegExp(`href="(${escapeRegex(BASE_URL)}/[^"#?]*)"`, "g");
  for (const page of TEST_PAGES) {
    test(`${page.name} internal links point to existing pages`, () => {
      const html = readFixture(page.filePath);
      const hrefs = Array.from(html.matchAll(hrefRegex)).map((m) => m[1]);
      const broken: string[] = [];
      for (const href of hrefs) {
        // Strip the baseURL prefix to compute the on-disk path under productRoot.
        const rel = href.replace(new RegExp(`^${escapeRegex(BASE_URL)}/`), "").replace(/\/$/, "");
        const candidates = rel === ""
          ? [path.join(TEST_PRODUCT_ROOT, "index.html")]
          : [
              path.join(TEST_PRODUCT_ROOT, rel, "index.html"),
              path.join(TEST_PRODUCT_ROOT, rel),
              path.join(TEST_PRODUCT_ROOT, `${rel}.html`),
            ];
        if (!candidates.some((c) => fs.existsSync(c))) {
          broken.push(href);
        }
      }
      expect(broken, `broken internal hrefs in ${page.name}`).toEqual([]);
    });
  }
});

test.describe("all shortcode markers present on rendered topic pages", () => {
  // Every MARKER_* in SHORTCODE_MARKERS must appear at least once on each
  // topic page (everything + rebased + per-version copies). This is the
  // canary for "did all shortcodes render at all".
  const topicPages = TEST_PAGES.filter((p) => p.name !== "landing");
  for (const page of topicPages) {
    for (const marker of SHORTCODE_MARKERS) {
      test(`${page.name} contains ${marker}`, () => {
        const html = readFixture(page.filePath);
        expect(html, `${marker} missing from ${page.name}`).toContain(marker);
      });
    }
  }
});

test.describe("conditional-text excludes content correctly", () => {
  for (const page of TEST_PAGES) {
    if (page.name === "landing") continue;
    test(`${page.name} excludes COND_NOT_TEST sentinel`, () => {
      const html = readFixture(page.filePath);
      expect(html).not.toContain(CONDITIONAL_MARKERS.notTest);
    });
    test(`${page.name} includes COND_TEST_ONLY and bullets`, () => {
      const html = readFixture(page.filePath);
      expect(html).toContain(CONDITIONAL_MARKERS.testOnly);
      expect(html).toContain(CONDITIONAL_MARKERS.bullet1);
      expect(html).toContain(CONDITIONAL_MARKERS.bullet2);
      expect(html).toContain(CONDITIONAL_MARKERS.bullet3);
      expect(html).toContain(CONDITIONAL_MARKERS.codeInside);
    });
    test(`${page.name} renders COND_BULLET_* as a list, not paragraphs`, () => {
      const html = readFixture(page.filePath);
      // The fragment containing the bullets must include <ul> ... <li>COND_BULLET_1
      // before the next </ul>. This guards against the Hugo bug where blank
      // lines in {{% %}} blocks wrap each bullet in its own <p>.
      const idx1 = html.indexOf(CONDITIONAL_MARKERS.bullet1);
      const ulOpen = html.lastIndexOf("<ul", idx1);
      const ulClose = html.indexOf("</ul>", idx1);
      expect(ulOpen, "no <ul> precedes bullet 1").toBeGreaterThan(-1);
      expect(ulClose, "no </ul> follows bullet 1").toBeGreaterThan(idx1);
      // No stray <p> wrapping just a bullet's text.
      const bulletParagraph = new RegExp(
        `<p>\\s*${CONDITIONAL_MARKERS.bullet1}`,
      );
      expect(html, "bullet 1 wrapped in <p> instead of <li>").not.toMatch(
        bulletParagraph,
      );
    });
    test(`${page.name} renders COND_CODE_INSIDE_CONDITIONAL inside <pre>`, () => {
      const html = readFixture(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.codeInside);
      const preOpen = html.lastIndexOf("<pre", idx);
      const preClose = html.indexOf("</pre>", idx);
      expect(preOpen, "code marker not preceded by <pre>").toBeGreaterThan(-1);
      expect(preClose, "code marker not followed by </pre>").toBeGreaterThan(idx);
    });
  }
});
