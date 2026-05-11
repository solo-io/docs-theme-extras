import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findShortcodeArgViolations } from "./helpers/shortcode-args";
import { target } from "./helpers/target";

// Source-side guard against the parser-tripwire pattern that caused a
// fixture card to silently disappear: a backtick inside a double-quoted
// shortcode arg. See helpers/shortcode-args.ts for the full diagnosis.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("shortcodeArgs");

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

test.describe("shortcode-args lint helper", () => {
  test("flags backtick inside a named double-quoted arg", () => {
    const md = `{{< card description="uses the \`code\` icon" >}}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].shortcode).toBe("card");
    expect(v[0].arg).toContain("description=");
    expect(v[0].arg).toContain("`code`");
  });

  test("flags backtick inside a positional double-quoted arg", () => {
    const md = `{{< gloss "\`MCP\`" >}}body{{< /gloss >}}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].shortcode).toBe("gloss");
    expect(v[0].arg).toContain("`MCP`");
  });

  test("does NOT flag backticks used as the outer quote style", () => {
    // Valid Hugo syntax: backtick-quoted args. The lexer handles these.
    const md = "{{< card description=`uses the code icon` >}}\n";
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag backticks in the inner content of a paired shortcode", () => {
    // Inner content of `{{< x >}}...{{< /x >}}` is not parsed by the
    // shortcode arg lexer, so backticks (used for inline code) are safe.
    const md =
      "{{< alert >}}Use the `kubectl get` command.{{< /alert >}}\n";
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag plain double-quoted args without backticks", () => {
    const md = '{{< card description="uses the code icon" >}}\n';
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag closing shortcode tags", () => {
    const md = "{{< /cards >}}\n";
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("flags both arg + inner-quote in the same invocation", () => {
    const md = `{{< card title="OK" description="see \`foo\`" subtitle="\`bar\` here" >}}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toHaveLength(2);
  });

  test("handles invocations spanning multiple lines", () => {
    const md = `{{< card title="OK"
      description="see \`foo\` here"
      icon="x" >}}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].arg).toContain("`foo`");
  });

  test("works on the percent-form (markdownify-pass-through)", () => {
    // Same lexer applies; the bug pattern is identical inside `{{% %}}`.
    const md = `{{% version include-if="\`v1\`" %}}body{{% /version %}}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].shortcode).toBe("version");
  });

  test("ignores Go template syntax (not a shortcode)", () => {
    const md = `{{ if .Page }}{{ .Title }}{{ end }}\n`;
    const v = findShortcodeArgViolations(md, "test.md");
    expect(v).toEqual([]);
  });
});

test.describe("source has no backticks in shortcode args", () => {
  test.skip(!ENABLED, "shortcodeArgs check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: {
      file: string;
      line: number;
      shortcode: string;
      arg: string;
      invocation: string;
    }[] = [];
    // Report paths relative to the config file's directory so output is
    // readable across consumers.
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        const source = fs.readFileSync(file, "utf8");
        const violations = findShortcodeArgViolations(
          source,
          path.relative(reportRoot, file),
        );
        for (const v of violations) {
          all.push({
            file: v.filePath,
            line: v.startLine,
            shortcode: v.shortcode,
            arg: v.arg,
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
            `  ${v.file}:${v.line}  {{< ${v.shortcode} >}}\n    arg: ${v.arg}\n    ${v.invocation}`,
        )
        .join("\n");
      const overflow =
        all.length > 50 ? `\n  ... and ${all.length - 50} more.` : "";
      expect(
        all,
        `Found ${all.length} shortcode invocation(s) with a backtick inside a ` +
          `double-quoted arg. Hugo's shortcode lexer silently drops these — the ` +
          `whole invocation disappears at render time. Either reword the arg to ` +
          `avoid backticks, or wrap the arg with backticks as the outer quote.\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
