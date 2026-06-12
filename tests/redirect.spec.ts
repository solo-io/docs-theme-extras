import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Behavior tests for the `redirect` shortcode at
// layouts/_shortcodes/redirect.html. The shortcode emits a client-side
// redirect: an inline <script> setting window.location, a <noscript>
// meta-refresh fallback, and a visible "Redirecting to …" link.
//
// Fixture-only: the redirect page exists solely in the extras fixture build.
// The static project also runs against consumer sites (agw, kgw) whose builds
// have no such page, so skip there rather than error on a missing file.
// Mirrors the IS_FIXTURE_TARGET gate in conditional-block.spec / version-cards.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The redirect page is read from disk, never navigated in a browser — the
// inline window.location would otherwise bounce the page. It is deliberately
// kept out of the harness [[pages]] list (static.spec treats those as
// comprehensive marker pages) and resolved by direct path here.
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2/redirect/index.html");

// Both invocations resolve to the same real fixture page: the url= form is
// used as-is; the path= form ("/everything/") is resolved through
// utils/page-context.html to the page's section prefix ("/test/v2").
const TARGET = "/test/v2/everything/";

// Strip the copy-as-markdown <script> so its embedded raw markdown source
// (which re-renders the "Redirecting to [..](..)" line and link-rewrites the
// href to /test/test/…) can't produce false positives against the assertions.
function visibleHtml(): string {
  return readFixture(PAGE).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Return the HTML region a single redirect invocation rendered into: from its
// leading HTML-comment marker up to (but not including) the next marker, or
// end of <main> if it's the last one.
function regionFor(html: string, marker: string, nextMarker?: string): string {
  const start = html.indexOf(marker);
  expect(start, `${marker} not found in page`).toBeGreaterThanOrEqual(0);
  const endNeedle = nextMarker ?? "</main>";
  const end = html.indexOf(endNeedle, start + marker.length);
  expect(end, `${endNeedle} not found after ${marker}`).toBeGreaterThanOrEqual(0);
  return html.slice(start, end);
}

// Hugo escapes forward slashes inside <script> bodies ("\/test\/…"). Drop the
// backslashes before matching the JS string so the assertion targets the URL,
// not the escaping.
function unescapeJs(s: string): string {
  return s.replace(/\\\//g, "/");
}

test.describe("redirect shortcode", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: redirect page exists only in the extras fixture build");

  test("url= form emits script, noscript meta-refresh, and visible link", () => {
    const region = regionFor(visibleHtml(), "MARKER_REDIRECT_URL", "MARKER_REDIRECT_PATH");

    // Inline JS redirect to the verbatim url= value.
    expect(
      unescapeJs(region),
      "no window.location.href redirect to the url= target",
    ).toContain(`window.location.href = "${TARGET}"`);

    // No-JS fallback: a zero-delay meta refresh to the same URL.
    expect(region, "no <noscript> meta-refresh fallback").toMatch(
      new RegExp(`<noscript>\\s*<meta http-equiv="refresh" content="0; url=${TARGET}">`),
    );

    // Human-visible link for crawlers / users who follow neither.
    expect(region, "no visible 'Redirecting to' link").toContain(
      `<p>Redirecting to <a href="${TARGET}">${TARGET}</a>...</p>`,
    );
  });

  test("path= form resolves the section prefix via page-context", () => {
    const region = regionFor(visibleHtml(), "MARKER_REDIRECT_PATH");

    // The source wrote path="/everything/". It must resolve to the page's
    // section prefix (/test/v2) + path, i.e. the same TARGET as the url=
    // form — proving page-context resolution ran, not a bare "/everything/".
    expect(
      unescapeJs(region),
      "path= did not resolve to the section-prefixed URL",
    ).toContain(`window.location.href = "${TARGET}"`);
    expect(region, "path= visible link is not section-prefixed").toContain(
      `<a href="${TARGET}">${TARGET}</a>`,
    );

    // Guard against a regression where path= leaks unresolved: the bare,
    // unprefixed path must NOT appear as the redirect href.
    expect(
      region,
      "redirect href is the bare unresolved path — page-context prefix was not applied",
    ).not.toMatch(/href="\/everything\/"/);
  });
});
