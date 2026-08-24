import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Two assertions below name specific fixture ENTRIES (`v4`/`v4-link`) rather
// than a property that holds for any config, so they only mean something
// against the bundled fixture. Every sibling spec that reads fixture-specific
// config already carries this guard; this one had only a `set === null` skip,
// which does not fire on a consumer that HAS a search bundle.
//
// The cost of the gap, measured: solo-io/docs keeps a hand-maintained partial
// COPY of this fixture's config in hugo-preview-test.toml (plus hugo-test.toml
// and hugo-local-test.toml), and the `v4` entry added in v0.2.2 was never
// mirrored into it. So framework-test-static in that repo failed on a
// difference between two fixture configs, not on a theme defect — while the
// generic assertions in this file (non-empty set, linkVersion keying) kept
// working there, which is exactly the coverage a consumer target should give.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

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
//   1. Only `params.versions` was read. agentgateway.dev configured versions
//      exclusively under `params.sections.<x>.versions`, so its set was empty
//      and the filter was inert. That repo forked this whole 20KB file to fix
//      one line. This one is now structurally impossible: there is a single
//      versions list, and a section-scoped version names its sections inside it
//      (CHANGELOG [0.2.2]), so there is no second place to forget.
//   2. The set was keyed on `version`, but the filter compares it against a URL
//      path SEGMENT (`getVersionFromURL`). Where a config sets
//      `version = "2.14.x"` with `linkVersion = "main"` — gloo-mesh-enterprise
//      and gloo-mesh-gateway both do, for their two newest versions — the entry
//      could never match, so searching from an older version returned NO results
//      for main or latest. Verified live against the production bundle at
//      docs.solo.io/gloo-mesh-enterprise before the fix.
//
// What makes the rest observable in the fixture: the `v4` entry declares
// version="v4" with linkVersion="v4-link" (the keying probe), the `v8` entry
// declares a whitespace `dropdown` (the hidden probe), and `v1`/`main` are
// tagged into different sections — search is NOT section-scoped, so tagging must
// not shrink this set.

// "v4-link" is the LINKVERSION of the v4 entry, and its presence here is the
// second half of assertion 2 below: the set must be keyed on linkVersion, not
// version. If it were keyed on `version` this list would read "v4" instead, and
// the filter could never match a URL segment on a divergent entry.
const EXPECTED = ["v2", "v1", "main", "v3", "v4-link"];

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

  // Was two tests: one that sections were walked at all, one that the set was
  // keyed on linkVersion. The first is now structurally impossible to fail —
  // there is only ONE list to read (CHANGELOG [0.2.2]) — so a section-scoped
  // version cannot hide from this collection the way it used to. What remains
  // worth asserting is the keying, and the tagged model does not change it.
  test("entries are keyed on linkVersion, not version", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    // The v4 entry declares version="v4" and linkVersion="v4-link", so the
    // positive half needs that entry to exist. The negative half below does
    // not, and is the one that actually catches the shipped bug — a set keyed
    // on `version` leaks the raw value — so it runs everywhere.
    if (IS_FIXTURE_TARGET) expect(set).toContain("v4-link");
    expect(
      set,
      "the raw `version` leaked into the set — the filter compares against URL " +
        "path segments, so any config where linkVersion differs from version " +
        "(gloo-mesh-enterprise, gloo-mesh-gateway) loses those versions entirely",
    ).not.toContain("v4");
  });

  test("a section-scoped version is still collected", () => {
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    // v1 is tagged sections = ["demo"], main is tagged ["alt"]. Search is not
    // section-scoped — a result from any section may surface — so tagging must
    // not remove an entry from this set. Reading a FILTERED list here would
    // silently shrink search coverage for every sectioned product.
    expect(set).toContain("v1");
    expect(set).toContain("main");
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
    test.skip(!IS_FIXTURE_TARGET, "EXPECTED is this fixture's version list");
    const set = builtSet();
    test.skip(set === null, "no built search bundle (consumer target)");
    expect(set).toEqual(EXPECTED);
  });
});

// Source-level contract. Cheap, runs against a consumer target too, and pins
// the two collection rules where they are actually written.
test.describe("flexsearch.js version-collection contract", () => {
  const file = path.resolve(__dirname, "../assets/js/flexsearch.js");

  test("reads the one versions list, and does not re-introduce a second", () => {
    test.skip(!fs.existsSync(file), "module-relative path only");
    const src = fs.readFileSync(file, "utf8");
    expect(src).toContain("site.Params.versions");
    // Reading a per-section list again would mean this file has to remember to
    // walk two places — the mistake that left the set empty on agentgateway.dev
    // and made the whole filter inert. Note `sections` as an entry FIELD is
    // fine; what must not come back is a `sections.<x>.versions` lookup.
    expect(
      /Params\.sections[\s\S]{0,80}?\.versions/.test(src),
      "flexsearch.js reads a per-section versions list again. Versions live in " +
        "one list now; a section-scoped entry names its sections in a `sections` " +
        "field.",
    ).toBe(false);
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
