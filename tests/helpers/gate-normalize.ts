// gate-normalize — a line-for-line port of
// `layouts/_partials/utils/gate-normalize-form.html`.
//
// WHY A PORT EXISTS
//
// The Go template puts each gate in the form correct for its position —
// percent at top level, angle when nested — because the correct form inverts
// with nesting (see that file's header). Go's
// RE2 cannot count nesting, so the template splits the content on `{{` and
// walks the resulting chunks against a stack. That walk is a cheaper parse than
// the proper tokenizer in `gate-scan.ts`, and the question this module exists to
// answer is whether the cheap parse is WRONG anywhere in the real corpus.
//
// `tests/gate-normalize.spec.ts` uses it two ways:
//
//   1. against the whole consumer corpus, asserting the chunk walk and
//      `gate-scan.ts`'s tokenizer agree on which gates are at depth 0. A
//      disagreement means the template would pick the wrong form for that gate;
//   2. against fixture cases that the FIXTURE ALSO RENDERS through the real
//      template, so the port cannot silently drift away from the thing it
//      models.
//
// (2) is the part that matters. This is a model of the template, not a second
// source of truth — if you change one, change both, and the fixture cases will
// tell you if you didn't.

export const GATE_NAMES = ["version", "conditional-text"];

/** Names that appear anywhere in CLOSING form. Only these are paired, and only
    a paired shortcode creates a nesting level. */
function closedNames(content: string): Set<string> {
  const out = new Set<string>();
  for (const m of content.matchAll(/\{\{\{*[<%]\s*\/\s*([a-zA-Z][\w\-/]*)/g)) out.add(m[1]);
  return out;
}

// The leading `\{*` matters. Splitting on `{{` picks the FIRST `{{` in a run,
// so a shell expansion written flush against a shortcode — `${{{% version %}}`,
// which occurs in the corpus — leaves the chunk starting `{% version %}}` with
// a stray brace in front of the real delimiter. Without this the tag is
// unrecognized, so it is neither converted nor pushed onto the stack, and every
// depth after it is wrong. The name allows `/` for Hextra's nested shortcodes
// (`filetree/container` and friends), which otherwise all read as one name and
// leave an unpoppable level on the stack.
const HEAD = /^(\{*)([<%])\s*(\/?)\s*([a-zA-Z][\w\-/]*)[^}]*?[%>]\}\}/;
const OPENER = /^(\{*)<\s*(version|conditional-text)(\s[^}]*?)?\s*>\}\}/;
const CLOSER = /^(\{*)<\s*\/\s*(version|conditional-text)\s*>\}\}/;
const OPENER_PCT = /^(\{*)%\s*(version|conditional-text)(\s[^}]*?)?\s*%\}\}/;
const CLOSER_PCT = /^(\{*)%\s*\/\s*(version|conditional-text)\s*%\}\}/;

export type Decision = {
  /** Byte offset of the `{{` that starts this gate opener. */
  offset: number;
  name: string;
  depth: number;
  /** Form as authored: "<" or "%". */
  form: string;
  /** True when this opener's form was rewritten (either direction). */
  converted: boolean;
};

export type NormalizeResult = { content: string; decisions: Decision[] };

// Shortcodes that pull in a whole FILE and return already-RENDERED, flattened
// HTML rather than markdown. `reuse-image` is deliberately excluded: it emits a
// single inline element, so percent form is harmless there, and including it
// measurably broke the fixture's everything/rebased parity.
// A gate whose body holds only their output has no markdown to parse, so percent
// form buys nothing and actively harms: splicing a block-level fragment into a
// list item terminates the list. See the Go template's header for the measured
// evidence, including the control case that reproduces it with no gate at all.
const RENDERING = /\{\{[<%]\s*(?:reuse|rebase)[\s>%]/;

/**
 * Pass 1: chunk indices of depth-0 angle gate openers (and their closers) whose
 * body is nothing but shortcode calls, at least one of which returns rendered
 * HTML. A single pass cannot decide this at the opener, because the answer
 * depends on text not yet read.
 */
function keepAngleIndices(chunks: string[], closed: Set<string>): Set<number> {
  const keep = new Set<number>();
  let depth = 0;
  let openAt = -1;
  let sawMarkdown = false;
  let sawRendered = false;

  for (let i = 1; i < chunks.length; i++) {
    const chunk = chunks[i];
    const head = HEAD.exec(chunk);
    if (!head) {
      if (openAt >= 0 && chunk.trim() !== "") sawMarkdown = true;
      continue;
    }
    const isClose = head[3] === "/";
    const name = head[4];

    if (isClose) {
      if (depth > 0) depth--;
      if (openAt >= 0 && depth === 0 && GATE_NAMES.includes(name)) {
        if (sawRendered && !sawMarkdown) { keep.add(openAt); keep.add(i); }
        openAt = -1;
      }
    } else if (closed.has(name)) {
      if (depth === 0 && head[2] === "<" && GATE_NAMES.includes(name)) {
        openAt = i;
        sawMarkdown = false;
        sawRendered = false;
      }
      depth++;
    }
    if (openAt >= 0 && i !== openAt) {
      // Everything after this chunk's tag is body text.
      if (chunk.replace(/^(\{*)[<%][^}]*?[%>]\}\}/, "").trim() !== "") sawMarkdown = true;
    }
    if (openAt >= 0 && RENDERING.test("{{" + chunk)) sawRendered = true;
  }
  return keep;
}

export function normalizeGateForm(content: string): NormalizeResult {
  const closed = closedNames(content);
  const chunks = content.split("{{");
  const keepAngle = keepAngleIndices(chunks, closed);
  const pieces: string[] = [chunks[0]];
  const stack: { name: string; conv: boolean; back: boolean }[] = [];
  const decisions: Decision[] = [];

  // Offset of the `{{` that introduces the chunk currently being handled.
  let offset = chunks[0].length;

  for (let i = 1; i < chunks.length; i++) {
    let chunk = chunks[i];
    const head = HEAD.exec(chunk);
    if (head) {
      const form = head[2];
      const isClose = head[3] === "/";
      const name = head[4];

      if (isClose) {
        let at = -1;
        for (let j = 0; j < stack.length; j++) if (stack[j].name === name) at = j;
        if (at >= 0) {
          if (stack[at].conv) chunk = chunk.replace(CLOSER, (_m, b, g1) => `${b}% /${g1} %}}`);
          if (stack[at].back) chunk = chunk.replace(CLOSER_PCT, (_m, b, g1) => `${b}< /${g1} >}}`);
          stack.length = at;
        }
      } else if (closed.has(name)) {
        let conv = false;
        let back = false;
        if (form === "<" && stack.length === 0 && GATE_NAMES.includes(name) && !keepAngle.has(i)) {
          conv = true;
          chunk = chunk.replace(OPENER, (_m, b, g1, g2) => `${b}% ${g1}${g2 ?? ""} %}}`);
        } else if (form === "%" && stack.length > 0 && GATE_NAMES.includes(name)) {
          back = true;
          chunk = chunk.replace(OPENER_PCT, (_m, b, g1, g2) => `${b}< ${g1}${g2 ?? ""} >}}`);
        }
        if (GATE_NAMES.includes(name)) {
          // Point at the real `{{`, skipping any stray braces the split kept.
          decisions.push({
            offset: offset + head[1].length,
            name, depth: stack.length, form, converted: conv || back,
          });
        }
        stack.push({ name, conv, back });
      }
    }
    pieces.push("{{", chunk);
    offset += 2 + chunks[i].length;
  }

  return { content: pieces.join(""), decisions };
}
