import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";
import { findMarkdownLeaks } from "./helpers/markdown-leaks";

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

  test(`no markdown or HTML leaks across html pages (${SAMPLE_LABEL})`, () => {
    if (!target.shouldRun("markdownLeaks")) {
      test.skip(true, "markdownLeaks check disabled in CONFIG");
    }
    // Full leak scan over the real product build — the same scanner the
    // `static` project runs against the fixture, but here pointed at every
    // built page of an actual product. This is what catches rendering bugs
    // that only manifest on real content, e.g. a `reuse-image` inside a
    // `conditional-text` block escaping to literal `&lt;div&gt;&lt;figure&gt;`
    // text (the `escaped-html` kind — the kgateway operations/debug figure
    // leak). The fixture scan can't see product-specific shortcode nestings;
    // this one can.
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    expect(htmlFiles.length, "no html pages found").toBeGreaterThan(0);
    const allowlist = target.markdownLeaksAllowlist;
    type Offender = { file: string; kind: string; match: string; context: string };
    const offenders: Offender[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      for (const l of findMarkdownLeaks(html, { allowlist })) {
        offenders.push({
          file: path.relative(SCAN_ROOT, f),
          kind: l.kind,
          match: l.match,
          context: l.context,
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
          lines.push(`    match:   ${o.match}`);
          lines.push(`    context: ${o.context}`);
        }
        if (group.length > 20) lines.push(`  ... and ${group.length - 20} more.`);
      }
      expect(
        offenders,
        `Found ${offenders.length} markdown/HTML leak(s) in ${LABEL}:${lines.join("\n")}\n\n` +
          `If a match is a false positive, add a regex to allowlists.markdownLeaks ` +
          `in your CONFIG TOML.`,
      ).toEqual([]);
    }
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
      // Strip <script>…</script> blocks before scanning. The Copy-as-Markdown
      // feature embeds the page's raw markdown source inside
      // <script type="text/markdown">, and that markdown can legitimately
      // mention `<pre>` (as inline-code prose). Leaving the script content
      // in the haystack causes the regex below to start a "<pre> block" at
      // a text mention and run on until a real </pre> later in the file,
      // sweeping up unrelated <p> tags as false positives.
      const html = fs
        .readFileSync(f, "utf8")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
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

  test(`no fragmented code block (orphaned hextra-code-block wrapper) in any sampled page (${SAMPLE_LABEL})`, () => {
    if (!target.shouldRun("shortcodeLeaks")) {
      test.skip(true, "shortcodeLeaks check disabled in CONFIG");
    }
    // Structural signature of a fenced code block FRAGMENTING: the hextra
    // code-block wrapper `<div class="hextra-code-block …">` is immediately
    // followed by a CONTAINER CLOSE (`</li>`, `</ol>`, `</ul>`, `</p>`) instead
    // of its expected inner `<div><pre>`. This happens when a fenced block is
    // emitted inside a list item via a second RenderString pass (the rebase→
    // reuse chain on assembled kgateway / gateway-2.0.x pages): the parent
    // reads the rendered `<div>` as a CommonMark HTML block, closes the list,
    // and re-wraps the code guts in a `<p>` — yielding the broken
    // `<div class="hextra-code-block">…</li></ol><p><div class="highlight"><pre>`
    // (the kgateway operations/debug "Debug your gateway setup" shape). A
    // well-formed code block always has its inner `<div>`/`<pre>` between the
    // wrapper's `>` and any closing tag, so this is high-signal. Fix: use
    // inline code instead of a fenced block inside the gated shortcode body.
    // (The generic "<pre> inside <p>" heuristic is NOT used — Goldmark emits
    // block elements inside <p> on many legit pages, so it false-positives.)
    const FRAGMENT = /<div class="hextra-code-block[^"]*">\s*<\/(?:li|ol|ul|p)>/;
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const offenders: string[] = [];
    for (const f of htmlFiles) {
      const html = fs
        .readFileSync(f, "utf8")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
      if (FRAGMENT.test(html)) {
        offenders.push(path.relative(SCAN_ROOT, f));
      }
    }
    expect(
      offenders,
      `pages with a fragmented code block — a fenced block inside a list item was ` +
        `re-parsed by the rebase/reuse chain, orphaning the hextra-code-block wrapper ` +
        `and breaking the list. Use inline code instead of a fenced block in the ` +
        `gated/reused body, or restructure so the fence isn't inside the list item.`,
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
