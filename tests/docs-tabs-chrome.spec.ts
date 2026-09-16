import fs from "node:fs";
import { test, expect } from "@playwright/test";
import { crawlBuiltRoot } from "./helpers/crawl";

// The sticky docTabs band, checked against the CONSUMER's real build.
//
// docs-tabs-sidebar.spec.ts already covers the band, but every one of its
// sticky assertions runs against THIS module's bundled fixture, so it
// test.skips on a consumer. That gap is not academic: the band pins itself at
// `--solo-navbar-bottom`, and that variable is derived from HEXTRA's navbar
// (`--navbar-height` + `--hextra-banner-height`). A consumer that hides
// Hextra's navbar and renders its own — agentgateway-oss-website does exactly
// that, via an empty `_partials/navbar.html` override plus a
// `.hextra-nav-container { display: none }` rule — gets two variables that
// describe nothing on the page. There the module resolved 4rem + 2rem = 96px
// against real chrome that ended at 133px, so the band pinned 37px too high:
// it slid ~24px up on the first scroll, came to rest underneath the navbar,
// and had its tab labels clipped off. Nothing in the suite failed, because the
// only specs that look at the band's geometry were skipping.
//
// So this file asserts the two properties a reader actually perceives, and it
// does it WITHOUT naming the chrome above the band. There is no portable
// selector for that — `.hextra-nav-container` on one consumer, `nav.navbar` on
// another — and a spec that guessed would go green by skipping on whichever
// consumer it guessed wrong for, which is the failure mode that let this
// through in the first place. Both checks below read only the band itself plus
// what the browser paints, so they hold for any navbar a consumer ships.
//
// A consumer that does not set [[params.docTabs]] renders no band and skips.

const BAND_MARKER = "docs-tabs-band";

// Pages that actually render a band. Read from the built HTML rather than from
// `target.pages`, because a consumer's configured page list is a hand-picked
// sample that need not include a tab page. Hugo alias stubs are excluded for
// free: they are ~300-byte meta-refresh documents that never contain the
// marker, and following one would land the browser on a different URL than the
// one the assertion reports.
//
// Version-root URLs are dropped, and not for a content reason: this harness's
// webServer is `npx serve`, which does not resolve index.html inside a
// directory whose name contains a dot. Ask it for `/docs/kubernetes/1.0.x/`
// and it returns its own 5KB directory LISTING — HTTP 200, no band, no
// redirect — while `/docs/kubernetes/1.0.x/documentation/` serves the real
// 400KB page. Every consumer here names version directories `1.0.x` / `2.2.x`,
// so a spec that crawls URLs instead of using the configured page list walks
// straight into it and reports "no band rendered" for a page whose HTML on disk
// plainly has one. Filtering on the LAST segment only: the dot is a problem in
// the directory that must yield the index, not in its ancestors.
const SERVE_DOTTED_DIR = /\/[^/]*\.[^/]*\/$/;

function bandPages(): string[] {
  return crawlBuiltRoot()
    .filter((p) => !SERVE_DOTTED_DIR.test(p.url))
    .filter((p) => {
      try {
        return fs.readFileSync(p.filePath, "utf8").includes(BAND_MARKER);
      } catch {
        return false;
      }
    })
    .map((p) => p.url);
}

// Spread the sample across the crawl instead of taking the first N. The crawl
// is sorted by URL, so adjacent entries are siblings in one section — two of
// them exercise the same layout twice and would miss a band that only breaks
// under, say, a different width-class or a page with no TOC.
function spread(urls: string[], n: number): string[] {
  if (urls.length <= n) return urls;
  return Array.from({ length: n }, (_, i) => urls[Math.floor((i * urls.length) / n)]);
}

