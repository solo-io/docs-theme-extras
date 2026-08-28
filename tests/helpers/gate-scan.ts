// gate-scan — find every `version` / `conditional-text` opener in a markdown
// corpus and classify how dangerous its body is.
//
// WHY THIS EXISTS
//
// Hugo does not expose whether a shortcode was called as `{{% %}}` or `{{< >}}`.
// The gate shortcodes therefore GUESS the form from the shape of `.Inner`, and
// every leak in solo-io/docs#3280 is either a misfired guess or a double render.
// The fix is to normalize the form so `.Inner` is always raw markdown — but that
// normalization is only safe where it does not change what `.Inner` contains.
//
// The one place it does change things is NESTING. Verified against hugo v0.160.1:
//
//   position                     percent form        angle form
//   top level (.Parent nil)      raw markdown        raw markdown
//   nested (.Parent set)         PRE-RENDERED HTML   raw markdown
//
// So at depth >= 1, angle -> percent converts a raw-markdown body into a
// pre-rendered-HTML body. Single-line bodies survive (Hugo's own
// innerCleanupRegexp strips the wrapping <p>); MULTI-LINE bodies do not, and the
// failure is specific to the body's shape — a table fragment becomes
// <p>| a | b |</p>, a bullet becomes a self-contained <ul> that will not merge
// into the parent list, a bare marker becomes <ol start="3"><li></li></ol>, and a
// heading is rendered before the outer pass sees it, so it VANISHES FROM THE TOC.
//
// The go/no-go number is therefore: angle-form gates at depth >= 1 with a
// hazardous multi-line body. Those are the sites a blanket normalization would
// NEWLY break. Percent-form gates in the same position are already in that state
// today, so they are a pre-existing bug list rather than a risk.
//
// Ported from the Phase-4 scratchpad `nestscan.py` so Phase 5's nesting lint can
// import it instead of shelling out to Python.

import fs from "node:fs";
import path from "node:path";

export const GATES = ["version", "conditional-text"];

const SKIP_DIRS = new Set([
  ".git",
  "node_modules",
  "public",
  "public-oss",
  "public-enterprise",
  "resources",
  "_vendor",
  ".oss-clones",
  "worktree-checkouts",
]);

// A shortcode tag in either form. The `[^}]|\}(?!\})` body lets a single `}`
// appear inside args (e.g. a CSS-ish value) without ending the match early.
// The `\{*` after the delimiter absorbs a shell expansion written flush against
// the tag — `${{{% version %}}` occurs in the corpus — which would otherwise
// leave the tag unrecognized. The `\s*` AFTER the slash matters too: the corpus
// contains `{{%/ version %}}`, which Hugo accepts as a closer (verified on a
// fixture page against hugo v0.160.1); without it the closer is invisible and
// every gate after it in the file reports as nested. And the name allows `/`
// because Hextra ships nested shortcodes (`filetree/container`,
// `filetree/folder`, `filetree/file`); without it all three read as one name
// `filetree`, the self-closing `file` pushes a level that nothing pops, and
// every gate after the tree reports as nested.
const TAG =
  /\{\{\{*([<%])\s*(\/?)\s*([a-zA-Z][\w\-/]*)((?:[^}]|\}(?!\}))*?)\s*([%>])\}\}/gs;
// The escaped DISPLAY form `{{</* version */>}}`, used on pages that document
// the shortcodes. Not a real invocation, so it must not be counted.
const ESCAPED = /\{\{[<%]\/\*.*?\*\/[%>]\}\}/gs;

/** Blank a region to spaces, preserving newlines so offsets and line numbers hold. */
function blank(src: string, start: number, end: number): string {
  const seg = src.slice(start, end).replace(/[^\n]/g, " ");
  return src.slice(0, start) + seg + src.slice(end);
}

