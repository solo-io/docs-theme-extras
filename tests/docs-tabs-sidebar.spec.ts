import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Per-tab `hideSidebar` (issue solo-io/docs#3164) — the CSS half of the
// feature, which docs-tabs.spec.ts (static, HTML-only) cannot see.
//
// A docTabs tab may set `hideSidebar = true` to drop the left nav on its own
// pages at the desktop-sidebar breakpoint and up. The suppression is
// DESKTOP-ONLY on purpose: below that breakpoint the same <aside> IS the
// slide-out drawer, and the drawer is the only route to the tab chips, the
// version chips, and the other tabs' trees — hiding it there would strand the
// reader on the page they're on. So there are really two assertions, and they
// have to be made in a browser at two viewports:
//   >= 1280px  → the aside computes to display:none and the article reclaims
//                the 16rem column, while the tab band still renders (that band
//                is how the reader gets back to a tab that HAS a nav).
//   <  1280px  → the aside is the drawer, opens on the toggle, and carries the
//                tab chips and a tappable tree.
//
// Fixture-specific: the v3 (tabs-demo) tree sets `hideSidebar = true` on its
// Changelog tab in hugo-oss.toml / hugo-enterprise.toml. Against a consumer
// build those pages don't exist, so every test skips itself — the same
// no-op-on-consumer pattern as the rest of the suite.

const BASE = target.baseURL.replace(/\/$/, "");

// A tab WITH hideSidebar, and one WITHOUT, in the same build — so a failure
// distinguishes "the flag does nothing" from "the flag hides every tab's nav".
const HIDDEN_URL = `${BASE}/v3/changelog/`;
const SHOWN_URL = `${BASE}/v3/api/authentication/`;

function built(...parts: string[]): boolean {
  return fs.existsSync(path.join(TEST_PRODUCT_ROOT, ...parts));
}
const FIXTURE_BUILT =
  built("v3", "changelog", "index.html") && built("v3", "api", "authentication", "index.html");

// Computed display + geometry of the sidebar aside and the content column.
async function layout(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const aside = document.querySelector("aside.sidebar-container") as HTMLElement | null;
    const main = document.querySelector("main#content") as HTMLElement | null;
    return {
      asideFound: aside !== null,
      display: aside ? getComputedStyle(aside).display : null,
      asideWidth: aside ? Math.round(aside.getBoundingClientRect().width) : null,
      mainX: main ? Math.round(main.getBoundingClientRect().x) : null,
      mainWidth: main ? Math.round(main.getBoundingClientRect().width) : null,
      band: document.querySelector("nav.docs-tabs") !== null,
    };
  });
}

test.describe("docTabs hideSidebar — desktop (>= 1280px)", () => {
  test.skip(!FIXTURE_BUILT, "fixture v3 tab pages not built");
  test.use({ viewport: { width: 1440, height: 900 } });

  test("a tab with hideSidebar = true renders no left nav", async ({ page }) => {
    await page.goto(HIDDEN_URL);
    const l = await layout(page);
    // The markup is still emitted (that's what keeps the mobile drawer alive) —
    // only the desktop display is suppressed, by the two-class CSS rule.
    expect(l.asideFound, "sidebar aside not rendered at all — the drawer needs it").toBe(true);
    expect(l.display, "hideSidebar tab still shows its left nav on desktop").toBe("none");
    expect(l.asideWidth, "hidden sidebar still occupies width").toBe(0);
    // The band has to survive, or a reader on a nav-less tab can't get back to
    // one that has a nav.
    expect(l.band, "tab band disappeared along with the sidebar").toBe(true);
  });

  test("the article reclaims the sidebar's column", async ({ page }) => {
    await page.goto(SHOWN_URL);
    const shown = await layout(page);
    await page.goto(HIDDEN_URL);
    const hidden = await layout(page);
    // `display: none` (rather than visibility/width:0) is what lets the flex row
    // give the 16rem back to the content, so the nav-less tab reads as a wider
    // page instead of one with a blank gutter.
    expect(
      hidden.mainX!,
      "content column did not shift left into the reclaimed sidebar column",
    ).toBeLessThan(shown.mainX!);
    expect(hidden.mainWidth!, "content column did not widen").toBeGreaterThan(shown.mainWidth!);
  });

  test("tabs without the flag keep their left nav (the flag is per-tab, not global)", async ({
    page,
  }) => {
    await page.goto(SHOWN_URL);
    const l = await layout(page);
    expect(l.display, "a tab that never set hideSidebar lost its left nav").not.toBe("none");
    expect(l.asideWidth, "sidebar column collapsed on a tab that keeps its nav").toBeGreaterThan(0);
  });
});

test.describe("docTabs hideSidebar — mobile (< 1280px): the drawer always shows", () => {
  test.skip(!FIXTURE_BUILT, "fixture v3 tab pages not built");
  test.use({ viewport: { width: 390, height: 800 } });

  test("the drawer still opens on a hideSidebar tab, with its chips and tree", async ({ page }) => {
    await page.goto(HIDDEN_URL);

    // Closed state: present in the layout but translated off-canvas and
    // visibility:hidden — the panel's normal resting state, NOT display:none.
    const closed = await page.evaluate(() => {
      const a = document.querySelector("aside.sidebar-container") as HTMLElement;
      const cs = getComputedStyle(a);
      return { display: cs.display, visibility: cs.visibility };
    });
    expect(
      closed.display,
      "the desktop-only hide leaked below the breakpoint and killed the drawer",
    ).not.toBe("none");
    expect(closed.visibility, "drawer is not off-canvas before it's opened").toBe("hidden");

    await page.evaluate(() => (window as unknown as { toggleMobileSidebar: () => void }).toggleMobileSidebar());
    await expect(page.locator("aside.sidebar-container")).toBeVisible();

    // The two things the drawer exists for on a nav-less tab: the chips that
    // switch tabs, and at least one link to tap.
    await expect(
      page.locator(".sidebar-mobile-tab-link"),
      "tab chips missing from the drawer on a hideSidebar tab",
    ).toHaveCount(3);
    expect(
      await page.locator("aside.sidebar-container .sidebar-link").count(),
      "drawer has no tappable link on a hideSidebar tab",
    ).toBeGreaterThan(0);
  });
});
