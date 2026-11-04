import { test, expect } from "@playwright/test";

// `tabs.sync` — where the clicked button ends up.
//
// WHY THIS EXISTS. With sync on, Hextra's tabs.js switches every group with the
// same tab names, including groups ABOVE the one the reader clicked. When one
// of those changes height a lot (a long "UI" tab with screenshots becomes a
// short "Config file" fence), the clicked button moved with the content: on
// agentgateway.dev at 1280x800 it went from y=579 to y=-469 after one click,
// so the reader lost their place. Browser scroll anchoring does not catch it.
//
// assets/js/core/tabs-sync-scroll.js measures the tab bar before tabs.js runs
// and scrolls by the difference after, for a click and for an arrow key. This
// spec pins that the bar stays put, and that the group above really did
// switch, so the spec cannot pass because nothing moved. The same checks run
// in Firefox and WebKit from tabs-sync-scroll.cross-browser.spec.ts.

import {
  IS_FIXTURE_TARGET,
  SYNC_SCROLL_PAGE as PAGE,
  assertTabBarStays,
  marker,
  tabAt,
} from "./helpers/tabs-sync-scroll";

test.describe("tabs.sync keeps the clicked tab in place", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page (v2/tabs-sync-scroll, build.list=never)");

  test.use({ viewport: { width: 1280, height: 800 } });

  test("a synced switch that shrinks a group above does not move the clicked button", async ({
    page,
  }) => {
    await assertTabBarStays(page, "click");
  });

  test("an arrow-key switch does not move the tab bar either", async ({ page }) => {
    // Arrow keys, Home and End switch in tabs.js's keydown handler, with no
    // click, and its focus() then scrolls on its own.
    await assertTabBarStays(page, "keyboard");
  });

  test("the choice is still saved and replayed on reload", async ({ page }) => {
    // The scroll correction must not get in the way of tabs.js's own
    // localStorage write.
    await page.goto(PAGE);
    await tabAt(page, "Config file", 1).click();
    await page.reload();
    await expect(marker(page, "MARKER_SYNCSCROLL_A_CONFIG")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCSCROLL_B_CONFIG")).toBeVisible();
  });
});
