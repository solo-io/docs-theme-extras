// Source-side lint: Hextra's `include` shortcode invoked with the wrong
// delimiter form.
//
// Hextra documents include as percent-form-only:
//
//   {{% include "path/to/page" %}}    ← correct
//   {{< include "path/to/page" >}}    ← silently broken
//
// The reason is delimiter semantics: percent-form output flows back
// through the outer page's markdown pass, so the included page's
// backticks, links, headings, etc. get rendered. Angle-bracket output
// is inserted AFTER markdown parsing, so the included page's markdown
// appears as literal text — backticks stay as backticks, `[text](url)`
// renders as `[text](url)`.
//
// The bug is invisible at write time and only shows up after build,
// often noticed by a human reading the page. This lint flags it at
// scan time so authors get feedback immediately.

export type IncludeFormViolation = {
  filePath: string;
  startLine: number;
  invocation: string;
};

const MAX_INVOCATION = 200;

// Match `{{<` followed by optional whitespace, then `include`, then a
// word boundary (space or quote or `>`). Captures the full invocation
// through the closing `>}}` so the error message can show what was
// flagged.
const ANGLE_INCLUDE = /\{\{<\s*include\b[\s\S]*?>\}\}/g;

export function findIncludeFormViolations(
  source: string,
  filePath: string,
): IncludeFormViolation[] {
  const out: IncludeFormViolation[] = [];
  for (const m of source.matchAll(ANGLE_INCLUDE)) {
    const invocation = m[0];
    out.push({
      filePath,
      startLine: lineAt(source, m.index ?? 0),
      invocation:
        invocation.length > MAX_INVOCATION
          ? invocation.slice(0, MAX_INVOCATION - 3) + "..."
          : invocation,
    });
  }
  return out;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}
