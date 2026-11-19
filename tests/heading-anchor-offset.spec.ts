import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Anchor links must land the heading BELOW the sticky chrome.
//
// Hextra's render-heading hook puts a Markdown heading's id on an empty child
// span with a fixed -5rem offset, not on the <h2> itself:
//
//   <h2>Title<span class="hx:absolute hx:-mt-20" id="title"></span>…</h2>
//
// That 5rem was sized for Hextra's bare navbar. Under our taller chrome (banner,
// docTabs band) it left the heading text hidden behind the navbar or band, so a
// reader following a link had to scroll up to see the section title. The
// `scroll-margin-top` the theme sets on .content headings did nothing, because
// the heading was never the scroll target. docs-theme-extras.css now gives the
// span the same scroll-margin and pins it to the heading's top edge.
//
// Measured, not computed from --solo-rail-top: the point is to catch the case
// where that variable and the real chrome disagree, too.
//
// Two navigation paths, because they scroll differently:
//   - in-page: setting location.hash (what a TOC or permalink click does)
//   - load:    opening url#id (head-end.html's scrollIntoView on load)
// and two trees: v3 has a docTabs band (desktop only), v2 has none.
//
// Fixture-specific: against a consumer build these pages don't exist, so the
// tests skip themselves.

const BASE = target.baseURL.replace(/\/$/, "");

const PAGES = [
  { label: "with docTabs band", rel: "v3/documentation/getting-started/install/" },
  { label: "without docTabs band", rel: "v2/everything/" },
];

function built(rel: string): boolean {
  return fs.existsSync(path.join(TEST_PRODUCT_ROOT, rel, "index.html"));
}

// Heading ids that come from Hextra's span. Only ones far enough from the end
// of the page to scroll all the way to the top are useful: near the bottom the
// scroll clamps and the heading lands lower, which proves nothing.
async function spanAnchorIds(page: Page, max: number): Promise<string[]> {
  return page.evaluate((max) => {
    const ids = [...document.querySelectorAll<HTMLElement>(
      ".content :is(h2, h3, h4) > span[id]",
    )].map((s) => s.id);
    return ids.slice(0, max);
  }, max);
}

// Where the heading landed and where the sticky chrome ends, after scrolling.
async function measure(page: Page, id: string) {
  return page.evaluate((id) => {
    const span = document.getElementById(id)!;
    // A heading's id sits on a span inside it; a footnote's sits on the <sup>
    // itself. Measure the heading when there is one.
    const heading = (span.closest("h1, h2, h3, h4, h5, h6") as HTMLElement | null) ?? span;
    const shown = (el: Element | null) =>
      el !== null && getComputedStyle(el).display !== "none" &&
      el.getBoundingClientRect().height > 0;
    let chromeBottom = 0;
    for (const sel of [".hextra-nav-container", ".hextra-banner", ".docs-tabs-band"]) {
      const el = document.querySelector(sel);
      if (shown(el)) chromeBottom = Math.max(chromeBottom, el!.getBoundingClientRect().bottom);
    }
    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
    // The visible text box of the heading. Its own top includes padding, so
    // use the first line of text, which is what the reader looks for.
    const range = document.createRange();
    range.selectNodeContents(heading);
    const textTop = range.getClientRects()[0]?.top ?? heading.getBoundingClientRect().top;
    return {
      textTop: Math.round(textTop),
      chromeBottom: Math.round(chromeBottom),
      clamped: window.scrollY >= maxScroll - 1,
      scrollY: Math.round(window.scrollY),
    };
  }, id);
}

