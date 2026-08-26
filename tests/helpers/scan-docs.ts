#!/usr/bin/env node
// scan-docs — inventory what each shortcode's comment header claims versus what
// the template actually reads.
//
// Why this exists: USAGE.md states that "the source file is the source of
// truth: each file under layouts/_shortcodes/ opens with a comment block
// describing its parameters and behavior." Nothing enforces that. Six
// shortcodes have no block at all and three more have a stub, and every
// shortcode gets exactly one row in the USAGE.md table, so parameter-level
// detail exists ONLY in the layer with the holes.
//
// This is the report-mode pass. It asserts nothing and it is deliberately
// format-independent: it does not require the structured header format the
// docs-site plan proposes, because the point of running it first is to size
// the backfill BEFORE that format is locked. Once the format lands, the
// `documented` half of each row gets a strict parser and the spec turns the
// report into assertions.
//
// Usage (from the docs-theme-extras repo root):
//   npm run scan:docs            # human-readable report
//   npm run scan:docs -- --json  # machine-readable
//
// This module is import-only; the CLI entry point lives in scripts/, outside
// playwright's testDir — same reasoning as scan-overrides.ts, which see.

import fs from "node:fs";
import path from "node:path";

const ROOT = process.cwd();
const SHORTCODES = "layouts/_shortcodes";

/* Receivers whose `.Get` is not a shortcode parameter read. `resources.Get`
   fetches an asset, `.Page.Store.Get` / `.Page.Scratch.Get` read cross-call
   state (checklist.html's "checklist-count" and callout.html's "transReg"
   would otherwise both be reported as undocumented parameters). Matched
   against the LAST segment of the receiver, so `$.Page.Scratch` and
   `.Page.Scratch` both hit. */
const NOT_A_PARAM_RECEIVER =
  /(^|\.)(resources|Store|Scratch|Data|os|images|css|js|templates|site|Site)$/i;

/* Partials that read a caller's shortcode params on its behalf. A shortcode
   that delegates — link-hextra.html is four lines and hands `.` straight to
   utils/resolve-link.html — reads zero params directly, so without following
   the call it scores as fully documented while documenting nothing. Followed
   transitively with a depth cap; see collectReads. */
const MAX_PARTIAL_DEPTH = 3;

function resolvePartial(name: string): string | null {
  const rel = name.endsWith(".html") ? name : `${name}.html`;
  // Hextra v0.12+ resolves _partials/ first; a same-path file under partials/
  // is silently shadowed, so look in that order and stop at the first hit.
  for (const dir of ["layouts/_partials", "layouts/partials"]) {
    const p = path.join(ROOT, dir, rel);
    if (fs.existsSync(p)) return p;
  }
  return null;
}

export type Reads = {
  named: string[];
  positional: number[];
  /** `.Get $var` — the key is computed, so no name is recoverable. */
  dynamic: number;
  /** Reached through a partial rather than read in the shortcode itself. */
  viaPartial: Record<string, string[]>;
  inner: boolean;
  paramsLength: boolean;
};

/** Every `.Get "x"` / `.Get N` in one template, minus the non-param receivers. */
export function readsIn(src: string) {
  const named = new Set<string>();
  const positional = new Set<number>();
  let dynamic = 0;

  const re = /([A-Za-z0-9_$.]*)\.Get(?![A-Za-z])\s*(?:"([^"]*)"|`([^`]*)`|(\d+)|(\$[A-Za-z0-9_.]+))?/g;
  for (const m of src.matchAll(re)) {
    const [, receiver, dq, bq, num, variable] = m;
    if (NOT_A_PARAM_RECEIVER.test(receiver)) continue;
    if (dq !== undefined || bq !== undefined) named.add((dq ?? bq) as string);
    else if (num !== undefined) positional.add(Number(num));
    else if (variable !== undefined) dynamic++;
    // A bare `.Get` with no argument at all is a pipeline form (`.Get | ...`)
    // or a mention in prose; neither is countable, so it is dropped rather
    // than inflating the dynamic count.
  }

  /* `isset $sc.Params "include-if"` is a param read that never touches .Get.
     gate-decide.html tests presence that way before fetching the value, and
     for a shortcode that only ever passes the param through, the isset is the
     only occurrence — so skipping this form loses the key entirely. */
  for (const m of src.matchAll(/[A-Za-z0-9_$.]*\.Params\s+"([^"]+)"/g)) named.add(m[1]);
  for (const m of src.matchAll(/isset\s+[A-Za-z0-9_$.]*\.Params\s+"([^"]+)"/g)) named.add(m[1]);

  return { named: [...named].sort(), positional: [...positional].sort(), dynamic };
}

