import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findIncludeFormViolations } from "./helpers/include-form";
import { target } from "./helpers/target";

// Source-side guard: Hextra's `include` shortcode is documented as
// percent-form-only. The angle-bracket form silently produces broken
// output (raw markdown inserted post-render). See helpers/include-form.ts
// for the full diagnosis.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("includeForm");

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

test.describe("include-form lint helper", () => {
  test("flags angle-bracket include invocation", () => {
    const md = `{{< include "hextra-include-target" >}}\n`;
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].invocation).toBe('{{< include "hextra-include-target" >}}');
  });

  test("does NOT flag percent-form include (correct usage)", () => {
    const md = `{{% include "hextra-include-target" %}}\n`;
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag other shortcodes that look similar", () => {
    const md = [
      `{{< reuse "foo" >}}`,
      `{{< version include-if="v1" >}}body{{< /version >}}`,
      `{{< rebase file="x" >}}`,
    ].join("\n");
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("handles invocations spanning multiple lines", () => {
    const md = `{{< include\n  "hextra-include-target"\n>}}\n`;
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toHaveLength(1);
  });

  test("flags multiple violations in one file", () => {
    const md = [
      `{{< include "a" >}}`,
      "some prose",
      `{{< include "b" >}}`,
    ].join("\n");
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toHaveLength(2);
    expect(v[0].startLine).toBe(1);
    expect(v[1].startLine).toBe(3);
  });

  test("does NOT flag `include-if` arg on the version shortcode", () => {
    // Common false-positive risk: the version shortcode uses
    // `include-if="v1"` as an arg name. `\binclude\b` boundary prevents
    // the match since `include-if` is one token.
    const md = `{{< version include-if="v1" >}}body{{< /version >}}\n`;
    const v = findIncludeFormViolations(md, "test.md");
    expect(v).toEqual([]);
  });
});

test.describe("source has no angle-bracket include shortcodes", () => {
  test.skip(!ENABLED, "includeForm check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: { file: string; line: number; invocation: string }[] = [];
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        const source = fs.readFileSync(file, "utf8");
        const violations = findIncludeFormViolations(
          source,
          path.relative(reportRoot, file),
        );
        for (const v of violations) {
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
        .map((v) => `  ${v.file}:${v.line}  ${v.invocation}`)
        .join("\n");
      const overflow =
        all.length > 50 ? `\n  ... and ${all.length - 50} more.` : "";
      expect(
        all,
        `Found ${all.length} angle-bracket include shortcode invocation(s). ` +
          `Hextra's include must be invoked with percent-form ({{%/* */%}}) ` +
          `so its output flows back through the outer markdown pass. With ` +
          `angle-bracket form, the included page's markdown (backticks, ` +
          `links, headings) appears as literal text. Change {{< include ... >}} ` +
          `to {{%/* include ... */%}}.\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
