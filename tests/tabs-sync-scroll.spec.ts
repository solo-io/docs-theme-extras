import { test, expect, type Page } from "@playwright/test";
import { target } from "./helpers/target";

// `tabs.sync` — where the clicked button ends up.
//
// WHY THIS EXISTS. With sync on, Hextra's tabs.js switches every group with the
// same tab names, including groups ABOVE the one the reader clicked. When one
// of those changes height a lot (a long "UI" tab with screenshots becomes a
// short "Config file" fence), the clicked button moved with the content: on
// agentgateway.dev at 1280x800 it went from y=579 to y=-469 after one click,
// so the reader lost their place. Browser scroll anchoring does not catch it.
//
// assets/js/core/tabs-sync-scroll.js measures the button before tabs.js runs
// and scrolls by the difference after. This spec pins that the button stays
// put, and that the group above really did switch, so the spec cannot pass
// because nothing moved.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/tabs-sync-scroll/`;

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

function marker(page: Page, name: string) {
  return page.locator(`#content .content :text("${name}")`).first();
}

/** The nth tab button with this label, in document order. */
function tabAt(page: Page, name: string, index: number) {
  return page.locator("#content .content").getByRole("tab", { name, exact: true }).nth(index);
}

test.describe("tabs.sync keeps the clicked tab in place", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page (v2/tabs-sync-scroll, build.list=never)");

  test.use({ viewport: { width: 1280, height: 800 } });

  test("a synced switch that shrinks a group above does not move the clicked button", async ({
    page,
  }) => {
    await page.goto(PAGE);
    await expect(marker(page, "MARKER_SYNCSCROLL_A_UI")).toBeVisible();

    const button = tabAt(page, "Config file", 1);
    // Put the button mid-viewport by hand, then click at its center with the
    // mouse, so Playwright's own scroll-into-view never touches the position.
    // 'instant', because a site's `scroll-behavior: smooth` would otherwise
    // still be scrolling when the box is read.
    await button.evaluate((el) => {
      window.scrollBy({ top: el.getBoundingClientRect().top - 500, behavior: "instant" });
    });
    const before = await button.boundingBox();
    expect(before, "the clicked button has no box").not.toBeNull();
    const heightBefore = await page.evaluate(() => document.documentElement.scrollHeight);

    await page.mouse.click(before!.x + before!.width / 2, before!.y + before!.height / 2);

    // The group above switched and shrank, so there was something to correct.
    await expect(marker(page, "MARKER_SYNCSCROLL_A_CONFIG")).toBeVisible();
    await expect(marker(page, "MARKER_SYNCSCROLL_B_CONFIG")).toBeVisible();
    const heightAfter = await page.evaluate(() => document.documentElement.scrollHeight);
    expect(
      heightBefore - heightAfter,
      "the group above did not shrink, so this spec would pass with no fix",
    ).toBeGreaterThan(800);

    // Wait two frames, so any late scroll-anchoring adjustment has landed.
    await page.evaluate(
      () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r))),
    );
    const after = await button.boundingBox();
    expect(
      Math.abs(after!.y - before!.y),
      `the clicked button moved from y=${before!.y} to y=${after!.y} after a synced switch`,
    ).toBeLessThanOrEqual(1);
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
