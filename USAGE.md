# Usage — moved

The authoring and configuration reference that used to live in this file is now
the docs site:

**<https://solo-io.github.io/docs-theme-extras/>**

Preview it from a clone with `make server-docs`.

| You want | Go to |
|---|---|
| Call form, render hooks, links, gating | [Authoring](https://solo-io.github.io/docs-theme-extras/authoring/) |
| Per-shortcode parameter reference | [Shortcodes](https://solo-io.github.io/docs-theme-extras/authoring/shortcodes/) |
| `params.versions` / `params.sections` contract | [Versions and sections](https://solo-io.github.io/docs-theme-extras/configuration/versions-and-sections/) |
| Version banners, including per-section | [Version banners](https://solo-io.github.io/docs-theme-extras/configuration/version-banners/) |
| Section tabs (`docTabs`) | [Section tabs](https://solo-io.github.io/docs-theme-extras/configuration/section-tabs/) |
| Logo slots and the mobile drawer | [Logo placement](https://solo-io.github.io/docs-theme-extras/configuration/logo/) |
| `themeExtras.*` config keys | [Parameter reference](https://solo-io.github.io/docs-theme-extras/configuration/params/) |
| Pinning the module, `.docs-test.toml`, CI | [Consuming the module](https://solo-io.github.io/docs-theme-extras/consuming/) |
| Running the harness | [Testing](https://solo-io.github.io/docs-theme-extras/testing/) |

Maintainer material — the Hextra files this module shadows, the `# ours`
convention, debugging override precedence, the Hextra upgrade workflow, and the
shortcode comment-header contract — is in [MAINTAINING.md](./MAINTAINING.md).

This stub stays so existing inbound links and the `RELEASE.md` cross-reference
keep resolving. The per-shortcode pages on the site are **generated from the
comment header of each source file**, so the parameter tables cannot drift from
the templates that read them; see
[MAINTAINING.md](./MAINTAINING.md#the-shortcode-header-contract) before editing
one.

> [!NOTE]
> The site is built from `main`, so it can describe a shortcode or parameter no
> released tag ships yet. Check [CHANGELOG.md](./CHANGELOG.md) for the version a
> behavior landed in.
