#!/usr/bin/env node
// CLI entry point for tests/helpers/scan-overrides.ts.
//
// Lives outside `tests/` on purpose: playwright's testDir is ./tests, and a
// module in there that self-invokes via `import.meta.url` gets transpiled to
// CJS while being loaded as ESM, which breaks any spec that imports it.
//
//   npm run scan:overrides            # human-readable report
//   npm run scan:overrides -- --json  # machine-readable
//
// Run from the repo root, with the consumer clones as siblings.
import { scan, formatReport } from "../tests/helpers/scan-overrides.ts";

const report = scan();
console.log(
  process.argv.includes("--json")
    ? JSON.stringify(report, null, 2)
    : formatReport(report),
);
