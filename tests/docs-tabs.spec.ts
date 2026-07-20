import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Tab navigation band (issue solo-io/docs#3164), rendered by
// layouts/_partials/docs-tabs.html and scoped by layouts/partials/sidebar.html.
//
// The fixture exercises BOTH states in one build:
//   ENABLED  — the `main` version tags two top-level pages into a "Reference"
//              tab (everything/rebased stay in the default "Documentation"
//              tab), so main has >=2 non-empty tabs → the band renders and the
//              left nav is scoped to the active tab.
//   DISABLED — v1/v2 leave their pages untagged, so every top-level page falls
//              into the single default tab → the band is suppressed and the
//              full tree renders, exactly as before docTabs existed.
//
// Fixture-specific (depends on the bundled test content + the docTabs config in
// hugo-oss.toml / hugo-enterprise.toml). Against a consumer build these files
// won't exist, so each test skips itself — the same no-op-on-consumer pattern
// as the rest of the suite.

// Bare class-name substrings: the band carries extra utility classes
// (docs-tabs-band hx:print:hidden), so match the token, not a full attribute.
const BAND = "docs-tabs-band";
const DRAWER_TABS = "sidebar-mobile-tab-row";

// Pull the "<nav class="sidebar-nav">…</nav>" block out of a built page so we
// can assert which top-level entries the sidebar lists.
function sidebarNav(html: string): string {
  const m = html.match(/<nav class="sidebar-nav">([\s\S]*?)<\/nav>/);
  return m ? m[1] : "";
}

// Pull the tab band's inner markup so we can read the tab labels + active tab.
function tabBand(html: string): string {
  const m = html.match(/<nav class="docs-tabs"[^>]*>([\s\S]*?)<\/nav>/);
  return m ? m[1] : "";
}
function bandTabs(html: string): string[] {
  return [...tabBand(html).matchAll(/class="docs-tab(?: docs-tab-active)?"[^>]*>([^<]+)</g)].map(
    (m) => m[1].trim(),
  );
}
function activeTab(html: string): string | null {
  const m = tabBand(html).match(/class="docs-tab docs-tab-active"[^>]*>([^<]+)</);
  return m ? m[1].trim() : null;
}

function fixturePath(...parts: string[]): string {
  return path.join(TEST_PRODUCT_ROOT, ...parts);
}
function readIfExists(p: string): string | null {
  return fs.existsSync(p) ? readFixture(p) : null;
}

test.describe("tab navigation — ENABLED (main version, >=2 tabs)", () => {
  const docsPage = fixturePath("main", "everything", "index.html");
  const refPage = fixturePath("main", "enterprise-kgateway-traffic-policy", "index.html");

  test("renders the band with the configured tabs, active tab reflecting the page", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture main/everything not built");
    expect(html, "no tab band on a version with >=2 non-empty tabs").toContain(BAND);
    // Config declares Documentation (default) + Reference; both have >=1 page
    // in main, so both render, in config order.
    expect(bandTabs(html!)).toEqual(["Documentation", "Reference"]);
    // everything has no `tab`, so it lands in the default tab.
    expect(activeTab(html!)).toBe("Documentation");
  });

  test("left nav is scoped to the active tab's pages", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture main/everything not built");
    const nav = sidebarNav(html!);
    // Documentation-tab siblings are present …
    expect(nav, "everything missing from its own tab's nav").toContain(
      '/test/main/everything/',
    );
    expect(nav, "rebased missing from the Documentation tab").toContain(
      '/test/main/rebased/',
    );
    // … and the Reference-tab pages are hidden while Documentation is active.
    expect(
      nav,
      "Reference-tab page leaked into the Documentation left nav (scoping failed)",
    ).not.toContain('/test/main/enterprise-kgateway-traffic-policy/');
    expect(nav, "Reference-tab page (trailing-step) leaked into the Documentation nav").not.toContain(
      '/test/main/trailing-step/',
    );
  });

  test("switching to a Reference-tab page flips the active tab and the nav scope", () => {
    const html = readIfExists(refPage);
    test.skip(html === null, "fixture main/enterprise-kgateway-traffic-policy not built");
    expect(activeTab(html!)).toBe("Reference");
    const nav = sidebarNav(html!);
    expect(nav, "Reference page missing from its own tab's nav").toContain(
      '/test/main/enterprise-kgateway-traffic-policy/',
    );
    expect(nav, "trailing-step missing from the Reference tab").toContain(
      '/test/main/trailing-step/',
    );
    expect(nav, "Documentation-tab page leaked into the Reference left nav").not.toContain(
      '/test/main/everything/',
    );
  });

  test("mobile drawer carries the tab chips (band is hidden below the sidebar breakpoint)", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture main/everything not built");
    expect(html, "mobile drawer tab-chip row missing when tabs are enabled").toContain(
      DRAWER_TABS,
    );
  });
});

test.describe("tab navigation — DISABLED (untagged version, single default tab)", () => {
  const v1Page = fixturePath("v1", "everything", "index.html");

  test("no band renders when the version has fewer than 2 non-empty tabs", () => {
    const html = readIfExists(v1Page);
    test.skip(html === null, "fixture v1/everything not built");
    expect(html, "band rendered on a version with no tab grouping").not.toContain(BAND);
    expect(html, "mobile tab-chip row rendered on an untagged version").not.toContain(
      DRAWER_TABS,
    );
  });

  test("left nav renders the full tree, unscoped", () => {
    const html = readIfExists(v1Page);
    test.skip(html === null, "fixture v1/everything not built");
    const nav = sidebarNav(html!);
    // Every top-level page is present — nothing is filtered out by a tab.
    for (const slug of ["everything", "rebased", "enterprise-kgateway-traffic-policy"]) {
      expect(nav, `${slug} missing from the unscoped left nav`).toContain(
        `/test/v1/${slug}/`,
      );
    }
  });
});
