import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  findCopyMdDefects,
  htmlHasDataTable,
  stripHtmlComments,
  htmlHasMermaid,
  cardDescriptions,
  mdHasGfmTable,
  mdHasMermaidFence,
  htmlHasLnTable,
  mdLnTableGutterRows,
  glossaryTerms,
  mdInlinesTooltip,
} from "./helpers/copy-md";
import { target } from "./helpers/target";

// Framework-level fidelity check for the page-to-markdown pipeline (the
// `markdown` output format + the "Copy as Markdown" button). Catches the class
// of bug where transform.HTMLToMarkdown silently degrades a construct: tables
// flattened to pipe-less text (github-table schema tables), mermaid diagrams
// stripped of their ```mermaid fence, cards collapsed to bare title text,
// linenos=table code blocks turned into a two-column markdown table, and a
// `gloss` tooltip flattened into the prose it annotates.
//
// Two layers:
//   1. Unit tests on the detector helpers (deterministic synthetic input).
//   2. A scan that pairs each built page's `.md` (markdown output format) with
//      its `.html` and asserts every construct in the HTML survived into the
//      markdown.

// ── Unit tests on the helpers ───────────────────────────────────────────

test.describe("copy-md fidelity helpers", () => {
  test("htmlHasDataTable: true for a <table> with <th>, false for code lntable", () => {
    expect(
      htmlHasDataTable("<table><thead><tr><th>A</th></tr></thead></table>"),
    ).toBe(true);
    expect(
      htmlHasDataTable(`<table class="lntable"><tr><td>1</td></tr></table>`),
    ).toBe(false);
    expect(htmlHasDataTable("<p>no table</p>")).toBe(false);
  });

  // Regression guard for six false-positive `mangled-table` defects on
  // gateway/*/security/extauth/oauth/keycloak. The source ends with a draft
  // section wrapped in `<!--If we add authorization code … -->`; Hugo still
  // expands the {{< reuse >}} inside it, so a fully-rendered <table> lands in
  // the output INSIDE the comment. The reader never sees it and the markdown
  // correctly omits it, so flagging it as a fidelity defect was wrong.
  test("htmlHasDataTable ignores a table inside an HTML comment", () => {
    const real = "<table><thead><tr><th>A</th></tr></thead></table>";
    expect(htmlHasDataTable(`<!--draft\n${real}\n-->`)).toBe(false);
    // ...but a real table elsewhere on the same page still counts.
    expect(htmlHasDataTable(`<!--draft\n${real}\n-->${real}`)).toBe(true);
  });

  test("stripHtmlComments removes comment regions and leaves the rest", () => {
    expect(stripHtmlComments("a<!--x-->b")).toBe("ab");
    expect(stripHtmlComments("a<!--\nmulti\nline\n-->b")).toBe("ab");
    // Two separate comments, not one greedy span swallowing the middle.
    expect(stripHtmlComments("<!--1-->KEEP<!--2-->")).toBe("KEEP");
    expect(stripHtmlComments("no comments here")).toBe("no comments here");
  });

  test("htmlHasMermaid and cardDescriptions also ignore commented-out markup", () => {
    expect(htmlHasMermaid(`<!--<pre class="mermaid">graph</pre>-->`)).toBe(false);
    expect(htmlHasMermaid(`<pre class="mermaid">graph</pre>`)).toBe(true);
    expect(
      cardDescriptions(`<!--<p class="section-card-desc">Hidden.</p>-->`),
    ).toEqual([]);
  });

  test("mdHasGfmTable: true only when a delimiter row is present", () => {
    expect(mdHasGfmTable("| A | B |\n| --- | --- |\n| 1 | 2 |")).toBe(true);
    // The mangled shape: cells concatenated, no pipes, blank line per row.
    expect(mdHasGfmTable("`request.method`stringThe HTTP method\n\n")).toBe(
      false,
    );
  });

  test("mangled-table defect fires when HTML has a table but markdown doesn't", () => {
    const html = "<table><thead><tr><th>Field</th><th>Type</th></tr></thead><tbody><tr><td>x</td><td>string</td></tr></tbody></table>";
    const mangled = "`x`stringThe field\n";
    const ok = "| Field | Type |\n| --- | --- |\n| x | string |";
    expect(findCopyMdDefects(html, mangled).map((d) => d.kind)).toContain(
      "mangled-table",
    );
    expect(findCopyMdDefects(html, ok)).toEqual([]);
  });

  test("mermaid-fence-lost defect fires when fence is dropped", () => {
    const html = `<pre class="mermaid">flowchart LR; A--&gt;B</pre>`;
    expect(htmlHasMermaid(html)).toBe(true);
    expect(mdHasMermaidFence("flowchart LR\n A --> B")).toBe(false);
    expect(
      findCopyMdDefects(html, "flowchart LR\n A --> B").map((d) => d.kind),
    ).toContain("mermaid-fence-lost");
    expect(findCopyMdDefects(html, "```mermaid\nflowchart LR\n```")).toEqual([]);
  });

  test("card-collapsed defect fires when a card description is dropped", () => {
    const html = `<a class="section-card" href="/x/"><span class="section-card-title">Build</span><p class="section-card-desc">Build a Docker image.</p></a>`;
    expect(cardDescriptions(html)).toEqual(["Build a Docker image."]);
    // Collapsed to bare title link — description gone.
    expect(
      findCopyMdDefects(html, "[Build](/x/)").map((d) => d.kind),
    ).toContain("card-collapsed");
    // Description preserved — no defect.
    expect(
      findCopyMdDefects(html, "[Build](/x/)\n\nBuild a Docker image."),
    ).toEqual([]);
  });

  // Regression guard for the linenos=table strip in copy-markdown.html /
  // page-to-markdown.html. Both matched inter-tag whitespace with `\s*`, which
  // is wrong for any code block that reached .Content through
  // utils/flatten-rendered — reuse.html and callout.html pass bypassPre:false,
  // so every newline in the block is the `&#10;` ENTITY, not whitespace. The
  // un-stripped <table> then fell through to the html-table-to-gfm pass and the
  // code block shipped as a two-column markdown table.
  //
  // Live symptom: 12 agentgateway pages exported to the Japanese translation
  // pipeline with their JSON/YAML examples replaced by
  // `| ``` 1 2 3 … ``` | ```json { … ``` |`.
  test("htmlHasLnTable sees the entity-flattened form, not just the plain one", () => {
    const plain = `<table class="lntable"><tr><td class="lntd">\n<pre class="chroma"><code><span class="lnt">1</span></code></pre></td></tr></table>`;
    expect(htmlHasLnTable(plain)).toBe(true);
    expect(htmlHasLnTable(plain.replace(/\n/g, "&#10;"))).toBe(true);
    expect(htmlHasLnTable(`<!--${plain}-->`)).toBe(false);
    expect(htmlHasLnTable("<table><tr><th>A</th></tr></table>")).toBe(false);
  });

  test("mdLnTableGutterRows matches a digits-only first cell and nothing else", () => {
    const bad = '| ``` 1 2 3 ``` | ```json { "a": 1 } ``` |\n| --- | --- |';
    expect(mdLnTableGutterRows(bad)).toHaveLength(1);
    // A real data table whose first cell is a code span is NOT the gutter.
    expect(
      mdLnTableGutterRows("| `--token-env` | Reads the token |"),
    ).toEqual([]);
    // Nor is a fenced block that merely starts a line.
    expect(mdLnTableGutterRows("```json\n{ }\n```")).toEqual([]);
  });

  test("lntable-mangled defect fires only when the gutter survived as a cell", () => {
    const html = `<table class="lntable"><tr><td class="lntd">&#10;<pre tabindex="0" class="chroma"><code><span class="hl"><span class="lnt">1</span></span></code></pre></td> <td class="lntd">&#10;<pre tabindex="0" class="chroma"><code class="language-json">{}</code></pre></td></tr></table>`;
    const mangled = '| ``` 1 2 3 ``` | ```json {} ``` |\n| --- | --- |';
    expect(findCopyMdDefects(html, mangled).map((d) => d.kind)).toContain(
      "lntable-mangled",
    );
    // Stripped correctly — the block is a fence, so no defect.
    expect(findCopyMdDefects(html, "```json\n{}\n```")).toEqual([]);
  });

  // The `gloss` shortcode nests the tooltip INSIDE the term span, so with no
  // strip pass transform.HTMLToMarkdown emits the definition — and a bolded
  // duplicate of the key — in the middle of the sentence the term sits in.
  // Measured on kagent 1.x before the fix: 111 leaks across 14 pages, each
  // reaching readers twice — once in the .md output, once in the embedded
  // copy-as-markdown payload. (llms.txt is NOT on this path: its blurbs come
  // from `.Summary | plainify`, which leaks the same tooltip in a form with no
  // `**` for mdInlinesTooltip to key on. Separate fix.)
  const GLOSS_HTML =
    `<p>the controller and the <span class="glossary-term" tabindex="0" ` +
    `data-glossary-term="Actor">Actor<span class="tooltip-content">` +
    `<strong>Actor</strong><span>The sandboxed unit of compute that runs an ` +
    `AgentInstance's conversation loop.</span></span></span> that runs it.</p>`;

  test("glossaryTerms extracts each term's key and definition", () => {
    expect(glossaryTerms(GLOSS_HTML)).toEqual([
      {
        key: "Actor",
        short:
          "The sandboxed unit of compute that runs an AgentInstance's conversation loop.",
      },
    ]);
    expect(glossaryTerms("<p>no glossary here</p>")).toEqual([]);
    // A term inside a draft comment is never rendered, so it is not a term.
    expect(glossaryTerms(`<!--${GLOSS_HTML}-->`)).toEqual([]);
  });

  test("glossaryTerms reads a term that carries a Learn more link", () => {
    const withLink = GLOSS_HTML.replace(
      "</span></span></span>",
      `</span><a href="https://example.com" class="tooltip-link" ` +
        `target="_blank">Learn more</a></span></span>`,
    );
    expect(glossaryTerms(withLink).map((t) => t.key)).toEqual(["Actor"]);
  });

  test("mdInlinesTooltip keys on the abutting bold, not on the definition", () => {
    // The leak: <strong>KEY</strong> lands flush against the display text.
    expect(mdInlinesTooltip("the controller and the Actor**Actor**The sandboxed", "Actor")).toBe(
      true,
    );
    // Authored bold in prose is separated by a space, and is not a defect. A
    // concept page defining its own terms must not be flagged for it.
    expect(
      mdInlinesTooltip("An **Actor** is the sandboxed unit of compute.", "Actor"),
    ).toBe(false);
    // Nor is the term appearing as plain text.
    expect(mdInlinesTooltip("the controller and the Actor that runs it", "Actor")).toBe(
      false,
    );
    // A key with regex metacharacters is matched literally.
    expect(mdInlinesTooltip("x**C++**y", "C++")).toBe(true);
    // Hugo does not trim `.Inner`, so a call written
    // {{< gloss "Data Plane" >}}proxy layer {{< /gloss >}} puts a space before
    // the bold and none after it. Still a leak.
    expect(
      mdInlinesTooltip("the proxy layer **Data Plane**Proxies that process", "Data Plane"),
    ).toBe(true);
    // But authored prose that ends a bolded term on punctuation is not, or
    // every glossary/definition list on the site would be flagged.
    expect(mdInlinesTooltip("**Actor**: the sandboxed unit of compute.", "Actor")).toBe(
      false,
    );
    expect(mdInlinesTooltip("An **Actor**, once scheduled, runs.", "Actor")).toBe(false);
    // Punctuation flush against the LEADING side is authored markdown too, and
    // is excluded for the same reason. Each of these fired as a false positive
    // while the leading half accepted any non-space character; this scan gates
    // a whole-site build, so each one would have failed a consumer's CI over
    // prose that is entirely correct.
    expect(mdInlinesTooltip("An ***Actor*** is the unit.", "Actor")).toBe(false);
    expect(mdInlinesTooltip("An _**Actor**_ is the unit.", "Actor")).toBe(false);
    expect(mdInlinesTooltip("the sandbox (**Actor**) runs it.", "Actor")).toBe(false);
    expect(mdInlinesTooltip('see "**Actor**" above', "Actor")).toBe(false);
    expect(mdInlinesTooltip("the unit—**Actor**—runs it", "Actor")).toBe(false);
    // Already passing before the leading half excluded punctuation, kept as
    // regression cover for the markdown constructs that open a line.
    expect(mdInlinesTooltip("- **Actor** is the unit", "Actor")).toBe(false);
    expect(mdInlinesTooltip("| **Actor** | the unit |", "Actor")).toBe(false);
    expect(mdInlinesTooltip("## **Actor**", "Actor")).toBe(false);
  });

  test("glossary-tooltip-inlined fires on the leak and not on the fix", () => {
    const leaked =
      "the controller and the Actor**Actor**The sandboxed unit of compute that " +
      "runs an AgentInstance's conversation loop. that runs it.";
    expect(findCopyMdDefects(GLOSS_HTML, leaked).map((d) => d.kind)).toContain(
      "glossary-tooltip-inlined",
    );
    // Stripped correctly — display text alone, tooltip gone.
    expect(
      findCopyMdDefects(GLOSS_HTML, "the controller and the Actor that runs it."),
    ).toEqual([]);
  });

  test("clean page produces no defects", () => {
    const html = "<p>Just prose.</p>";
    expect(findCopyMdDefects(html, "Just prose.")).toEqual([]);
  });
});

