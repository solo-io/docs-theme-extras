import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Brand-isolation tests. The other 12 specs verify structure (selectors,
// markers, layout); this one verifies the brand layer actually applied. A
// silent regression where the brand CSS link is missing — or pointing at
// the wrong file — would slip past every other test because the rendered
// HTML structure stays identical. These assertions catch that.
//
// Skip when no brand is declared in the harness config (e.g., a generic
// consumer that isn't using the OSS/enterprise scheme yet).

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

const BRAND = target.brand;

// Per-brand expected fingerprints. Each maps the declared brand to the
// substrings that MUST appear on the page (and the substrings that must
// NOT — to catch a "wrong brand layer loaded" regression).
const EXPECTED: Record<
  "oss" | "enterprise",
  {
    cssIncludes: string;
    cssExcludes: string;
    fontIncludes: string; // Google Font URL fragment (e.g., "Open+Sans")
    fontExcludes: string;
    navbarLogoIncludes: string; // path fragment (e.g., "logo-oss-test")
    bodyFontFamily: RegExp; // matched against computed style
    themePrimary: string; // expected resolved value of --theme-primary in light mode
  }
> = {
  oss: {
    cssIncludes: "brand-oss.css",
    cssExcludes: "brand-enterprise.css",
    fontIncludes: "family=Open+Sans",
    fontExcludes: "family=Nunito",
    navbarLogoIncludes: "logo-oss-test",
    bodyFontFamily: /Open Sans/i,
    themePrimary: "rgb(0, 107, 230)", // hsl(212, 100%, 45%) → 0/107/230
  },
  enterprise: {
    cssIncludes: "brand-enterprise.css",
    cssExcludes: "brand-oss.css",
    fontIncludes: "family=Nunito",
    fontExcludes: "family=Open+Sans",
    navbarLogoIncludes: "solo-light",
    // The enterprise stack starts with -apple-system; computed value usually
    // surfaces a literal "system-ui" or "-apple-system" depending on the
    // browser and OS. Match either marker.
    bodyFontFamily: /(-apple-system|BlinkMacSystemFont|system-ui)/i,
    themePrimary: "rgb(21, 139, 194)", // #158bc2
  },
};

test.describe("brand layer is correctly wired", () => {
  test.skip(
    !BRAND || !EVERYTHING,
    `no brand declared in harness config (target.brand=${JSON.stringify(BRAND)})`,
  );

  const exp = EXPECTED[BRAND as "oss" | "enterprise"];

  test(`${BRAND}: head links the right brand CSS file`, async ({ page }) => {
    await page.goto(EVERYTHING);
    const stylesheets = await page
      .locator('link[rel="stylesheet"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href));
    expect(
      stylesheets.some((h) => h.includes(exp.cssIncludes)),
      `expected a <link> whose href includes ${exp.cssIncludes}; got:\n  ${stylesheets.join("\n  ")}`,
    ).toBe(true);
    expect(
      stylesheets.some((h) => h.includes(exp.cssExcludes)),
      `unexpected <link> for the OTHER brand (${exp.cssExcludes}); got:\n  ${stylesheets.join("\n  ")}`,
    ).toBe(false);
  });

  test(`${BRAND}: head imports the right brand font`, async ({ page }) => {
    await page.goto(EVERYTHING);
    const fontLinks = await page
      .locator('link[href*="fonts.googleapis.com"]')
      .evaluateAll((els) => els.map((e) => (e as HTMLLinkElement).href));
    expect(
      fontLinks.some((h) => h.includes(exp.fontIncludes)),
      `expected a Google Font import including ${exp.fontIncludes}; got:\n  ${fontLinks.join("\n  ")}`,
    ).toBe(true);
    expect(
      fontLinks.some((h) => h.includes(exp.fontExcludes)),
      `unexpected Google Font for the OTHER brand (${exp.fontExcludes})`,
    ).toBe(false);
  });

  test(`${BRAND}: navbar logo points at the brand asset`, async ({ page }) => {
    await page.goto(EVERYTHING);
    // Hextra's navbar emits both light and dark logo <img>s (one is hidden
    // by CSS depending on theme). Assert at least one matches the expected
    // brand fragment.
    const navImgSrcs = await page
      .locator(".hextra-nav-container img")
      .evaluateAll((els) => els.map((e) => (e as HTMLImageElement).src));
    expect(
      navImgSrcs.some((s) => s.includes(exp.navbarLogoIncludes)),
      `expected navbar <img> src including ${exp.navbarLogoIncludes}; got:\n  ${navImgSrcs.join("\n  ")}`,
    ).toBe(true);
  });

  test(`${BRAND}: body computed font-family matches the brand stack`, async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    const fontFamily = await page.evaluate(
      () => getComputedStyle(document.body).fontFamily,
    );
    expect(
      fontFamily,
      `computed body font-family ${JSON.stringify(fontFamily)} doesn't match ${exp.bodyFontFamily}`,
    ).toMatch(exp.bodyFontFamily);
  });

  test(`${BRAND}: --theme-primary CSS var resolves in light mode`, async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    // Force light mode so the assertion is stable. The dark-mode override
    // for --theme-primary lives under `.dark` in brand-{oss,enterprise}.css;
    // we don't assert it here because the system theme can flip the body
    // class on first paint.
    await page.evaluate(() =>
      document.documentElement.classList.remove("dark"),
    );
    const themePrimary = await page.evaluate(() =>
      getComputedStyle(document.documentElement)
        .getPropertyValue("--theme-primary")
        .trim(),
    );
    // Browser computed values normalize colors to rgb() form, but we wrote
    // the brand vars as hex / hsl(). Read the var value through a sentinel
    // element so the browser does the conversion for us.
    const resolved = await page.evaluate(() => {
      const probe = document.createElement("div");
      probe.style.color = "var(--theme-primary)";
      document.body.appendChild(probe);
      const c = getComputedStyle(probe).color;
      probe.remove();
      return c;
    });
    expect(
      resolved,
      `--theme-primary resolved to ${JSON.stringify(resolved)} (raw var value: ${JSON.stringify(themePrimary)}); expected ${exp.themePrimary}`,
    ).toBe(exp.themePrimary);
  });
});
