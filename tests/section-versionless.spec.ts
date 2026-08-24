import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// SECTIONS ON A VERSION-LESS SITE.
//
// Every other fixture build in this repo is versioned, so until this spec
// existed nothing exercised the shape kagent ships: two parallel doc sets
// registered under params.sections with NO params.versions at all. Four
// partials have dedicated code paths for it and none were reachable from the
// versioned fixture —
//
//   utils/section-segment.html     positional condition (c): a registered key
//                                  one segment below the docs root is a
//                                  section, since no version ever follows it
//   utils/resolve-sections.html    no version to append to the href; the
//                                  "registered but nests no version tree"
//                                  warning is vacuous and must not fire
//   _partials/navbar.html          the `else` of `with $navVersions` — there is
//                                  no version dropdown, but there IS a selector
//   partials/sidebar.html          the version-less branch roots at the SECTION,
//                                  and the section landing keeps its nav
//
// WHY THIS SPEC READS ITS OWN BUILD. The harness target (DOCS_TEST_CONFIG) is
// the versioned fixture, and it has to stay that way — a second harness target
// would mean a second .docs-test TOML, a second playwright project and a second
// CI leg to exercise four code paths. Instead `make build-flat` emits
// public-flat/ alongside the branded builds and this spec reads it directly.
// The cost is that target.builtRoot is unused here; the benefit is that the
// ~1950 existing assertions are untouched.
//
// Skips wholesale when public-flat/ is absent, which is the case for every
// consumer running this suite against its own build.

const FLAT_ROOT = path.resolve(__dirname, "..", "public-flat");
const FLAT_LOG = path.resolve(__dirname, "..", ".build-flat.log");
const FLAT_CONFIG = path.resolve(__dirname, "..", "hugo-flat.toml");
const HAS_FLAT = fs.existsSync(FLAT_ROOT);
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

function page(rel: string): string {
  return fs.readFileSync(path.join(FLAT_ROOT, rel, "index.html"), "utf8");
}

// The sidebar tree, scoped to the <nav>. NOT the enclosing <aside>: that also
// holds the mobile section chip row, whose <a> tags would be counted as tree
// links and would mask a tree that is empty or wrongly rooted. This is the same
// mistake tests/section-nested-versions.spec.ts documents.
function navLinks(html: string): string[] {
  const nav = html.match(/<nav class="sidebar-nav"[\s\S]*?<\/nav>/);
  if (!nav) return [];
  return [...nav[0].matchAll(/<a href="([^"]+)"\s+class="sidebar-link/g)].map(
    (m) => m[1],
  );
}

type Item = {
  href: string;
  label: string;
  active: boolean;
  // How the icon was rendered, which is the only way to tell WHICH of
  // utils/render-icon.html's four branches produced it:
  //   "svg:<data-fixture-icon>"  branch 1 or 2, from a fixture SVG that
  //                              self-identifies which directory it came from
  //   "svg:data-icon"            branch 3 — a site.Data.icons entry, which has
  //                              no data-fixture-icon marker
  //   "ligature:<text>"          branch 4
  //   null                       no icon
  icon: string | null;
};

function dropdownItems(html: string): Item[] {
  const box = html.match(/<ul class="section-dropdown-menu"[\s\S]*?<\/ul>/);
  if (!box) return [];
  return [
    ...box[0].matchAll(
      /<a href="([^"]+)" class="section-dropdown-item([^"]*)"[^>]*>([\s\S]*?)<\/a>/g,
    ),
  ].map((m) => {
    const inner = m[3];
    // The label is wrapped in .section-dropdown-label ONLY when an icon is
    // present, so read both forms — the unwrapped one is what every existing
    // consumer emits and must keep emitting.
    const wrapped = inner.match(
      /<span class="section-dropdown-label">([\s\S]*?)<\/span>/,
    );
    return {
      href: m[1],
      active: m[2].includes("section-dropdown-item-active"),
      label: (wrapped ? wrapped[1] : inner).replace(/<[^>]*>/g, "").trim(),
      icon: iconKind(inner),
    };
  });
}

