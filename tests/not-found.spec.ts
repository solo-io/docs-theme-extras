import { test, expect } from "@playwright/test";
import { target } from "./helpers/target";

// Behavior tests for layouts/404.html — the version-aware "page not found".
//
// WHAT IT IS FOR. Hextra's stock 404 says "This page could not be found." and
// stops. On a versioned docs site the usual way to reach a 404 is a stale link
// into a version tree (a retired version that no longer builds, or a live one
// where the topic moved), and the page the reader wants normally still exists
// one version segment away. The theme's 404 probes for it with HEAD requests
// and offers the best hit as a link. Reported as
// /agentgateway/2.1.x/install/ui/setup/ 404ing instead of reaching
// /agentgateway/latest/install/ui/setup/.
//
// WHY THESE ASSERTIONS NEED A BROWSER. The ranking runs client-side, because
// 404.html is built once and served for arbitrary paths — the requested URL
// exists only at request time. Reading the built HTML would prove the script
// shipped, not that it picks the right destination, so every case here
// navigates to a genuinely missing URL and reads the rendered result.
//
// HOW THE 404 GETS SERVED AT ALL. `npx serve` (and Firebase) answer an unmatched
// path with <servedRoot>/404.html. Hugo publishes the file under the baseURL
// path instead ("public-<brand>/test/404.html"), so `make build-<brand>` copies
// it up — the same copy solo-io/docs runs in CI. See the Makefile comment.
//
// FIXTURE-ONLY. The candidate paths below are fixture pages, and the fixture's
// `latest` resolves to v2 (hugo-oss.toml declares no linkVersion "latest", so
// 404.html falls back to the first configured entry — which is itself worth
// exercising, since OSS consumers ship numbered-only trees). Against a
// consumer's build these URLs mean nothing, so skip rather than fail.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// The version the fixture's 404 treats as the redirect destination. Asserted
// in the first test rather than assumed, so a fixture config change that moves
// `latest` fails loudly here instead of silently weakening every case below.
const LATEST = "v2";

// A page that exists in v2 and NOT in v1 — the headline case. Requesting it
// under v1 must surface the v2 copy.
const ONLY_IN_LATEST = "card-path";

// A section that exists in BOTH versions, used for the ancestor cases: a
// missing child under it should fall back to the section, not jump versions.
const SHARED_SECTION = "reference";

async function suggestion(page: import("@playwright/test").Page) {
  const box = page.locator("#pnf-suggestions");
  await expect(box).toBeVisible({ timeout: 10_000 });
  const link = box.locator("li a").first();
  return {
    href: await link.getAttribute("href"),
    text: await link.textContent(),
    note: await box.locator("li .pnf-note").first().textContent(),
  };
}

