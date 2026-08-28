import { test, expect } from "@playwright/test";
import path from "node:path";
import {
  findAxisViolations,
  formatAxisViolation,
  includeTokens,
  scanRootForAxisViolations,
  type AxisCombo,
} from "./helpers/gate-axis";
import { target } from "./helpers/target";

// `conditional-text` gates on two axes through ONE token namespace: the build
// condition and the page's section segment. A token that names a section on one
// axis and a product on the other is true twice over, so both sides of an
// intended either/or render.
//
// This is the lint for the failure that shipped with that change. Five files in
// agentgateway/website wrote:
//
//   {{% conditional-text include-if="kubernetes" %}}[API docs](/ref/){{% /conditional-text %}}
//   {{% conditional-text include-if="agentgateway" %}}[API docs](https://…){{% /conditional-text %}}
//
// meaning "OSS gets the relative link, the hub gets the absolute one". On the
// hub, `kubernetes` is a registered SECTION and `agentgateway` is the
// buildCondition, so on every enterprise Kubernetes page both are true and both
// links render — with the relative one 404ing.
//
// It is a source lint rather than a built-HTML check because the built HTML of
// the OSS site is correct; the damage only appears in the OTHER build of the
// same shared content, which the consumer's own test job never renders.
//
// See helpers/gate-axis.ts for why the check is framed as "does any configured
// (condition, section) combination fire both gates" rather than any of the
// heuristics that look simpler and misfire.

const ENABLED = target.shouldRun("gateAxisCollision");
const AXES = target.gateAxes;
const SCAN_ROOTS = target.scanRoots;

// The combinations used by the unit tests below: agentgateway's real shape.
const HUB: AxisCombo[] = [
  {
    name: "hub / agentgateway",
    condition: "agentgateway",
    sections: ["kubernetes", "standalone"],
  },
];
// The OSS build of the same content, where the condition IS the section.
const OSS: AxisCombo[] = [
  { name: "oss / kubernetes", condition: "kubernetes", sections: [] },
  { name: "oss / standalone", condition: "standalone", sections: [] },
];

function pair(a: string, b: string): string {
  return (
    `{{% conditional-text include-if="${a}" %}}A{{% /conditional-text %}}\n` +
    `{{% conditional-text include-if="${b}" %}}B{{% /conditional-text %}}\n`
  );
}