function iconKind(inner: string): string | null {
  if (/<svg/.test(inner)) {
    const marker = inner.match(/data-fixture-icon="([^"]+)"/);
    return `svg:${marker ? marker[1] : "data-icon"}`;
  }
  const lig = inner.match(/<i class="material-icons [^"]*"[^>]*>([^<]*)<\/i>/);
  return lig ? `ligature:${lig[1].trim()}` : null;
}

test.describe("version-less sections: build health", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  test("the config declares no versions", () => {
    // Guard the guard. Every assertion below is only meaningful while this
    // build has no params.versions; one entry silently moves it onto the
    // versioned code paths and the rest of this file would still pass.
    const toml = fs.readFileSync(FLAT_CONFIG, "utf8");
    expect(toml).not.toMatch(/^\s*\[\[params\.versions\]\]/m);
  });

  test("the config registers exactly the four expected sections", () => {
    // One per utils/render-icon.html branch — see hugo-flat.toml. If a section
    // is added or removed without updating this, the icon-source coverage below
    // silently stops covering one branch.
    const toml = fs.readFileSync(FLAT_CONFIG, "utf8");
    const keys = [
      ...toml.matchAll(/^\s*\[params\.sections\.([a-z0-9-]+)\]/gm),
    ].map((m) => m[1]);
    expect(keys.sort()).toEqual(["alpha", "beta", "delta", "gamma"]);
  });

  test("the build emits no section warnings", () => {
    // A version-less site trivially "nests no version tree" for every section,
    // so utils/resolve-sections.html would report all of them on every build
    // without its version-less guard — and hugo-warnings.spec.ts fails a
    // consumer's CI on any non-allowlisted WARN.
    const log = fs.existsSync(FLAT_LOG) ? fs.readFileSync(FLAT_LOG, "utf8") : "";
    const offenders = log
      .split("\n")
      .filter((l) => l.includes("WARN"))
      .filter((l) => l.includes("params.sections"));
    expect(offenders, offenders.join("\n")).toEqual([]);
  });
});

test.describe("version-less sections: navbar selector", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  test("renders a section dropdown despite there being no version dropdown", () => {
    const html = page("alpha/first");
    expect(html).toContain('class="section-dropdown"');
    // The selector must NOT drag a version dropdown along with it: the `else`
    // branch that renders it exists precisely because there are no versions.
    expect(html).not.toContain('class="version-dropdown"');
  });

  test("offers both sections, pointing at their landing pages", () => {
    // No version segment is appended. On a versioned site each href carries one;
    // here $currentVersion is "" so the href stays on the landing page. A
    // regression that appended a version would emit /docs/alpha/<something>/,
    // which was never built.
    const items = dropdownItems(page("alpha/first"));
    expect(items.map((i) => i.href)).toEqual([
      "/docs/alpha/",
      "/docs/beta/",
      "/docs/delta/",
      "/docs/gamma/",
    ]);
  });

  test("labels come from the landing title and from the registry override", () => {
    // Both label sources in one assertion, because they are separate branches
    // in utils/resolve-sections.html: `alpha` has no registry `title` so it
    // falls back to its landing page's title, while `beta`'s landing page is
    // deliberately titled "Beta landing title that must not be used" and the
    // registry overrides it with "Beta docs".
    const items = dropdownItems(page("alpha/first"));
    expect(items.map((i) => i.label)).toEqual([
      "Alpha",
      "Beta docs",
      "Delta",
      "Gamma",
    ]);
  });

  test("marks the current section active, on both sides", () => {
    expect(
      dropdownItems(page("alpha/first")).filter((i) => i.active).map((i) => i.href),
    ).toEqual(["/docs/alpha/"]);
    expect(
      dropdownItems(page("beta/first")).filter((i) => i.active).map((i) => i.href),
    ).toEqual(["/docs/beta/"]);
  });

  test("the mobile chips and the dropdown agree on destinations", () => {
    // components/section-dropdown.html and components/sidebar-section-row.html
    // both read utils/resolve-sections.html for exactly this reason. They were
    // two inline copies before, and they drifted.
    const html = page("alpha/first");
    const chipRow = html.match(
      /<div class="sidebar-mobile-section-row">[\s\S]*?<\/div>/,
    );
    expect(chipRow, "no mobile section chip row").not.toBeNull();
    const chips = [
      ...chipRow![0].matchAll(/<a href="([^"]+)"/g),
    ].map((m) => m[1]);
    expect(chips).toEqual(dropdownItems(html).map((i) => i.href));
  });
});

