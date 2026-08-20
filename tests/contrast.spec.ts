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

// ── Real text contrast ──────────────────────────────────────────────────────
// The mermaid block above only ever sampled SVG <text>, which is why an
// enterprise link color that could not reach 4.5:1 against ANY background
// (#158bc2 caps at 3.82:1 even on pure white) shipped unnoticed, along with
// `.content a` rules that emitted one light-mode color for BOTH schemes.
//
// This block samples the accent-colored text the theme actually paints — links,
// active tab labels, banner links — and asserts each clears its WCAG floor
// against its real, composited background, in light and dark mode.
//
// Two measurement details are load-bearing:
//   1. Transitions are disabled before reading. Several rules transition
//      `color`, so a computed style read right after the class flip returns a
//      mid-interpolation value (`.sidebar-link` reports its LIGHT gray for
//      ~150ms), which produces phantom failures.
//   2. Backgrounds are alpha-composited up the ancestor chain. The dark alert
//      and banner fills are `hsla(..., 0.1)`, so the element's own computed
//      background-color is not what the eye sees.

// WCAG 1.4.3: 3:1 for large text (>=24px, or >=18.66px bold), else 4.5:1.
// Icons and borders are non-text (1.4.11, 3:1) and are not sampled here.
const LARGE_PX = 24;
const LARGE_BOLD_PX = 18.66;

// Selectors for text the THEME colors with its accent/link tokens. Body text
// and headings inherit Hextra's prose colors and are out of scope.
const ACCENT_TEXT_SELECTORS = [
  ".content a",
  ".version-banner a",
  ".docs-tab-active",
  ".hextra-tabs-toggle",
  ".sidebar-mobile-tab-active",
  ".sidebar-link",
].join(", ");

type Sample = {
  fg: [number, number, number];
  bg: [number, number, number] | null;
  size: number;
  weight: number;
  text: string;
  where: string;
};

async function readTextContrasts(
  page: Page,
  scheme: "light" | "dark",
): Promise<Sample[]> {
  await page.evaluate((s) => {
    document.documentElement.classList.toggle("dark", s === "dark");
    let st = document.getElementById("__contrast_no_transitions");
    if (!st) {
      st = document.createElement("style");
      st.id = "__contrast_no_transitions";
      st.textContent =
        "*,*::before,*::after{transition:none !important;animation:none !important}";
      document.head.appendChild(st);
    }
  }, scheme);

  return await page.evaluate((sel) => {
    const parse = (input: string): [number, number, number, number] | null => {
      const m = input.match(/rgba?\(([^)]+)\)/i);
      if (!m) return null;
      const p = m[1].split(",").map((x) => parseFloat(x.trim()));
      if (p.length < 3 || p.some(Number.isNaN)) return null;
      return [p[0], p[1], p[2], p[3] ?? 1];
    };
    // Composite this element's fill over its ancestors' until alpha hits 1.
    const effBg = (start: Element): [number, number, number] | null => {
      const layers: [number, number, number, number][] = [];
      for (let n: Element | null = start; n; n = n.parentElement) {
        const c = parse(getComputedStyle(n).backgroundColor);
        if (!c || c[3] === 0) continue;
        layers.push(c);
        if (c[3] === 1) break;
      }
      if (!layers.length) return null;
      const base = layers[layers.length - 1];
      let out: [number, number, number] = [base[0], base[1], base[2]];
      for (let i = layers.length - 2; i >= 0; i--) {
        const [r, g, b, a] = layers[i];
        out = [
          r * a + out[0] * (1 - a),
          g * a + out[1] * (1 - a),
          b * a + out[2] * (1 - a),
        ];
      }
      return out;
    };
    const label = (el: Element): string => {
      for (const c of [
        "version-banner",
        "solo-alert",
        "docs-tab-active",
        "hextra-tabs-toggle",
        "sidebar-mobile-tab-active",
        "sidebar-link",
        "swagger-ui",
        "content",
      ]) {
        if (el.closest("." + c)) return c;
      }
      return el.tagName.toLowerCase();
    };

    const out: Sample[] = [];
    for (const el of Array.from(document.querySelectorAll(sel))) {
      const cs = getComputedStyle(el);
      if (cs.visibility === "hidden" || cs.display === "none") continue;
      if (!(el.textContent || "").trim()) continue;
      const fg = parse(cs.color);
      if (!fg) continue;
      out.push({
        fg: [fg[0], fg[1], fg[2]],
        bg: effBg(el),
        size: parseFloat(cs.fontSize),
        weight: Number(cs.fontWeight) || 400,
        text: (el.textContent || "").trim().slice(0, 30),
        where: label(el),
      });
    }
    return out;
  }, ACCENT_TEXT_SELECTORS) as unknown as Sample[];
}

// Sample every configured page that has accent text; dedupe identical
// color/background/size combos so the assertion cost tracks the number of
// distinct visual states, not the number of pages.
const TEXT_PAGES = target.pages.map((p) => p.url);

test.describe("accent text contrast", () => {
  test.skip(!ENABLED, "contrast check disabled in CONFIG");
  test.skip(TEXT_PAGES.length === 0, "no pages configured");

  for (const scheme of ["light", "dark"] as const) {
    test(`link and accent text passes WCAG AA in ${scheme} mode`, async ({
      page,
    }) => {
      const seen = new Set<string>();
      const failures: string[] = [];
      let sampled = 0;

      for (const url of TEXT_PAGES) {
        await page.goto(url);
        for (const s of await readTextContrasts(page, scheme)) {
          if (!s.bg) continue;
          const key = `${s.where}|${s.fg.join()}|${s.bg.join()}|${s.size}|${s.weight}`;
          if (seen.has(key)) continue;
          seen.add(key);
          sampled++;

          const floor =
            s.size >= LARGE_PX || (s.size >= LARGE_BOLD_PX && s.weight >= 700)
              ? 3.0
              : MIN_RATIO;
          const ratio = contrastRatio(s.fg, s.bg);
          if (ratio < floor) {
            failures.push(
              `${scheme}: ${ratio.toFixed(2)} < ${floor} — ${s.where} ` +
                `fg=rgb(${s.fg.join(", ")}) bg=rgb(${s.bg
                  .map(Math.round)
                  .join(", ")}) ${s.size}px/${s.weight} "${s.text}" on ${url}`,
            );
          }
        }
      }

      expect(sampled, "no accent text sampled on any configured page").toBeGreaterThan(0);
      expect(
        failures,
        `Accent text below its WCAG AA floor. Link/accent text colors come ` +
          `from --theme-link / --theme-link-hover in brand-{oss,enterprise}.css ` +
          `(deliberately separate from --theme-primary, which paints icons and ` +
          `borders at the lower 3:1 floor).\n${failures.join("\n")}`,
      ).toEqual([]);
    });
  }
});
