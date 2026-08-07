#!/usr/bin/env node
// scan-overrides — inventory every way a consumer repo SHADOWS docs-theme-extras.
//
// Why this exists: a correct theme change can still be a regression on a consumer
// that carries its own copy of the thing being changed. That happened with the
// ordered-list counter fix: it was right in extras, but the docs hub duplicated
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
//   npm run scan:overrides            # human-readable report
//   npm run scan:overrides -- --json  # machine-readable
//
// This module is import-only; the CLI entry point lives in scripts/, outside
// playwright's testDir. It used to self-invoke via `import.meta.url`, which
// forced the file to load as ESM while playwright transpiled it to CJS —
// "exports is not defined in ES module scope" the moment a spec imported it.
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

/* Split a selector group on TOP-LEVEL commas only. A naive `sel.split(",")`
   tears functional pseudo-classes apart — `:where(.dark, .dark *)` became the
   two bogus selectors `:where(.dark` and `.dark *)`, the first of which can
   never match anything and the second of which is a false collision. Hextra
   v0.12 emits `:where(.dark, .dark *)` heavily, so this is not an edge case. */
function splitSelectorGroup(sel) {
  const parts = [];
  let depth = 0, buf = "";
  for (const c of sel) {
    if (c === "(" || c === "[") depth++;
    else if (c === ")" || c === "]") depth--;
    if (c === "," && depth === 0) { parts.push(buf); buf = ""; continue; }
    buf += c;
  }
  parts.push(buf);
  return parts;
}

/* Declaration list -> { property: value }, last write wins.
 *
 * Splitting on `;` and `:` naively is wrong: `background: url(a;b)` and
 * `grid-template-columns: repeat(auto-fill, minmax(200px, 1fr))` both carry
 * separators inside parentheses, and `background: url(data:image/svg+xml,...)`
 * carries a colon inside a value. So both splits are depth-aware, and only the
 * FIRST top-level colon separates property from value. */
export function declMap(decls: string[]): Record<string, string> {
  const out: Record<string, string> = {};
  for (const block of decls) {
    let depth = 0, buf = "";
    const flush = () => {
      const s = buf.trim();
      buf = "";
      if (!s) return;
      let d = 0, at = -1;
      for (let i = 0; i < s.length; i++) {
        const c = s[i];
        if (c === "(" || c === "[") d++;
        else if (c === ")" || c === "]") d--;
        else if (c === ":" && d === 0) { at = i; break; }
      }
      if (at < 0) return;
      out[s.slice(0, at).trim()] = s.slice(at + 1).trim();
    };
    for (const c of block) {
      if (c === "(" || c === "[") depth++;
      else if (c === ")" || c === "]") depth--;
      if (c === ";" && depth === 0) { flush(); continue; }
      buf += c;
    }
    flush();
  }
  return out;
}

/* Are two CSS values the same paint, written differently?
 *
 * `#1e40af` and `rgb(30, 64, 175)` are the same colour, and a consumer that
 * writes one where extras writes the other is duplicating, not diverging —
 * deleting it is a no-op. Without this the report calls them DIVERGENT and the
 * reader has to convert by hand, which is how the hex/token equivalence check
 * became a manual step in the Phase 7a notes.
 *
 * Deliberately narrow: hex (3/4/6/8 digit) and rgb()/rgba() only. `hsl()` is NOT
 * converted, because comparing it to rgb needs real colour maths and a rounding
 * policy, and a wrong "these are equal" is far worse here than a spurious
 * DIVERGENT — one deletes a rule that was doing something, the other just asks
 * a human to look. Whitespace and `!important` are normalized on every value. */
function canonValue(v: string): string {
  let s = v.trim().replace(/\s+/g, " ").replace(/\s*!\s*important$/i, "");
  const hex = s.match(/^#([0-9a-f]{3,8})$/i);
  if (hex) {
    let h = hex[1].toLowerCase();
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join("");
    const n = (i: number) => parseInt(h.slice(i * 2, i * 2 + 2), 16);
    return h.length === 8
      ? `rgba(${n(0)},${n(1)},${n(2)},${+(n(3) / 255).toFixed(3)})`
      : `rgb(${n(0)},${n(1)},${n(2)})`;
  }
  const rgb = s.match(/^rgba?\(([^)]+)\)$/i);
  if (rgb) {
    const p = rgb[1].split(/[,\s/]+/).filter(Boolean).map((x) => x.trim());
    if (p.length === 3) return `rgb(${p.join(",")})`;
    if (p.length === 4) return `rgba(${p.slice(0, 3).join(",")},${+Number(p[3]).toFixed(3)})`;
  }
  return s.replace(/,\s+/g, ",");
}

/** Compare one consumer rule against extras'. Returns only the properties they
    BOTH set, split by whether the value actually differs. A selector they share
    but whose property sets are disjoint is not a conflict at all — extras'
    `.hextra-toc { display: none }` and a Tailwind `font-family` on the same
    class never fight, and reporting them as divergent is what made the "four of
    six consumers override .hextra-toc" backlog item look real when nobody
    overrides it. */
