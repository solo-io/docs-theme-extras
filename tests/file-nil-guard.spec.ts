import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Source lint: no template may hand a `.File.<x>` expression to `default`.
//
// WHY THIS IS A SOURCE LINT AND NOT A FIXTURE. The bug it guards is real and
// was reproduced directly:
//
//   ERROR ... File is nil; wrap it in if or with: {{ with .File }}{{ .LogicalName }}{{ end }}
//
// `.File` is nil on any page Hugo GENERATED rather than read from disk, and
// `default` evaluates BOTH of its arguments eagerly — so
// `.LinkTitle | default .File.LogicalName` dereferences nil even when
// `.LinkTitle` is set, and takes the whole build down. Hugo blames the calling
// layout, not the line, which is what made the original incident expensive.
//
// A FIXTURE CANNOT COVER IT, and that was established by measurement rather
// than assumed. On Hugo 0.160:
//   - only FIRST-LEVEL content directories without an `_index.md` get a
//     generated section page (a nested one does not become a section at all,
//     so its children keep a non-nil .File); and
//   - those first-level generated sections are rendered by sidebar.html's
//     section-list path, which uses `$page.Title` and is already nil-safe —
//     not by render-sidebar-tree's child loop, where the hazard lives.
// A fixture aimed at that line therefore renders nothing that exercises it. Per
// tests/HAZARDS.md, a test that cannot fail is worse than no test: it certifies
// nothing while looking like coverage. So this pins the SOURCE pattern instead,
// which holds no matter which page shape reaches the code.
//
// SCOPE, stated plainly. This catches the specific eager-evaluation footgun —
// the thing a maintainer re-introduces by "simplifying" the guard back into a
// tidy one-liner. It does NOT attempt to prove every `.File` dereference is
// guarded; that needs real template analysis and would trade false confidence
// for false positives.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const LAYOUTS = path.resolve(__dirname, "..", "layouts");

function templates(dir: string, acc: string[] = []): string[] {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) templates(full, acc);
    else if (e.name.endsWith(".html")) acc.push(full);
  }
  return acc;
}

/** Go template comments are documentation, not code — the fix's own header
 *  quotes the broken form verbatim, and flagging that would be absurd. */
function stripComments(s: string): string {
  return s.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("nil .File guard", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "reads this module's own layouts/ tree; meaningless against a consumer build",
  );

  test("no template passes a .File expression to `default`", () => {
    const files = templates(LAYOUTS);

    // ASSERT THE SCAN FOUND TARGETS. A glob that silently matches zero files
    // reports a clean result while measuring nothing — the failure shape
    // tests/HAZARDS.md catalogues. 30 is a floor well below the real count.
    expect(
      files.length,
      "almost no templates found — has layouts/ moved? A zero-match scan " +
        "passes while certifying nothing.",
    ).toBeGreaterThan(30);

    // `default` anywhere in the same expression as a `.File.` dereference.
    // Covers both `default .File.LogicalName` and `default $page.File.X`.
    const OFFENDER = /default\s+[^}|]*?\.File\./;

    const hits: string[] = [];
    for (const f of files) {
      const src = stripComments(fs.readFileSync(f, "utf8"));
      src.split("\n").forEach((line, i) => {
        if (OFFENDER.test(line)) {
          hits.push(`${path.relative(LAYOUTS, f)}:${i + 1}: ${line.trim()}`);
        }
      });
    }

    expect(
      hits,
      "`default` evaluates BOTH arguments eagerly, so a `.File.` fallback is " +
        "dereferenced even when the first argument is non-empty — and `.File` " +
        "is nil on every Hugo-generated page. This fails the entire build. " +
        "Write it as an explicit guard instead:\n" +
        "    {{- $label := .LinkTitle -}}\n" +
        "    {{- if and (not $label) .File -}}{{- $label = .File.LogicalName -}}{{- end -}}\n",
    ).toEqual([]);
  });
});