// ── Full-build scan ─────────────────────────────────────────────────────

// Pair each markdown-output-format file with its rendered HTML. Hugo emits the
// two layouts differently:
//   - section index: /foo/index.md      ↔ /foo/index.html
//   - leaf page:     /foo/bar.md         ↔ /foo/bar/index.html
// so we try both candidates (base.html, then base/index.html).
function htmlFor(mdPath: string): string | null {
  const base = mdPath.replace(/\.md$/, "");
  for (const cand of [`${base}.html`, path.join(base, "index.html")]) {
    if (fs.existsSync(cand)) return cand;
  }
  return null;
}

// The Copy button's payload, embedded in the page by
// partials/copy-markdown.html — a SEPARATE pipeline from the `markdown` output
// format, kept in sync with it by hand. Same extraction as
// custom-alert.spec.ts and tab-flatten.spec.ts; copy-markdown.html escapes
// only `<`, so that is the only entity to undo. Quote-tolerant like
// tab-flatten.spec.ts, since `hugo --minify` drops attribute quotes.
function copyMdPayload(htmlPath: string): string | null {
  const m = fs
    .readFileSync(htmlPath, "utf8")
    .match(/<script[^>]*class=["']?copy-md-source["']?[^>]*>([\s\S]*?)<\/script>/);
  return m ? m[1].replace(/&lt;/g, "<") : null;
}

function mdHtmlPairs(root: string): { md: string; html: string }[] {
  if (!fs.existsSync(root)) return [];
  const pairs: { md: string; html: string }[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) {
        const html = htmlFor(full);
        if (html) pairs.push({ md: full, html });
      }
    }
  }
  return pairs;
}

