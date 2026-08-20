import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Regression guard for a CSS override in layouts/_shortcodes/openapi.html.
// Swagger UI renders its "Example Value" panel as `.opblock-body pre.microlight`
// with its own stylesheet's `background:#333; color:#fff`. The site-wide
// `.content pre { background-color: #fff !important; ... }` rule (which the
// swagger widget inherits, since it renders inside `.content`) overrode that
// background but left the white text untouched, so the example rendered
// white-on-white — invisible except for syntax-colored string values. See
// solo-io/docs#3472, which hit this on the live agentregistry API reference
// and kgateway portal OpenAPI pages, both of which consume this shortcode.
// The fix pins `.swagger-ui .opblock-body pre.microlight` back to Swagger's
// own dark example background, at higher specificity than `.content pre`.

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

test.skip(
  !EVERYTHING,
  "openapi-example-contrast requires a [[pages]] entry whose URL ends in /everything/",
);

function rgbToHex(rgb: string): string {
  const m = rgb.match(/rgba?\(([^)]+)\)/i);
  if (!m) return rgb;
  const [r, g, b] = m[1].split(",").map((s) => parseInt(s.trim(), 10));
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

test.describe("openapi shortcode example value panel", () => {
  test("example value block keeps a dark background behind its white text", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);

    const container = page.locator("#swagger-ui");
    await expect(container).toBeVisible();

    const getBlock = page.locator(".opblock.opblock-get").first();
    await getBlock.locator(".opblock-summary").click();

    const example = getBlock.locator("pre.microlight").first();
    await expect(example).toBeVisible({ timeout: 10_000 });

    const { background, color } = await example.evaluate((el) => {
      const cs = getComputedStyle(el);
      return { background: cs.backgroundColor, color: cs.color };
    });

    // Not the site-wide white-content-pre override, and text stays legible
    // against whatever background it lands on.
    expect(rgbToHex(background)).not.toBe("#ffffff");
    expect(rgbToHex(color)).toBe("#ffffff");
  });
});
