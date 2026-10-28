import { expect, type Page } from "@playwright/test";
import { target } from "./target";

// Shared by tabs-sync-scroll.spec.ts (Chromium) and
// tabs-sync-scroll.cross-browser.spec.ts (Firefox, WebKit), so every engine
// runs the same check. Scroll behavior differs most across engines, which is
// why the fix needs more than Chromium.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
export const SYNC_SCROLL_PAGE = `${BASE_URL}/v2/tabs-sync-scroll/`;
export const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

export function marker(page: Page, name: string) {
  return page.locator(`#content .content :text("${name}")`).first();
}

/** The nth tab button with this label, in document order. */
export function tabAt(page: Page, name: string, index: number) {
  return page.locator("#content .content").getByRole("tab", { name, exact: true }).nth(index);
}

/**
 * Switch the SECOND synced group from "UI" to "Config file", which also
 * switches the first group, above it, and shrinks it by more than 800px.
 * Assert the second group's tab bar did not move.
 *
 *   click     a mouse click on the second group's "Config file" tab
 *   keyboard  ArrowRight on the second group's focused "UI" tab, which
 *             tabs.js handles in keydown and follows with focus()
 */
export async function assertTabBarStays(page: Page, how: "click" | "keyboard") {
  await page.goto(SYNC_SCROLL_PAGE);
  await expect(marker(page, "MARKER_SYNCSCROLL_A_UI")).toBeVisible();

  const config = tabAt(page, "Config file", 1);
  const ui = tabAt(page, "UI", 1);
  // Put the bar mid-viewport by hand, so Playwright's own scroll-into-view
  // never touches the position. 'instant', because a site's
  // `scroll-behavior: smooth` would otherwise still be scrolling when the box
  // is read.
  await config.evaluate((el) => {
    window.scrollBy({ top: el.getBoundingClientRect().top - 500, behavior: "instant" });
  });
  const before = await config.boundingBox();
  expect(before, "the tab button has no box").not.toBeNull();
  const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);

  if (how === "click") {
    await page.mouse.click(before!.x + before!.width / 2, before!.y + before!.height / 2);
  } else {
    // focus() with preventScroll, so focusing does not move the page before
    // the key is pressed.
    await ui.evaluate((el) => (el as HTMLElement).focus({ preventScroll: true }));
    await page.keyboard.press("ArrowRight");
    await expect(config).toBeFocused();
  }

  // The group above switched and shrank, so there was something to correct.
  await expect(marker(page, "MARKER_SYNCSCROLL_A_CONFIG")).toBeVisible();
  await expect(marker(page, "MARKER_SYNCSCROLL_B_CONFIG")).toBeVisible();
  const heightAfter = await page.evaluate(() => document.documentElement.scrollHeight);
  expect(
    heightBefore - heightAfter,
    "the group above did not shrink, so this check would pass with no fix",
  ).toBeGreaterThan(800);

  // Wait two frames, so any late scroll-anchoring adjustment has landed.
  await page.evaluate(
    () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
  );
  const after = await config.boundingBox();
  expect(
    Math.abs(after!.y - before!.y),
    `the tab bar moved from y=${before!.y} to y=${after!.y} after a synced ${how} switch`,
  ).toBeLessThanOrEqual(1);
}
