import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Smoke pass over a built product's HTML. Two invocation modes:
//
//   1. SMOKE_PRODUCT env var set → scans <target.builtRoot>/<SMOKE_PRODUCT>/.
//      Used by `make test-smoke PRODUCT=<name>` to spot-check any product
//      that builds alongside the test fixture under target.builtRoot.
//
//   2. SMOKE_PRODUCT not set → scans target.builtRoot directly.
//      For consumer repos whose CONFIG points at a single-product build.
//
// Asserts:
//   - the directory exists
//   - no shortcode delimiter leaks in any sampled HTML
//   - at least one rendered page emits the copy-as-md script tag

const PRODUCT = process.env.SMOKE_PRODUCT;
const SCAN_ROOT = PRODUCT ? path.join(target.builtRoot, PRODUCT) : target.builtRoot;
const LABEL = PRODUCT ?? target.name;
const ENABLED = target.shouldRun("smoke");
// 0 means unlimited — walks every HTML file under SCAN_ROOT.
const MAX_FILES = target.smoke.maxFiles;
const SAMPLE_LABEL = MAX_FILES === 0 ? "all pages" : `sample of ${MAX_FILES}`;

test.describe(`smoke: ${LABEL}`, () => {
  test.skip(!ENABLED, "smoke check disabled in CONFIG");

  test("product directory exists in build output", () => {
    expect(fs.existsSync(SCAN_ROOT), `${SCAN_ROOT} not found`).toBe(true);
  });

  test(`no shortcode delimiter leaks across html pages (${SAMPLE_LABEL})`, () => {
    if (!target.shouldRun("shortcodeLeaks")) {
      test.skip(true, "shortcodeLeaks check disabled in CONFIG");
    }
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    expect(htmlFiles.length, "no html pages found").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const visible = html
        .replace(
          /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
          "",
        )
        .replace(/<pre[\s\S]*?<\/pre>/gi, "")
        .replace(/<code[\s\S]*?<\/code>/gi, "");
      if (/\{\{\s*[%<]/.test(visible) || /[%>]\s*\}\}/.test(visible)) {
        offenders.push(path.relative(SCAN_ROOT, f));
      }
    }
    expect(offenders, `shortcode leaks in ${LABEL}`).toEqual([]);
  });

  test("at least one page emits a copy-as-md script tag", () => {
    if (!target.shouldRun("copyAsMarkdown")) {
      test.skip(true, "copyAsMarkdown check disabled in CONFIG");
    }
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const hasCopyMd = htmlFiles.some((f) => {
      const html = fs.readFileSync(f, "utf8");
      return /<script[^>]*type=["']text\/markdown["']/i.test(html);
    });
    expect(hasCopyMd, `no copy-as-md found in any sampled page`).toBe(true);
  });

  test(`no <p> inside <pre> in any sampled page (${SAMPLE_LABEL})`, () => {
    if (!target.shouldRun("shortcodeLeaks")) {
      test.skip(true, "shortcodeLeaks check disabled in CONFIG");
    }
    // A <p> inside a <pre> is never valid HTML. It is the structural
    // signature of the {{% tab %}} double-markdownify bug: markdownify called
    // on already-rendered HTML causes the CommonMark parser to terminate <pre>
    // at blank lines and inject <p> tags, breaking code blocks and copy buttons.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: string[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const preRe = /<pre[^>]*>([\s\S]*?)<\/pre>/g;
      let m: RegExpExecArray | null;
      while ((m = preRe.exec(html)) !== null) {
        if (/<p[\s>]/.test(m[1])) {
          offenders.push(path.relative(SCAN_ROOT, f));
          break;
        }
      }
    }
    expect(
      offenders,
      `pages where <p> is injected inside <pre> — likely markdownify called on ` +
        `already-rendered HTML from a percent-form shortcode (e.g. {{% tab %}})`,
    ).toEqual([]);
  });

  test(`no <ol start="N"> list-break artifacts (${SAMPLE_LABEL})`, () => {
    // `<ol start="N">` is almost always the signature of a list-continuation
    // break: a shortcode or conref emitted multi-line HTML whose continuation
    // lines landed at column 0, so Goldmark closed the enclosing <ol> early
    // and restarted with `<ol start="N">` to keep the visible numbering. The
    // side effects are loud — tabs hoisted out of their step, subsequent
    // headings rendered as body text, tables missing borders.
    //
    // Legitimate manual starts (`5. step five`) are rare in technical docs
    // and would still show as a single `<ol start="5">` not preceded by a
    // sibling `</ol>`; report all occurrences and let the author either fix
    // the source to a continuous list or allowlist a path if intentional.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: { page: string; starts: string[] }[] = [];
    for (const f of htmlFiles) {
      const rel = path.relative(SCAN_ROOT, f);
      // The fixture's `trailing-step` page intentionally reproduces the
      // upstream version.html bug for the dedicated regression test in
      // version-nested-list.spec.ts. Don't double-count it here.
      if (/(^|\/)trailing-step\//.test(rel)) continue;
      const html = fs.readFileSync(f, "utf8");
      // Strip the Copy-as-Markdown <script> block so we only inspect
      // rendered HTML, not the embedded markdown source.
      const visible = html.replace(
        /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      const matches = visible.match(/<ol\s+start="(\d+)"/g);
      if (matches && matches.length > 0) {
        const starts = matches.map((m) => m.match(/start="(\d+)"/)![1]);
        offenders.push({ page: rel, starts });
      }
    }
    expect(
      offenders.map((o) => `${o.page} [start=${o.starts.join(",")}]`),
      `pages with <ol start="N"> artifacts — almost always a list-continuation ` +
        `break: a shortcode or conref emitted multi-line HTML inside a numbered ` +
        `list item, and Goldmark closed the <ol> early. Symptoms: tabs hoisted ` +
        `out of step, subsequent headings rendered as body text. Fix the source ` +
        `(flatten the shortcode output, or move the multi-block content out of ` +
        `the list item) or, if the start=N is intentional, allowlist the page.`,
    ).toEqual([]);
  });

  test(`no Setext heading leaked from a no-language code block (${SAMPLE_LABEL})`, () => {
    // A no-language fenced code block renders to <div><pre><code>...</code></pre></div>,
    // wrapped by the theme's outer <div class="hextra-code-block">. CommonMark
    // HTML block type 6 (started by the outer <div>) terminates at any blank
    // line — so a blank line INSIDE the inner <pre><code> closes the outer
    // <div> early, and Goldmark reparses the tail of the code body as markdown.
    // Lines like `=== Cluster: cluster2 ===` become Setext H1 headings; copy
    // button HTML attribute text leaks into prose.
    //
    // The signature is a <h1> or <h2> whose body is dominated by Setext-style
    // decoration characters (=, -, *) with at least 3 in a row. Real prose
    // headings never contain "=== === ===" runs.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: { page: string; sample: string }[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const visible = html.replace(
        /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      // <h1>...===...</h1> with the run of `=` not adjacent to a tag (so
      // we don't match a legitimate "=== heading" that an author wrote
      // intentionally — that would not have a CLUSTER-like infix).
      const m = visible.match(/<h[12][^>]*>[^<]*={3,}[^<]*<\/h[12]>/);
      if (m) {
        offenders.push({ page: path.relative(SCAN_ROOT, f), sample: m[0] });
      }
    }
    expect(
      offenders.map((o) => `${o.page}: ${o.sample}`),
      `pages where a no-language code block's body got reparsed as Setext ` +
        `H1/H2 — the outer hextra-code-block <div> terminated early at a ` +
        `blank line inside the code. The render-codeblock template should ` +
        `replace blank lines inside the code output with \\n&#10; so ` +
        `Goldmark sees no terminator.`,
    ).toEqual([]);
  });

  test(`no &#10; entity inside <script> bodies (${SAMPLE_LABEL})`, () => {
    // <script> content is raw — browsers don't decode HTML entities inside
    // script bodies. So an injected `&#10;` ends up as literal text in the
    // JS source, and Hugo's `--minify` pipeline parses the body and rejects
    // it with "unexpected & in expression". The CI preview deploys for
    // gateway and gloo-mesh-gateway failed on this signature when the reuse
    // template first flattened all newlines unconditionally. The fix is to
    // protect <script>/<style> blocks during flatten and restore them with
    // real newlines; this smoke check is the cross-product guard.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: { page: string; sample: string }[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      // Skip the Copy-as-Markdown <script type="text/markdown"> tag — it
      // legitimately embeds the page's raw markdown source which may
      // contain `&#10;` if the source mentions the entity.
      const stripped = html.replace(
        /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      const scriptRe = /<script[^>]*>([\s\S]*?)<\/script>/g;
      let m: RegExpExecArray | null;
      while ((m = scriptRe.exec(stripped)) !== null) {
        if (m[1].includes("&#10;")) {
          const sample = m[1].slice(0, 80).replace(/\s+/g, " ");
          offenders.push({ page: path.relative(SCAN_ROOT, f), sample });
          break;
        }
      }
    }
    expect(
      offenders.map((o) => `${o.page}: ${JSON.stringify(o.sample)}`),
      `pages where a <script> body contains the &#10; HTML entity. Hugo's ` +
        `--minify pipeline will reject this with 'unexpected & in expression'. ` +
        `Cause: a reuse-flatten replaced newlines inside the raw <script> ` +
        `body with the entity. Fix: protect <script>/<style> blocks during ` +
        `flatten (see docs-theme-extras/layouts/_shortcodes/reuse.html).`,
    ).toEqual([]);
  });

  test(`no alert body rendered as <pre><code> (${SAMPLE_LABEL})`, () => {
    // When `{{< alert >}}` appears in a deeply-indented context (e.g.
    // nested sub-step at column 6), the alert .Inner reaches markdownify
    // with 6 spaces of leading whitespace per line. Without dedent,
    // CommonMark's "4 spaces = indented code block" rule fires and the
    // entire alert body renders inside <pre><code>...</code></pre> with
    // any inline HTML tags appearing as escaped &lt;code&gt; visible text.
    // alert.html dedents .Inner before markdownify; this cross-product
    // smoke check confirms the dedent is applied wherever an alert lands.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: { page: string; sample: string }[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const stripped = html.replace(
        /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      // Match alert bodies that open immediately with <pre> (with at most
      // whitespace/`&#10;` between body div and the <pre>). The body
      // legitimately wraps inline content or block elements like <p>, but
      // a <pre> as the first child means the entire body got treated as
      // a code block — the bug signature.
      const re =
        /<div class="solo-alert-body">(?:\s|&#10;)*<pre[\s>]/g;
      const m = re.exec(stripped);
      if (m) {
        const idx = m.index;
        offenders.push({
          page: path.relative(SCAN_ROOT, f),
          sample: stripped
            .slice(idx, idx + 120)
            .replace(/\s+/g, " "),
        });
      }
    }
    expect(
      offenders.map((o) => `${o.page}: ${JSON.stringify(o.sample)}`),
      `pages where an alert body renders inside <pre><code>. The alert's ` +
        `.Inner was passed to markdownify with 4+ spaces of leading indent, ` +
        `so CommonMark treated the body as an indented code block. Fix: ` +
        `dedent .Inner before markdownify (see alert.html).`,
    ).toEqual([]);
  });

  test(`no visible HTML attribute text leakage outside tags (${SAMPLE_LABEL})`, () => {
    // When an HTML block terminates early (the Setext-from-code-block bug
    // and similar), the tail of the buffer can include attribute text from
    // a tag whose opener landed in the now-orphaned region. E.g. the copy
    // button's `class="hextra-code-copy-btn ..."` text appears as visible
    // prose between elements instead of as a real attribute on a <button>.
    //
    // The signature: a `class="hextra-...` substring that is NOT inside a
    // tag (no `<` before it within 200 chars on the same line) and IS
    // immediately preceded by `\n` or `>`. This is a heuristic — but a
    // tight one for this theme's class names.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: { page: string; sample: string }[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const visible = html.replace(
        /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      // Look for `class="hextra-` preceded by whitespace and a `>` (i.e.
      // after a tag closes, before the next tag opens). Inside a real
      // tag, `class="..."` is preceded by a tag name and space, never by
      // ">". This catches the copy-button-attribute-leak shape.
      const m = visible.match(/>\s+class="hextra-[a-z][a-z0-9-]*/);
      if (m) {
        offenders.push({
          page: path.relative(SCAN_ROOT, f),
          sample: m[0].slice(0, 80),
        });
      }
    }
    expect(
      offenders.map((o) => `${o.page}: ${JSON.stringify(o.sample)}`),
      `pages where HTML attribute text (class="hextra-...") leaked outside ` +
        `tag context — usually the tail of a copy-button whose container ` +
        `<div> was closed early by a CommonMark HTML-block terminator (blank ` +
        `line inside <pre>, or a column-0 continuation inside a list item).`,
    ).toEqual([]);
  });
});

// Walk `root` depth-first, collecting `*.html` files. `max === 0` means
// unlimited — walk every file. Otherwise stop once `max` files are gathered.
function collectHtml(root: string, max: number): string[] {
  const unlimited = max === 0;
  const out: string[] = [];
  const stack = [root];
  while (stack.length && (unlimited || out.length < max)) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!unlimited && out.length >= max) break;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(p);
    }
  }
  return out;
}
