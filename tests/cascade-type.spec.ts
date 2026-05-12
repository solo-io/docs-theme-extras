import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Source-side smoke check for "I added a new product but forgot the
// cascade.type bit on its _index.md."
//
// Hextra's docs layout only kicks in when a page's `type` resolves to
// "default" (or whatever the consumer's docs layout key is). The
// idiomatic way to set this across an entire product subtree is a
// `cascade.type` in the product's root _index.md — every descendant
// inherits it. Forgetting it means the sidebar and breadcrumbs silently
// don't render for that product.
//
// The check is intentionally cheap: for each scanRoot in CONFIG, look
// for an _index.md and assert it sets either a top-level `type` or
// SOMETHING under `cascade:`. We don't enforce the value because
// "default" vs "docs" vs custom layouts depends on the consumer.
//
// Skips entirely when:
//   - `cascadeType` is disabled in [checks]
//   - no scanRoots are configured (consumers that don't ship source)

const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("cascadeType");

function extractFrontMatter(source: string): string | null {
  // YAML front matter: --- ... --- at start of file. Tolerate CRLF.
  const m = source.match(/^---\r?\n([\s\S]*?)\r?\n---/);
  return m ? m[1] : null;
}

function hasCascadeOrType(fm: string): boolean {
  // Top-level `type: <something>` is enough (rare on _index.md but valid).
  if (/^type:\s*\S/m.test(fm)) return true;

  // Otherwise look for a `cascade:` block with a `type:` somewhere
  // inside. The block ends at the next un-indented line.
  const lines = fm.split(/\r?\n/);
  let inCascade = false;
  let cascadeIndent = -1;
  for (const line of lines) {
    if (!inCascade) {
      if (/^cascade\s*:/.test(line)) {
        inCascade = true;
        // The block starts on the NEXT line. We'll figure out indent
        // from the first non-empty line.
        cascadeIndent = -1;
      }
      continue;
    }
    // Inside the cascade block. Skip blank lines.
    if (/^\s*$/.test(line)) continue;
    const indentMatch = line.match(/^(\s+)\S/);
    if (!indentMatch) {
      // Un-indented line means the cascade block ended.
      inCascade = false;
      continue;
    }
    if (cascadeIndent < 0) cascadeIndent = indentMatch[1].length;
    // YAML lists ("- type: ...") count as content of the cascade block;
    // tolerate that too.
    const stripped = line.slice(indentMatch[1].length);
    if (/^-?\s*type\s*:\s*\S/.test(stripped)) return true;
  }
  return false;
}

test.describe("scanRoot _index.md sets type or cascade.type", () => {
  test.skip(!ENABLED, "cascadeType check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  for (const root of SCAN_ROOTS) {
    const indexPath = path.join(root, "_index.md");
    const reportName = path.relative(target.configDir, indexPath) || indexPath;
    test(`${reportName} sets type or cascade.type`, () => {
      test.skip(
        !fs.existsSync(indexPath),
        `no _index.md at scanRoot ${root} (probably not a product root)`,
      );
      const source = fs.readFileSync(indexPath, "utf8");
      const fm = extractFrontMatter(source);
      expect(
        fm,
        `${reportName} has no YAML front matter — Hextra needs at least \`type\` to render the docs layout`,
      ).not.toBeNull();
      expect(
        hasCascadeOrType(fm!),
        `${reportName} missing \`type:\` or \`cascade.type:\` — Hextra's docs layout (sidebar, breadcrumb, TOC) won't render for descendants. ` +
          `Add to the front matter:\n\ncascade:\n  type: default\n`,
      ).toBe(true);
    });
  }
});
