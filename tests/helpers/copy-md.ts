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
//
// Signal-first, like markdown-leaks: each check only fires when the HTML proves
// the construct existed, so a positive is almost always a real degradation.

export type CopyMdDefectKind =
  | "mangled-table"
  | "mermaid-fence-lost"
  | "card-collapsed";

export type CopyMdDefect = {
  kind: CopyMdDefectKind;
  detail: string;
};

const norm = (s: string): string =>
  s.replace(/<[^>]+>/g, "").replace(/&amp;/g, "&").replace(/\s+/g, " ").trim();

// ── HTML probes (did the construct exist on the page?) ──────────────────

// A real data table: <table> containing a <th>. Excludes Chroma's code
// line-number table (class="lntable"), which is not content.
export function htmlHasDataTable(html: string): boolean {
  const tables = html.match(/<table\b[\s\S]*?<\/table>/gi) ?? [];
  return tables.some(
    (t) => !/class="[^"]*\blntable\b/.test(t) && /<th\b/i.test(t),
  );
}

// Hextra renders ```mermaid as <pre class="mermaid"> / <div class="mermaid">.
export function htmlHasMermaid(html: string): boolean {
  return /<(?:pre|div)\b[^>]*\bclass="[^"]*\bmermaid\b/i.test(html);
}

// Card descriptions live in `.section-card-desc`. Return their text so we can
// assert each survived into the markdown.
export function cardDescriptions(html: string): string[] {
  const out: string[] = [];
  const re = /class="[^"]*\bsection-card-desc\b[^"]*"[^>]*>([\s\S]*?)<\//gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
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
