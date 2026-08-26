import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Per-section version banners: [params.versions.sectionBanners.<section>].
//
// A product can ship two sections at different maturities inside ONE version —
// agentgateway's `latest` is GA under /kubernetes/ and in preview under
// /standalone/. The banner is otherwise per-VERSION, so both sections got the
// same text.
//
// The tempting fix is to split the version into two entries, one per section.
// That MISROUTES rather than fails: the enterprise branch of version-root.html
// matches against the unfiltered site.Params.versions, so both sections receive
// whichever duplicate `linkVersion` is listed first. Measured on the docs hub,
// that put a standalone preview banner on 327 Kubernetes pages. One entry per
// version is a documented invariant (utils/resolve-section-versions.html), so
// the override hangs off that single entry instead.
//
// FIXTURE SETUP. The v1 entry is tagged sections = ["demo", "nested"] and now
// carries both an entry-level `banner` and a `sectionBanners.nested` override.
// `nested` is the only fixture section that nests its version trees
// (/test/nested/v1/…), so it is the only one whose pages carry a section
// segment for the override to key off. v2 sets neither, which is what makes the
// no-leakage assertion meaningful.
//
// These pages are fixture-only and deliberately absent from [[pages]] —
// static.spec.ts treats every non-landing entry as a comprehensive
// "all markers present" topic page. Resolved by direct path and gated on the
// fixture target, the same pattern version-nested-list / conditional-block use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const pageAt = (rel: string) => path.join(TEST_PRODUCT_ROOT, rel, "index.html");

const ENTRY = "MARKER_BANNER_ENTRY";
const SECTION = "MARKER_BANNER_SECTION";

function banners(filePath: string): string[] {
  const html = readFixture(filePath);
  return [
    ...html.matchAll(/<div class="version-banner">([\s\S]*?)<\/div>/g),
  ].map((m) => m[1].replace(/<[^>]+>/g, "").trim());
}

test.describe("per-section version banner", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only pages");

  test("a section override REPLACES the entry-level banner", () => {
    const found = banners(pageAt("nested/v1/page"));

    // Exactly one banner. Two would mean the override stacked instead of
    // replacing, and "under development" next to "this is the latest version"
    // reads as a contradiction — replacement is the deliberate choice here.
    expect(
      found.length,
      "expected exactly one .version-banner — more than one means the override stacked instead of replacing",
    ).toBe(1);
    expect(found[0], "section override text missing").toContain(SECTION);
    expect(
      found[0],
      "entry-level text still present alongside the override — it should have been replaced, not appended",
    ).not.toContain(ENTRY);
  });

  test("a section with no override falls back to the entry-level banner", () => {
    // /test/v1/everything/ carries no section segment, so the override cannot
    // key off anything and the entry-level banner must still render. This is
    // the assertion that catches an implementation which makes the override
    // unconditional, or which drops the banner whenever a section is absent.
    const found = banners(pageAt("v1/everything"));

    expect(found.length, "entry-level banner did not render").toBe(1);
    expect(found[0], "entry-level text missing").toContain(ENTRY);
    expect(
      found[0],
      "section override leaked onto a page with no section segment",
    ).not.toContain(SECTION);
  });

  test("a version that sets no banner still shows none", () => {
    // v2 is tagged with `nested` too but sets neither banner nor override.
    // If this ever renders something, the override is being read off the wrong
    // version entry — the 327-page misrouting failure, in miniature.
    const found = banners(pageAt("nested/v2/page"));

    expect(
      found,
      "a version with no banner config rendered one — the override is resolving against the wrong version entry",
    ).toEqual([]);
  });

  test("the override does not leak across sections of the same version", () => {
    // v1 is tagged ["demo", "nested"] but only `nested` declares an override.
    // Every built v1 page that is NOT under /nested/ must show the entry text.
    // Walks the whole v1 subtree rather than sampling, because a leak would
    // most likely show up on the pages nobody thought to check.
    const fs = require("node:fs") as typeof import("node:fs");
    const root = path.join(TEST_PRODUCT_ROOT, "v1");
    if (!fs.existsSync(root)) test.skip();

    const stack = [root];
    const leaked: string[] = [];
    let checked = 0;
    while (stack.length) {
      const dir = stack.pop()!;
      for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, e.name);
        if (e.isDirectory()) stack.push(full);
        else if (e.name === "index.html") {
          checked++;
          if (banners(full).some((b) => b.includes(SECTION))) leaked.push(full);
        }
      }
    }

    expect(checked, "no v1 pages found to check").toBeGreaterThan(0);
    expect(
      leaked,
      `section override leaked onto ${leaked.length} of ${checked} v1 pages outside /nested/`,
    ).toEqual([]);
  });
});
