import { test, expect, type Page } from "@playwright/test";
import { isBlockedHostNoise } from "./helpers/blocked-hosts";
import { target } from "./helpers/target";

// Regression guards for the Scalar renderer of layouts/_shortcodes/openapi.html.
// The fixture page (fixture/content/en/test/v2/openapi-scalar.md) puts two
// Scalar viewers on one page, both on fixture/assets/test/openapi/sample.yaml.
//
//   1. No CSP violation under the docs CSP, which has no 'unsafe-eval'. zod
//      probes `Function("")` the first time Scalar validates its config; the
//      shortcode sets zod's `jitless` flag before the bundle loads so the probe
//      never runs. The fixture serves no CSP, so the spec adds the docs one.
//   2. One viewer per mount. Scalar scans the page for `[data-spec-url]` and
//      mounts a second, default viewer on any match; the shortcode uses
//      `data-openapi-url` to avoid that. The bundle loads once per page.
//   3. The viewer follows the site theme. Scalar reads `forceDarkModeState` only
//      when a viewer is created, so the shortcode recreates the viewer when
//      Hextra toggles the `dark` class on <html>.
//
// The selectors and the mode classes (`dark-mode` / `light-mode` on <body>) are
// Scalar internals, pinned to the bundle version in the shortcode. A failure
// here after a Scalar bump means the shortcode needs a look, not the spec.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const PAGE = `${BASE_URL}/v2/openapi-scalar/`;

// The script-src, style-src, and connect-src rules of the solo-io/docs CSP
// (layouts/_partials/custom/head-end.html), trimmed to the hosts a fixture page
// can reach, including the Google Fonts the theme loads. No 'unsafe-eval'.
const CSP = [
  "default-src 'self'",
  "script-src 'self' https://cdnjs.cloudflare.com 'unsafe-inline'",
  "style-src 'self' https://fonts.googleapis.com 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self' https://fonts.gstatic.com data:",
  "connect-src 'self'",
].join("; ");

test.skip(!IS_FIXTURE_TARGET, "openapi-scalar runs against the bundled fixture only");

async function openWithCsp(page: Page) {
  const problems: string[] = [];
  page.on("pageerror", (e) => problems.push(`pageerror: ${e.message}`));
  page.on("console", (msg) => {
    if (msg.type() !== "error") return;
    // A "Failed to load resource" error carries its URL in .location() only.
    // Append it so the blocked-host filter (the harness blocks web-font hosts)
    // can see it, as in browser.spec.ts.
    const url = msg.location()?.url ?? "";
    const txt = `console.error: ${msg.text()}${url ? ` (${url})` : ""}`;
    if (!isBlockedHostNoise(txt)) problems.push(txt);
  });
  await page.route(`**${PAGE}`, async (route) => {
    const response = await route.fetch();
    await route.fulfill({
      response,
      headers: { ...response.headers(), "content-security-policy": CSP },
    });
  });
  await page.addInitScript(() => {
    (window as unknown as { __cspViolations: string[] }).__cspViolations = [];
    document.addEventListener("securitypolicyviolation", (e) => {
      (window as unknown as { __cspViolations: string[] }).__cspViolations.push(
        `${e.violatedDirective} blocked ${e.blockedURI}`,
      );
    });
  });
  await page.goto(PAGE);
  await expect(page.locator(".openapi-scalar .scalar-api-reference")).toHaveCount(2, {
    timeout: 20_000,
  });
  return problems;
}

function bodyMode(page: Page) {
  return page.evaluate(() =>
    document.body.classList.contains("dark-mode")
      ? "dark"
      : document.body.classList.contains("light-mode")
        ? "light"
        : "none",
  );
}

async function pickTheme(page: Page, label: "Light" | "Dark") {
  await page.locator(".hextra-theme-toggle").first().click();
  await page
    .locator(".hextra-theme-toggle-options")
    .first()
    .getByText(label, { exact: true })
    .click();
}

test.describe("openapi shortcode, Scalar renderer", () => {
  test("renders under the docs CSP without violations or console errors", async ({
    page,
  }) => {
    const problems = await openWithCsp(page);
    await page.waitForLoadState("networkidle", { timeout: 10_000 });
    const violations = await page.evaluate(
      () => (window as unknown as { __cspViolations: string[] }).__cspViolations,
    );
    expect(violations, violations.join("\n")).toEqual([]);
    expect(problems, problems.join("\n")).toEqual([]);
  });

  test("mounts one viewer per shortcode call and loads the bundle once", async ({
    page,
  }) => {
    await openWithCsp(page);
    // Every viewer sits inside a shortcode mount; none is a stray
    // auto-mounted one.
    await expect(page.locator(".scalar-api-reference")).toHaveCount(2);
    for (const mount of await page.locator(".openapi-scalar").all()) {
      await expect(mount.locator(".scalar-api-reference")).toHaveCount(1);
    }
    await expect(page.locator('script[src*="standalone.min"]')).toHaveCount(1);
    await expect(page.locator(".openapi-scalar").first()).toContainText("MARKER_OPENAPI");
  });

  test("follows the site theme when the reader toggles it", async ({ page }) => {
    await openWithCsp(page);
    await pickTheme(page, "Light");
    await expect.poll(() => bodyMode(page)).toBe("light");

    await pickTheme(page, "Dark");
    await expect(page.locator("html")).toHaveClass(/\bdark\b/);
    await expect.poll(() => bodyMode(page)).toBe("dark");
    await expect(page.locator(".openapi-scalar .scalar-api-reference")).toHaveCount(2);

    await pickTheme(page, "Light");
    await expect.poll(() => bodyMode(page)).toBe("light");
  });
});
