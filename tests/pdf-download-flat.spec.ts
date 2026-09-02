import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// The "Download all docs (PDF)" menu item on a site with NO VERSIONS AT ALL.
//
// WHY THIS EXISTS. `copy-markdown.html` resolves the book root through
// `utils/version-root.html`, which fills `docsSection` only when it matched a
// version segment in the URL. On a flat site there is no such segment, so the
// field came back empty, the `with` around the whole item never opened, and the
// item was unreachable no matter what `params.pdfDownload` said. ambientmesh.io
// is the real consumer — one book for its entire `/docs/` tree, no versions
// anywhere — and it got no link while every check that could have caught it
// (build exit code, Hugo warnings, the book document's own structure) stayed
// green. Nothing renders a missing menu item as an error.
//
// The fallback is `.FirstSection`, reached ONLY when version-root.html found no
// version. That restriction is the load-bearing part: inside a versioned subtree
// `.FirstSection` returns the product rather than the version root, which is the
// documented reason the versioned path does not use it.
//
// Read against `hugo-flat.toml`'s build. `hugo-flat-root.toml` deliberately sets
// no `pdfDownload`, so it stays the control for "a flat site that wants no item".
const FLAT_DIR = "public-flat";
const FLAT_ROOT_DIR = "public-flat-root";

// hugo-flat.toml's [params.pdfDownload] plus the section that opts into `book`.
const PRODUCT = "flatprod";
const DISTRIBUTION = "oss";
const BOOK_SECTION = "alpha";
// The section prefix survives on a flat site, so the asset is per doc set rather
// than per site. See "the section prefix is not dropped" below for why that is
// asserted separately rather than folded into the URL check.
const EXPECTED_ASSET = `${PRODUCT}-${DISTRIBUTION}-${BOOK_SECTION}-latest`;
const EXPECTED_URL =
  `https://github.com/solo-io/docs-pdfs/releases/download/${EXPECTED_ASSET}/${EXPECTED_ASSET}.pdf`;

// Same gate and same reason as tests/section-nested-versions.spec.ts: every
// assertion here reads the bundled fixture's own config (the product name, the
// distribution, which section opts in), so it means nothing pointed at a
// consumer's build.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

function buildRoot(dir: string): string {
  return path.resolve(__dirname, "..", dir);
}

function page(dir: string, rel: string): string {
  return path.join(buildRoot(dir), rel, "index.html");
}

function read(p: string): string {
  return fs.readFileSync(p, "utf8");
}

/** Every docs-pdfs release URL in a page, in document order. */
function pdfURLs(html: string): string[] {
  return html.match(
    /https:\/\/github\.com\/solo-io\/docs-pdfs\/releases\/download\/[^"'<\s]+/g,
  ) || [];
}

test.describe("PDF download link on a version-less site", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled flat fixture's pdfDownload config");
  test.skip(!fs.existsSync(buildRoot(FLAT_DIR)),
    `${FLAT_DIR} is missing — run \`make build-flat\``);

  test("the opted-in section root carries the item", () => {
    const urls = pdfURLs(read(page(FLAT_DIR, BOOK_SECTION)));
    expect(urls, "no docs-pdfs URL on the section that opts into `book`").not.toEqual([]);
    expect(urls[0]).toBe(EXPECTED_URL);
  });

  test("a page BELOW the opted-in section carries the same item", () => {
    // The item is a property of the doc set, not of the one page that declares
    // the output format, so a leaf page has to resolve the same asset. This is
    // the assertion that would fail if `.FirstSection` were swapped for "the
    // current page", which looks equivalent on the section root alone.
    const leaf = page(FLAT_DIR, `${BOOK_SECTION}/first`);
    expect(fs.existsSync(leaf), `${leaf} was not built`).toBe(true);
    expect(pdfURLs(read(leaf))[0]).toBe(EXPECTED_URL);
  });

  test("the section prefix is not dropped", () => {
    // A flat site substitutes `latest` for the missing version segment. Doing
    // that AFTER the section prefix is applied overwrites it, and then every doc
    // set on the site resolves to one `…-oss-latest.pdf` — the exact collision
    // the prefix exists to prevent, silently, because both URLs are well formed.
    // The fixture registers four sections precisely so this is observable.
    const url = pdfURLs(read(page(FLAT_DIR, BOOK_SECTION)))[0] || "";
    expect(url, "the version key lost its section prefix").toContain(`${BOOK_SECTION}-latest`);
    expect(url).not.toContain(`${PRODUCT}-${DISTRIBUTION}-latest`);
  });

  test("a sibling section that publishes no book carries no item", () => {
    // `beta` is a registered doc set with pages and no `book` output format. It
    // is the control that proves the item follows the build rather than the
    // presence of `params.pdfDownload`.
    for (const sec of ["beta", "gamma", "delta"]) {
      const p = page(FLAT_DIR, sec);
      if (!fs.existsSync(p)) continue;
      expect(pdfURLs(read(p)), `${sec} publishes no book but shows a download item`).toEqual([]);
    }
  });

  test("the home page carries no item", () => {
    // `.FirstSection` on the home page is the home page, which carries no `book`
    // output format — so the gate holds without needing to know about /docs/.
    expect(pdfURLs(read(path.join(buildRoot(FLAT_DIR), "index.html")))).toEqual([]);
  });

  test("opting into `book` does not cost the section its other outputs", () => {
    // `outputs` REPLACES a page's defaults rather than adding to them. This
    // fixture declares no `[outputs]`, so a section defaults to HTML + RSS, and
    // a cascade naming only html and book would drop alpha's index.xml with no
    // error anywhere. The same mistake shipped to kgateway.dev's 14 section
    // roots and to ambientmesh.io's /docs/, so it is asserted rather than
    // trusted.
    const xml = path.join(buildRoot(FLAT_DIR), BOOK_SECTION, "index.xml");
    expect(fs.existsSync(xml), `${xml} is missing — the cascade's \`outputs\` dropped it`).toBe(true);
    // The control: a section that never opted in.
    expect(fs.existsSync(path.join(buildRoot(FLAT_DIR), "beta", "index.xml"))).toBe(true);
  });

  test("a flat site that sets no pdfDownload still shows no item", () => {
    // hugo-flat-root.toml builds the same content with no `pdfDownload` table.
    // Without this, a bug that emitted the item unconditionally on flat sites
    // would pass every assertion above.
    const root = buildRoot(FLAT_ROOT_DIR);
    test.skip(!fs.existsSync(root), `${FLAT_ROOT_DIR} is missing — run \`make build-flat\``);
    const p = path.join(root, "docs", BOOK_SECTION, "index.html");
    test.skip(!fs.existsSync(p), "flat-root build has no alpha page");
    expect(pdfURLs(read(p))).toEqual([]);
  });
});
