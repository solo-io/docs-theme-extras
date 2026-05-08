import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Behavior tests for the `github` shortcode at
// layouts/shortcodes/github.html. The shortcode auto-detects file extension:
// `.md` runs through the page's markdown renderer; everything else passes
// through as raw text (callers wrap in a code fence). One test per branch.

// Returns the slice of HTML between two markers — the region of the page
// that exclusively contains the embed under test. If `endMarker` is omitted,
// returns from `startMarker` to end of page.
function regionBetween(html: string, startMarker: string, endMarker?: string): string {
  const start = html.indexOf(startMarker);
  expect(start, `${startMarker} not found in page`).toBeGreaterThanOrEqual(0);
  if (!endMarker) return html.slice(start);
  const end = html.indexOf(endMarker, start + startMarker.length);
  expect(end, `${endMarker} not found after ${startMarker}`).toBeGreaterThanOrEqual(0);
  return html.slice(start, end);
}

const RENDERED_PAGES = TEST_PAGES.filter((p) => p.name.endsWith("/everything"));

test.describe("github shortcode: markdown URL renders as HTML", () => {
  for (const page of RENDERED_PAGES) {
    test(`${page.name} renders fetched .md as table and links`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB.", "MARKER_GITHUB_YAML");

      // The fetched osa_provided.md is a license-attribution table with
      // GitHub links. Heading-free by design (chosen for that reason — it
      // doesn't pollute the everything-page TOC), so we don't assert on
      // <h*> here.
      expect(
        region,
        "no <table> in github embed region; markdown table probably leaked as raw '|...|' text",
      ).toMatch(/<table[\s>]/i);

      // The file's left-column cells link to github.com — expect that as
      // <a href>, not as literal `[text](https://...)`.
      expect(
        region,
        "fetched markdown links did not render as <a> tags",
      ).toMatch(/<a\s+[^>]*href=["']https:\/\/github\.com\//i);

      // The right-column cells include "MIT License" (and others) — spot
      // check that the cell text actually rendered.
      expect(region, "expected 'MIT License' text in rendered table").toMatch(
        /MIT License/,
      );
    });
  }
});

test.describe("github shortcode: YAML URL inside fence renders as code block", () => {
  for (const page of RENDERED_PAGES) {
    test(`${page.name} renders fetched .yaml inside a <pre><code> block`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB_YAML.", "MARKER_GITHUB_TEXT");

      // The yaml fence in the source produces <pre>...<code class="language-yaml">.
      // Hextra/Chroma may emit either `class="language-yaml"` or
      // `data-lang="yaml"`; accept either.
      expect(
        region,
        "no yaml code block in github yaml embed region",
      ).toMatch(/<pre[\s\S]*?<code[^>]*(?:language-yaml|data-lang=["']yaml)[\s\S]*?<\/code>[\s\S]*?<\/pre>/i);

      // The fetched config.yaml contains `binds:` and `port: 3000`.
      // Spot-check both — if the fetch silently failed or the content
      // changed structure, this catches it.
      expect(region, "expected 'binds:' in fetched yaml").toMatch(/\bbinds:/);
      expect(region, "expected 'port: 3000' in fetched yaml").toMatch(/port:\s*3000/);
    });
  }
});

test.describe("github shortcode: plain text URL inside fence renders as code block", () => {
  for (const page of RENDERED_PAGES) {
    test(`${page.name} renders fetched LICENSE inside a <pre><code> block`, () => {
      const html = readFixture(page.filePath);
      // No following marker — the LICENSE embed is the last fixture in the
      // GitHub embed section. Use the next H2 heading as the upper bound.
      const region = regionBetween(html, "MARKER_GITHUB_TEXT.", "<h2");

      expect(region, "no <pre><code> block in github text embed region").toMatch(
        /<pre[\s\S]*?<code[\s\S]*?<\/code>[\s\S]*?<\/pre>/i,
      );

      // The Apache 2.0 LICENSE has the distinctive header `Apache License`.
      // Match either a direct text node or HTML-entity-encoded equivalent.
      expect(region, "expected 'Apache License' in fetched text").toMatch(
        /Apache License/i,
      );
    });
  }
});
