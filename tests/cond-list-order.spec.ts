import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findCondListOrderViolations } from "./helpers/cond-list-order";
import { walkMarkdown } from "./helpers/gate-scan";
import { target } from "./helpers/target";

// Source-side guard for the "gated bullet is not last in its list" shape.
//
// `conditional-text` renders its body in INLINE display mode only. A gated
// bullet sitting AHEAD of an always-shown bullet in the same list breaks the
// list continuation, and the gated bullet's markdown survives as literal text.
//
// Why a SOURCE lint and not just the rendered-HTML scan: the leak only has an
// HTML signature when the gated bullet contains a link, bold, or a pipe. A
// PLAIN-TEXT gated bullet placed first breaks the list just as badly and leaves
// nothing for `markdown-leaks` to match on. This is the half that scan cannot
// see.
//
// `helpers/cond-list-order.ts` shipped complete but **no spec imported it**, so
// it never ran. That is the second dead lint found in this effort, after
// `tab-code-fences.spec.ts` (which was absent from every `testMatch` allowlist).
// Two different failure modes, same outcome — a guard that looks present and
// tests nothing.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("condListOrder");

test.describe("cond-list-order lint helper", () => {
  test("flags a gated bullet followed by a plain sibling", () => {
    const md = [
      `{{% conditional-text include-if="gme" %}}`,
      `* Gated item`,
      `{{% /conditional-text %}}`,
      `* Plain item`,
    ].join("\n");
    const v = findCondListOrderViolations(md, "t.md");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(2);
    expect(v[0].followingLine).toBe(4);
  });

  test("does NOT flag a gated bullet that is last", () => {
    const md = [
      `* Plain item`,
      `{{% conditional-text include-if="gme" %}}`,
      `* Gated item`,
      `{{% /conditional-text %}}`,
    ].join("\n");
    expect(findCondListOrderViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag a fully gated list", () => {
    const md = [
      `{{% conditional-text include-if="gme" %}}`,
      `* One`,
      `* Two`,
      `{{% /conditional-text %}}`,
    ].join("\n");
    expect(findCondListOrderViolations(md, "t.md")).toEqual([]);
  });

  // The inline-prefix form, which is how the reference/release-notes.md leak was
  // actually written: opener and marker on the same line.
  test("flags the inline opener-then-marker form", () => {
    const md = [
      `{{% conditional-text include-if="gme" %}}* [Changelog](/x/){{% /conditional-text %}}`,
      `* Plain item`,
    ].join("\n");
    expect(findCondListOrderViolations(md, "t.md")).toHaveLength(1);
  });

  test("does NOT flag bullets inside a fenced code block", () => {
    const md = [
      "```md",
      `{{% conditional-text include-if="gme" %}}`,
      `* Gated`,
      `{{% /conditional-text %}}`,
      `* Plain`,
      "```",
    ].join("\n");
    expect(findCondListOrderViolations(md, "t.md")).toEqual([]);
  });

  // `version` is deliberately out of scope: its block / trailing-step emit path
  // makes a non-last gated bullet frequently legitimate, so including it would
  // be noise rather than signal.
  test("does NOT flag a version-gated bullet", () => {
    const md = [
      `{{% version include-if="2.1.x" %}}`,
      `* Gated item`,
      `{{% /version %}}`,
      `* Plain item`,
    ].join("\n");
    expect(findCondListOrderViolations(md, "t.md")).toEqual([]);
  });
});

test.describe("source has no mis-ordered conditional-text bullets", () => {
  test.skip(!ENABLED, "condListOrder check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: string[] = [];
    let scanned = 0;
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        scanned++;
        const source = fs.readFileSync(file, "utf8");
        for (const v of findCondListOrderViolations(
          source,
          path.relative(reportRoot, file),
        )) {
          all.push(
            `  ${v.filePath}:${v.line}  gated bullet has a plain sibling at ` +
              `line ${v.followingLine}\n` +
              `      gated:     ${v.gatedBullet}\n` +
              `      following: ${v.followingBullet}`,
          );
        }
      }
    }
    // Self-check before the assertion. A source lint that walks zero files
    // passes vacuously and looks like coverage — the same failure mode that let
    // `tab-code-fences.spec.ts` sit dead, and that a misconfigured `scanRoots`
    // would reproduce here. Fail loudly instead of reporting a clean scan.
    expect(
      scanned,
      `scanned 0 markdown files under ${JSON.stringify(SCAN_ROOTS)} — ` +
        `scanRoots is misconfigured, so this check measured nothing`,
    ).toBeGreaterThan(0);

    expect(
      all,
      `Found ${all.length} mis-ordered conditional-text bullet(s). A gated ` +
        `bullet must be the LAST item of its list — move it after every ` +
        `always-shown sibling, or gate the whole list.\n${all.slice(0, 50).join("\n")}`,
    ).toEqual([]);
  });
});
