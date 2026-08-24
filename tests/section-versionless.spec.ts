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
// TWO BUILDS, ONE PER HALF OF THE POSITIONAL TEST. Condition (c) accepts a
// section at either $i == $docsRootDepth (the docs root is in the baseURL —
// kagent.dev's real shape, hugo-flat.toml) or $i == depth+1 behind a literal
// docs/ content directory (home is a marketing page at "/" — hugo-flat-root.
// toml). Each build can only ever reach its own half, so both are built and
// every assertion below runs against both. They mount the SAME content and
// registry, and the docs root resolves to /docs/ either way, so rendered
// hrefs are identical between them — only the on-disk layout differs
// (public-flat-root/docs/… versus public-flat/…), which is what `prefix`
// absorbs.
//
// WHY THIS SPEC READS ITS OWN BUILDS. The harness target (DOCS_TEST_CONFIG) is
// the versioned fixture, and it has to stay that way — a second harness target
// would mean a second .docs-test TOML, a second playwright project and a second
// CI leg to exercise four code paths. Instead `make build-flat` emits
// public-flat/ and public-flat-root/ alongside the branded builds and this spec
// reads them directly. The cost is that target.builtRoot is unused here; the
// benefit is that the ~1950 existing assertions are untouched.
//
// Skips wholesale when the build dirs are absent, which is the case for every
// consumer running this suite against its own build.

type FlatBuild = {
  /** Suffix in test titles. */
  name: string;
  /** publishDir, relative to the repo root. */
  dir: string;
  /** Hugo build log captured by make build-flat. */
  log: string;
  /** The config file, for the config-level assertions. */
  config: string;
  /** Where the doc-set tree lives INSIDE the build ("" or "docs"). Taxonomy
   *  pages and the home page always sit at the build root regardless. */
  prefix: string;
  /** Build-root pages beyond "" that must also render no tree (the root-shape
   *  build has a docs index page between the home and the sections). */
  extraTreeless: string[];
};

const BUILDS: FlatBuild[] = [
  {
    name: "baseURL shape",
    dir: "public-flat",
    log: ".build-flat.log",
    config: "hugo-flat.toml",
    prefix: "",
    extraTreeless: [],
  },
  {
    name: "docs-dir shape",
    dir: "public-flat-root",
    log: ".build-flat-root.log",
    config: "hugo-flat-root.toml",
    prefix: "docs",
    extraTreeless: ["docs"],
  },
];

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

function buildRoot(b: FlatBuild): string {
  return path.resolve(__dirname, "..", b.dir);
}

function hasBuild(b: FlatBuild): boolean {
  return fs.existsSync(buildRoot(b));
}

/** A doc-set page (lives under the build's prefix). */
function page(b: FlatBuild, rel: string): string {
  return fs.readFileSync(
    path.join(buildRoot(b), b.prefix, rel, "index.html"),
    "utf8",
  );
}

/** A build-root page — the home page and taxonomy pages sit at the build root
 *  in both shapes (taxonomies are site-level, not content-tree-level). */
