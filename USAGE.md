# Usage and customizations: where this module differs from Hugo and Hextra

This file is a reference for content authors and maintainers. It has two halves:

- **[Authoring](#authoring-shortcodes-and-render-behavior)** — the shortcodes and
  render behavior that `docs-theme-extras` adds on top of, or changes from, stock
  [Hugo](https://gohugo.io/) and [Hextra](https://imfing.github.io/hextra/). For
  anything not listed, the Hugo and Hextra defaults apply unchanged.
- **[Maintaining](#maintaining-the-shadows)** — the Hextra layout files this module
  shadows, the `# ours` convention, how to debug override precedence, and the
  Hextra upgrade workflow.

If you just want the full parameter docs for one shortcode, the source file is
the source of truth: each file under [`layouts/_shortcodes/`](./layouts/_shortcodes/)
opens with a comment block describing its parameters and behavior. This file is
the map; the source comments are the detail.

---

# Authoring: shortcodes and render behavior

## Upstream references

Bookmark these. When something behaves the way you expect, it is probably stock
Hugo or Hextra, and their docs are the right place to look first.

- Hugo, using shortcodes: <https://gohugo.io/content-management/shortcodes/>
- Hugo, built-in shortcodes: <https://gohugo.io/shortcodes/>
- Hugo, markup render hooks: <https://gohugo.io/render-hooks/>
- Hugo, `RenderString` method (why call form matters below): <https://gohugo.io/methods/page/renderstring/>
- Hextra, shortcodes guide: <https://imfing.github.io/hextra/docs/guide/shortcodes/>

## A note on call form: `{{% %}}` vs `{{< >}}`

This trips up more people than any single shortcode, so it comes first.

In stock Hugo the two call forms are not interchangeable: percent form
(`{{% name %}}`) sends the inner content back through the markdown renderer,
angle-bracket form (`{{< name >}}`) does not. See the Hugo
[shortcodes guide](https://gohugo.io/content-management/shortcodes/) for the
upstream rule.

Several shortcodes in this module (for example `table`, `github-table`, and the
`reuse`/`rebase` family) deliberately render their inner content through
`.Page.RenderString` so that **both call forms produce identical HTML**. This is
not cosmetic: the `rebase` pipeline rewrites percent-form shortcodes to
angle-bracket form before rendering, so any shortcode that relied on percent-form
"splice back into the source" behavior would break on a rebased page. If you are
writing a new shortcode here, prefer the `RenderString` approach for the same
reason.

The safest author-facing guidance is: use whichever form the existing content
around you uses, and assume the two are equivalent for this module's shortcodes
unless a shortcode's own comment says otherwise.

## Shortcodes that override a Hextra shortcode

These share a name with a Hextra shortcode, so you may already know them, but
their behavior here differs. The "Difference" column is what changed; follow the
Hextra link for the baseline behavior.

| Shortcode | Difference from Hextra | Hextra reference |
|---|---|---|
| `callout` | Derives the icon from `type`/`context` using the Material Icons font instead of Hextra's SVG icon lookup. Adds `role="note"` for accessibility (not `role="alert"`). Emits the box on one logical line so a callout inside a list item does not break the list. Has a translation-export mode. | [callout](https://imfing.github.io/hextra/docs/guide/shortcodes/callout/) |
| `details` | Defaults to **closed**. Hextra defaults to open and uses `closed="true"` to collapse; here you pass `open="true"` to expand, and Hextra's `closed="true"` is a harmless no-op. | [details](https://imfing.github.io/hextra/docs/guide/shortcodes/details/) |
| `card` | Emits the same `.section-card` markup as the auto-generated section-index cards, so manual cards match generated ones. Title and subtitle are `<span>` (display:block), not `<p>`, so the card survives being wrapped by `markdownify`. Adds a `path=` parameter that resolves a section-relative path. | [cards](https://imfing.github.io/hextra/docs/guide/shortcodes/cards/) |
| `cards` | Emits the `.section-cards` container that the auto-card grid uses; `cols` defaults to 3. | [cards](https://imfing.github.io/hextra/docs/guide/shortcodes/cards/) |

## Rendering behavior this module overrides (markup render hooks)

These are not shortcodes. They change how ordinary markdown renders across every
page, by overriding Hugo/Hextra [render hooks](https://gohugo.io/render-hooks/).
You do not call them; they just change the default output.

| Hook | What changes | Reference |
|---|---|---|
| Table render hook ([`render-table.html`](./layouts/_markup/render-table.html)) | Caps per-cell column width only on wide reference tables (a 3+ column header is the signal, for example `Key \| Type \| Default \| Description`). Two-column narrative tables render uncapped and fill the content width. See `.table-capped` in `docs-theme-extras.css`. Use the `table` shortcode below to override this per table. | [Hugo table hooks](https://gohugo.io/render-hooks/tables/) |
| Link render hook ([`render-link.html`](./layouts/_markup/render-link.html)) | Simplified so it works inside `RenderString` context (nested `reuse` shortcodes), where `.PageInner`/`.RelPermalink` would fail. Uses `relURL` for internal links instead of full page resolution. | [Hugo link hooks](https://gohugo.io/render-hooks/links/) |
| Blockquote alert hook ([`render-blockquote-alert.html`](./layouts/_markup/render-blockquote-alert.html)) | Same as Hextra's GitHub-style alert hook (`> [!NOTE]`), except it also ships two custom alert types that need no consumer config — `[!SOLO]` (branded, `solo` icon) and `[!SUCCESS]` (green check, the GitHub-syntax counterpart to `callout type="success"`) — and additionally accepts any custom types a consumer declares under `site.Params.themeExtras.alertTypes`. Unknown types still warn and fall back to the default style. | [Hugo blockquote hooks](https://gohugo.io/render-hooks/blockquotes/) |

## Shortcodes unique to this module (no Hugo or Hextra equivalent)

These have no upstream counterpart, so there is nothing to compare against. They
are grouped by purpose. See each source file for full parameters.

### Content reuse and versioning

| Shortcode | What it does |
|---|---|
| `reuse` | Includes a snippet from the assets tree, applying version- and product-aware shortcode rewrites so the same snippet renders correctly across versions and products. Takes the snippet path as the first positional parameter. |
| `rebase` | Renders another version's asset tree into the current page, applying version-aware shortcode rewrites through a multi-stage pipeline. |
| `readfile` | Inlines a local file. Renders it as markdown when `markdown="true"`, otherwise passes it through as raw HTML. Skips `SECURITY_SCAN` files when `Site.Params.noSecurityScan` is set. Wraps Hugo's [`readFile`](https://gohugo.io/functions/os/readfile/). |
| `github` | Fetches a remote file by URL and inlines it. `.md` URLs render through the page's markdown renderer; other file types pass through as-is (wrap them in a code fence). |
| `github-table` | Fetches a remote markdown file and inlines a single section, selected by heading name, with an optional `exclude` regex. |
| `version` | Emits version-conditional text. Dispatches on the shape of the inner content to stay list-safe and code-fence-safe (see the source comment for the trailing-step, no-markdown, and inline-markdown paths). |
| `version-cards` | Renders a card grid mirroring the navbar version dropdown, for a section landing page. |
| `conditional-text` | Includes or excludes its inner content based on the page's build condition (for example `gme` vs `gmg`), resolved through `utils/page-context`. |
| `upstream` / `downstream` | Content gating for the oss-vs-enterprise build split. `upstream` shows content only in the source build; `downstream` shows it only in the downstream build. |
| `link` | An internal link resolved from a section-relative `path=` to the current section and version. Has a translation-export mode that preserves the source shortcode form. |
| `link-hextra` | Like `link`, but infers the product and version from the current page's permalink when they are not passed in (typical inside a reused snippet). |

### UI components

| Shortcode | What it does |
|---|---|
| `table` | Wraps a markdown table so the author chooses how columns size, overriding the render-hook heuristic above. `mode="wrap"` (default) fills the body width and wraps; `mode="nowrap"` sizes to content and scrolls horizontally (good for commands and code); `mode="equal"` gives equal-width columns. The markdown table inside it must start at column 0. |
| `alert` | An alias for `callout` (it maps `context` onto `type` and calls `callout`), so the two render identically. |
| `checklist` | Renders an interactive checkbox list from `- [ ]` markdown lines. |
| `gloss` | Renders an inline glossary term with a hover/focus tooltip, looked up from the consumer's `data/glossary.yaml`. Optional inner content overrides the displayed text. |
| `details` | (listed above as a Hextra override) |
| `redirect` | Emits a client-side redirect stub (script + `<noscript>` meta-refresh + a visible link) for a page that has moved. |
| `reuse-image` | A theme-aware image that renders in both light and dark mode, with a translation-export guard against path doubling. |
| `reuse-image-light` / `reuse-image-dark` | Single-mode image variants, shown only in light or only in dark mode via the `.toggle-dark` CSS class. |
| `openapi` | Embeds a Swagger UI viewer for an OpenAPI spec, and also emits a plain-text summary so the "Copy as Markdown" feature captures the API content that Swagger renders client-side. |
| `render` | Renders the changelog widget (release/chronological/compare-versions selector) for a changelog page. |

### Deprecated

| Shortcode | Status |
|---|---|
| `prism` | Deprecated legacy stub from docs-theme-lotus. Use a fenced code block ( ```` ```lang {hl_lines=[...]} ```` ) instead. `prism` emits pre-rendered `<pre>` HTML, which breaks list continuation when used inside a reused list item. Slated for removal once no consumer references it. |

---

# Maintaining the shadows

The section above is about shortcodes. This section is about the partial and
layout files this module overrides.

Every file under `layouts/` in this module that has a same-named counterpart in
[imfing/hextra](https://github.com/imfing/hextra/tree/main/layouts) is a
*shadow*: Hugo's project-over-imports precedence makes the module's copy win.

When you bump the Hextra pin in [go.mod](./go.mod), diff each shadow against the
new upstream version and forward-port any non-bootstrap changes. The pattern:
read upstream, find this module's local additions (usually one or two inserted
blocks), reapply them on top of the new upstream text, then run `make self-test`.

A `# ours` comment at the top of every shadow file documents what was inserted
vs. upstream. If you find a shadow without that header, treat it as a maintenance
gap: either add the header or unshadow the file.

## Top-level partials

| File | Why it's shadowed | Diff target on Hextra upgrade |
|---|---|---|
| `layouts/partials/footer.html` | Replace "Powered by Hextra" with Solo footer; honor `params.footer.copyright` AND call `custom/footer.html`. | `hextra/layouts/_partials/footer.html` |
| `layouts/partials/navbar.html` | Wire up version dropdown + Solo brand chrome. | `hextra/layouts/_partials/navbar.html` |
| `layouts/partials/navbar-title.html` | Light/dark product logo with sidebar variant. | `hextra/layouts/_partials/navbar-title.html` |
| `layouts/partials/sidebar.html` | Material icons in nav, product-logo block, sidebar badges. | `hextra/layouts/_partials/sidebar.html` |
| `layouts/partials/toc.html` | Sticky "Scroll to top" footer; scroll-spy hook. | `hextra/layouts/_partials/toc.html` |
| `layouts/partials/breadcrumb.html` | Home icon + chevron separators matching old theme. | `hextra/layouts/_partials/breadcrumb.html` |
| `layouts/partials/copy-markdown.html` | Copy-as-Markdown button with dropdown + dialog. | `hextra/layouts/_partials/copy-markdown.html` (if present upstream) or NEW partial unique to this module |
| `layouts/partials/version-banner.html` | Per-page "you're viewing vN, latest is vM" banner. | NEW partial unique to this module |

## Subdirectory shadows

| Directory | Notes |
|---|---|
| `layouts/partials/components/` | Per-component overrides — re-diff each file individually on upgrade. |
| `layouts/partials/docs/` | Docs-layout-specific partials. |
| `layouts/partials/scripts/` | Search, mermaid, analytics, math (KaTeX/MathJax). |
| `layouts/partials/utils/` | Page description, page-width override. |
| `layouts/partials/themeExtras/` | **Not a shadow.** Module-internal namespace. Bootstrap content invoked by consumers from their own `custom/head-end.html`. |

## Shortcode shadows

The [authoring section above](#shortcodes-that-override-a-hextra-shortcode) lists
the shortcodes that shadow Hextra (`callout`, `details`, `card`, `cards`) and the
ones unique to this module. Each shortcode file starts with a `# ours` comment
block explaining what was changed vs. the Hextra original.

## Debugging shadow resolution

When a partial isn't behaving as expected, the first question is "which template
did Hugo actually load?" Hugo's `templates.Current` action (available since
v0.146.0) reports the resolved template's filename inline, which is useful when
chasing override precedence between this module, upstream Hextra, and the
consumer's `layouts/`.

Drop a `warnf` into the partial you're debugging:

```hugo
{{ warnf "TEMPLATE %s resolved from %s" templates.Current.Name templates.Current.Filename }}
```

Run a build; the resolved path lands in stderr (for example `.build-oss.log`). Compare
against what you expected:

- A path under `/go/pkg/mod/github.com/imfing/hextra@.../` means Hugo found the
  upstream Hextra version.
- A path inside this module's working tree means the shadow won.
- A path inside the consumer's `layouts/` means the consumer's override won
  (highest precedence).

Remove the `warnf` once you have your answer. It's a debug aid, not a logging
hook to ship: every warning during a build counts against the `hugo-warnings`
allowlist.

## Hextra upgrade workflow

1. Bump `go.mod`: `hugo mod get github.com/imfing/hextra@vX.Y.Z`.
2. For each entry in the tables above, fetch the new upstream file and diff
   against the module's shadow. Reapply the local insertions.
3. Run `make build-fixture && make self-test`.
4. Visual smoke: open `/v2/everything/` and `/v2/rebased/` in light + dark.
5. Tag a new module release; update [CHANGELOG.md](./CHANGELOG.md).
6. See [RELEASE.md](./RELEASE.md) for the full release checklist.

---

## Keeping this current

When you add or change a shortcode, render hook, or shadowed layout file, update
the matching row here. If a row here and the source comment (or the `# ours`
header) disagree, trust the source and fix the row.
