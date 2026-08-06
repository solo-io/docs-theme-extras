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
  ".git", "node_modules", "public", "public-oss", "public-enterprise",
  "resources", "_vendor", ".oss-clones", "worktree-checkouts",
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
const TAG = /\{\{\{*([<%])\s*(\/?)\s*([a-zA-Z][\w\-/]*)((?:[^}]|\}(?!\}))*?)\s*([%>])\}\}/gs;
// The escaped DISPLAY form `{{</* version */>}}`, used on pages that document
// the shortcodes. Not a real invocation, so it must not be counted.
const ESCAPED = /\{\{[<%]\/\*.*?\*\/[%>]\}\}/gs;

/** Blank a region to spaces, preserving newlines so offsets and line numbers hold. */
function blank(src: string, start: number, end: number): string {
  const seg = src.slice(start, end).replace(/[^\n]/g, " ");
  return src.slice(0, start) + seg + src.slice(end);
}

/** Blank fenced code regions.
 *
 * NOT USED FOR SCANNING — kept only because other helpers import it.
 *
 * `scanFile` used to call this so that gates shown as EXAMPLES inside a code
 * block were not counted. That was wrong twice over:
 *
 *   1. Hugo expands shortcodes BEFORE Goldmark ever sees the markdown, so a
 *      gate inside a fence really does execute. The only form that does not is
 *      the escaped display form (see ESCAPED above), which is handled
 *      separately. Fenced gates are real invocations and belong in the count.
 *   2. The regex requires a closing fence line with nothing after the
 *      backticks, per CommonMark. The corpus is full of lines like
 *      ```` ```{{% /conditional-text %}} ````, which therefore do NOT close the
 *      fence, so the blank ran on to some later fence and swallowed the
 *      shortcode tags in between. That left openers unmatched and reported
 *      gates as nested when they were top-level (and, in one file, top-level
 *      when they were two levels deep inside `tabs`/`tab`).
 *
 * Measured: 41 gates across 18 files got the wrong depth from (2), and 485
 * real gates were dropped entirely by (1).
 */
export function stripFences(src: string): string {
  let out = src;
  const fence = /^[ \t]{0,3}(```|~~~)[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gm;
  for (const m of src.matchAll(fence)) out = blank(out, m.index!, m.index! + m[0].length);
  return out;
}

export type Gate = {
  file: string;
  line: number;
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
};

export function scanFile(file: string): Gate[] {
  let raw: string;
  try {
    raw = fs.readFileSync(file, "utf8");
  } catch {
    return [];
  }
  let src = raw;
  for (const m of raw.matchAll(ESCAPED)) src = blank(src, m.index!, m.index! + m[0].length);

  const tags = [...src.matchAll(TAG)].map((m) => ({
    start: m.index!,
    end: m.index! + m[0].length,
    form: m[1],
    isClose: m[2] === "/",
    name: m[3],
  }));
  // Only PAIRED shortcodes create a nesting level. A name that never appears in
  // closing form is self-closing and must not push onto the stack.
  const closed = new Set(tags.filter((t) => t.isClose).map((t) => t.name));

  const out: Gate[] = [];
  const stack: { name: string; form: string }[] = [];
  for (const t of tags) {
    if (t.isClose) {
      for (let i = stack.length - 1; i >= 0; i--) {
        if (stack[i].name === t.name) { stack.length = i; break; }
      }
      continue;
    }
    if (!closed.has(t.name)) continue;
    if (GATES.includes(t.name)) {
      const closeRe = new RegExp(`\\{\\{\\{*[<%]\\s*/\\s*${t.name}\\s*[%>]\\}\\}`);
      const rest = src.slice(t.end);
      const mc = rest.match(closeRe);
      const body = mc ? rest.slice(0, mc.index) : "";
      const before = src.lastIndexOf("\n", t.start - 1);
      out.push({
        file,
        line: src.slice(0, t.start).split("\n").length,
        form: t.form,
        depth: stack.length,
        parents: stack.map((s) => s.name).join("/"),
        multiline: body.replace(/^\n+|\n+$/g, "").includes("\n"),
        body,
        column: t.start - before - 1,
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
  if (/^[ \t]{0,3}([*+-][ \t]|[0-9]+\.[ \t])/.test(first)) return "HAZARD list-item fragment";
  if (/^[ \t]+(```|~~~)/.test(first)) return "HAZARD indented fence";
  if (/^[ \t]{0,3}#{1,6}\s/m.test(g.body)) return "HEADING (TOC loss at depth>=1)";
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
