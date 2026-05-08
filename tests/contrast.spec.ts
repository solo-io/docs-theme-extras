import { test, expect, Page } from "@playwright/test";
import fs from "node:fs";
import { target } from "./helpers/target";

// Contrast spec: assert that mermaid SVG <text> nodes have WCAG 2.1 AA
// contrast (>= 4.5:1) against the page background in both light and dark
// themes. Raster image text contrast is out of scope.
//
// The page tested is auto-discovered: walks target.pages and picks the
// first one whose built HTML contains a mermaid block. Skips if none of
// the configured pages have mermaid content.

const MIN_RATIO = 4.5;
const ENABLED = target.shouldRun("contrast");

function findMermaidPage(): string | null {
  for (const p of target.pages) {
    try {
      const html = fs.readFileSync(target.fileForUrl(p.url), "utf8");
      if (/<pre[^>]*class="[^"]*mermaid|class="mermaid"/.test(html)) {
        return p.url;
      }
    } catch {
      continue;
    }
  }
  return null;
}

const MERMAID_PAGE = findMermaidPage();

function parseColor(input: string): [number, number, number] | null {
  const m = input.match(/rgba?\(([^)]+)\)/i);
  if (!m) return null;
  const parts = m[1].split(",").map((s) => parseFloat(s.trim()));
  if (parts.length < 3 || parts.some(Number.isNaN)) return null;
  return [parts[0], parts[1], parts[2]];
}

function relLuminance(rgb: [number, number, number]): number {
  const channels = rgb.map((c) => {
    const v = c / 255;
    return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * channels[0] + 0.7152 * channels[1] + 0.0722 * channels[2];
}

function contrastRatio(
  fg: [number, number, number],
  bg: [number, number, number],
): number {
  const L1 = relLuminance(fg);
  const L2 = relLuminance(bg);
  const [light, dark] = L1 > L2 ? [L1, L2] : [L2, L1];
  return (light + 0.05) / (dark + 0.05);
}

async function readMermaidContrasts(
  page: Page,
): Promise<{ fill: string; bg: string; label: string }[]> {
  return await page.evaluate(() => {
    const out: { fill: string; bg: string; label: string }[] = [];
    document.querySelectorAll("pre.mermaid svg").forEach((svg) => {
      // mermaid wraps actor labels as <text class="actor"><tspan>Label</tspan></text>.
      // The <tspan> child holds the actually-visible fill (black on light,
      // white on dark via the `text.actor>tspan` rule); the outer <text>
      // inherits the actor box fill, which is irrelevant to readability.
      // For other text (edge labels, notes), the <text> fill is the visible
      // one and there's typically no <tspan>. We pick the deepest text-bearing
      // element and read its computed fill.
      const textNodes = svg.querySelectorAll("text");
      // The page background — used as fallback when text floats over the page
      // canvas without a backing rect (e.g., edge labels in sequence diagrams).
      const pageBg = window.getComputedStyle(document.body).backgroundColor;

      const findRectBg = (textEl: Element): string => {
        // Look for a <rect> sibling inside the same <g> parent. mermaid
        // groups each actor's rect + label inside one <g>.
        const group = textEl.closest("g");
        if (group) {
          const rect = group.querySelector(":scope > rect, :scope rect");
          if (rect) {
            const f = window.getComputedStyle(rect).fill;
            if (f && f !== "none") return f;
          }
        }
        return pageBg;
      };

      textNodes.forEach((t) => {
        // Visible fill is the deepest text-bearing element. Try <tspan> first.
        const tspan = t.querySelector("tspan");
        const visibleEl = tspan ?? t;
        const fill = window.getComputedStyle(visibleEl).fill;
        // Skip elements that mermaid hides (display:none, font-size 0, etc).
        const display = window.getComputedStyle(t).display;
        if (display === "none") return;
        out.push({
          fill,
          bg: findRectBg(t),
          label: t.textContent?.slice(0, 30) ?? "",
        });
      });
    });
    return out;
  });
}

async function assertMermaidContrast(page: Page, label: string) {
  await page.waitForTimeout(800); // mermaid renders async
  const samples = await readMermaidContrasts(page);
  expect(samples.length, `no mermaid <text> samples in ${label}`).toBeGreaterThan(0);

  const failures: string[] = [];
  for (const { fill, bg, label: textLabel } of samples) {
    const fg = parseColor(fill);
    const bgRgb = parseColor(bg);
    if (!fg || !bgRgb) {
      // Skip unparseable colors (e.g., oklch which Chromium may emit for
      // some background-color computed styles). The fill should always be
      // an rgb() string for SVG attributes.
      continue;
    }
    const ratio = contrastRatio(fg, bgRgb);
    if (ratio < MIN_RATIO) {
      failures.push(
        `${label}: contrast ${ratio.toFixed(2)} < ${MIN_RATIO} on "${textLabel}" (fg=${fill}, bg=${bg})`,
      );
    }
  }
  expect(failures, failures.join("\n")).toEqual([]);
}

test.describe("mermaid contrast", () => {
  test.skip(!ENABLED, "contrast check disabled in CONFIG");
  test.skip(MERMAID_PAGE === null, "no configured page contains mermaid content");

  test("mermaid text passes WCAG AA in light mode", async ({ page }) => {
    await page.goto(MERMAID_PAGE!);
    await page.evaluate(() => document.documentElement.classList.remove("dark"));
    await assertMermaidContrast(page, "light");
  });

  test("mermaid text passes WCAG AA in dark mode", async ({ page }) => {
    await page.goto(MERMAID_PAGE!);
    await page.evaluate(() => document.documentElement.classList.add("dark"));
    await assertMermaidContrast(page, "dark");
  });
});
