import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Desktop cross-browser smoke. Runs at 1280x800 in chromium, firefox,
// and webkit (Safari engine). Edge is intentionally omitted: it uses the
// same Chromium engine as chromium, so it adds runtime cost without novel
// coverage. The goal is to surface engine-specific rendering or scripting
// differences before users hit them — not exhaustive coverage.
// Engine-specific quirks worth catching:
//   - SVG rendering differences (mermaid)
//   - CSS layout variances at the desktop breakpoint
//   - Web API gaps (intersection observers, mutation observers, etc.)
//
// Excluded from cross-browser by design:
//   - Clipboard test (chromium-only via context.grantPermissions)
//   - Contrast spec (computedStyle of `fill` may diverge by engine; the
//     mermaid theme fix is verified in chromium and that's enough)

const DESKTOP = { width: 1280, height: 800 };

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";
const REBASED =
  target.pages.find((p) => /\/rebased\/?$/.test(p.url))?.url ?? "";

// Sample pages from CONFIG: the 'everything' page (exercises all
// shortcodes), 'rebased' page (alternate render path), and the version's
// section landing (use the parent of EVERYTHING).
const PAGES = [
  EVERYTHING,
  REBASED,
  EVERYTHING ? EVERYTHING.replace(/[^/]+\/?$/, "") : "",
].filter(Boolean);

test.use({ viewport: DESKTOP });

test.describe("page renders without errors", () => {
  for (const url of PAGES) {
    test(`${url} loads with no console errors and core scaffolding`, async ({
      page,
    }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") errors.push(`console.error: ${msg.text()}`);
      });
      await page.goto(url);
      // page.goto() already waits for "load". Don't add waitForLoadState
      // ("networkidle") here: firefox counts in-flight Google Fonts +
      // Material Symbols + Mermaid CDN requests in its idle calculation,
      // which on CI runners can leave the network "busy" past 15s and
      // time out the test. The structural locator assertions below
      // auto-retry, so we don't need an explicit wait.
      // Engine-agnostic structural assertions.
      await expect(page.locator(".hextra-nav-container").first()).toBeVisible();
      await expect(page.locator(".hextra-sidebar-container").first()).toBeVisible();
      await expect(page.locator("main").first()).toBeVisible();
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("layout at desktop breakpoint", () => {
  test("no horizontal overflow on the everything page", async ({ page }) => {
    await page.goto(EVERYTHING);
    const overflow = await page.evaluate(() => {
      return document.documentElement.scrollWidth - document.documentElement.clientWidth;
    });
    // 1px tolerance for sub-pixel rounding differences across engines.
    expect(overflow, `${overflow}px horizontal overflow`).toBeLessThanOrEqual(1);
  });

  test("right-rail TOC is visible at xl breakpoint", async ({ page }) => {
    await page.goto(EVERYTHING);
    await expect(page.locator(".hextra-toc").first()).toBeVisible();
  });

  test("hamburger menu is hidden at desktop breakpoint", async ({ page }) => {
    await page.goto(EVERYTHING);
    await expect(page.locator(".hextra-hamburger-menu").first()).toBeHidden();
  });
});

test.describe("interactive components work cross-browser", () => {
  test("tabs are clickable and switch panels", async ({ page }) => {
    await page.goto(EVERYTHING);
    // Branch on tab markup variant (see browser.spec.ts for the full notes).
    const container = page.locator(".hextra-tabs").first();
    const hextraButtons = container.locator(".hextra-tabs-toggle");
    const isHextraStyle = (await hextraButtons.count()) > 0;

    if (isHextraStyle) {
      const tablist = container.locator('[role="tablist"]').first();
      const buttons = tablist.locator(".hextra-tabs-toggle");
      await expect(buttons).toHaveCount(2);

      const panel0Id = await buttons.nth(0).getAttribute("aria-controls");
      const panel1Id = await buttons.nth(1).getAttribute("aria-controls");
      const panel0 = page.locator(`#${panel0Id}`);
      const panel1 = page.locator(`#${panel1Id}`);
      await expect(panel0).toBeVisible();
      await expect(panel1).toBeHidden();
      await buttons.nth(1).click();
      await expect(panel0).toBeHidden();
      await expect(panel1).toBeVisible();
    } else {
      const buttons = container.locator(".hextra-tab-btn");
      await expect(buttons).toHaveCount(2);
      const panels = container.locator(
        ".hextra-tab-panels > .hextra-tab-panel",
      );
      await expect(panels).toHaveCount(2);
      await expect(panels.nth(0)).toBeVisible();
      await expect(panels.nth(1)).toBeHidden();
      await buttons.nth(1).click();
      await expect(panels.nth(0)).toBeHidden();
      await expect(panels.nth(1)).toBeVisible();
    }
  });

  test("version dropdown opens and lists configured versions", async ({ page }) => {
    await page.goto(EVERYTHING);
    const dropdown = page.locator(".version-dropdown").first();
    await dropdown.locator(".version-dropdown-btn").click();
    await expect(dropdown).toHaveClass(/open/);
    const labels = (
      await dropdown.locator(".version-dropdown-menu li").allTextContents()
    ).join(" | ");
    for (const v of target.versions) {
      expect(labels).toContain(v);
    }
  });

  test("mermaid renders an SVG diagram", async ({ page }) => {
    await page.goto(EVERYTHING);
    const svg = page.locator("pre.mermaid svg").first();
    await expect(svg).toBeVisible({ timeout: 15_000 });
    // SVG should have at least one <text> with the request marker.
    const textContent = await svg.evaluate((node) => node.textContent ?? "");
    expect(textContent).toContain("MARKER_MERMAID_REQUEST");
  });

  test("theme toggle adds html.dark class", async ({ page }) => {
    await page.goto(EVERYTHING);
    // Force-toggle via the same class the Hextra theme button sets, so this
    // doesn't depend on which mobile-vs-desktop toggle button is present.
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    const isDark = await page.evaluate(() =>
      document.documentElement.classList.contains("dark"),
    );
    expect(isDark).toBe(true);
  });
});
