import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// card.html's `path=` branch: resolve an href against the page's OWN version
// root, rather than using the value verbatim the way `link=` does.
//
// WHY THIS EXISTS. Until this page was added, NOT ONE fixture card used `path=`
// — every one passed `link=`. So the entire resolution branch was unexercised,
// and it is the branch with a shipped failure: the docs hub keeps its own
// `card.html` override (Material Icons + translation export), and that copy
// derived its prefix straight from `.Page.FirstSection.RelPermalink`. That
// returns the SECTION, not the version, once a product nests version trees
// under a section segment (`/<product>/<section>/<version>/…`, which
// agentgateway adopted so kubernetes and standalone can sit side by side), so it
// emitted hrefs like `/agentgateway/kubernetes/observability/` with the version
// missing. Measured on a local build: 178 of them, every one a 404. It had
// worked before the restructure only because the version WAS the first section.
//
// The assertion that matters most is therefore the dullest one: the emitted href
// contains the version segment.
//
// NOT COVERED HERE: the section-segment URL shape itself. This fixture serves
// `/test/<version>/…` with no section segment, so it exercises the branch that
// resolves correctly rather than the one that broke. Covering that shape needs a
// fixture tree at `/test/<section>/<version>/…`, which does not exist yet. The
// source-contract test at the bottom is what stands in for it: it fails if the
// module's card.html ever regresses to deriving the prefix from FirstSection
// alone, which is the mistake the override made.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const BASE = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/card-path/index.html");

/** Marker -> emitted href, read out of the built page. */
function hrefsByMarker(): Record<string, string> {
  const html = fs.readFileSync(PAGE, "utf8");
  const out: Record<string, string> = {};
  for (const m of html.matchAll(
    /<a class="section-card" href="([^"]*)"([\s\S]*?)<\/a>/g,
  )) {
    const marker = m[2].match(/MARKER_CARD_PATH_(\w+)/);
    if (marker) out[marker[1]] = m[1];
  }
  return out;
}

test.describe("card path= resolves against the version root", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only content shape");
  test.skip(!fs.existsSync(PAGE), "v2/card-path not built");

  const CASES: Array<[string, string, string]> = [
    // marker, expected href, what it pins
    ["ABS", `${BASE}/v2/rebased/`, "a leading-slash path"],
    ["REL", `${BASE}/v2/rebased/`, "a slashless path"],
    ["NESTED", `${BASE}/v2/reference/`, "a nested path"],
    ["FRAGMENT", `${BASE}/v2/rebased/#companion`, "a path with a fragment"],
  ];

  test("all four path= cards rendered", () => {
    expect(Object.keys(hrefsByMarker()).sort()).toEqual([
      "ABS",
      "FRAGMENT",
      "NESTED",
      "REL",
    ]);
  });

  for (const [marker, expected, what] of CASES) {
    test(`${what} resolves to ${expected}`, () => {
      expect(hrefsByMarker()[marker]).toBe(expected);
    });
  }

  // Stated separately from the equality checks above, because this is the
  // property that actually broke in production. An equality assertion would
  // catch it, but a failure here names the cause.
  test("every path= href carries the version segment", () => {
    for (const [marker, href] of Object.entries(hrefsByMarker())) {
      expect(
        href.startsWith(`${BASE}/v2/`),
        `${marker} emitted ${href}, which is missing the version segment. That is ` +
          "the docs-hub failure mode: a prefix derived from FirstSection yields " +
          "the section instead of the version, and every such href 404s.",
      ).toBe(true);
    }
  });

  test("a slashless path is not fused onto the version segment", () => {
    // `/test/v2` + `rebased/` must not become `/test/v2rebased/`.
    expect(hrefsByMarker().REL).not.toMatch(/v2[^/]/);
  });

  test("a fragment href gains no trailing slash", () => {
    expect(hrefsByMarker().FRAGMENT.endsWith("/")).toBe(false);
  });

  test("each non-fragment href resolves to a built page", () => {
    for (const [marker, href] of Object.entries(hrefsByMarker())) {
      const rel = href
        .replace(new RegExp(`^${BASE}/`), "")
        .replace(/#.*$/, "")
        .replace(/\/$/, "");
      const file = path.join(TEST_PRODUCT_ROOT, rel, "index.html");
      expect(
        fs.existsSync(file),
        `${marker}: ${href} -> ${file} does not exist`,
      ).toBe(true);
    }
  });
});

test.describe("card path= source contract", () => {
  const SRC = path.resolve(__dirname, "../layouts/_shortcodes/card.html");

  test.skip(
    !fs.existsSync(SRC),
    "card.html not at the module-relative path (consumer build)",
  );

  test("the prefix comes from page-context, with FirstSection only as a fallback", () => {
    const src = fs
      .readFileSync(SRC, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    const ctxIdx = src.search(/partial\s+"utils\/page-context\.html"/);
    expect(
      ctxIdx,
      "card.html no longer resolves its prefix through utils/page-context.html. " +
        "Deriving it from .Page.FirstSection.RelPermalink alone is the docs-hub " +
        "override's bug: FirstSection is the SECTION inside a section subtree, so " +
        "the version segment is dropped from every path= href.",
    ).toBeGreaterThan(-1);

    const firstSectionIdx = src.search(/FirstSection/);
    if (firstSectionIdx > -1) {
      expect(
        firstSectionIdx,
        "FirstSection is consulted BEFORE page-context. It is only correct as a " +
          "fallback for pages outside any version tree.",
      ).toBeGreaterThan(ctxIdx);
    }
  });
});