/** Extract the balanced-paren argument that follows `open` (index of the "("). */
function balanced(src: string, open: number): string {
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "(") depth++;
    else if (src[i] === ")" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
  return { named: [...named].sort(), positional: [...positional].sort(), dynamic };
}

/** Partials this template hands its own context to, in either of the two forms
 *  that let the callee read the caller's params.
 *
 *  Bare context — `partial "utils/resolve-link.html" .` — is the obvious one.
 *  The one that is easy to miss, and that this scanner did miss on its first
 *  run, is the context smuggled in as a dict VALUE:
 *
 *      {{ partial "utils/gate-decide.html" (dict "sc" . "tokens" …) }}
 *
 *  gate-decide.html then does `$sc.Get "include-if"`. Matching only the bare
 *  form reported conditional-text as reading zero parameters, which would have
 *  left `include-if` and `exclude-if` — two of the most-used params in the
 *  module — out of the inventory entirely. */
export function delegatesTo(src: string): string[] {
  const out = new Set<string>();
  for (const m of src.matchAll(/partial(?:Cached)?\s+"([^"]+)"\s+(\$|\.)(?![A-Za-z0-9_.])/g))
    out.add(m[1]);
  for (const m of src.matchAll(/partial(?:Cached)?\s+"([^"]+)"\s+\(/g)) {
    const arg = balanced(src, m.index! + m[0].length - 1);
    // A dict key whose value is a bare `.` or `$` — the shortcode context.
    if (/"[^"]+"\s+(\.|\$)(?![A-Za-z0-9_.])/.test(arg)) out.add(m[1]);
  }
  return [...out].sort();
}

function collectReads(file: string): Reads {
  const src = fs.readFileSync(file, "utf8");
  const direct = readsIn(src);
  const viaPartial: Record<string, string[]> = {};

  const seen = new Set<string>();
  const walk = (from: string, fromSrc: string, depth: number) => {
    if (depth > MAX_PARTIAL_DEPTH) return;
    for (const name of delegatesTo(fromSrc)) {
      const p = resolvePartial(name);
      if (!p || seen.has(p)) continue;
      seen.add(p);
      const psrc = fs.readFileSync(p, "utf8");
      const r = readsIn(psrc);
      // Only names the shortcode does not already read directly are
      // interesting; a shared partial also reads keys meant for other callers,
      // so these are reported as a separate, softer signal.
      const extra = r.named.filter((n) => !direct.named.includes(n));
      if (extra.length) viaPartial[name] = extra;
      walk(p, psrc, depth + 1);
    }
  };
  walk(file, src, 1);

  return {
    ...direct,
    viaPartial,
    inner: /\.Inner(Deindent)?\b/.test(src),
    paramsLength: /len\s+\.Params\b/.test(src),
  };
}

/* ── header ───────────────────────────────────────────────────────────────── */

export type Header = {
  text: string;
  lines: number;
  /** Whether the block names a `Parameters:` section, in any form. */
  hasParametersSection: boolean;
  /** Whether it opens `Shortcode: <name>`, the shape table.html/card.html use. */
  hasShortcodeLine: boolean;
  hasExample: boolean;
};

/** The comment block a file OPENS with, or null. A comment further down the
    file is an implementation note, not the header contract, so the match is
    anchored at the start. */
export function leadingComment(src: string): string | null {
  const m = src.match(/^\s*\{\{-?\s*\/\*([\s\S]*?)\*\/\s*-?\}\}/);
  return m ? m[1] : null;
}

