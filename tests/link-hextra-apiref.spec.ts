import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Regression guard for link-hextra's reference/api enterprise routing
// (v0.1.20). The OSS site serves one `/reference/api/` page, so its
// `#anchor` links are correct as authored. The enterprise site splits the
// reference into subpages (kgateway, solo, portal, waf), so a shared-source
// link to `reference/api/#x` must be rewritten to the right subpage on
// enterprise builds — or it lands on a page where the anchor doesn't exist.
//
// The shortcode routes when either signal marks an enterprise build:
//   - product == "envoy"  (rebase-injected on rebased kgateway/envoy pages)
//   - currentProduct == "kgateway"  (enterprise kgateway site config; covers
//     reuse-based pages that get no rebase-injected product)
// The OSS kgateway.dev config sets neither, so OSS anchors stay untouched.
// A link that already targets a subpage is left alone (no double-up).
//
// The fixture forces each branch through the `product` PARAM (the fixture's
// currentProduct is the site-global "test", not "kgateway", so the
// currentProduct signal can't be exercised per-call — it reaches the SAME
// replace, so the transformation itself is what these markers pin). The
// markers only carry signal on the REUSE page (v2/everything): on the rebase
// page the pipeline overrides the author-supplied `product`, so a rebased
// page's link-hextra product is whatever rebase injects, not what the author
// wrote — which is the mechanism, not a bug.
//
// What this spec pins, on the reuse page:
//   - OSS (no enterprise signal): reference/api anchor left untouched
//   - product=envoy: routed to the kgateway subpage
//   - product=agentgateway: routed to the api subpage
//   - an already-subpaged link is not doubled up

const REUSE_PAGE = "v2/everything";

const OSS = "MARKER_APIREF_OSS";
const ENT = "MARKER_APIREF_ENT";
const AGW = "MARKER_APIREF_AGW";
const NODOUBLE = "MARKER_APIREF_NODOUBLE";

// Strip the copy-as-markdown <script> block before searching — it embeds the
// raw markdown source (the literal shortcode calls and marker names), which
// would otherwise match ahead of the rendered <a>.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// The href of the <a> whose visible text is `marker`
// (`<a href="URL" ...>MARKER</a>`). Returns null if not found.
function hrefForMarker(html: string, marker: string): string | null {
  const m = html.match(
    new RegExp(`href="([^"]*)"[^>]*>\\s*${marker}\\b`),
  );
  return m ? m[1] : null;
}

const reusePage = () => {
  const page = TEST_PAGES.find((p) => p.name === REUSE_PAGE);
  return page ?? null;
};

test.describe("link-hextra reference/api routing (reuse page)", () => {
  const page = reusePage();
  // Against a consumer's own build the fixture page isn't present; skip.
  test.skip(!page, `${REUSE_PAGE} not in this build (consumer target)`);
  if (!page) return;

  const html = () => visibleHtml(page.filePath);

  test("OSS: a reference/api anchor is left untouched (no subpage)", () => {
    expect(hrefForMarker(html(), OSS)).toBe("/test/v2/reference/api/#TypeA");
  });

  test("product=envoy: routed to the kgateway subpage", () => {
    expect(hrefForMarker(html(), ENT)).toBe(
      "/test/v2/reference/api/kgateway/#TypeA",
    );
  });

  test("product=agentgateway: routed to the api subpage", () => {
    expect(hrefForMarker(html(), AGW)).toBe(
      "/test/v2/reference/api/api/#TypeA",
    );
  });

  test("an already-subpaged link is not doubled up", () => {
    const href = hrefForMarker(html(), NODOUBLE);
    expect(href).toBe("/test/v2/reference/api/kgateway/#TypeA");
    // Guard the specific failure mode: the replace must not re-prepend the
    // subpage segment (…/reference/api/kgateway/kgateway/…).
    expect(href).not.toContain("kgateway/kgateway");
  });
});