for (const width of [1440, 1024]) {
  for (const p of PAGES) {
    test.describe(`heading anchor offset — ${p.label} @ ${width}px`, () => {
      test.skip(!built(p.rel), `fixture page ${p.rel} not built`);
      // Instant scrolling, so a measurement never catches a smooth scroll mid-flight.
      test.use({ viewport: { width, height: 700 }, reducedMotion: "reduce" });

      const url = `${BASE}/${p.rel}`;

      test("in-page hash change lands the heading below the sticky chrome", async ({ page }) => {
        await page.goto(url);
        const ids = await spanAnchorIds(page, 6);
        expect(ids.length, "no Hextra heading anchors on the page").toBeGreaterThan(0);
        let checked = 0;
        for (const id of ids) {
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate((id) => { location.hash = id; }, id);
          await page.waitForTimeout(100);
          const m = await measure(page, id);
          if (m.clamped) continue;
          checked++;
          expect(m.textTop, `#${id}: heading hidden under the sticky chrome (${JSON.stringify(m)})`)
            .toBeGreaterThanOrEqual(m.chromeBottom);
          // Not overshot either: the heading should sit just under the chrome,
          // not half a screen down.
          expect(m.textTop - m.chromeBottom, `#${id}: heading lands too far below the chrome (${JSON.stringify(m)})`)
            .toBeLessThanOrEqual(64);
        }
        expect(checked, "every anchor clamped at the page end; pick a longer page").toBeGreaterThan(0);
      });

      // A real click on the right-rail TOC, not a scripted hash change. Scripts
      // on the page can intercept the click and scroll on their own (the
      // Swagger bundle's zenscroll did, on v2/everything, which embeds the
      // openapi shortcode), and a hash change never goes through them.
      test("clicking a TOC link lands the heading below the sticky chrome", async ({ page }) => {
        test.skip(width < 1280, "right-rail TOC is hidden below xl");
        await page.goto(url);
        const ids = await spanAnchorIds(page, 6);
        let checked = 0;
        for (const id of ids) {
          await page.evaluate(() => window.scrollTo(0, 0));
          const link = page.locator(`a.solo-toc-link[href="#${id}"]`).first();
          if ((await link.count()) === 0) continue;
          await link.click();
          await page.waitForTimeout(600);
          const m = await measure(page, id);
          if (m.clamped) continue;
          checked++;
          expect(m.textTop, `#${id}: TOC click left the heading under the sticky chrome (${JSON.stringify(m)})`)
            .toBeGreaterThanOrEqual(m.chromeBottom);
          expect(m.textTop - m.chromeBottom, `#${id}: TOC click overshot the heading (${JSON.stringify(m)})`)
            .toBeLessThanOrEqual(64);
        }
        expect(checked, "no TOC link clicked; check the a.solo-toc-link selector").toBeGreaterThan(0);
      });

      // The TOC scroll-spy (docs-init.js) must agree with where the jump
      // landed. Its threshold was a fixed 120px, so once the chrome (banner +
      // docTabs band) pushed the landing line past that, the TOC kept the
      // PREVIOUS heading highlighted after every jump.
      test("after an anchor jump the TOC highlights the target heading", async ({ page }) => {
        test.skip(width < 1280, "right-rail TOC is hidden below xl");
        await page.goto(url);
        const ids = await spanAnchorIds(page, 6);
        let checked = 0;
        for (const id of ids.slice(1)) {
          if ((await page.locator(`a.solo-toc-link[href="#${id}"]`).count()) === 0) continue;
          await page.evaluate(() => window.scrollTo(0, 0));
          await page.evaluate((id) => { location.hash = id; }, id);
          await page.waitForTimeout(150);
          const m = await measure(page, id);
          if (m.clamped) continue;
          checked++;
          const active = await page.evaluate(() =>
            document.querySelector(".solo-toc-link.toc-active")?.getAttribute("href"));
          expect(active, `#${id}: TOC highlights ${active} instead (${JSON.stringify(m)})`).toBe(`#${id}`);
        }
        expect(checked, "no TOC-listed anchor checked; pick a longer page").toBeGreaterThan(0);
      });

      test("loading url#id lands the heading below the sticky chrome", async ({ page }) => {
        await page.goto(url);
        const ids = await spanAnchorIds(page, 3);
        let checked = 0;
        for (const id of ids) {
          await page.goto(`${url}#${id}`, { waitUntil: "load" });
          await page.waitForTimeout(150);
          const m = await measure(page, id);
          if (m.clamped) continue;
          checked++;
          expect(m.textTop, `#${id}: heading hidden under the sticky chrome on load (${JSON.stringify(m)})`)
            .toBeGreaterThanOrEqual(m.chromeBottom);
          expect(m.textTop - m.chromeBottom, `#${id}: heading lands too far below the chrome on load (${JSON.stringify(m)})`)
            .toBeLessThanOrEqual(64);
        }
        expect(checked, "every anchor clamped at the page end; pick a longer page").toBeGreaterThan(0);
      });
    });
  }
}

