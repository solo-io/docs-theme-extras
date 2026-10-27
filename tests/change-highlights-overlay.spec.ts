import { test, expect, type Page } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The change-highlights overlay in a browser: assets/js/change-highlights.js
// reading a manifest and painting the page. The build-time switch is
// change-highlights.spec.ts.
//
// WHY THIS EXISTS. Everything the overlay gets wrong is quiet. A fragment it
// cannot place goes to the panel's "not shown" list instead of failing; a
// fragment it places in the WRONG spot looks like a correct highlight; a
// removal marker that leaked text into a code block changes what the copy
// button copies, and nobody looks. The manifest side has unit tests
// (scripts/tests/test_changes_manifest.py). This is the other half.
//
// HOW IT RUNS. The overlay only renders in public-oss-changes (`make
// build-changes`), not in the public-oss tree the suite's web server serves,
// so this spec serves public-oss-changes itself: every request to
// http://changes.test is answered from disk by page.route. The manifest is
// answered the same way, from tests/helpers/change-highlights-manifest.json,
// instead of a git diff, so every expected marker is pinned by that file and
// fixture/content/en/test/v2/change-highlights.md together. Change them
// together.

const ROOT = path.join(__dirname, "..", "public-oss-changes");
const ORIGIN = "http://changes.test";
const PAGE = `${ORIGIN}/test/v2/change-highlights/`;
const NEW_PAGE = `${ORIGIN}/test/v2/change-highlights-new/`;
const UNRELATED_PAGE = `${ORIGIN}/test/v2/everything/`;
const MANIFEST = JSON.parse(
  fs.readFileSync(path.join(__dirname, "helpers", "change-highlights-manifest.json"), "utf8"),
);

// Everything the fixture manifest should produce on PAGE.
const EXPECTED_HIGHLIGHTS = [
  "all",
  "9090,",
  "never",
  "enabled by default",
  "prod",
  "freshly added clause.",
  "with a new ending.",
  // The snippet is reused twice, and the manifest lists its change once.
  "each setting in",
  "each setting in",
  // From the v2 override, matched through its RESOLVED path.
  "with an updated sentence.",
];

async function serve(page: Page, manifest: () => unknown = () => MANIFEST) {
  await page.route("**/*", async (route) => {
    const url = new URL(route.request().url());
    if (url.origin !== ORIGIN) return route.abort();
    if (url.pathname === "/test/_extras/changes.json") {
      return route.fulfill({ json: manifest() });
    }
    let file = path.join(ROOT, decodeURIComponent(url.pathname));
    if (url.pathname.endsWith("/")) file = path.join(file, "index.html");
    if (!file.startsWith(ROOT) || !fs.existsSync(file)) {
      return route.fulfill({ status: 404, body: "" });
    }
    return route.fulfill({ path: file });
  });
}

async function highlights(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const h = CSS.highlights.get("extras-changed");
    return h ? [...h].map((r) => (r as Range).toString()) : [];
  });
}

async function panelText(page: Page): Promise<string | null> {
  return page.evaluate(() => {
    const p = document.querySelector<HTMLElement>(".extras-changes-panel");
    return p && !p.hidden ? p.querySelector(".extras-changes-bar")!.textContent : null;
  });
}

