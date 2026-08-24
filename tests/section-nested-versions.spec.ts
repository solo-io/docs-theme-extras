import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// The section-then-version URL shape — /<product>/<section>/<version>/… — which
// is what the tagged-versions release exists for, and which had NO behavioral
// coverage at all until this fixture section was added.
//
// WHY THIS EXISTS. `demo` and `alt` register sections WITHOUT nesting version
// trees under them: their versions live at /test/<version>/. That pins the
// fallback half (a section link must point at the landing page, because
// /test/demo/v2/ was never built) and it is the only half the fixture had. Every
// positive behavior was pinned by SOURCE assertions reading template text:
//
//   version-root.html prefixing lookupPath with the section
//   resolve-sections.html appending a version to a section href
//   breadcrumb.html collapsing a version at depth 3
//   resolve-section-versions.html filtering by tag
//
// Source assertions cannot see a wrong ANSWER, only changed text. The worst
// failure mode here is silent: if `lookupPath` loses the section segment,
// `site.GetPage` resolves nothing, the left nav renders EMPTY, the page still
// builds, and it reads as a content problem rather than a template one.
//
// The `nested` section closes that. The fixture's contentDir is
// `fixture/content/en/test` with `baseURL = /test`, which reproduces the
// production enterprise shape exactly: the product segment is in the URL and NOT
// in the GetPage path, so /test/nested/v2/page/ resolves through
// `GetPage "/nested/v2/"` — the same two-coordinate translation the docs hub
// does.
//
// WHAT IT CAUGHT IMMEDIATELY. Two dead links in the version dropdown and the
// mobile chips. An UNTAGGED params.versions entry applies to every section by
// definition, so `nested` was offered v3 and v4-link and emitted
// /test/nested/v3/ and /test/nested/v4-link/ — neither built. Both navbar.html
// and sidebar.html carried a comment asserting the version landing page "always
// exists", which is true only without sections. See the last two tests.
//
// Fixture: `nested` is tagged on v2 and v1, not on `main` (alt-only). Trees
// exist for v2 and v1 only; v3/v4-link/v8-link are untagged and therefore apply
// here with no tree behind them.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const V2 = "nested/v2/page/index.html";
const V1 = "nested/v1/page/index.html";

