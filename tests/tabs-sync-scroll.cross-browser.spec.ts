import { test } from "@playwright/test";
import { IS_FIXTURE_TARGET, assertTabBarStays } from "./helpers/tabs-sync-scroll";

// tabs-sync-scroll.spec.ts, in every engine. Scroll behavior is where engines
// differ most (the fix scrolls with `behavior: 'instant'`, and WebKit and
// Firefox handle focus() scrolling their own way), so a Chromium-only pass is
// not enough. See that spec for why the fix exists.

test.describe("tabs.sync keeps the tab bar in place (cross-browser)", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page (v2/tabs-sync-scroll, build.list=never)");
  test.use({ viewport: { width: 1280, height: 800 } });

  for (const how of ["click", "keyboard"] as const) {
    test(`a synced ${how} switch does not move the tab bar`, async ({ page }) => {
      await assertTabBarStays(page, how);
    });
  }
});
