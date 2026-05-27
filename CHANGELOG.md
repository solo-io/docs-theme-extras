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

## [0.0.2] — 2026-05-26

This release merges the kgateway.dev theme into the shared module, centralizes the sidebar, TOC, breadcrumb, and navbar, and ships two new features: a glossary shortcode and AI-discoverability output formats.

### ⚠️ Breaking changes

**Card class rename.** The `{{< cards >}}` and `{{< card >}}` shortcodes now emit `section-cards` / `section-card` instead of `hextra-cards hextra-cards-grid` / `hextra-card hextra-card-styled`. The inline CSS variable also renamed from `--hextra-cols` to `--section-cards-cols`. Update any consumer CSS, inline `<style>` blocks, or local templates that target the old class names.

**Sidebar breakpoint.** The persistent sidebar now requires a viewport width of ≥ 1280px (`xl`) instead of ≥ 768px (`md`). Tablet-width screens (768–1279px) get the new slide panel instead of a permanently visible sidebar.

**`_partials/` navbar.** `layouts/partials/navbar.html` has been moved to `layouts/_partials/navbar.html` for Hextra v0.12+ precedence compatibility. Any consumer with a local `layouts/partials/navbar.html` override will now be silently shadowed by this version. Move your override to `layouts/_partials/navbar.html`.

### Sidebar

- Replaced the sidebar with a unified mobile-aware implementation shared across kgateway.dev and agentgateway-oss-website.
- At < 1280px, the sidebar becomes a slide-in panel (300ms ease-in-out from the left) triggered by a hamburger button in the breadcrumb row. A semi-transparent overlay closes the panel on tap.
- The panel includes mobile-only section and version chip rows, driven by `site.Params.sections`.
- Sidebar section expand/collapse state is persisted to `localStorage` per branch.
- Section and landing-page sidebar suppression is now derived from `site.Params.sections` rather than hardcoded path prefixes.

### Breadcrumb

- New `layouts/_partials/breadcrumb.html` using Hugo's `$page.Ancestors.Reverse` chain (replaces the old URL-segment approach, which silently no-opped on non-`/docs/<section>/<version>/` URLs).
- Section display name resolves from `site.Params.sections.<name>.title` if set, else `humanize` of the URL segment.
- `.solo-breadcrumb-*` CSS class hooks for consumer overrides.

### TOC

- New `layouts/_partials/toc.html` using regex heading extraction (h2–h4) so headings injected via `{{< rebase >}}` / `{{< reuse >}}` shortcodes are included.
- Styling uses `.solo-toc-*` class names; the outer `<nav class="hextra-toc">` wrapper is preserved for backwards-compatible consumer CSS.

### Navbar

- `layouts/_partials/navbar.html` auto-injects the theme toggle when `site.Params.theme.displayToggle` is true and no menu entry already has `params.type: theme-toggle`, preventing double-toggle rendering.
- Nav height bumped from `h-16` to `h-24`.

### Cards

- `{{< card >}}` and `{{< cards >}}` emit `.section-card` / `.section-cards` markup so manually authored cards and auto-generated child-page cards render identically.
- Card grid extracted into `layouts/partials/auto-section-cards.html`; `layouts/docs/list.html` now delegates to it.
- `cols=N` parameter now sets `--section-cards-cols: N` inline (was `--hextra-cols`).

### Glossary (new)

- `{{< gloss >}}` shortcode renders an inline term tooltip reading from the consumer's `data/glossary.yaml`.
- Tooltip is `position: fixed` to escape `.table-wrapper { overflow-x: auto }` clipping.
- Requires `data/glossary.yaml` in the consumer repo.

### `llms.txt` and Markdown output formats (new)

- `layouts/llms.txt` (root), `layouts/docs/section.llms.txt` (docs-tree), and `layouts/_default/section.llms.txt` (generic fallback) for AI-agent discoverability.
- `layouts/page.markdown.md` and `layouts/section.markdown.md` for `.md` URL access to any page.
- Screen-reader-only `<link>`-style directive (`layouts/_partials/docs-llms-directive.html`) pointing AI agents at the llms and markdown URLs; gated on `themeExtras.outputs`.
- To enable, add `llms` to your `section` outputs and `markdown` to your `page` outputs in `hugo.yaml` / `hugo.toml`.

### Page feedback widget (new)

- `layouts/_partials/components/page-feedback.html` renders a "Was this page helpful?" thumbs-up/down widget.
- Emits a GTM `page_helpful` event on click.
- Set `site.Params.feedback.issueRepo` to an `owner/repo` string to add a GitHub issue link on the thumbs-down path. Omitting the parameter degrades gracefully to a plain thank-you.

### Announcement banner

- `layouts/partials/announcement.html` supports both Hextra's `site.Params.banner.message` and Solo's `site.Data.announcement[].visible` data shape.

### CSS

- **`docs-theme-extras.css`** — consolidated sidebar (`.sidebar-mobile-*`), TOC (`.solo-toc-*`), breadcrumb (`.solo-breadcrumb-*`), navbar dropdowns, `.table-wrapper` responsive tables, and Tailwind 4 `hx:` utility fallbacks.
- **`brand-oss.css`** — Hextra search input chrome (rounded background, focus ring, results popup).
- **`brand-enterprise.css`** — `padding-top` alignment for `.sidebar-nav-wrapper` and `.solo-toc-inner` (`pt-6` for enterprise vs. `pt-2` for OSS).

### Other

- `layouts/partials/utils/page-width.html` — returns a Tailwind max-width class from `Params.width` / `site.Params.page.width`.
- `layouts/_shortcodes/version.html` — path-segment fallback for consumers where URLs are `/docs/<product>/<version>/…` and `folder` is not set in front matter.
- `layouts/partials/copy-markdown.html` — regex tweaks so card links survive `transform.HTMLToMarkdown`.
- Changed the **Copy Codeblocks** button to only copy shell and bash codeblocks, rather than all codeblocks.



## [0.0.1] — Initial release

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
