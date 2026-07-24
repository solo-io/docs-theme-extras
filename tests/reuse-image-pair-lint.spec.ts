import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findReuseImagePairViolations } from "./helpers/reuse-image-pair";
import { target } from "./helpers/target";

// Source-side lint for the legacy image-pair anti-pattern: a lone
// `reuse-image` (no srcDark) immediately followed by a separate
// `reuse-image-dark`. See helpers/reuse-image-pair.ts for the full diagnosis.
//
// Opt-in (checks.reuseImagePair defaults false): the CSS defense makes the
// pattern render correctly, so this enforces the canonical single-call
// `src`+`srcDark` form only for consumers that want clean source. The unit
// tests below are pure and always run, pinning the matcher regardless.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("reuseImagePair");

function walkMarkdown(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  }
  return out;
}

test.describe("findReuseImagePairViolations helper", () => {
  test("flags a lone reuse-image followed on the next line by reuse-image-dark", () => {
    const md = `{{< reuse-image src="img/a.svg" alt="A" >}}\n{{< reuse-image-dark srcDark="img/a-dark.svg" alt="A" >}}\n`;
    const v = findReuseImagePairViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].startLine).toBe(1);
    expect(v[0].invocation).toContain('reuse-image src="img/a.svg"');
    expect(v[0].invocation).not.toContain("reuse-image-dark");
  });

  test("flags a same-line pair", () => {
    const md = `{{< reuse-image src="img/a.svg" >}}{{< reuse-image-dark srcDark="img/a-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toHaveLength(1);
  });

  test("flags a pair separated by blank lines (still adjacent siblings)", () => {
    const md = `{{< reuse-image src="img/a.svg" >}}\n\n\n{{< reuse-image-dark srcDark="img/a-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toHaveLength(1);
  });

  test("does NOT flag the canonical single call with srcDark", () => {
    const md = `{{< reuse-image src="img/a.svg" srcDark="img/a-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag a reuse-image with srcDark even if a reuse-image-dark follows", () => {
    // The PAIR call already renders one image per mode; a following dark call
    // is a separate (unusual) authoring choice, not the stacking bug.
    const md = `{{< reuse-image src="img/a.svg" srcDark="img/a-dark.svg" >}}\n{{< reuse-image-dark srcDark="img/b-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag a lone reuse-image with no following dark sibling", () => {
    const md = `{{< reuse-image src="img/a.svg" >}}\n\nSome prose.\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag when prose separates the two calls (no DOM adjacency)", () => {
    const md = `{{< reuse-image src="img/a.svg" >}}\n\nExplanatory text.\n\n{{< reuse-image-dark srcDark="img/a-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag a reuse-image-light + reuse-image-dark pair (correct dedicated form)", () => {
    const md = `{{< reuse-image-light src="img/a.svg" >}}\n{{< reuse-image-dark srcDark="img/a-dark.svg" >}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toEqual([]);
  });

  test("works on the percent form", () => {
    const md = `{{% reuse-image src="img/a.svg" %}}\n{{% reuse-image-dark srcDark="img/a-dark.svg" %}}\n`;
    expect(findReuseImagePairViolations(md, "t.md")).toHaveLength(1);
  });
});

test.describe("source has no legacy reuse-image pairs", () => {
  test.skip(!ENABLED, "reuseImagePair check disabled in CONFIG (opt-in)");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for legacy pairs", () => {
    const all: { file: string; line: number; invocation: string }[] = [];
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        const source = fs.readFileSync(file, "utf8");
        for (const v of findReuseImagePairViolations(
          source,
          path.relative(reportRoot, file),
        )) {
          all.push({
            file: v.filePath,
            line: v.startLine,
            invocation: v.invocation,
          });
        }
      }
    }

    if (all.length > 0) {
      const summary = all
        .slice(0, 50)
        .map((v) => `  ${v.file}:${v.line}\n    ${v.invocation}`)
        .join("\n");
      const overflow =
        all.length > 50 ? `\n  ... and ${all.length - 50} more.` : "";
      expect(
        all,
        `Found ${all.length} legacy reuse-image + reuse-image-dark pair(s). ` +
          `Merge each into one call carrying both variants:\n` +
          `  {{< reuse-image src="..." srcDark="..." >}}\n` +
          `(These render correctly at runtime via the CSS defense; this lint ` +
          `enforces the canonical source form.)\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
