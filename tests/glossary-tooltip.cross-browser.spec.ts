import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

const PAGE = "/test/v2/glossary-term/";
const TERM = '[data-glossary-term="Data Plane"]';
// Longer than HIDE_DELAY in assets/js/glossary.js (200ms).
const HIDE_WAIT = 400;

test.skip(
  !target.name.startsWith("docs-theme-extras-fixture"),
  "requires the bundled glossary fixture",
);

test.beforeEach(async ({ page }) => {
  await page.goto(PAGE);
  await page.mouse.move(0, 0);
});

for (const placement of ["above", "below"] as const) {
  test(`the tooltip stays open across the gap ${placement} the term and its text can be selected`, async ({ page }) => {
    const term = page.locator(TERM).filter({ hasText: "proxy layer" });
    const tip = term.locator(".tooltip-content");
    await expect(term).toHaveCount(1);
    // The short fixture needs scroll room to place the term near the viewport
    // top and exercise the tooltip's below-term placement.
    await page.evaluate(() => { document.body.style.paddingBottom = "100vh"; });
    await term.evaluate((element, top) => {
      window.scrollTo({
        top: window.scrollY + element.getBoundingClientRect().top - top,
        behavior: "instant",
      });
    }, placement === "below" ? 90 : 350);
    await term.hover();
    await expect(tip).toBeVisible();
    if (placement === "below") await expect(tip).toHaveClass(/tooltip-below/);
    else await expect(tip).not.toHaveClass(/tooltip-below/);

    const trigger = (await term.boundingBox())!;
    const tooltip = (await tip.boundingBox())!;
    const x = trigger.x + trigger.width / 2;
    const gap = placement === "above"
      ? (tooltip.y + tooltip.height + trigger.y) / 2
      : (trigger.y + trigger.height + tooltip.y) / 2;
    await page.mouse.move(x, gap, { steps: 8 });
    // Wait past glossary.js's hide delay, so the bridge itself must hold the
    // tooltip open rather than a pending hide that has not fired yet.
    await page.waitForTimeout(HIDE_WAIT);
    await expect(tip, "closed while crossing the gap").toBeVisible();

    const definition = (await tip.locator("span").boundingBox())!;
    await page.mouse.move(definition.x + 5, definition.y + 8, { steps: 8 });
    await expect(tip, "closed on entering the definition").toBeVisible();
    await page.mouse.down();
    await page.mouse.move(definition.x + 100, definition.y + 8, { steps: 10 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection()?.toString())).toBeTruthy();
    // Selecting the definition can focus its parent. An outside click must
    // dismiss it even when that focus was keeping it open.
    await page.locator("h1").first().click();
    await expect(tip).toBeHidden();
  });
}

test("the tooltip opens below the sticky navbar, not underneath it", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  const nav = page.locator(".hextra-nav-container");
  await page.evaluate(() => { document.body.style.paddingBottom = "100vh"; });
  const navBox = (await nav.boundingBox())!;
  const navBottom = navBox.y + navBox.height;
  await term.hover();
  const tipHeight = (await tip.boundingBox())!.height;
  await page.mouse.move(0, navBottom + 200);
  await expect(tip).toBeHidden();
  // Leave room for the tooltip above the term inside the window (40px from
  // its top edge), but not below the navbar, which is taller than 40px.
  expect(navBottom).toBeGreaterThan(48);
  await term.evaluate((element, top) => {
    window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - top, behavior: "instant" });
  }, tipHeight + 8 + 40);
  await term.hover();
  await expect(tip).toBeVisible();
  await expect(tip).toHaveClass(/tooltip-below/);
  expect((await tip.boundingBox())!.y).toBeGreaterThanOrEqual(navBottom);
});

test("an open tooltip slides under the sticky navbar on scroll", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  const nav = page.locator(".hextra-nav-container");
  await page.evaluate(() => { document.body.style.paddingBottom = "100vh"; });
  await term.focus();
  await expect(tip).toBeVisible();
  const navBox = (await nav.boundingBox())!;
  // Scroll the term up under the navbar; focus keeps the tooltip open.
  await term.evaluate((element) => {
    window.scrollTo({ top: window.scrollY + element.getBoundingClientRect().top - 10, behavior: "instant" });
  });
  await expect(tip).toBeVisible();
  const y = navBox.y + navBox.height / 2;
  // The scroll listener repositions the tooltip after the scroll lands.
  await expect.poll(async () => (await tip.boundingBox())!.y, {
    message: "tooltip should overlap the navbar for this check",
  }).toBeLessThan(y);
  const box = (await tip.boundingBox())!;
  const onTop = await page.evaluate(([x, y]) => {
    const el = document.elementFromPoint(x, y);
    return el ? !!el.closest(".hextra-nav-container") : false;
  }, [box.x + box.width / 2, y]);
  expect(onTop, "tooltip painted over the navbar").toBe(true);
});

