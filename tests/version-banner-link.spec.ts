import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { target } from "./helpers/target";

// Regression guard for markdown links in [[params.versions]].banner.
//
// version-banner.html markdownifies the `banner` string, so a markdown link in
// a consumer's TOML does produce a real <a href>. But the banner renders
// OUTSIDE `.content` (layouts/docs/single.html, layouts/docs/list.html), and
// the theme's only link-paint rules are `.content a` — weight in
// docs-theme-extras.css, brand color in brand-{oss,enterprise}.css. Tailwind's
// preflight reset (`a { color: inherit; text-decoration: inherit }`) therefore
// left banner links drawn in the banner's own body color with no underline:
// clickable, but visually identical to the surrounding sentence, which reads to
// authors as "the link in the banner is broken".
//
// This spec asserts the anchor is both resolvable AND visually distinguishable,
// in light and dark mode. It auto-discovers a configured page whose built HTML
// carries a banner anchor, so it also carries signal against a consumer build
// (e.g. the docs hub, whose gateway banners link to the kgateway docs).

function findBannerLinkPage(): string | null {
  for (const p of target.pages) {
    try {
      const html = fs.readFileSync(target.fileForUrl(p.url), "utf8");
      const banner = html.match(
        /<div class="version-banner">([\s\S]*?)<\/div>/,
      );
      if (banner && /<a\s[^>]*href=/.test(banner[1])) return p.url;
    } catch {
      continue;
    }
  }
  return null;
}

const PAGE = findBannerLinkPage();

// Same threshold the brand layers already clear for body text. A link that
// merely differs from its surroundings is not enough — it has to be readable.
const MIN_CONTRAST = 3.0;

test.describe("version banner links are painted as links", () => {
  test.skip(
    PAGE === null,
    "no configured page has a markdown link in its [[params.versions]].banner",
  );

  test("banner anchors carry a non-empty href", async ({ page }) => {
    await page.goto(PAGE!);
    const links = page.locator(".version-banner a");
    const count = await links.count();
    expect(count, "no anchors inside .version-banner").toBeGreaterThan(0);

    for (let i = 0; i < count; i++) {
      const href = await links.nth(i).getAttribute("href");
      const text = (await links.nth(i).textContent())?.trim() ?? "";
      expect(
        href,
        `banner link "${text}" has no href — the markdown link in ` +
          `[[params.versions]].banner did not survive markdownify`,
      ).toBeTruthy();
      expect(
        href!,
        `banner link "${text}" has href "${href}", which is not an absolute ` +
          `URL, a rooted path, or a fragment`,
      ).toMatch(/^(https?:\/\/|\/|#|mailto:)/);
    }
  });

  for (const scheme of ["light", "dark"] as const) {
    test(`banner links differ from the banner body text in ${scheme} mode`, async ({
      page,
    }) => {
      await page.goto(PAGE!);
      await page.evaluate((s) => {
        document.documentElement.classList.toggle("dark", s === "dark");
      }, scheme);

      const styles = await page.evaluate(() => {
        function parse(
          input: string,
        ): [number, number, number, number] | null {
          const m = input.match(/rgba?\(([^)]+)\)/i);
          if (!m) return null;
          const parts = m[1]
            .split(",")
            .map((s) => parseFloat(s.trim()));
          if (parts.length < 3 || parts.some(Number.isNaN)) return null;
          return [parts[0], parts[1], parts[2], parts[3] ?? 1];
        }

        // The dark banner fill is hsla(...0.1), so the computed
        // background-color alone is not what the eye sees. Composite the
        // element's own fill over its ancestors' until alpha reaches 1.
        function effectiveBg(
          start: HTMLElement,
        ): [number, number, number] | null {
          const layers: [number, number, number, number][] = [];
          for (let n: HTMLElement | null = start; n; n = n.parentElement) {
            const c = parse(getComputedStyle(n).backgroundColor);
            if (!c || c[3] === 0) continue;
            layers.push(c);
            if (c[3] === 1) break;
          }
          if (!layers.length) return null;
          // Walk back-to-front (opaque base first) alpha-blending forward.
          let out: [number, number, number] = [
            layers[layers.length - 1][0],
            layers[layers.length - 1][1],
            layers[layers.length - 1][2],
          ];
          for (let i = layers.length - 2; i >= 0; i--) {
            const [r, g, b, a] = layers[i];
            out = [
              r * a + out[0] * (1 - a),
              g * a + out[1] * (1 - a),
              b * a + out[2] * (1 - a),
            ];
          }
          return out;
        }

        return Array.from(document.querySelectorAll(".version-banner a")).map(
          (a) => {
            const el = a as HTMLElement;
            const banner = el.closest(".version-banner") as HTMLElement;
            const cs = getComputedStyle(el);
            const fg = parse(cs.color);
            const bodyFg = parse(getComputedStyle(banner).color);
            return {
              text: (el.textContent || "").trim().slice(0, 40),
              color: fg ? ([fg[0], fg[1], fg[2]] as [number, number, number]) : null,
              bannerColor: bodyFg
                ? ([bodyFg[0], bodyFg[1], bodyFg[2]] as [number, number, number])
                : null,
              bannerBg: effectiveBg(banner),
              decoration: cs.textDecorationLine,
              weight: cs.fontWeight,
            };
          },
        );
      });

      expect(styles.length, "no anchors inside .version-banner").toBeGreaterThan(
        0,
      );

      const relLuminance = (rgb: [number, number, number]) => {
        const ch = rgb.map((c) => {
          const v = c / 255;
          return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4);
        });
        return 0.2126 * ch[0] + 0.7152 * ch[1] + 0.0722 * ch[2];
      };
      const contrast = (
        a: [number, number, number],
        b: [number, number, number],
      ) => {
        const [hi, lo] = [relLuminance(a), relLuminance(b)].sort(
          (x, y) => y - x,
        );
        return (hi + 0.05) / (lo + 0.05);
      };

      for (const s of styles) {
        expect(s.color, `could not read color of banner link "${s.text}"`).not
          .toBeNull();
        expect(
          s.bannerColor,
          `could not read banner body color near "${s.text}"`,
        ).not.toBeNull();

        // The exact original symptom: link color === banner body color and no
        // underline, so nothing marks it as a link.
        const sameAsBody =
          s.color!.join(",") === s.bannerColor!.join(",");
        const underlined = /underline/.test(s.decoration);
        expect(
          sameAsBody && !underlined,
          `banner link "${s.text}" in ${scheme} mode is drawn in the banner's ` +
            `own body color (rgb(${s.color!.join(", ")})) with ` +
            `text-decoration "${s.decoration}" — nothing distinguishes it ` +
            `from the surrounding sentence. Check the .version-banner a rules ` +
            `in docs-theme-extras.css.`,
        ).toBe(false);

        // A distinguishing color still has to be legible on the banner fill.
        // Skip when the banner background is transparent (nothing to measure).
        if (!sameAsBody && s.bannerBg) {
          const ratio = contrast(s.color!, s.bannerBg);
          expect(
            ratio,
            `banner link "${s.text}" in ${scheme} mode has contrast ` +
              `${ratio.toFixed(2)} against the banner background — below ` +
              `${MIN_CONTRAST}:1.`,
          ).toBeGreaterThanOrEqual(MIN_CONTRAST);
        }
      }
    });
  }
});
