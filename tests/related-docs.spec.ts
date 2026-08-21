import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Same guard the other config-aware specs use (version-noindex.spec.ts):
// the relatedDocs groups asserted below exist only in this repo's fixture
// configs, so a consumer run must skip rather than fail.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// site.Params.relatedDocs — other products' versions sharing this product's
// version dropdown, rendered by _partials/version-dropdown-related.html
// (desktop) and _partials/sidebar-version-related.html (mobile chips).
//
// WHY THIS EXISTS. These groups used to be ordinary site.Params.versions entries
// whose `product` differed from site.Params.currentProduct, carrying an absolute
// `url` that three readers used in place of a constructed href. Splitting them
// out (CHANGELOG [1.0.0]) fixed four things at once — duplicate linkVersions
// colliding in version-root.html, other products' versions leaking into
// flexsearch/noindex/banner/remap, ~60 inert `url` values going stale unnoticed,
// and assemble-assets.py demanding ossDir/ossBranch from entries that can never
// have them. utils/resolve-related-docs.html records the detail.
//
// The contract worth pinning is ORDER, because order is the only thing the old
// single list gave for free: everything rendered in TOML order because it was
// one list. With two keys, `position` decides the side and declaration order
// decides the rest. Nothing else in the suite would notice if that broke.
//
// Fixture setup (all 4 configs): an "Upstream fixture product" group with
// position="before", then a "Sibling fixture product" group with NO position
// (must default to after), then a "Downstream fixture product" group with an
// explicit position="after". Downstream is declared last and named to sort
// alphabetically BEFORE Sibling, so an accidental sort is visible.

const RELATED_URLS = {
  upstream: [
    "https://example.invalid/upstream/u2/",
    "https://example.invalid/upstream/u1/",
  ],
  sibling: ["https://example.invalid/sibling/s3/"],
  downstream: ["https://example.invalid/downstream/d1/"],
};

// A page that renders both the navbar dropdown and the sidebar chips.
function anyVersionedPage(): string | null {
  if (!fs.existsSync(TEST_PRODUCT_ROOT)) return null;
  for (const rel of [
    ["v2", "everything", "index.html"],
    ["v2", "index.html"],
    ["v1", "everything", "index.html"],
  ]) {
    const p = path.join(TEST_PRODUCT_ROOT, ...rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

/** Ordered hrefs of the given link class, scoped to one container. */
function hrefsIn(html: string, containerRe: RegExp, linkClass: string): string[] {
  const container = html.match(containerRe);
  if (!container) return [];
  // Quote-agnostic on the class attribute: `hugo --minify` strips quotes off
  // single-valued attributes, so a bare class= must still match.
  const linkRe = new RegExp(
    `<a\\s+href="([^"]*)"[^>]*class="?[^">]*\\b${linkClass}\\b`,
    "g",
  );
  return [...container[0].matchAll(linkRe)].map((m) => m[1]);
}

const DROPDOWN = /<ul class="version-dropdown-menu"[\s\S]*?<\/ul>/;
const CHIP_ROW = /<div class="sidebar-mobile-version-row"[^>]*>[\s\S]*?<\/div>/;

test.describe("relatedDocs render order", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's relatedDocs config");

  function dropdownHrefs(): string[] {
    const page = anyVersionedPage();
    if (!page) return [];
    return hrefsIn(fs.readFileSync(page, "utf8"), DROPDOWN, "version-dropdown-item");
  }

  test("a before-group renders above this product's own versions", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    const firstOwn = hrefs.findIndex((h) => !h.startsWith("https://example.invalid/"));
    const lastUpstream = hrefs.lastIndexOf(RELATED_URLS.upstream[1]);
    expect(firstOwn, "no own-product version link in the dropdown").toBeGreaterThan(-1);
    expect(
      lastUpstream,
      "the position=\"before\" group is missing from the dropdown entirely",
    ).toBeGreaterThan(-1);
    expect(
      lastUpstream,
      'a group declared position="before" must render ABOVE this product\'s own ' +
        "versions — only hugo-gateway.toml does this in production, and it is the " +
        "reason `position` exists at all",
    ).toBeLessThan(firstOwn);
  });

  test("a group with no position defaults to after", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    const lastOwn = hrefs.reduce(
      (acc, h, i) => (h.startsWith("https://example.invalid/") ? acc : i),
      -1,
    );
    const sibling = hrefs.indexOf(RELATED_URLS.sibling[0]);
    expect(sibling).toBeGreaterThan(-1);
    expect(
      sibling,
      "the Sibling group sets no `position`, so it must land AFTER this " +
        "product's versions. kgateway and gloo-mesh-enterprise both rely on " +
        "that default in production.",
    ).toBeGreaterThan(lastOwn);
  });

  test("two groups on the same side keep declaration order, not alphabetical", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    const sibling = hrefs.indexOf(RELATED_URLS.sibling[0]);
    const downstream = hrefs.indexOf(RELATED_URLS.downstream[0]);
    expect(sibling).toBeGreaterThan(-1);
    expect(downstream).toBeGreaterThan(-1);
    expect(
      downstream,
      '"Downstream" is declared after "Sibling" but sorts before it ' +
        "alphabetically. Rendering it first would mean the order came from a " +
        "sort rather than from TOML position, which is the whole ordering model.",
    ).toBeGreaterThan(sibling);
  });

  test("versions inside a group keep declaration order", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    const u2 = hrefs.indexOf(RELATED_URLS.upstream[0]);
    const u1 = hrefs.indexOf(RELATED_URLS.upstream[1]);
    expect(u2).toBeGreaterThan(-1);
    expect(u1).toBeGreaterThan(u2);
  });

  test("a whitespace label hides a related version silently", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    // The Sibling group's s2 entry has label = "   ".
    expect(
      hrefs,
      "a whitespace `label` is the same deliberate hide that a whitespace " +
        "`dropdown` performs on this product's own versions, so the entry must " +
        "not be rendered at all",
    ).not.toContain("https://example.invalid/sibling/s2/");
  });

  test("a related version with no label key is skipped", () => {
    const hrefs = dropdownHrefs();
    test.skip(hrefs.length === 0, "no built dropdown on this target");
    // Present in hugo-oss.toml only; absent on the enterprise brand, where the
    // assertion is trivially true and still correct.
    expect(hrefs).not.toContain("https://example.invalid/sibling/s1/");
  });

  test("an empty group renders no header and no links", () => {
    const page = anyVersionedPage();
    test.skip(page === null, "no built page on this target");
    const html = fs.readFileSync(page!, "utf8");
    const dd = html.match(DROPDOWN);
    test.skip(!dd, "no built dropdown on this target");
    expect(
      dd![0],
      "a params.relatedDocs group with no `versions` must render nothing — a " +
        "bare header with no links under it is worse than omitting the group",
    ).not.toContain("Empty fixture product");
  });
});

