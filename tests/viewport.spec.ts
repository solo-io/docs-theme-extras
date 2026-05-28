import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Responsive layout checks across mobile, tablet, and desktop breakpoints.
// Hextra uses Tailwind defaults:
//   - mobile  (< 768)  : hamburger visible, sidebar slides off-screen
//   - tablet  (>= 768) : sidebar in flow, hamburger hidden
//   - desktop (>= 1280): TOC visible (right rail)
//
// Iterates a small representative sample of target.pages — landing pages
// (where versionOf returns null) are skipped because they're section
// landings without a version segment, and the responsive checks below
// target version-page chrome (sidebar, TOC).

const VIEWPORTS = [
  { name: "mobile", width: 375, height: 667 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1280, height: 800 },
] as const;

const ENABLED = target.shouldRun("viewport");

const SAMPLE_PAGES = target.pages
  .filter((p) => target.versionOf(p.url) !== null)
  .slice(0, 3)
  .map((p) => p.url);

const REPRESENTATIVE_PAGE = SAMPLE_PAGES[0] ?? null;

test.describe("viewport responsive layout", () => {
  test.skip(!ENABLED, "viewport check disabled in CONFIG");
  test.skip(REPRESENTATIVE_PAGE === null, "no non-landing pages configured");

  for (const vp of VIEWPORTS) {
    test.describe(`${vp.name} viewport (${vp.width}x${vp.height})`, () => {
      test.use({ viewport: { width: vp.width, height: vp.height } });

      for (const url of SAMPLE_PAGES) {
        test(`${url} renders without horizontal overflow`, async ({ page }) => {
          await page.goto(url);
          // documentElement.scrollWidth > clientWidth means a horizontal
          // scrollbar appeared on the document — almost always a layout bug.
          const overflow = await page.evaluate(() => {
            const el = document.documentElement;
            return el.scrollWidth - el.clientWidth;
          });
          expect(
            overflow,
            `${url} at ${vp.width}x${vp.height}: ${overflow}px horizontal overflow`,
          ).toBeLessThanOrEqual(1);
        });
      }

      test("hamburger menu visibility matches breakpoint", async ({ page }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const hamburger = page.locator(".hextra-hamburger-menu").first();
        // hx:md:hidden hides at >= 768. So mobile shows it, tablet+desktop hide.
        if (vp.width < 768) {
          await expect(hamburger).toBeVisible();
        } else {
          await expect(hamburger).toBeHidden();
        }
      });

      test("sidebar visibility matches breakpoint", async ({ page }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const sidebar = page.locator(".hextra-sidebar-container").first();
        // The partial uses hx:hidden hx:xl:block, so the desktop sidebar
        // is in-viewport only at xl (>=1280). Below that the same element
        // becomes the mobile slide-in panel: position:fixed, transformed
        // off-screen to the left until the hamburger toggles
        // .mobile-sidebar-open, which slides it back in.
        if (vp.width >= 1280) {
          await expect(sidebar).toBeVisible();
          const box = await sidebar.boundingBox();
          expect(box, "sidebar has no bounding box").not.toBeNull();
          expect(box!.x).toBeGreaterThanOrEqual(-1);
          expect(box!.y).toBeGreaterThanOrEqual(-1);
        } else {
          // Below xl, the mobile-panel transform: translateX(-100%) shifts
          // the element fully off the left edge. Check the x-axis bounding
          // box, not toBeHidden — Playwright treats translated elements as
          // visible.
          const box = await sidebar.boundingBox();
          if (box) {
            expect(
              box.x + box.width,
              "sidebar should be off-screen left on mobile/tablet",
            ).toBeLessThanOrEqual(0);
          }
        }
      });

      test("right-rail TOC visibility matches xl breakpoint", async ({ page }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const toc = page.locator(".hextra-toc").first();
        // hx:xl:block — only shown at >= 1280.
        if (vp.width >= 1280) {
          await expect(toc).toBeVisible();
        } else {
          await expect(toc).toBeHidden();
        }
      });

      test("version dropdown remains reachable", async ({ page }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const dropdown = page.locator(".version-dropdown-btn").first();
        // The dropdown lives in the top nav. On mobile the top nav stays
        // visible above the page; the button must still be in the layout.
        await expect(dropdown).toBeAttached();
        const box = await dropdown.boundingBox();
        expect(box, "version dropdown has no box").not.toBeNull();
        expect(box!.width, "version dropdown collapsed to zero width").toBeGreaterThan(0);
      });

      // PR 2394 regression guard: on mobile the version dropdown elided
      // the product-name prefix so the button fits one line in the
      // narrow nav. On tablet and up, the product name is visible again.
      test("version dropdown product-name visibility matches breakpoint", async ({
        page,
      }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const productName = page
          .locator(".version-dropdown-btn .version-product-name")
          .first();
        if (await productName.count() === 0) {
          test.skip(
            true,
            "no .version-product-name in this build (consumer didn't set product name)",
          );
        }
        if (vp.width < 768) {
          await expect(
            productName,
            "product-name should be hidden under 768px to keep the dropdown narrow",
          ).toBeHidden();
        } else {
          await expect(
            productName,
            "product-name should be visible at >=768px",
          ).toBeVisible();
        }
      });

      // PR 2388 regression guard: on mobile, cards must stack (one per row)
      // and stay within the viewport width. The bug was a grid layout that
      // produced multi-column cards on narrow viewports, which overflowed.
      test("cards stack and stay within the viewport", async ({ page }) => {
        await page.goto(REPRESENTATIVE_PAGE!);
        const cards = page.locator(".hextra-cards .hextra-card");
        const count = await cards.count();
        if (count < 2) {
          test.skip(true, "fewer than 2 cards on the sample page");
        }
        const viewportWidth = vp.width;
        // Collect every card's bounding box, then assert none extends
        // past the viewport edge (overflow bug from PR 2388).
        const boxes = await cards.evaluateAll((els) =>
          els.map((el) => el.getBoundingClientRect()).map((r) => ({
            left: r.left,
            right: r.right,
            top: r.top,
            width: r.width,
          })),
        );
        for (const b of boxes) {
          expect(
            b.right,
            `card extends past viewport right edge (${b.right} > ${viewportWidth})`,
          ).toBeLessThanOrEqual(viewportWidth + 1);
        }
        // Mobile-specific: cards should stack vertically. A heuristic that
        // works without coupling to CSS grid internals: no two cards share
        // the same `top` (within a small tolerance) on mobile.
        if (vp.width < 768 && boxes.length >= 2) {
          const tops = boxes.map((b) => Math.round(b.top));
          const uniqueTops = new Set(tops);
          expect(
            uniqueTops.size,
            "cards should stack vertically on mobile (each on its own row)",
          ).toBe(boxes.length);
        }
      });
    });
  }
});

test.describe("mobile hamburger toggles the sidebar", () => {
  test.skip(!ENABLED, "viewport check disabled in CONFIG");
  test.skip(REPRESENTATIVE_PAGE === null, "no non-landing pages configured");
  test.use({ viewport: { width: 375, height: 667 } });

  test("clicking hamburger slides sidebar into view", async ({ page }) => {
    await page.goto(REPRESENTATIVE_PAGE!);
    const sidebar = page.locator(".hextra-sidebar-container").first();
    const hamburger = page.locator(".hextra-hamburger-menu").first();

    // Initial: sidebar offscreen (transform: translateX(-100%) on the
    // mobile-panel — slides off the LEFT edge, not the top).
    let box = await sidebar.boundingBox();
    if (box) {
      expect(box.x + box.width, "sidebar should start off-screen left").toBeLessThanOrEqual(0);
    }

    await hamburger.click();
    // Allow the slide animation to settle.
    await page.waitForTimeout(400);
    box = await sidebar.boundingBox();
    expect(box, "sidebar has no box after hamburger click").not.toBeNull();
    expect(box!.x, "sidebar should slide into view from the left").toBeGreaterThanOrEqual(-1);
  });
});
