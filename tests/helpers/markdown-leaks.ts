// Pattern-based scanner for markdown syntax that survives into rendered
// HTML — the failure mode where an author wrote markdown that Goldmark
// didn't recognize (e.g. a table row trapped inside a shortcode placeholder
// where the surrounding parser had already closed the table). The scanner
// is signal-first: each pattern is chosen so a positive match is almost
// always a real bug, with a small allowlist escape hatch for the rare
// false positive.
//
// Used by markdown-leaks.spec.ts both as unit-testable functions and as
// the engine of a built-HTML scan across all rendered pages.

export type LeakKind =
  | "markdown-link"
  | "table-pipe"
  | "shortcode-delim"
  | "empty-list-item"
  | "code-fence";

export type Leak = {
  kind: LeakKind;
  match: string; // the offending substring (clamped to 120 chars)
  context: string; // ~60 chars of surrounding text for grep guidance
};

// Strip regions where literal markdown syntax is expected: code blocks,
// inline code, scripts, styles, table cells (where pipes are legitimate
// when used as path separators in shell commands, etc), the
// copy-as-markdown <script> that embeds raw source, and HTML attribute
// values (which can contain bare `|` in role descriptions, `[` `]` in
// aria labels, etc).
//
// Replaces stripped regions with same-length whitespace so leak match
// offsets in the cleaned string still point to roughly the right region
// of the original HTML when the caller wants to compute a line number.
function stripExpectedMarkdown(html: string): string {
  const replaceWithBlanks = (input: string, re: RegExp) =>
    input.replace(re, (m) => " ".repeat(m.length));

  let out = html;
  // HTML comments — authors commonly tuck commented-out markdown
  // (`<!-- - [link](url) -->`) into pages as TODO notes or hidden
  // alternative content. Those aren't rendering bugs and shouldn't fail
  // the scan. Strip BEFORE other rules so embedded `<pre>` / quotes
  // inside a comment can't confuse later matchers.
  out = replaceWithBlanks(out, /<!--[\s\S]*?-->/g);
  // Script tags first (some may embed the raw markdown source).
  out = replaceWithBlanks(out, /<script[\s\S]*?<\/script>/gi);
  out = replaceWithBlanks(out, /<style[\s\S]*?<\/style>/gi);
  // ARIA-role separator list items — the copy-as-markdown dropdown
  // intentionally emits empty `<li role="separator">` between menu
  // groups for visual + ARIA grouping. Strip BEFORE the generic
  // attribute-value strip below, otherwise `role="separator"` becomes
  // `role           ` and the EMPTY_LI scanner can no longer
  // distinguish a real bug-shape empty <li> from an intentional one.
  out = replaceWithBlanks(
    out,
    /<li\b[^>]*\brole=["']?separator["']?[^>]*>[\s\S]*?<\/li>/gi,
  );
  // Code regions. <pre> matters before <code> because <pre><code> nests.
  out = replaceWithBlanks(out, /<pre[\s\S]*?<\/pre>/gi);
  out = replaceWithBlanks(out, /<code[\s\S]*?<\/code>/gi);
  // Kubernetes-API-spec field-description blocks (api-kubespec generator's
  // `<div class=ks-rich-block>…</div>`). The generator pipes raw CRD
  // description strings straight into these blocks without running the
  // markdown parser, so any `[text](url)` or `<br>` the upstream API
  // author wrote shows up verbatim. The same source text *does* render
  // as a real link on the docs-hub `enterprise-api-23x.md` Goldmark
  // path, so the agw-oss api-kubespec display is by design (the
  // "JSON-like content organization" the user signed off on). Treat
  // these blocks as expected literal-markdown territory and skip the
  // scan inside them. Run before the generic `="[^"]*"` attribute
  // strip so the class= attribute is still matchable here. The class
  // attribute may be unquoted (HTML5 minified output emits bare
  // `class=ks-rich-block`) — handle either form.
  out = replaceWithBlanks(
    out,
    /<div\b[^>]*\bclass=(?:"[^"]*\bks-rich-block\b[^"]*"|ks-rich-block\b)[^>]*>[\s\S]*?<\/div>/gi,
  );
  // Don't strip <td>/<th> content: the table-row leak shape we care
  // about (an entire row mangled into a single cell, e.g.
  // `<td>| col | val |</td>`) lives INSIDE a cell. The TABLE_PIPE
  // regex anchors on the `>` of the cell's opening tag, so a cell
  // whose content STARTS with a pipe trips the check, while a cell
  // with a mid-content pipe (e.g. `<td>ls | grep</td>`) does not.
  // HTML attribute values can contain bare `[`, `]`, `|` legitimately
  // (alt text, aria labels, title attrs). Strip everything between `="`
  // and the next `"` — coarse but effective for HTML5 in the wild.
  out = replaceWithBlanks(out, /="[^"]*"/g);
  // SVG <text> content can contain anything; also strip.
  out = replaceWithBlanks(out, /<text[^>]*>[\s\S]*?<\/text>/gi);
  return out;
}

// Markdown link syntax that survived into rendered HTML. `[text](url)`
// outside of code should never appear in well-formed output — if it does,
// the author wrote a link inside a context the parser didn't process as
// markdown (e.g. inside a non-percent shortcode body that Goldmark didn't
// re-parse). The URL part disallows `[`, `]`, and `\` to skip auto-
// generated Kubernetes API spec content where `Quantity` and validation-
// regex strings (`[a-z0-9]([-a-z0-9]*[a-z0-9])`, `[eE](\+|-)`) mimic
// markdown link syntax. The trade-off is missing IPv6 URLs and URLs with
// backslash-escapes — both rare in docs and almost always inside code
// blocks anyway.
const MD_LINK = /\[[^\]\n]{1,200}\]\([^)\n\[\]\\]{1,500}\)/g;

