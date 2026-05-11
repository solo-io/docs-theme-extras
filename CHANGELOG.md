# Changelog

All notable changes to `docs-theme-extras` are documented here.

The format roughly follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and the project uses [Semantic Versioning](https://semver.org/spec/v2.0.0.html):

- **Patch** — non-breaking layout, CSS, or shortcode-internal fix.
- **Minor** — new shortcode, new partial, or a Hextra minor bump.
- **Major** — Hextra major bump, or any change that requires content edits
  in consumer repos (renamed shortcodes, removed args, new required params).

Consumer repos bump the module pin (`hugo mod get github.com/solo-io/docs-theme-extras@vX.Y.Z`)
deliberately, one PR at a time. Never use floating refs in production hugo configs.

---

## [1.0.0] — Initial release

The module reaches feature parity with the per-repo overrides previously
maintained inline in [solo-io/docs](https://github.com/solo-io/docs) and
[agentgateway-oss-website](https://github.com/agentgateway/website).

### Module surface

- **Hextra pin:** `github.com/imfing/hextra v0.12.3` (transitively imported).
- **Brand layers:** `Site.Params.themeExtras.brand = "oss" | "enterprise"`
  toggles `brand-oss.css` / `brand-enterprise.css` on top of `docs-theme-extras.css`.
  Unset = bare component baseline (used by the self-test fixture).

### Shortcodes

`alert`, `callout`, `card`, `cards`, `checklist`, `conditional-text`, `details`,
`github`, `github-table`, `link`, `link-hextra`, `openapi`, `prism`, `readfile`,
`rebase`, `render`, `reuse`, `reuse-image`, `reuse-image-dark`,
`reuse-image-light`, `version`.

### Partials

- `partials/footer.html` — Solo-styled footer; honors `params.footer.copyright`
  and calls `custom/footer.html` for full HTML control.
- `partials/themeExtras/head-end.html` — module bootstrap (brand CSS, fonts,
  sidebar-loading, tab JS, TOC scroll-spy, Copy-as-Markdown, hash scroll
  restoration). Consumers invoke this from their own `custom/head-end.html`.
- Plus shadow overrides of Hextra's `navbar`, `navbar-title`, `sidebar`,
  `toc`, `breadcrumb`, `copy-markdown`, `version-banner`, and several
  `components/`, `docs/`, `scripts/`, `utils/` partials. See `SHADOWS.md`
  for the full list and what to re-diff on Hextra upgrades.

### Test harness

Playwright HTML-only suite that runs against any consumer's built `public/`
via `make test CONFIG=path/to/.docs-test.toml`:

- Structural correctness (`smoke`, `presence`, `auto-cards`, `static`,
  `versioning`, `shortcode-args`, `github-shortcode`, `include-form`,
  `hugo-warnings`, `curl-quotes`).
- Browser checks (`browser`, `cross-browser`, `contrast`, `viewport`,
  `brand`).
- Cross-pipeline parity between `reuse` and `rebase` (sentinel set +
  structural-HTML counts).

### Fixture

`fixture/content/en/test/{v1,v2,main}/{everything.md,rebased.md}` exercises
every shortcode the framework cares about. The module's CI runs
`make build-fixture && make self-test` and gates on green.

---

## Release process

See [RELEASE.md](./RELEASE.md) for the testing checklist that gates a new
tagged version.
