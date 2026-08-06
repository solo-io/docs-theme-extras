import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findGateFormViolations } from "./helpers/gate-form";
import { walkMarkdown } from "./helpers/gate-scan";
import { target } from "./helpers/target";

// Enforces the contract the gate refactor depends on: a `version` /
// `conditional-text` gate authored in content/ must use PERCENT form, because
// `utils/gate-emit.html` emits `.Inner` untouched and only percent-form output
// re-enters the markdown stream. See helpers/gate-form.ts for the full reason.

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("gateForm");

test.describe("gate-form lint helper", () => {
  test("flags an angle-form version gate", () => {
    const v = findGateFormViolations(
      `{{< version include-if="2.1.x" >}}body{{< /version >}}`,
      "t.md",
    );
    expect(v).toHaveLength(2); // opener and closer
    expect(v[0].startLine).toBe(1);
  });

  test("flags an angle-form conditional-text gate", () => {
    expect(
      findGateFormViolations(`{{< conditional-text include-if="gme" >}}x{{< /conditional-text >}}`, "t.md"),
    ).toHaveLength(2);
  });

  test("does NOT flag percent form", () => {
    expect(
      findGateFormViolations(`{{% version include-if="2.1.x" %}}body{{% /version %}}`, "t.md"),
    ).toEqual([]);
  });

  // `version-cards` is a different shortcode and is angle-form by design. The
  // reuse/rebase normalization regexes exclude it the same way; if this test
  // and those regexes ever disagree, content silently changes form.
  test("does NOT flag version-cards", () => {
    expect(findGateFormViolations(`{{< version-cards >}}`, "t.md")).toEqual([]);
  });

  // The reason this lint needs stripNonInvocations at all: USAGE.md and the
  // fixture's own documentation pages show the angle form as an example.
  test("does NOT flag a gate shown inside a fenced code block", () => {
    const md = ["```md", `{{< version include-if="v2" >}}x{{< /version >}}`, "```"].join("\n");
    expect(findGateFormViolations(md, "t.md")).toEqual([]);
  });

  test("does NOT flag a gate shown in an inline code span", () => {
    expect(
      findGateFormViolations('Write `{{< version include-if="v2" >}}` like so.', "t.md"),
    ).toEqual([]);
  });

  test("does NOT flag the escaped display form", () => {
    expect(findGateFormViolations(`{{</* version include-if="v2" */>}}`, "t.md")).toEqual([]);
  });

  test("reports the correct line for a violation further down the file", () => {
    const md = ["# Title", "", "prose", "", `{{< version include-if="v2" >}}x{{< /version >}}`].join("\n");
    expect(findGateFormViolations(md, "t.md")[0].startLine).toBe(5);
  });

  // This assertion used to live in the fixture as cond-reuse-table Case 4,
  // authored in angle form on purpose. The rendering path it proved no longer
  // exists, and left as-is it leaked four table-pipe defects — so the case was
  // converted to percent and the "angle form is wrong" claim moved here, where
  // it is a source-shape rule rather than a rendering one.
  // The one shape where angle is CORRECT at top level, so the lint must not
  // flag it: the body is nothing but shortcode calls and one of them is a
  // `reuse`, whose output is rendered HTML. Converting it to percent splices
  // that HTML into the markdown stream. `utils/gate-normalize-form.html` leaves
  // this shape alone; if the lint and the normalizer disagreed, these gates
  // would be a permanent red line with no valid fix.
  test("does NOT flag an angle gate whose body is only a reuse", () => {
    expect(
      findGateFormViolations(
        `2. {{< conditional-text include-if="gme" >}}{{< reuse "x/y.md" >}}{{< /conditional-text >}}`,
        "t.md",
      ),
    ).toEqual([]);
  });

  // Same body shape, but with markdown of its own — there IS something to
  // parse, so percent is required and angle is still a violation.
  test("still flags an angle gate whose body has markdown around the reuse", () => {
    expect(
      findGateFormViolations(
        `{{< version include-if="v2" >}}\n3. Create a {{< reuse "x/y.md" >}} resource.\n{{< /version >}}`,
        "t.md",
      ),
    ).toHaveLength(2);
  });

  test("flags the shape that was cond-reuse-table Case 4", () => {
    const md = [
      `{{< conditional-text include-if="test" >}}`,
      `| Tier | Notes |`,
      `| --- | --- |`,
      `| Small | Needs:<ul><li>one CPU</li></ul> |`,
      `{{< /conditional-text >}}`,
    ].join("\n");
    expect(findGateFormViolations(md, "t.md")).toHaveLength(2);
  });
});

test.describe("source has no angle-form gates", () => {
  test.skip(!ENABLED, "gateForm check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const all: string[] = [];
    let scanned = 0;
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      // assets/ is normalized by reuse/rebase before render, so an angle-form
      // gate there cannot reach the reader. Only content/ is authoritative.
      if (/(^|\/)assets(\/|$)/.test(root)) continue;
      for (const file of walkMarkdown(root)) {
        scanned++;
        for (const v of findGateFormViolations(
          fs.readFileSync(file, "utf8"),
          path.relative(reportRoot, file),
        )) {
          all.push(`  ${v.filePath}:${v.startLine}  ${v.invocation}`);
        }
      }
    }

    // A source lint that walks zero files passes vacuously and looks like
    // coverage. This is how the docs hub's scanRoots turned out to point at two
    // directories that do not exist.
    expect(
      scanned,
      `scanned 0 markdown files under ${JSON.stringify(SCAN_ROOTS)} — ` +
        `scanRoots is misconfigured, so this check measured nothing`,
    ).toBeGreaterThan(0);

    expect(
      all,
      `Found ${all.length} angle-form gate(s). Convert each to percent form ` +
        `({{%% version … %%}} / {{%% /version %%}}): the gate emits its body ` +
        `untouched, and angle-form output is substituted after markdown has ` +
        `been parsed, so the body survives as literal text.\n${all.slice(0, 50).join("\n")}`,
    ).toEqual([]);
  });
});
