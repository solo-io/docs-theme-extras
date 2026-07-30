import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";

// Tab navigation band (issue solo-io/docs#3164), rendered by
// layouts/_partials/docs-tabs.html and scoped by layouts/partials/sidebar.html.
//
// DIRECTORY MODE (the shipped model). A tab carries `id = "<dir>"`, the name of
// a top-level content directory under the version root; the left nav is rooted
// INSIDE that directory, so the directory's own node never appears — the tab IS
// the directory. The fixture exercises BOTH states in one build:
//   ENABLED  — the `v3` (tabs-demo) version partitions its docs into three tab
//              directories (documentation/, api/, changelog/), so it has >=2 tab
//              dirs → the band renders and the left nav is scoped to the active
//              tab's directory.
//   DISABLED — main/v1/v2 have none of those directories, so no tab is present
//              → the band is suppressed and the full tree renders, exactly as
//              before docTabs existed.
//
// Fixture-specific (depends on the bundled v3 tree + the docTabs config in
// hugo-oss.toml / hugo-enterprise.toml). Against a consumer build these files
// won't exist, so each test skips itself — the same no-op-on-consumer pattern
// as the rest of the suite.

// Bare class-name substrings: the band carries extra utility classes
// (docs-tabs-band hx:print:hidden), so match the token, not a full attribute.
const BAND = "docs-tabs-band";
const DRAWER_TABS = "sidebar-mobile-tab-row";

// Pull the "<nav class="sidebar-nav">…</nav>" block out of a built page so we
// can assert which entries the sidebar lists. The canonical active-tab nav is
// `class="sidebar-nav"` exactly (plus a data-tab-panel attribute); the other
// tabs' hidden mobile panels are `class="sidebar-nav sidebar-mobile-tree-panel"`,
// which this does NOT match, so the assertions read only the active tab's tree.
function sidebarNav(html: string): string {
  const m = html.match(/<nav class="sidebar-nav"[^>]*>([\s\S]*?)<\/nav>/);
  return m ? m[1] : "";
}

// The hrefs of the sidebar links in the active-tab nav. Used to assert exact
// membership — substring checks are ambiguous because a child href
// (/v3/api/resources/) contains its parent dir's path (/v3/api/).
function sidebarLinks(html: string): string[] {
  return [...sidebarNav(html).matchAll(/<a href="([^"]+)"\s+class="sidebar-link/g)].map(
    (m) => m[1],
  );
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

