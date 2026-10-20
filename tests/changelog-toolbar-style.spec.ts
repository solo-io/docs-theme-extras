import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// The render shortcode's changelog toolbar in a real browser: the CSS in
// docs-theme-extras.css ("Changelog toolbar") and the labels in
// layouts/_shortcodes/render.html. changelog-toolbar.spec.ts checks the markup.
//
// What 0.3.20 fixed, and what each test guards:
//   - the controls sat flush against the callout above them (margin);
//   - Hextra's Tailwind preflight strips <select> borders and padding, so the
//     selector read as plain text with a caret (border, padding);
//   - in dark mode the open option list could draw light text on a white popup
//     (color-scheme: dark);
//   - the bar has to wrap, not scroll, on a phone.
// The page's render_changelog.js is a fixture stub (fixture/static/changelog/)
// that, like the hub's real script, binds only to the two control ids. The test
// serves it by route rather than relying on the build: a consumer that ships the
// real changelog scripts (the docs hub's static/changelog/) wins over this
// module's fixture mount at the same URL, and the real script never sets the
// data-* attributes the last test reads.

const PAGE = "/test/v2/changelog-render/";
const STUB = path.join(__dirname, "..", "fixture", "static", "changelog", "render_changelog.js");

function pageBuilt(): boolean {
  try {
    return fs.existsSync(target.fileForUrl(PAGE));
  } catch {
    return false;
  }
}

async function setDark(page: Page, dark: boolean) {
  await page.evaluate((d) => document.documentElement.classList.toggle("dark", d), dark);
}

test.describe("changelog toolbar styling", () => {
  test.skip(!pageBuilt(), `${PAGE} is not in this build`);

  test.beforeEach(async ({ page }) => {
    await page.route("**/changelog/render_changelog.js", (route) =>
      route.fulfill({ path: STUB, contentType: "text/javascript" }));
    // The consumer's real helpers would fetch changelog data; the stub needs neither.
    await page.route(/\/changelog\/(Renderers|changelog_utils)\.js$/, (route) =>
      route.fulfill({ body: "", contentType: "text/javascript" }));
    await page.goto(PAGE);
  });

  test("the bar has a border and clears the callout above it", async ({ page }) => {
    const bar = page.locator(".changelog-toolbar");
    await expect(bar).toBeVisible();
    const s = await bar.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { border: cs.borderTopWidth, marginTop: parseFloat(cs.marginTop) };
    });
    expect(s.border).toBe("1px");
    expect(s.marginTop, "margin-top").toBeGreaterThan(0);

    // Measure the visible gap to the callout, not just the margin, since a
    // collapsed or overridden margin would still put them flush.
    const callout = page.locator(".changelog-toolbar").locator("xpath=preceding-sibling::*[1]");
    const c = (await callout.boundingBox())!;
    const b = (await bar.boundingBox())!;
    expect(b.y - (c.y + c.height), "gap between callout and toolbar").toBeGreaterThanOrEqual(16);
  });

  test("the selector keeps a border and padding despite Tailwind preflight", async ({ page }) => {
    const s = await page.locator("#solodocs-select-type").evaluate((el) => {
      const cs = getComputedStyle(el);
      return {
        border: cs.borderTopWidth,
        style: cs.borderTopStyle,
        padLeft: parseFloat(cs.paddingLeft),
      };
    });
    expect(s.border).toBe("1px");
    expect(s.style).toBe("solid");
    expect(s.padLeft, "padding-left").toBeGreaterThan(0);
  });

  test("in dark mode the selector and its option list are drawn dark", async ({ page }) => {
    const select = page.locator("#solodocs-select-type");
    await setDark(page, false);
    const light = await select.evaluate((el) => getComputedStyle(el).backgroundColor);

    await setDark(page, true);
    const dark = await select.evaluate((el) => {
      const cs = getComputedStyle(el);
      const opt = getComputedStyle(el.querySelector("option")!);
      return { scheme: cs.colorScheme, bg: cs.backgroundColor, optBg: opt.backgroundColor };
    });
    // color-scheme is what makes the native popup dark in Chrome on Windows
    // and Linux; without it, the light text it inherits lands on white.
    expect(dark.scheme).toBe("dark");
    expect(dark.bg).not.toBe(light);
    expect(dark.optBg).toBe(dark.bg);
  });

  test("the controls still drive the changelog script", async ({ page }) => {
    const out = page.locator("#solodocs-changelogdiv");
    await expect(out).toHaveAttribute("data-view", "minorrelease");
    await expect(out).toHaveAttribute("data-show-open-source", "true");

    await page.locator("#solodocs-select-type").selectOption("chronological");
    await expect(out).toHaveAttribute("data-view", "chronological");

    // Clicking the label text, not the box, must toggle it: the checkbox now
    // sits inside its <label>.
    await page.getByText("Show open source notes").click();
    await expect(out).toHaveAttribute("data-show-open-source", "false");
  });

  test("on a phone the bar wraps instead of overflowing", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    const s = await page.locator(".changelog-toolbar").evaluate((el) => ({
      scroll: el.scrollWidth,
      client: el.clientWidth,
      right: el.getBoundingClientRect().right,
      page: document.documentElement.clientWidth,
    }));
    expect(s.scroll, "toolbar content overflows").toBeLessThanOrEqual(s.client);
    expect(s.right, "toolbar runs past the viewport").toBeLessThanOrEqual(s.page);
  });
});