test.describe("version-aware 404", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "candidate paths are fixture pages; meaningless against a consumer build",
  );

  test("a missing path is served the theme's 404 with a 404 status", async ({
    page,
  }) => {
    const res = await page.goto(`${target.baseURL}/${LATEST}/no-such-page-xyz/`);

    // The status matters as much as the body. A soft 404 (200 with an error
    // page) is what tells search engines to index the error page and keeps
    // broken links out of a link checker's error column.
    expect(res?.status(), "missing page did not return HTTP 404").toBe(404);
    await expect(page.locator("h1")).toHaveText("This page could not be found.");
  });

  test("the 404 is not indexable", async ({ page }) => {
    await page.goto(`${target.baseURL}/${LATEST}/no-such-page-xyz/`);
    await expect(page.locator('meta[name="robots"]')).toHaveAttribute(
      "content",
      /noindex/,
    );
  });

  test("a page missing from an older version links its copy in latest", async ({
    page,
  }) => {
    // The reported case, in fixture terms: /test/v1/card-path/ does not exist,
    // /test/v2/card-path/ does.
    await page.goto(`${target.baseURL}/v1/${ONLY_IN_LATEST}/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/${LATEST}/${ONLY_IN_LATEST}/`);
    expect(s.note).toContain("exists in the latest version");
  });

  test("the suggested link actually resolves", async ({ page }) => {
    // Guards the failure mode that would make this feature worse than no
    // feature: confidently offering a second broken link. The probe is
    // supposed to make that impossible, so verify the offer end to end.
    await page.goto(`${target.baseURL}/v1/${ONLY_IN_LATEST}/`);
    const s = await suggestion(page);

    const res = await page.goto(s.href!);
    expect(res?.status(), `suggested link ${s.href} is itself broken`).toBe(200);
  });

  test("a missing child prefers its own version's section over latest", async ({
    page,
  }) => {
    // /test/v1/reference/ exists, so a missing child under it should land the
    // reader on the v1 section rather than pushing them onto v2. A reader on an
    // older version is usually running that version, and a neighbouring page in
    // their own tree beats a parent section whose instructions may not match.
    await page.goto(`${target.baseURL}/v1/${SHARED_SECTION}/no-such-child/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/v1/${SHARED_SECTION}/`);
    expect(s.note).toContain("still in v1");
  });

  test("a wholly unknown path falls back to the latest version root", async ({
    page,
  }) => {
    // Nothing in this path exists in either version, so every ranked candidate
    // misses and only the floor answers.
    await page.goto(`${target.baseURL}/v1/nowhere-at-all/nested/deeper/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/${LATEST}/`);
  });

  test("the floor survives a path deeper than the probe cap", async ({
    page,
  }) => {
    // Regression guard. The candidate list is capped at MAX_PROBES, and a path
    // this deep generates more ancestor candidates than the cap allows. The
    // version root is appended AFTER the slice for exactly this reason; if it
    // is ever moved back inside it, the deepest broken URLs — the ones with the
    // least chance of the reader guessing the right page — are the ones that
    // silently lose their fallback.
    await page.goto(`${target.baseURL}/v1/a/b/c/d/e/f/g/h/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/${LATEST}/`);
  });

  test("a path with no version segment offers nothing and says so plainly", async ({
    page,
  }) => {
    // Outside a version tree there is no version-aware answer to give. The
    // suggestion box must stay hidden rather than render an empty bordered
    // panel, which on an error page reads as a second thing having gone wrong.
    await page.goto(`${target.baseURL}/not-a-version/missing/`);

    await expect(page.locator("h1")).toHaveText("This page could not be found.");
    await expect(page.locator("#pnf-suggestions")).toBeHidden();
    await expect(page.locator("#pnf-status")).toBeHidden();
  });

  // The retired-version lede (`?fromversion=`) is covered in
  // retired-version-notice.spec.ts, alongside the success-path partial that
  // reads the same marker. Kept together on purpose: the two describe one
  // event and their wording has to stay in step.

  test("the documentation home link stays under a topic suggestion", async ({
    page,
  }) => {
    // The escape hatch, and the only route out of the page when JavaScript is
    // unavailable. A section hit is a different KIND of destination from the
    // site root, so offering both is not a duplicate and the link stays.
    await page.goto(`${target.baseURL}/v1/${SHARED_SECTION}/no-such-child/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/v1/${SHARED_SECTION}/`);

    const home = page.locator("#pnf-home");
    await expect(home).toBeVisible();

    const href = await home.getAttribute("href");
    const res = await page.goto(href!);
    expect(res?.status(), `home link ${href} is broken`).toBe(200);
  });

  test("a version-root fallback is named, and replaces the home link", async ({
    page,
  }) => {
    // The reported complaint. When every ranked candidate misses, the floor is
    // a documentation home — and leaving the footer link in place put two
    // links a line apart that both read as "the documentation", one of them
    // labelled with a raw URL the reader cannot evaluate.
    await page.goto(`${target.baseURL}/v1/nowhere-at-all/`);

    const s = await suggestion(page);
    expect(s.href).toBe(`${target.baseURL}/${LATEST}/`);

    // Named after the product rather than printed as a path.
    expect(s.text).toBe("Docs framework test fixture documentation");
    expect(s.href).not.toBe(s.text);

    await expect(page.locator("#pnf-home-line")).toBeHidden();
  });

  test("no uncaught errors while probing", async ({ page }) => {
    // The script fires cross-path fetches on a page that is itself an error
    // response. A rejected probe must degrade to "no suggestion", never to a
    // console error — console-errors.spec.ts crawls built pages and would not
    // reach this one, since it is served only for paths that do not exist.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(String(e)));
    page.on("console", (m) => {
      if (m.type() !== "error") return;
      // "Failed to load resource: … 404" is EXPECTED here and cannot be
      // suppressed. The browser logs it once for the 404 navigation itself,
      // and once per HEAD probe that misses — and probing paths that may not
      // exist is the entire mechanism. Filtering it is not weakening the
      // assertion: a probe rejection surfaces as an unhandled rejection via
      // `pageerror`, which is still caught, and every other console error
      // still fails the test.
      if (/Failed to load resource/.test(m.text())) return;
      errors.push(m.text());
    });

    await page.goto(`${target.baseURL}/v1/${ONLY_IN_LATEST}/`);
    await suggestion(page);

    expect(errors, `console/page errors on the 404:\n${errors.join("\n")}`)
      .toHaveLength(0);
  });
});
