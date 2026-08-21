import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// The robots assertions read the bundled fixture's own v1/v2/main trees and the
// config assertion reads hugo-oss.toml, which only exists in this repo (a
// consumer resolves the module from hugo_cache). Same guard the other
// fixture-shape specs use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// utils/version-noindex.html — the surgical "old version duplicate" noindex.
//
// WHAT IT IS FOR. An old version's copy of a page that STILL EXISTS in the
// current version is near-duplicate content competing for the same query. This
// marks those `noindex, follow`. A page that exists ONLY in an old version (a
// removed feature) has no current-version counterpart and must stay indexable,
// so removed-feature docs remain findable. Suppress duplicates, not history.
//
// WHY THIS FILE EXISTS. The partial shipped with ZERO tests and was broken in
// two of the three consumer shapes, in both cases because it re-derived the
// version and the content lookup path itself instead of using the shared
// resolver:
//
//   1. Docs hub: it built the lookup path from the full RelPermalink, keeping
//      the /<product>/ segment. Hub GetPage paths are contentDir-relative
//      (content/<lang>/<product>), so the lookup was ALWAYS nil and NO
//      duplicate was ever marked. Verified live before the fix: gme
//      getting_started served `index, follow` on 2.10.x, 2.11.x and 2.12.x
//      alike.
//   2. Sections-only sites (agentgateway.dev, versions declared only under
//      params.sections.<x>.versions): the `with site.Params.versions` gate made
//      the partial entirely inert — no robots meta at all — while kgateway.dev,
//      which has a top-level list, worked.
//
// Neither was observable here, because the fixture activated NEITHER detection
// signal: no entry had `latest = true`, and none had `linkVersion = "latest"`.
// The partial was dead code in every test run. hugo-{oss,enterprise}.toml now
// set `latest = true` on the v2 entry, and v1/removed-feature.md exists solely
// to cover the "leave history indexable" branch (every other v1 page has a v2
// counterpart).
//
// Failing OPEN is the danger with this partial: a bug means pages are simply
// indexed as before. Nothing 404s, nothing errors, and the symptom is only
// visible in search rankings weeks later. So these assertions check the emitted
// tag directly.

const read = (rel: string) =>
  fs.readFileSync(path.join(TEST_PRODUCT_ROOT, rel), "utf8");

/** The robots directives on a built page, in document order. */
function robots(rel: string): string[] {
  return [...read(rel).matchAll(/name="robots"\s+content="([^"]*)"/g)].map(
    (m) => m[1],
  );
}

const NOINDEX = "noindex, follow";

test.describe("version-noindex: old-version duplicates", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only content shape");

  // v2 is the current version (`latest = true`), and v1/everything has a v2
  // counterpart — the core case.
  test("an old version's page that still exists in the current version is noindexed", () => {
    expect(
      robots("v1/everything/index.html"),
      "v1/everything has a v2 counterpart, so it is a near-duplicate and must " +
        "carry noindex. Empty or index-only here means the partial went inert " +
        "(the sections-only bug) or its content lookup never resolved (the " +
        "docs-hub contentDir bug) — both fail open and are invisible otherwise.",
    ).toContain(NOINDEX);
  });

  test("the version root of an old version is noindexed too", () => {
    expect(robots("v1/index.html")).toContain(NOINDEX);
  });

  // `main` is a second non-current version, so the behavior must not be
  // special-cased to one entry.
  test("every non-current version is covered, not just one", () => {
    expect(robots("main/everything/index.html")).toContain(NOINDEX);
  });

  test("the CURRENT version is never noindexed", () => {
    expect(
      robots("v2/everything/index.html"),
      "v2 is the current version — noindexing it would deindex the live docs.",
    ).not.toContain(NOINDEX);
    expect(robots("v2/index.html")).not.toContain(NOINDEX);
  });

  // The differentiator versus a blanket per-version noindex.
  test("a page that exists ONLY in an old version stays indexable", () => {
    expect(
      robots("v1/removed-feature/index.html"),
      "v1/removed-feature has no v2 counterpart, so it duplicates nothing. " +
        "Noindexing it would erase removed-feature documentation from search — " +
        "the exact failure the per-page existence check prevents.",
    ).not.toContain(NOINDEX);
  });

  // Hextra's head.html emits a self-referential canonical and an
  // `index, follow` robots tag before head-end.html runs, and the theme does
  // not shadow head.html. So the duplicate case must carry BOTH tags and let
  // the most restrictive win; a second, conflicting canonical would instead
  // make search engines ignore both.
  test("noindex is emitted alongside Hextra's tag, not instead of it", () => {
    const r = robots("v1/everything/index.html");
    expect(r.length, `expected two robots tags, got ${JSON.stringify(r)}`).toBe(
      2,
    );
    expect(r).toEqual(["index, follow", NOINDEX]);
  });
});

test.describe("version-noindex: source contract", () => {
  const SRC = path.resolve(
    __dirname,
    "../layouts/partials/utils/version-noindex.html",
  );

  test.skip(
    !fs.existsSync(SRC),
    "version-noindex.html not at the module-relative path (consumer build)",
  );

  const activeSrc = () =>
    fs
      .readFileSync(SRC, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");

  test("it resolves the version through the shared resolver, not its own URL scan", () => {
    const src = activeSrc();
    expect(
      /partial\s+"utils\/version-root\.html"/.test(src),
      "version-noindex.html no longer calls utils/version-root.html — a second " +
        "version-detection implementation here is what produced both shipped " +
        "bugs, since nothing kept it in step with the sidebar and navbar.",
    ).toBe(true);
    expect(
      /\$root\.lookupPath/.test(src),
      "the content lookup no longer uses version-root's `lookupPath`. That " +
        "field is the contentDir-relative path; rebuilding it from " +
        "RelPermalink re-introduces the docs-hub bug where the product segment " +
        "made every site.GetPage return nil.",
    ).toBe(true);
  });

  test("the version list comes from the section-aware resolver", () => {
    expect(
      /partial\s+"utils\/resolve-section-versions\.html"/.test(activeSrc()),
      "the versions list is not resolved via utils/resolve-section-versions.html. " +
        "Reading `site.Params.versions` directly makes the partial inert on a " +
        "sections-only site such as agentgateway.dev.",
    ).toBe(true);
  });

  test("the fixture actually activates the partial", () => {
    test.skip(!IS_FIXTURE_TARGET, "hugo-oss.toml is only present in this repo");
    // Guards the coverage itself: if `latest = true` is dropped from the
    // fixture, every assertion above would still pass vacuously on an inert
    // partial (no robots tag is trivially "not noindex").
    const cfg = fs.readFileSync(
      path.resolve(__dirname, "../hugo-oss.toml"),
      "utf8",
    );
    expect(
      /^\s*latest\s*=\s*true/m.test(cfg),
      "no `latest = true` in hugo-oss.toml — version-noindex.html has no " +
        "current version to compare against, so it emits nothing and this " +
        "whole spec passes without testing anything.",
    ).toBe(true);
  });
});
