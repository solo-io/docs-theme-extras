#!/usr/bin/env node
// CLI entry point for tests/helpers/gen-docs.ts.
//
// Lives outside `tests/` on purpose: playwright's testDir is ./tests, and a
// module in there that self-invokes via `import.meta.url` gets transpiled to
// CJS while being loaded as ESM, which breaks any spec that imports it.
//
//   npm run gen:docs              # write the generated tree
//   npm run gen:docs -- --check   # exit 1 if regenerating would change anything
//   npm run gen:docs -- --json    # machine-readable
//
// Run from the repo root.
import { check, write, generate, formatSkipped } from "../tests/helpers/gen-docs.ts";

const argv = process.argv.slice(2);

if (argv.includes("--json")) {
  const { parsed, skipped } = generate();
  console.log(JSON.stringify({ parsed, skipped }, null, 2));
  process.exit(0);
}

if (argv.includes("--check")) {
  const { changed, skipped } = check();
  console.log(`gen-docs --check`);
  console.log(`  non-conformant headers (no page generated): ${skipped.length}`);
  if (!changed.length) {
    console.log("  generated tree is up to date");
    process.exit(0);
  }
  console.log(`\n  ${changed.length} file(s) would change:`);
  for (const c of changed) console.log(`     ${c}`);
  console.log(`\n  Run \`npm run gen:docs\` and commit the result.`);
  process.exit(1);
}

const { written, removed, skipped } = write();
console.log(`gen-docs`);
console.log(`  written : ${written.length}`);
for (const w of written) console.log(`     ${w}`);
if (removed.length) {
  console.log(`  removed : ${removed.length} (orphaned)`);
  for (const r of removed) console.log(`     ${r}`);
}
// Printed every run, not just on failure. A generator that quietly covers 6 of
// 29 files while reporting success is the exact shape of miss tests/HAZARDS.md
// catalogues.
console.log(`\n  non-conformant headers, no page generated (${skipped.length}):`);
console.log(formatSkipped(skipped));
