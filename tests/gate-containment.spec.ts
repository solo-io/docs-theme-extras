import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { markerAncestorPaths, toSnapshot } from "./helpers/ancestor-path";
import { target } from "./helpers/target";

// Structural baseline for the gate refactor.
//
// Every MARKER_*/COND_* sentinel on every built fixture page is mapped to the
// chain of elements it sits inside, and the whole map is pinned to a committed
// snapshot. Phase 5 rewrites how `version` and `conditional-text` emit their
// bodies; this is the check that says whether any of that moved content to a
// different parent.
//
// WHY THIS EXISTS ALONGSIDE versioning.spec.ts
//
// That spec compares the `everything` and `rebased` pages to EACH OTHER over a
// list of tag names, counting occurrences. Two blind spots:
//
//   1. A SYMMETRIC regression — one that hits both pipelines — keeps the two
//      sides equal and passes.
//   2. Counting cannot see CONTAINER EJECTION at all. When a heading is ejected
//      out of `.content`, the count of `<h2>` does not change; the heading has
//      only moved. That is solo-io/docs#3280 comment 2, where the ejected
//      heading rendered unstyled. Counting `<li>` likewise cannot distinguish an
//      item in the correct `<ol>` from one in a severed `<ol start="2">`.
//
// So this spec is absolute rather than comparative, and structural rather than
// numeric. The issue asks for exactly this: diagnose container ejection with a
// real HTML parser, NOT div-counting or byte comparison.
//
// UPDATING THE SNAPSHOT
//
// Run with UPDATE_CONTAINMENT_SNAPSHOT=1. Then READ THE DIFF — a moved marker is
// the signal this spec exists to produce, so an unexplained move is a bug report,
// not a snapshot to bless.
//
// ONE SNAPSHOT, BOTH BRANDS — deliberately.
//
// The first version wrote `gate-containment-<brand>.json` and produced two
// byte-identical 137 KB files. Measured: the OSS and enterprise builds of
// `test/v2/everything` differ (373,762 vs 374,267 bytes) but their marker sets
// and ancestor chains are the same, because brand switches the CSS layer and
// some labels, not the document structure. Version gating is what removes
// content, and that is orthogonal to brand.
//
// So both brands compare against ONE file, which also turns "brand must not
// change where content sits" into an asserted invariant instead of an
// assumption: if a future change makes brand structural, one of the two brand
// runs fails, which is the correct and informative outcome.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const SNAPSHOT_DIR = path.join(process.cwd(), "tests", "helpers");
const SNAPSHOT = path.join(SNAPSHOT_DIR, "gate-containment.json");
const UPDATING = process.env.UPDATE_CONTAINMENT_SNAPSHOT === "1";

// `html > body > ` prefixes every path and carries no information; drop it so
// the snapshot diffs stay readable. Ejection out of `.content` is still visible,
// because `div.content` sits well below `body`.
const PREFIX = "html > body > ";

function builtPages(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) stack.push(path.join(dir, e.name));
      else if (e.name === "index.html") out.push(path.join(dir, e.name));
    }
  }
  return out.sort();
}

function collect(): Record<string, Record<string, string>> {
  const root = target.productRoot;
  const result: Record<string, Record<string, string>> = {};
  for (const file of builtPages(root)) {
    const rel = path.relative(root, file).replace(/\/index\.html$/, "") || ".";
    const paths = markerAncestorPaths(fs.readFileSync(file, "utf8"));
    if (!paths.size) continue;
    const trimmed = new Map(
      [...paths].map(([k, v]) => [k, v.startsWith(PREFIX) ? v.slice(PREFIX.length) : v]),
    );
    result[rel] = toSnapshot(trimmed);
  }
  return result;
}

test.describe("gate containment: marker ancestor paths", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only structural baseline");

  test("every marker sits where the snapshot says it does", () => {
    const actual = collect();

    // Guard against a vacuous pass. An empty or near-empty collection means the
    // build is missing or productRoot is wrong, and comparing {} to {} would
    // report success while measuring nothing.
    const markerCount = Object.values(actual).reduce(
      (n, page) => n + Object.keys(page).length,
      0,
    );
    expect(
      markerCount,
      `collected ${markerCount} markers from ${target.productRoot} — the build ` +
        `is missing or productRoot is wrong, so this check measured nothing`,
    ).toBeGreaterThan(100);

    if (UPDATING || !fs.existsSync(SNAPSHOT)) {
      fs.writeFileSync(SNAPSHOT, JSON.stringify(actual, null, 2) + "\n");
      test.skip(true, `snapshot written to ${path.basename(SNAPSHOT)} — review the diff`);
    }

    const expected = JSON.parse(fs.readFileSync(SNAPSHOT, "utf8"));

    // Report page-by-page so a failure names the marker that moved rather than
    // dumping the whole document.
    const moved: string[] = [];
    const added: string[] = [];
    const removed: string[] = [];
    for (const page of new Set([...Object.keys(expected), ...Object.keys(actual)])) {
      const e = expected[page] ?? {};
      const a = actual[page] ?? {};
      for (const k of new Set([...Object.keys(e), ...Object.keys(a)])) {
        if (!(k in a)) removed.push(`${page}  ${k}`);
        else if (!(k in e)) added.push(`${page}  ${k}\n      now: ${a[k]}`);
        else if (e[k] !== a[k])
          moved.push(`${page}  ${k}\n      was: ${e[k]}\n      now: ${a[k]}`);
      }
    }

    expect(
      moved,
      "a marker changed its ancestor chain — content moved to a different " +
        "container. This is the container-ejection signal; treat it as a bug " +
        "until proven otherwise, not as a snapshot to refresh.",
    ).toEqual([]);
    expect(
      removed,
      "a marker disappeared from the build — gated content that used to render " +
        "no longer does",
    ).toEqual([]);
    expect(
      added,
      "a new marker appeared. Expected when a fixture page is added; run with " +
        "UPDATE_CONTAINMENT_SNAPSHOT=1 to accept.",
    ).toEqual([]);
  });
});