test.describe("tab navigation — ENABLED (v3, directory/id tabs)", () => {
  const apiPage = fixturePath("v3", "api", "authentication", "index.html");
  const docsPage = fixturePath("v3", "documentation", "getting-started", "index.html");

  test("renders the band with the configured tabs, in config order", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture v3/documentation/getting-started not built");
    expect(html, "no tab band on a version with >=2 tab directories").toContain(BAND);
    // Config declares Documentation (default) + API Reference + Changelog; each
    // is a directory in v3, so all three render, in config order.
    expect(bandTabs(html!)).toEqual(["Documentation", "API Reference", "Changelog"]);
  });

  test("active tab reflects the directory the page lives in", () => {
    const apiHtml = readIfExists(apiPage);
    test.skip(apiHtml === null, "fixture v3/api/authentication not built");
    expect(activeTab(apiHtml!)).toBe("API Reference");

    const docsHtml = readIfExists(docsPage);
    test.skip(docsHtml === null, "fixture v3/documentation/getting-started not built");
    expect(activeTab(docsHtml!)).toBe("Documentation");
  });

  test("left nav is rooted INSIDE the active tab's directory (no directory node, scoped)", () => {
    const html = readIfExists(apiPage);
    test.skip(html === null, "fixture v3/api/authentication not built");
    const links = sidebarLinks(html!);
    // The api directory's own pages are listed …
    expect(links, "api tab's pages missing from its own left nav").toEqual(
      expect.arrayContaining(["/test/v3/api/resources/", "/test/v3/api/authentication/"]),
    );
    // … the directory node itself is NOT a wrapper entry (this is the fix: the
    // tab name isn't repeated as a folder in the sidebar) …
    expect(links, 'the "api" directory leaked into the nav as a wrapper node').not.toContain(
      "/test/v3/api/",
    );
    // … and the other tabs' directories are absent (scoping).
    for (const href of links) {
      expect(href, `a non-API-Reference page leaked into the API nav: ${href}`).toMatch(
        /^\/test\/v3\/api\//,
      );
    }
  });

  test("default (Documentation) tab roots inside documentation/ with no wrapper node", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture v3/documentation/getting-started not built");
    const links = sidebarLinks(html!);
    expect(links, "documentation sections missing from the default tab").toEqual(
      expect.arrayContaining([
        "/test/v3/documentation/getting-started/",
        "/test/v3/documentation/concepts/",
      ]),
    );
    expect(links, 'the "documentation" directory leaked in as a wrapper node').not.toContain(
      "/test/v3/documentation/",
    );
    // API Reference + Changelog pages stay out of the Documentation nav.
    for (const href of links) {
      expect(href, `a non-Documentation page leaked into the Documentation nav: ${href}`).toMatch(
        /^\/test\/v3\/documentation\//,
      );
    }
  });

  test("a single-page tab still lists its landing so it stays clickable (incl. mobile drawer)", () => {
    // Changelog's directory holds only its _index (no child pages). Without the
    // depth-0 fallback in render-sidebar-tree, the left nav — and the mobile
    // drawer's Changelog panel — would be empty and the tab unreachable on
    // mobile (drawer chips swap panels client-side instead of navigating).
    const clHtml = readIfExists(fixturePath("v3", "changelog", "index.html"));
    test.skip(clHtml === null, "fixture v3/changelog not built");
    expect(activeTab(clHtml!)).toBe("Changelog");
    expect(sidebarLinks(clHtml!), "single-page tab rendered an empty left nav").toContain(
      "/test/v3/changelog/",
    );
    // And from another tab's page, the pre-rendered Changelog mobile panel must
    // also carry the link (that's the panel the drawer chip reveals).
    const docsHtml = readIfExists(docsPage);
    test.skip(docsHtml === null, "fixture v3/documentation/getting-started not built");
    const panel = docsHtml!.match(
      /<nav class="sidebar-nav sidebar-mobile-tree-panel" data-tab-panel="Changelog"[^>]*>([\s\S]*?)<\/nav>/,
    );
    expect(panel, "Changelog mobile panel not rendered").not.toBeNull();
    expect(panel![1], "Changelog mobile panel has no link to tap").toContain(
      '/test/v3/changelog/',
    );
  });

  test("mobile drawer carries the tab chips (band is hidden below the sidebar breakpoint)", () => {
    const html = readIfExists(docsPage);
    test.skip(html === null, "fixture v3/documentation/getting-started not built");
    expect(html, "mobile drawer tab-chip row missing when tabs are enabled").toContain(
      DRAWER_TABS,
    );
  });
});

test.describe("tab navigation — DISABLED (versions with no tab directories)", () => {
  const mainPage = fixturePath("main", "everything", "index.html");

  test("no band renders when the version has fewer than 2 tab directories", () => {
    const html = readIfExists(mainPage);
    test.skip(html === null, "fixture main/everything not built");
    expect(html, "band rendered on a version with no tab directories").not.toContain(BAND);
    expect(html, "mobile tab-chip row rendered on a version with no tab dirs").not.toContain(
      DRAWER_TABS,
    );
  });

  test("left nav renders the full tree, unscoped", () => {
    const html = readIfExists(mainPage);
    test.skip(html === null, "fixture main/everything not built");
    const nav = sidebarNav(html!);
    // Every top-level page is present — nothing is filtered out by a tab.
    for (const slug of ["everything", "rebased", "enterprise-kgateway-traffic-policy"]) {
      expect(nav, `${slug} missing from the unscoped left nav`).toContain(
        `/test/main/${slug}/`,
      );
    }
  });
});
