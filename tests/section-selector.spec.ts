import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The product-name section selector: a navbar dropdown listing a product's
// parallel doc sets, modelled on agentgateway-oss-website's "Docs" dropdown but
// labelled with the product name and driven by utils/resolve-sections.html.
//
// Three things here are easy to break and invisible when broken:
//
//  1. It must NOT render for a product with 0 or 1 sections — eight of the nine
//     hub products and both OSS sites have none, and a stray empty dropdown in
//     their navbar would be a visible regression with no test to catch it.
//  2. The product name must appear ONCE. It moved off the version dropdown when
//     the selector took it over; showing it in both reads "Solo Enterprise for
//     agentgateway | Solo Enterprise for agentgateway - 2026.8.0 (latest)".
//  3. A link to ANOTHER section must target a version that exists THERE.
//     Section version sets diverge (agentgateway kubernetes has 2.3.x and
//     2026.7.1, standalone has only latest), so reusing the current version
//     verbatim points at a 404. That remap had been dead code since v0.2.2 — it
//     read site.Params.sections.<key>.versions, which that release removed.
//
// Fixture: `demo` -> v2, v1, v3, v4-link, v8-link; `alt` -> v2, main, v3,
// v4-link, v8-link. So v1 exists only in demo and main only in alt, giving one
// probe per remap direction, with v2 as the no-remap control.

const SEL = /<div class="section-dropdown">[\s\S]*?<\/ul>\s*<\/div>/;

function read(rel: string): string | null {
  const f = path.join(TEST_PRODUCT_ROOT, rel);
  return fs.existsSync(f) ? fs.readFileSync(f, "utf8") : null;
}

function items(html: string): { href: string; label: string; active: boolean }[] {
  const box = html.match(SEL);
  if (!box) return [];
  return [
    ...box[0].matchAll(
      /<a href="([^"]*)" class="(section-dropdown-item[^"]*)"[^>]*>([^<]*)</g,
    ),
  ].map((m) => ({
    href: m[1],
    label: m[3].trim(),
    active: /section-dropdown-item-active/.test(m[2]),
  }));
}