export function parseHeader(src: string): Header | null {
  const text = leadingComment(src);
  if (text === null) return null;
  return {
    text,
    lines: text.trim().split("\n").length,
    hasParametersSection: /^\s*Parameters:/m.test(text),
    hasShortcodeLine: /^\s*Shortcode:\s*\S/m.test(text),
    hasExample: /^\s*(Example|Usage)s?[:(]/m.test(text),
  };
}

/** Is `name` mentioned anywhere in the header?
 *
 * Deliberately loose. Report mode has to work against four different header
 * conventions at once, and a false "documented" here is cheap (a human reads
 * the file) while a false "undocumented" would inflate the backfill estimate
 * this pass exists to produce. The word boundary is hand-rolled because
 * parameter names contain `-` (`srcDark`, `no-search`), which \b splits. */
export function mentions(header: string, name: string): boolean {
  const esc = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(^|[^A-Za-z0-9_-])${esc}([^A-Za-z0-9_-]|$)`).test(header);
}

/**
 * Does the header account for every positional argument the template reads?
 *
 * A positional arg has no name to grep for, so this cannot reuse `mentions`.
 * Two shapes count, because both exist in the tree:
 *
 *   structured — a `Parameters:` row whose name cell is the integer:
 *                  `- 0 | path | yes | — | Path to a file under assets/.`
 *                This is what MAINTAINING.md requires, and it is checkable per
 *                index rather than in aggregate.
 *   prose      — the header merely says the words "positional" or "argument"
 *                somewhere. Weak, but it is what the pre-backfill headers did,
 *                and this scanner has to keep reporting honestly on a header
 *                that has not been converted yet.
 *
 * The prose fallback deliberately does NOT satisfy the structured check for a
 * converted file: an earlier version of this function tested only for the word
 * "positional", which quietly went from a useful signal to a no-op the moment
 * the structured format landed, because a structured row does not contain the
 * word. It reported `gloss` and `reuse` as undocumented while both documented
 * every index correctly.
 */
function documentsPositional(header: string, positions: number[]): boolean {
  const rows = header
    .split("\n")
    .map((l) => l.trim())
    .filter((l) => l.startsWith("- "))
    .map((l) => l.slice(2).split("|")[0].trim());
  if (positions.every((p) => rows.includes(String(p)))) return true;
  return /positional|\bargument\b|\barg\b/i.test(header);
}

/* ── config params ────────────────────────────────────────────────────────── */

const SKIP_DIRS = new Set([".git", "node_modules", "resources", "public"]);

function walkFiles(base: string, exts: string[]): string[] {
  const out: string[] = [];
  if (!fs.existsSync(base)) return out;
  const rec = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) rec(path.join(d, e.name));
      } else if (exts.some((x) => e.name.endsWith(x))) out.push(path.join(d, e.name));
    }
  };
  rec(base);
  return out;
}

/** Every `themeExtras.<key>` read under layouts/ and assets/, with the files
    that read it, cross-referenced against whether USAGE.md names it. */
export function scanConfigParams() {
  const files = [
    ...walkFiles(path.join(ROOT, "layouts"), [".html", ".md", ".txt"]),
    ...walkFiles(path.join(ROOT, "assets"), [".css", ".js", ".ts"]),
  ];
  const hits = new Map<string, Set<string>>();
  for (const f of files) {
    const src = fs.readFileSync(f, "utf8");
    for (const m of src.matchAll(/themeExtras\.([A-Za-z0-9_]+)/g)) {
      const k = m[1];
      if (!hits.has(k)) hits.set(k, new Set());
      hits.get(k)!.add(path.relative(ROOT, f));
    }
  }
  const usagePath = path.join(ROOT, "USAGE.md");
  const usage = fs.existsSync(usagePath) ? fs.readFileSync(usagePath, "utf8") : "";
  return [...hits.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, set]) => ({
      key,
      readIn: [...set].sort(),
      documentedInUsage: mentions(usage, key),
    }));
}

/* ── scan ─────────────────────────────────────────────────────────────────── */

export type ShortcodeReport = {
  name: string;
  file: string;
  fileLines: number;
  header: Header | null;
  reads: Reads;
  /** Read by the template, never mentioned in the header. The number that matters. */
  undocumented: string[];
  /** True when the template reads positional args and the header never says so. */
  positionalUndocumented: boolean;
  /** Read only through a delegated partial and not mentioned. Softer signal. */
  undocumentedViaPartial: string[];
};

export function scan() {
  const dir = path.join(ROOT, SHORTCODES);
  const shortcodes: ShortcodeReport[] = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => {
      const file = path.join(dir, f);
      const src = fs.readFileSync(file, "utf8");
      const header = parseHeader(src);
      const reads = collectReads(file);
      const h = header?.text ?? "";
      const flat = Object.values(reads.viaPartial).flat();
      return {
        name: f.replace(/\.html$/, ""),
        file: `${SHORTCODES}/${f}`,
        fileLines: src.split("\n").length,
        header,
        reads,
        undocumented: reads.named.filter((n) => !mentions(h, n)),
        positionalUndocumented:
          reads.positional.length > 0 && !documentsPositional(h, reads.positional),
        undocumentedViaPartial: [...new Set(flat)].filter((n) => !mentions(h, n)).sort(),
      };
    });
  return { shortcodes, configParams: scanConfigParams() };
}

/* ── report ───────────────────────────────────────────────────────────────── */

const pad = (s: string, n: number) => s + " ".repeat(Math.max(0, n - s.length));

export function formatReport(r: ReturnType<typeof scan>): string {
  const out: string[] = [];
  const sc = r.shortcodes;

  const noHeader = sc.filter((s) => !s.header);
  const stub = sc.filter((s) => s.header && s.header.lines <= 5);
  const noParamsSection = sc.filter(
    (s) => s.header && !s.header.hasParametersSection && s.reads.named.length > 0,
  );
  const withGaps = sc.filter((s) => s.undocumented.length > 0);
  const delegated = sc.filter((s) => s.undocumentedViaPartial.length > 0);
  const posGaps = sc.filter((s) => s.positionalUndocumented);

  out.push("scan-docs — shortcode header inventory (report mode, no assertions)");
  out.push("=".repeat(74));
  out.push("");
  out.push(`  shortcodes                        : ${sc.length}`);
  out.push(`  no header comment at all          : ${noHeader.length}`);
  out.push(`  header of 5 lines or fewer        : ${stub.length}`);
  out.push(`  reads params, no Parameters: block: ${noParamsSection.length}`);
  out.push(`  UNDOCUMENTED params (direct read) : ${withGaps.length} shortcodes, ` +
    `${withGaps.reduce((n, s) => n + s.undocumented.length, 0)} params`);
  out.push(`  undocumented via a partial        : ${delegated.length} shortcodes`);
  out.push(`  positional args, header silent    : ${posGaps.length} ` +
    `(${posGaps.map((s) => s.name).join(", ") || "none"})`);
  out.push("");
  out.push("A param counts as documented if its NAME appears anywhere in the header");
  out.push("comment. That is deliberately generous, so these counts are a floor.");

  out.push("");
  out.push("─".repeat(74));
  out.push("Per shortcode");
  out.push("─".repeat(74));
  out.push(
    `  ${pad("name", 20)}${pad("hdr", 6)}${pad("P:", 4)}${pad("read", 6)}${pad("undoc", 7)}notes`,
  );
  for (const s of sc) {
    const hdr = s.header ? String(s.header.lines) : "—";
    const notes: string[] = [];
    if (!s.header) notes.push("NO HEADER");
    else if (s.header.lines <= 5) notes.push("stub header");
    if (s.reads.positional.length)
      notes.push(`positional ${s.reads.positional.join(",")}`);
    if (s.reads.dynamic) notes.push(`${s.reads.dynamic} computed key(s)`);
    if (s.reads.inner) notes.push("takes a body");
    if (Object.keys(s.reads.viaPartial).length)
      notes.push(`delegates to ${Object.keys(s.reads.viaPartial).join(", ")}`);
    out.push(
      `  ${pad(s.name, 20)}${pad(hdr, 6)}${pad(s.header?.hasParametersSection ? "y" : "-", 4)}` +
        `${pad(String(s.reads.named.length), 6)}${pad(String(s.undocumented.length), 7)}` +
        notes.join("; "),
    );
  }

  if (withGaps.length) {
    out.push("");
    out.push("─".repeat(74));
    out.push("Params read but not named in the header");
    out.push("─".repeat(74));
    for (const s of withGaps) {
      out.push(`  ${s.name}`);
      out.push(`     ${s.undocumented.join(", ")}`);
    }
  }

  if (delegated.length) {
    out.push("");
    out.push("─".repeat(74));
    out.push("Params reached only through a delegated partial");
    out.push("─".repeat(74));
    out.push("  The shortcode reads nothing itself, so a presence-only check would");
    out.push("  pass. A shared partial also serves other callers, so trim by hand.");
    for (const s of delegated) {
      out.push(`  ${s.name}  (via ${Object.keys(s.reads.viaPartial).join(", ")})`);
      out.push(`     ${s.undocumentedViaPartial.join(", ")}`);
    }
  }

  out.push("");
  out.push("─".repeat(74));
  out.push("themeExtras config params");
  out.push("─".repeat(74));
  for (const p of r.configParams) {
    out.push(
      `  ${pad(p.key, 26)}${p.documentedInUsage ? "in USAGE" : "UNDOCUMENTED"}` +
        `   ${p.readIn.join(", ")}`,
    );
  }

  return out.join("\n");
}
