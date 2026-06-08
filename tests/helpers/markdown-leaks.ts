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
  | "code-fence"
  | "escaped-html"
  | "raw-bold"
  | "shortcode-placeholder";

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

// Orphan-step-marker leak: `<ol start=N>` containing a single empty `<li>`
// and nothing else. This is the unique signature of a percent-form
// shortcode (typically `{{% version %}}`) whose body ended with a bare
// `N. ` list marker — `RenderString` parsed the trailing `N. ` as an
// empty ordered list starting at N, and Hugo spliced that HTML back into
// the parent stream, severing the surrounding list. The orphaned text
// that followed the closing `</ol>` then renders outside any `<li>` and
// the badge for "N" sits over the start of that text (the canonical
// ambient-multi-link.md step 3→4 leak).
//
// Restricted to `<ol start=...>` with a single empty `<li>` because
// generic empty `<li>` shapes have legitimate sources we don't want to
// fail on: a version-gated bullet (`* {{< version >}}content{{< /version >}}`)
// renders empty for non-matching builds; a code-only bullet
// (`* `` `text` ``) appears empty after `<code>` stripping; the copy-as-
// markdown dropdown uses `<li role="separator">`. The `start=...`
// signature catches the actual structural break without those false
// positives. Matches on `\bstart\b` (no `=`) so both unquoted `start=4`
// (passes through the stripper untouched) and quoted `start="4"` (value
// blanked to whitespace by the `="..."` stripper, leaving just the bare
// attribute name) hit the same pattern.
const EMPTY_LI = /<ol\b[^>]*\bstart\b[^>]*>\s*<li\b[^>]*>\s*<\/li>\s*<\/ol>/g;

// Triple-backtick fence that survived into rendered HTML body text.
// All real fences become Chroma `<pre><code>…</code></pre>` blocks,
// which `stripExpectedMarkdown` removes before the scan. Leftover
// `` ``` `` outside code/script/attribute regions means the fence was
// emitted as literal characters — Goldmark treated the surrounding
// region as a raw HTML block (e.g. after a percent-form shortcode whose
// `RenderString` output ends with `</ol>` and no blank line before the
// fence). Captures up to 120 chars after the opener for triage context.
const CODE_FENCE = /```[^`\n]{0,120}/g;

// Escaped block-HTML that survived into rendered body text. When a shortcode
// emits raw HTML (e.g. `reuse-image` → `<div><figure><img>…`) and that output
// is fed back through a markdown render in INLINE display mode, Goldmark
// HTML-escapes the tags instead of passing them through — so the page shows
// literal `&lt;div&gt;&lt;figure&gt;…` text where an image should be. The
// canonical source is a `reuse-image` placed inside a `{{% conditional-text %}}`
// block, whose `RenderString (dict "display" "inline")` escapes the block HTML
// (the kgateway operations/debug "Debug your gateway setup" figure leak).
//
// Restricted to a curated set of structural/embed tag names that the theme's
// own shortcodes emit (div, figure, img, svg, table parts, …) so a positive
// match is almost always a real shortcode-output-escaping bug, not an author
// legitimately writing about an HTML tag in prose. Matches both the opening
// and closing (`&lt;/figure&gt;`) forms. The attributes inside the escaped tag
// use `&quot;` rather than real `"`, so `stripExpectedMarkdown`'s `="..."`
// attribute strip doesn't touch them — the escaped tag stays fully visible to
// this scan. Tags an author would legitimately discuss in prose almost always
// sit inside `<code>` (backtick spans), which the stripper removes first.
// The tag set covers both the theme's emitted structural/embed tags (div,
// figure, img, svg, table parts, …) and the inline/block tags that a nested
// `{{< reuse >}}` renders (code, a, span, p, list tags, headings) — the
// canonical case is a conditional-text block escaping a nested reuse's
// `<code>`/`<a>` to `&lt;code&gt;`/`&lt;a&gt;` (the applyToRoutes / api-key
// cell leak). Each tag name is `\b`-bounded so `&lt;path&gt;` / `&lt;article&gt;`
// don't trip `p` / `a`. An author legitimately writing about a tag in prose
// almost always wraps it in backticks (`<code>`), which the stripper removes.
const ESCAPED_HTML =
  /&lt;\/?(?:div|span|p|ol|ul|li|blockquote|a|code|pre|figure|figcaption|img|svg|table|thead|tbody|tr|td|th|section|aside|details|summary|br|h[1-6])\b[^]{0,80}?&gt;/g;

// Unrendered `**bold**` that survived into visible body text. The canonical
// source is a list step whose content was emitted multi-line by a reuse/
// shortcode (the `<pre>` flatten bypass), breaking the parent list so the
// FOLLOWING step's `**Bold**` lead-in renders as literal text (the
// fault-injection `**Abort**` and insights `**Dashboard**` leaks). First char
// after `**` must be non-space/non-star so prose like "rate ** 2" isn't hit;
// bounded to 60 inner chars to stay on one logical run.
const RAW_BOLD = /\*\*[^\s*][^*\n]{0,60}\*\*/g;

// Hugo's internal shortcode placeholder token. It only ever appears in output
// when a shortcode failed to be replaced (a render/ordering bug), so any
// occurrence in visible HTML is a real leak. Case-insensitive: Hugo has used
// both upper- and lower-case forms across versions.
const SHORTCODE_PLACEHOLDER = /hahahugoshortcode[a-z0-9]*/gi;

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
  scan(SHORTCODE_PLACEHOLDER, "shortcode-placeholder");
  scan(EMPTY_LI, "empty-list-item");
  scan(CODE_FENCE, "code-fence");
  scan(ESCAPED_HTML, "escaped-html");
  scan(RAW_BOLD, "raw-bold");

  return leaks;
}

// Exposed for unit-test fixtures that need to assert the helper strips
// expected regions before running pattern checks.
export const __test = { stripExpectedMarkdown };
