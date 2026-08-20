import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Guards the SOURCE-SCANNING lints against passing without reading anything.
//
// WHY THIS EXISTS. solo-io/docs shipped
// `scanRoots = ["./content/en/test", "./assets/conrefs/test"]` — the
// docs-theme-extras FIXTURE's paths, copy-pasted. Neither has ever existed in
// that repo. Six author-side lints (curl-quotes, tab-syntax, shortcode-args,
// heading-shortcode-id, include-form, cascade-type) each walked ZERO files and
// reported green over 11,025 markdown files, for as long as the config existed.
//
// The failure was undetectable from the outside, because "walked nothing, found
// nothing" and "walked everything, found nothing" are the same result. Every one
// of those specs skips only when `scanRoots` is EMPTY, so two non-empty-but-wrong
// entries sailed straight through.
//
// Two guards now close that:
//   1. config.ts throws if a scanRoot path does not exist or is not a directory.
//   2. this spec, for the remaining case — a root that exists but holds no
//      markdown, which config.ts cannot distinguish from a legitimately small one.
//
// This is the same lesson as the `npx serve` directory-listing trap and the
// `::before` pixel-comparison trap: a scanner needs a "found at least N targets"
// self-check, or it certifies nothing while looking like it certifies everything.

const SCAN_ROOTS = target.scanRoots;

function countMarkdown(root: string): number {
  let n = 0;
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) n++;
    }
  }
  return n;
}

test.describe("scanRoots actually contain something to scan", () => {
  test.skip(
    SCAN_ROOTS.length === 0,
    "no scanRoots configured — the source lints are deliberately off here",
  );

  test("every configured scanRoot exists on disk", () => {
    // config.ts already throws on a missing root, so reaching this spec means
    // it passed. Asserted again here so the guarantee is visible in the test
    // output rather than buried in a loader, and so removing the config check
    // fails a test instead of silently widening the hole.
    const missing = SCAN_ROOTS.filter((r) => !fs.existsSync(r));
    expect(
      missing,
      "a scanRoot that does not exist makes every source lint pass without " +
        "reading a file",
    ).toEqual([]);
  });

  test("every configured scanRoot contains at least one markdown file", () => {
    const empty = SCAN_ROOTS.filter((r) => countMarkdown(r) === 0).map((r) =>
      path.relative(target.configDir, r),
    );
    expect(
      empty,
      "these scanRoots hold no .md files, so the lints pointed at them are " +
        "green for the wrong reason. Either fix the path or drop the entry.",
    ).toEqual([]);
  });

  test("the corpus is large enough to be worth linting", () => {
    const total = SCAN_ROOTS.reduce((n, r) => n + countMarkdown(r), 0);
    // Deliberately a floor of 1, not a tuned threshold: the point is to catch
    // "zero", and any real number is fine. A tuned number would just become a
    // maintenance chore that people bump without thinking.
    expect(total, "no markdown found under any scanRoot").toBeGreaterThan(0);
    console.log(
      `scanRoots: ${SCAN_ROOTS.length} root(s), ${total} markdown file(s) in scope`,
    );
  });
});