test.describe("change highlights overlay", () => {
  test.skip(
    !fs.existsSync(path.join(ROOT, "test", "v2", "change-highlights", "index.html")),
    "public-oss-changes not built (make build-changes)",
  );

  test.beforeEach(async ({ page }) => {
    // The Hide toggle persists in localStorage; start every test with it on.
    await page.addInitScript(() => {
      try { localStorage.removeItem("extras-change-highlights"); } catch { /* ignore */ }
    });
  });

  test("highlights every added fragment, including every copy of a snippet", async ({ page }) => {
    await serve(page);
    await page.goto(PAGE);
    await expect.poll(() => highlights(page)).toHaveLength(EXPECTED_HIGHLIGHTS.length);
    expect((await highlights(page)).sort()).toEqual([...EXPECTED_HIGHLIGHTS].sort());
  });

  test("ignores manifest entries for files this page is not built from", async ({ page }) => {
    // not-this-page.md adds "The gateway routes", which IS on this page. A
    // highlight there would mean entries leak across pages.
    await serve(page);
    await page.goto(PAGE);
    await expect.poll(() => highlights(page)).toHaveLength(EXPECTED_HIGHLIGHTS.length);
    expect(await highlights(page)).not.toContain("The gateway routes");
  });

  test("puts a removal marker where text was deleted, and none of its text in the page", async ({ page }) => {
    await serve(page);
    await page.goto(PAGE);
    const markers = page.locator(".extras-removed");
    await expect(markers).toHaveCount(2);
    expect(await markers.evaluateAll((els) => els.map((e) => e.getAttribute("data-removed")))).toEqual([
      "backend",
      "--validate=false",
    ]);

    // The first marker sits between "the" and "service", where "backend" was.
    const around = await markers.first().evaluate((m) => ({
      before: m.previousSibling?.textContent?.slice(-4),
      after: m.nextSibling?.textContent?.trimStart().slice(0, 7),
    }));
    expect(around).toEqual({ before: " the", after: "service" });

    // The second marker is inside the code block. A marker is an empty
    // element with a CSS-generated icon, so the code's text, which is what a
    // copy button copies, must be exactly the source line.
    expect((await page.locator("pre code").first().innerText()).trimEnd()).toBe(
      "kubectl apply -f gateway.yaml --namespace prod",
    );
  });

  test("shows the removed text, and the replaced text, on hover", async ({ page }) => {
    await serve(page);
    await page.goto(PAGE);
    const tip = page.locator(".extras-changes-tip");

    await page.locator(".extras-removed").first().hover();
    await expect(tip).toHaveText("Removed: backend");

    const box = await page.evaluate(() => {
      const r = [...CSS.highlights.get("extras-changed")!].find(
        (x) => (x as Range).toString() === "9090,",
      ) as Range;
      const b = r.getBoundingClientRect();
      return { x: b.left + b.width / 2, y: b.top + b.height / 2 };
    });
    await page.mouse.move(box.x, box.y);
    await expect(tip).toHaveText("Was: 8080 by default,");
  });

  test("the panel counts what it placed and lists what it could not", async ({ page }) => {
    await serve(page);
    await page.goto(PAGE);
    await expect.poll(() => panelText(page)).toContain("10 added · 2 removed · 1 not shown");
    const missed = page.locator(".extras-changes-missed");
    await expect(missed).toBeHidden();
    await page.locator('.extras-changes-panel [data-action="details"]').click();
    await expect(missed).toBeVisible();
    await expect(missed).toContainText("CH_NOT_ON_PAGE");
  });

  test("Hide removes every mark, and the choice is stored", async ({ page }) => {
    await serve(page);
    await page.goto(PAGE);
    await expect.poll(() => highlights(page)).toHaveLength(EXPECTED_HIGHLIGHTS.length);

    const toggle = page.locator('.extras-changes-panel [data-action="toggle"]');
    await toggle.click();
    await expect(toggle).toHaveText("Show");
    expect(await highlights(page)).toEqual([]);
    await expect(page.locator(".extras-removed")).toHaveCount(0);

    // The choice is stored, so the next page load starts hidden too.
    expect(await page.evaluate(() => localStorage.getItem("extras-change-highlights"))).toBe("off");

    await toggle.click();
    await expect(toggle).toHaveText("Hide");
    await expect.poll(() => highlights(page)).toHaveLength(EXPECTED_HIGHLIGHTS.length);
    await expect(page.locator(".extras-removed")).toHaveCount(2);
  });

  test("repaints when the manifest changes, without a reload", async ({ page }) => {
    // `changes_manifest.py --watch` rewrites the manifest as an author saves,
    // and the overlay polls for it. Swap the manifest mid-test and expect the
    // marks to follow while the page stays loaded.
    let current: any = MANIFEST;
    await serve(page, () => current);
    await page.goto(PAGE);
    await expect.poll(() => highlights(page)).toHaveLength(EXPECTED_HIGHLIGHTS.length);
    await page.evaluate(() => ((window as any).__sameDocument = true));

    current = JSON.parse(JSON.stringify(MANIFEST));
    current.hash = "fixture-b";
    current.files["fixture/content/en/test/v2/change-highlights.md"].added.push({
      before: "CH_TAB_SECOND. The second tab is",
      text: "unchanged.",
      after: "",
    });
    await expect.poll(() => highlights(page), { timeout: 10_000 }).toContain("unchanged.");
    expect(await page.evaluate(() => (window as any).__sameDocument)).toBe(true);
  });

  test("a new page gets a page-level label, not per-sentence highlights", async ({ page }) => {
    await serve(page);
    await page.goto(NEW_PAGE);
    await expect.poll(() => panelText(page)).toContain("New page");
    expect(await highlights(page)).toEqual([]);
    await expect(page.locator("#content")).toHaveClass(/extras-changed-new/);
  });

  test("a page with no changes shows nothing", async ({ page }) => {
    await serve(page);
    // Wait for the first manifest fetch to land before asserting absence.
    const fetched = page.waitForResponse((r) => r.url().endsWith("/_extras/changes.json"));
    await page.goto(UNRELATED_PAGE);
    await fetched;
    await page.waitForTimeout(200);
    expect(await panelText(page)).toBeNull();
    expect(await highlights(page)).toEqual([]);
  });

  test("with no manifest at all, the page shows nothing and throws nothing", async ({ page }) => {
    // A preview whose manifest step failed (it is continue-on-error in the
    // docs hub workflow) must render exactly like a normal page.
    const errors: string[] = [];
    page.on("pageerror", (e) => errors.push(e.message));
    await serve(page);
    // Registered after serve(): Playwright tries the most recently added
    // matching route first.
    await page.route("**/_extras/changes.json", (route) => route.fulfill({ status: 404, body: "" }));
    await page.goto(PAGE);
    await page.waitForTimeout(500);
    expect(await panelText(page)).toBeNull();
    expect(await highlights(page)).toEqual([]);
    expect(errors).toEqual([]);
  });
});
