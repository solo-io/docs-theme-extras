import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Browser-only checks: anything that requires real DOM, JS execution, or
// user interaction. Runs in chromium and is currently configured as an
// informational signal (continue-on-error in CI) until flakiness is
// characterized and a hard gate can be established without churn.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");

// Pick representative pages from CONFIG: the first that has /everything/
// in its URL (uses every shortcode the framework cares about) and the
// first that has /rebased/ (alternate render path).
const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";
const REBASED =
  target.pages.find((p) => /\/rebased\/?$/.test(p.url))?.url ?? "";

// The version dropdown test navigates to the first version in target.versions.
const FIRST_VERSION = target.versions[0] ?? "";

test.describe("tabs are clickable and switch panels", () => {
  test("clicking the second tab shows its panel and hides the first", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    // Two tab markup variants exist in the wild:
    //   - Hextra default: [role="tablist"] holds .hextra-tabs-toggle buttons;
    //     aria-controls points at .hextra-tabs-panel by id; data-state="selected"
    //     marks the active tab. There is no shared wrapper class — buttons and
    //     panels are sibling subtrees on the page.
    //   - docs override (solo-io/docs): a .hextra-tabs wrapper holds <nav> with
    //     .hextra-tab-btn buttons and .hextra-tab-panels > .hextra-tab-panel.
    //     Active button carries the literal "active" class; inactive panels
    //     get .hx\:hidden. No ARIA, no data-state.
    // Detect by [role="tablist"] presence and branch — the two interaction
    // models share no assertion shape.
    const hextraTablist = page
      .locator('[role="tablist"]')
      .filter({ has: page.locator(".hextra-tabs-toggle") })
      .first();
    const isHextraStyle = (await hextraTablist.count()) > 0;

    if (isHextraStyle) {
      await expect(hextraTablist).toBeVisible();
      const buttons = hextraTablist.locator(".hextra-tabs-toggle");
      await expect(buttons).toHaveCount(2);

      const panel0Id = await buttons.nth(0).getAttribute("aria-controls");
      const panel1Id = await buttons.nth(1).getAttribute("aria-controls");
      const panel0 = page.locator(`#${panel0Id}`);
      const panel1 = page.locator(`#${panel1Id}`);

      await expect(buttons.nth(0)).toHaveAttribute("data-state", "selected");
      await expect(panel0).toBeVisible();
      await expect(panel1).toBeHidden();

      await buttons.nth(1).click();
      await expect(buttons.nth(1)).toHaveAttribute("data-state", "selected");
      await expect(panel0).toBeHidden();
      await expect(panel1).toBeVisible();
    } else {
      const container = page
        .locator(".hextra-tabs")
        .filter({ has: page.locator(".hextra-tab-btn") })
        .first();
      await expect(container).toBeVisible();

      const buttons = container.locator(".hextra-tab-btn");
      await expect(buttons).toHaveCount(2);

      const panels = container.locator(
        ".hextra-tab-panels > .hextra-tab-panel",
      );
      await expect(panels).toHaveCount(2);

      await expect(buttons.nth(0)).toHaveClass(/\bactive\b/);
      await expect(panels.nth(0)).toBeVisible();
      await expect(panels.nth(1)).toBeHidden();

      await buttons.nth(1).click();
      await expect(buttons.nth(1)).toHaveClass(/\bactive\b/);
      await expect(panels.nth(0)).toBeHidden();
      await expect(panels.nth(1)).toBeVisible();
    }
  });
});

test.describe("version dropdown lists the configured versions", () => {
  test("opens, lists every configured version, and navigates to the first one", async ({ page }) => {
    test.skip(target.versions.length < 2, "needs at least 2 versions to navigate");
    await page.goto(EVERYTHING);
    const dropdown = page.locator(".version-dropdown").first();
    const button = dropdown.locator(".version-dropdown-btn");
    await expect(button).toBeVisible();

    await button.click();
    await expect(dropdown).toHaveClass(/open/);

    const items = dropdown.locator(".version-dropdown-menu li");
    const labels = (await items.allTextContents()).map((s) => s.trim());
    expect(labels.length).toBeGreaterThanOrEqual(target.versions.length);
    for (const v of target.versions) {
      expect(labels.join(" | ")).toContain(v);
    }

    // Click the first-version link inside the menu and confirm navigation.
    const targetHref = `${BASE_URL}/${FIRST_VERSION}`;
    const link = dropdown.locator(`a[href*="${targetHref}"]`).first();
    await link.click();
    await page.waitForURL(new RegExp(`${BASE_URL}/${FIRST_VERSION}/`));
    expect(page.url()).toContain(`${BASE_URL}/${FIRST_VERSION}/`);
  });
});

test.describe("mermaid renders as SVG", () => {
  test("everything page produces an svg under each pre.mermaid", async ({ page }) => {
    await page.goto(EVERYTHING);
    const containers = page.locator("pre.mermaid");
    const count = await containers.count();
    expect(count).toBeGreaterThan(0);
    // mermaid.js converts each <pre class="mermaid"> into either an inline
    // <svg> or wraps it. Wait for the svg to appear under the container.
    for (let i = 0; i < count; i++) {
      await expect(containers.nth(i).locator("svg")).toBeVisible({
        timeout: 10_000,
      });
    }
  });
});