test.describe("copy-md fidelity: built markdown vs rendered HTML", () => {
  test("every page's markdown preserves its tables, mermaid, cards, and code blocks", () => {
    const scanRoot = target.builtScanRoot;
    const pairs = mdHtmlPairs(scanRoot);
    test.skip(
      pairs.length === 0,
      `no markdown-output-format files under ${scanRoot} ` +
        `(enable [outputs] page = ["HTML","markdown"] to exercise this check)`,
    );

    type Offender = { file: string; kind: string; detail: string };
    const offenders: Offender[] = [];
    for (const { md, html } of pairs) {
      // Section-landing pages (index.md) render an auto-generated child-card
      // navigation grid from the LIST layout — it isn't part of .Content, so it
      // never reaches the page markdown (neither the .md output nor copy-as-
      // markdown, both of which use .Content). Those nav cards are not content,
      // so skip card-collapsed there; tables/mermaid are still checked. Content
      // cards (a {{< cards >}} authored in a page body) live on leaf pages and
      // are fully checked.
      const isSectionLanding = path.basename(md) === "index.md";
      const defects = findCopyMdDefects(
        fs.readFileSync(html, "utf8"),
        fs.readFileSync(md, "utf8"),
      ).filter((d) => !(isSectionLanding && d.kind === "card-collapsed"));
      for (const d of defects) {
        offenders.push({
          file: path.relative(scanRoot, md),
          kind: d.kind,
          detail: d.detail,
        });
      }
    }

    if (offenders.length > 0) {
      const grouped = new Map<string, Offender[]>();
      for (const o of offenders) {
        const arr = grouped.get(o.kind) ?? [];
        arr.push(o);
        grouped.set(o.kind, arr);
      }
      const lines: string[] = [];
      for (const [kind, group] of grouped) {
        lines.push(`\n${kind} (${group.length}):`);
        for (const o of group.slice(0, 20)) {
          lines.push(`  ${o.file}`);
          lines.push(`    ${o.detail}`);
        }
        if (group.length > 20) lines.push(`  ... and ${group.length - 20} more.`);
      }
      expect(
        offenders,
        `Found ${offenders.length} page-to-markdown fidelity defect(s):${lines.join("\n")}`,
      ).toEqual([]);
    }
  });

  // The scan above reads the `.md` output, so it exercises
  // _partials/page-to-markdown.html alone. Every cleanup pass is duplicated by
  // hand into partials/copy-markdown.html, which feeds the Copy button — so
  // without this, editing one partial and not the other leaves copy-as-markdown
  // broken while the suite stays green.
  //
  // Scoped to glossary-tooltip-inlined rather than re-running every defect
  // kind: the payload legitimately differs from the `.md` output elsewhere (no
  // leading .md intro line, no section child-link list), so a full cross-check
  // of the two pipelines is a larger change than this guard.
  test("the embedded copy-as-markdown payload strips glossary tooltips too", () => {
    const scanRoot = target.builtScanRoot;
    const pairs = mdHtmlPairs(scanRoot);

    type Offender = { file: string; detail: string };
    const offenders: Offender[] = [];
    let pagesWithTerms = 0;

    for (const { md, html } of pairs) {
      const pageHTML = fs.readFileSync(html, "utf8");
      if (glossaryTerms(pageHTML).length === 0) continue;
      const payload = copyMdPayload(html);
      if (payload === null) continue;
      pagesWithTerms++;
      for (const d of findCopyMdDefects(pageHTML, payload)) {
        if (d.kind !== "glossary-tooltip-inlined") continue;
        offenders.push({ file: path.relative(scanRoot, md), detail: d.detail });
      }
    }

    // Consumer-independent: a site that mounts none of the fixture content and
    // calls `gloss` nowhere has nothing to assert on. Skipping beats asserting
    // against an empty set, which would let the guard rot into a no-op.
    test.skip(
      pagesWithTerms === 0,
      `no built page under ${scanRoot} calls the gloss shortcode`,
    );

    const lines = offenders
      .slice(0, 20)
      .flatMap((o) => [`  ${o.file}`, `    ${o.detail}`]);
    if (offenders.length > 20) {
      lines.push(`  ... and ${offenders.length - 20} more.`);
    }
    expect(
      offenders,
      `Found ${offenders.length} glossary tooltip(s) inlined into the ` +
        `copy-as-markdown payload on ${pagesWithTerms} page(s) that use ` +
        `\`gloss\`:\n${lines.join("\n")}`,
    ).toEqual([]);
  });
});