// A term narrower than its tooltip (kagent's "A2A" is 28px wide) is left from
// its side on a diagonal path toward Learn more, outside the gap bridge.
test("the tooltip survives a diagonal path that leaves the term from its side", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  await term.hover();
  await expect(tip).toBeVisible();
  const trigger = (await term.boundingBox())!;
  const link = (await tip.getByRole("link", { name: "Learn more" }).boundingBox())!;
  // Step off the term's left edge at its own height, then into the link.
  await page.mouse.move(trigger.x - 4, trigger.y + trigger.height / 2);
  await page.mouse.move(link.x + link.width / 2, link.y + link.height / 2, { steps: 4 });
  await page.waitForTimeout(HIDE_WAIT);
  await expect(tip, "closed on a diagonal path into the tooltip").toBeVisible();
});

test("the tooltip still closes when the pointer leaves and does not reach it", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  await term.hover();
  await expect(tip).toBeVisible();
  const trigger = (await term.boundingBox())!;
  await page.mouse.move(trigger.x - 4, trigger.y + trigger.height / 2);
  await page.waitForTimeout(HIDE_WAIT);
  await expect(tip).toBeHidden();
});

test("keyboard focus can enter the Learn more link without closing the tooltip", async ({ page, browserName }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  const link = tip.getByRole("link", { name: "Learn more" });
  await term.focus();
  await expect(tip).toBeVisible();
  await term.hover();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(HIDE_WAIT);
  await expect(tip, "pointer leave must not hide focused content").toBeVisible();
  // Safari's default keyboard preference skips links on Tab, so WebKit moves
  // focus directly. The other engines take the real Tab path.
  if (browserName === "webkit") await link.focus();
  else await page.keyboard.press("Tab");
  await expect(link).toBeFocused();
  await expect(tip).toBeVisible();
  await page.keyboard.press("Tab");
  await expect(tip).toBeHidden();
});

test("Escape dismisses the tooltip while its link is focused", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  await term.focus();
  const link = tip.getByRole("link", { name: "Learn more" });
  await link.focus();
  await expect(link).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
});

test("a tooltip dismissed with Escape does not stick open on a later hover", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  await term.focus();
  await page.keyboard.press("Escape");
  await expect(tip).toBeHidden();
  await term.hover();
  await expect(tip).toBeVisible();
  await page.mouse.move(0, 0);
  await expect(tip, "focus kept a dismissed tooltip open").toBeHidden();
});

test("a focused term gets its tooltip back after another term is hovered", async ({ page }) => {
  const focused = page.locator(TERM).nth(0);
  const hovered = page.locator(TERM).nth(1);
  await focused.focus();
  await hovered.hover();
  await expect(hovered.locator(".tooltip-content")).toBeVisible();
  await expect(focused.locator(".tooltip-content")).toBeHidden();
  await page.mouse.move(0, 0);
  await expect(hovered.locator(".tooltip-content")).toBeHidden();
  await expect(focused.locator(".tooltip-content")).toBeVisible();
});

// Intended: a click focuses the term (tabindex="0"), and focus keeps the
// tooltip open so its text and link stay reachable after the pointer leaves.
test("a clicked term keeps its tooltip open until focus leaves", async ({ page }) => {
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  const tip = term.locator(".tooltip-content");
  await term.click();
  await page.mouse.move(0, 0);
  await page.waitForTimeout(HIDE_WAIT);
  await expect(tip).toBeVisible();
  await page.locator("h1").first().click();
  await expect(tip).toBeHidden();
});

test("the Learn more link is clickable from the hovered tooltip", async ({ page, context }) => {
  await context.route("https://example.com/data-plane", (route) => route.fulfill({
    contentType: "text/html",
    body: "<h1>Glossary destination</h1>",
  }));
  const term = page.locator(TERM).filter({ hasText: "proxy layer" });
  await term.hover();
  const popup = page.waitForEvent("popup");
  await term.getByRole("link", { name: "Learn more" }).click();
  await expect((await popup).getByRole("heading", { name: "Glossary destination" })).toBeVisible();
});

test.describe("touch interaction", () => {
  test.use({ viewport: { width: 390, height: 844 }, hasTouch: true });

  test("tap toggles the tooltip and tapping Learn more follows its link", async ({ page, context }) => {
    await context.route("https://example.com/data-plane", (route) => route.fulfill({
      contentType: "text/html",
      body: "<h1>Glossary destination</h1>",
    }));
    const term = page.locator(TERM).filter({ hasText: "proxy layer" });
    const tip = term.locator(".tooltip-content");
    await term.tap();
    await expect(tip).toBeVisible();
    await term.tap();
    await expect(tip).toBeHidden();
    await term.tap();
    const popup = page.waitForEvent("popup");
    await tip.getByRole("link", { name: "Learn more" }).tap();
    await expect((await popup).getByRole("heading", { name: "Glossary destination" })).toBeVisible();
  });

  test("tapping a term inside a link toggles the tooltip instead of following the link", async ({ page }) => {
    const term = page.locator(TERM).filter({ hasText: "proxy layer" });
    const tip = term.locator(".tooltip-content");
    // Moving the node keeps its listeners, so the wrapped term still behaves
    // like one the shortcode rendered inside a link.
    await term.evaluate((element) => {
      const wrapper = document.createElement("a");
      wrapper.href = "#wrapped";
      element.replaceWith(wrapper);
      wrapper.appendChild(element);
    });
    await term.tap();
    await expect(tip).toBeVisible();
    expect(new URL(page.url()).hash).toBe("");
  });
});
