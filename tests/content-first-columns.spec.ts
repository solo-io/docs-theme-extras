import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// The rendered half of the content-first source order (the HTML half is in
// content-first-source-order.spec.ts). docs/single.html emits <article> before
// the sidebar <aside> and the TOC <nav>, and CSS puts them back in their
// columns: `.hextra-sidebar-container { order: -1 }` for the sidebar (the
// `hx:order-first` utility it also carries has no CSS behind it in Hextra's
// build) and `hx:order-last` for the TOC. If either rule goes missing, the
// sidebar renders to the RIGHT of the content, which only a browser can see.

const BASE = target.baseURL.replace(/\/$/, "");
const PAGE_URL = `${BASE}/v3/api/authentication/`;
const BUILT = fs.existsSync(
  path.join(TEST_PRODUCT_ROOT, "v3", "api", "authentication", "index.html"),
);

test.describe("content-first source order keeps the three-column layout", () => {
  test.skip(!BUILT, "fixture page not built");
  test.use({ viewport: { width: 1440, height: 900 } });

  test("sidebar left of the content, TOC right of it", async ({ page }) => {
    await page.goto(PAGE_URL);
    const box = await page.evaluate(() => {
      const r = (sel: string) => {
        const el = document.querySelector(sel) as HTMLElement | null;
        if (!el || getComputedStyle(el).display === "none") return null;
        const b = el.getBoundingClientRect();
        return { left: Math.round(b.left), right: Math.round(b.right) };
      };
      return {
        sidebar: r("aside.hextra-sidebar-container"),
        main: r("main#content"),
        toc: r("nav.hextra-toc"),
      };
    });
    expect(box.sidebar, "sidebar not rendered at 1440px").not.toBeNull();
    expect(box.main, "content column not rendered").not.toBeNull();
    expect(box.sidebar!.right, "sidebar renders right of the content").toBeLessThanOrEqual(
      box.main!.left,
    );
    if (box.toc) {
      expect(box.toc.left, "TOC renders left of the content").toBeGreaterThanOrEqual(
        box.main!.right,
      );
    }
  });
});
