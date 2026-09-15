---
title: Logo placement
description: >-
  The navbar, sidebar and footer logo slots, and the mobile drawer.
weight: 40
---

Three optional logo slots, each set independently in a consumer's config. The
theme renders whatever each points at — the placements below are convention, not
enforced by the theme.

| Param | Slot | Rendered by |
|---|---|---|
| `params.navbar.logo` | Top navbar (`path`, `dark`, `width`, `height`, `link`) | [`navbar-title.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/navbar-title.html) |
| `params.sidebar.logo` | Desktop sidebar header, and the mobile slide-out drawer | [`sidebar.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/sidebar.html) |
| `params.footer.logo` | Footer (`path`, `dark`) | [`footer.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/footer.html) |

## Common arrangements

- **Product mark in the navbar** (OSS shape): set `navbar.logo` to the product
  lockup and leave `sidebar.logo` unset. The navbar mark then shows at every
  breakpoint.
- **Product in navbar, corporate mark in footer** (enterprise target): set
  `navbar.logo` to the product lockup and `footer.logo` to the corporate (Solo)
  mark, with no `sidebar.logo`.
- **Product in sidebar, corporate mark in navbar** (older enterprise): set
  `navbar.logo` to the corporate mark and `sidebar.logo` to the product lockup.
  Note that this arrangement also changes where the navbar logo *links* — see
  below.

## Where the navbar logo links

`params.navbar.logo.link` sets the destination outright. When it is unset, the
theme picks one based on whether `sidebar.logo` is set, because that is what
distinguishes a product mark from a corporate mark:

| `sidebar.logo` | Navbar mark is | Default link |
|---|---|---|
| unset | the product mark | `.Site.Home.RelPermalink` — this site's own home page |
| set | the Solo corporate mark | `https://www.solo.io/docs` — the docs hub |

The reasoning: a corporate mark in the navbar is not a link back to the product
you are already reading, it is the way out to the wider documentation. A product
mark is the opposite, so it goes home.

> [!NOTE]
> The hub URL is hardcoded in the partial. A consumer that wants a different
> destination, or wants to stop depending on that constant, should set
> `params.navbar.logo.link` explicitly rather than rely on the default.

## The mobile slide-out drawer logo

Below the sidebar breakpoint (`xl`, 1280px) the persistent sidebar becomes the
slide-out drawer, and the theme pins a logo to the top of it — where the navbar
logo would sit, since the open drawer covers the navbar's left region. It uses
`sidebar.logo` if set, otherwise falls back to `navbar.logo`, so a site that only
configures a navbar logo still gets a drawer mark.

Details worth knowing:

- The drawer logo is **centered** and sized by an explicit `height` (28px), not
  `max-height` — the logo SVGs carry only a `viewBox` (no intrinsic
  width/height), which would otherwise collapse a `max-height` image to 0×0.
- The desktop sidebar header logo (`.sidebar-product-logo`) is hidden below `xl`
  (the drawer logo replaces it), so on a site with `sidebar.logo` set you never
  see both at once. It sizes the navbar logo from the `width`/`height` params
  directly, so adjust those to resize it.
- When `sidebar.logo` is set, the navbar logo is desktop-only (the sidebar/drawer
  logo covers mobile); when it is not, the navbar logo shows at all breakpoints.

Nothing here is tied to `docTabs` — logos and tabs are independent features.

---
