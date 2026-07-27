// Source-side lint: a Hugo shortcode used inside a markdown heading that has
// no explicit `{#id}` attribute.
//
// Hugo derives a heading's anchor ID (used for the TOC link, the subheading
// anchor, and the inline `<span id>`) from the RAW markdown text — BEFORE it
// substitutes shortcode placeholders. So a heading like
//
//     ## Install {{< reuse "conrefs/snippets/product-names.md" >}}
//
// renders its visible text correctly ("Install Solo Enterprise for kagent")
// but the anchor ID becomes the literal Hugo placeholder, e.g.
// `install-hahahugoshortcode14s7hbhb`. That placeholder leaks into the
// rendered HTML (the built-output scan flags it as a `shortcode-placeholder`
// markdown leak), and the anchor is broken and non-deterministic across
// builds, so no in-page or inbound link can target the heading.
//
// The fix is to give the heading an explicit, stable ID by appending a
// Goldmark heading-attribute block: `{#id}`. Hugo then uses that ID verbatim
// instead of slugifying the placeholder-bearing raw text. The overwhelming
// majority of shortcode-bearing headings in the corpus already do this; this
// lint keeps the few that don't from regressing.
//
// The check is deliberately broad: ANY shortcode (`{{< >}}` or `{{% %}}`) in a
// heading without an explicit ID is flagged. Adding `{#id}` is harmless even
// for a shortcode that happens not to leak today, and it matches the
// established convention.

export type HeadingShortcodeIdViolation = {
  filePath: string;
  line: number; // 1-based
  heading: string; // the raw heading line, trimmed
};

// An ATX heading: 1–6 leading `#` followed by a space and some content.
// Setext headings ("===" / "---" underlines) can't usefully carry an inline
// shortcode and don't appear in this corpus, so they're out of scope.
const HEADING = /^(#{1,6})\s+\S/;

// A Hugo shortcode invocation: `{{< ... >}}` or `{{% ... %}}`. The `<`/`%`
// sigil distinguishes a shortcode from a Go template `{{ ... }}` (which never
// appears in content markdown and would not leak a heading anchor anyway).
const SHORTCODE = /\{\{[<%]/;

// An explicit Goldmark heading-attribute ID anywhere on the line: `{#some-id}`.
const EXPLICIT_ID = /\{#[^}\s]+\}/;

// Replace every character inside an HTML comment with a space, preserving
// newlines (and therefore line numbers and column offsets). A commented-out
// heading — common in this corpus for parked/alternate content — must not be
// flagged. Unclosed comments (no `-->`) are intentionally left intact: they
// are a separate defect and shouldn't silently mask headings after them.
function blankOutComments(source: string): string {
  return source.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, " "));
}

export function findHeadingShortcodeIdViolations(
  source: string,
  filePath: string,
): HeadingShortcodeIdViolation[] {
  const out: HeadingShortcodeIdViolation[] = [];
  const lines = blankOutComments(source).split(/\r?\n/);

  // Skip YAML (`---`) or TOML (`+++`) front matter. A `#` line there is a
  // config comment, not a heading (and it may legitimately mention a
  // shortcode, as in a `# ...` note above a `test:` block). Front matter is
  // only front matter when the delimiter is the file's first line.
  let frontMatterEnd = -1;
  const fmDelim =
    lines[0]?.trim() === "---"
      ? "---"
      : lines[0]?.trim() === "+++"
        ? "+++"
        : "";
  if (fmDelim) {
    for (let i = 1; i < lines.length; i++) {
      if (lines[i].trim() === fmDelim) {
        frontMatterEnd = i;
        break;
      }
    }
  }

  let inFence = false;
  let fenceChar = "";
  for (let i = 0; i < lines.length; i++) {
    if (i <= frontMatterEnd) continue;
    const line = lines[i];

    // Track fenced code blocks (``` or ~~~). A `#` inside a fence is a shell
    // comment or similar, not a heading.
    const fence = line.match(/^\s*(`{3,}|~{3,})/);
    if (fence) {
      const char = fence[1][0];
      if (!inFence) {
        inFence = true;
        fenceChar = char;
      } else if (char === fenceChar) {
        inFence = false;
        fenceChar = "";
      }
      continue;
    }
    if (inFence) continue;

    if (!HEADING.test(line)) continue;
    if (EXPLICIT_ID.test(line)) continue;
    if (!SHORTCODE.test(line)) continue;

    out.push({ filePath, line: i + 1, heading: line.trim() });
  }

  return out;
}
