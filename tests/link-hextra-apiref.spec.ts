import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

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
//   - a `reference/api-*` SIBLING section is not caught by the substring match
//   - agentgateway: an OSS `reference/cel/<subpage>/` path collapses to the
//     single enterprise `/reference/cel/` page, and only for that product

const REUSE_PAGE = "v2/everything";

const OSS = "MARKER_APIREF_OSS";
const ENT = "MARKER_APIREF_ENT";
const AGW = "MARKER_APIREF_AGW";
const NODOUBLE = "MARKER_APIREF_NODOUBLE";
const SIBLING = "MARKER_APIREF_SIBLING";
const CEL_AGW = "MARKER_CELREF_AGW";
const CEL_AGW_YAML = "MARKER_CELREF_AGW_YAML";
const CEL_AGW_PLAIN = "MARKER_CELREF_AGW_PLAIN";
const CEL_OSS = "MARKER_CELREF_OSS";

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

  // `reference/api-kubespec` is a sibling SECTION, not the single-page
  // reference/api, but "reference/api" is a substring of it — so the routing
  // used to mangle it into /reference/api/api-kubespec/…, a URL that exists on
  // no build. Seen in production on the enterprise agentgateway docs:
  // /agentgateway/2026.7.1/security/backend-authn-cross-app-access/ linked to
  // /agentgateway/2026.7.1/reference/api/api-kubespec/policies/.
  test("a reference/api-* sibling section is not routed", () => {
    const href = hrefForMarker(html(), SIBLING);
    expect(href).toBe("/test/v2/reference/api-kubespec/policies/#TypeA");
    expect(href).not.toContain("api/api-kubespec");
  });
});

test.describe("link-hextra reference/cel routing (reuse page)", () => {
  const page = reusePage();
  test.skip(!page, `${REUSE_PAGE} not in this build (consumer target)`);
  if (!page) return;

  const html = () => visibleHtml(page.filePath);

  test("product=agentgateway: the variables subpage collapses to reference/cel", () => {
    expect(hrefForMarker(html(), CEL_AGW)).toBe(
      "/test/v2/reference/cel/#functions-policy-all",
    );
  });

  test("product=agentgateway: the yaml-and-examples subpage collapses too", () => {
    expect(hrefForMarker(html(), CEL_AGW_YAML)).toBe(
      "/test/v2/reference/cel/#examples",
    );
  });

  test("product=agentgateway: a path already at reference/cel is unchanged", () => {
    const href = hrefForMarker(html(), CEL_AGW_PLAIN);
    expect(href).toBe("/test/v2/reference/cel/#functions-policy-all");
    // The collapse must not eat the section itself (…/reference/#anchor).
    expect(href).toContain("/reference/cel/");
  });

  test("no agentgateway signal: the OSS cel subpage path is left untouched", () => {
    expect(hrefForMarker(html(), CEL_OSS)).toBe(
      "/test/v2/reference/cel/variables/#functions-policy-all",
    );
  });
});

// Every assertion above pins the href STRING. That is necessary and it is not
// sufficient, and the gap is the shape of the production bug this spec was
// written for: `/reference/api/api-kubespec/policies/` was a well-formed URL,
// correct-looking in the diff, and existed on no build. A spec that compares
// strings to strings cannot tell the difference, because both sides of the
// comparison are written by the same person at the same time from the same
// wrong idea.
//
// So this block asserts the other half — that each rewritten path resolves to a
// page Hugo actually built, and that the fragment it carries exists on that
// page. The `reference/cel/*` and `reference/api-kubespec/*` fixture pages
// (mirrored into v1, v2 and main) exist for exactly this: they are built with
// `build: {list: never, render: always}` so they stay out of the sidebar and the
// card listings — and therefore out of every other spec's expected counts —
// while still being real files with real anchor ids. Without this block those
// pages carry no test signal at all, and the string assertions above pass
// unchanged if the whole subtree is deleted.
test.describe("link-hextra reference routing: every rewritten target exists", () => {
  const page = reusePage();
  test.skip(!page, `${REUSE_PAGE} not in this build (consumer target)`);
  if (!page) return;

  const MARKERS = [OSS, ENT, AGW, NODOUBLE, SIBLING, CEL_AGW, CEL_AGW_YAML, CEL_AGW_PLAIN, CEL_OSS];

  for (const marker of MARKERS) {
    test(`${marker} lands on a built page whose anchor exists`, () => {
      const href = hrefForMarker(visibleHtml(page.filePath), marker);
      expect(href, `${marker} rendered no href`).not.toBeNull();
      const [urlPath, fragment] = href!.split("#");
      const file = target.fileForUrl(urlPath);
      expect(
        fs.existsSync(file),
        `${marker} points at ${href}, which Hugo did not build (looked for ${file}). ` +
          `A rewrite that produces a well-formed URL for a page that does not ` +
          `exist is the exact production failure this spec exists to catch — ` +
          `either the rewrite is wrong, or the fixture page it targets is missing.`,
      ).toBe(true);
      // Anchor ids are explicit `{#…}` attributes on the fixture pages, not
      // Goldmark slugs: the inbound links carry names like `policy.all` and
      // `TypeA`, which slugify to something else. Match the attribute in either
      // quoting style — `--minify` strips the quotes.
      const html = fs.readFileSync(file, "utf8");
      const idPattern = new RegExp(
        `id=["']?${fragment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}["'\\s>]`,
      );
      expect(
        idPattern.test(html),
        `${marker} points at #${fragment} on ${urlPath}, and no element on that ` +
          `page carries that id. The link resolves and the fragment dangles, ` +
          `which no link checker configured for pages alone will report.`,
      ).toBe(true);
    });
  }
});
