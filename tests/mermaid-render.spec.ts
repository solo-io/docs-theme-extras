import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Browser regression guards for the Mermaid loader fixes
// (layouts/_partials/scripts/mermaid.html + the flash-hide CSS rule in
// docs-theme-extras.css). The existing mermaid coverage in browser.spec.ts
// only asserts "an SVG appears" and "dark mode re-themes" — it does NOT guard
// the two bugs these specs cover:
//
//   1. The inflated-viewBox "speck" bug (solo-io/docs#2762): in Blink/Gecko
//      getBBox() counts a <foreignObject>'s declared width, so Mermaid baked a
//      viewBox up to ~16x the real content and the diagram shrank into a speck
//      in the corner of a huge empty canvas. The loader's reframe() pass
//      recomputes the viewBox from the real getBBox() once the temporary
//      measurement elements are gone, guarded to act only when the declared
//      viewBox is > 1.5x the measured content.
//
//   2. The raw-source flash: deferring the first render widened the window in
//      which <pre class="mermaid"> shows its literal `graph …` source. The CSS
//      rule `pre.mermaid:not([data-processed]) { visibility: hidden }` hides
//      the unprocessed source until Mermaid sets data-processed.
//
// NOTE on coverage limits: #1 is Blink/Gecko-specific and a clean headless
// Chromium often renders correctly even WITHOUT the reframe (which is exactly
// why the bug slipped past review). So the viewBox assertion here verifies the
// post-render invariant the reframe guarantees (declared viewBox tracks the
// real content, not a 16x canvas) rather than proving the reframe fired. It
// will still catch a regression that re-introduces a grossly inflated viewBox.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
void BASE_URL;

const EVERYTHING =
  target.pages.find((p) => /\/everything\/?$/.test(p.url))?.url ?? "";

test.skip(
  !EVERYTHING,
  "mermaid-render specs require a [[pages]] entry whose URL ends in /everything/",
);

test.describe("mermaid viewBox is not inflated (speck bug)", () => {
  test("each rendered diagram's declared viewBox tracks its real content", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    const containers = page.locator("pre.mermaid");
    const count = await containers.count();
    expect(count, "no pre.mermaid blocks on the everything page").toBeGreaterThan(0);

    // Wait for every diagram to render to an <svg>.
    for (let i = 0; i < count; i++) {
      await expect(containers.nth(i).locator("svg")).toBeVisible({ timeout: 10_000 });
    }
    // Give reframe()'s requestAnimationFrame pass time to run after render.
    await page.waitForTimeout(300);

    const ratios = await page.evaluate(() => {
      const out: { vbWidth: number; bbWidth: number; ratio: number }[] = [];
      document.querySelectorAll("pre.mermaid svg").forEach((node) => {
        const svg = node as SVGSVGElement;
        let bb: DOMRect;
        try {
          bb = svg.getBBox();
        } catch {
          return;
        }
        const vb = svg.viewBox && svg.viewBox.baseVal;
        if (!vb || bb.width < 1) return;
        out.push({ vbWidth: vb.width, bbWidth: bb.width, ratio: vb.width / bb.width });
      });
      return out;
    });

    expect(ratios.length, "no measurable mermaid SVGs found").toBeGreaterThan(0);
    for (const r of ratios) {
      // reframe() rewrites the viewBox to bbox.width + 16px padding whenever
      // the declared viewBox exceeds 1.5x the content. A healthy diagram is
      // ~1.0; the bug produced ratios up to ~16. Allow generous headroom (2x)
      // so legitimate padding never flakes, while a grossly inflated canvas
      // (the speck symptom) still trips it.
      expect(
        r.ratio,
        `A mermaid SVG's declared viewBox width (${Math.round(r.vbWidth)}) is ` +
          `${r.ratio.toFixed(1)}x its real content width (${Math.round(r.bbWidth)}) — ` +
          `the inflated-viewBox speck bug; reframe() did not normalize it.`,
      ).toBeLessThanOrEqual(2);
    }
  });
});

test.describe("mermaid raw source is hidden until rendered (flash bug)", () => {
  test("an unprocessed pre.mermaid is visibility:hidden, a processed one is visible", async ({
    page,
  }) => {
    await page.goto(EVERYTHING);
    // The real diagram renders and gets data-processed -> visible.
    const rendered = page.locator("pre.mermaid").first();
    await expect(rendered.locator("svg")).toBeVisible({ timeout: 10_000 });

    const result = await page.evaluate(() => {
      // A genuinely-rendered block carries data-processed and must be visible.
      const processed = document.querySelector("pre.mermaid[data-processed]") as HTMLElement | null;
      const processedVisibility = processed
        ? getComputedStyle(processed).visibility
        : "none-found";

      // Inject a fresh, unprocessed pre.mermaid and read its computed
      // visibility. The CSS rule pre.mermaid:not([data-processed]) must hide
      // it so the literal `graph …` source never flashes before render.
      const probe = document.createElement("pre");
      probe.className = "mermaid";
      probe.textContent = "graph LR; A-->B";
      document.body.appendChild(probe);
      const probeVisibility = getComputedStyle(probe).visibility;
      probe.remove();

      return { processedVisibility, probeVisibility };
    });

    expect(
      result.processedVisibility,
      "a rendered (data-processed) mermaid block is not visible",
    ).toBe("visible");
    expect(
      result.probeVisibility,
      "an unprocessed pre.mermaid is not hidden — the flash-hide CSS rule " +
        "`pre.mermaid:not([data-processed]) { visibility: hidden }` is missing, " +
        "so the raw graph source flashes before Mermaid renders it.",
    ).toBe("hidden");
  });
});