// Geometry of the band as painted, plus whatever the browser says is on top of
// it at a spread of sample points inside its box. `elementFromPoint` is the
// whole trick here: it answers "is the reader actually looking at the band"
// without the spec having to know what else is on the page.
async function bandState(page: import("@playwright/test").Page, marker: string) {
  return page.evaluate((cls) => {
    const band = document.querySelector<HTMLElement>(`.${cls}`);
    if (!band) return null;
    const r = band.getBoundingClientRect();
    if (r.height === 0) return { hidden: true } as const;

    // Sample across the band's width at both its top and bottom inset, 2px in
    // from each edge so the 1px hairline border is never the thing under test.
    // The top row is where an occluding navbar lands; the bottom row catches a
    // band that has been pushed down far enough for something to ride over its
    // lower half.
    const xs = [0.1, 0.3, 0.5, 0.7, 0.9].map((f) => Math.round(r.left + r.width * f));
    const ys = [Math.round(r.top + 2), Math.round(r.bottom - 2)];
    const occluded: Array<{ x: number; y: number; by: string }> = [];
    for (const y of ys) {
      for (const x of xs) {
        const hit = document.elementFromPoint(x, y);
        // The band's own children (.docs-tabs-inner, the tab anchors) are the
        // expected answer, so containment — not identity — is the test.
        if (hit && (hit === band || band.contains(hit))) continue;
        const desc = hit
          ? `${hit.tagName.toLowerCase()}${hit.id ? "#" + hit.id : ""}${
              hit.className && typeof hit.className === "string"
                ? "." + hit.className.trim().split(/\s+/).slice(0, 3).join(".")
                : ""
            }`
          : "(nothing)";
        occluded.push({ x, y, by: desc });
      }
    }

    return {
      hidden: false as const,
      top: Math.round(r.top),
      bottom: Math.round(r.bottom),
      height: Math.round(r.height),
      position: getComputedStyle(band).position,
      scrollY: Math.round(window.scrollY),
      occluded,
    };
  }, marker);
}

test.describe("docTabs band — against the consumer's own build", () => {
  // Three, not one: pages differ in height, in width class, and in whether a
  // TOC rail is present, and the band is emitted by a partial all of them call.
  // One sample would not notice if only some of them broke.
  const SAMPLE = spread(bandPages(), 3);

  test.skip(SAMPLE.length === 0, "consumer renders no docTabs band");
  // 1440 wide: the band only exists at >= 1280px (below that the module sets
  // `display: none` and moves the tabs into the sidebar drawer). 700 tall is
  // deliberately short — a sticky element that never has to hold itself in
  // place proves nothing, and a short viewport guarantees real scroll range on
  // pages that are not especially long.
  test.use({ viewport: { width: 1440, height: 700 } });

  for (const url of SAMPLE) {
    test(`holds one position through a scroll — ${url}`, async ({ page }) => {
      await page.goto(url);
      const atTop = await bandState(page, BAND_MARKER);
      expect(atTop, `no .${BAND_MARKER} rendered at ${url}`).not.toBeNull();
      test.skip(atTop!.hidden, "band is display:none at this viewport");
      expect(atTop!.position, "the band is not sticky").toBe("sticky");

      // Two scroll steps, because the two ways this breaks move the band in
      // OPPOSITE directions and a single sample could miss either. A `top` that
      // is too small lets the band drift UP into the navbar before it catches;
      // a flow clearance that is too small starts the band above its own pin
      // point, so sticky shoves it DOWN on the first paint. Both look like
      // "the tabs move a bit and then stop".
      const seen = [atTop!.top];
      for (const step of [350, 350]) {
        await page.evaluate((n) => window.scrollBy(0, n), step);
        await page.waitForTimeout(150);
        const s = await bandState(page, BAND_MARKER);
        seen.push(s!.top);
      }
      const moved = await page.evaluate(() => Math.round(window.scrollY));
      test.skip(moved === 0, "page is too short to scroll — nothing to hold against");

      expect(
        new Set(seen).size,
        `the band moved while scrolling (tops seen: ${seen.join(" -> ")}px). ` +
          `Its sticky \`top\` is --solo-navbar-bottom; if this consumer does not use ` +
          `Hextra's own navbar it must override that variable to its real chrome height.`,
      ).toBe(1);
    });

    test(`is not painted over by the chrome above it — ${url}`, async ({ page }) => {
      await page.goto(url);
      test.skip((await bandState(page, BAND_MARKER))!.hidden, "band is display:none");

      // Scroll first: at rest the band may sit below its pin point and clear
      // everything by luck. The overlap only shows once sticky has pulled it up
      // against the chrome.
      await page.evaluate(() => window.scrollBy(0, 400));
      await page.waitForTimeout(150);
      const s = await bandState(page, BAND_MARKER);

      expect(
        s!.occluded,
        `something is painted over the tab band at ${s!.occluded.length} of 10 sample points ` +
          `(band box ${s!.top}-${s!.bottom}px). The band sits at z-index 10, so anything ` +
          `positioned above that covers it — most likely the navbar, because the band pinned ` +
          `too high and slid underneath. Occluded at: ` +
          s!.occluded.map((o) => `(${o.x},${o.y}) by ${o.by}`).join("; "),
      ).toEqual([]);
    });
  }
});
