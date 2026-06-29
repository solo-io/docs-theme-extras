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

  test("flags the conditional-text-first-in-list ordering leak (release-notes shape)", () => {
    // Regression guard for the reference/release-notes.md ordering trap.
    // `conditional-text` renders its body inline-only, so a gated bullet
    // placed AHEAD of the always-shown bullets in a list breaks the list and
    // the gated `[Changelog](url)` survives as literal text instead of an <a>.
    // The fix is ordering: keep the always-shown Upgrade-guide / Version-
    // reference bullets first and the conditional-text bullet LAST. This test
    // pins the scanner's ability to catch the leak if the ordering is undone.
    // NOTE: this fires only because the leaked bullet carries a markdown link.
    // A plain-text gated bullet placed first can break the list with no
    // detectable leak — that case is not caught here (would need a source lint).
    const html = `<ul>
      <li>[Changelog](https://docs.solo.io/gloo-platform/main/reference/changelog/gloo-platform): A full list of changes.
      <a href="/setup/upgrade/">Upgrade guide</a>: Steps to upgrade.</li>
    </ul>`;
    const leaks = findMarkdownLeaks(html);
    const links = leaks.filter((l) => l.kind === "markdown-link");
    expect(links.length).toBeGreaterThan(0);
    expect(links[0].match).toContain("[Changelog]");
  });

  test("flags an unclosed HTML comment (content-swallowing release-notes leak)", () => {
    // The kgateway release-notes "Known issues" leak: a commented-out block
    // with blank lines inside whose lone `-->` line was rewritten by the
    // typographer (`--` → en-dash), so the `<!--` never closed and swallowed
    // the Resiliency/Observability/v23 headings after it — invisible to readers
    // and to the link checker (anchors inside a comment node aren't found).
    const html = `<h2>New features</h2>
      <!-- TODO idk if we have any of these gathered currently?
      ## Known issues
      <p>Some known issues prose.</p>
      <p>&ndash;&gt;</p>
      <h3>Resiliency<span id="resiliency"></span></h3>`;
    const leaks = findMarkdownLeaks(html);
    const c = leaks.filter((l) => l.kind === "unclosed-comment");
    expect(c).toHaveLength(1);
    expect(c[0].match).toBe("<!--");
  });

  test("does NOT flag a well-formed HTML comment (or markdown inside it)", () => {
    const html = `<p>before</p><!-- a commented-out [link](url) TODO note --><p>after</p>`;
    const leaks = findMarkdownLeaks(html);
    expect(leaks.filter((l) => l.kind === "unclosed-comment")).toHaveLength(0);
    // the commented-out markdown link must stay suppressed too
    expect(leaks.filter((l) => l.kind === "markdown-link")).toHaveLength(0);
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

  test("flags <ol start=N> with single empty <li> (orphan step-marker leak)", () => {
    // Canonical shape from the ambient-multi-link.md step 3→4 boundary:
    // a percent-form `{{% version %}}` body ending with a bare `4. `
    // marker that RenderString turned into `<ol start=4><li></li></ol>`.
    // Quoted and unquoted forms of the start attribute, with and without
    // whitespace between tags.
    const cases = [
      `<ol start=4><li></li></ol>`,
      `<ol start="4"><li></li></ol>`,
      `<ol start=2>\n<li>\n</li>\n</ol>`,
      `<ol start="7" class="x"><li class="y"></li></ol>`,
    ];
    for (const html of cases) {
      const leaks = findMarkdownLeaks(html);
      const empty = leaks.filter((l) => l.kind === "empty-list-item");
      expect(empty.length, `case: ${html}`).toBeGreaterThan(0);
    }
  });

  test("does NOT flag empty <li> in a plain <ol> or <ul>", () => {
    // Legitimate empty-li sources that are NOT the orphan-marker bug:
    // version-gated bullets that rendered empty for the current build,
    // code-only items whose `<code>` content got stripped to whitespace
    // by `stripExpectedMarkdown`, plain ordered lists starting at 1.
    const cases = [
      `<ol><li></li></ol>`,
      `<ul><li></li><li>real</li></ul>`,
      `<ol><li>                                         </li><li>real</li></ol>`,
      `<ul><li class="foo"></li></ul>`,
    ];
    for (const html of cases) {
      const leaks = findMarkdownLeaks(html);
      expect(
        leaks.filter((l) => l.kind === "empty-list-item"),
        `case: ${html}`,
      ).toEqual([]);
    }
  });

  test("does NOT flag empty <li role='separator'> dropdown separators", () => {
    // The copy-as-markdown dropdown intentionally emits empty <li> tags
    // with role="separator" between menu groups for visual + ARIA
    // grouping. Both quoted and unquoted attribute forms.
    const html = `
      <ul>
        <li class="copy-md-dropdown-sep" role="separator"></li>
        <li role=separator></li>
      </ul>
    `;
    const leaks = findMarkdownLeaks(html);
    expect(leaks.filter((l) => l.kind === "empty-list-item")).toEqual([]);
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

  test("flags escaped block-HTML that leaked into body text", () => {
    // The kgateway operations/debug figure leak: a `reuse-image` placed
    // inside a `{{% conditional-text %}}` block renders through
    // RenderString in inline mode, which HTML-escapes the emitted
    // `<div><figure><img>` instead of passing it through. The reader sees
    // literal escaped tags. Note the attribute quotes are also entity-
    // escaped (`&quot;`), so the attribute-stripper leaves the tag intact.
    const html = `
      <p>&lt;div style=&quot;text-align: center;&quot; class=&quot;toggle-dark&quot;&gt;&lt;figure&gt;&lt;img src=&quot;/img/x.png&quot;/&gt; &lt;figcaption&gt;Figure: x.&lt;/figcaption&gt;&lt;/figure&gt;&lt;/div&gt;</p>
    `;
    const leaks = findMarkdownLeaks(html);
    const escaped = leaks.filter((l) => l.kind === "escaped-html");
    expect(escaped.length).toBeGreaterThan(0);
    expect(escaped[0].match).toContain("&lt;div");
  });

  test("escaped-html flags both the opening and closing tag forms", () => {
    const cases = [
      `<p>&lt;figure&gt;</p>`,
      `<p>&lt;/figure&gt;</p>`,
      `<p>&lt;table class=&quot;x&quot;&gt;</p>`,
      `<p>&lt;img src=&quot;/x.png&quot;/&gt;</p>`,
    ];
    for (const html of cases) {
      const leaks = findMarkdownLeaks(html);
      expect(
        leaks.filter((l) => l.kind === "escaped-html").length,
        `case: ${html}`,
      ).toBeGreaterThan(0);
    }
  });

  test("does NOT flag escaped HTML inside <code> (authors documenting tags)", () => {
    // Prose that documents an HTML tag uses a backtick span, which becomes
    // <code> and is stripped before the scan. This is the common false-
    // positive source the curated tag list + code-stripping guards against.
    const html = `
      <p>Wrap the image in a <code>&lt;div&gt;</code> with <code>&lt;figure&gt;</code> inside.</p>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
  });

  test("does NOT flag escaped yaml/CLI placeholders like &lt;name&gt;", () => {
    // `<name>` / `<namespace>` placeholders in shell snippets escape to
    // `&lt;name&gt;` but render inside <pre><code> (stripped), and the
    // names aren't in the curated structural-tag list anyway.
    const html = `
      <pre><code>kubectl get httproute &lt;name&gt; -n &lt;namespace&gt;</code></pre>
      <p>Replace &lt;cluster_region&gt; with your region.</p>
    `;
    expect(findMarkdownLeaks(html)).toEqual([]);
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

  test("flags unrendered **bold** that leaked into body text", () => {
    // The fault-injection / insights shape: a broken parent list drops the
    // following step's bold lead-in as literal text.
    const html = `<p>4. Verify the result.</p><p>**Abort**: requests return 418.</p>`;
    const leaks = findMarkdownLeaks(html);
    const bold = leaks.filter((l) => l.kind === "raw-bold");
    expect(bold).toHaveLength(1);
    expect(bold[0].match).toBe("**Abort**");
  });

  test("does NOT flag **bold** inside <code> or a stray ** in prose", () => {
    const html = `
      <p>Set <code>replicas: **2**</code> in the chart.</p>
      <p>The rate is ** per second (two asterisks, not bold).</p>
    `;
    expect(findMarkdownLeaks(html).filter((l) => l.kind === "raw-bold")).toEqual(
      [],
    );
  });

  test("flags a leaked Hugo shortcode placeholder", () => {
    const html = `<p>See HAHAHUGOSHORTCODE-0-HBHB for the value.</p>`;
    const leaks = findMarkdownLeaks(html);
    const ph = leaks.filter((l) => l.kind === "shortcode-placeholder");
    expect(ph.length).toBeGreaterThan(0);
  });

  test("escaped-html flags nested-reuse code/anchor escapes (broadened set)", () => {
    // A conditional-text block escaping a nested {{< reuse >}}'s inline HTML:
    // &lt;code&gt; / &lt;a&gt; in visible body. These tags were NOT in the
    // original structural-only set; the broadened set catches them.
    const html = `<td>Set &lt;code&gt;applyToRoutes&lt;/code&gt; and see &lt;a href=&quot;/x&quot;&gt;docs&lt;/a&gt;.</td>`;
    const kinds = findMarkdownLeaks(html)
      .filter((l) => l.kind === "escaped-html")
      .map((l) => l.match);
    expect(kinds.some((m) => m.includes("&lt;code"))).toBe(true);
    expect(kinds.some((m) => m.includes("&lt;a"))).toBe(true);
  });

  test("does NOT flag escaped &lt;path&gt; / &lt;article&gt; (word-boundary guard)", () => {
    // `p` and `a` are in the tag set, but \b keeps them from matching longer
    // words that merely start with those letters.
    const html = `<p>The &lt;path&gt; element and &lt;article&gt; tag are CSS examples.</p>`;
    expect(
      findMarkdownLeaks(html).filter((l) => l.kind === "escaped-html"),
    ).toEqual([]);
  });

  test("flags typographer artifacts that leaked inside inline <code>", () => {
    // The Solo-istio license-key leak: a `--set …` flag written as literal
    // `<code>` (or produced by a nested reuse and re-markdownified by an alert)
    // has its `--` rewritten to an en dash by the Goldmark typographer, so the
    // reader copies a broken `–set`. Cover the entity form, the literal-char
    // form, and smart quotes (both entity and literal).
    const cases = [
      `<p>Use <code>&ndash;set pilot.env.SOLO_LICENSE_KEY</code> as a fallback.</p>`,
      `<p>Run <code>–set foo</code> now.</p>`,
      `<td>Set <code>REQUIRE_3P_TOKEN=&ldquo;false&rdquo;</code> here.</td>`,
      `<td>Set <code>REQUIRE_3P_TOKEN=“false”</code> here.</td>`,
    ];
    for (const html of cases) {
      const leaks = findMarkdownLeaks(html);
      const typo = leaks.filter((l) => l.kind === "code-typography");
      expect(typo.length, `case: ${html}`).toBeGreaterThan(0);
    }
  });

  test("does NOT flag a correctly-rendered inline code flag (no typographer artifact)", () => {
    // The fixed output: backtick span / neutralized literal code renders the
    // real ASCII `--set` and straight quotes, so nothing should fire.
    const html = `
      <p>Use <code>--set pilot.env.SOLO_LICENSE_KEY</code> as a fallback.</p>
      <p>Set <code>REQUIRE_3P_TOKEN="false"</code> here.</p>
      <p>And <code>--set manager.env.WATCH_NAMESPACES=&lt;namespace&gt;</code>.</p>
    `;
    expect(
      findMarkdownLeaks(html).filter((l) => l.kind === "code-typography"),
    ).toEqual([]);
  });

  test("code-typography does NOT flag an en dash in ordinary prose", () => {
    // The typographer is doing its job in prose; only artifacts INSIDE <code>
    // are bugs. A dash range in a Chroma highlighted block also stays out of
    // scope (the attribute-bearing <code class=…> form isn't matched).
    const html = `
      <p>The range is 2013–2024 in prose.</p>
      <pre><code class="language-sh">echo 2013–2024</code></pre>
    `;
    expect(
      findMarkdownLeaks(html).filter((l) => l.kind === "code-typography"),
    ).toEqual([]);
  });

  test("code-typography does NOT flag an ellipsis placeholder inside <code>", () => {
    // Authors type a literal `…` inside code to mean "elided content" (the
    // extras rebased/everything fixture uses `<code>[…](…)</code>`). That's not
    // a typographer artifact, so the ellipsis is deliberately excluded.
    const html = `<p>Write <code>[…](…)</code> for a link, or <code>foo…bar</code>.</p>`;
    expect(
      findMarkdownLeaks(html).filter((l) => l.kind === "code-typography"),
    ).toEqual([]);
  });

  test("code-typography respects the allowlist", () => {
    const html = `<p>Edge case: <code>x–y</code> is intentional.</p>`;
    expect(
      findMarkdownLeaks(html, { allowlist: [/<code>x–y<\/code>/] }).filter(
        (l) => l.kind === "code-typography",
      ),
    ).toEqual([]);
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
