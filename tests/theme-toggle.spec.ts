import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

/**
 * Regression guards for the Hextra theme-toggle dropdown.
 *
 * R1 — CSS @layer cascade conflict (padding + border)
 *   Hextra v0.12+ compiles every hx:* utility class into @layer utilities in
 *   main.css.  When a consumer also loads Tailwind v3 (whose preflight is
 *   unlayered), the unlayered rules always win the cascade regardless of
 *   specificity:
 *
 *     button { padding: 0 }    beats   hx:ltr:pl-3 / hx:ltr:pr-9 / hx:py-1.5
 *     * { border-width: 0 }    beats   hx:border
 *     --tw-shadow: 0 0 #0000   zeros   hx:shadow-lg
 *
 *   Visible symptoms: dropdown buttons have no padding (checkmark overlaps
 *   label text), the dropdown container has no border, no shadow.
 *   Fix: explicit !important overrides in an unlayered stylesheet (e.g.
 *   assets/css/custom.css which PostCSS inlines into styles.css).
 *
 * R2 — backdrop-filter creates a containing block for position:fixed children
 *   The dropdown <ul> has `position:fixed; inset: auto auto 0px 0px`.
 *   Per the CSS spec, any ancestor with a non-none backdrop-filter (or
 *   transform / filter / perspective / will-change:transform) becomes the
 *   containing block for fixed descendants.  switcher-menu.js computes the
 *   dropdown position assuming the containing block is the viewport, so the
 *   dropdown ends up far from the toggle button.
 *   Fix: move backdrop-filter off the nav element onto a ::before
 *   pseudo-element so fixed-position children retain the viewport as their
 *   containing block.
 *
 * R3 — selecting a theme item updates the page state
 *   Basic functional regression: clicking Light / Dark / System in the
 *   dropdown must update the html element's class and the toggle wrapper's
 *   data-theme attribute.  If the JS binding breaks, the page stays in its
 *   original theme regardless of the user's choice.
 */

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

test.skip(
  !EVERYTHING,
  "theme-toggle specs require a [[pages]] entry whose URL ends in /everything/",
);

// ─── helpers ──────────────────────────────────────────────────────────────────

/** Open the first visible hextra-theme-toggle and wait for its options to show. */
async function openDropdown(page: import("@playwright/test").Page) {
  const toggle = page.locator(".hextra-theme-toggle").first();
  const options = page.locator(".hextra-theme-toggle-options").first();
  await expect(toggle).toBeVisible();
  await expect(options).toBeHidden();
  await toggle.click();
  await expect(options).toBeVisible();
  return { toggle, options };
}

// ─── R1: CSS @layer cascade — padding ─────────────────────────────────────────

test.describe("R1: dropdown button padding (CSS @layer cascade guard)", () => {
  // Hextra's hx:ltr:pl-3 (12 px), hx:ltr:pr-9 (36 px), hx:py-1.5 (6 px) live
  // in @layer utilities.  Tailwind v3's unlayered `button { padding: 0 }`
  // preflight wins the cascade when both pipelines run.
  //
  // paddingRight must be large enough to keep the absolute-positioned checkmark
  // <span> (hx:ltr:right-3 = 12 px) from overlapping the label text.

  test("menu item buttons have non-zero left padding", async ({ page }) => {
    await page.goto(EVERYTHING);
    const { options } = await openDropdown(page);

    const btn = options.locator('button[role="menuitemradio"]').first();
    await expect(btn).toBeAttached();

    const pl = await btn.evaluate(
      (el: HTMLElement) => parseFloat(getComputedStyle(el).paddingLeft),
    );
    expect(
      pl,
      `paddingLeft=${pl}px — expected > 0; hx:ltr:pl-3 was overridden by an unlayered button{padding:0} rule (Tailwind v3 preflight)`,
    ).toBeGreaterThan(0);
  });

  test("menu item buttons have enough right padding to clear the checkmark", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    const { options } = await openDropdown(page);

    const btn = options.locator('button[role="menuitemradio"]').first();
    await expect(btn).toBeAttached();

    const pr = await btn.evaluate(
      (el: HTMLElement) => parseFloat(getComputedStyle(el).paddingRight),
    );
    // hx:ltr:pr-9 = 9 × --hx-spacing (0.25 rem × 16 = 4 px) = 36 px.
    // Even half that (18 px) would still keep the checkmark clear.  Flag
    // anything ≤ 8 px as a strong signal that the cascade override is gone.
    expect(
      pr,
      `paddingRight=${pr}px — checkmark will overlap label text; hx:ltr:pr-9 was overridden by an unlayered button{padding:0} rule`,
    ).toBeGreaterThan(8);
  });

  test("menu item buttons have non-zero vertical padding", async ({ page }) => {
    await page.goto(EVERYTHING);
    const { options } = await openDropdown(page);

    const btn = options.locator('button[role="menuitemradio"]').first();
    await expect(btn).toBeAttached();

    const pt = await btn.evaluate(
      (el: HTMLElement) => parseFloat(getComputedStyle(el).paddingTop),
    );
    expect(
      pt,
      `paddingTop=${pt}px — expected > 0; hx:py-1.5 was overridden by unlayered button{padding:0}`,
    ).toBeGreaterThan(0);
  });
});

