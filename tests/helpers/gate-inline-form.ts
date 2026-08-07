// Source lint: a gate must never sit INSIDE an inline construct.
//
// THE RULE. `{{% version %}}` / `{{% conditional-text %}}` may wrap a whole
// emphasis span, but must not open or close within one:
//
//   OK      {{% version include-if="v2" %}}**text**{{% /version %}}
//   BROKEN  **{{% version include-if="v2" %}}text{{% /version %}}**
//
// WHY IT MATTERS. When the broken form's gate EXCLUDES, the emitted body is
// empty and the two delimiter runs end up adjacent: `****`. CommonMark does not
// treat that as empty-strong — it renders **four literal asterisks**, visible to
// the reader. Measured on the fixture before this lint existed, on both the
// reuse and rebase pipelines:
//
//   v1 (gate excludes) -> "The setting **** is v2-only"
//
// Raw-emit (the v0.2.0 gate refactor) does NOT fix this, because the problem is
// not how `.Inner` is emitted — it is that the delimiters were never inside the
// gate to begin with. This has to be caught at the source, which is what this
// lint does.
//
// `markdown-leaks` was blind to it too: its RAW_BOLD pattern is
// `/\*\*[^\s*][^*\n]{0,60}\*\*/`, which requires at least one character between
// the delimiters, so the collapsed-to-empty form slipped through. The
// `empty_emphasis` pattern added alongside this lint catches the rendered
// symptom; this lint catches the cause.

export type InlineFormViolation = {
  file: string;
  line: number;
  column: number;
  tag: string;
  delimiter: string;
  text: string;
};

const GATE = /\{\{[<%]-?\s*\/?\s*(version|conditional-text)\b/g;

/** Blank out fenced code blocks, keeping line numbering intact. */
function blankFences(src: string): string[] {
  const lines = src.split("\n");
  let fence: string | null = null;
  return lines.map((l) => {
    const open = l.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      if (open && open[1][0] === fence[0] && open[1].length >= fence.length) fence = null;
      return "";
    }
    if (open) {
      fence = open[1];
      return "";
    }
    return l;
  });
}

/** Blank out inline code spans so backticked examples don't self-flag. */
function blankCodeSpans(line: string): string {
  return line.replace(/(`+)(?:(?!\1).)*\1/g, (m) => " ".repeat(m.length));
}

/**
 * Report every gate tag that opens or closes while an emphasis run is open.
 *
 * Only `**` and `__` (strong) are checked. Single `*` / `_` are deliberately
 * excluded: they collide constantly with real prose (`a_b_c`, math, file globs)
 * and the empty-single-emphasis case renders as `**`, which the existing
 * RAW_BOLD leak pattern already catches.
 */
export function findInlineFormViolations(
  src: string,
  file: string,
): InlineFormViolation[] {
  const out: InlineFormViolation[] = [];
  blankFences(src).forEach((raw, i) => {
    if (!raw.includes("{{")) return;
    const line = blankCodeSpans(raw);

    // Positions where a `**` or `__` run toggles open/closed.
    const toggles: { pos: number; delim: string }[] = [];
    for (const m of line.matchAll(/\*\*|__/g)) {
      toggles.push({ pos: m.index!, delim: m[0] });
    }
    if (toggles.length < 2) return;

    // Pair them up in order; odd-indexed toggles close the run opened before.
    const openRanges: { start: number; end: number; delim: string }[] = [];
    const pending: Record<string, number | null> = { "**": null, __: null };
    for (const t of toggles) {
      if (pending[t.delim] === null) pending[t.delim] = t.pos;
      else {
        openRanges.push({ start: pending[t.delim]!, end: t.pos, delim: t.delim });
        pending[t.delim] = null;
      }
    }
    if (!openRanges.length) return;

    GATE.lastIndex = 0;
    for (const g of line.matchAll(GATE)) {
      const at = g.index!;
      const hit = openRanges.find((r) => at > r.start && at < r.end);
      if (hit) {
        out.push({
          file,
          line: i + 1,
          column: at + 1,
          tag: g[0],
          delimiter: hit.delim,
          text: raw.trim().slice(0, 120),
        });
      }
    }
  });
  return out;
}
