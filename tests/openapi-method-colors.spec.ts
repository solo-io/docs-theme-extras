import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for a CSS override in layouts/_shortcodes/openapi.html
// (Slack #docs, 2026-08-12: Will Krause / Nadine Spies). The shortcode's
// `<style>` block forced every `.opblock-summary-method` badge to the same
// blue (`#4990e2 !important`), which beat Swagger UI's own per-method rules
// (`.opblock.opblock-get .opblock-summary-method` etc.) since none of those
// carry `!important`. Every method badge — GET, POST, PUT, DELETE — rendered
// identically, which is the "harder to read and group methods mentally"
// complaint. The fix drops the background/color override so Swagger UI's
// stock per-method colors show through; this spec pins two of them (GET
// `#61affe`, POST `#49cc90`) and asserts they differ.
//
// The fixture spec (fixture/assets/test/openapi/sample.yaml) declares both a
// GET and a POST operation on the same path for this reason.

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

test.skip(
  !EVERYTHING,
  "openapi-method-colors requires a [[pages]] entry whose URL ends in /everything/",
);

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/i);
  if (!m) return rgb;
  const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

test.describe("openapi shortcode method badges", () => {
  test("GET and POST badges render distinct, method-specific colors", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);

    const container = page.locator("#swagger-ui");
    await expect(container).toBeVisible();
    await expect(container.locator(".opblock-summary-method").first()).toBeVisible({
      timeout: 10_000,
    });

    const getMethod = page.locator(".opblock.opblock-get .opblock-summary-method").first();
    const postMethod = page.locator(".opblock.opblock-post .opblock-summary-method").first();
    await expect(getMethod).toBeVisible();
    await expect(postMethod).toBeVisible();

    const getColor = await getMethod.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );
    const postColor = await postMethod.evaluate(
      (el) => getComputedStyle(el).backgroundColor,
    );

    // Not the old forced-blue override, and not each other.
    expect(rgbToHex(getColor)).not.toBe("#4990e2");
    expect(rgbToHex(postColor)).not.toBe("#4990e2");
    expect(getColor).not.toBe(postColor);

    // Swagger UI's stock per-method palette.
    expect(rgbToHex(getColor)).toBe("#61affe");
    expect(rgbToHex(postColor)).toBe("#49cc90");
  });
});
