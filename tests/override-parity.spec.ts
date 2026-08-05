import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { cssBlocks, CONSUMERS, scan } from "./helpers/scan-overrides";
import baseline from "./helpers/override-baseline.json";
import { target } from "./helpers/target";

// Guard for the THIRD failure mode this repo has: not "the theme is wrong" and
// not "the fixture is wrong", but "the theme is right and a consumer's own copy
// of the same thing wins anyway".
//
// The ordered-list counter fix is the worked example. It was correct in
// the module, but the docs hub duplicated those rules in assets/css/custom.css,
// which is concatenated AFTER the module stylesheet and therefore wins on equal
// specificity. Bumping the pin alone left the hub WORSE than before the fix —
// markers stopped incrementing at all. Every extras test was green. It was
// found by eye, on a real build, by accident.
//
// The fixture structurally cannot catch this: it ships a bare custom.css on
// purpose, so it exercises a CSS environment no real consumer has. The only
// place the collision is visible is across repo boundaries, which is what this
// spec walks. See OVERRIDES.md for the prose.
//
// SCOPE, stated plainly: the cross-repo half needs sibling consumer clones, so
// it does NOT run in CI — it is a pre-release check for a developer machine
// (OVERRIDES.md step 1). The unit tests below DO run everywhere, because the
// scanner's own correctness is the thing everything else rests on.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PARENT = path.resolve(process.cwd(), "..");
const CLONES_PRESENT = CONSUMERS.filter((c) =>
  fs.existsSync(path.join(PARENT, c.dir)),
).map((c) => c.name);

type Entry = { samePath: string[]; duplicatedSelectors: string[] };
const BASE = baseline.consumers as Record<string, Entry>;

function inBaseline(name: string): Entry {
  return BASE[name] ?? { samePath: [], duplicatedSelectors: [] };
}

function diff(actual: string[], expected: string[]) {
  const e = new Set(expected);
  const a = new Set(actual);
  return {
    added: actual.filter((x) => !e.has(x)).sort(),
    stale: expected.filter((x) => !a.has(x)).sort(),
  };
}

// ── Unit: the selector splitter ──────────────────────────────────────────────
// These are the scanner's own correctness tests. They run on every target,
// including consumers, because a false negative here disarms everything below.
test.describe("scan-overrides selector parsing", () => {
  function blocksOf(css: string): Map<string, string[]> {
    const f = path.join(
      fs.mkdtempSync(path.join(os.tmpdir(), "extras-css-")),
      "t.css",
    );
    fs.writeFileSync(f, css);
    return cssBlocks(f);
  }

  test("splits a selector group on top-level commas", () => {
    const keys = [...blocksOf(".a, .b .c { color: red }").keys()];
    expect(keys).toEqual([".a", ".b .c"]);
  });

  // The bug this guards: a naive sel.split(",") tore `:where(.dark, .dark *)`
  // into `:where(.dark` and `.dark *)`. The first can never match anything, and
  // the second is a phantom collision — it made kagent-oss-website report one
  // duplicated selector that does not exist. Hextra v0.12 emits this shape
  // heavily, so it is not an edge case.
  test("does NOT split inside a functional pseudo-class", () => {
    const keys = [...blocksOf(":where(.dark, .dark *) { color: red }").keys()];
    expect(keys).toEqual([":where(.dark, .dark *)"]);
  });

  test("does NOT split inside an attribute selector", () => {
    const keys = [
      ...blocksOf('a[data-x="p,q"], .b { color: red }').keys(),
    ];
    expect(keys).toEqual(['a[data-x="p,q"]', ".b"]);
  });

  test("skips at-rules so nested blocks are not read as selectors", () => {
    const keys = [
      ...blocksOf("@media (min-width: 40rem) { .a { color: red } }").keys(),
    ];
    expect(keys).toEqual([]);
  });
});

// ── Ratchet: shadows may shrink, never grow ─────────────────────────────────
test.describe("consumer shadow inventory", () => {
  test.skip(!IS_FIXTURE_TARGET, "cross-repo check runs from the extras repo");
  test.skip(
    CLONES_PRESENT.length === 0,
    "no sibling consumer clones found — clone them next to docs-theme-extras",
  );

  const report = IS_FIXTURE_TARGET && CLONES_PRESENT.length ? scan() : [];

  for (const c of report) {
    if (c.missing) continue;

    test(`${c.name}: no new same-path file shadows`, () => {
      const actual = c.samePath.map((s: { file: string }) => s.file).sort();
      const { added, stale } = diff(actual, inBaseline(c.name).samePath);
      expect(
        added,
        `${c.name} now overrides module files that are not in the baseline. ` +
          `A same-path file WINS over the module's copy, so extras changes to ` +
          `these files will not reach this consumer. Either delete the ` +
          `override, or add it to tests/helpers/override-baseline.json AND ` +
          `describe it in OVERRIDES.md.`,
      ).toEqual([]);
      expect(
        stale,
        `${c.name} no longer overrides these — good. Remove them from ` +
          `tests/helpers/override-baseline.json so the ratchet tightens.`,
      ).toEqual([]);
    });

    test(`${c.name}: no new CSS selectors duplicated from extras`, () => {
      const actual = [...c.dupSame, ...c.dupDiff]
        .map((d: { file: string; sel: string }) => `${d.file} :: ${d.sel}`)
        .sort();
      const { added, stale } = diff(
        actual,
        inBaseline(c.name).duplicatedSelectors,
      );
      expect(
        added,
        `${c.name} redefines selectors that docs-theme-extras owns. There is ` +
          `no filename collision here — the consumer's CSS simply loads after ` +
          `the module's and wins on equal specificity, so a future extras ` +
          `change to these rules is silently discarded. THIS IS THE CHECK ` +
          `THAT WOULD HAVE CAUGHT THE ORDERED-LIST COUNTER REGRESSION.`,
      ).toEqual([]);
      expect(
        stale,
        `${c.name} no longer duplicates these — good. Remove them from ` +
          `tests/helpers/override-baseline.json so the ratchet tightens.`,
      ).toEqual([]);
    });
  }
});