export type Gate = {
  file: string;
  line: number;
  /** Which gate shortcode this is — one of GATES. Needed by callers that treat
   *  the two differently: `version` gates carry versions, `conditional-text`
   *  gates carry products and sections, and a lint about one axis pair has no
   *  business reading the other's tokens. */
  name: string;
  /** "<" or "%" — the invocation form actually used in source. */
  form: string;
  /** Hugo nesting level. 0 means `.Parent` is nil. */
  depth: number;
  /** Slash-joined names of the enclosing paired shortcodes. */
  parents: string;
  multiline: boolean;
  body: string;
  /** Column the opener starts at, used for the indent-hazard test. */
  column: number;
  /** Raw argument text of the opener, e.g. `include-if="a, b"`. Read by
   *  helpers/gate-axis.ts to recover the gate's tokens. */
  args: string;
  /** Byte offset of the opener's first `{`. */
  start: number;
  /** Byte offset just past the closer's last `}`, or past the opener when no
   *  closer was found. Together with `start` this is what lets gate-axis.ts
   *  ask whether two gates are ADJACENT — an either/or pair — rather than
   *  merely present in the same file. */
  end: number;
};

export function scanFile(file: string): Gate[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  return scanSource(raw, file);
}

/** The scan itself, over source text rather than a path, so a caller that
 *  already holds the source (or a unit test that has no file at all) does not
 *  have to round-trip through the filesystem. `file` is only used to label the
 *  returned gates. */
export function scanSource(raw: string, file: string): Gate[] {
  let src = raw;
  for (const m of raw.matchAll(ESCAPED))
    src = blank(src, m.index!, m.index! + m[0].length);

  const tags = [...src.matchAll(TAG)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
    form: m[1],
    isClose: m[2] === "/",
    name: m[3],
    args: (m[4] ?? "").trim(),
  }));
  // Only PAIRED shortcodes create a nesting level. A name that never appears in
  // closing form is self-closing and must not push onto the stack.
  const closed = new Set(tags.filter((t) => t.isClose).map((t) => t.name));

  const out: Gate[] = [];
  const stack: { name: string; form: string }[] = [];
  for (const t of tags) {
    if (t.isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === t.name) {
          stack.length = i;
          break;
        }
      }
      continue;
    }
    if (!closed.has(t.name)) continue;
    if (GATES.includes(t.name)) {
      const closeRe = new RegExp(
        `\\{\\{\\{*[<%]\\s*/\\s*${t.name}\\s*[%>]\\}\\}`,
      );
      const rest = src.slice(t.end);
      const mc = rest.match(closeRe);
      const body = mc ? rest.slice(0, mc.index) : "";
      const before = src.lastIndexOf("\n", t.start - 1);
      out.push({
        file,
        line: src.slice(0, t.start).split("\n").length,
        name: t.name,
        form: t.form,
        depth: stack.length,
        parents: stack.map((s) => s.name).join("/"),
        multiline: body.replace(/^\n+|\n+$/g, "").includes("\n"),
        body,
        column: t.start - before - 1,
        args: t.args,
        start: t.start,
        end: mc ? t.end + mc.index! + mc[0].length : t.end,
      });
    }
    stack.push({ name: t.name, form: t.form });
  }
  return out;
}

/** Body-shape classification. The HAZARD/HEADING prefixes are what the go/no-go
    count keys on, so keep them stable. */
