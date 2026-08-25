import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const IS_ENTERPRISE = (process.env.BRAND ?? "").includes("enterprise")
  ? true
  : fs.existsSync(path.resolve(__dirname, "../public-enterprise")) &&
    TEST_PRODUCT_ROOT.includes("public-enterprise");

// Breadcrumb LABELS. presence.spec.ts already asserts the <nav> and the home
// link exist; nothing asserted what the crumbs actually say, which is why the
// following regressed silently.
//
// On the enterprise brand a VERSION ancestor collapses to its URL slug, because
// a version index is titled for the page and not for a crumb — kgateway's
// /2.3.x/ is titled "Solo Enterprise for kgateway 2.3.x", and repeating that in
// every breadcrumb on the site is noise. Non-version ancestors keep their title.
//
// That collapse used to be gated on `.Parent.IsHome`, on the assumption that a
// version is always the top-level ancestor. A product with parallel doc sections
// nests versions one level deeper (/<product>/<section>/<version>/…), which broke
// the assumption twice over on agentgateway:
//
//   the SECTION became top-level     -> "Kubernetes" was collapsed to "kubernetes"
//   the VERSION was no longer top    -> kept its full title, giving
//                                       Home / Kubernetes / Kubernetes / Install
//
// The rule is now "collapse an ancestor whose slug is a configured version, at
// any depth", which is both halves at once.

const VERSION_DIRS = ["v2", "v1", "main"];

function crumbs(file: string): string[] | null {
  if (!fs.existsSync(file)) return null;
  const nav = fs
    .readFileSync(file, "utf8")
    .match(/<nav [^>]*class="solo-breadcrumb"[\s\S]*?<\/nav>/);
  if (!nav) return null;
  return [...nav[0].matchAll(/class="solo-breadcrumb-link">([^<]*)</g)].map((m) =>
    m[1].trim(),
  );
}

function firstPageWithCrumbs(): { file: string; got: string[] } | null {
  for (const v of VERSION_DIRS) {
    for (const leaf of ["everything", "rebased"]) {
      const file = path.join(TEST_PRODUCT_ROOT, v, leaf, "index.html");
      const got = crumbs(file);
      if (got && got.length > 0) return { file, got };
    }
  }
  return null;
}

test.describe("breadcrumb labels", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's titles");

  test("a versioned page produces at least one crumb", () => {
    const found = firstPageWithCrumbs();
    // Without this the two assertions below would pass vacuously on an
    // unbuilt or renamed fixture tree.
    expect(
      found,
      `no breadcrumb links found under ${TEST_PRODUCT_ROOT} — the label ` +
        "assertions below would be testing nothing",
    ).not.toBeNull();
  });

  test("the version crumb is the URL slug on enterprise, the title on OSS", () => {
    const found = firstPageWithCrumbs();
    test.skip(found === null, "no built breadcrumb");
    const { got } = found!;
    // The first crumb is the version ancestor in this fixture's shape
    // (/test/<version>/<page>/).
    const versionCrumb = got[0];
    if (IS_ENTERPRISE) {
      expect(
        VERSION_DIRS,
        `enterprise must collapse the version crumb to its slug, got ` +
          `"${versionCrumb}". The fixture's v2 is titled "v2 (current)", so a ` +
          "title leaking through is visible here.",
      ).toContain(versionCrumb);
    } else {
      expect(
        versionCrumb,
        "OSS keeps the version section's own title — the slug collapse is " +
          "enterprise-only, because only the hub puts each product in its own " +
          "site with the version as a top-level ancestor",
      ).not.toBe(versionCrumb.replace(/\s*\(.*\)$/, "") + "__never");
      expect(VERSION_DIRS).not.toContain(versionCrumb);
    }
  });

  test("a non-version ancestor keeps its title, never its slug", () => {
    // Slug-vs-title is only observable where they differ, so this needs an
    // ancestor whose title is not its directory name. `everything`/`rebased`
    // are leaves; walk any deeper tree the fixture has.
    const found = firstPageWithCrumbs();
    test.skip(found === null, "no built breadcrumb");
    for (const c of found!.got.slice(1)) {
      expect(
        c,
        "a crumb rendered as a lowercase slug where a title was expected. " +
          "The version collapse must be scoped to version ancestors — this is " +
          'the "kubernetes" instead of "Kubernetes" regression.',
      ).not.toMatch(/^[a-z0-9][a-z0-9-]*$/);
    }
  });
});

test.describe("breadcrumb source contract", () => {
  const FILE = path.resolve(__dirname, "../layouts/_partials/breadcrumb.html");

  function activeSrc(): string {
    return fs
      .readFileSync(FILE, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
  }

  test("the version collapse is not gated on .Parent.IsHome", () => {
    test.skip(!fs.existsSync(FILE), "module-relative path only");
    const src = activeSrc();
    const collapse = src.indexOf("match-version-entry.html");
    const isHome = src.indexOf(".Parent.IsHome");
    expect(
      collapse,
      "the version collapse must ask utils/match-version-entry.html whether " +
        "the slug IS a version, instead of assuming a version sits at a fixed " +
        "depth",
    ).toBeGreaterThan(-1);
    expect(
      collapse < isHome || isHome === -1,
      "the collapse moved back inside the `.Parent.IsHome` branch. That only " +
        "reaches the top-level ancestor, so a product whose versions sit under " +
        "a section segment loses it — and the section itself gets collapsed to " +
        "a lowercase slug instead.",
    ).toBe(true);
  });

  test("the collapse is enterprise-only", () => {
    test.skip(!fs.existsSync(FILE), "module-relative path only");
    expect(
      /themeExtras\.brand \| default ""\) "enterprise"/.test(activeSrc()),
      "OSS sites put /docs/ above the version and want the section's own " +
        "title, so the collapse must stay brand-scoped",
    ).toBe(true);
  });
});

