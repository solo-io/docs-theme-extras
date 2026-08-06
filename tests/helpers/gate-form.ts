// Source-side lint: a `version` / `conditional-text` gate invoked in ANGLE form.
//
//   {{% version include-if="2.1.x" %}}…{{% /version %}}    correct
//   {{< version include-if="2.1.x" >}}…{{< /version >}}    silently broken
//
// WHY THIS IS NOW A HARD RULE
//
// The gate shortcodes emit `.Inner` untouched (see
// layouts/_partials/utils/gate-emit.html). Percent-form output re-enters the
// markdown stream, so the body renders exactly as if the tags were not there.
// Angle-form output is substituted AFTER Goldmark has run, so the same body
// survives as LITERAL TEXT — pipes instead of a table, `* item` instead of a
// bullet, `**bold**` with the asterisks showing.
//
// Content pulled in through `reuse` or `rebase` is normalized automatically
// (search GATE-FORM-NORMALIZATION-v1 in those shortcodes), so this lint scans
// `content/` only. That split is deliberate: assets are rewritten before render
// and cannot be wrong, while a page authored directly in content/ is never
// rewritten and is the only place the mistake can survive.
//
// Modeled on helpers/include-form.ts, which enforces the same delimiter rule
// for Hextra's `include`.

export type GateFormViolation = {
  filePath: string;
  startLine: number;
  invocation: string;
};

const MAX_INVOCATION = 200;
const GATES = "version|conditional-text";

// Opening or closing angle-form tag for either gate.
//
// The name must be followed by whitespace or the closing bracket, which keeps
// `version-cards` out — matching how the reuse/rebase normalization regexes
// exclude it, since Go's RE2 has no lookahead and the two must agree.
const ANGLE_GATE = new RegExp(
  `\\{\\{<\\s*/?(?:${GATES})(?=[\\s>])[\\s\\S]*?>\\}\\}`,
  "g",
);

/** Blank a span, preserving newlines so line numbers stay correct. */
function blank(src: string, start: number, end: number): string {
  return src.slice(0, start) + src.slice(start, end).replace(/[^\n]/g, " ") + src.slice(end);
}

/**
 * Remove regions where an angle-form gate is being SHOWN rather than called:
 * fenced and indented code blocks, inline code spans, and Hugo's escaped
 * display form. Without this, the pages that document these shortcodes flag
 * themselves.
 */
export function stripNonInvocations(source: string): string {
  let out = source;
  for (const re of [
    /^[ \t]{0,3}(```|~~~)[\s\S]*?^[ \t]{0,3}\1[ \t]*$/gm, // fenced
    /`[^`\n]*`/g, // inline code span
    /\{\{[<%]\/\*[\s\S]*?\*\/[%>]\}\}/g, // escaped display form
  ]) {
    for (const m of source.matchAll(re)) out = blank(out, m.index!, m.index! + m[0].length);
  }
  return out;
}

// Shortcodes that pull in a whole file and hand back rendered, flattened HTML.
// Must stay in sync with `RENDERING` in helpers/gate-normalize.ts and with
// `$rendering` in layouts/_partials/utils/gate-normalize-form.html.
const RENDERING = /\{\{[<%]\s*(?:reuse|rebase)[\s>%]/;
const ANY_SHORTCODE = /\{\{[<%][\s\S]*?[%>]\}\}/g;

/**
 * Is this angle-form OPENER one that must STAY angle?
 *
 * Percent form exists to get a body's markdown parsed. When the body is nothing
 * but shortcode calls there is no markdown to parse, and if one of those calls
 * is a `reuse` the body holds rendered, flattened HTML — splicing that back into
 * the markdown stream inside a list item terminates the list.
 *
 * `utils/gate-normalize-form.html` leaves exactly this shape alone, so the lint
 * has to as well. If it did not, the two would disagree and every such gate
 * would be a permanent, unfixable red line: converting it to percent is what
 * breaks it.
 */
function mustStayAngle(source: string, openerEnd: number, name: string): boolean {
  const closer = new RegExp(`\\{\\{[<%]\\s*/\\s*${name}\\s*[%>]\\}\\}`);
  const rest = source.slice(openerEnd);
  const m = rest.match(closer);
  if (!m) return false;
  const body = rest.slice(0, m.index);
  if (!RENDERING.test(body)) return false;
  return body.replace(ANY_SHORTCODE, "").trim() === "";
}

export function findGateFormViolations(
  source: string,
  filePath: string,
): GateFormViolation[] {
  const scannable = stripNonInvocations(source);
  const out: GateFormViolation[] = [];
  // Openers exempted by mustStayAngle, so their closers are exempted too.
  const exemptNames: string[] = [];
  for (const m of scannable.matchAll(ANGLE_GATE)) {
    // Report the ORIGINAL text, not the blanked copy.
    const invocation = source.slice(m.index!, m.index! + m[0].length);
    const name = /conditional-text/.test(invocation) ? "conditional-text" : "version";
    if (/\{\{<\s*\//.test(invocation)) {
      // Closer: exempt if its opener was.
      const at = exemptNames.lastIndexOf(name);
      if (at >= 0) { exemptNames.splice(at, 1); continue; }
    } else if (mustStayAngle(scannable, m.index! + m[0].length, name)) {
      exemptNames.push(name);
      continue;
    }
    out.push({
      filePath,
      startLine: source.slice(0, m.index!).split("\n").length,
      invocation:
        invocation.length > MAX_INVOCATION
          ? invocation.slice(0, MAX_INVOCATION - 1) + "…"
          : invocation,
    });
  }
  return out;
}
