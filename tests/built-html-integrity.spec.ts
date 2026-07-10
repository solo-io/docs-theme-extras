import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Structural sanity of a consumer's built HTML — the checks that used to live
// in the deleted smoke.spec.ts, now in the "content" project so they run for
// every consumer (single-site or hub) against real content, not gated behind a
// separate "smoke" toggle. Scoped by target.builtScanRoot, so the multi-product
// hub sets CONTENT_DIR=<product> to scan one product subtree per matrix job
// (what SMOKE_PRODUCT used to do).
//
// This spec deliberately does NOT repeat the markdown/shortcode-leak scan —
// that lives in markdown-leaks.spec.ts (same "content" project). It covers the
// two structural signatures the leak regexes can't see:
//   • a <p> injected inside a <pre> (the {{% tab %}} double-markdownify bug)
//   • a fenced code block fragmenting inside a list item (orphaned
//     hextra-code-block wrapper — the rebase/reuse chain re-parsing)
// plus the copy-as-markdown presence check and a build-produced-pages sanity.

const SCAN_ROOT = target.builtScanRoot;
// The cheap file-read scans below always walk every page (0 = unlimited): a
// leak/fragment on an unscanned page would ship. The [crawl].maxFiles cap is
// for the EXPENSIVE browser crawl (console-errors.spec.ts), not these.
function collectHtml(root: string): string[] {
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(p);
    }
  }
  return out;
}

test.describe(`built-html integrity: ${target.name}`, () => {
  test("scan root exists and contains built pages", () => {
    expect(fs.existsSync(SCAN_ROOT), `${SCAN_ROOT} not found`).toBe(true);
    const files = collectHtml(SCAN_ROOT);
    expect(
      files.length,
      `no built HTML under ${SCAN_ROOT} — run the Hugo build first ` +
        `(and check CONTENT_DIR if set)`,
    ).toBeGreaterThan(0);
  });

  test("at least one page emits a copy-as-md script tag", () => {
    if (!target.shouldRun("copyAsMarkdown")) {
      test.skip(true, "copyAsMarkdown check disabled in CONFIG");
    }
    const hasCopyMd = collectHtml(SCAN_ROOT).some((f) =>
      /<script[^>]*type=["']text\/markdown["']/i.test(
        fs.readFileSync(f, "utf8"),
      ),
    );
    expect(hasCopyMd, `no copy-as-md found in any page under ${SCAN_ROOT}`).toBe(
      true,
    );
  });

  test("no <p> inside <pre> in any page", () => {
    if (!target.shouldRun("codeBlockIntegrity")) {
      test.skip(true, "codeBlockIntegrity check disabled in CONFIG");
    }
    // A <p> inside a <pre> is never valid HTML. It is the structural signature
    // of the {{% tab %}} double-markdownify bug: markdownify called on already-
    // rendered HTML makes the CommonMark parser terminate <pre> at blank lines
    // and inject <p> tags, breaking code blocks and copy buttons.
    const offenders: string[] = [];
    for (const f of collectHtml(SCAN_ROOT)) {
      // Strip <script>…</script> first — the Copy-as-Markdown feature embeds
      // the page's raw markdown source (which can mention `<pre>` in prose),
      // and leaving it in would start a bogus <pre> region.
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

  test("no fragmented code block (orphaned hextra-code-block wrapper) in any page", () => {
    if (!target.shouldRun("codeBlockIntegrity")) {
      test.skip(true, "codeBlockIntegrity check disabled in CONFIG");
    }
    // Structural signature of a fenced code block FRAGMENTING: the hextra
    // code-block wrapper `<div class="hextra-code-block …">` is immediately
    // followed by a CONTAINER CLOSE (`</li>`, `</ol>`, `</ul>`, `</p>`) instead
    // of its expected inner `<div><pre>`. Happens when a fenced block emitted
    // inside a list item is re-parsed by a second RenderString pass (the
    // rebase→reuse chain): the parent reads the rendered `<div>` as a CommonMark
    // HTML block, closes the list, and re-wraps the code guts in a `<p>`. A
    // well-formed block always has its inner `<div>`/`<pre>` between the
    // wrapper's `>` and any closing tag, so this is high-signal.
    const FRAGMENT = /<div class="hextra-code-block[^"]*">\s*<\/(?:li|ol|ul|p)>/;
    const offenders: string[] = [];
    for (const f of collectHtml(SCAN_ROOT)) {
      const html = fs
        .readFileSync(f, "utf8")
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/g, "");
      if (FRAGMENT.test(html)) offenders.push(path.relative(SCAN_ROOT, f));
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
