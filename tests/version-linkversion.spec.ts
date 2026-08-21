import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// The content assertions below read the bundled fixture's own v4-link tree, and
// the config assertion reads hugo-oss.toml, which only exists in this repo (a
// consumer gets the module from hugo_cache). Both are fixture-only, following
// the same guard the other fixture-shape specs use.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// Version gating where the URL SLUG differs from the CANONICAL version.
//
// WHY THIS EXISTS. Until the `v4` / `v4-link` entry was added, every entry in
// this fixture set `version` and `linkVersion` to the same string (v2/v2, v1/v1,
// main/main, v3/v3). That made an entire class of bug invisible here, because no
// assertion could distinguish "matched on the canonical version" from "matched
// on the URL slug" — they were the same value.
//
// Production diverges routinely, and always has:
//
//   gloo-mesh-enterprise / gloo-mesh-gateway   2.14.x -> main,  2.13.x -> latest
//   kgateway-oss                               2.5.x  -> main,  2.4.x  -> latest
//   agentgateway-oss                           1.5.x  -> main,  1.4.x  -> latest
//
// So the shape that matters is: the page is served at `/latest/`, but an author
// writes `include-if="2.13.x"` (the release they are documenting). version.html
// deliberately passes BOTH `.version` and `.linkVersion` as gate tokens for that
// reason. It also matters beyond gating — reuse.html and rebase.html resolve
// versioned assets under the CANONICAL `assets/<product>/<version>/` path, which
// is how assemble-assets.py names its mount targets, NOT under the URL slug.
//
// The names are chosen so `v4` is a strict SUBSTRING of `v4-link`, because
// version.html matches with `in $condition .linkVersion` — a substring test, not
// an equality test. A slug collision would surface here.
//
// Every marker below is asserted in BOTH directions (include renders / exclude
// suppresses). A gate that silently emits nothing looks identical to a gate that
// correctly suppressed, so one-sided assertions would pass on a totally broken
// shortcode.

const PAGE = path.join(TEST_PRODUCT_ROOT, "v4-link/gating/index.html");

// Each marker appears twice in a correct build: once in the rendered body and
// once inside the copy-as-markdown <script type="text/markdown"> source block.
// Assert presence/absence rather than an exact count, so this does not become a
// tripwire for unrelated copy-markdown changes.
const has = (marker: string) => fs.readFileSync(PAGE, "utf8").includes(marker);

test.describe("version gating with linkVersion != version", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only content shape");
  test.skip(
    !fs.existsSync(PAGE),
    "v4-link/gating not built (consumer without the fixture's version set)",
  );

  test("include-if on the CANONICAL version renders, though the URL is the slug", () => {
    expect(
      has("MARKER_GATE_CANONICAL_INCLUDED"),
      "a block gated `include-if=\"v4\"` did not render on /test/v4-link/. This " +
        "is the production case: gloo-mesh serves canonical 2.13.x at /latest/ " +
        "and authors write include-if=\"2.13.x\". If this fails, every " +
        "release-numbered gate on a /latest/ or /main/ tree silently vanishes.",
    ).toBe(true);
  });

  test("include-if on the linkVersion slug also renders", () => {
    expect(
      has("MARKER_GATE_LINKVERSION_INCLUDED"),
      "a block gated `include-if=\"v4-link\"` did not render. The slug token is " +
        "what lets `include-if=\"main\"` survive a release without a per-version " +
        "bump.",
    ).toBe(true);
  });

  test("exclude-if on the CANONICAL version suppresses", () => {
    expect(
      has("MARKER_GATE_CANONICAL_EXCLUDED_LEAK"),
      "content gated `exclude-if=\"v4\"` LEAKED onto the v4 tree. Canonical " +
        "exclusion is how a page hides one release's content; leaking it " +
        "publishes text meant for other versions.",
    ).toBe(false);
  });

  test("exclude-if on the linkVersion slug suppresses", () => {
    expect(has("MARKER_GATE_LINKVERSION_EXCLUDED_LEAK")).toBe(false);
  });

  test("include-if naming a DIFFERENT version emits nothing", () => {
    expect(
      has("MARKER_GATE_OTHER_VERSION_LEAK"),
      "content gated `include-if=\"v2\"` rendered on the v4 tree. Note `v4` is a " +
        "substring of `v4-link`; a substring match against the wrong entry is " +
        "exactly the failure this version pair was named to catch.",
    ).toBe(false);
  });

  test("exclude-if naming a DIFFERENT version still renders", () => {
    expect(
      has("MARKER_GATE_EXCLUDE_OTHER_INCLUDED"),
      "a block gated `exclude-if=\"v2\"` did not render on the v4 tree. Without " +
        "this the suite could not tell correct gating from a shortcode that " +
        "emits nothing at all.",
    ).toBe(true);
  });
});

test.describe("linkVersion divergence: fixture and source contract", () => {
  test("the fixture actually declares a divergent entry", () => {
    test.skip(!IS_FIXTURE_TARGET, "hugo-oss.toml is only present in this repo");
    // Guards the coverage itself. If v4/v4-link is collapsed so the two fields
    // match again, every assertion above still passes — but it stops testing
    // anything, because canonical and slug become the same string.
    const cfg = fs.readFileSync(
      path.resolve(__dirname, "../hugo-oss.toml"),
      "utf8",
    );
    const blocks = cfg.split("[[params.versions]]").slice(1);
    const divergent = blocks.filter((b) => {
      const v = b.match(/^\s*version\s*=\s*"([^"]*)"/m)?.[1];
      const lv = b.match(/^\s*linkVersion\s*=\s*"([^"]*)"/m)?.[1];
      return v && lv && v !== lv;
    });
    expect(
      divergent.length,
      "no [[params.versions]] entry in hugo-oss.toml has version != " +
        "linkVersion. Production diverges (gme/gmg, kgw-oss, agw-oss all map " +
        "2.x -> main/latest), so without one the canonical-vs-slug distinction " +
        "is untestable and this whole spec passes vacuously.",
    ).toBeGreaterThanOrEqual(1);
  });

  test("version.html gates on both the canonical version and the linkVersion", () => {
    const SRC = path.resolve(__dirname, "../layouts/_shortcodes/version.html");
    test.skip(
      !fs.existsSync(SRC),
      "version.html not at the module-relative path (consumer build)",
    );
    const src = fs
      .readFileSync(SRC, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    expect(
      /"tokens"\s+\(slice\s+\.version\s+\.linkVersion\)/.test(src),
      "version.html no longer passes BOTH `.version` and `.linkVersion` as gate " +
        "tokens. Dropping `.version` breaks every release-numbered gate on a " +
        "/latest/ tree; dropping `.linkVersion` breaks every include-if=\"main\".",
    ).toBe(true);
  });
});
