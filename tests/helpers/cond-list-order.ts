// Source-side lint for the "conditional-text gated bullet is not last in its
// list" antipattern.
//
// `conditional-text` renders its body in INLINE display mode only (unlike
// `version`, which has block / trailing-step handling). When a gated bullet
// sits AHEAD of an always-shown bullet in the same list, the inline render
// breaks the list continuation and the gated bullet's markdown survives as
// literal text (the reference/release-notes.md `[Changelog](url)` leak). The
// fix is always ordering: a `conditional-text` bullet must be the LAST item(s)
// of its list, never followed by a non-gated sibling.
//
// This catches the broken ordering at the SOURCE, before a build — including
// the case the rendered-HTML markdown-leaks scan can miss: a PLAIN-TEXT gated
// bullet (no link / bold / pipe) placed first breaks the list silently, with
// no leak signature for the HTML scanner to find.
//
// Scope decision: only `conditional-text` is treated as a gating shortcode.
// `version` is intentionally excluded — its block/trailing-step emit path makes
// a non-last gated bullet frequently legitimate, so including it would be noisy.
//
// Signal model: a list is a maximal run of list-item lines separated only by
// blank lines and bare conditional-text delimiter lines. Within one list, a
// gated item followed by ANY non-gated item is a violation. A list whose gated
// items are all trailing (or which is entirely gated) is clean.

export type CondListViolation = {
  filePath: string;
  // 1-based line of the gated bullet that has a non-gated sibling after it.
  line: number;
  // 1-based line of the offending following non-gated bullet.
  followingLine: number;
  gatedBullet: string;
  followingBullet: string;
};

// A bullet or ordered-list marker at the start of (optionally indented) content.
const LIST_MARKER = /^(\s*)(?:[*+-]|\d+\.)\s+/;
// A conditional-text opener / closer, percent or angle form.
const COND_OPEN = /\{\{[%<]\s*conditional-text\b/g;
const COND_CLOSE = /\{\{[%<]\s*\/\s*conditional-text\b/g;
// An opener immediately followed (same line) by a list marker — the inline
// prefix form `{{% conditional-text ... %}}* [Changelog]...`.
const OPEN_THEN_MARKER =
  /\{\{[%<]\s*conditional-text\b[^}]*[%>]\}\}\s*(?:[*+-]|\d+\.)\s+/;

type Token =
  | { type: "item"; gated: boolean; line: number; text: string }
  | { type: "blank" }
  | { type: "delim" } // a line that is ONLY conditional-text delimiters
  | { type: "other" };

// Tokenize the source into a stream the grouping pass walks. Fenced code
// blocks are skipped (their lines become `other`, which breaks any list — a
// fence is never part of the inline-bullet shape we guard).
function tokenize(source: string): Token[] {
  const lines = source.split("\n");
  const tokens: Token[] = [];
  let condDepth = 0;
  let inFence = false;
  let fenceMarker = "";

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (inFence) {
      const opener = fenceMarker[0];
      if (
        new RegExp(`^(\\${opener}{${fenceMarker.length},})\\s*$`).test(trimmed)
      ) {
        inFence = false;
        fenceMarker = "";
      }
      tokens.push({ type: "other" });
      continue;
    }
    if (fenceMatch) {
      inFence = true;
      fenceMarker = fenceMatch[1];
      tokens.push({ type: "other" });
      continue;
    }

    if (/^\s*$/.test(line)) {
      tokens.push({ type: "blank" });
      continue;
    }

    const opens = (line.match(COND_OPEN) || []).length;
    const closes = (line.match(COND_CLOSE) || []).length;
    const depthEnteringLine = condDepth;
    condDepth = Math.max(0, condDepth + opens - closes);

    const hasMarker = LIST_MARKER.test(line);
    if (hasMarker) {
      const gated = depthEnteringLine > 0 || OPEN_THEN_MARKER.test(line);
      tokens.push({ type: "item", gated, line: i + 1, text: trimmed });
      continue;
    }

    // A line with no list marker. If, after removing all conditional-text
    // delimiters, nothing but whitespace remains, it's a bare delimiter line
    // that keeps a list flowing (the `{{% /conditional-text %}}` on its own
    // line between bullets). Otherwise it's real content that ends the list.
    const withoutDelims = line
      .replace(COND_OPEN, "")
      .replace(COND_CLOSE, "")
      // also strip the closing `%}}` / `>}}` left behind after the open/close
      // keyword match consumed only up to the shortcode name
      .replace(/[^}]*[%>]\}\}/g, "")
      .trim();
    tokens.push({ type: withoutDelims === "" ? "delim" : "other" });
  }

  return tokens;
}

export function findCondListOrderViolations(
  source: string,
  filePath = "",
): CondListViolation[] {
  const tokens = tokenize(source);
  const violations: CondListViolation[] = [];

  // Group consecutive `item` tokens into lists. Items may be separated only by
  // `blank` and `delim` tokens; an `other` token ends the current list.
  let group: Extract<Token, { type: "item" }>[] = [];
  const flush = () => {
    if (group.length >= 2) {
      // Find the first gated item that has any non-gated item after it.
      for (let i = 0; i < group.length; i++) {
        if (!group[i].gated) continue;
        const after = group.slice(i + 1).find((it) => !it.gated);
        if (after) {
          violations.push({
            filePath,
            line: group[i].line,
            followingLine: after.line,
            gatedBullet: clamp(group[i].text, 100),
            followingBullet: clamp(after.text, 100),
          });
          break; // one report per list is enough to point the author at it
        }
      }
    }
    group = [];
  };

  for (const tok of tokens) {
    if (tok.type === "item") group.push(tok);
    else if (tok.type === "other") flush();
    // `blank` and `delim` keep the current group open.
  }
  flush();

  return violations;
}

function clamp(s: string, n: number): string {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}
