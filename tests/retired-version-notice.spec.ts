import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Behavior tests for the retired-version notice
// (layouts/partials/docs/retired-version-notice.html) and for the matching
// branch in layouts/404.html.
//
// WHAT THIS COVERS. A retired version is caught by a path-preserving 301 in the
// consumer's hosting config. That redirect is correct but SILENT: the reader
// clicks 2.1.x, the address bar says something else, and nothing accounts for
// the gap. Agentgateway made this sharper by moving version trees under a
// section segment, so a reader is now relocated on two axes at once and the
// destination URL shares almost nothing with the one they clicked.
//
// The hosting rule therefore hands the original version forward as
// `?fromversion=2.1.x`, and two places consume it:
//   - the notice partial, on a SUCCESSFUL landing ("you were moved, here is why")
//   - 404.html, when the topic did not survive either ("and it is gone")
//
// Both then strip the parameter with history.replaceState so the URL a reader
// copies is the canonical one.
//
// FIXTURE-ONLY: the paths and version names below are fixture pages. The
// fixture's `latest` resolves to v2 (hugo-oss.toml declares no linkVersion
// "latest", so the fallback-to-first-entry branch is what runs).
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// A real fixture page, used for every success-path case.
const PAGE = `${target.baseURL}/v2/everything/`;

// A version that exists in params.versions but is NOT the page's own version,
// which is the shape a retired version has after the redirect.
const OLD = "v1";

test.describe("retired-version notice", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "paths and version names are fixture-specific",
  );

  test("no notice on an ordinary page visit", async ({ page }) => {
    // The overwhelmingly common case. A partial that renders an empty box, or
    // any box at all, on every page in the site would be a far worse
    // regression than the problem it solves.
    await page.goto(PAGE);
    await expect(page.locator("#retired-version-notice")).toBeHidden();
  });

  test("names both the version asked for and the one served", async ({
    page,
  }) => {
    await page.goto(`${PAGE}?fromversion=${OLD}`);

    const notice = page.locator("#retired-version-notice");
    await expect(notice).toBeVisible();

    const text = (await notice.textContent())!;
    // Both halves matter. "This version is old" without naming the requested
    // one leaves the reader unable to tell which link was stale, and naming
    // the requested one without the destination does not tell them where
    // they now are.
    expect(text).toContain(OLD);
    expect(text).toContain("no longer published");
    expect(text).toContain("v2");
  });

  test("strips the parameter from the address bar", async ({ page }) => {
    // Otherwise every URL copied off the page carries it, and every one is a
    // separate URL to a crawler for the same page.
    await page.goto(`${PAGE}?fromversion=${OLD}`);
    await expect(page.locator("#retired-version-notice")).toBeVisible();

    expect(page.url()).not.toContain("fromversion");
    expect(new URL(page.url()).pathname).toBe(new URL(PAGE, "http://x").pathname);
  });

  test("preserves any other query parameters while stripping ours", async ({
    page,
  }) => {
    // Firebase MERGES the marker into an existing query string
    // (?fromversion=v1&foo=bar), so the cleanup has to remove one key rather
    // than clear the search string.
    await page.goto(`${PAGE}?foo=bar&fromversion=${OLD}`);
    await expect(page.locator("#retired-version-notice")).toBeVisible();

    const url = new URL(page.url());
    expect(url.searchParams.get("fromversion")).toBeNull();
    expect(url.searchParams.get("foo")).toBe("bar");
  });

  test("ignores a version that is not configured", async ({ page }) => {
    // `fromversion` arrives in a URL and is reader-controlled. It selects a
    // known string and is never itself written into the page, so a crafted
    // value must produce no notice at all.
    await page.goto(`${PAGE}?fromversion=<img src=x onerror=alert(1)>`);

    await expect(page.locator("#retired-version-notice")).toBeHidden();
    // Cleanup still runs, so a junk value does not linger in the address bar.
    expect(page.url()).not.toContain("fromversion");
  });

  test("ignores a marker naming the version already being served", async ({
    page,
  }) => {
    // A self-referential redirect is a config error, not a reader-facing
    // event. Telling somebody they were moved from v2 to v2 is noise.
    await page.goto(`${PAGE}?fromversion=v2`);
    await expect(page.locator("#retired-version-notice")).toBeHidden();
  });

  // ── The allowlist no longer comes only from params.versions ──────────────
  //
  // A retired version is by definition absent from params.versions: its content
  // tree is archived and its entry goes with it. Sourcing the allowlist from
  // that table alone made the entry an invisible obligation, and it was broken
  // in practice — solo-io/docs 94be4fc64 added agentgateway's 2.1.x/2.2.x
  // redirect rules and deleted those entries in the same commit, leaving the
  // redirect working and this notice silently dead, with no build error.
  //
  // utils/retired-versions.html supplies the retired half from three sources.
  // None of the three versions below has a params.versions entry, so each case
  // fails if that partial stops being consulted.

  test("fires for a version named only in params.retiredVersions", async ({
    page,
  }) => {
    // Source 1, the explicit escape hatch: for a consumer whose redirects live
    // somewhere the theme cannot read.
    await page.goto(`${PAGE}?fromversion=v0explicit`);
    const notice = page.locator("#retired-version-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("v0explicit");
  });

  test("fires for a version read out of the Cloudflare _redirects file", async ({
    page,
  }) => {
    // Source 2, and the one that makes retiring a version a single edit: the
    // fixture's _redirects carries `/v0/* /v2/:splat?fromversion=v0 301` and
    // nothing else mentions v0 anywhere. The rule that causes the move is the
    // rule that explains it.
    await page.goto(`${PAGE}?fromversion=v0`);
    const notice = page.locator("#retired-version-notice");
    await expect(notice).toBeVisible();
    await expect(notice).toContainText("v0");
  });

  test("stops the parsed version at the first &", async ({ page }) => {
    // A destination may carry more than one parameter
    // (`?fromversion=v0multi&foo=bar`). Without the `&` terminator the rest of
    // the query string folds into the version, the allowlist entry becomes
    // "v0multi&foo=bar", and the notice silently never matches.
    await page.goto(`${PAGE}?fromversion=v0multi`);
    await expect(page.locator("#retired-version-notice")).toBeVisible();
  });

  test("ignores a version whose redirect rule is commented out", async ({
    page,
  }) => {
    // The fixture's _redirects has `# /v00/* … fromversion=v00` disabled. A
    // rule somebody turned off must stop claiming its version is retired,
    // otherwise commenting one out silently leaves it in the allowlist.
    await page.goto(`${PAGE}?fromversion=v00`);
    await expect(page.locator("#retired-version-notice")).toBeHidden();
  });

  test("ignores a redirect that carries no fromversion marker", async ({
    page,
  }) => {
    // The fixture redirects /moved-page/ with no marker. A moved page is not a
    // retired version, which is why the parameter is opt-in per rule rather
    // than inferred from the source pattern.
    await page.goto(`${PAGE}?fromversion=moved-page`);
    await expect(page.locator("#retired-version-notice")).toBeHidden();
  });

  test("dismisses without navigating", async ({ page }) => {
    await page.goto(`${PAGE}?fromversion=${OLD}`);
    const notice = page.locator("#retired-version-notice");
    await expect(notice).toBeVisible();

    await page.locator("#rvn-dismiss").click();
    await expect(notice).toBeHidden();
    // Still on the same page — the button is not a link.
    expect(new URL(page.url()).pathname).toBe(new URL(PAGE, "http://x").pathname);
  });
});