test.describe("gate-axis lint helper", () => {
  test("flags the overloaded pair that produced this lint", () => {
    const v = findAxisViolations(
      pair("kubernetes", "agentgateway"),
      "t.md",
      HUB,
    );
    expect(v).toHaveLength(1);
    expect(v[0].condition).toBe("agentgateway");
    expect(v[0].section).toBe("kubernetes");
    // The message has to name the page it breaks on and the rewrite that fixes
    // it, or the author cannot act on it.
    expect(formatAxisViolation(v[0])).toContain('exclude-if="agentgateway"');
  });

  test("does NOT flag the same pair on the OSS build", () => {
    // In url mode there is no second axis: `kubernetes` is the condition and
    // `agentgateway` is nothing, so exactly one side fires. The pair is only
    // broken on the build that has both axes, which is the whole reason a
    // consumer must list the hub build too.
    expect(
      findAxisViolations(pair("kubernetes", "agentgateway"), "t.md", OSS),
    ).toEqual([]);
  });

  test("does NOT flag a legitimate section pair", () => {
    // No page is in two sections at once, so this never double-fires.
    expect(
      findAxisViolations(pair("kubernetes", "standalone"), "t.md", HUB),
    ).toEqual([]);
  });

  test("does NOT flag the include/exclude idiom the contract recommends", () => {
    const src =
      `{{% conditional-text exclude-if="agentgateway" %}}A{{% /conditional-text %}}\n` +
      `{{% conditional-text include-if="agentgateway" %}}B{{% /conditional-text %}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toEqual([]);
  });

  test("DOES flag a block-level pair one blank line apart", () => {
    // Markdown requires the blank line when each branch is its own block, so a
    // flush-only rule would miss the block form of the same bug. Measured on
    // the agentgateway corpus: requiring flush found 4 of the 5 files a hand
    // audit found; allowing one blank line finds all 5 and still reports zero
    // across the solo-io/docs assets tree. See the comment on isAdjacent.
    const src =
      `{{% conditional-text include-if="kubernetes" %}}A{{% /conditional-text %}}\n\n` +
      `{{% conditional-text include-if="agentgateway" %}}B{{% /conditional-text %}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toHaveLength(1);
  });

  test("does NOT flag gates two blank lines apart", () => {
    // The escape hatch for the one false positive this admits — two standalone
    // gate paragraphs that are both meant to render. Neither production corpus
    // contains an instance, but the fixture's own section-gating pages are
    // deliberately written with a lead-in sentence for exactly this reason.
    const src =
      `{{% conditional-text include-if="kubernetes" %}}A{{% /conditional-text %}}\n\n\n` +
      `{{% conditional-text include-if="agentgateway" %}}B{{% /conditional-text %}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toEqual([]);
  });

  test("does NOT flag two gates separated by prose", () => {
    // Adjacency is what says "the author meant one or the other". Two
    // independent decisions in one file both firing is ordinary.
    const src =
      `{{% conditional-text include-if="kubernetes" %}}A{{% /conditional-text %}}\n\n` +
      `Some prose in between.\n\n` +
      `{{% conditional-text include-if="agentgateway" %}}B{{% /conditional-text %}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toEqual([]);
  });

  test("flags an inline pair on one line", () => {
    // The real corpus writes these mid-sentence, not on separate lines.
    const src =
      `Use {{% conditional-text include-if="kubernetes" %}}\`spec.kube.x\`{{% /conditional-text %}}` +
      `{{% conditional-text include-if="agentgateway" %}}\`spec.x\`{{% /conditional-text %}} here.\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toHaveLength(1);
  });

  test("does NOT flag the escaped display form used in documentation", () => {
    // USAGE.md documents this very anti-pattern with `{{</* … */>}}`. A lint
    // that flags its own contract page is a lint people turn off.
    const src =
      `{{%/* conditional-text include-if="kubernetes" */%}}A{{%/* /conditional-text */%}}\n` +
      `{{%/* conditional-text include-if="agentgateway" */%}}B{{%/* /conditional-text */%}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toEqual([]);
  });

  test("does NOT flag version gates", () => {
    const src =
      `{{% version include-if="kubernetes" %}}A{{% /version %}}\n` +
      `{{% version include-if="agentgateway" %}}B{{% /version %}}\n`;
    expect(findAxisViolations(src, "t.md", HUB)).toEqual([]);
  });

  test("does NOT flag an identical-token duplicate", () => {
    expect(
      findAxisViolations(pair("agentgateway", "agentgateway"), "t.md", HUB),
    ).toEqual([]);
  });

  test("token parsing follows gate-decide: trimmed, empties dropped", () => {
    expect(includeTokens(`include-if="a, b ,, c"`)).toEqual(["a", "b", "c"]);
    expect(includeTokens(`exclude-if="a"`)).toBeNull();
    expect(includeTokens(`include-if=""`)).toBeNull();
    expect(includeTokens(``)).toBeNull();
  });

  test("a comma list still collides when only one of its tokens overlaps", () => {
    expect(
      findAxisViolations(pair("kubernetes, gme", "agentgateway"), "t.md", HUB),
    ).toHaveLength(1);
  });
});

test.describe("gate-axis collision: corpus", () => {
  // Skips rather than passes when unconfigured. With no combinations there is
  // nothing to evaluate a pair against, and a green "no violations" would be a
  // false all-clear on a consumer that simply never described its builds.
  test.skip(
    !ENABLED || AXES.length === 0 || SCAN_ROOTS.length === 0,
    "needs [checks].gateAxisCollision, [[gateAxes]] and scanRoots",
  );

  test("no conditional-text either/or pair renders both branches", () => {
    const violations = SCAN_ROOTS.flatMap((root) =>
      scanRootForAxisViolations(root, AXES),
    );
    const report = violations
      .map((v) =>
        formatAxisViolation({
          ...v,
          file: path.relative(target.configDir, v.file),
        }),
      )
      .join("\n\n");
    expect(violations, report).toEqual([]);
  });
});
