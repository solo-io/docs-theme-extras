---
title: docs-theme-extras
linkTitle: Docs
description: >-
  A Hugo theme module that overlays Hextra with the shortcodes, partials, and
  CSS shared across Solo's documentation sites.
cascade:
  type: docs
---

`docs-theme-extras` is a Hugo theme module that overlays
[Hextra](https://github.com/imfing/hextra) with the shortcodes, partials, and
CSS shared across Solo's documentation sites, plus a bundled Playwright harness
that any consumer repo can re-run against its own built output.

This site is for people who **use** the module: content authors writing pages
against it, and maintainers wiring it into a consumer repo. Documentation for
changing the module itself stays in the repo, in `MAINTAINING.md` and
`OVERRIDES.md`.

> [!IMPORTANT]
> This site is built from `main`, not from the latest tag. It can describe a
> shortcode or a parameter that no released version ships yet. Check
> [the changelog](https://github.com/solo-io/docs-theme-extras/blob/main/CHANGELOG.md)
> for the version a behavior landed in, and check which version your repo pins.

## Pin the module

A consumer imports the module through `go.mod` and Hextra arrives as a
transitive dependency, so there is one pin to manage, not two.

```toml
# hugo.toml
[module]
  [[module.imports]]
    path = "github.com/solo-io/docs-theme-extras"

[params.themeExtras]
  brand = "oss"   # or "enterprise"
```

```bash
hugo mod get github.com/solo-io/docs-theme-extras@v1.0.0
```

> [!WARNING]
> Never run `hugo mod tidy` to move a pin. It deletes the `require` block
> outright rather than rewriting it. Use `hugo mod get` with an explicit
> version.

The `brand` flag is the only required parameter. It selects which of the two
brand CSS layers loads on top of the component baseline; everything else has a
working default.

## Where to start

- **Writing content against the module** — start with
  [call form](authoring/call-form/), which trips up more people than any single
  shortcode, then browse the shortcode reference.
- **Wiring the module into a repo** — start with pinning the version above, then
  the `.docs-test.toml` contract.
- **Changing the module** — you want the repo, not this site.