function rootPage(b: FlatBuild, rel: string): string {
  return fs.readFileSync(path.join(buildRoot(b), rel, "index.html"), "utf8");
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
const EXPECTED_ICONS: Record<string, string> = {
  "/docs/alpha/": "svg:static-alpha", // branch 1 — static/
  "/docs/beta/": "svg:assets-beta", // branch 2 — assets/  (new)
  "/docs/gamma/": "svg:data-icon", // branch 3 — site.Data.icons
  "/docs/delta/": "ligature:rocket_launch", // branch 4 — Material Icons
};

for (const b of BUILDS) {
  const HAS = hasBuild(b);
  const skipMsg = `needs \`make build-flat\` (${b.dir}/)`;

  test.describe(`version-less sections: build health (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    test("the config declares no versions", () => {
      // Guard the guard. Every assertion below is only meaningful while this
      // build has no params.versions; one entry silently moves it onto the
      // versioned code paths and the rest of this file would still pass.
      const toml = fs.readFileSync(
        path.resolve(__dirname, "..", b.config),
        "utf8",
      );
      expect(toml).not.toMatch(/^\s*\[\[params\.versions\]\]/m);
    });

    test("the config registers exactly the four expected sections", () => {
      // One per utils/render-icon.html branch — see hugo-flat.toml. If a
      // section is added or removed without updating this, the icon-source
      // coverage below silently stops covering one branch.
      const toml = fs.readFileSync(
        path.resolve(__dirname, "..", b.config),
        "utf8",
      );
      const keys = [
        ...toml.matchAll(/^\s*\[params\.sections\.([a-z0-9-]+)\]/gm),
      ].map((m) => m[1]);
      expect(keys.sort()).toEqual(["alpha", "beta", "delta", "gamma"]);
    });

    test("the build log exists and emits no section warnings", () => {
      // A version-less site trivially "nests no version tree" for every
      // section, so utils/resolve-sections.html would report all of them on
      // every build without its version-less guard — and hugo-warnings.spec.ts
      // fails a consumer's CI on any non-allowlisted WARN.
      //
      // The log's EXISTENCE is asserted too: an earlier version read "" when
      // the log was missing and passed vacuously while the build dir existed.
      const logPath = path.resolve(__dirname, "..", b.log);
      expect(
        fs.existsSync(logPath),
        `expected ${b.log} from make build-flat`,
      ).toBe(true);
      const log = fs.readFileSync(logPath, "utf8");
      const offenders = log
        .split("\n")
        .filter((l) => l.includes("WARN"))
        .filter((l) => l.includes("params.sections"));
      expect(offenders, offenders.join("\n")).toEqual([]);
    });
  });

  test.describe(`version-less sections: navbar selector (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    test("renders a section dropdown despite there being no version dropdown", () => {
      const html = page(b, "alpha/first");
      // Matched as a class LIST rather than an exact attribute value, because a
      // version-less build also carries the `section-dropdown-inline` modifier
      // (see "a nav-link peer, not a control" below). An exact-string assertion
      // here broke the moment that modifier was added, which is a false alarm —
      // the wrapper is still there, it just has a second class now.
      expect(html).toMatch(/class="section-dropdown(?: [^"]*)?"/);
      // The selector must NOT drag a version dropdown along with it: the `else`
      // branch that renders it exists precisely because there are no versions.
      expect(html).not.toMatch(/class="version-dropdown(?: [^"]*)?"/);
    });

    test("offers both sections, pointing at their landing pages", () => {
      // No version segment is appended. On a versioned site each href carries
      // one; here $currentVersion is "" so the href stays on the landing page.
      // A regression that appended a version would emit /docs/alpha/<something>/,
      // which was never built.
      const items = dropdownItems(page(b, "alpha/first"));
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
      const items = dropdownItems(page(b, "alpha/first"));
      expect(items.map((i) => i.label)).toEqual([
        "Alpha",
        "Beta docs",
        "Delta",
        "Gamma",
      ]);
    });

    test("marks the current section active, on both sides", () => {
      expect(
        dropdownItems(page(b, "alpha/first"))
          .filter((i) => i.active)
          .map((i) => i.href),
      ).toEqual(["/docs/alpha/"]);
      expect(
        dropdownItems(page(b, "beta/first"))
          .filter((i) => i.active)
          .map((i) => i.href),
      ).toEqual(["/docs/beta/"]);
    });

    test("the mobile chips and the dropdown agree on destinations", () => {
      // components/section-dropdown.html and components/sidebar-section-row.html
      // both read utils/resolve-sections.html for exactly this reason. They were
      // two inline copies before, and they drifted.
      const html = page(b, "alpha/first");
      const chipRow = html.match(
        /<div class="sidebar-mobile-section-row">[\s\S]*?<\/div>/,
      );
      expect(chipRow, "no mobile section chip row").not.toBeNull();
      const chips = [...chipRow![0].matchAll(/<a href="([^"]+)"/g)].map(
        (m) => m[1],
      );
      expect(chips).toEqual(dropdownItems(html).map((i) => i.href));
    });
  });

  test.describe(`section icons: every source resolves (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    for (const [href, kind] of Object.entries(EXPECTED_ICONS)) {
      test(`${href} renders ${kind}`, () => {
        const item = dropdownItems(page(b, "alpha/first")).find(
          (i) => i.href === href,
        );
        expect(item, `no selector entry for ${href}`).toBeDefined();
        expect(item!.icon).toBe(kind);
      });
    }

    test("the mobile chips carry the same icons as the dropdown", () => {
      const html = page(b, "alpha/first");
      const row = html.match(
        /<div class="sidebar-mobile-section-row">[\s\S]*?<\/div>/,
      );
      expect(row, "no mobile section chip row").not.toBeNull();
      const chips = [
        ...row![0].matchAll(/<a href="([^"]+)"[\s\S]*?(?=<a href=|$)/g),
      ].map((m) => ({ href: m[1], icon: iconKind(m[0]) }));
      // Same set, same branch per entry. The chips and the dropdown are
      // separate components reading one resolver precisely so this holds.
      expect(
        Object.fromEntries(chips.map((c) => [c.href, c.icon])),
      ).toEqual(EXPECTED_ICONS);
    });
  });

  test.describe(`version-less sections: sidebar rooting (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    test("the tree is rooted at the current section, not at the site home", () => {
      // THE central assertion. extras' version-less fallback roots at site.Home
      // whenever the home page is type `docs` — which a cascade commonly makes
      // true — and that renders every doc set merged onto every page. Measured
      // on kagent before this change: 202 links per page instead of 158/40.
      const alpha = navLinks(page(b, "alpha/first"));
      const beta = navLinks(page(b, "beta/first"));
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
      expect(navLinks(page(b, "alpha/first"))).toContain(
        "/docs/alpha/group/child/",
      );
    });

    test("the section landing keeps its nav", () => {
      // Suppressing the nav on a section landing is right when that page is a
      // version PICKER. With no versions the landing is the doc set's front
      // page and owns the tree below it, so suppressing there would strip the
      // nav from the most-visited page in each section.
      expect(navLinks(page(b, "alpha")).length).toBeGreaterThan(0);
      expect(navLinks(page(b, "beta")).length).toBeGreaterThan(0);
    });

    test("the site home still has no tree", () => {
      // Unchanged behavior, asserted so the landing-page carve-out above cannot
      // quietly widen to pages that have no single tree to show. In the
      // docs-dir shape this covers BOTH roots: the marketing home at "/" (whose
      // `cascade: type: docs` is the classic merged-tree trigger) and the docs
      // index at /docs/, which sits above every section.
      expect(navLinks(rootPage(b, ""))).toEqual([]);
      for (const rel of b.extraTreeless) {
        expect(navLinks(rootPage(b, rel)), `/${rel}/ grew a tree`).toEqual([]);
      }
    });
  });

  test.describe(`version-less sections: detection is positional (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    test("a directory named after a registered section, below one, is content", () => {
      // /docs/alpha/beta/ shares a name with the registered `beta` section but
      // sits below `alpha`. Matching a registered key ANYWHERE in the path is
      // the bug that emptied the left nav on five live hub pages (see
      // utils/section-segment.html); the version-less branch must not
      // reintroduce it. If `beta` were matched here the page would root at the
      // beta tree.
      //
      // NOTE this case alone does NOT discriminate between a positional
      // implementation and a match-anywhere one — `alpha` appears FIRST in this
      // path and the resolver stops at its first match either way. Verified by
      // probe: replacing the positional test with "always accept" left all of
      // these green. The test below is the one that actually pins it, and this
      // one is kept for the first-match-wins ordering it does cover.
      const links = navLinks(page(b, "alpha/beta"));
      expect(links).toEqual(navLinks(page(b, "alpha/first")));
      expect(links).not.toContain("/docs/beta/first/");
    });

    test("the collision page reports alpha as the active section", () => {
      expect(
        dropdownItems(page(b, "alpha/beta"))
          .filter((i) => i.active)
          .map((i) => i.href),
      ).toEqual(["/docs/alpha/"]);
    });

    test("a section name below a NON-section directory is not a section", () => {
      // THE DISCRIMINATING CASE, and it caught a real bug. /docs/topics/alpha/:
      // `topics` is not registered, `alpha` is, and `alpha` is the LAST segment.
      //
      // Pre-existing condition (b) in utils/section-segment.html accepts "last
      // segment, and no version precedes it". On a versioned site the second
      // half does the work — nearly every content page sits under a version, so
      // a trailing section-named segment is rejected. On a VERSION-LESS site
      // nothing ever has a version before it, so (b) accepted a registered name
      // at any depth purely for being last: this page resolved to section
      // `alpha` and rendered the alpha tree while belonging to neither doc set.
      //
      // The fix is that a version-less site uses the positional test ALONE, so
      // this page resolves to NO section. It then hits the orphan-suppression
      // branch (see the describe block below) and gets no tree — which is also
      // what distinguishes it from the alpha tree.
      const links = navLinks(page(b, "topics/alpha"));
      expect(links).not.toEqual(navLinks(page(b, "alpha/first")));
      expect(links).toEqual([]);
      expect(
        dropdownItems(page(b, "topics/alpha")).filter((i) => i.active),
        "a page in no doc set must not mark one active",
      ).toEqual([]);
    });
  });

  test.describe(`version-less sections: pages in no doc set (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    // Taxonomy terms and any top-level directory that is not a registered
    // section belong to no doc set. The version-less fallback's default root is
    // site.Home whenever the home page is type `docs`, so without a carve-out
    // these pages render EVERY doc set merged. Measured on kagent: a bare
    // /docs/tags/ page grew a 101-link tree spanning both kagent and kmcp,
    // where the sidebar override it replaced had shown none. The versioned path
    // already suppresses the nav for a page above the version trees; this is
    // the same rule.
    //
    // Taxonomy pages generate at the SITE root in both shapes; topics/ is
    // content and so lives under the docs prefix.
    const orphans: Array<[string, (rel: string) => string]> = [
      ["tags", (rel) => rootPage(b, rel)],
      ["categories", (rel) => rootPage(b, rel)],
      ["topics/alpha", (rel) => page(b, rel)],
    ];
    for (const [orphan, read] of orphans) {
      test(`/${orphan}/ renders no tree`, () => {
        expect(navLinks(read(orphan))).toEqual([]);
      });

      test(`/${orphan}/ renders no section chips`, () => {
        // The chip row lives inside the panel that suppression removes.
        // Asserted separately because a future refactor could hoist the chips
        // out of the panel and reintroduce a half-rendered drawer on these
        // pages.
        expect(read(orphan)).not.toContain("sidebar-mobile-section-row");
      });
    }

    test("a section page still renders its tree", () => {
      // Guards the suppression from widening: it must key off "no section
      // resolved", not off anything the section pages also satisfy.
      expect(navLinks(page(b, "alpha/first")).length).toBeGreaterThan(0);
      expect(navLinks(page(b, "beta/first")).length).toBeGreaterThan(0);
    });
  });

  test.describe(`section icons: emitted svg hygiene (${b.name})`, () => {
    test.skip(!HAS, skipMsg);

    test("no icon carries a duplicate aria-hidden", () => {
      // utils/render-icon.html injects `aria-hidden="true"` into the opening
      // <svg>. A source SVG that already declares it then carried the attribute
      // twice — valid enough for browsers, which take the first, but an
      // HTML-validation failure and a trap: the obvious "fix" is to stop
      // injecting, which would unhide every icon from screen readers. Surfaced
      // by kagent's assets/icons/nav-*.svg, which declare it; no consumer's
      // SVGs do.
      for (const p of ["alpha/first", "beta/first"]) {
        const html = page(b, p);
        for (const tag of html.match(/<svg[^>]*>/g) ?? []) {
          const count = (tag.match(/aria-hidden=/g) ?? []).length;
          expect(count, `duplicate aria-hidden in ${p}: ${tag}`).toBeLessThan(2);
        }
      }
    });

    test("the injected aria-hidden is still present", () => {
      // Guards the strip above from over-reaching: it must remove the source's
      // copy, not the injected one.
      const html = page(b, "alpha/first");
      const iconTag = html.match(/<svg class="section-dropdown-icon"[^>]*>/);
      expect(iconTag, "no section-dropdown-icon svg").not.toBeNull();
      expect(iconTag![0]).toContain('aria-hidden="true"');
    });
  });
}

