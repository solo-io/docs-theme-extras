---
title: Section tabs
description: >-
  The opt-in docTabs feature that groups a version's top-level sections into tabs.
weight: 20
---

Groups a version's top-level sections into named tabs — for example
**Documentation**, **API Reference**, **Changelog** — so a large version presents
one group of sections at a time instead of one long left nav. It is configured
per site, opt-in, and only affects versions that actually populate two or more
tabs.

Source: [`docs-tabs.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/_partials/docs-tabs.html) (the desktop band
plus the shared state the sidebar reads), [`sidebar.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/sidebar.html)
(the mobile chip row, the per-tab tree panels, and tree scoping),
[`head-end.html`](https://github.com/solo-io/docs-theme-extras/blob/main/layouts/partials/themeExtras/head-end.html) (the mobile
interaction JS), and the `docs-tabs*` / `sidebar-mobile-tab*` rules in
[`docs-theme-extras.css`](https://github.com/solo-io/docs-theme-extras/blob/main/assets/css/docs-theme-extras.css).

## Enabling

Declare the tabs, in display order, under `params.docTabs`. Each tab has a
`name` (the label) and an `id` — the name of a **top-level content directory
under the version root** whose pages that tab owns. Mark one tab as the default;
if none is marked, the first entry is the default.

```toml
[[params.docTabs]]
  name = "Documentation"
  id = "documentation"   # owns content/<…>/<version>/documentation/**
[[params.docTabs]]
  name = "API Reference"
  id = "api"
[[params.docTabs]]
  name = "Changelog"
  id = "changelog"
```

Each tab also takes an optional `hideSidebar` — see
[Hiding the left nav on a tab](#hiding-the-left-nav-on-a-tab-hidesidebar).

The config is version-agnostic — one block per product covers every version.
Tabs render **only for a version that has two or more of these directories
present.** A version with fewer than two tab directories shows its full,
unscoped left nav (the feature is effectively off there), so tabs roll out per
version as you add the directories — no per-version config change is needed.

## Partitioning content into tab directories

A tab **owns every page inside its `id` directory**. Partition a version's
content into one directory per tab:

```
content/en/<product>/<version>/
  documentation/          # default tab
    _index.md
    getting-started/…
  api/                    # "API Reference" tab
    _index.md
    authentication.md
  changelog/              # "Changelog" tab
    _index.md
```

- The **active tab** is the tab whose directory is the current page or an
  ancestor of it (resolved by page relationships, not URL strings, so OSS /
  enterprise / local-dev URL shapes all resolve the same). A page that sits
  above every tab directory — e.g. the version-root landing — falls into the
  default tab.
- The left-nav tree is **rooted inside the active tab's directory**, so the
  directory's own node never appears in the nav (it *is* the tab) and only that tab's pages show.
- Each tab links to its **directory landing** (`_index`).
- A tab whose directory holds only its landing (no child pages) still lists that
  landing in the nav, so a single-page tab stays clickable — this matters on
  mobile, where the drawer chips swap panels client-side rather than navigating,
  so an empty panel would be a dead chip.

> [!NOTE]
> The former front-matter `tab:` key (the v0.1.21 prototype) is no longer read.
> Tab membership is now determined entirely by which `id` directory a page lives
> in.

## Desktop: the tab band

At and above the sidebar breakpoint (`xl`, 1280px) the tabs render as a band
across the top of the content area (`.docs-tabs-band`). The row is centered in
the same page-width container as the content column (`.docs-tabs-inner`), so it
lines up with the sidebar/content rather than the viewport edge. Clicking a tab
navigates to that tab's directory landing.

## Mobile: tabs in the slide-out drawer

Below `xl` the band is hidden and the tabs move into the slide-out sidebar drawer
as a chip row, under a **Contents** heading, directly above the page tree they
scope:

- **Underline style** — the active tab is a brand-colored underline sitting on
  the row's hairline (matching the desktop `.docs-tab` band), so it reads as a
  different kind of control from the outlined version chips above it.
- **Horizontal scroll** — the row scrolls sideways instead of wrapping; `‹`/`›`
  arrows appear only when a tab is off-screen, and tapping a chip centers it.
- **Structure-swap, not navigation** — tapping a tab shows *that tab's link
  structure in place* (client-side), so you can explore a section's topics before
  committing to a page; you then tap a page in the tree to navigate. The desktop
  band still navigates on click — the swap only applies below `xl`.

**Cost:** the structure-swap works by pre-rendering every tab's tree into the
page as hidden panels (`.sidebar-mobile-tree-panel`), so each page in a tabbed
version carries all of that version's tab trees in its HTML. On a version with
large per-tab trees this adds page weight — a deliberate trade for no-navigation
tab switching on mobile.

## Hiding the left nav on a tab (`hideSidebar`)

Not every tab needs a tree. A tab that owns a single page — a one-page changelog,
one generated API reference, a single "what's new" — renders a one-item left nav
next to it, which spends a 16rem column on a link to the page you are already on.
Set `hideSidebar = true` on that tab to drop the nav:

```toml
[[params.docTabs]]
  name = "Documentation"
  id = "documentation"
  default = true
[[params.docTabs]]
  name = "Changelog"
  id = "changelog"
  hideSidebar = true     # no left nav on this tab's pages, desktop only
```

- **Per-tab, not per-site.** The flag applies to the pages the tab owns. The
  other tabs keep their nav, and switching back to one restores it.
- **Desktop only, deliberately.** At and above the sidebar breakpoint (`xl`,
  1280px) the nav is hidden and the article reclaims the column, so the page
  reads wider. **Below `xl` the drawer always renders in full**, because there
  the sidebar *is* the drawer — the only route to the tab chips, the version
  chips, and the other tabs' trees. Hiding it on a phone would leave the reader
  with no way off the page.
- **The tab band stays.** The band is what gets a reader from a nav-less tab back
  to one that has a nav, so it renders as usual.
- **Default is off.** Omit the key (or set `false`) and the tab keeps its nav —
  the behavior of every tab before this flag existed, so adding it changes
  nothing until a tab opts in.

Mechanically, the flag is resolved for the *active* tab and travels on the page
store; `sidebar.html` turns it into a `sidebar-desktop-hidden` class on the
`<aside>`, and a single rule inside `@media (min-width: 1280px)` in
[`docs-theme-extras.css`](https://github.com/solo-io/docs-theme-extras/blob/main/assets/css/docs-theme-extras.css) does the hiding. The
markup is always emitted — that is what keeps the drawer intact — so the suppression
cannot leak below the breakpoint.

> [!NOTE]
> The content column shifts left and widens when the nav is hidden, so clicking
> into a `hideSidebar` tab moves the article. That is the point of the flag (the
> column is reclaimed rather than left blank), but it does mean the text's left
> edge is not in the same place on every tab. The tab band itself does not move.

---
