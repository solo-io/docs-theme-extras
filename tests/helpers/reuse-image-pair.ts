// Source-side lint: the legacy image-pair anti-pattern.
//
// A lone `{{< reuse-image src=... >}}` (no `srcDark`) immediately followed by a
// separate `{{< reuse-image-dark srcDark=... >}}` for the same figure. Since
// docs-theme-extras v0.1.20 the lone call renders UNWRAPPED (visible in both
// light and dark mode), so in dark mode it stacks on top of the dark-only
// sibling. See layouts/_shortcodes/reuse-image.html.
//
// The CSS rule `.dark .reuse-image-nodark:has(+ .toggle-light)` hides the light
// half in dark mode, so the pattern renders correctly WITHOUT a content change.
// This lint is therefore opt-in (checks.reuseImagePair defaults false) — a
// "prefer the canonical form" nudge, not a correctness gate. The canonical form
// is a single call carrying both variants:
//   {{< reuse-image src="img/foo.svg" srcDark="img/foo-dark.svg" >}}
//
// Detection is deliberately narrow: only a lone reuse-image whose call is
// separated from a following reuse-image-dark by whitespace ONLY (same line, or
// consecutive lines with blank lines between — the same adjacency that makes
// the two divs sibling elements and stack). Prose between them breaks the DOM
// adjacency and is not the bug, so it is not flagged. A reuse-image that
// already carries `srcDark` (the PAIR form) is never flagged.

export type ReuseImagePairViolation = {
  filePath: string;
  startLine: number;
  invocation: string; // the offending reuse-image call (truncated if long)
};

const MAX_INVOCATION = 200;

// A lone reuse-image call (angle or percent form) whose args do NOT contain
// `srcDark`, immediately followed by whitespace-only then a reuse-image-dark
// call. `reuse-image(?![-\w])` avoids matching reuse-image-dark / -light. The
// args group `(?:(?!\}\})[\s\S])*?` stops at the closing delimiter so it can't
// swallow past the call. `\s*` between the two calls permits only whitespace
// (incl. newlines) — the exact adjacency that stacks the two figures.
const LEGACY_PAIR =
  /\{\{[<%]\s*reuse-image(?![-\w])((?:(?!\}\})[\s\S])*?)[>%]\}\}\s*\{\{[<%]\s*reuse-image-dark(?![-\w])/g;

export function findReuseImagePairViolations(
  source: string,
  filePath: string,
): ReuseImagePairViolation[] {
  const out: ReuseImagePairViolation[] = [];
  for (const m of source.matchAll(LEGACY_PAIR)) {
    const args = m[1] ?? "";
    // A call that already carries srcDark is the canonical PAIR form, not the
    // bug — skip it even if a stray reuse-image-dark happens to follow.
    if (/\bsrcDark\s*=/.test(args)) continue;

    // Report only the leading reuse-image call, not the whole two-call span.
    const call = m[0].replace(/\s*\{\{[<%]\s*reuse-image-dark[\s\S]*$/, "");
    out.push({
      filePath,
      startLine: lineAt(source, m.index ?? 0),
      invocation:
        call.length > MAX_INVOCATION
          ? call.slice(0, MAX_INVOCATION - 3) + "..."
          : call,
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
