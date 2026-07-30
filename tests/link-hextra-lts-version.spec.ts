import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for fully qualified (LTS) versions in link-hextra.
//
// link-hextra infers the target version by regex-matching the page's permalink.
// The regexes originally accepted only `X.Y.x` (2.3.x), `latest`, and `main`.
// When a product ships a fully qualified LTS tree (e.g.
// `/agentgateway/2026.7.1/...`), inference fell through to the "latest"
// fallback: every reuse-nested link on those pages pointed at `/latest/...`
// instead of the LTS tree, and the build emitted a `link-hextra called with no
// version` WARN for each one (which hugo-warnings.spec.ts fails on).
//
// Why a SOURCE check, not a rendered-output check: the bundled fixture has no
// fully qualified version tree, and adding one shifts the page URLs the rest of
// the suite asserts on. So this extracts the version alternation from the
// shipped shortcode and exercises it directly. Self-skips when the file isn't
// at the module-relative path (a consumer build, where the module lives under
// hugo_cache rather than ../layouts).

const SHORTCODE = path.resolve(
  __dirname,
  "../layouts/_shortcodes/link-hextra.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so the assertions match
// ACTIVE code, not the explanatory comments (which also spell out version
// patterns).
function activeSrc(): string {
  return fs
    .readFileSync(SHORTCODE, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

// The two version-inference regexes, as written in the template:
//   1. product-prefixed, e.g. `/agentgateway/2026.7.1/security/waf/overview/`
//   2. root-relative, e.g. `/2026.7.1/security/waf/overview/` (preview builds
//      whose baseURL path is the product)
const PATTERNS: Array<{ label: string; extract: RegExp }> = [
  {
    label: "product-prefixed",
    extract: /findRE\s+`((?:\(\?:)?kgateway[^`]*)`/,
  },
  {
    label: "root-relative",
    extract: /findRE\s+`(\^\/\([^`]*)`/,
  },
];

// Versions that must infer, and the permalinks they appear in.
const MUST_MATCH: Array<[string, string, string]> = [
  ["2026.7.1", "/agentgateway/2026.7.1/security/waf/overview/", "/2026.7.1/security/waf/overview/"],
  ["2.3.x", "/agentgateway/2.3.x/security/waf/overview/", "/2.3.x/security/waf/overview/"],
  ["latest", "/agentgateway/latest/security/waf/overview/", "/latest/security/waf/overview/"],
  ["main", "/kgateway/main/security/waf/overview/", "/main/security/waf/overview/"],
];

test.describe("link-hextra infers fully qualified (LTS) versions", () => {
  test.skip(
    !fs.existsSync(SHORTCODE),
    "link-hextra.html not at the module-relative path (consumer build)",
  );

  for (const { label, extract } of PATTERNS) {
    test(`the ${label} version regex accepts X.Y.Z as well as X.Y.x`, () => {
      const src = activeSrc();
      const m = src.match(extract);
      expect(
        m,
        `${label} version-inference \`findRE\` not found — the shortcode ` +
          "changed shape; re-check that fully qualified versions still infer.",
      ).not.toBeNull();

      // Go's regexp syntax is RE2, but these patterns use only constructs JS
      // shares, so they can be exercised directly.
      const re = new RegExp(m![1]);
      const idx = label === "product-prefixed" ? 1 : 2;

      for (const row of MUST_MATCH) {
        const [version, ...permalinks] = row;
        const permalink = permalinks[idx - 1];
        const hit = permalink.match(re);
        expect(
          hit?.[1],
          `\`${version}\` did not infer from ${permalink} — links on that ` +
            "version tree fall back to `latest` and the build WARNs.",
        ).toBe(version);
      }
    });
  }

  test("the version alternation is not narrowed back to X.Y.x only", () => {
    const src = activeSrc();
    // Both regexes must allow a numeric third segment. Guards against a
    // revert of one branch while the other keeps working.
    const narrowed = src.match(/findRE\s+`[^`]*\\d\+\\\.\\d\+\\\.x[|)]/g) ?? [];
    expect(
      narrowed,
      "a version-inference regex still accepts only `\\d+\\.\\d+\\.x` — " +
        "fully qualified LTS versions (e.g. 2026.7.1) will not infer.",
    ).toEqual([]);
  });
});
