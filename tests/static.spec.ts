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

// Regression guard for solo-io/docs#2389: the module's pager partial overrides
// hextra's default to include section index pages (`_index.md`) as navigable
// siblings. If anyone reverts to hextra's default, section landings silently
// stop rendering prev/next links.
test.describe("section-index pager (PR 2389 regression guard)", () => {
  const sectionRel = path.join(
    target.baseURL.replace(/^\/+|\/+$/g, "") || "",
    "v2",
    "index.html",
  );
  const sectionIndex = path.join(target.builtRoot, sectionRel);

  test.skip(
    !fs.existsSync(sectionIndex),
    "section index /v2/ not present in builtRoot (fixture-only check)",
  );

  test("v2 section landing renders a pager linking to a sibling section", () => {
    const html = readFixture(sectionIndex);
    // The pager wrapper has a unique Tailwind class signature emitted by
    // layouts/partials/components/pager.html. If the partial is dropped or
    // hextra's default takes over (which skips _index pages), this match
    // fails and the section landing silently loses navigation.
    const pagerRe =
      /<div class="hx:mb-8 hx:flex hx:items-center hx:border-t[^"]*"[^>]*>([\s\S]*?)<\/div>/;
    const pagerMatch = html.match(pagerRe);
    expect(pagerMatch, "no pager rendered on /v2/").not.toBeNull();
    const inner = pagerMatch![1];
    const hrefs = [...inner.matchAll(/<a[^>]+href="([^"]+)"/g)].map((m) => m[1]);
    expect(hrefs.length, "pager has no <a> children").toBeGreaterThan(0);
    // Every pager href on /v2/ should point at a sibling section landing
    // (v1, main, etc.) — never at a non-existent path. Strip baseURL and
    // expect it to match one of the configured sibling versions.
    const baseAbs = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
    const siblingVersions = target.versions.filter((v) => v !== "v2");
    for (const href of hrefs) {
      const rel = href.replace(baseAbs, "").replace(/\/$/, "").replace(/^\/+/, "");
      expect(
        siblingVersions,
        `pager href ${href} should point at a sibling section`,
      ).toContain(rel);
    }
  });
});

// Regression guard for solo-io/docs#2416: numbered-list counter integrity.
// The bug was triggered by a `{{% version %}}` shortcode wrapping a sub-list
// item, which broke CSS counter increments and produced gaps in step numbers.
// We don't reproduce the exact pattern here, but the simpler check — that
// the fixture's 3-level ordered list renders with the expected <ol>/<li>
// structure — catches any regression that mangles list nesting.
test.describe("ordered-list structure (PR 2416 regression guard)", () => {
  const everythingV2 = path.join(TEST_PRODUCT_ROOT, "v2", "everything", "index.html");
  test.skip(
    !fs.existsSync(everythingV2),
    "v2/everything not present in builtRoot (fixture-only check)",
  );

  test("3-level ordered list preserves nesting: outer 2 items, each with nested <ol>", () => {
    const html = readFixture(everythingV2);
    // Locate the "Ordered (3 levels)" section heading, then capture the
    // first <ol> that follows it. This is the fixture's canonical
    // three-level list from everything.md ("Ordered (3 levels)" subsection).
    const headingIdx = html.indexOf('id="ordered-3-levels"');
    expect(headingIdx, "ordered-3-levels heading not found").toBeGreaterThan(-1);
    const tail = html.slice(headingIdx);
    const olStart = tail.indexOf("<ol");
    expect(olStart, "no <ol> follows the heading").toBeGreaterThan(-1);
    // Extract the balanced top <ol> ... </ol> (with one level of nesting).
    // Hugo emits this as well-formed HTML so a simple depth counter works.
    let depth = 0;
    let i = olStart;
    let endIdx = -1;
    while (i < tail.length) {
      if (tail.startsWith("<ol", i)) {
        depth++;
        i += 3;
      } else if (tail.startsWith("</ol>", i)) {
        depth--;
        if (depth === 0) {
          endIdx = i + 5;
          break;
        }
        i += 5;
      } else {
        i++;
      }
    }
    expect(endIdx, "unbalanced <ol> tags").toBeGreaterThan(-1);
    const outerOl = tail.slice(olStart, endIdx);
    // Count direct-child <li> elements at the outer level. A naive count
    // would include nested <li>; instead, count <li> *after* slicing out
    // any nested <ol>...</ol> blocks first.
    const outerWithoutNested = stripNested(outerOl, "<ol", "</ol>");
    const outerLiCount = (outerWithoutNested.match(/<li\b/g) ?? []).length;
    expect(
      outerLiCount,
      "top-level ordered list should have exactly 2 items",
    ).toBe(2);
    // The list MUST contain at least one nested <ol> (the bug pattern is
    // that nesting collapses). Two <ol> total: outer + one nested.
    const nestedOlCount = (outerOl.match(/<ol\b/g) ?? []).length;
    expect(
      nestedOlCount,
      "list lost its nesting — expected outer + at least one nested <ol>",
    ).toBeGreaterThan(1);
  });
});