test.describe("relatedDocs parity between desktop dropdown and mobile chips", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's relatedDocs config");

  test("the chips offer the same related destinations, in the same order", () => {
    const page = anyVersionedPage();
    test.skip(page === null, "no built page on this target");
    const html = fs.readFileSync(page!, "utf8");
    const dd = hrefsIn(html, DROPDOWN, "version-dropdown-item").filter((h) =>
      h.startsWith("https://example.invalid/"),
    );
    const chips = hrefsIn(html, CHIP_ROW, "sidebar-mobile-version-link").filter((h) =>
      h.startsWith("https://example.invalid/"),
    );
    test.skip(dd.length === 0 && chips.length === 0, "neither list built");
    expect(
      chips,
      "the mobile version chips and the desktop version dropdown are built by " +
        "separate templates and must land on identical destinations — a reader " +
        "switching products on a phone otherwise gets different links than on a " +
        "laptop. static.spec.ts asserts the same for this product's own versions.",
    ).toEqual(dd);
  });

  test("no related chip is marked active", () => {
    const page = anyVersionedPage();
    test.skip(page === null, "no built page on this target");
    const html = fs.readFileSync(page!, "utf8");
    const row = html.match(CHIP_ROW);
    test.skip(!row, "no built chip row on this target");
    // Pair each external href with whether its <a> carries the active class.
    const anchors = [
      ...row![0].matchAll(/<a\s+href="([^"]*)"[^>]*class="?([^">]*)"?/g),
    ];
    const activeExternal = anchors
      .filter(
        ([, href, cls]) =>
          href.startsWith("https://example.invalid/") &&
          /\bsidebar-mobile-version-active\b/.test(cls),
      )
      .map(([, href]) => href);
    expect(
      activeExternal,
      "the active chip is the page's own version, which by definition belongs " +
        "to this product — a related product's chip can never be active",
    ).toEqual([]);
  });
});

// Source-level contract. Cheap, and runs against a consumer target too.
test.describe("relatedDocs source contract", () => {
  const P = path.resolve(__dirname, "../layouts/_partials");
  const files = {
    resolver: path.join(P, "utils/resolve-related-docs.html"),
    dropdown: path.join(P, "version-dropdown-related.html"),
    chips: path.join(P, "sidebar-version-related.html"),
    navbar: path.join(P, "navbar.html"),
  };

  function activeSrc(file: string): string {
    return fs
      .readFileSync(file, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
  }

  test('"after" is the default position', () => {
    test.skip(!fs.existsSync(files.resolver), "module-relative path only");
    const src = activeSrc(files.resolver);
    expect(
      /\.position \| default "after"/.test(src),
      'the default must be "after": only hugo-gateway.toml wants a group above ' +
        "its own versions, so making \"before\" the default would silently " +
        "reorder kgateway and gloo-mesh-enterprise",
    ).toBe(true);
  });

  test("the resolver does not sort — order is TOML order", () => {
    test.skip(!fs.existsSync(files.resolver), "module-relative path only");
    const src = activeSrc(files.resolver);
    expect(
      /\b(?:sort|sortBy)\b/.test(src),
      "sorting would replace the documented ordering model (move the TOML " +
        "blocks to reorder the dropdown) with an implicit one",
    ).toBe(false);
  });

  test("the version readers no longer branch on same-vs-cross product", () => {
    for (const [name, file] of Object.entries(files)) {
      if (name === "resolver") continue;
      test.skip(!fs.existsSync(file), "module-relative path only");
      const src = activeSrc(file);
      expect(
        /isSameProduct|sameProduct/.test(src),
        `${path.basename(file)} still branches on same-vs-cross product. ` +
          "site.Params.versions holds only this product's versions now; a " +
          "cross-product entry there is what caused the duplicate-linkVersion " +
          "collision and the phantom versions.",
      ).toBe(false);
    }
  });

  test("both renderers apply the same skip rules", () => {
    test.skip(!fs.existsSync(files.dropdown), "module-relative path only");
    for (const file of [files.dropdown, files.chips]) {
      const src = activeSrc(file);
      expect(
        /isset \. "label"/.test(src),
        `${path.basename(file)} must distinguish a MISSING label (config error) ` +
          "from a whitespace one (deliberate hide) — and both renderers must " +
          "agree, or the parity assertion above fails for a reason that looks " +
          "unrelated",
      ).toBe(true);
      expect(/\.url/.test(src), `${path.basename(file)} must require a url`).toBe(
        true,
      );
    }
  });
});
