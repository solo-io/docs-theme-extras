import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Agent-readiness guards (static, built HTML and markdown on disk).
//
// The afdocs scorecard (Agent-Friendly Documentation Spec) that the docs hub
// runs against every Solo docs site failed four checks that trace back to this
// module. Each describe block below pins one of the fixes, so a later layout
// edit can't quietly undo it.
//
// 1. content-start-position. afdocs converts the whole HTML page to markdown
//    and measures how far in the first real sentence starts. With the sidebar
//    and TOC ahead of <article> in the HTML, that was 50-98% of the page on
//    most sites. docs/single.html and docs/list.html now emit <article> first;
//    CSS puts the sidebar back on the left (content-first-columns.spec.ts
//    checks the rendered layout).
// 2. markdown-content-parity. afdocs compares the text in <main> with the
//    page's .md twin. The version banner, the doc-test badge, and glossary
//    tooltips are chrome the .md leaves out, so they carry
//    `data-markdown-ignore`, the attribute afdocs skips. The front matter
//    description is real content, so the .md now includes it.
// 3. llms-txt-coverage. Section landing pages were in the sitemap but in no
//    llms.txt. utils/llms-section-entry.html links each one under its heading.

function pageFiles(): { url: string; file: string }[] {
  const out: { url: string; file: string }[] = [];
  for (const p of target.pages) {
    const file = target.fileForUrl(p.url);
    if (fs.existsSync(file)) out.push({ url: p.url, file });
  }
  return out;
}

test.describe("content-first source order", () => {
  test("<article> comes before the sidebar and the TOC in the HTML", () => {
    let checked = 0;
    const wrong: string[] = [];
    for (const { url, file } of pageFiles()) {
      const html = fs.readFileSync(file, "utf8");
      const article = html.indexOf("<article");
      if (article < 0 || !html.includes('<main id="content"')) continue;
      checked++;
      // First occurrence of each chrome block. The sidebar test keys on the
      // container class, which every <aside> variant in sidebar.html carries.
      for (const [name, marker] of [
        ["sidebar", "hextra-sidebar-container"],
        ["toc", 'class="hextra-toc'],
      ] as const) {
        const at = html.indexOf(marker);
        if (at >= 0 && at < article) wrong.push(`${url}: ${name} before <article>`);
      }
    }
    test.skip(checked === 0, "no docs-layout pages in this target");
    expect(
      wrong,
      "navigation is back above the page content in the HTML; see the SOURCE ORDER note in layouts/docs/single.html",
    ).toEqual([]);
  });
});

test.describe("chrome inside <main> is marked for parity checks", () => {
  test("every version banner carries data-markdown-ignore", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { url, file } of pageFiles()) {
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(/<div class="version-banner"[^>]*>/g)) {
        seen++;
        if (!m[0].includes("data-markdown-ignore")) bad.push(url);
      }
    }
    test.skip(seen === 0, "no version banners in this target");
    expect(bad).toEqual([]);
  });

  test("every doc-test badge carries data-markdown-ignore", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { url, file } of pageFiles()) {
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(/<span class="test-status-badge[^"]*"[^>]*>/g)) {
        seen++;
        if (!m[0].includes("data-markdown-ignore")) bad.push(url);
      }
    }
    test.skip(seen === 0, "no doc-test badges in this target");
    expect(bad).toEqual([]);
  });

  test("auto-card descriptions and every badge carry data-markdown-ignore", () => {
    const bad: string[] = [];
    let seen = 0;
    for (const { url, file } of pageFiles()) {
      const html = fs.readFileSync(file, "utf8");
      for (const m of html.matchAll(
        /<(?:p class="section-card-desc"|span class="section-card-badge[^"]*")[^>]*>/g,
      )) {
        seen++;
        if (!m[0].includes("data-markdown-ignore")) bad.push(`${url}: ${m[0]}`);
      }
    }
    test.skip(seen === 0, "no auto section cards in this target");
    expect(bad).toEqual([]);
  });
});

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("markdown twin includes the description", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");

  test("the description follows the title in the .md", () => {
    const md = fs.readFileSync(path.join(TEST_PRODUCT_ROOT, "flatguide", "alpha.md"), "utf8");
    expect(md).toMatch(
      /^# Flatguide Alpha\n\nFixture page in the flat \(non-versioned\) guide section, used to test sibling sidebar rendering and the callout icon override\.\n\nAlpha topic/m,
    );
  });

  test("a page without a description gets no blank stand-in", () => {
    const md = fs.readFileSync(
      path.join(TEST_PRODUCT_ROOT, "flatmixed", "sub", "index.md"),
      "utf8",
    );
    expect(md).toMatch(/^# Flat mixed subsection\n/m);
    expect(md).not.toMatch(/<no value>|%!/);
  });
});

test.describe("llms.txt links section landing pages", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only llms.txt");

  test("a section heading is followed by a link to the section's own page", () => {
    const llms = fs.readFileSync(path.join(TEST_PRODUCT_ROOT, "llms.txt"), "utf8");
    // Sections with pages under them. Before the fix these were headings only.
    expect(llms).toMatch(/^## Flat Guide\n\n- \[Flat Guide\]\([^)]*\/flatguide\/index\.md\)$/m);
    expect(llms).toMatch(
      /^### Flat mixed subsection\n\n- \[Flat mixed subsection\]\([^)]*\/flatmixed\/sub\/index\.md\)$/m,
    );
  });
});
