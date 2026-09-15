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

// ── The band is sticky ───────────────────────────────────────────────────
//
// The tabs are top-level navigation, so they stay pinned under the navbar
// instead of scrolling away with the article: a reader deep in a long page
// should be able to switch section without scrolling back to the top. The band
// used to scroll away, and making it stick is a three-part change that only a
// browser can check —
//   1. the band pins at the navbar container's BOTTOM edge and stays there;
//   2. the side rails (sidebar + TOC) pin one band-height lower, so they sit
//      under the band rather than tucking beneath it. That offset is the
//      `--solo-tabs-height` term this module adds to `--solo-rail-top`, and it
//      is a HARDCODED 4.25rem in the CSS. If the band's real height ever drifts
//      from that constant, the rails misalign — which is what this asserts;
//   3. the band's background is opaque, because article content now passes
//      underneath it. It was `transparent` while the band scrolled with the
//      page, and a transparent sticky band shows the text sliding through.
// Below the desktop-sidebar breakpoint the band is `display: none` (the tabs
// move into the drawer), so the rail offset must go back to zero there or every
// non-band page on a narrow viewport would gain 68px of dead space.

const NO_BAND_URL = `${BASE}/v2/`;
const NO_BAND_BUILT = built("v2", "index.html");

// Geometry of the pinned chrome. Rounded because sub-pixel layout differs
// between engines and a half-pixel is not the kind of drift this is looking for.
async function pinned(page: import("@playwright/test").Page) {
  return page.evaluate(() => {
    const box = (s: string) => {
      const e = document.querySelector(s) as HTMLElement | null;
      if (!e) return null;
      const r = e.getBoundingClientRect();
      const cs = getComputedStyle(e);
      return {
        top: Math.round(r.top),
        bottom: Math.round(r.bottom),
        height: Math.round(r.height),
        position: cs.position,
        background: cs.backgroundColor,
      };
    };
    return {
      scrollY: Math.round(window.scrollY),
      nav: box(".hextra-nav-container"),
      band: box(".docs-tabs-band"),
      sidebar: box("aside.sidebar-container"),
      toc: box(".solo-toc-inner"),
      tabsHeight: getComputedStyle(document.body).getPropertyValue("--solo-tabs-height").trim(),
    };
  });
}

test.describe("docTabs band — sticky under the navbar (desktop)", () => {
  test.skip(!FIXTURE_BUILT, "fixture v3 tab pages not built");
  // A SHORT viewport on purpose: the fixture pages are not tall, and a sticky
  // element that never leaves its start position proves nothing. 600px leaves
  // enough scroll range for the band to have to hold itself in place.
  test.use({ viewport: { width: 1440, height: 600 } });

  test("the band holds its position under the navbar as the page scrolls", async ({ page }) => {
    await page.goto(SHOWN_URL);
    const atTop = await pinned(page);
    expect(atTop.band, "no tab band on a page that should have one").not.toBeNull();
    expect(atTop.band!.position, "the band is not sticky").toBe("sticky");
    // Flush against the navbar container's bottom edge, with no gap and no
    // overlap — the two read as one piece of chrome.
    expect(atTop.band!.top, "the band does not start flush under the navbar").toBe(
      atTop.nav!.bottom,
    );

    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(150);
    const scrolled = await pinned(page);
    expect(scrolled.scrollY, "the page did not actually scroll — the test proves nothing").toBeGreaterThan(0);
    expect(scrolled.band!.top, "the band scrolled away with the page").toBe(scrolled.nav!.bottom);
    expect(scrolled.band!.height, "the band changed height while pinned").toBe(atTop.band!.height);
  });

  test("the side rails pin to the band's bottom edge, not the navbar's", async ({ page }) => {
    await page.goto(SHOWN_URL);
    await page.evaluate(() => window.scrollBy(0, 400));
    await page.waitForTimeout(150);
    const l = await pinned(page);

    // This is the assertion that catches a stale `--solo-tabs-height`: the
    // constant is written in CSS, the band's height is whatever the type scale
    // actually produces, and the rails land wherever the constant says.
    expect(l.sidebar!.top, "the sidebar tucks under the sticky band (stale --solo-tabs-height?)").toBe(
      l.band!.bottom,
    );
    if (l.toc) {
      expect(l.toc.top, "the TOC tucks under the sticky band (stale --solo-tabs-height?)").toBe(
        l.band!.bottom,
      );
    }
  });

  test("the band paints over the article instead of letting it show through", async ({ page }) => {
    await page.goto(SHOWN_URL);
    const l = await pinned(page);
    const bg = l.band!.background;
    expect(bg, "the sticky band has no background — content scrolls through it").not.toBe(
      "rgba(0, 0, 0, 0)",
    );
    // rgb(...) is opaque; rgba(...) is only opaque at alpha 1.
    const alpha = bg.startsWith("rgba(") ? Number(bg.split(",")[3]?.replace(")", "").trim()) : 1;
    expect(alpha, "the sticky band background is translucent").toBe(1);
  });
});

test.describe("docTabs band — the rail offset is scoped, not global", () => {
  test("a page with no band keeps the pre-band rail offset", async ({ page }) => {
    test.skip(!NO_BAND_BUILT, "fixture non-tab pages not built");
    await page.setViewportSize({ width: 1440, height: 600 });
    await page.goto(NO_BAND_URL);
    await page.evaluate(() => window.scrollBy(0, 300));
    await page.waitForTimeout(150);
    const l = await pinned(page);
    expect(l.band, "a version without tab directories rendered a band").toBeNull();
    // 0rem, 0px, or plain 0 — all mean "no band to clear".
    expect(
      parseFloat(l.tabsHeight),
      "a band-less page still reserves band height in the rail offset",
    ).toBe(0);
    expect(l.sidebar!.top, "the sidebar no longer pins to the navbar on a band-less page").toBe(
      l.nav!.bottom,
    );
  });

  test("below the desktop breakpoint the band is hidden and reserves nothing", async ({ page }) => {
    test.skip(!FIXTURE_BUILT, "fixture v3 tab pages not built");
    await page.setViewportSize({ width: 1100, height: 800 });
    await page.goto(SHOWN_URL);
    const l = await pinned(page);
    // The band element is still in the DOM (`display: none`), which is exactly
    // why the offset has to be turned off by a media query rather than by the
    // `:has()` test alone.
    expect(l.band!.height, "the band is still laid out below the breakpoint").toBe(0);
    expect(
      parseFloat(l.tabsHeight),
      "the hidden band still reserves rail offset below the breakpoint",
    ).toBe(0);
  });
});