// ── Build-independent assertions ─────────────────────────────────────────
// Source-level pins and versioned-fixture behavior; running these per flat
// build would just duplicate them.

test.describe("section icons: resolver source pins", () => {
  test("static/ wins over assets/ for the same value", () => {
    // Resolution order is documented and load-bearing: every call site had the
    // static branch first before extraction, so putting assets ahead of it
    // would silently change which file a consumer's existing `icon:` value
    // picks up. Asserted at SOURCE level because covering it behaviorally needs
    // the same filename in both directories, and a fixture that ships a
    // deliberate duplicate is a trap for the next person.
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "layouts/_partials/utils/render-icon.html"),
      "utf8",
    );
    // Anchored on the template EXPRESSIONS, not on the words: the header
    // comment above the code names both mechanisms in prose, and matching that
    // made this test compare two positions inside the comment. Assert the
    // comment is not what was found, too, so the same mistake cannot come back
    // quietly.
    const staticAt = src.indexOf("(fileExists $staticPath)");
    const assetsAt = src.indexOf("$asset = resources.Get");
    expect(staticAt, "static branch expression not found").toBeGreaterThan(-1);
    expect(assetsAt, "assets branch expression not found").toBeGreaterThan(-1);
    expect(staticAt).toBeLessThan(assetsAt);
    const codeStart = src.indexOf("{{- $icon := .icon");
    expect(staticAt).toBeGreaterThan(codeStart);
  });

  test("the data-icon branch stays guarded against an unknown name", () => {
    // Hextra's utils/icon.html calls errorf on an unknown name, which ABORTS
    // the build. Every pre-extraction copy guarded it with
    // `index site.Data.icons .` first; losing that guard in the extraction
    // would turn any typo'd icon value into a failed build instead of a
    // Material Icons fallback.
    const src = fs.readFileSync(
      path.resolve(__dirname, "..", "layouts/_partials/utils/render-icon.html"),
      "utf8",
    );
    expect(src).toMatch(/else if index site\.Data\.icons \.\s*-\}\}/);
  });
});

