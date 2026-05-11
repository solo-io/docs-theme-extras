// Source-side lint: backticks inside double-quoted shortcode args.
//
// Hugo's shortcode lexer treats backticks as an alternate raw-string quote
// style. Embedding a backtick inside a `"..."` arg confuses the parser
// and the entire shortcode invocation gets silently dropped at render
// time — no warning, no error, just a missing card / alert / whatever.
//
// We hit this on the v2/everything fixture (a card with `` description="...
// the `code` icon..." `` disappeared from the rendered output). This
// helper scans markdown source so the pattern can't sneak in unnoticed.
//
// The check is narrow on purpose: only the specific bug pattern (backtick
// inside double-quoted shortcode arg). Backticks as the OUTER quote
// (`` arg=`foo` ``) are valid Hugo syntax and not flagged. Backticks in
// the inner content of a shortcode block (between opening and closing
// tags) are also fine — only attribute strings parsed by the lexer are
// at risk.

export type ShortcodeArgViolation = {
  filePath: string;
  startLine: number;
  shortcode: string; // e.g., "card", "alert"
  arg: string; // the offending raw arg, including outer quotes
  invocation: string; // the full `{{< ... >}}` text (truncated if long)
};

const MAX_INVOCATION = 200;

// Match `{{< NAME ... >}}` and `{{</* NAME ... */>}}` invocations across
// any number of lines. Only the angle-bracket form runs the shortcode
// arg lexer; the `{{% %}}` form is markdownify-pass-through and uses the
// same lexer, so we match both. We DO NOT match Go template `{{ ... }}`.
const SHORTCODE_OPEN = /\{\{[<%]\s*([\w-/]+)([\s\S]*?)\s*[>%]\}\}/g;

// A double-quoted shortcode arg: `key="value"`. Captures key and value.
// The value cannot contain unescaped double quotes (Hugo doesn't allow
// embedded `"` inside a `"..."` arg) so `[^"]*` is correct.
const DOUBLE_QUOTED_ARG = /(\w+)=("[^"]*")/g;

// Positional double-quoted arg with no leading `key=`. Example: the
// `{{< gloss "MCP" >}}` form. Captures just the quoted string. Boundary
// on both sides is "whitespace OR start/end of arg region" — the latter
// matters because Hugo trims the closing `>}}` whitespace before this
// function ever sees the arg region.
const POSITIONAL_DOUBLE_QUOTED = /(?:^|\s)("[^"]*")(?=\s|$)/g;

export function findShortcodeArgViolations(
  source: string,
  filePath: string,
): ShortcodeArgViolation[] {
  const out: ShortcodeArgViolation[] = [];
  for (const m of source.matchAll(SHORTCODE_OPEN)) {
    const shortcode = m[1];
    const argRegion = m[2] ?? "";
    const fullMatch = m[0];
    const startOffset = m.index ?? 0;
    const startLine = lineAt(source, startOffset);

    // Skip closing tags (e.g., `{{< /cards >}}`) — they don't take args.
    if (shortcode.startsWith("/")) continue;

    const offending: string[] = [];

    // Named args: `key="value"`.
    for (const a of argRegion.matchAll(DOUBLE_QUOTED_ARG)) {
      const value = a[2];
      if (value.includes("`")) offending.push(`${a[1]}=${value}`);
    }
    // Positional args: bare `"value"` (no leading `key=`). Reset regex
    // state by re-running on the same string each iteration.
    POSITIONAL_DOUBLE_QUOTED.lastIndex = 0;
    for (const a of argRegion.matchAll(POSITIONAL_DOUBLE_QUOTED)) {
      const value = a[1];
      if (value.includes("`")) {
        // Skip if this was already captured as a named arg (matches
        // overlap). Cheap check: was the matched text preceded by `=`?
        const idx = (a.index ?? 0) + (a[0].length - value.length);
        if (argRegion[idx - 1] === "=") continue;
        offending.push(value);
      }
    }

    for (const arg of offending) {
      out.push({
        filePath,
        startLine,
        shortcode,
        arg,
        invocation:
          fullMatch.length > MAX_INVOCATION
            ? fullMatch.slice(0, MAX_INVOCATION - 3) + "..."
            : fullMatch,
      });
    }
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
