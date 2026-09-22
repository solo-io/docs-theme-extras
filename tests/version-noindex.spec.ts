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

  // EXACTLY ONE ROBOTS TAG PER PAGE, and it is the version-aware one.
  //
  // This assertion is inverted from what it used to be. The partial used to
  // APPEND a second `<meta name="robots">` from head-end.html, on top of the
  // `index, follow` head.html had already written, and this test asserted the
  // pair. That was a deliberate design with a sound premise at the time: the
  // theme did not shadow head.html, so appending was the only way to reach the
  // decision, and two robots tags do resolve deterministically to the most
  // restrictive.
  //
  // The premise expired. `_partials/head.html` is shadowed here now (for an
  // unrelated resources.Concat guard), so the directive is computed BEFORE the
  // tag is written and one tag says the whole thing. Keeping the old assertion
  // would pin a workaround to a constraint that no longer exists.
  //
  // Asserting the exact count, not just `toContain`, is the point: a duplicate
  // tag is invisible in rendered output and in every other test here, since
  // every assertion above passes with the stray `index, follow` still present.
  test("a duplicate page carries exactly one robots tag, the noindex one", () => {
    const r = robots("v1/everything/index.html");
    expect(
      r.length,
      `expected exactly one robots tag, got ${JSON.stringify(r)}. Two tags ` +
        "means head-end.html is appending again alongside head.html.",
    ).toBe(1);
    expect(r).toEqual([NOINDEX]);
  });

  // The fail-safe. version-noindex.html returns "" for a non-duplicate, and
  // head.html must fall through to upstream's `index, follow` rather than
  // emitting an empty or missing tag — a page with NO robots tag reads as
  // indexable to a crawler but is indistinguishable, in a test, from the
  // partial having gone inert.
  test("a non-duplicate page still carries upstream's single index tag", () => {
    expect(robots("v2/everything/index.html")).toEqual(["index, follow"]);
    expect(robots("v1/removed-feature/index.html")).toEqual(["index, follow"]);
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

  // Guards the single-tag refactor at the source, not just in output. The
  // rendered-output test above catches a reintroduced duplicate only on the
  // fixture target; this catches it in any checkout, and names the reason.
  test("it RETURNS a directive and emits no markup of its own", () => {
    const src = activeSrc();
    expect(
      /\{\{-?\s*return\s+\$/.test(src),
      "version-noindex.html no longer returns a value. It is a returning " +
        "partial by contract: _partials/head.html folds its result into the " +
        "one robots tag. Going back to emitting means two tags per page again.",
    ).toBe(true);
    expect(
      /<meta\s+name="robots"/.test(src),
      "version-noindex.html emits a <meta name=\"robots\"> tag again. " +
        "head.html already writes one, so this appends a second, " +
        "contradictory-looking tag — the exact thing the return refactor " +
        "removed.",
    ).toBe(false);
  });

  test("head.html is the single robots emitter and consults this partial", () => {
    const HEAD = path.resolve(__dirname, "../layouts/_partials/head.html");
    test.skip(!fs.existsSync(HEAD), "head.html not at the module-relative path");
    const head = fs.readFileSync(HEAD, "utf8");
    expect(
      /partial\s+"utils\/version-noindex\.html"/.test(head),
      "head.html does not call utils/version-noindex.html, so old-version " +
        "duplicates get upstream's `index, follow` and nothing marks them. " +
        "This partial fails OPEN — the symptom is only visible in search " +
        "rankings weeks later, never in a build.",
    ).toBe(true);
    const tags = head.match(/<meta\s+name="robots"/g) ?? [];
    expect(
      tags.length,
      "head.html should contain exactly the three robots branches " +
        "(noindex/nofollow, the version directive, index/follow).",
    ).toBe(3);
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