test.describe("section icons: versioned fixture stays icon-less", () => {
  test("an icon-less section emits no icon and no label wrapper", () => {
    // The VERSIONED fixture's sections set no icons, which is what every
    // current consumer looks like. Its selector markup must be exactly what it
    // was before icons existed — no empty <span class="section-dropdown-label">,
    // no stray element to pick up the flex gap.
    test.skip(!IS_FIXTURE_TARGET, "reads the bundled versioned fixture");
    const f = path.join(target.productRoot, "v2", "everything", "index.html");
    test.skip(!fs.existsSync(f), "no versioned fixture page in this build");
    const html = fs.readFileSync(f, "utf8");
    const items = dropdownItems(html);
    expect(
      items.length,
      "versioned fixture should offer sections",
    ).toBeGreaterThan(1);
    expect(items.map((i) => i.icon)).toEqual(items.map(() => null));
    expect(html).not.toContain("section-dropdown-label");
    expect(html).not.toContain("section-dropdown-icon");
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

test.describe("version dropdown: an empty section path is verified, not assumed", () => {
  // SOURCE-level guard, deliberately. The defect only reproduces on the PRODUCT
  // ROOT PAGE of a product whose version trees live entirely under sections —
  // the URL carries no section (you are above them, choosing one) while every
  // version tree sits inside one. No fixture in this repo has that shape: the
  // versioned fixture keeps version trees at its root AND registers sections, so
  // /test/<version>/ always exists and the branch is never taken. Reproducing it
  // would mean a fifth fixture build whose every version tree is section-nested.
  //
  // What it cost in production: agentgateway.dev's hub root emitted three dead
  // version-dropdown entries — /agentgateway/{latest,2026.7.1,2.3.x}/, none ever
  // built, because the trees are at /agentgateway/kubernetes/<version>/. The old
  // code short-circuited on `eq $sectionPath ""` and emitted /<version>/ without
  // checking, on the reasoning that "no section in the URL" means "this product
  // has no sections". Those are different statements.
  //
  // Same pattern as tests/link-hextra-lts-version.spec.ts, which is source-level
  // for the same reason: no fixture has an LTS tree.
  const NAVBAR = path.resolve(
    __dirname,
    "..",
    "layouts/_partials/navbar.html",
  );

  test("the version-landing check is not short-circuited by an empty section path", () => {
    const src = fs.readFileSync(NAVBAR, "utf8");
    // The exact shape of the old bug. Matching on the disjunction rather than on
    // `eq $sectionPath ""` alone, because that comparison is legitimate
    // elsewhere in the file.
    expect(
      src,
      "version-landing existence check is being skipped when $sectionPath is empty",
    ).not.toMatch(/if\s+or\s+\(site\.GetPage\s+\$versionLanding\)\s+\(eq\s+\$sectionPath\s+""\)/);
  });

  test("an absent root-level tree falls back to a section that has the version", () => {
    const src = fs.readFileSync(NAVBAR, "utf8");
    // The replacement behavior: with no section in the URL, scan the resolved
    // sections for one that nests this version before giving up on the product
    // root. Without this the fallback is the product root for every entry, which
    // makes the dropdown a no-op rather than a 404 — quieter, still wrong.
    expect(src).toMatch(/\$inSection\s*=\s*\.key/);
    expect(src).toMatch(/site\.GetPage\s+\(printf\s+"%s\/%s"\s+\.key\s+\$entry\.linkVersion\)/);
  });
});

test.describe("version-less selector: a nav-link peer, not a control", () => {
  // The two call sites in navbar.html put the selector in two very different
  // neighbourhoods, and the shared button styling only suits one of them.
  //
  //   versioned    logo | SELECTOR | version dropdown | search
  //                Two dropdowns side by side reading as a cluster of controls,
  //                no plain nav link within reach. 600-weight is right there.
  //   version-less logo | SELECTOR | Blog | Tools | Agents | …
  //                The `else` branch emits it immediately before the menu.main
  //                loop, so its neighbours are plain Hextra nav links.
  //
  // Against those links the shared rule was the odd one out four ways over:
  // font-weight 600 vs their inherited 400, letter-spacing 0.3px vs normal,
  // `color: inherit` resolving darker than their gray-600, and 12px horizontal
  // padding vs 8px. The padding is the one that moves geometry: the navbar is
  // flex with an 8px gap and every Hextra link carries p-2 with -ml-2, so the
  // negative margin cancels the gap and consecutive links sit 16px text-edge to
  // text-edge (8 + 8 - 8 + 8); at 12px the selector pushed its successor to
  // 20px. Reported from a screenshot of kagent, which is the first consumer to
  // render the selector next to nav links at all — agentgateway.dev and
  // kgateway.dev both shadow this navbar with their own and never render it.
  //
  // The CSS assertions are SOURCE-level, for the same reason the version-
  // dropdown ones above are. No harness target serves a version-less build (see
  // this file's header), so getComputedStyle is out of reach without a fifth
  // fixture and its own playwright project. What IS asserted from the built
  // output is the half that source can't prove: that the modifier reaches the
  // markup on every page that renders a selector, and reaches NO page of a
  // versioned build.

  const CSS = path.resolve(
    __dirname,
    "..",
    "assets/css/docs-theme-extras.css",
  );

  for (const b of BUILDS) {
    test(`every page rendering a selector carries the modifier (${b.name})`, () => {
      test.skip(!hasBuild(b), `${b.dir} not built; run make build-flat`);
      const root = buildRoot(b);
      const htmlFiles: string[] = [];
      const walk = (d: string) => {
        for (const e of fs.readdirSync(d, { withFileTypes: true })) {
          const p = path.join(d, e.name);
          if (e.isDirectory()) walk(p);
          else if (e.name.endsWith(".html")) htmlFiles.push(p);
        }
      };
      walk(root);

      // Pages that render the button but lack the modifier would be styled as
      // controls in a nav-link row — the reported bug. Pages carrying the
      // modifier without the button would mean the class is being emitted from
      // somewhere it shouldn't. Both directions are checked.
      const withBtn = htmlFiles.filter((f) =>
        fs.readFileSync(f, "utf8").includes("section-dropdown-btn"),
      );
      const withMod = htmlFiles.filter((f) =>
        fs.readFileSync(f, "utf8").includes("section-dropdown-inline"),
      );
      expect(
        withBtn.length,
        "the version-less build should render the selector somewhere",
      ).toBeGreaterThan(0);
      expect(withMod.sort()).toEqual(withBtn.sort());
    });
  }

  test("a versioned build's selector carries no modifier", () => {
    // The gate is `not site.Params.versions`. Without it every hub product's
    // selector would be restyled as a nav link while sitting in a dropdown
    // cluster — the same class of unrequested change the sidebar chips caused.
    test.skip(!IS_FIXTURE_TARGET, "reads the bundled versioned fixture");
    const f = path.join(target.productRoot, "v2", "everything", "index.html");
    test.skip(!fs.existsSync(f), "no versioned fixture page in this build");
    const html = fs.readFileSync(f, "utf8");
    expect(
      html,
      "versioned fixture should still render a selector",
    ).toContain("section-dropdown-btn");
    expect(html).not.toContain("section-dropdown-inline");
  });

  test("the modifier rule matches Hextra's nav-link metrics", () => {
    const src = fs.readFileSync(CSS, "utf8");
    const rule = src.match(
      /\.section-dropdown-inline \.section-dropdown-btn \{([^}]*)\}/,
    );
    expect(rule, "the inline modifier rule is missing").not.toBeNull();
    const body = rule![1];
    // 8px, not 12px: this is the declaration that makes the gap 16px like every
    // other pair in the row.
    expect(body).toMatch(/padding:\s*8px\s*;/);
    expect(body).toMatch(/font-weight:\s*400\s*;/);
    expect(body).toMatch(/letter-spacing:\s*normal\s*;/);
    // Referencing Hextra's palette variable rather than restating the hex keeps
    // the two in sync if Hextra retunes gray; the literal is only a fallback.
    expect(body).toMatch(/color:\s*var\(--hx-color-gray-600,\s*#4b5563\)/);
  });

  test("the shared dropdown-button rule is left alone", () => {
    // The tempting "fix" is to edit the shared rule instead of adding a
    // modifier. That would restyle the version dropdown on all seven hub
    // products, where 600-weight is deliberate and there is no nav link beside
    // it to match. Pin the shared values so that edit fails here first.
    const src = fs.readFileSync(CSS, "utf8");
    const shared = src.match(
      /\.section-dropdown-btn,\s*\n\.version-dropdown-btn \{([^}]*)\}/,
    );
    expect(shared, "the shared dropdown-button rule is missing").not.toBeNull();
    expect(shared![1]).toMatch(/font-weight:\s*600\s*;/);
    expect(shared![1]).toMatch(/padding:\s*6px 12px\s*;/);
  });
});
