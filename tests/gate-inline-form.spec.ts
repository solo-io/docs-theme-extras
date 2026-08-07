import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findInlineFormViolations } from "./helpers/gate-inline-form";
import { target } from "./helpers/target";

// A gate must wrap a whole inline construct, never open or close inside one.
// See tests/helpers/gate-inline-form.ts for the full rationale; the short
// version is that `**{{% version %}}x{{% /version %}}**` renders as FOUR
// LITERAL ASTERISKS when the gate excludes, and neither the v0.2.0 raw-emit
// refactor nor the markdown-leaks RAW_BOLD pattern catches it.

const SCAN_ROOTS = target.scanRoots;

function walkMarkdown(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(full);
      else if (e.isFile() && e.name.endsWith(".md")) out.push(full);
    }
  }
  return out;
}

test.describe("gate-inline-form lint helper", () => {
  test("flags a gate opening inside **strong**", () => {
    const v = findInlineFormViolations(
      `The setting **{{% version include-if="v2" %}}X{{% /version %}}** is v2.`,
      "f.md",
    );
    // Both the opener and the closer sit inside the run.
    expect(v).toHaveLength(2);
    expect(v[0].delimiter).toBe("**");
  });

  test("accepts a gate that WRAPS the emphasis", () => {
    expect(
      findInlineFormViolations(
        `The setting {{% version include-if="v2" %}}**X**{{% /version %}} is v2.`,
        "f.md",
      ),
    ).toEqual([]);
  });

  test("accepts bold and a gate as siblings on one line", () => {
    expect(
      findInlineFormViolations(
        `**bold** {{% version %}}x{{% /version %}} **more**`,
        "f.md",
      ),
    ).toEqual([]);
  });

  test("flags __strong__ too", () => {
    expect(
      findInlineFormViolations(
        `a __{{% conditional-text %}}y{{% /conditional-text %}}__ b`,
        "f.md",
      ),
    ).toHaveLength(2);
  });

  test("flags the angle form as well as the percent form", () => {
    expect(
      findInlineFormViolations(`**{{< version >}}X{{< /version >}}**`, "f.md"),
    ).toHaveLength(2);
  });

  // Pages that DOCUMENT the broken shape must not self-flag.
  test("ignores an example inside an inline code span", () => {
    expect(
      findInlineFormViolations(
        "Write `**{{% version %}}x{{% /version %}}**` like this.",
        "f.md",
      ),
    ).toEqual([]);
  });

  test("ignores a fenced code block", () => {
    const src = [
      "Example:",
      "```md",
      `**{{% version include-if="v2" %}}X{{% /version %}}**`,
      "```",
      "Done.",
    ].join("\n");
    expect(findInlineFormViolations(src, "f.md")).toEqual([]);
  });

  test("reports the line number of the offending tag", () => {
    const src = ["intro", "", `**{{% version %}}X{{% /version %}}**`].join("\n");
    expect(findInlineFormViolations(src, "f.md")[0].line).toBe(3);
  });
});

test.describe("source has no gate inside an inline construct", () => {
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const reportRoot = target.configDir;
    const all: ReturnType<typeof findInlineFormViolations> = [];
    let scanned = 0;
    for (const root of SCAN_ROOTS) {
      for (const file of walkMarkdown(root)) {
        scanned++;
        all.push(
          ...findInlineFormViolations(
            fs.readFileSync(file, "utf8"),
            path.relative(reportRoot, file),
          ),
        );
      }
    }
    // Non-vacuity guard — see tests/HAZARDS.md #1.
    expect(scanned, "walked zero markdown files").toBeGreaterThan(0);

    const summary = all
      .slice(0, 30)
      .map((v) => `  ${v.file}:${v.line}:${v.column}  ${v.tag} inside ${v.delimiter}\n    ${v.text}`)
      .join("\n");
    expect(
      all,
      `Found ${all.length} gate(s) opening or closing INSIDE an emphasis run. ` +
        `When the gate excludes, the delimiters collapse to \`****\` and render as ` +
        `four literal asterisks on the page. Move the gate OUTSIDE the emphasis:\n` +
        `  BROKEN  **{{% version include-if="v2" %}}text{{% /version %}}**\n` +
        `  OK      {{% version include-if="v2" %}}**text**{{% /version %}}\n${summary}`,
    ).toEqual([]);
  });
});