// ── The inventory must stay documented, not just counted ────────────────────
test.describe("OVERRIDES.md matches the baseline", () => {
  test.skip(!IS_FIXTURE_TARGET, "cross-repo check runs from the extras repo");

  const doc = fs.existsSync("OVERRIDES.md")
    ? fs.readFileSync("OVERRIDES.md", "utf8")
    : "";

  test("OVERRIDES.md exists", () => {
    expect(doc.length, "OVERRIDES.md is the prose half of the inventory").toBeGreaterThan(0);
  });

  test("every consumer carrying a shadow is described", () => {
    const undocumented = Object.entries(BASE)
      .filter(([, v]) => v.samePath.length || v.duplicatedSelectors.length)
      .map(([name]) => name)
      .filter((name) => !doc.includes(name));
    expect(
      undocumented,
      "a consumer with accepted shadows must have a section in OVERRIDES.md, " +
        "or the inventory rots into a list of numbers nobody can act on",
    ).toEqual([]);
  });

  // Scoped to the consumer's own `###` section, not the whole document. A
  // doc-wide search is far too weak: kgateway-oss and agentgateway-oss-website
  // both fork `navbar.html`, so one mention would vacuously satisfy both, and
  // the check would pass while half the inventory went undescribed. Falls back
  // to the whole document for a consumer with no section of its own (some
  // share one, e.g. "kagent-oss-website and ambientmesh.io").
  function sectionFor(name: string): string {
    const sections = doc.split(/^### /m);
    const own = sections.find((s) => s.split("\n", 1)[0].includes(name));
    return own ?? doc;
  }

  // Basename rather than full path: OVERRIDES.md is prose and refers to files
  // as `single.html` / `docs/single.html` interchangeably.
  test("every same-path shadow is named in the prose", () => {
    const missing: string[] = [];
    for (const [name, v] of Object.entries(BASE))
      for (const f of v.samePath)
        if (!sectionFor(name).includes(path.basename(f)))
          missing.push(`${name}: ${f}`);
    expect(
      missing,
      "these overrides are frozen in the baseline but described nowhere. " +
        "A reader cannot tell whether they are deliberate or forgotten.",
    ).toEqual([]);
  });
});

// ── Self-activating sentinel for the Phase 5 gate-form normalization ────────
// reuse.html and rebase.html rewrite {{< version >}} / {{< conditional-text >}}
// invocation forms before rendering, and the gate shortcodes depend on that
// rewrite. A consumer shipping a stale fork of either file gets the new gates
// without the normalization they assume — the exact "bumped the pin, forgot the
// override" failure.
//
// The check arms ITSELF: it is inert until the module's own copy carries the
// sentinel, and from that moment every consumer fork must carry it too. No
// dead code, no test.skip to remember to remove later.
const SENTINEL = "GATE-FORM-NORMALIZATION-v1";
const FORM_FILES = [
  "layouts/_shortcodes/reuse.html",
  "layouts/_shortcodes/rebase.html",
];

test.describe("gate-form normalization sentinel", () => {
  test.skip(!IS_FIXTURE_TARGET, "cross-repo check runs from the extras repo");

  for (const rel of FORM_FILES) {
    test(`consumer forks of ${path.basename(rel)} carry the sentinel`, () => {
      const moduleCopy = fs.existsSync(rel) ? fs.readFileSync(rel, "utf8") : "";
      test.skip(
        !moduleCopy.includes(SENTINEL),
        `${rel} does not carry ${SENTINEL} yet — inert until Phase 5 lands it`,
      );
      const stale: string[] = [];
      for (const { name, dir } of CONSUMERS) {
        const f = path.join(PARENT, dir, rel);
        if (!fs.existsSync(f)) continue;
        if (!fs.readFileSync(f, "utf8").includes(SENTINEL)) stale.push(name);
      }
      expect(
        stale,
        `these consumers ship their own ${rel} without ${SENTINEL}. Delete ` +
          `the override, or port the normalization block into it.`,
      ).toEqual([]);
    });
  }
});