test.describe("section icons: every source resolves", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  // utils/render-icon.html resolves an icon four ways, and before this fixture
  // existed only the LAST had coverage anywhere in the repo — one
  // `icon: rocket_launch` page in the versioned fixture — even though the same
  // resolution runs for every icon in the left nav and on every auto-generated
  // section card. Each section pins one branch; see hugo-flat.toml.
  //
  // The two fixture SVGs carry data-fixture-icon so these assertions can tell
  // WHICH branch produced the markup. Without that, branches 1, 2 and 3 are
  // indistinguishable — they all emit an <svg> — and a resolution-order bug
  // (say, assets shadowing static) would pass unnoticed.
  const EXPECTED: Record<string, string> = {
    "/docs/alpha/": "svg:static-alpha", // branch 1 — static/
    "/docs/beta/": "svg:assets-beta", // branch 2 — assets/  (new)
    "/docs/gamma/": "svg:data-icon", // branch 3 — site.Data.icons
    "/docs/delta/": "ligature:rocket_launch", // branch 4 — Material Icons
  };

  for (const [href, kind] of Object.entries(EXPECTED)) {
    test(`${href} renders ${kind}`, () => {
      const item = dropdownItems(page("alpha/first")).find(
        (i) => i.href === href,
      );
      expect(item, `no selector entry for ${href}`).toBeDefined();
      expect(item!.icon).toBe(kind);
    });
  }

  test("static/ wins over assets/ for the same value", () => {
    // Resolution order is documented and load-bearing: every call site had the
    // static branch first before extraction, so putting assets ahead of it would
    // silently change which file a consumer's existing `icon:` value picks up.
    // Asserted at SOURCE level because covering it behaviorally needs the same
    // filename in both directories, and a fixture that ships a deliberate
    // duplicate is a trap for the next person.
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "layouts/_partials/utils/render-icon.html"),
      "utf8",
    );
    // Anchored on the template EXPRESSIONS, not on the words: the header comment
    // above the code names both mechanisms in prose, and matching that made this
    // test compare two positions inside the comment. Assert the comment is not
    // what was found, too, so the same mistake cannot come back quietly.
    const staticAt = src.indexOf("(fileExists $staticPath)");
    const assetsAt = src.indexOf("$asset = resources.Get");
    expect(staticAt, "static branch expression not found").toBeGreaterThan(-1);
    expect(assetsAt, "assets branch expression not found").toBeGreaterThan(-1);
    expect(staticAt).toBeLessThan(assetsAt);
    const codeStart = src.indexOf("{{- $icon := .icon");
    expect(staticAt).toBeGreaterThan(codeStart);
  });

  test("the data-icon branch stays guarded against an unknown name", () => {
    // Hextra's utils/icon.html calls errorf on an unknown name, which ABORTS the
    // build. Every pre-extraction copy guarded it with `index site.Data.icons .`
    // first; losing that guard in the extraction would turn any typo'd icon
    // value into a failed build instead of a Material Icons fallback.
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "layouts/_partials/utils/render-icon.html"),
      "utf8",
    );
    expect(src).toMatch(/else if index site\.Data\.icons \.\s*-\}\}/);
  });

  test("the mobile chips carry the same icons as the dropdown", () => {
    const html = page("alpha/first");
    const row = html.match(
      /<div class="sidebar-mobile-section-row">[\s\S]*?<\/div>/,
    );
    expect(row, "no mobile section chip row").not.toBeNull();
    const chips = [
      ...row![0].matchAll(/<a href="([^"]+)"[\s\S]*?(?=<a href=|$)/g),
    ].map((m) => ({ href: m[1], icon: iconKind(m[0]) }));
    // Same set, same branch per entry. The chips and the dropdown are separate
    // components reading one resolver precisely so this holds.
    expect(
      Object.fromEntries(chips.map((c) => [c.href, c.icon])),
    ).toEqual(EXPECTED);
  });

  test("an icon-less section emits no icon and no label wrapper", () => {
    // The VERSIONED fixture's sections set no icons, which is what every current
    // consumer looks like. Its selector markup must be exactly what it was before
    // icons existed — no empty <span class="section-dropdown-label">, no stray
    // element to pick up the flex gap.
    test.skip(!IS_FIXTURE_TARGET, "reads the bundled versioned fixture");
    const f = path.join(target.productRoot, "v2", "everything", "index.html");
    test.skip(!fs.existsSync(f), "no versioned fixture page in this build");
    const html = fs.readFileSync(f, "utf8");
    const items = dropdownItems(html);
    expect(items.length, "versioned fixture should offer sections").toBeGreaterThan(1);
    expect(items.map((i) => i.icon)).toEqual(items.map(() => null));
    expect(html).not.toContain("section-dropdown-label");
    expect(html).not.toContain("section-dropdown-icon");
  });
});

