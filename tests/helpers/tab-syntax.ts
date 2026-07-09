// Source-side lint: deprecated Hextra tab shortcode styling.
//
// Hextra 0.12 changed the tabs API. Labels now come from a `name=` attribute
// on each `{{% tab %}}`, e.g. `{{< tabs >}}{{% tab name="Linux" %}}...`.
// The pre-0.12 stylings still linger in older content and fail in different
// ways:
//
//   * `tabName="…"` on a tab      — silently ignored. `tab.html` falls back to
//                                    `printf "Tab %d" .Ordinal`, so the tab
//                                    label renders as "Tab 0", "Tab 1", … with
//                                    NO build warning. This is the worst case:
//                                    it looks fine to the build and broken to
//                                    the reader.
//   * `items="A,B"` on a tabs     — deprecated. Still honored in 0.12.3 (with a
//                                    `warnf`), but slated for removal; when it
//                                    goes, every label falls back to "Tab N".
//   * `tabTotal="N"` on a tabs    — never a real Hextra param; a no-op left
//                                    over from the old house style. Harmless on
//                                    its own but a reliable marker of the old
//                                    form.
//   * a tab with NO `name=`       — same "Tab N" fallback as `tabName=`, just
//                                    reached a different way (bare `{{% tab %}}`).
//
// We hit this on the agentgateway `agctl` install page, whose install tabs
// rendered as "Tab 0"–"Tab 3". This helper scans markdown source so the
// pattern can't sneak back in.

export type TabSyntaxViolation = {
  filePath: string;
  startLine: number;
  shortcode: string; // "tab" or "tabs"
  reason: string; // human-readable explanation + fix
  invocation: string; // the full `{{< … >}}` text (truncated if long)
};

const MAX_INVOCATION = 200;

// Match `{{< NAME … >}}` / `{{% NAME … %}}` invocations across any number of
// lines. Group 1 = shortcode name, group 2 = the arg region. Mirrors the
// lexer boundary used by helpers/shortcode-args.ts.
const SHORTCODE_OPEN = /\{\{[<%]\s*([\w-/]+)([\s\S]*?)\s*[>%]\}\}/g;

// An attribute appears in the arg region as `key=` (value may be quoted or
// bare). Word-bounded so `tabName` doesn't also match a hypothetical
// `xtabName`, and `name` doesn't match `tabName`.
const hasAttr = (argRegion: string, attr: string): boolean =>
  new RegExp(`(^|\\s)${attr}\\s*=`).test(argRegion);

export function findTabSyntaxViolations(
  source: string,
  filePath: string,
): TabSyntaxViolation[] {
  const out: TabSyntaxViolation[] = [];

  for (const m of source.matchAll(SHORTCODE_OPEN)) {
    const shortcode = m[1];
    const argRegion = m[2] ?? "";
    const fullMatch = m[0];
    const startLine = lineAt(source, m.index ?? 0);

    // Closing tags (`{{< /tab >}}`) take no args.
    if (shortcode.startsWith("/")) continue;

    const reasons: string[] = [];

    if (shortcode === "tabs") {
      if (hasAttr(argRegion, "items")) {
        reasons.push(
          `'items=' on {{< tabs >}} is deprecated. Move each label to a ` +
            `'name=' on its {{% tab %}} instead.`,
        );
      }
      if (hasAttr(argRegion, "tabTotal")) {
        reasons.push(
          `'tabTotal=' on {{< tabs >}} is a no-op left over from the old ` +
            `style. Remove it.`,
        );
      }
    } else if (shortcode === "tab") {
      if (hasAttr(argRegion, "tabName")) {
        reasons.push(
          `'tabName=' is ignored in Hextra 0.12+ — the tab renders as ` +
            `"Tab N". Rename it to 'name='.`,
        );
      } else if (!hasAttr(argRegion, "name")) {
        reasons.push(
          `{{% tab %}} has no 'name=' — it renders as "Tab N". Add 'name="…"'.`,
        );
      }
    }

    for (const reason of reasons) {
      out.push({
        filePath,
        startLine,
        shortcode,
        reason,
        invocation:
          fullMatch.length > MAX_INVOCATION
            ? fullMatch.slice(0, MAX_INVOCATION - 3) + "..."
            : fullMatch,
      });
    }
  }

  return out;
}

function lineAt(source: string, offset: number): number {
  let line = 1;
  for (let i = 0; i < offset; i++) {
    if (source.charCodeAt(i) === 10 /* \n */) line++;
  }
  return line;
}