// Table row leakage: a pipe-delimited line that survived OUTSIDE a
// table cell. Anchored to line start or to the close of an HTML tag
// (e.g. immediately after `<p>` or `<li>`), with optional whitespace,
// so we only flag the table-row shape — not arbitrary pipes in prose.
const TABLE_PIPE = /(?:^|\n|>)[ \t]*\|[^|\n]{1,200}\|[^\n]*/g;

// Shortcode delimiters that escaped processing. Mirrors the smoke spec's
// check but reported with location for easier triage.
const SHORTCODE_OPEN = /\{\{\s*[<%]/g;
const SHORTCODE_CLOSE = /[%>]\s*\}\}/g;

// Empty list item — `<li></li>` (or `<li>` with only whitespace) inside
// an ordered/unordered list. Signals structural leak: a shortcode body
// swallowed a list-marker tail like `4. ` with no content, which the
// markdown parser then rendered as `<ol start=4><li></li></ol>`. The
// badge sits over the start of the orphaned text that follows the
// closing `</ol>`, and any indented code fence on the same continuation
// becomes literal backticks. See the ambient-multi-link.md step 3→4
// boundary as the canonical shape. Excludes `role="separator"` items —
// the copy-as-markdown dropdown intentionally renders empty <li> as
// ARIA-flagged visual separators between menu items.
const EMPTY_LI = /<li\b(?![^>]*\brole=["']?separator)[^>]*>\s*<\/li>/g;

// Triple-backtick fence that survived into rendered HTML body text.
// All real fences become Chroma `<pre><code>…</code></pre>` blocks,
// which `stripExpectedMarkdown` removes before the scan. Leftover
// `` ``` `` outside code/script/attribute regions means the fence was
// emitted as literal characters — Goldmark treated the surrounding
// region as a raw HTML block (e.g. after a percent-form shortcode whose
// `RenderString` output ends with `</ol>` and no blank line before the
// fence). Captures up to 120 chars after the opener for triage context.
const CODE_FENCE = /```[^`\n]{0,120}/g;

function clamp(s: string, n: number): string {
  if (s.length <= n) return s;
  return s.slice(0, n - 1) + "…";
}

function contextAround(text: string, idx: number, span: number): string {
  const start = Math.max(0, idx - span);
  const end = Math.min(text.length, idx + span);
  const slice = text.slice(start, end).replace(/\s+/g, " ");
  return clamp(slice, span * 2);
}

export function findMarkdownLeaks(
  html: string,
  opts?: { allowlist?: RegExp[] },
): Leak[] {
  const allowlist = opts?.allowlist ?? [];
  const cleaned = stripExpectedMarkdown(html);
  const leaks: Leak[] = [];

  const pushIf = (kind: LeakKind, m: RegExpExecArray) => {
    const match = m[0];
    if (allowlist.some((re) => re.test(match))) return;
    leaks.push({
      kind,
      match: clamp(match, 120),
      context: contextAround(cleaned, m.index, 60),
    });
  };

  const scan = (re: RegExp, kind: LeakKind) => {
    re.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = re.exec(cleaned)) !== null) {
      pushIf(kind, m);
      if (m.index === re.lastIndex) re.lastIndex++; // safety against zero-width
    }
  };

  scan(MD_LINK, "markdown-link");
  scan(TABLE_PIPE, "table-pipe");
  scan(SHORTCODE_OPEN, "shortcode-delim");
  scan(SHORTCODE_CLOSE, "shortcode-delim");
  scan(EMPTY_LI, "empty-list-item");
  scan(CODE_FENCE, "code-fence");

  return leaks;
}

// Exposed for unit-test fixtures that need to assert the helper strips
// expected regions before running pattern checks.
export const __test = { stripExpectedMarkdown };