// ── Targets the browser's own anchor scroll can't reach on its own ──────────
//
// v2/anchor-landing is built for these. Each is a case where the link used to
// land in the wrong place, or nowhere:
//   - a heading inside a non-default tab: the browser can't scroll to a hidden
//     element, so the page didn't move and the tab stayed shut
//   - a heading inside a closed details block (Chrome opens it on its own; the
//     script also opens it for browsers that don't)
//   - a footnote back-link, whose target is a <sup>, not a heading
//   - a heading below a Swagger block, which renders late and used to push the
//     heading down after it had landed
// The fixes are the `.content [id]` scroll-margin in docs-theme-extras.css and
// assets/js/core/anchor-landing.js.
const LANDING = "v2/anchor-landing/";

async function expectLanded(page: Page, id: string, how: string) {
  const m = await measure(page, id);
  expect(m.textTop, `${how} #${id}: target hidden under the sticky chrome (${JSON.stringify(m)})`)
    .toBeGreaterThanOrEqual(m.chromeBottom);
  expect(m.textTop - m.chromeBottom, `${how} #${id}: target lands too far below the chrome (${JSON.stringify(m)})`)
    .toBeLessThanOrEqual(64);
}

test.describe("anchor landing — hidden, footnote and late-layout targets", () => {
  test.skip(!built(LANDING), `fixture page ${LANDING} not built`);
  test.use({ viewport: { width: 1440, height: 900 }, reducedMotion: "reduce" });
  const url = `${BASE}/${LANDING}`;

  test("a link to a heading in a non-default tab selects the tab and lands on it", async ({ page }) => {
    await page.goto(url);
    await page.locator('a[href="#config-file-heading"]').first().click();
    await page.waitForTimeout(600);
    await expectLanded(page, "config-file-heading", "click");
  });

  test("following a link into a synced tab keeps the reader's saved tab choice", async ({ page }) => {
    await page.goto(url);
    const key = await page.evaluate(() => {
      const bar = document.querySelector<HTMLElement>(".hextra-tabs-toggle")?.parentElement;
      return bar?.dataset.tabGroup ? "hextra-tab-" + encodeURIComponent(bar.dataset.tabGroup) : null;
    });
    expect(key, "fixture tab group is not synced (tabs.sync front matter)").not.toBeNull();
    // Both starting states: no saved choice, and a saved choice of the first tab.
    for (const saved of [null, "0"]) {
      await page.evaluate(([k, v]) => { v === null ? localStorage.removeItem(k!) : localStorage.setItem(k!, v); }, [key, saved]);
      await page.goto(url);
      await page.locator('a[href="#config-file-heading"]').first().click();
      await page.waitForTimeout(400);
      await expectLanded(page, "config-file-heading", "click");
      const after = await page.evaluate((k) => localStorage.getItem(k), key!);
      expect(after, `link into a synced tab overwrote the saved tab choice (was ${saved})`).toBe(saved);
    }
  });

  test("loading url#id for a heading in a non-default tab selects the tab", async ({ page }) => {
    await page.goto(`${url}#config-file-heading`);
    await page.waitForTimeout(1200);
    await expectLanded(page, "config-file-heading", "load");
  });

  test("history back to a hash in a tab that was switched away re-selects it", async ({ page }) => {
    await page.goto(url);
    await page.evaluate(() => { location.hash = "config-file-heading"; });
    await page.waitForTimeout(400);
    await page.locator("button.hextra-tabs-toggle", { hasText: "UI" }).first().click();
    await page.evaluate(() => { location.hash = "filler-1"; });
    await page.waitForTimeout(400);
    await page.goBack();
    await page.waitForTimeout(600);
    await expectLanded(page, "config-file-heading", "history back");
  });

  test("a heading in a closed details block opens it and lands on it", async ({ page }) => {
    await page.goto(url);
    await page.locator('a[href="#details-heading"]').first().click();
    await page.waitForTimeout(600);
    await expectLanded(page, "details-heading", "click");
    await page.goto(`${url}#details-heading`);
    await page.waitForTimeout(1200);
    await expectLanded(page, "details-heading", "load");
  });

  test("a footnote back-link lands the sentence below the sticky chrome", async ({ page }) => {
    await page.goto(url);
    const back = page.locator('a[href^="#fnref"]').first();
    const href = await back.getAttribute("href");
    await back.click();
    await page.waitForTimeout(600);
    await expectLanded(page, decodeURIComponent(href!.slice(1)), "click");
  });

  test("a heading below a slow Swagger block stays put when Swagger renders", async ({ page }) => {
    // Hold the spec back so Swagger renders well after the hash scroll and
    // window.load, which is when it used to push the heading down.
    await page.route((u) => u.href.includes("openapi/sample.yaml"), async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    // Wait for the SPEC, not for Swagger markup: Swagger draws its .info
    // shell before the spec arrives, so a selector wait returns too early.
    const spec = page.waitForResponse((r) => r.url().includes("openapi/sample.yaml"), { timeout: 15_000 });
    await page.goto(`${url}#after-swagger`);
    await spec;
    await page.waitForTimeout(500);
    await expectLanded(page, "after-swagger", "slow-Swagger load");
  });

  test("a reader who scrolls while late content loads is not pulled back", async ({ page }) => {
    await page.route((u) => u.href.includes("openapi/sample.yaml"), async (route) => {
      await new Promise((r) => setTimeout(r, 2500));
      await route.continue();
    });
    const spec = page.waitForResponse((r) => r.url().includes("openapi/sample.yaml"), { timeout: 15_000 });
    await page.goto(`${url}#after-swagger`);
    await page.waitForTimeout(800);
    await page.mouse.move(700, 500);
    await page.mouse.wheel(0, -600);
    await page.waitForTimeout(300);
    const before = await page.evaluate(() => Math.round(window.scrollY));
    await spec;
    await page.waitForTimeout(500);
    const after = await page.evaluate(() => Math.round(window.scrollY));
    // Swagger is ABOVE the reader's position, so browser scroll anchoring may
    // shift scrollY by Swagger's height; what must not happen is a jump back
    // to the heading, which would put #after-swagger at the top again.
    const m = await measure(page, "after-swagger");
    expect(m.textTop - m.chromeBottom, `reader was pulled back to the heading (scrollY ${before} -> ${after})`)
      .toBeGreaterThan(100);
  });
});

// The rule that positions headings (so the id span's `top: 0` is measured
// against the heading) must not depend on :has(). It once did; a browser
// without :has() (Firefox < 121, Safari < 15.4) dropped it but still applied
// `top: 0`, so the span sat at the top of <body> and every heading link
// scrolled to the top of the page. Chromium supports :has(), so landing tests
// can't see this; check the rule itself.
test("the heading position rule does not depend on :has()", async ({ page }) => {
  test.skip(!built(LANDING), `fixture page ${LANDING} not built`);
  await page.goto(`${BASE}/${LANDING}`);
  const rules = await page.evaluate(() => {
    const out: string[] = [];
    const walk = (list: CSSRuleList) => {
      for (const r of Array.from(list)) {
        if (r instanceof CSSStyleRule) {
          if (r.style.position === "relative" && /\.content\b/.test(r.selectorText) && /\bh2\b/.test(r.selectorText)) out.push(r.selectorText);
        } else if ("cssRules" in r) {
          try { walk((r as CSSGroupingRule).cssRules); } catch { /* cross-origin */ }
        }
      }
    };
    for (const sheet of Array.from(document.styleSheets)) {
      try { walk(sheet.cssRules); } catch { /* cross-origin */ }
    }
    return out;
  });
  expect(rules.length, "no `.content` heading rule sets position: relative").toBeGreaterThan(0);
  for (const sel of rules) expect(sel, `heading position rule is gated on :has(): ${sel}`).not.toContain(":has(");
});