test.describe("version-less sections: sidebar rooting", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  test("the tree is rooted at the current section, not at the site home", () => {
    // THE central assertion. extras' version-less fallback roots at site.Home
    // whenever the home page is type `docs` — which a cascade commonly makes
    // true — and that renders every doc set merged onto every page. Measured on
    // kagent before this change: 202 links per page instead of 158/40.
    const alpha = navLinks(page("alpha/first"));
    const beta = navLinks(page("beta/first"));
    expect(alpha).toEqual([
      "/docs/alpha/first/",
      "/docs/alpha/group/",
      "/docs/alpha/group/child/",
      "/docs/alpha/beta/",
    ]);
    expect(beta).toEqual(["/docs/beta/first/"]);
    // Stated separately from the equality above so the failure message says
    // "the trees are merged" rather than just showing two long arrays.
    expect(
      alpha.filter((h) => h.startsWith("/docs/beta/")),
      "beta pages leaked into the alpha tree — rooted at site.Home, not the section",
    ).toEqual([]);
  });

  test("nesting is not truncated at the section root", () => {
    expect(navLinks(page("alpha/first"))).toContain("/docs/alpha/group/child/");
  });

  test("the section landing keeps its nav", () => {
    // Suppressing the nav on a section landing is right when that page is a
    // version PICKER. With no versions the landing is the doc set's front page
    // and owns the tree below it, so suppressing there would strip the nav from
    // the most-visited page in each section.
    expect(navLinks(page("alpha")).length).toBeGreaterThan(0);
    expect(navLinks(page("beta")).length).toBeGreaterThan(0);
  });

  test("the site home still has no tree", () => {
    // Unchanged behavior, asserted so the landing-page carve-out above cannot
    // quietly widen to the docs index, which has no single tree to show.
    expect(navLinks(page(""))).toEqual([]);
  });
});

test.describe("version-less sections: detection is positional", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  test("a directory named after a registered section, below one, is content", () => {
    // /docs/alpha/beta/ shares a name with the registered `beta` section but
    // sits below `alpha`. Matching a registered key ANYWHERE in the path is the
    // bug that emptied the left nav on five live hub pages (see
    // utils/section-segment.html); the version-less branch must not reintroduce
    // it. If `beta` were matched here the page would root at the beta tree.
    //
    // NOTE this case alone does NOT discriminate between a positional
    // implementation and a match-anywhere one — `alpha` appears FIRST in this
    // path and the resolver stops at its first match either way. Verified by
    // probe: replacing the positional test with "always accept" left all of
    // these green. The test below is the one that actually pins it, and this one
    // is kept for the first-match-wins ordering it does cover.
    const links = navLinks(page("alpha/beta"));
    expect(links).toEqual(navLinks(page("alpha/first")));
    expect(links).not.toContain("/docs/beta/first/");
  });

  test("the collision page reports alpha as the active section", () => {
    expect(
      dropdownItems(page("alpha/beta")).filter((i) => i.active).map((i) => i.href),
    ).toEqual(["/docs/alpha/"]);
  });

  test("a section name below a NON-section directory is not a section", () => {
    // THE DISCRIMINATING CASE, and it caught a real bug. /docs/topics/alpha/:
    // `topics` is not registered, `alpha` is, and `alpha` is the LAST segment.
    //
    // Pre-existing condition (b) in utils/section-segment.html accepts "last
    // segment, and no version precedes it". On a versioned site the second half
    // does the work — nearly every content page sits under a version, so a
    // trailing section-named segment is rejected. On a VERSION-LESS site nothing
    // ever has a version before it, so (b) accepted a registered name at any
    // depth purely for being last: this page resolved to section `alpha` and
    // rendered the alpha tree while belonging to neither doc set.
    //
    // The fix is that a version-less site uses the positional test ALONE, so
    // this page resolves to NO section. It then hits the orphan-suppression
    // branch (see the describe block below) and gets no tree — which is also
    // what distinguishes it from the alpha tree.
    const links = navLinks(page("topics/alpha"));
    expect(links).not.toEqual(navLinks(page("alpha/first")));
    expect(links).toEqual([]);
    expect(
      dropdownItems(page("topics/alpha")).filter((i) => i.active),
      "a page in no doc set must not mark one active",
    ).toEqual([]);
  });
});

