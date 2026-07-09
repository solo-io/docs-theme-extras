import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findTabSyntaxViolations } from "./helpers/tab-syntax";
import { target } from "./helpers/target";

// Source-side guard against pre-0.12 Hextra tab styling (`tabName=`, `items=`,
// `tabTotal=`, and nameless tabs). See helpers/tab-syntax.ts for the full
// diagnosis. The classic symptom is tab labels rendering as "Tab 0", "Tab 1", …

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("tabSyntax");

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

test.describe("tab-syntax lint helper", () => {
  test("flags tabName= on a tab", () => {
    const md = `{{% tab tabName="Linux" %}}body{{% /tab %}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].shortcode).toBe("tab");
    expect(v[0].reason).toContain("tabName=");
  });

  test("flags items= on a tabs", () => {
    const md = `{{< tabs items="Linux,macOS" >}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].shortcode).toBe("tabs");
    expect(v[0].reason).toContain("items=");
  });

  test("flags tabTotal= on a tabs", () => {
    const md = `{{< tabs tabTotal="2" >}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain("tabTotal=");
  });

  test("flags a tab with no name", () => {
    const md = `{{% tab %}}body{{% /tab %}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain("no 'name='");
  });

  test("flags items= AND tabTotal= on the same tabs as two violations", () => {
    const md = `{{< tabs items="A,B" tabTotal="2" >}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(2);
  });

  test("does NOT flag the modern form", () => {
    const md = `{{< tabs >}}\n{{% tab name="Linux" %}}body{{% /tab %}}\n{{< /tabs >}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT confuse name= with tabName=", () => {
    const md = `{{% tab name="Linux" %}}body{{% /tab %}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag closing tags", () => {
    const md = `{{< /tabs >}}\n{{% /tab %}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag unrelated shortcodes", () => {
    const md = `{{< card name="x" >}}\n{{< reuse "foo/bar.md" >}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("handles a tab open spanning multiple lines", () => {
    const md = `{{% tab
      tabName="Build from source" %}}\n`;
    const v = findTabSyntaxViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].reason).toContain("tabName=");
  });
});

test.describe("source has no deprecated tab styling", () => {
  test.skip(!ENABLED, "tabSyntax check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: {
      file: string;
      line: number;
      shortcode: string;
      reason: string;
      invocation: string;
    }[] = [];
    // Report paths relative to the config file's directory so output is
    // readable across consumers.
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        const source = fs.readFileSync(file, "utf8");
        const violations = findTabSyntaxViolations(
          source,
          path.relative(reportRoot, file),
        );
        for (const v of violations) {
          all.push({
            file: v.filePath,
            line: v.startLine,
            shortcode: v.shortcode,
            reason: v.reason,
            invocation: v.invocation,
          });
        }
      }
    }

    if (all.length > 0) {
      const summary = all
        .slice(0, 50)
        .map(
          (v) =>
            `  ${v.file}:${v.line}  {{< ${v.shortcode} >}}\n    ${v.reason}\n    ${v.invocation}`,
        )
        .join("\n");
      const overflow =
        all.length > 50 ? `\n  ... and ${all.length - 50} more.` : "";
      expect(
        all,
        `Found ${all.length} deprecated tab-styling usage(s). Hextra 0.12+ ` +
          `takes each tab label from a 'name=' attribute on {{% tab %}}; the ` +
          `old 'items='/'tabTotal='/'tabName=' forms render labels as ` +
          `"Tab 0", "Tab 1", …\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
