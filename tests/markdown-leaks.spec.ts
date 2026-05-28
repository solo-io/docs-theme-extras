import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { findMarkdownLeaks, __test } from "./helpers/markdown-leaks";
import { target } from "./helpers/target";

// Framework-level scanner for markdown that survived into rendered HTML.
// Catches the class of bug where an author wrote markdown inside a context
// that didn't get parsed — e.g. a table row trapped inside an angle-form
// version shortcode, a link inside an angle-form include, raw shortcode
// delimiters that escaped processing.
//
// Two layers:
//   1. Unit tests on the pattern matcher (deterministic synthetic input).
//   2. A scan over every HTML file under target.builtRoot. Reports
//      offenders by file and matched substring so the bug surfaces with
//      enough context to find the source.
//
// Allowlist via Site.Params CONFIG TOML (allowlists.markdownLeaks, an
// array of regex strings) for the rare third-party noise that shouldn't
// fail the build (e.g. a vendor's JSON-embedded markdown in a data attr).

const ENABLED = target.shouldRun("markdownLeaks");

// ── Unit tests on the helper ────────────────────────────────────────

test.describe("findMarkdownLeaks helper", () => {
  test("flags markdown link syntax in plain HTML", () => {
    const html = `<p>See [the docs](https://example.com) for details.</p>`;
    const leaks = findMarkdownLeaks(html);
    expect(leaks).toHaveLength(1);
    expect(leaks[0].kind).toBe("markdown-link");
    expect(leaks[0].match).toContain("[the docs](https://example.com)");
  });

  test("does NOT flag markdown link inside <code> or <pre>", () => {
    const html = `
      <p>This works:</p>
      <pre><code>[link](url)</code></pre>
      <p>And inline: <code>[link](url)</code> is fine.</p>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("flags table-row pipe leakage", () => {
    const html = `
      <p>| ColA | ColB |</p>
      <p>Normal sentence.</p>
    `;
    const leaks = findMarkdownLeaks(html);
    const pipes = leaks.filter((l) => l.kind === "table-pipe");
    expect(pipes).toHaveLength(1);
    expect(pipes[0].match).toContain("| ColA | ColB |");
  });

  test("does NOT flag mid-content pipes inside <td>/<th>", () => {
    // Cell content with pipes in the middle (e.g. shell command) is fine.
    // The regex anchors on `>` so the pipe must START the cell content
    // to trip — a mid-cell pipe doesn't.
    const html = `
      <table><tbody>
        <tr><td>ls | grep foo</td><td>pipe inside cell</td></tr>
      </tbody></table>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("DOES flag a <td> whose content starts with a pipe (row-leak shape)", () => {
    // The kgateway k8sgwapi-exp.md bug shape: an angle-form version
    // shortcode wrapping a table row collapses the entire row into a
    // single cell. The leaked cell content opens with `|`.
    const html = `
      <table><tbody>
        <tr><td>baseline</td><td>1.0</td></tr>
        <tr><td>| MARKER | 2.0 |</td><td></td></tr>
      </tbody></table>
    `;
    const leaks = findMarkdownLeaks(html);
    const pipes = leaks.filter((l) => l.kind === "table-pipe");
    expect(pipes.length).toBeGreaterThan(0);
    expect(pipes[0].match).toContain("| MARKER | 2.0 |");
  });

  test("does NOT flag pipes in arbitrary prose without table shape", () => {
    // A single mid-sentence pipe is fine — only the line-start pipe
    // pattern (table-row-shaped) is flagged.
    const html = `<p>You can use stdin | grep foo to filter output.</p>`;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("flags raw shortcode delimiters", () => {
    const html = `<p>Hello {{< broken >}} world</p>`;
    const leaks = findMarkdownLeaks(html);
    expect(leaks.some((l) => l.kind === "shortcode-delim")).toBe(true);
  });

  test("does NOT flag shortcode delimiters inside <code>", () => {
    const html = `<p>Write <code>{{&lt; reuse "foo" &gt;}}</code> to reuse.</p>`;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("does NOT flag markdown-looking syntax in HTML attributes", () => {
    // Alt text, aria labels, and title attrs sometimes contain bare
    // brackets or pipes legitimately.
    const html = `
      <img alt="step [1](2)" src="/x.png">
      <a title="opens in new tab | external" href="/x">link</a>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("respects allowlist regex", () => {
    const html = `<p>See [allow this](https://allowed.com) but not [block](https://blocked.com)</p>`;
    const leaks = findMarkdownLeaks(html, {
      allowlist: [/allowed\.com/],
    });
    expect(leaks).toHaveLength(1);
    expect(leaks[0].match).toContain("blocked.com");
  });

  test("does NOT flag markdown inside HTML comments", () => {
    // Authors stash commented-out markdown links / table rows in
    // pages as TODOs or hidden alternative content. These aren't
    // rendering bugs.
    const html = `
      <p>Visible prose.</p>
      <!-- - [link](url) — TODO add this back -->
      <p>More prose.</p>
      <!-- | col | val | -->
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("does NOT flag markdown inside api-kubespec <div class=ks-rich-block>", () => {
    // The api-kubespec generator emits CRD field descriptions verbatim
    // inside `<div class="ks-rich-block">` (or unquoted `class=ks-rich-block`
    // when the output is minified). The same source text renders as a real
    // link on the docs-hub Goldmark path; the api-kubespec display is
    // intentional "JSON-like" structure. Cover both attribute-quoting
    // forms.
    const htmlQuoted = `
      <p>Visible prose with [a real leak](https://example.com).</p>
      <div class="ks-rich-block">grpc specifies that the gRPC External Authorization<br>[protocol](https://envoyproxy.io/external_auth.proto) should be used.</div>
    `;
    const quotedLeaks = findMarkdownLeaks(htmlQuoted);
    expect(quotedLeaks.length).toBe(1);
    expect(quotedLeaks[0].match).toContain("[a real leak]");

    const htmlUnquoted = `
      <p>Visible prose with [a real leak](https://example.com).</p>
      <div class=ks-rich-block>grpc specifies that the gRPC External Authorization<br>[protocol](https://envoyproxy.io/external_auth.proto) should be used.</div>
    `;
    const unquotedLeaks = findMarkdownLeaks(htmlUnquoted);
    expect(unquotedLeaks.length).toBe(1);
    expect(unquotedLeaks[0].match).toContain("[a real leak]");
  });

  test("strips <script type='text/markdown'> source embeds", () => {
    // The copy-as-markdown <script> tag embeds raw markdown that
    // legitimately contains every pattern we look for. Must not
    // false-positive on the embed itself.
    const html = `
      <script type="text/markdown">| Col A | Col B |
| --- | --- |
| [link](url) | val |</script>
      <p>Real prose here.</p>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("flags empty <li></li> (orphan list-marker leak)", () => {
    // Canonical shape from the ambient-multi-link.md step 3→4 boundary:
    // a percent-form `{{% version %}}` body ending with a bare `4. `
    // marker that RenderString turned into `<ol start=4><li></li></ol>`.
    const html = `
      <p>Long preamble paragraph.</p>
      <ol start=4><li></li></ol>Optional: Verify that the istiod...
    `;
    const leaks = findMarkdownLeaks(html);
    const empty = leaks.filter((l) => l.kind === "empty-list-item");
    expect(empty).toHaveLength(1);
    expect(empty[0].match).toBe("<li></li>");
  });

  test("flags empty <li> with whitespace and attributes", () => {
    const html = `<ol><li class="foo">
    </li></ol>`;
    const leaks = findMarkdownLeaks(html);
    expect(leaks.some((l) => l.kind === "empty-list-item")).toBe(true);
  });

  test("flags leaked code-fence triple-backticks in body text", () => {
    // ```sh that survived as literal backticks because the surrounding
    // region was treated as a raw HTML block (post-RenderString reinsertion).
    const html = `
      <p>Optional: Verify that ...</p>
      \`\`\`sh
      istioctl proxy-status --context \${context1}
      \`\`\`
      <p>Example output:</p>
    `;
    const leaks = findMarkdownLeaks(html);
    const fences = leaks.filter((l) => l.kind === "code-fence");
    expect(fences.length).toBeGreaterThan(0);
    expect(fences[0].match.startsWith("\`\`\`")).toBe(true);
  });

  test("does NOT flag triple-backticks inside <pre> or <code>", () => {
    // Real fences become Chroma <pre><code> blocks; <pre>/<code> regions
    // are stripped before the scan, so the backticks inside them are
    // invisible to CODE_FENCE.
    const html = `
      <pre><code>\`\`\`sh
echo hello
\`\`\`</code></pre>
      <p>Plain prose.</p>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("stripExpectedMarkdown preserves length (so offsets stay aligned)", () => {
    const html = `<p>before</p><code>[link](x)</code><p>after</p>`;
    const stripped = __test.stripExpectedMarkdown(html);
    expect(stripped.length).toBe(html.length);
  });
});

// ── Full-build scan ─────────────────────────────────────────────────

function walkHtml(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
    }
  }
  return out;
}

// Build the allowlist from CONFIG. Uses target's markdownLeaksAllowlist
// getter, which reads allowlists.markdownLeaks from the TOML and compiles
// each pattern to RegExp.
function readAllowlist(): RegExp[] {
  return target.markdownLeaksAllowlist;
}

test.describe("markdown-leaks: rendered HTML scan", () => {
  test.skip(!ENABLED, "markdownLeaks check disabled in CONFIG");

  test("no leaked markdown across built HTML pages", () => {
    const files = walkHtml(target.builtRoot);
    expect(files.length, `no html under ${target.builtRoot}`).toBeGreaterThan(0);

    const allowlist = readAllowlist();
    type Offender = {
      file: string;
      kind: string;
      match: string;
      context: string;
    };
    const offenders: Offender[] = [];

    for (const f of files) {
      const html = fs.readFileSync(f, "utf8");
      const leaks = findMarkdownLeaks(html, { allowlist });
      for (const l of leaks) {
        offenders.push({
          file: path.relative(target.builtRoot, f),
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
        if (group.length > 20) {
          lines.push(`  ... and ${group.length - 20} more.`);
        }
      }

      expect(
        offenders,
        `Found ${offenders.length} markdown-leak(s) in rendered HTML:${lines.join("\n")}\n\n` +
          `If a match is a false positive, add a regex to allowlists.markdownLeaks ` +
          `in your CONFIG TOML.`,
      ).toEqual([]);
    }
  });
});