test.describe("section selector", () => {
  test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's section registry");

  test("the selector renders, labelled with the product name", () => {
    const html = read("v2/everything/index.html");
    test.skip(html === null, "page not built");
    const box = html!.match(SEL);
    expect(box, "no section selector on a two-section fixture").not.toBeNull();
    const btn = box![0].match(
      /<button[^>]*class="section-dropdown-btn"[^>]*>\s*<span>([^<]*)<\/span>/,
    );
    expect(btn, "the selector has no labelled button").not.toBeNull();
    expect(
      btn![1].trim(),
      "the button must carry the PRODUCT name — that is what distinguishes this " +
        'from agw-oss\'s generic "Docs" dropdown',
    ).toBe("Docs framework test fixture");
  });

  test("the product name is not repeated on the version dropdown", () => {
    const html = read("v2/everything/index.html");
    test.skip(html === null, "page not built");
    const vbtn = html!.match(
      /<button type="button" class="version-dropdown-btn"[^>]*>([\s\S]*?)<\/button>/,
    );
    expect(vbtn).not.toBeNull();
    expect(
      vbtn![1],
      "the version button still prefixes the product name while the section " +
        "selector also shows it",
    ).not.toContain("version-product-name");
    // ...and the in-menu header for THIS product's group is suppressed too,
    // while related-product headers (other products) must survive.
    const menu = html!.match(/<ul class="version-dropdown-menu"[\s\S]*?<\/ul>/);
    const headers = [
      ...menu![0].matchAll(/version-dropdown-header">([^<]*)</g),
    ].map((m) => m[1].trim());
    expect(headers).not.toContain("Docs framework test fixture");
    expect(
      headers.length,
      "related-product headers name OTHER products, which the section selector " +
        "does not cover, so they must still render",
    ).toBeGreaterThan(0);
  });

  test("the product name is dropped on a page with no version in its URL too", () => {
    // Separate code path: with no version segment the button falls back to
    // $firstVisibleLabel, which composed the "Product - version" string itself
    // rather than going through the version-product-name span. So the product
    // ROOT kept showing the name twice while every versioned page showed it
    // once — and the span-based assertion above cannot see that.
    for (const page of ["index.html", "demo/index.html", "alt/index.html"]) {
      const html = read(page);
      if (html === null) continue;
      const btn = html.match(
        /<button type="button" class="version-dropdown-btn"[^>]*>([\s\S]*?)<\/button>/,
      );
      if (!btn) continue;
      const text = btn[1].replace(/<[^>]+>/g, "").trim();
      expect(
        text,
        `${page}: the version button reads "${text}", which repeats the product ` +
          "name the section selector is already showing",
      ).not.toContain("Docs framework test fixture");
    }
  });

  test("both sections are listed, sorted by key", () => {
    const html = read("v2/everything/index.html");
    test.skip(html === null, "page not built");
    expect(items(html!).map((i) => i.label)).toEqual(["Alt", "Demo"]);
  });

  test("every section href points at a page that exists", () => {
    // This fixture registers sections WITHOUT nesting version trees under them:
    // `demo` and `alt` scope the version dropdowns, but the content lives at
    // /test/<version>/, not /test/demo/<version>/. So the resolver must fall
    // back to the section landing page rather than appending a version and
    // emitting /test/demo/v2/, which was never built.
    //
    // static.spec.ts's on-disk href check caught exactly that when this was
    // first written, across 7 pages. Asserting it here too keeps the failure
    // legible: a broken SECTION link should not surface as a generic
    // "internal links point to existing pages" failure.
    for (const page of [
      "v2/everything/index.html",
      "v1/everything/index.html",
      "main/everything/index.html",
      "demo/index.html",
    ]) {
      const html = read(page);
      if (html === null) continue;
      for (const i of items(html)) {
        const rel = i.href.replace(/^\/test\//, "").replace(/\/$/, "");
        const onDisk = path.join(TEST_PRODUCT_ROOT, rel, "index.html");
        expect(
          fs.existsSync(onDisk),
          `${page}: section link ${i.href} has no page on disk. Appending a ` +
            "version to a section that does not nest its versions produces a " +
            "dead menu entry.",
        ).toBe(true);
      }
    }
  });

  test("a version is only appended when that page really is nested", () => {
    // Source contract, because this fixture has no nested section/version tree
    // to observe the positive case on. Page.GetPage tries a relative lookup and
    // then falls back to a SITE-WIDE one, so `$landing.GetPage "v2"` returns
    // /test/v2/ even though /test/demo/v2/ does not exist. Testing that GetPage
    // returned *something* therefore does not work — the resolved permalink has
    // to be compared against the URL being built.
    const f = path.resolve(
      __dirname,
      "../layouts/_partials/utils/resolve-sections.html",
    );
    test.skip(!fs.existsSync(f), "module-relative path only");
    const src = fs
      .readFileSync(f, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
    expect(
      /eq \.RelPermalink \$want/.test(src),
      "the resolver must compare the resolved permalink against the href it " +
        "is building. A bare GetPage truthiness test passes on the site-wide " +
        "fallback and re-introduces the dead /<section>/<version>/ links.",
    ).toBe(true);
  });

  test("the current section is marked active, and only that one", () => {
    const html = read("demo/index.html");
    test.skip(html === null, "landing page not built");
    const got = items(html!);
    expect(got.filter((i) => i.active).map((i) => i.label)).toEqual(["Demo"]);
  });

  test("mobile chips offer the same sections as the navbar selector", () => {
    const html = read("v2/everything/index.html");
    test.skip(html === null, "page not built");
    const row = html!.match(
      /<div class="sidebar-mobile-section-row">[\s\S]*?<\/div>/,
    );
    test.skip(!row, "no mobile section row built");
    const chips = [
      ...row![0].matchAll(/<a href="([^"]*)"[\s\S]{0,120}?>\s*([^<]*?)\s*</g),
    ].map((m) => m[1]);
    expect(
      chips,
      "the drawer and the navbar are separate templates reading one resolver; " +
        "they must land on identical destinations, or switching sections on a " +
        "phone goes somewhere else than on a laptop",
    ).toEqual(items(html!).map((i) => i.href));
  });
});

test.describe("section selector source contract", () => {
  const NAVBAR = path.resolve(__dirname, "../layouts/_partials/navbar.html");
  const SIDEBAR = path.resolve(__dirname, "../layouts/partials/sidebar.html");
  const RESOLVER = path.resolve(
    __dirname,
    "../layouts/_partials/utils/resolve-sections.html",
  );

  const active = (f: string) =>
    fs.readFileSync(f, "utf8").replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");

  test("both renderers read the one resolver", () => {
    for (const f of [NAVBAR, SIDEBAR]) {
      test.skip(!fs.existsSync(f), "module-relative path only");
      expect(
        /partial "utils\/resolve-sections\.html"/.test(active(f)),
        `${path.basename(f)} must resolve sections through ` +
          "utils/resolve-sections.html, not rebuild the list. The inline copy " +
          "in sidebar.html hardcoded /docs/<section>/<version>/ and was gated " +
          "on the OSS shape, so the docs hub never showed a section row.",
      ).toBe(true);
    }
  });

  test("the selector is suppressed below two sections", () => {
    test.skip(!fs.existsSync(NAVBAR), "module-relative path only");
    expect(
      /gt \(len \$sections\) 1/.test(active(NAVBAR)),
      "without the >1 guard, every product with no sections gets an empty " +
        "dropdown in its navbar",
    ).toBe(true);
  });

  test("the resolver does not hardcode a URL shape", () => {
    test.skip(!fs.existsSync(RESOLVER), "module-relative path only");
    const src = active(RESOLVER);
    // The ban is on BUILDING AN HREF from a literal prefix, not on the string
    // appearing at all: the resolver legitimately probes
    // `site.GetPage "/docs/<section>"` as the OSS fallback for LOCATING the
    // landing page. Banning the literal outright failed that honest lookup —
    // which is how a guard ends up deleted rather than corrected.
    expect(
      /\$href\s*=\s*printf\s+"\/docs\//.test(src),
      "an href is being built from a literal /docs/ prefix, which is correct " +
        "only on the OSS sites. It must come from the landing page's own " +
        "RelPermalink, which already carries whichever prefix this site uses.",
    ).toBe(false);
    expect(
      /\$href = \.RelPermalink|\$href = \$land\.RelPermalink/.test(src),
      "the href must be derived from the landing page's RelPermalink",
    ).toBe(true);
    expect(
      /site\.GetPage \(printf "\/%s"/.test(src),
      "the landing-page lookup must be ROOTED (leading slash). A bare " +
        'site.GetPage "envoy" is a fuzzy match and aborts the docs-hub ' +
        "kgateway build with `page reference \"envoy\" is ambiguous`.",
    ).toBe(true);
  });
});
