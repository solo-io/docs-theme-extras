import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";

// `visibleVersions` in assets/js/flexsearch.js — the set that decides which
// versions may appear under "Other versions" in search results.
//
// WHY THIS EXISTS. The set is built by a Hugo template expression inside a JS
// string literal, it ships minified (so the identifier is renamed and greps for
// `visibleVersions` in a build find nothing), and — the part that made it
// dangerous — an EMPTY set DISABLES the filter rather than hiding everything:
//
//     return v !== currentVersion && (visibleVersions.size === 0 || visibleVersions.has(v));
//
// So a collection bug fails OPEN. Nothing 404s, nothing errors, the search box
// keeps working, and the only symptom is results quietly appearing (or quietly
// not appearing) for the wrong set of versions. Two such bugs shipped:
//
//   1. Only `params.versions` was read. agentgateway.dev configures versions
//      exclusively under `params.sections.<x>.versions`, so its set was empty
//      and the filter was inert. That repo forked this whole 20KB file to fix
//      one line.
//   2. The set was keyed on `version`, but the filter compares it against a URL
//      path SEGMENT (`getVersionFromURL`). Where a config sets
//      `version = "2.14.x"` with `linkVersion = "main"` — gloo-mesh-enterprise
//      and gloo-mesh-gateway both do, for their two newest versions — the entry
//      could never match, so searching from an older version returned NO results
//      for main or latest. Verified live against the production bundle at
//      docs.solo.io/gloo-mesh-enterprise before the fix.
//
// The fixture's `demo` section could detect NEITHER: its entries duplicate the
// top-level v2/v1, and its linkVersion equals its version. The `searchonly`
// section in hugo-{oss,enterprise}.toml exists purely to make this observable.

const EXPECTED = ["v2", "v1", "main", "v3", "v9-link"];

/**
 * The emitted set, read out of the built (and minified) search bundle.
 *
 * Resolves the bundle by following the <script src> on a real built page rather
 * than globbing the output directory. Fingerprinted assets ACCUMULATE across
 * rebuilds — two `en.search.min.<hash>.js` files sat side by side while this
 * spec was being written, and a glob happily read the stale one and reported a
 * pass for output that no page loads. Following the reference cannot do that.
 */
function builtSet(): string[] | null {
  const page = path.join(TEST_PRODUCT_ROOT, "v2", "everything", "index.html");
  if (!fs.existsSync(page)) return null;
  const html = fs.readFileSync(page, "utf8");
  // Quote-agnostic: `hugo --minify` strips attribute quotes.
  const ref = html.match(/src=["']?([^"' >]*en\.search[^"' >]*\.js)/);
  if (!ref) return null;
  // The href is site-relative (e.g. /test/en.search.min.<hash>.js); take the
  // basename and resolve it inside the product root.
  const file = path.join(TEST_PRODUCT_ROOT, path.basename(ref[1]));
  if (!fs.existsSync(file)) return null;
  const src = fs.readFileSync(file, "utf8");
  // Minification renames the const and may re-quote, so match the shape.
  const m = src.match(/new Set\(JSON\.parse\(\s*(['"])(\[.*?\])\1\s*\)\)/s);
  return m ? (JSON.parse(m[2]) as string[]) : null;
}

test.describe("search visibleVersions", () => {
  test("the built bundle carries a set at all", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    expect(
      set!.length,
      "an EMPTY set silently disables the other-versions filter — that is the " +
        "agentgateway.dev failure mode, and it looks like success",
    ).toBeGreaterThan(0);
  });

  test("versions are collected from params.sections, not just params.versions", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    expect(
      set,
      "`v9-link` comes only from params.sections.searchonly — if it is missing, " +
        "the template stopped walking sections and every sections-only consumer " +
        "has an inert filter again",
    ).toContain("v9-link");
  });

  test("entries are keyed on linkVersion, not version", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    // The searchonly entry declares version="v9" and linkVersion="v9-link".
    expect(set).toContain("v9-link");
    expect(
      set,
      "the raw `version` leaked into the set — the filter compares against URL " +
        "path segments, so any config where linkVersion differs from version " +
        "(gloo-mesh-enterprise, gloo-mesh-gateway) loses those versions entirely",
    ).not.toContain("v9");
  });

  test("a whitespace-only dropdown label hides the version", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    expect(
      set,
      "`v8-link` sets dropdown to whitespace, which means hidden — it must not " +
        "be offered in search results either",
    ).not.toContain("v8-link");
  });

  test("the full set matches the fixture config exactly", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    expect(set).toEqual(EXPECTED);
  });
});

// Source-level contract. Cheap, runs against a consumer target too, and pins
// the two collection rules where they are actually written.
test.describe("flexsearch.js version-collection contract", () => {
  const file = path.resolve(__dirname, "../assets/js/flexsearch.js");

  test("walks both params.versions and params.sections", () => {
    test.skip(!fs.existsSync(file), "module-relative path only");
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain("site.Params.versions");
    expect(
      src.includes("site.Params.sections"),
      "sections are no longer collected — a sections-only consumer now gets an " +
        "empty set, which disables the filter instead of erroring",
    ).toBe(true);
  });

  test("keys the set on linkVersion with a version fallback", () => {
    test.skip(!fs.existsSync(file), "module-relative path only");
    const src = fs.readFileSync(file, "utf8");
    expect(
      /\.linkVersion \| default \.version/.test(src),
      "the set must hold URL segments; this is the same expression " +
        "_partials/utils/warn-missing-description.html uses, and the two should " +
        "not drift",
    ).toBe(true);
  });
});
