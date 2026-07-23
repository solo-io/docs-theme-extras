import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findHeadingShortcodeIdViolations } from "./helpers/heading-shortcode-id";
import { target } from "./helpers/target";

// Source-side guard against the anchor-placeholder leak: a shortcode used in a
// markdown heading with no explicit `{#id}`. Hugo builds the heading anchor
// from the raw (pre-substitution) text, so the placeholder leaks into the ID.
// See helpers/heading-shortcode-id.ts for the full diagnosis and fix.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("headingShortcodeId");
const ALLOWLIST = target.headingShortcodeIdAllowlist;

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

test.describe("heading-shortcode-id lint helper", () => {
  test("flags an angle-bracket shortcode in a heading with no id", () => {
    const md = `## Install {{< reuse "conrefs/snippets/product-names.md" >}}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(1);
    expect(v[0].heading).toContain("Install");
  });

  test("flags a percent-form shortcode in a heading with no id", () => {
    const md = `### API keys in {{% reuse "conrefs/snippets/product-names.md" %}}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
  });

  test("flags a heading that is only a shortcode", () => {
    const md = `### {{< reuse "conrefs/snippets/product-names.md" >}}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
  });

  test("does NOT flag a shortcode heading that already has an explicit {#id}", () => {
    const md = `## Install {{< reuse "conrefs/snippets/product-names.md" >}} {#install}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a heading with a shortcode and a question mark before {#id}", () => {
    const md = `## Why use {{< reuse "conrefs/snippets/product-names.md" >}}? {#why}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a plain heading with no shortcode", () => {
    const md = `## Install kagent\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a shortcode outside of a heading", () => {
    const md = `Install {{< reuse "conrefs/snippets/product-names.md" >}} now.\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a Go template expression in a heading (not a shortcode)", () => {
    const md = `## {{ .Title }}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a commented-out shortcode heading", () => {
    const md = `<!--\n## Old {{< reuse "conrefs/snippets/product-names.md" >}}\n-->\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("does NOT flag a `#`-prefixed line inside a fenced code block", () => {
    const md =
      "```bash\n## not a heading {{< reuse \"x\" >}}\n```\n## Real {{< reuse \"x\" >}}\n";
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(4);
  });

  test("does NOT flag a `#` comment inside YAML front matter", () => {
    const md =
      `---\ntitle: MCP\n# note above a test block, mentions {{< doc-test >}}\ntest:\n  foo: bar\n---\n\n## Real heading\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toEqual([]);
  });

  test("still flags a shortcode heading in the body after front matter", () => {
    const md = `---\ntitle: X\n---\n\n## Install {{< reuse "x" >}}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(5);
  });

  test("reports correct 1-based line numbers", () => {
    const md = `# Title\n\nSome prose.\n\n## Install {{< reuse "x" >}}\n`;
    const v = findHeadingShortcodeIdViolations(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(5);
  });
});

test.describe("source has no shortcode headings missing an explicit id", () => {
  test.skip(!ENABLED, "headingShortcodeId check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: { file: string; line: number; heading: string }[] = [];
    // Report paths relative to the config file's directory so output is
    // readable across consumers.
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        const source = fs.readFileSync(file, "utf8");
        const rel = path.relative(reportRoot, file);
        for (const v of findHeadingShortcodeIdViolations(source, rel)) {
          if (ALLOWLIST.some((re) => re.test(v.heading))) continue;
          all.push({ file: v.filePath, line: v.line, heading: v.heading });
        }
      }
    }

    if (all.length > 0) {
      const summary = all
        .slice(0, 50)
        .map((v) => `  ${v.file}:${v.line}\n    ${v.heading}`)
        .join("\n");
      const overflow =
        all.length > 50 ? `\n  ... and ${all.length - 50} more.` : "";
      expect(
        all,
        `Found ${all.length} heading(s) containing a shortcode but no explicit ` +
          `{#id}. Hugo builds the heading anchor from the raw text before ` +
          `substituting shortcodes, so the anchor becomes a broken ` +
          `"hahahugoshortcode…" placeholder (see the shortcode-placeholder ` +
          `markdown leaks). Append an explicit ID, e.g.\n` +
          `  ## Install {{< reuse "…/product-names.md" >}} {#install}\n` +
          `If a match is a genuine exception, add a regex to ` +
          `allowlists.headingShortcodeId in your CONFIG TOML.\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
