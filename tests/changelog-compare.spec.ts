import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import { target } from "./helpers/target";

// Guards the changelog-compare shortcode (layouts/_shortcodes/changelog-compare.html
// + assets/js/changelog-compare.js) on fixture/content/en/test/v2/changelog-compare.md.
//
// The core promise is that nobody maintains a version list: both dropdowns are
// built from the page's version headings at load time. So the first test
// asserts the options equal the fixture's release headings exactly, in page
// order, which is what breaks if detection or ordering regresses.

const PAGE = "/test/v2/changelog-compare/";
const ALL = ["2.5.0", "2.4.1", "2.4.0", "2.4.0-beta.1", "2.3.2", "2.3.1", "2.3.0"];

function pageBuilt(): boolean {
  try {
    return fs.existsSync(target.fileForUrl(PAGE));
  } catch {
    return false;
  }
}

/** Release headings currently visible, in page order. */
async function visibleReleases(page: Page): Promise<string[]> {
  return page.$$eval(".content h3", (hs) =>
    hs
      .filter((h) => (h as HTMLElement).offsetParent !== null)
      .map((h) => (h.textContent || "").replace(/[#¶]/g, "").trim()),
  );
}

test.describe("changelog-compare", () => {
  test.skip(!pageBuilt(), `${PAGE} is not in this build`);

  test("dropdowns list every release heading, newest first, with nothing hard-coded", async ({ page }) => {
    await page.goto(PAGE);
    const from = page.locator('[data-compare="from"] option');
    const to = page.locator('[data-compare="to"] option');
    expect(await from.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual(ALL);
    expect(await to.evaluateAll((os) => os.map((o) => (o as HTMLOptionElement).value))).toEqual(ALL);
    // The defaults are real version numbers: oldest and newest on the page.
    await expect(page.locator('[data-compare="from"]')).toHaveValue(ALL[ALL.length - 1]);
    await expect(page.locator('[data-compare="to"]')).toHaveValue(ALL[0]);
    // Group headings ("v2.4") are not releases and must not become options.
    expect(await to.evaluateAll((os) => os.map((o) => o.textContent))).not.toContain("v2.4");
    expect(await visibleReleases(page)).toEqual(ALL);
  });

  test("changes from 2.3.2 through 2.4.0 includes both ends", async ({ page }) => {
    await page.goto(PAGE);
    await page.selectOption('[data-compare="from"]', "2.3.2");
    await page.selectOption('[data-compare="to"]', "2.4.0");
    expect(await visibleReleases(page)).toEqual(["2.4.0", "2.4.0-beta.1", "2.3.2"]);
    // The section body goes with its heading: 2.4.1's bug fix is hidden,
    // 2.4.0's table is shown.
    await expect(page.getByText("Fixed the 2.4.1 bug.")).toBeHidden();
    await expect(page.locator(".content table")).toBeVisible();
    // Both group headings still have a visible release under them.
    await expect(page.locator(".content h2", { hasText: "v2.4" })).toBeVisible();
    await expect(page.locator(".content h2", { hasText: "v2.3" })).toBeVisible();
    await expect(page.locator(".changelog-compare-status")).toHaveText(
      "Showing 3 releases, 2.3.2 through 2.4.0.",
    );
    expect(new URL(page.url()).search).toBe("?from=2.3.2&to=2.4.0");
  });

  test("a group with no release in range is hidden; unrelated headings never are", async ({ page }) => {
    await page.goto(PAGE);
    await page.selectOption('[data-compare="from"]', "2.4.0-beta.1");
    await expect(page.locator(".content h2", { hasText: "v2.3" })).toBeHidden();
    await expect(page.locator(".content h2", { hasText: "Changelog entry types" })).toBeVisible();
  });

  test("the through list disables versions older than from", async ({ page }) => {
    await page.goto(PAGE);
    await page.selectOption('[data-compare="from"]', "2.4.0");
    const disabled = await page
      .locator('[data-compare="to"] option')
      .evaluateAll((os) => os.filter((o) => (o as HTMLOptionElement).disabled).map((o) => (o as HTMLOptionElement).value));
    // 2.4.0 itself stays enabled: "from 2.4.0 through 2.4.0" is one release.
    expect(disabled).toEqual(["2.4.0-beta.1", "2.3.2", "2.3.1", "2.3.0"]);
  });

  test("a shared ?from=&to= link restores the filter, and Reset clears it", async ({ page }) => {
    await page.goto(`${PAGE}?from=2.3.1&to=2.3.2`);
    expect(await visibleReleases(page)).toEqual(["2.3.2", "2.3.1"]);
    await page.getByRole("button", { name: "Reset" }).click();
    expect(await visibleReleases(page)).toEqual(ALL);
    expect(new URL(page.url()).search).toBe("");
    await expect(page.getByRole("button", { name: "Reset" })).toBeHidden();
  });

  test("a version section above the shortcode is included, and the toolbar moves above it", async ({ page }) => {
    await page.goto(PAGE);
    const toolbarFirst = await page.evaluate(() => {
      const bar = document.querySelector(".changelog-compare-toolbar");
      const v25 = Array.from(document.querySelectorAll(".content h2")).find((h) =>
        (h.textContent || "").includes("v2.5"),
      );
      return !!bar && !!v25 && !!(bar.compareDocumentPosition(v25) & Node.DOCUMENT_POSITION_FOLLOWING);
    });
    expect(toolbarFirst, "toolbar should sit above the v2.5 heading").toBe(true);
    await page.selectOption('[data-compare="to"]', "2.4.1");
    await expect(page.locator(".content h2", { hasText: "v2.5" })).toBeHidden();
    await expect(page.locator(".changelog-compare-toolbar")).toBeVisible();
  });

  test("filtered releases drop out of the on-page TOC too", async ({ page }) => {
    await page.goto(`${PAGE}?from=2.4.0`);
    const tocLink = page.locator('nav a[href="#230"], aside a[href="#230"]').first();
    if ((await tocLink.count()) === 0) test.skip(true, "fixture TOC does not list h3 headings");
    await expect(tocLink).toBeHidden();
  });
});
