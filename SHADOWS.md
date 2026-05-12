# Hextra files this module shadows

Every file under `layouts/` in this module that has a same-named counterpart
in [imfing/hextra](https://github.com/imfing/hextra/tree/main/layouts) is a
shadow: Hugo's project-over-imports precedence makes the module's copy win.

When you bump the Hextra pin in [go.mod](./go.mod), diff each shadow
against the new upstream version and forward-port any non-bootstrap
changes. The pattern: read upstream, find our local additions
(usually one or two inserted blocks), reapply them on top of the new
upstream text, run `make self-test`.

A `# ours` comment at the top of every shadow file documents what was
inserted vs. upstream. If you find a shadow without that header,
treat it as a maintenance gap — either add the header or unshadow.

---

## Top-level partials

| File | Why we shadow | Diff target on Hextra upgrade |
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

## Shortcodes

Shortcodes that shadow Hextra (`callout`, `details`, `tab`, `tabs`, `card`,
`cards`, `steps`, etc.) are documented inline. The pattern: each
shortcode file starts with a `# ours` comment block explaining what was
changed vs. the Hextra original.

Shortcodes unique to this module (no Hextra counterpart): `alert`,
`checklist`, `conditional-text`, `github`, `github-table`, `link`,
`link-hextra`, `openapi`, `prism`, `readfile`, `rebase`, `render`, `reuse`,
`reuse-image*`, `version`.

## Debugging shadow resolution

When a partial isn't behaving as expected, the first question is "which
template did Hugo actually load?" Hugo's `templates.Current` action
(available since v0.146.0) reports the resolved template's filename
inline — useful when chasing override precedence between this module,
upstream Hextra, and the consumer's `layouts/`.

Drop a `warnf` into the partial you're debugging:

```hugo
{{ warnf "TEMPLATE %s resolved from %s" templates.Current.Name templates.Current.Filename }}
```

Run a build; the resolved path lands in stderr (e.g.
`.build-oss.log`). Compare against what you expected:

- A path under `/go/pkg/mod/github.com/imfing/hextra@.../` means
  Hugo found the upstream Hextra version.
- A path inside this module's working tree means the shadow won.
- A path inside the consumer's `layouts/` means the consumer's
  override won (highest precedence).

Remove the `warnf` once you have your answer. It's a debug aid, not a
logging hook to ship — every warning during a CI build counts against
the `hugo-warnings` allowlist.

## Hextra upgrade workflow

1. Bump `go.mod`: `hugo mod get github.com/imfing/hextra@vX.Y.Z`.
2. For each entry in the table above, fetch the new upstream file
   and diff against our shadow. Reapply our insertions.
3. Run `make build-fixture && make self-test`.
4. Visual smoke: open `/v2/everything/` and `/v2/rebased/` in light + dark.
5. Tag a new module release; update [CHANGELOG.md](./CHANGELOG.md).
6. See [RELEASE.md](./RELEASE.md) for the full release checklist.