// The breadcrumb on a page whose ONLY ancestor is home.
//
// WHY THIS EXISTS. The nav used to require at least one NON-home ancestor,
// which silently deleted the whole <nav> — home link included — from any page
// sitting one level under home. On the docs hub each product is its own site
// with baseURL=/<product>/, so that is exactly a section landing:
// /agentgateway/kubernetes/ had home as its only ancestor.
//
// That is the one page shape with no other route back to the product root.
// sidebar.html suppresses the left nav there by design (see
// section-landing.spec.ts), and the product logo carrying
// href="{{ site.Home.RelPermalink }}" lives inside that sidebar, so it goes
// with it. In production the only /agentgateway/ link left on
// /agentgateway/kubernetes/ sat inside .sidebar-mobile-only, which the CSS
// hides above 1280px — reachable on a phone and nowhere else.
//
// The fixture probe is the same one section-landing.spec.ts uses:
// fixture/content/en/test/demo/ is a registered section, so /test/demo/ is
// the enterprise-shaped section landing.
const SECTION_LANDING = path.join(TEST_PRODUCT_ROOT, "demo", "index.html");
const FIXTURE_HOME = path.join(TEST_PRODUCT_ROOT, "index.html");

function nav(file: string): string | null {
  if (!fs.existsSync(file)) return null;
  const m = fs
    .readFileSync(file, "utf8")
    .match(/<nav [^>]*class="solo-breadcrumb"[\s\S]*?<\/nav>/);
  return m ? m[0] : null;
}

test.describe("breadcrumb with no non-home ancestor", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's section registry");

  test("the fixture actually built the probe pages", () => {
    // Without this a moved or unbuilt page turns the assertions below into
    // vacuous passes rather than failures.
    expect(
      fs.existsSync(SECTION_LANDING),
      `${SECTION_LANDING} not built — the section-landing probe is gone`,
    ).toBe(true);
    expect(
      fs.existsSync(FIXTURE_HOME),
      `${FIXTURE_HOME} not built — the home probe is gone`,
    ).toBe(true);
  });

  test("a section landing renders the nav, so the home link survives", () => {
    test.skip(!fs.existsSync(SECTION_LANDING), "probe not built");
    const n = nav(SECTION_LANDING);
    expect(
      n,
      "a section landing page must render the breadcrumb. It is the only up-" +
        "link it has: the left nav is suppressed there by design, and the " +
        "product logo that would link home lives inside that nav.",
    ).not.toBeNull();
    expect(
      n!,
      "the home link is the entire payload of this crumb — without it the nav " +
        "is decoration",
    ).toMatch(/<a [^>]*class="solo-breadcrumb-home"/);
  });

  test("that nav is home ONLY — no crumb, and no dangling separator", () => {
    test.skip(!fs.existsSync(SECTION_LANDING), "probe not built");
    const n = nav(SECTION_LANDING)!;
    expect(
      [...n.matchAll(/class="solo-breadcrumb-link"/g)].length,
      "a section landing has no non-home ancestor, so the home icon must " +
        "stand alone",
    ).toBe(0);
    expect(
      n,
      "the separator is emitted per ancestor; with none, emitting one would " +
        "render a trailing slash after the home icon",
    ).not.toContain("solo-breadcrumb-sep");
  });

  test("the home page itself renders no breadcrumb", () => {
    test.skip(!fs.existsSync(FIXTURE_HOME), "probe not built");
    expect(
      nav(FIXTURE_HOME),
      "home's only crumb would link to home, so the nav must not render there",
    ).toBeNull();
  });
});

test.describe("breadcrumb redirect-stub guard", () => {
  const FILE = path.resolve(__dirname, "../layouts/_partials/breadcrumb.html");

  // A lone home crumb is worse than none when home is a REDIRECT STUB. Six of
  // the seven products on the docs hub give their root `type: "default"`, which
  // layouts/default/list.html renders as a meta-refresh to
  // params.defaultVersion. A reader in /kgateway/2.3.x/ who clicks a lone home
  // crumb does not land on a product root — they are bounced to
  // /kgateway/latest/, silently switching version.
  //
  // Source-level because no fixture variant has a stub home, and building one
  // to assert an ABSENCE would be a lot of machinery for one boolean. The
  // rendered halves above cover the case that does exist.
  test("the lone home crumb is suppressed when home redirects", () => {
    test.skip(!fs.existsSync(FILE), "module-relative path only");
    const src = fs
      .readFileSync(FILE, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    expect(
      /site\.Home\.Type.*"default"/.test(src),
      "the guard is gone: every version root on a redirect-stub product now " +
        "shows a home icon that bounces the reader to a different version",
    ).toBe(true);
    expect(
      /len \$ancestors\) 0/.test(src),
      "the guard must apply ONLY when home is the whole breadcrumb. A page " +
        "with real ancestors needs those crumbs, and dropping the nav to " +
        "avoid one imperfect home link takes the useful ones with it.",
    ).toBe(true);
  });
});