test.describe("version-less sections: pages in no doc set", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  // Taxonomy terms and any top-level directory that is not a registered section
  // belong to no doc set. The version-less fallback's default root is site.Home
  // whenever the home page is type `docs`, so without a carve-out these pages
  // render EVERY doc set merged. Measured on kagent: a bare /docs/tags/ page grew
  // a 101-link tree spanning both kagent and kmcp, where the sidebar override it
  // replaced had shown none. The versioned path already suppresses the nav for a
  // page above the version trees; this is the same rule.
  for (const orphan of ["tags", "categories", "topics/alpha"]) {
    test(`/${orphan}/ renders no tree`, () => {
      expect(navLinks(page(orphan))).toEqual([]);
    });

    test(`/${orphan}/ renders no section chips`, () => {
      // The chip row lives inside the panel that suppression removes. Asserted
      // separately because a future refactor could hoist the chips out of the
      // panel and reintroduce a half-rendered drawer on these pages.
      expect(page(orphan)).not.toContain("sidebar-mobile-section-row");
    });
  }

  test("a section page still renders its tree", () => {
    // Guards the suppression from widening: it must key off "no section
    // resolved", not off anything the section pages also satisfy.
    expect(navLinks(page("alpha/first")).length).toBeGreaterThan(0);
    expect(navLinks(page("beta/first")).length).toBeGreaterThan(0);
  });
});

test.describe("version-less sections: versioned builds are unaffected", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "asserts the bundled VERSIONED fixture's behavior",
  );

  test("a non-versioned page in a versioned site gains no section chips", () => {
    // The version-less sidebar work is gated on `not site.Params.versions`
    // rather than on this page being outside a version tree. Without that gate
    // the versioned fixture's /test/tags/, /test/categories/, /test/flatguide/
    // and /test/hextra-include-target/ all grew a section chip row — four pages
    // of unrequested change per brand, and the same class of change on every
    // hub product.
    const f = path.join(target.productRoot, "tags", "index.html");
    test.skip(!fs.existsSync(f), "no taxonomy page in this build");
    expect(fs.readFileSync(f, "utf8")).not.toContain(
      "sidebar-mobile-section-row",
    );
  });
});

test.describe("section icons: emitted svg hygiene", () => {
  test.skip(!HAS_FLAT, "needs `make build-flat` (public-flat/)");

  test("no icon carries a duplicate aria-hidden", () => {
    // utils/render-icon.html injects `aria-hidden="true"` into the opening <svg>.
    // A source SVG that already declares it then carried the attribute twice —
    // valid enough for browsers, which take the first, but an HTML-validation
    // failure and a trap: the obvious "fix" is to stop injecting, which would
    // unhide every icon from screen readers. Surfaced by kagent's
    // assets/icons/nav-*.svg, which declare it; no consumer's SVGs do.
    for (const p of ["alpha/first", "beta/first"]) {
      const html = page(p);
      for (const tag of html.match(/<svg[^>]*>/g) ?? []) {
        const count = (tag.match(/aria-hidden=/g) ?? []).length;
        expect(count, `duplicate aria-hidden in ${p}: ${tag}`).toBeLessThan(2);
      }
    }
  });

  test("the injected aria-hidden is still present", () => {
    // Guards the strip above from over-reaching: it must remove the source's
    // copy, not the injected one.
    const html = page("alpha/first");
    const iconTag = html.match(/<svg class="section-dropdown-icon"[^>]*>/);
    expect(iconTag, "no section-dropdown-icon svg").not.toBeNull();
    expect(iconTag![0]).toContain('aria-hidden="true"');
  });
});
