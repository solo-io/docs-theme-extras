// Fidelity checks for the page-to-markdown pipeline (the `markdown` output
// format and the "Copy as Markdown" button, which share page-to-markdown.html /
// copy-markdown.html). transform.HTMLToMarkdown silently degrades certain
// constructs; this scanner catches the degradations by cross-referencing each
// page's rendered HTML against its emitted markdown:
//
//   - mangled-table     HTML has a data table but the markdown has no GFM table
//                       (transform.HTMLToMarkdown flattens some tables — e.g.
//                       github-table output — to pipe-less concatenated cells).
//   - mermaid-fence-lost HTML has a mermaid diagram but the markdown dropped the
//                       ```mermaid fence (so it won't render when re-used).
//   - card-collapsed    HTML has a card description but the markdown dropped it
//                       (cards must NOT be collapsed to bare title text).
//   - lntable-mangled   HTML has a Chroma linenos=table code block and the
//                       markdown emitted its line-number gutter as a real GFM
//                       table cell — i.e. copy-markdown.html's lntable strip did
//                       not match, so the whole code block became a two-column
//                       table row instead of a fence.
//
// Signal-first, like markdown-leaks: each check only fires when the HTML proves
// the construct existed, so a positive is almost always a real degradation.

export type CopyMdDefectKind =
  | "mangled-table"
  | "mermaid-fence-lost"
  | "card-collapsed"
  | "lntable-mangled";

export type CopyMdDefect = {
  kind: CopyMdDefectKind;
  detail: string;
};

const norm = (s: string): string =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ── HTML probes (did the construct exist on the page?) ──────────────────

/**
 * Drop `<!-- … -->` regions before probing.
 *
 * Content inside an HTML comment is IN the served file but is never rendered,
 * so a probe that counts it reports a construct the reader cannot see.
 *
 * This is not hypothetical. `copy-md-fidelity` reported six `mangled-table`
 * defects on `gateway/{1.17.x..1.22.x}/security/extauth/oauth/keycloak` —
 * "page renders a data table but its markdown has no GFM table row". It does
 * not. `assets/gateway-docs/pages/security/oauth-keycloak.md` ends with a
 * 29-line draft section wrapped in `<!--If we add authorization code … -->`,
 * and Hugo still expands the `{{< reuse >}}` inside it, so a fully-rendered
 * `<table>` lands in the output **inside the comment** (measured: comment spans
 * bytes 240061–253253, the table sits at 249032). The markdown correctly omits
 * it, the reader correctly never sees it, and the scanner called that a defect.
 *
 * Chasing this produced two wrong diagnoses first — "the table is ejected 22KB
 * downstream past two sections", then "blank lines are breaking the comment"
 * (tested: removing them changes nothing). Both were artefacts of measuring the
 * raw byte stream instead of the rendered document.
 */
export function stripHtmlComments(html: string): string {
  return html.replace(/<!--[\s\S]*?-->/g, "");
}

// A real data table: <table> containing a <th>. Excludes Chroma's code
// line-number table (class="lntable"), which is not content, and anything
// inside an HTML comment, which the reader never sees.
export function htmlHasDataTable(html: string): boolean {
  const tables = stripHtmlComments(html).match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  return tables.some(
    (t) => !/class="[^"]*\blntable\b/.test(t) && /<th\b/i.test(t),
  );
}

// Hextra renders ```mermaid as <pre class="mermaid"> / <div class="mermaid">.
export function htmlHasMermaid(html: string): boolean {
  return /<(?:pre|div)\b[^>]*\bclass="[^"]*\bmermaid\b/i.test(
    stripHtmlComments(html),
  );
}

// Card descriptions live in `.section-card-desc`. Return their text so we can
// assert each survived into the markdown.
export function cardDescriptions(html: string): string[] {
  const out: string[] = [];
  const re = /class="[^"]*\bsection-card-desc\b[^"]*"[^>]*>([\s\S]*?)<\//gi;
  const src = stripHtmlComments(html);
  let m: RegExpExecArray | null;
  while ((m = re.exec(src)) !== null) {
    const text = norm(m[1]);
    if (text) out.push(text);
  }
  return out;
}

// ── Markdown probes (did the construct survive the conversion?) ─────────

// A GFM table requires a delimiter row: a line of dashes between pipes,
// e.g. `| --- | --- |` (alignment colons allowed).
export function mdHasGfmTable(md: string): boolean {
  return /^\s*\|?[\s:|-]*-{3,}[\s:|-]*\|/m.test(md);
}

export function mdHasMermaidFence(md: string): boolean {
  return /(^|\n)\s*```mermaid\b/.test(md);
}

export function mdContains(md: string, text: string): boolean {
  return norm(md).includes(norm(text));
}

// Chroma renders `linenos=table` (and `linenos=true`, which is the same thing)
// as a two-cell <table class="lntable">: the line-number gutter in cell one,
// the code in cell two. copy-markdown.html strips that table down to the code
// <pre> BEFORE the generic html-table-to-gfm pass, because otherwise the gutter
// becomes a real markdown table cell and the code block stops being a code
// block. The wreckage is unmistakable — a table row whose first cell is a code
// span holding nothing but digits:
//
//   | ``` 1 2 3 4 5 ``` | ```json { "id": "chatcmpl-…" … ``` |
//   | --- | --- |
//
// Requiring the first cell to be digits-only keeps this from firing on a
// legitimate data table that happens to have code spans in it.
const LNTABLE_GUTTER_ROW = /^[ \t]*\|[ \t]*```[\s\d]+```[ \t]*\|/gm;

export function htmlHasLnTable(html: string): boolean {
  return /<table\b[^>]*class="[^"]*\blntable\b/.test(stripHtmlComments(html));
}

export function mdLnTableGutterRows(md: string): string[] {
  return md.match(LNTABLE_GUTTER_ROW) ?? [];
}

// ── Cross-reference ─────────────────────────────────────────────────────

export function findCopyMdDefects(html: string, md: string): CopyMdDefect[] {
  const defects: CopyMdDefect[] = [];

  if (htmlHasDataTable(html) && !mdHasGfmTable(md)) {
    defects.push({
      kind: "mangled-table",
      detail: "page renders a data table but its markdown has no GFM table row",
    });
  }
  if (htmlHasMermaid(html) && !mdHasMermaidFence(md)) {
    defects.push({
      kind: "mermaid-fence-lost",
      detail: "page renders a mermaid diagram but its markdown has no ```mermaid fence",
    });
  }
  if (htmlHasLnTable(html)) {
    const rows = mdLnTableGutterRows(md);
    if (rows.length) {
      defects.push({
        kind: "lntable-mangled",
        detail:
          `${rows.length} linenos=table code block(s) became a GFM table row ` +
          `instead of a fence, e.g. ${rows[0].trim().slice(0, 80)}`,
      });
    }
  }
  for (const desc of cardDescriptions(html)) {
    if (!mdContains(md, desc)) {
      defects.push({
        kind: "card-collapsed",
        detail: `card description dropped from markdown: "${desc.slice(0, 80)}"`,
      });
    }
  }
  return defects;
}
