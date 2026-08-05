#!/usr/bin/env node
// scan-overrides — inventory every way a consumer repo SHADOWS docs-theme-extras.
//
// Why this exists: a correct theme change can still be a regression on a consumer
// that carries its own copy of the thing being changed. That happened in v0.1.26:
// the ordered-list counter fix was right in extras, but the docs hub duplicated
// those rules in assets/css/custom.css, which loads AFTER the module stylesheet
// and so won on equal specificity — leaving the hub worse than before the fix.
// A filename diff could never have found it, because custom.css is a legitimate
// per-repo file; the collision was at the SELECTOR level.
//
// Three mechanisms, in increasing order of how easy they are to miss:
//   1. same-path file  — consumer layouts/<path> beats module layouts/<path>
//   2. duplicated CSS selector — consumer CSS redefines a selector extras owns
//   3. divergent markup contract — an override emits different class names, so
//      extras specs that match those classes silently cover only the fixture
//
// Usage (from the docs-theme-extras repo root, with sibling consumer clones):
//   node tests/helpers/scan-overrides.mjs           # human-readable report
//   node tests/helpers/scan-overrides.mjs --json    # machine-readable
//
// Consumers are resolved relative to the parent directory. Keep this list in
// sync with .claude/skills/release (the repos whose pin gets bumped).

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const PARENT = path.resolve(ROOT, "..");
export const CONSUMERS = [
  { name: "docs", dir: "docs" },
  { name: "kgateway-oss", dir: "kgateway-oss" },
  { name: "agentgateway-oss-website", dir: "agentgateway-oss-website" },
  { name: "agentregistry-oss-website", dir: "agentregistry-oss-website" },
  { name: "kagent-oss-website", dir: "kagent-oss-website/docs-site" },
  { name: "ambientmesh.io", dir: "ambientmesh.io" },
];

// extras' own CSS layers. custom.css is deliberately excluded: it is a per-repo
// slot that every consumer is MEANT to replace, so a same-path "shadow" of it is
// by design. What is not by design is that file redefining extras' selectors.
const EXTRAS_CSS = [
  "assets/css/docs-theme-extras.css",
  "assets/css/brand-oss.css",
  "assets/css/brand-enterprise.css",
  "assets/css/glossary.css",
];
const SKIP_DIRS = new Set([
  ".git", "node_modules", "public", "public-oss", "public-enterprise",
  "resources", "_vendor", ".oss-clones", "worktree-checkouts",
]);

function walk(base, exts) {
  const out = new Map();
  if (!fs.existsSync(base)) return out;
  const rec = (d) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(path.join(d, e.name));
      } else if (exts.some((x) => e.name.endsWith(x))) {
        const p = path.join(d, e.name);
        out.set(path.relative(base, p), p);
      }
    }
  };
  rec(base);
  return out;
}