test.describe("404 states the topic is gone", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "paths and version names are fixture-specific",
  );

  test("without the marker, the lede stays generic", async ({ page }) => {
    await page.goto(`${target.baseURL}/v2/no-such-page-xyz/`);
    const lede = await page.locator("#pnf-lede").textContent();
    expect(lede).toContain("does not exist");
    expect(lede).not.toContain("no longer published");
  });

  test("with the marker, it says the version is gone AND the topic is gone", async ({
    page,
  }) => {
    // The end state of the reported case: 2.1.x was redirected to latest, and
    // the topic did not survive into latest either. Neither half of that is
    // guessable from the URL the reader is looking at, because the redirect
    // rewrote it before this page ever ran.
    await page.goto(`${target.baseURL}/v2/no-such-page-xyz/?fromversion=${OLD}`);

    const lede = (await page.locator("#pnf-lede").textContent())!;
    expect(lede).toContain(OLD);
    expect(lede).toContain("no longer published");
    expect(lede).toContain("sent to v2 instead");
    expect(lede).toContain("not available in v2");

    // The sentence used to end "— it was renamed or removed", which this page
    // has no way to know: all it has is a failed HEAD probe. Asserted as an
    // absence so the claim cannot come back.
    expect(lede).not.toContain("renamed or removed");
  });

  test("the 404 strips the marker too", async ({ page }) => {
    await page.goto(`${target.baseURL}/v2/no-such-page-xyz/?fromversion=${OLD}`);
    await expect(page.locator("#pnf-lede")).toContainText("no longer published");
    expect(page.url()).not.toContain("fromversion");
  });

  test("the retired lede works for a version only the redirects file knows", async ({
    page,
  }) => {
    // 404.html builds CFG.versions from the same two sources as the notice, and
    // it is the harder half to keep honest: the lede is only reached when the
    // topic is gone too, so a regression here shows up on the pages nobody is
    // looking at. v0 exists only in the fixture's _redirects.
    await page.goto(`${target.baseURL}/v2/no-such-page-xyz/?fromversion=v0`);
    const lede = (await page.locator("#pnf-lede").textContent())!;
    expect(lede).toContain("v0");
    expect(lede).toContain("no longer published");
  });

  test("an unconfigured marker leaves the generic lede", async ({ page }) => {
    await page.goto(
      `${target.baseURL}/v2/no-such-page-xyz/?fromversion=not-a-version`,
    );
    const lede = (await page.locator("#pnf-lede").textContent())!;
    expect(lede).not.toContain("not-a-version");
    expect(lede).toContain("does not exist");
  });

  test("suggestions still work alongside the marker", async ({ page }) => {
    // The messaging change must not disturb the ranking, which is the part
    // that actually gets the reader somewhere useful.
    await page.goto(
      `${target.baseURL}/v1/card-path/?fromversion=${OLD}`,
    );
    const box = page.locator("#pnf-suggestions");
    await expect(box).toBeVisible({ timeout: 10_000 });
    await expect(box.locator("li a").first()).toHaveAttribute(
      "href",
      `${target.baseURL}/v2/card-path/`,
    );
  });
});
