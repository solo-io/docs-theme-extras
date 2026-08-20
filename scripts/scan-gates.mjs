#!/usr/bin/env node
// CLI for tests/helpers/gate-scan.ts — the corpus measurement behind the gate
// refactor. See that module's header for why nesting is the load-bearing case.
//
//   npm run scan:gates -- ../docs/assets ../docs/content ../kgateway-oss/assets
//   npm run scan:gates -- --json ../docs/assets
//
// Lives outside tests/ so playwright's transform never touches it.
import {
  scanRoots, classify, goNoGo, alreadyBroken, indentHazards,
} from "../tests/helpers/gate-scan.ts";

const args = process.argv.slice(2);
const asJson = args.includes("--json");
const roots = args.filter((a) => !a.startsWith("--"));

if (!roots.length) {
  console.error("usage: npm run scan:gates -- [--json] <root> [root...]");
  process.exit(2);
}

const gates = scanRoots(roots);
const nested = gates.filter((g) => g.depth >= 1);
const risky = goNoGo(gates);
const latent = alreadyBroken(gates);
const indent = indentHazards(gates);

if (asJson) {
  console.log(JSON.stringify({
    total: gates.length,
    depth0: gates.length - nested.length,
    nested: nested.length,
    goNoGo: risky,
    alreadyBroken: latent,
    indentHazards: indent,
  }, null, 2));
} else {
  console.log(`total gate openers scanned: ${gates.length}`);
  console.log(`  depth 0 (top level): ${gates.length - nested.length}`);
  console.log(`  depth >=1 (nested):  ${nested.length}`);
  console.log("\n=== depth >= 1, by form and body class ===");
  const counts = new Map();
  for (const g of nested) {
    const k = `${g.form === "<" ? "  angle" : "percent"}  ${classify(g)}`;
    counts.set(k, (counts.get(k) ?? 0) + 1);
  }
  for (const [k, n] of [...counts].sort((a, b) => b[1] - a[1])) console.log(`  ${k}: ${n}`);

  console.log(`\n*** GO/NO-GO: angle-form, depth>=1, hazardous body = ${risky.length} ***`);
  for (const g of risky) console.log(`    ${g.file}:${g.line}  parents=${g.parents}  ${classify(g)}`);

  console.log(`\n(already broken today: percent, depth>=1, hazardous = ${latent.length})`);
  for (const g of latent) console.log(`    ${g.file}:${g.line}  parents=${g.parents}  ${classify(g)}`);

  console.log(`\nindent hazards (body min-indent >= opener column + 4) = ${indent.length}`);
  for (const g of indent) console.log(`    ${g.file}:${g.line}  column=${g.column}`);
}