export function classify(g: Gate): string {
  const first = g.body.split("\n").find((l) => l.trim()) ?? "";
  if (!g.multiline) return "single-line (safe: Hugo <p> cleanup)";
  if (/^[ \t]{0,3}\|/.test(first)) return "HAZARD multi-row table fragment";
  if (/^[ \t]{0,3}([*+-][ \t]|[0-9]+\.[ \t])/.test(first))
    return "HAZARD list-item fragment";
  if (/^[ \t]+(```|~~~)/.test(first)) return "HAZARD indented fence";
  if (/^[ \t]{0,3}#{1,6}\s/m.test(g.body))
    return "HEADING (TOC loss at depth>=1)";
  if (/^[ \t]{0,3}([*+-]|[0-9]+\.)[ \t]*$/m.test(g.body.replace(/\s+$/, "")))
    return "HAZARD orphan marker";
  return "multi-line block (ok)";
}

export function isHazardous(g: Gate): boolean {
  return /^(HAZARD|HEADING)/.test(classify(g));
}

/** Sites a blanket angle->percent normalization would NEWLY break. */
export function goNoGo(gates: Gate[]): Gate[] {
  return gates.filter((g) => g.depth >= 1 && g.form === "<" && isHazardous(g));
}

/** Same shape, but already broken today because percent at depth >= 1 already
    pre-renders. These are a pre-existing bug list, not a normalization risk. */
export function alreadyBroken(gates: Gate[]): Gate[] {
  return gates.filter((g) => g.depth >= 1 && g.form === "%" && isHazardous(g));
}

/** Shortcodes that EVALUATE `.Inner` but emit nothing, so a gate inside one can
    never reach a reader and its form cannot matter. Today there is exactly one:
    `downstream`, whose whole body is `{{- $_ := .Inner -}}` — it exists so an
    OSS build can strip enterprise-only prose. Without this exemption the
    ambientmesh.io content scan reports 4 hazards that render nowhere. */
const DISCARDING_PARENTS = ["downstream"];

/**
 * Nested percent-form gates with a hazardous body, in source that NOTHING will
 * normalize before it renders.
 *
 * `utils/gate-normalize-form.html` converts nested percent -> angle for every
 * file pulled in through `reuse` or `rebase`, which is ~85% of all gate usage
 * and all of `assets/`. A page authored directly in `content/` is rendered by
 * Hugo with no such pass, so a nested percent gate there keeps the defect the
 * normalizer exists to remove: Hugo pre-renders the body to HTML, and a
 * pre-rendered list, heading or table fragment cannot re-flow into its
 * surroundings — the bullet becomes a standalone `<ul>`, the heading is rendered
 * before the outer pass and so never reaches the TOC.
 *
 * Single-line nested bodies are excluded by `isHazardous` via `classify`,
 * because Hugo's own innerCleanupRegexp strips the `<p>` it would otherwise add.
 *
 * This replaces a runtime `warnf` that used to live in
 * `layouts/_partials/utils/gate-emit.html`. That check read the RENDERED body
 * and so could not distinguish a pre-rendered list from one the author typed as
 * literal `<ul>` HTML; it scored 60 false positives and 0 true positives on a
 * full istio build. The authored form is only recoverable here, in source.
 */
export function unnormalizedHazards(gates: Gate[]): Gate[] {
  return gates.filter(
    (g) =>
      g.depth >= 1 &&
      g.form === "%" &&
      isHazardous(g) &&
      !g.parents.split("/").some((p) => DISCARDING_PARENTS.includes(p)),
  );
}

/** Indent hazard: a body whose minimum indent is >= opener column + 4.
    Percent form applies CommonMark's "4 spaces = code block" rule to `.Inner`,
    so such a body would be wrapped in <pre><code> before any template sees it.
    The dedent loops in the current templates exist to defend against this; if
    the corpus count is 0, deleting them is provably a no-op. */
export function indentHazards(gates: Gate[]): Gate[] {
  return gates.filter((g) => {
    const lines = g.body.split("\n").filter((l) => l.trim());
    if (!lines.length) return false;
    const min = Math.min(...lines.map((l) => l.match(/^[ \t]*/)![0].length));
    return min >= g.column + 4;
  });
}

export function walkMarkdown(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
      if (e.isDirectory()) {
        if (!SKIP_DIRS.has(e.name)) stack.push(path.join(dir, e.name));
      } else if (e.name.endsWith(".md")) out.push(path.join(dir, e.name));
    }
  }
  return out;
}

export function scanRoots(roots: string[]): Gate[] {
  return roots.flatMap((r) => walkMarkdown(r).flatMap(scanFile));
}
