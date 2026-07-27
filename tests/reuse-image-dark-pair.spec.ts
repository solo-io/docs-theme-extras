import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Rendered regression guard for the "legacy image pair stacks in dark mode" bug.
//
// The bug: since v0.1.20 a lone `reuse-image` (no srcDark) renders unwrapped so
// it shows in BOTH light and dark mode. Content authored with the pre-srcDark
// pattern — a lone `reuse-image` immediately followed by a separate
// `reuse-image-dark` for the same figure — therefore showed BOTH the light
// image (unwrapped, always visible) and the dark image (.toggle-light, shown by
// `.dark .toggle-light`) stacked on top of each other in dark mode. Light mode
// was unaffected.
//
// The fix: the SINGLE branch of reuse-image tags its wrapper with
// `.reuse-image-nodark`, and docs-theme-extras.css adds
//   `.dark .reuse-image-nodark:has(+ .toggle-light) { display: none; }`
// so the both-modes light image is hidden in dark mode ONLY when a dark-only
// sibling immediately follows it. This makes the legacy two-shortcode pattern
// render one image per mode with no content migration.
//
// This spec asserts computed visibility (not just the emitted class), so it
// proves the CSS actually resolves — including the browser's <p>-restructuring
// of the block-level <div>s, which the raw-HTML string can't confirm. The
// fixture section lives in fixture/assets/conrefs/test/everything.md
// ("Legacy pair (lone reuse-image + separate reuse-image-dark)").

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

test.skip(
  !EVERYTHING,
  "reuse-image-dark-pair specs require a [[pages]] entry whose URL ends in /everything/",
);

// Scope to the RENDERED figures by their wrapper class — the everything page
// also carries a markdown source-display <img> with the same alt prefix, so a
// bare alt selector would match two elements.
const LIGHT = ".reuse-image-nodark img[alt^='MARKER_LEGACY_PAIR_LIGHT']";
const DARK = ".toggle-light img[alt^='MARKER_LEGACY_PAIR_DARK']";

async function setDark(page: import("@playwright/test").Page, on: boolean) {
  await page.evaluate((dark) => {
    document.documentElement.classList.toggle("dark", dark);
  }, on);
}

test.describe("legacy reuse-image + reuse-image-dark pair", () => {
  test("light mode shows only the light image", async ({ page }) => {
    await page.goto(EVERYTHING);
    await setDark(page, false);
    await expect(page.locator(LIGHT).first()).toBeVisible();
    await expect(page.locator(DARK).first()).toBeHidden();
  });

  test("dark mode shows only the dark image (light image is hidden, not stacked)", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    await setDark(page, true);
    // The regression: without the .reuse-image-nodark:has(+ .toggle-light)
    // rule the light image stays visible here and stacks above the dark one.
    await expect(
      page.locator(LIGHT).first(),
      "lone reuse-image light variant must be hidden in dark mode when a reuse-image-dark sibling follows it (else both stack)",
    ).toBeHidden();
    await expect(page.locator(DARK).first()).toBeVisible();
  });

  test("a truly lone reuse-image (no dark sibling) still shows in dark mode", async ({
    page,
  }) => {
    // Guard the OTHER half of the contract: the :has() rule must NOT hide a
    // lone image that has no following dark-only sibling. The auto-versioned
    // image is a bare src with no srcDark and no adjacent reuse-image-dark.
    await page.goto(EVERYTHING);
    await setDark(page, true);
    await expect(
      page
        .locator(".reuse-image-nodark img[alt^='MARKER_AUTO_VERSIONED_IMAGE.']")
        .first(),
      "a lone reuse-image with no dark sibling must remain visible in dark mode",
    ).toBeVisible();
  });
});