// ─── R1: CSS @layer cascade — border ──────────────────────────────────────────

test.describe("R1: dropdown container border (CSS @layer cascade guard)", () => {
  // hx:border = border-width: 1px.  Tailwind v3's unlayered `* { border-width:
  // 0; border-style: solid; border-color: … }` preflight zeros the width.
  // The dropdown becomes invisible as a distinct surface — no separation from
  // whatever is behind it.

  test("dropdown container has a visible border", async ({ page }) => {
    await page.goto(EVERYTHING);
    const { options } = await openDropdown(page);

    const bw = await options.evaluate(
      (el: HTMLElement) => parseFloat(getComputedStyle(el).borderTopWidth),
    );
    expect(
      bw,
      `borderTopWidth=${bw}px — expected > 0; hx:border was overridden by an unlayered *{border-width:0} rule (Tailwind v3 preflight)`,
    ).toBeGreaterThan(0);
  });
});

// ─── R2: position:fixed containing block ──────────────────────────────────────

test.describe("R2: dropdown position relative to button (backdrop-filter guard)", () => {
  // switcher-menu.js calls getBoundingClientRect() on the toggle button, then
  // applies translate3d(x, y, 0) to the options <ul>.  The math assumes the
  // <ul>'s containing block is the viewport (position:fixed, inset:auto auto
  // 0 0 baseline).  If any ancestor of the <ul> carries backdrop-filter (or
  // transform / filter), that ancestor becomes the containing block instead,
  // and the computed translate is applied relative to the wrong origin —
  // sending the dropdown far from the button.

  test("dropdown appears adjacent to the toggle button after opening", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    const { toggle, options } = await openDropdown(page);

    const [btnBox, dropBox] = await Promise.all([
      toggle.boundingBox(),
      options.boundingBox(),
    ]);

    expect(btnBox, "toggle button has no bounding box").not.toBeNull();
    expect(dropBox, "dropdown options has no bounding box").not.toBeNull();

    // switcher-menu.js positions the dropdown at buttonBottom + 4 px for
    // location:"top".  Allow generous slack (50 px) for rounding, padding,
    // and border; anything beyond that is a positioning failure.
    const vertGap = Math.abs(dropBox!.y - (btnBox!.y + btnBox!.height));
    expect(
      vertGap,
      [
        `Dropdown top is ${Math.round(vertGap)} px away from button bottom; expected ≤ 50 px.`,
        `Most likely cause: an ancestor of the .hextra-theme-toggle-options`,
        `<ul> (position:fixed) has backdrop-filter applied directly, making it`,
        `the containing block instead of the viewport.`,
        `Fix: move backdrop-filter to a ::before pseudo-element on the nav.`,
      ].join(" "),
    ).toBeLessThan(50);
  });

  test("dropdown stays within the visible viewport", async ({ page }) => {
    await page.goto(EVERYTHING);
    const { options } = await openDropdown(page);

    const dropBox = await options.boundingBox();
    expect(dropBox, "dropdown options has no bounding box").not.toBeNull();

    const vp = page.viewportSize()!;
    expect(
      dropBox!.x,
      "dropdown left edge is outside the left viewport boundary",
    ).toBeGreaterThanOrEqual(-1);
    expect(
      dropBox!.x + dropBox!.width,
      "dropdown right edge extends past the right viewport boundary",
    ).toBeLessThanOrEqual(vp.width + 1);
  });
});

// ─── R3: theme selection updates page state ────────────────────────────────────

test.describe("R3: selecting a theme item updates page state", () => {
  test("clicking Dark adds .dark to <html> and sets data-theme on wrapper", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    // Start from a known light state.
    await page.evaluate(() => document.documentElement.classList.remove("dark"));

    const { toggle, options } = await openDropdown(page);
    await options.locator('button[data-item="dark"]').first().click();

    // Hextra theme.js: document.documentElement.classList.add("dark")
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);

    // Hextra theme.js: btn.parentElement.dataset.theme = theme  (for each toggle)
    const wrapper = toggle.locator("xpath=..");
    await expect(wrapper).toHaveAttribute("data-theme", "dark");
  });

  test("clicking Light removes .dark from <html> and sets data-theme on wrapper", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    // Start from a known dark state.
    await page.evaluate(() => document.documentElement.classList.add("dark"));

    const { toggle, options } = await openDropdown(page);
    await options.locator('button[data-item="light"]').first().click();

    await expect(page.locator("html")).not.toHaveClass(/\bdark\b/);

    const wrapper = toggle.locator("xpath=..");
    await expect(wrapper).toHaveAttribute("data-theme", "light");
  });

  test("clicking System sets data-theme='system' on wrapper", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);

    const { toggle, options } = await openDropdown(page);
    await options.locator('button[data-item="system"]').first().click();

    const wrapper = toggle.locator("xpath=..");
    await expect(wrapper).toHaveAttribute("data-theme", "system");
  });
});