/** Top-level selector -> normalized declaration bodies. Skips at-rules. */
export function cssBlocks(file) {
  const src = fs.readFileSync(file, "utf8").replace(/\/\*[\s\S]*?\*\//g, "");
  const out = new Map();
  let depth = 0, sel = "", body = "", buf = "";
  for (const c of src) {
    if (c === "{") {
      if (++depth === 1) { sel = buf.trim().replace(/\s+/g, " "); buf = ""; body = ""; }
      else body += c;
    } else if (c === "}") {
      if (--depth === 0) {
        if (sel && !sel.startsWith("@")) {
          const norm = body.replace(/\s+/g, " ").replace(/\s*([:;])\s*/g, "$1").trim().replace(/;$/, "");
          for (const part of sel.split(",")) {
            const k = part.trim().replace(/\s+/g, " ");
            if (k) out.set(k, [...(out.get(k) ?? []), norm]);
          }
        }
        buf = "";
      } else body += c;
    } else if (depth === 0) buf += c;
    else body += c;
  }
  return out;
}

function emittedClasses(file) {
  const src = fs.readFileSync(file, "utf8");
  const out = new Set();
  for (const m of src.matchAll(/class="([^"{}]*)"/g))
    for (const c of m[1].split(/\s+/))
      if (c.length > 2 && !c.startsWith("hx:") && !c.startsWith("{{")) out.add(c);
  return out;
}

export function scan() {
  const exLayouts = walk(path.join(ROOT, "layouts"), [".html"]);
  const exAssets = walk(path.join(ROOT, "assets"), [".css", ".js"]);
  const exSelectors = new Map();
  for (const rel of EXTRAS_CSS) {
    const f = path.join(ROOT, rel);
    if (!fs.existsSync(f)) continue;
    for (const [k, v] of cssBlocks(f)) exSelectors.set(k, [...(exSelectors.get(k) ?? []), ...v]);
  }

  const report = [];
  for (const { name, dir } of CONSUMERS) {
    const base = path.join(PARENT, dir);
    if (!fs.existsSync(base)) { report.push({ name, missing: true }); continue; }

    const samePath = [];
    for (const [sub, ex] of [["layouts", exLayouts], ["assets", exAssets]]) {
      const cf = walk(path.join(base, sub), [".html", ".css", ".js"]);
      for (const rel of [...cf.keys()].sort()) {
        if (!ex.has(rel)) continue;
        if (rel === "css/custom.css") continue; // per-repo slot, by design
        const a = fs.readFileSync(ex.get(rel), "utf8");
        const b = fs.readFileSync(cf.get(rel), "utf8");
        samePath.push({ file: `${sub}/${rel}`, identical: a === b, extrasBytes: a.length, consumerBytes: b.length });
      }
    }

    const dupSame = [], dupDiff = [];
    const cssDir = path.join(base, "assets/css");
    if (fs.existsSync(cssDir)) {
      for (const f of fs.readdirSync(cssDir).filter((x) => x.endsWith(".css")).sort()) {
        for (const [sel, decls] of cssBlocks(path.join(cssDir, f))) {
          const ex = exSelectors.get(sel);
          if (!ex) continue;
          (decls.some((d) => ex.includes(d)) ? dupSame : dupDiff).push({ file: f, sel });
        }
      }
    }

    const contract = [];
    for (const { file } of samePath.filter((s) => s.file.endsWith(".html") && !s.identical)) {
      const ex = emittedClasses(path.join(ROOT, file));
      const co = emittedClasses(path.join(base, file));
      const onlyExtras = [...ex].filter((c) => !co.has(c)).sort();
      const onlyConsumer = [...co].filter((c) => !ex.has(c)).sort();
      if (onlyExtras.length || onlyConsumer.length) contract.push({ file, onlyExtras, onlyConsumer });
    }
    report.push({ name, samePath, dupSame, dupDiff, contract });
  }
  return report;
}

if (process.argv[1] && import.meta.url.endsWith(path.basename(process.argv[1]))) {
  const r = scan();
  if (process.argv.includes("--json")) {
    console.log(JSON.stringify(r, null, 2));
  } else {
    for (const c of r) {
      if (c.missing) { console.log(`\n## ${c.name}\n  (clone not found)`); continue; }
      console.log(`\n## ${c.name}`);
      console.log(`  same-path shadows       : ${c.samePath.length} (${c.samePath.filter((s) => s.identical).length} byte-identical)`);
      console.log(`  duplicated selectors    : ${c.dupSame.length + c.dupDiff.length} (${c.dupDiff.length} DIVERGENT)`);
      console.log(`  contract divergences    : ${c.contract.length}`);
      for (const s of c.samePath) console.log(`     ${s.identical ? "=" : "~"} ${s.file}  ${s.extrasBytes}B/${s.consumerBytes}B`);
      for (const d of c.dupDiff) console.log(`     DIVERGENT selector  ${d.file}  ${d.sel}`);
    }
  }
}
