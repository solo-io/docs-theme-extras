import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROOT, TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the llms.txt discovery directive across all three
// surfaces that emit it:
//   1. the sr-only HTML hint (docs-llms-directive.html, wired into
//      docs/single.html + docs/list.html),
//   2. the leaf-page .md output format (page.markdown.md), and
//   3. the section-index .md output format (section.markdown.md).
//
// The href must be DERIVED from the site's `llms` output format — never the old
// hardcoded /docs/llms.txt, which 404s on the docs hub where llms.txt is
// product-scoped (e.g. /kgateway/llms.txt). The fixture is served under /test,
// so its derived href is /test/llms.txt: this exercises the product-prefix
// path, exactly the case the hardcoded value got wrong.
//
// The three surfaces share the derivation via utils/llms-href.html. Before that
// helper existed the .md templates had DRIFTED from the HTML partial — they
// still pointed at /docs/llms.txt after the HTML partial was fixed. Each surface
// is asserted independently so a future drift in any one of them fails here.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// A leaf (single) page and a section-index page, each with its HTML + .md form.
const SURFACES = [
  { kind: "single", html: "v2/everything/index.html", md: "v2/everything.md" },
  { kind: "section", html: "v2/index.html", md: "v2/index.md" },
];

const abs = (rel: string) => path.join(TEST_PRODUCT_ROOT, rel);

// href → real generated file (no 404). href is site-root-relative
// (/test/llms.txt), so it resolves under the brand's built root, not the
// per-product root.
function resolvesToBuiltFile(href: string): boolean {
  return fs.existsSync(path.join(PUBLIC_ROOT, href));
}

test.describe("llms.txt discovery directive: derived, product-prefix-aware href", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: relies on the extras fixture's llms output format");

  for (const s of SURFACES) {
    test(`${s.kind}: sr-only HTML directive uses the derived, non-404 href`, () => {
      const html = readFixture(abs(s.html));

      // Robust against other sr-only paragraphs on the page: pick the one that
      // actually carries the llms.txt link.
      const paras = [...html.matchAll(/<p class="hx:sr-only">([\s\S]*?)<\/p>/g)].map((m) => m[1]);
      const directive = paras.find((p) => p.includes("llms.txt"));
      expect(directive, "sr-only llms.txt directive missing from content").toBeTruthy();

      const hrefMatch = directive!.match(/<a href="([^"]+)">llms\.txt<\/a>/);
      expect(hrefMatch, "llms.txt anchor missing from the directive").not.toBeNull();
      const href = hrefMatch![1];

      expect(href, "href regressed to the hardcoded /docs/llms.txt (404s under a product prefix)").not.toBe(
        "/docs/llms.txt",
      );
      expect(href, "href should target a llms.txt").toMatch(/\/llms\.txt$/);
      expect(resolvesToBuiltFile(href), `${href} does not resolve to a generated file`).toBe(true);

      // The .md-append half always renders alongside the llms half.
      expect(directive!, "the .md-append hint should be present").toMatch(/appending \.md/);
    });

    test(`${s.kind}: .md output directive uses the same derived href`, () => {
      const md = readFixture(abs(s.md));

      const hrefMatch = md.match(/\[llms\.txt\]\(([^)]+)\)/);
      expect(hrefMatch, ".md llms.txt directive missing").not.toBeNull();
      const href = hrefMatch![1];

      expect(href, ".md href regressed to the hardcoded /docs/llms.txt").not.toBe("/docs/llms.txt");
      expect(href).toMatch(/\/llms\.txt$/);
      expect(resolvesToBuiltFile(href), `${href} does not resolve to a generated file`).toBe(true);

      // Directive is a blockquote at the very top of the .md artifact.
      expect(md.trimStart().startsWith(">"), ".md directive should lead the document as a blockquote").toBe(true);
    });
  }
});