function read(rel: string): string | null {
  const f = path.join(TEST_PRODUCT_ROOT, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

/** Internal hrefs from the desktop version dropdown, in order. */
function versionLinks(html: string): { href: string; label: string }[] {
  const menu = html.match(/<ul class="version-dropdown-menu"[\s\S]*?<\/ul>/);
  if (!menu) return [];
  return [
    ...menu[0].matchAll(
      /<a href="([^"]*)"[^>]*class="(?:version-dropdown-item[^"]*)"[^>]*>\s*([^<]*)/g,
    ),
  ]
    .map((m) => ({ href: m[1], label: m[2].trim() }))
    .filter((l) => l.href.startsWith("/"));
}

/** Hrefs from the mobile version chip row, in order. */
function chipLinks(html: string): string[] {
  const row = html.match(/<div class="sidebar-mobile-version-row"[\s\S]*?<\/div>/);
  if (!row) return [];
  return [...row[0].matchAll(/<a href="([^"]*)"/g)].map((m) => m[1]);
}

function sectionItems(html: string): { href: string; label: string; active: boolean }[] {
  const box = html.match(/<div class="section-dropdown">[\s\S]*?<\/ul>\s*<\/div>/);
  if (!box) return [];
  return [
    ...box[0].matchAll(
      /<a href="([^"]*)" class="(section-dropdown-item[^"]*)"[^>]*>\s*([^<]*)</g,
    ),
  ].map((m) => ({
    href: m[1],
    label: m[3].trim(),
    active: /section-dropdown-item-active/.test(m[2]),
  }));
}

/** Resolve a site-absolute href to its built index.html. */
function onDisk(href: string): boolean {
  const rel = href.replace(/^\/test\//, "").replace(/\/$/, "");
  return fs.existsSync(path.join(TEST_PRODUCT_ROOT, rel, "index.html"));
}

test.describe("section-nested version trees", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's `nested` section");

  test("the nested tree built at all", () => {
    for (const p of [V2, V1, "nested/index.html", "nested/v2/index.html"]) {
      expect(read(p), `${p} was not built — the rest of this spec is vacuous`).not.toBeNull();
    }
  });

  // THE one that matters most: an empty left nav is silent.
  //
  // Scoped to the sidebar <nav>, NOT the enclosing <aside>. The <aside> also
  // holds the mobile version chips and the section chip row, which link into
  // /test/nested/… on their own — so an <aside>-wide search still finds
  // /test/nested/v2/page/ with the page TREE completely empty, and the test
  // passes while the bug it names is live. Verified by probe: replacing
  // version-root.html's `lookupPath` with a section-less one empties the tree
  // (0 links) and this assertion now fails, where the <aside> version did not.
  test("the left nav resolves through the section segment and is not empty", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const nav = html!.match(/<nav[^>]*sidebar[\s\S]*?<\/nav>/);
    expect(nav, "no sidebar nav rendered").not.toBeNull();
    const tree = [
      ...nav![0].matchAll(/href="(\/test\/nested\/v2\/[^"]*)"/g),
    ].map((m) => m[1]);
    expect(
      tree.length,
      "the left nav has no links into this version tree. That is what a " +
        "`lookupPath` missing its section segment looks like: `site.GetPage` " +
        "resolves nothing, the tree renders empty, and nothing errors.",
    ).toBeGreaterThan(0);
    expect(
      tree,
      "the nav must list the leaf page of THIS version tree",
    ).toContain("/test/nested/v2/page/");
  });

  test("the nav tree does not leak pages from another version of the section", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    // Scoped to the nav tree, not the whole <aside>: the mobile version chips
    // legitimately link to /test/nested/v1/… and share that container.
    const nav = html!.match(/<nav[^>]*sidebar[\s\S]*?<\/nav>/);
    test.skip(!nav, "no sidebar nav element");
    const v1Links = [...nav![0].matchAll(/href="(\/test\/nested\/v1\/[^"]*)"/g)];
    expect(
      v1Links.map((m) => m[1]),
      "the version tree filter (hasPrefix on versionPrefix) is not scoping to " +
        "this version — v1 pages appear in the v2 tree",
    ).toEqual([]);
  });

  test("the section selector appends the version for a section that nests", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const items = sectionItems(html!);
    const nested = items.find((i) => i.label === "Nested");
    expect(nested, "the `nested` section is missing from the selector").toBeTruthy();
    expect(
      nested!.href,
      "a section that DOES nest its versions must keep the reader at the same " +
        "version, not drop them on the section splash",
    ).toBe("/test/nested/v2/");
    expect(nested!.active, "the current section must be marked active").toBe(true);
    // ...while the two sections that do NOT nest still fall back, so both
    // branches of the resolver are covered by one page.
    for (const label of ["Demo", "Alt"]) {
      const other = items.find((i) => i.label === label);
      expect(other, `${label} missing from the selector`).toBeTruthy();
      expect(
        other!.href,
        `${label} does not nest version trees, so its link must be the ` +
          "landing page — appending a version emits a page that was never built",
      ).toBe(`/test/${label.toLowerCase()}/`);
    }
    for (const i of items) {
      expect(onDisk(i.href), `section link ${i.href} has no page on disk`).toBe(true);
    }
  });

  test("a section link remaps when the current version does not exist there", () => {
    // v1 is tagged ["demo", "nested"], so `alt` has no v1. Reusing the current
    // version verbatim would point at /test/alt/v1/, which does not exist. This
    // is the remap that had been DEAD CODE since the tagged-versions migration —
    // it read site.Params.sections.<key>.versions, which that release removed —
    // and no behavioral test could see it, because no section nested anything.
    const html = read(V1);
    test.skip(html === null, "page not built");
    const alt = sectionItems(html!).find((i) => i.label === "Alt");
    expect(alt).toBeTruthy();
    expect(
      alt!.href,
      "the section link reused v1, which does not exist in `alt`",
    ).not.toBe("/test/alt/v1/");
    expect(onDisk(alt!.href)).toBe(true);
  });

  test("the version dropdown is filtered to this section's tags", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const labels = versionLinks(html!).map((l) => l.label);
    expect(labels, "v2 is tagged for `nested` and must be offered").toContain("v2 (current)");
    expect(labels, "v1 is tagged for `nested` and must be offered").toContain("v1");
    expect(
      labels,
      "`main` is tagged sections=[\"alt\"], so offering it here would send the " +
        "reader to /test/nested/main/, which does not exist",
    ).not.toContain("main (dev)");
  });

  test("switching version preserves the path within the section", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const v1 = versionLinks(html!).find((l) => l.label === "v1");
    expect(v1).toBeTruthy();
    expect(
      v1!.href,
      "the switch must keep both the section and the path below the version — " +
        "dropping either lands the reader somewhere else entirely",
    ).toBe("/test/nested/v1/page/");
  });

  // The regression this fixture caught on its first build.
  test("no version link points at a tree the section does not have", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    for (const l of versionLinks(html!)) {
      expect(
        onDisk(l.href),
        `version link ${l.href} (${l.label}) has no page on disk. An UNTAGGED ` +
          "params.versions entry applies to EVERY section, so a section with no " +
          "tree for it is still offered it — navbar.html must verify the target " +
          "version's landing page exists instead of assuming it does, and fall " +
          "back to the section root.",
      ).toBe(true);
    }
  });

  test("the mobile chips and the desktop dropdown land on the same places", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const chips = chipLinks(html!).filter((h) => h.startsWith("/"));
    expect(
      chips,
      "the drawer and the navbar are separate templates; the dead-link guard " +
        "above has to be in BOTH or a phone goes somewhere a laptop does not",
    ).toEqual(versionLinks(html!).map((l) => l.href));
  });

  test("the breadcrumb shows the section between home and the version", () => {
    const html = read(V2);
    test.skip(html === null, "page not built");
    const nav = html!.match(/<nav[^>]*breadcrumb[\s\S]*?<\/nav>/);
    test.skip(!nav, "no breadcrumb rendered");
    const labels = [
      ...nav![0]
        .replace(/<svg[\s\S]*?<\/svg>/g, "")
        .matchAll(/<a [^>]*>\s*([^<]*?)\s*<\/a>|<span[^>]*>\s*([^<]*?)\s*<\/span>/g),
    ]
      .map((m) => (m[1] || m[2] || "").trim())
      .filter((l) => l && l !== "/");
    expect(
      labels[0],
      "the section is missing from the breadcrumb — the version collapse used " +
        "to be nested inside a `.Parent.IsHome` branch, so it only fired at " +
        "depth 2 and a sectioned page repeated the section instead",
    ).toBe("Nested");
    // The version label differs by brand: enterprise collapses it to the URL
    // slug (`v2`), OSS shows the version index page's own title
    // (`v2 (current)`). Both must name the version, neither may repeat "Nested".
    expect(labels[1], `second crumb was "${labels[1]}"`).toMatch(/^v2\b/);
  });
});