test.describe("dark mode flips mermaid theme", () => {
  test("toggling html.dark re-renders mermaid with new theme colors", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    const svg = page.locator("pre.mermaid svg").first();
    await expect(svg).toBeVisible({ timeout: 10_000 });

    // Capture a representative fill in the default theme.
    const lightFill = await svg.evaluate((node) => {
      const text = node.querySelector("text");
      return text ? window.getComputedStyle(text).fill : null;
    });
    expect(lightFill).not.toBeNull();

    // Force dark mode via the same class the Hextra theme toggle uses.
    await page.evaluate(() => {
      document.documentElement.classList.add("dark");
    });

    // mermaid.html observes this class change and re-renders. Wait for the
    // new svg to mount, then read the new fill. Use a short sleep instead of
    // a class watcher because re-render is async and not promise-bound.
    await page.waitForTimeout(800);
    const darkSvg = page.locator("pre.mermaid svg").first();
    await expect(darkSvg).toBeVisible({ timeout: 10_000 });
    const darkFill = await darkSvg.evaluate((node) => {
      const text = node.querySelector("text");
      return text ? window.getComputedStyle(text).fill : null;
    });
    expect(darkFill).not.toBeNull();

    // The light and dark theme should produce different text fills. If they
    // match, mermaid did not re-theme on the class change.
    expect(darkFill, "mermaid text fill did not change with dark mode").not.toBe(
      lightFill,
    );
  });
});

test.describe("copy-as-markdown button copies the embedded source", () => {
  test("clicking copy populates the clipboard with the script content", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto(EVERYTHING);

    const expected = await page.evaluate(() => {
      const tag = document.querySelector(
        'script[type="text/markdown"].copy-md-source',
      );
      return tag ? (tag.textContent ?? "") : "";
    });
    expect(expected.length).toBeGreaterThan(50);

    // The split button has a primary copy action (.copy-md-btn directly, not
    // the chevron). Click it.
    const copyBtn = page.locator(".copy-md-btn").first();
    await expect(copyBtn).toBeVisible();
    await copyBtn.click();

    // Allow the JS handler to run.
    await page.waitForTimeout(200);
    const clipboard = await page.evaluate(() => navigator.clipboard.readText());
    expect(clipboard.length, "clipboard empty after copy").toBeGreaterThan(50);
    // Trim whitespace differences from server-side templating + JS encoding.
    expect(clipboard.replace(/\s+/g, " ").trim()).toContain(
      expected.replace(/\s+/g, " ").trim().slice(0, 80),
    );
  });
});

test.describe("no console errors during page load", () => {
  for (const url of [EVERYTHING, REBASED]) {
    test(`${url} loads without console errors`, async ({ page }) => {
      const errors: string[] = [];
      page.on("pageerror", (e) => errors.push(`pageerror: ${e.message}`));
      page.on("console", (msg) => {
        if (msg.type() === "error") {
          errors.push(`console.error: ${msg.text()}`);
        }
      });
      await page.goto(url);
      // Give async scripts (mermaid, copy-md, theme) a moment to settle.
      await page.waitForLoadState("networkidle", { timeout: 10_000 });
      await page.waitForTimeout(500);
      expect(errors, errors.join("\n")).toEqual([]);
    });
  }
});

test.describe("long code blocks scroll horizontally", () => {
  // The Hextra code-block <pre> is supposed to use overflow-x: auto so a
  // single long line stays on one line and the reader can horizontally
  // scroll. If the overflow rule is missing or overridden, the line either
  // wraps (changing rendered semantics for shell/JSON) or gets clipped at
  // the viewport edge.
  test("the MARKER_CODE_LONG_LINE block overflows and is scrollable", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);

    // Locate the <pre> that contains the long-line marker.
    const pre = page
      .locator("pre")
      .filter({ hasText: "MARKER_CODE_LONG_LINE" })
      .first();
    await expect(pre).toBeVisible();

    // The block should actually overflow at default desktop viewport. If
    // scrollWidth equals clientWidth, the content fits and we're not really
    // testing scroll — bail loudly so the fixture gets a longer line.
    const dims = await pre.evaluate((el) => ({
      scrollWidth: el.scrollWidth,
      clientWidth: el.clientWidth,
      overflowX: getComputedStyle(el).overflowX,
    }));
    expect(
      dims.scrollWidth,
      `pre is not overflowing: scrollWidth=${dims.scrollWidth} clientWidth=${dims.clientWidth} — fixture line may be too short for the viewport`,
    ).toBeGreaterThan(dims.clientWidth);

    // The pre must allow scrolling. `auto` shows a scrollbar only when
    // needed; `scroll` forces one. Either is acceptable. `hidden`/`visible`
    // would mean the content is clipped or spills out, which is the bug.
    expect(
      ["auto", "scroll"],
      `pre overflow-x is "${dims.overflowX}", expected "auto" or "scroll"`,
    ).toContain(dims.overflowX);

    // Programmatically scroll right and confirm scrollLeft actually moves.
    // A non-scrollable element silently keeps scrollLeft at 0.
    const moved = await pre.evaluate((el) => {
      el.scrollLeft = 200;
      return el.scrollLeft;
    });
    expect(
      moved,
      `setting scrollLeft=200 did not move the pre (got ${moved}); horizontal scroll appears to be blocked`,
    ).toBeGreaterThan(0);
  });
});