// Helper: remove every balanced `<openTag...</closeTag>` block from a string.
// Used to count direct children at a given nesting depth.
function stripNested(s: string, openTag: string, closeTag: string): string {
  let out = "";
  let i = 0;
  // Skip the very first opening tag (we want to keep it as the outer wrapper).
  const first = s.indexOf(openTag);
  if (first < 0) return s;
  out += s.slice(0, first + openTag.length);
  i = first + openTag.length;
  while (i < s.length) {
    const nextOpen = s.indexOf(openTag, i);
    const nextClose = s.indexOf(closeTag, i);
    if (nextOpen < 0 || nextClose < 0 || nextClose < nextOpen) {
      out += s.slice(i);
      break;
    }
    // Found a nested open before the next close — skip everything between
    // the nested open and its matching close.
    out += s.slice(i, nextOpen);
    let depth = 1;
    let j = nextOpen + openTag.length;
    while (j < s.length && depth > 0) {
      if (s.startsWith(openTag, j)) {
        depth++;
        j += openTag.length;
      } else if (s.startsWith(closeTag, j)) {
        depth--;
        j += closeTag.length;
      } else {
        j++;
      }
    }
    i = j;
  }
  return out;
}

// Regression guard for solo-io/docs#2414: title badges. The fixture sets
// every badge flag (enterprise/alpha/beta/oss/experimental) on v2/everything.md
// so a single page exercises all five variants. v1/everything.md has none
// of them, covering the negative case.
test.describe("title badges (PR 2414 regression guard)", () => {
  const v2Everything = path.join(
    TEST_PRODUCT_ROOT,
    "v2",
    "everything",
    "index.html",
  );
  const v1Everything = path.join(
    TEST_PRODUCT_ROOT,
    "v1",
    "everything",
    "index.html",
  );

  test.skip(
    !fs.existsSync(v2Everything),
    "v2/everything not present in builtRoot (fixture-only check)",
  );

  test("v2/everything renders .page-badges with all five badge variants", () => {
    const html = readFixture(v2Everything);
    // Pull out the .page-badges block. The module's docs/single.html only
    // emits this wrapper when at least one flag is truthy.
    const badgesMatch = html.match(
      /<div class="page-badges">([\s\S]*?)<\/div>/,
    );
    expect(
      badgesMatch,
      ".page-badges container missing — badge front-matter not honored",
    ).not.toBeNull();
    const inner = badgesMatch![1];
    // Each badge is a <span class="section-card-badge ...">LABEL</span>.
    // Assert every label appears.
    const expectedLabels = ["Enterprise", "Alpha", "Beta", "Open Source", "Experimental"];
    for (const label of expectedLabels) {
      expect(
        inner,
        `badge "${label}" should render when its front-matter flag is true`,
      ).toContain(label);
    }
    // Variant classes: the alpha/beta/experimental badges should carry
    // badge-tag, the oss badge carries badge-oss. Catches silent CSS-class
    // regressions that would render the right text in the wrong color.
    expect(inner, ".badge-tag should apply to alpha/beta/experimental").toMatch(
      /section-card-badge badge-tag/,
    );
    expect(inner, ".badge-oss should apply to the Open Source badge").toMatch(
      /section-card-badge badge-oss/,
    );
  });

  test("v1/everything (no badge flags) does NOT render .page-badges", () => {
    if (!fs.existsSync(v1Everything)) {
      test.skip(true, "v1/everything not present in builtRoot");
    }
    const html = readFixture(v1Everything);
    expect(
      html,
      "page-badges container leaked onto a page with no badge front-matter",
    ).not.toContain('class="page-badges"');
  });
});