export function compareRule(extrasDecls: string[], consumerDecls: string[]) {
  const a = declMap(extrasDecls);
  const b = declMap(consumerDecls);
  const shared = Object.keys(b).filter((p) => p in a);
  const equivalent: string[] = [];
  const differing: { prop: string; extras: string; consumer: string }[] = [];
  const bang = (v: string) => /!\s*important\s*$/i.test(v.trim());
  for (const p of shared) {
    // `!important` is compared BEFORE the value is canonicalized, because
    // canonValue strips it. Two rules with the same paint but different
    // importance are not interchangeable: the consumer's `!important` may be
    // what beats a Hextra core rule, so deleting it is a behavior change even
    // though the declared value matches. Report it as divergent and let a human
    // check what it was written to win against.
    if (bang(a[p]) !== bang(b[p])) differing.push({ prop: p, extras: a[p], consumer: b[p] });
    else if (canonValue(a[p]) === canonValue(b[p])) equivalent.push(p);
    else differing.push({ prop: p, extras: a[p], consumer: b[p] });
  }
  return { shared, equivalent, differing };
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
          for (const part of splitSelectorGroup(sel)) {
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

/**
 * Extension slots — partials a consumer is INVITED to replace.
 *
 * These are same-path overrides in the mechanical sense, but counting them as
 * drift inverts the signal. The slots exist precisely so a consumer can inject
 * its own navbar, chatbot, page width or status badge WITHOUT forking
 * `layouts/docs/{single,list}.html` — and a fork is what actually causes harm,
 * because it silently stops receiving every feature the module adds afterwards.
 * That is how kgateway.dev came to be missing `page-description` on 856 pages.
 *
 * So a slot override is a success, and a `layouts/docs/single.html` override is
 * a defect. Lumping them into one number would have meant agentgateway.dev's
 * shadow count going UP (5 -> 8) at the exact moment it stopped forking two
 * layouts, which would train everyone to ignore the number.
 *
 * Keep this list in sync with the files in `layouts/partials/docs/` that carry
 * an "EXTENSION SLOT" header comment.
 */
const SLOT_OVERRIDES = new Set([
  "layouts/partials/docs/chrome-top.html",
  "layouts/partials/docs/chrome-bottom.html",
  "layouts/partials/docs/width-class.html",
  "layouts/partials/docs/content-class.html",
  "layouts/partials/docs/after-title.html",
]);

export function isSlotOverride(file: string): boolean {
  return SLOT_OVERRIDES.has(file);
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
    const slotOverrides = [];
    for (const [sub, ex] of [["layouts", exLayouts], ["assets", exAssets]]) {
      const cf = walk(path.join(base, sub), [".html", ".css", ".js"]);
      for (const rel of [...cf.keys()].sort()) {
        if (!ex.has(rel)) continue;
        if (rel === "css/custom.css") continue; // per-repo slot, by design
        const a = fs.readFileSync(ex.get(rel), "utf8");
        const b = fs.readFileSync(cf.get(rel), "utf8");
        const entry = { file: `${sub}/${rel}`, identical: a === b, extrasBytes: a.length, consumerBytes: b.length };
        (isSlotOverride(entry.file) ? slotOverrides : samePath).push(entry);
      }
    }

    // Three buckets, because they call for three different actions:
    //   noConflict — same selector, disjoint properties. Nothing to do.
    //   dupSame    — every shared property has the same value. Safe to delete.
    //   dupDiff    — at least one shared property differs. Needs a human.
    const noConflict = [], dupSame = [], dupDiff = [];
    const cssDir = path.join(base, "assets/css");
    if (fs.existsSync(cssDir)) {
      for (const f of fs.readdirSync(cssDir).filter((x) => x.endsWith(".css")).sort()) {
        for (const [sel, decls] of cssBlocks(path.join(cssDir, f))) {
          const ex = exSelectors.get(sel);
          if (!ex) continue;
          const cmp = compareRule(ex, decls);
          if (cmp.shared.length === 0) noConflict.push({ file: f, sel });
          else if (cmp.differing.length === 0) dupSame.push({ file: f, sel, equivalent: cmp.equivalent });
          else dupDiff.push({ file: f, sel, ...cmp });
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
    report.push({ name, samePath, slotOverrides, noConflict, dupSame, dupDiff, contract });
  }
  return report;
}

/** Human-readable report. Kept here rather than in the CLI wrapper so the
    formatting is covered by the same module the spec imports. */
export function formatReport(r: ReturnType<typeof scan>): string {
  const out: string[] = [];
  for (const c of r) {
    if (c.missing) { out.push(`\n## ${c.name}\n  (clone not found)`); continue; }
    out.push(`\n## ${c.name}`);
    out.push(`  same-path shadows       : ${c.samePath.length} (${c.samePath.filter((s) => s.identical).length} byte-identical)`);
    out.push(`  redundant selectors     : ${c.dupSame.length} (same value as extras — safe to delete)`);
    out.push(`  DIVERGENT selectors     : ${c.dupDiff.length} (a shared property actually differs)`);
    out.push(`  shared-name only        : ${c.noConflict.length} (no property in common — ignore)`);
    out.push(`  contract divergences    : ${c.contract.length}`);
    out.push(`  slot overrides          : ${c.slotOverrides.length} (sanctioned — this is the mechanism working)`);
    for (const s of c.samePath) out.push(`     ${s.identical ? "=" : "~"} ${s.file}  ${s.extrasBytes}B/${s.consumerBytes}B`);
    for (const s of c.slotOverrides) out.push(`     slot  ${s.file}`);
    for (const d of c.dupSame) {
      out.push(`     redundant  ${d.file}  ${d.sel}  [${d.equivalent.join(", ")}]`);
    }
    for (const d of c.dupDiff) {
      out.push(`     DIVERGENT  ${d.file}  ${d.sel}`);
      for (const p of d.differing) {
        out.push(`         ${p.prop}:  extras ${p.extras}   |   consumer ${p.consumer}`);
      }
      if (d.equivalent.length) {
        out.push(`         (same value: ${d.equivalent.join(", ")})`);
      }
    }
  }
  return out.join("\n");
}
