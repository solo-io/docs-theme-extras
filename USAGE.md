# Usage and customizations: where this module differs from Hugo and Hextra

This file is a reference for content authors and maintainers. It has five parts:

- **[Authoring](#authoring-shortcodes-and-render-behavior)** — the shortcodes and
  render behavior that `docs-theme-extras` adds on top of, or changes from, stock
  [Hugo](https://gohugo.io/) and [Hextra](https://imfing.github.io/hextra/). For
  anything not listed, the Hugo and Hextra defaults apply unchanged.
- **[Section tab navigation](#section-tab-navigation-doctabs)** — the opt-in
  `docTabs` feature that groups a version's top-level sections into tabs, and how
  it behaves on desktop versus in the mobile drawer.
- **[Versions and sections](#versions-and-sections-the-configuration-contract)** —
  the `params.versions` / `params.sections` contract every consumer config must
  follow, in TOML and YAML, and the two shapes that were removed.
- **[Logo placement](#logo-placement)** — the navbar / sidebar / footer logo
  slots, the common arrangements, and the mobile slide-out drawer logo.
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
| `github-yaml` | Fetches a remote YAML file and emits it as a fenced code block, so the caller does not write the fence. Strips the `# yaml-language-server:` editor directive, captions the block with the file name, links `base_url` back to the source directory, and uses a date-stamped cache key so a moving ref refreshes daily. **Percent form only** (`{{%/* github-yaml */%}}`) — it returns a markdown fence, and the angle form would put literal backticks on the page. Prefer `github` inside a hand-written fence for a one-off; use this when you want the directive stripped or the caption. |
| `reuse-append` | Concatenates a base snippet from the assets tree with the shortcode's inner content **as markdown source**, then renders once — so appended table rows join the base table instead of falling out of it. Takes the snippet path as the first positional parameter. Note it is **not** a variant of `reuse`: it applies none of `reuse`'s version- and product-aware rewrites, so keep base snippets used with it free of version-dependent markup. |
| `version` | Emits version-conditional text. Dispatches on the shape of the inner content to stay list-safe and code-fence-safe (see the source comment for the trailing-step, no-markdown, and inline-markdown paths). |
| `version-cards` | Renders a card grid mirroring the navbar version dropdown, for a section landing page. |
| `conditional-text` | Includes or excludes its inner content based on the page's build condition (for example `gme` vs `gmg`), resolved through `utils/page-context`. |
| `upstream` / `downstream` | Content gating for the oss-vs-enterprise build split. `upstream` shows content only in the source build; `downstream` shows it only in the downstream build. |
| `link` | Alias for `link-hextra` — same pattern as `alert`/`callout`. Kept so existing call sites don't need a repo-wide sweep; write new content with either name. |
| `link-hextra` | The canonical implementation. Infers the product and version from the current page's permalink when they are not passed in (typical inside a reused snippet). **See the contract below — it is easy to call wrongly and it fails silently.** |

#### `link` / `link-hextra` contract

It resolves an **internal path within the current product and version tree** into
an absolute URL. That is the whole job. If there is no version to resolve, this
is the wrong tool.

**Parameters — these three, and no others:**

| Param | Required | Meaning |
|---|---|---|
| `path` | yes | Site path **within the version tree**. A leading `/` is added if missing. Not a full URL. |
| `version` | no | Overrides inference. This is what `rebase` injects to retarget a link into another version tree. |
| `product` | no | Enables the enterprise `reference/api` and `reference/cel` routing. Injected by `rebase`. |

```md
{{</* link-hextra path="/quickstart/" */>}}                 → /docs/envoy/2.1.x/quickstart/
{{</* link-hextra path="/reference/api/#TypeA" */>}}        → …/reference/api/#TypeA
{{</* link-hextra path="/quickstart/" version="2.0.x" */>}} → …/2.0.x/quickstart/
```

**What does NOT work:**

| You write | What happens |
|---|---|
| `link=`, `url=`, `href=` | **Not read.** `path` is empty, so it emits the bare version root — usually a real page, so nothing 404s and the wrong link ships. Warns since v0.2.0. |
| An external URL in `path=` | There is nothing to resolve. Use a plain markdown link. |
| A cross-product or cross-flavor path | It only moves *within* one version tree. Use a plain absolute link, e.g. `[Kubernetes](/docs/kubernetes/)`. |
| `path="/page#anchor"` (no slash before `#`) | Emits `/page#anchor`, which takes a 301 before scrolling. Write `/page/#anchor`. |

A missing **leading** slash is added for you (`path="quickstart/"` resolves the
same as `path="/quickstart/"`), a missing **trailing** slash is added for you,
and doubled slashes are collapsed.

Behavior is pinned by `tests/link-hextra-shapes.spec.ts` against
`fixture/content/en/test/v2/link-hextra-shapes.md`, which includes the broken
shapes above so they stay documented rather than rediscovered.

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

# Section tab navigation (`docTabs`)

Groups a version's top-level sections into named tabs — for example
**Documentation**, **API Reference**, **Changelog** — so a large version presents
one group of sections at a time instead of one long left nav. It is configured
per site, opt-in, and only affects versions that actually populate two or more
tabs.

Source: [`docs-tabs.html`](./layouts/_partials/docs-tabs.html) (the desktop band
plus the shared state the sidebar reads), [`sidebar.html`](./layouts/partials/sidebar.html)
(the mobile chip row, the per-tab tree panels, and tree scoping),
[`head-end.html`](./layouts/partials/themeExtras/head-end.html) (the mobile
interaction JS), and the `docs-tabs*` / `sidebar-mobile-tab*` rules in
[`docs-theme-extras.css`](./assets/css/docs-theme-extras.css).

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
[`docs-theme-extras.css`](./assets/css/docs-theme-extras.css) does the hiding. The
markup is always emitted — that is what keeps the drawer intact — so the suppression
cannot leak below the breakpoint.

> [!NOTE]
> The content column shifts left and widens when the nav is hidden, so clicking
> into a `hideSidebar` tab moves the article. That is the point of the flag (the
> column is reclaimed rather than left blank), but it does mean the text's left
> edge is not in the same place on every tab. The tab band itself does not move.

---

# Versions and sections (the configuration contract)

Two params drive every version-aware and section-aware behavior in this module:
the version dropdown and its mobile chips, the section selector, the left nav,
the version banner, `noindex` on superseded versions, the search "other
versions" filter, `{{< version-cards >}}`, `{{< version >}}` gating, and
`link`/`link-hextra` version inference.

**There is exactly one list of versions, and sections are a flat registry of
keys.** Write it the same way in every repo. The shape below is the contract;
the only thing that varies between consumers is TOML versus YAML syntax.

## The pattern

```toml
# hugo-<product>.toml  (solo-io/docs)

# THE version list. Newest first — TOML order is release order, and several
# readers take "the first entry" to mean "the newest version".
[[params.versions]]
  version     = "latest"                        # canonical version
  linkVersion = "latest"                        # URL segment (may differ)
  dropdown    = "2026.8.1 (latest)"             # menu label; whitespace = hidden
  sections    = ["kubernetes", "standalone"]    # which sections ship it

[[params.versions]]
  version     = "2.3.x"
  linkVersion = "2.3.x"
  dropdown    = "2.3.x"
  sections    = ["kubernetes"]

# Section registry, ALPHABETICAL. A section exists because it is a key here.
[params.sections.kubernetes]
[params.sections.standalone]
```

```yaml
# hugo.yaml  (agentgateway.dev, kgateway.dev, kagent.dev)
params:
  versions:
    - version: "1.5.x"
      linkVersion: "main"
      dropdown: "main"
      sections: ["kubernetes", "standalone"]
    - version: "1.4.x"
      linkVersion: "latest"
      dropdown: "1.4 (latest)"
      sections: ["kubernetes", "standalone"]

  sections:
    kubernetes: {}
    standalone: {}
```

An empty table (`[params.sections.x]`) and an empty map (`x: {}`) are the same
thing: registration with no options. That is the normal case.

## Rules

1. **One entry per version, listing every section it applies to** — never one
   entry per section/version pair. `latest` shipping in two sections is a single
   entry tagged with both. Two entries sharing a `linkVersion` is a config error:
   the dropdown would offer the same version twice, and any resolver matching a
   URL segment by `linkVersion` becomes order-dependent.

2. **Tag every entry explicitly, even when the tags are identical** — for a
   product that registers sections at all. A product with no `params.sections`
   has nothing to tag, and leaves `sections` off entirely (that is most of them:
   `agentregistry`, `istio`, `kagent`, `ambientmesh.io`). Where sections do exist,
   omitting `sections` means "every section", which is a live footgun: add a
   section later and every untagged version silently claims to exist there. That is not
   hypothetical — it put `/test/nested/v3/` in a version dropdown for a tree that
   was never built (CHANGELOG [0.2.2]). Explicit tags make it unreachable, and
   they cost nothing: adding them where the sets already match changes no
   rendered output.

3. **Newest first.** With no `main` version, the description lint and the book
   pipeline both read the first entry as "the newest tree".

4. **Register sections alphabetically.** The theme sorts keys itself, so order is
   cosmetic — which is exactly why it should be consistent rather than arbitrary.

5. **A section with no content needs `externalURL`.** `kgateway.dev` registers
   `agentgateway` purely so its selector can point off-site; it has no
   `/docs/agentgateway/` tree, so there is nothing to link to internally:

   ```yaml
   sections:
     agentgateway:
       externalURL: "https://agentgateway.dev/docs/kubernetes/latest/"
     envoy: {}
   ```

   `title` is the other supported key, overriding the label that otherwise comes
   from the section's landing page title.

6. **An imported module's sections come along with its content.** Hugo
   deep-merges an imported module's params into the project's, so a consumer that
   imports a module for its FILES also inherits whatever sections that module
   declares — and an empty table cannot delete a merged key. `solo-io/docs`
   imports `github.com/kgateway-dev/kgateway.dev` for conrefs, snippets, pages,
   images and the glossary in both its `kgateway` and `gateway` products, and so
   inherits that module's `sections.envoy`.

   **Nothing is required of the consumer.** Section detection is by position
   (`utils/section-segment.html`), so an inherited key that matches no
   `/<section>/<version>/` path is inert — including where the same word appears
   as an ordinary content directory, which is the case here
   (`content/en/kgateway/2.3.x/setup/customize/envoy/`). The theme does not report
   it either, because it cannot distinguish an inherited key from a typo'd one:
   Hugo exposes no param provenance to templates.

   If you want the registry to state the truth anyway, stock Hugo
   [config merge control](https://gohugo.io/configuration/introduction/#merge-configuration-from-themes)
   declines the inheritance — `[params.sections]` with `_merge = "none"`.
   Measured on the hub: it changes **zero** bytes of output, so treat it as
   documentation, not a fix.

7. **A registered section should nest its version trees, or set `externalURL`.**
   A section backed only by a landing page still works — its selector entry
   links the landing page, and its `sections` tags still scope version
   dropdowns — but no tree answers `/<section>/<version>/` URLs, which usually
   means a half-done migration. The theme warns (`extras-section-hollow`)
   because that state is otherwise silent: the build stays green and the
   selector looks right. If the scope-only shape is intended, allowlist the
   warning; the bundled fixture's `demo` and `alt` sections use the shape
   deliberately and do exactly that.

   A key with nothing behind it at all (no landing page, no `externalURL`) is
   inert, and deliberately NOT warned about: that is the shape an inherited key
   takes (rule 6), and the theme cannot tell an inherited key from a typo'd
   one.

8. **Sections do not require versions.** A site can ship parallel doc sets with
   no version axis at all, and it registers them exactly as a versioned product
   does — one key per doc set, no `params.versions` anywhere. `kagent.dev` is the
   worked example: `content/kagent/` and `content/kmcp/`, two doc sets, no
   releases to version.

   ```yaml
   params:
     # No params.versions. Registering sections is all a version-less site needs.
     sections:
       kagent:
         icon: icons/nav-kagent.svg   # optional, see below
       kmcp:
         icon: icons/nav-kmcp.svg
     product: "Docs"   # label on the selector button; else it falls back to site.Title
   ```

   Version-less sites get the same three behaviors a versioned one does: the
   navbar section selector, the mobile drawer's section chips, and a left nav
   rooted at the **current** doc set rather than at `site.Home`. That last one is
   the reason to bother — without a section registry the theme roots the tree at
   `site.Home` whenever the home page is `type: docs` (which a `cascade`
   commonly makes true), so every doc set renders on every page, merged.

   Two consequences worth knowing:

   - **Detection is positional, and version-less sites use position ALONE.** A
     section must sit exactly one segment below the docs root — `/<section>/`,
     `/docs/<section>/`, `/<product>/<section>/`, `/<lang>/<section>/`, read off
     `site.Home.RelPermalink`. A versioned site additionally recognizes a section
     directly above a version tree, or as a trailing landing segment; neither
     rule means anything without versions, and the trailing-segment one is
     actively wrong there — it would match any page whose last segment happens to
     share a section's name, at any depth.
   - **A page in no doc set gets no left nav.** Taxonomy terms and any top-level
     directory that is not a registered section have no single tree to show, so
     the nav is suppressed rather than falling back to the merged `site.Home`
     tree. This applies only once 2+ sections are registered; a version-less site
     with no sections (`agentregistry.dev`, `ambientmesh.io`) keeps `site.Home`
     rooting, which is correct there — every page belongs to the one tree.

   Do **not** add a `params.versions` entry to a version-less site to make
   something else work. One entry moves the whole site onto the versioned code
   paths, where a section is only recognized above a version tree — of which
   there are none.

   What a version-less site does *not* get: the version dropdown (there is
   nothing to put in it), and the `extras-section-hollow` warning, which is
   vacuous when there are no versions to nest.

9. **A section may set an `icon`, and it is optional per section.** It appears on
   the navbar selector entry and on the matching mobile chip. The value is
   resolved by `utils/render-icon.html`, the same resolver behind left-nav icons
   and section-card icons, so a section accepts every source the rest of the
   theme does. **First match wins**, in this order:

   | Value | Resolved as |
   | --- | --- |
   | `foo.svg` present under `static/` | inlined with `readFile` |
   | `icons/foo.svg` resolvable in `assets/` | inlined via `resources.Get` |
   | a key in `site.Data.icons` (e.g. `solo`) | Hextra's named-icon partial |
   | anything else (e.g. `rocket_launch`) | a Material Icons ligature |

   `static/` deliberately precedes `assets/`, because every call site resolved
   static first before this was one shared partial, and reordering would change
   which file an existing `icon:` value picks up.

   Two things to know. A value that matches nothing renders as a **Material
   Icons ligature**, which shows the literal string when the font has no glyph
   for it — that is the failure mode for a typo, not a build error. And mixing
   icon'd with icon-less sections in one selector is allowed; entries without an
   icon simply render as text, and a selector where no section sets one is
   byte-for-byte what it was before icons existed.

10. **The selector's BUTTON can name the current section, or carry a fixed
    title, instead of the product name.** By default it shows `params.product`,
    falling back to `site.Title`. That suits a short name, crowds the navbar with
    a long one, and either way never changes as the reader moves around. Two
    keys adjust it, and they compose:

    ```toml
    [params.sectionDropdown]
      showCurrentSection = true   # the button names the section being read
      title = "Docs"              # what it falls back to when none is
    ```

    ```yaml
    params:
      sectionDropdown:
        showCurrentSection: true
        title: Docs
    ```

    `showCurrentSection` is the version dropdown's own behavior applied to
    sections: closed, the control reports where you are, and the menu is the list
    you move with. On docs-hub agentgateway the button reads "Kubernetes" under
    `/kubernetes/` and "Standalone" under `/standalone/`.

    **Set `title` as well if you set `showCurrentSection`.** Pages with no
    current section are normal, not edge cases: a product landing page renders
    the selector with every entry inactive, because the reader is above the
    sections choosing one. Resolution falls through in this order:

    | Page | Button shows |
    | --- | --- |
    | inside a section, `showCurrentSection` set | that section's label |
    | in no section, `title` set | the title |
    | in no section, no title | `params.product`, then `site.Title` |

    Either key is button-only. The menu entries always carry each section's own
    label, so the sections stay named where the reader is choosing between them.
    An empty `title` is treated as unset rather than as a blank button; a bare
    chevron would give the reader nothing to aim at.

    Neither key touches the version dropdown. It drops its own product-name
    prefix whenever a selector renders at all, so it reads a bare "2026.8.1
    (latest)" regardless of what the section button says. That means a product
    registering sections shows its name in the navbar through the sidebar logo
    rather than through either control, which is the intent: two controls side by
    side each prefixed with a long product name is most of the row spent on
    naming.

11. **Do not re-document this in a consumer config.** Point at this file. Every
   repo grew its own explanation of the same rules, and they drifted — one still
   claimed a section carried its own version list a release after that was
   removed. A one-line comment naming this section ages better than a paragraph.

## What NOT to write

```toml
# REMOVED in 0.2.2 — a second, hand-maintained version list per section.
[[params.sections.standalone.versions]]
  version = "latest"
```

Nothing reads it, so it fails silently rather than erroring. It caused four
distinct bugs while it existed: `link`/`link-hextra` dropped the version segment
from 311 hrefs, the search version filter went inert, the `noindex` partial
emitted nothing at all, and the section-link version remap was dead code for a
release. Move those versions into `params.versions` and tag them.

```toml
# INERT on a same-product entry — every reader constructs the href instead,
# which is what preserves the reader's current page across a version switch.
[[params.versions]]
  url = "https://docs.solo.io/agentgateway/latest"
```

Another product's versions go in `params.relatedDocs`, which is the one place a
version URL is written by hand.

## Where the rules live in code

| Behavior | File |
| -------- | ---- |
| Is this URL segment a section? | `utils/section-segment.html` |
| Which versions apply to a section? | `utils/resolve-section-versions.html` |
| Which entry does this URL segment match? | `utils/match-version-entry.html` |
| What section/version is this page in? | `utils/version-root.html` |
| The section selector's items | `utils/resolve-sections.html` |
| Other products' version groups | `utils/resolve-related-docs.html` |

Read config through these rather than reaching into `site.Params` directly.
`tests/link-hextra-shapes.spec.ts` fails the build if any template reads a
per-section versions list again.

---

# Logo placement

Three optional logo slots, each set independently in a consumer's config. The
theme renders whatever each points at — the placements below are convention, not
enforced by the theme.

| Param | Slot | Rendered by |
|---|---|---|
| `params.navbar.logo` | Top navbar (`path`, `dark`, `width`, `height`, `link`) | [`navbar-title.html`](./layouts/partials/navbar-title.html) |
| `params.sidebar.logo` | Desktop sidebar header, and the mobile slide-out drawer | [`sidebar.html`](./layouts/partials/sidebar.html) |
| `params.footer.logo` | Footer (`path`, `dark`) | [`footer.html`](./layouts/partials/footer.html) |

## Common arrangements

- **Product mark in the navbar** (OSS shape): set `navbar.logo` to the product
  lockup and leave `sidebar.logo` unset. The navbar mark then shows at every
  breakpoint.
- **Product in navbar, corporate mark in footer** (enterprise target): set
  `navbar.logo` to the product lockup and `footer.logo` to the corporate (Solo)
  mark, with no `sidebar.logo`.
- **Product in sidebar, corporate mark in navbar** (older enterprise): set
  `navbar.logo` to the corporate mark and `sidebar.logo` to the product lockup.

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

## Extension slots — override these instead of forking a docs layout

**If you are about to copy `layouts/docs/single.html` or `layouts/docs/list.html`
into your repo, read this first.** Almost certainly you want a slot.

Both OSS consumers used to fork those layouts, each for two or three injected
lines. The cost is invisible and cumulative: a forked layout stops receiving
everything the module adds afterwards. Measured, when kgateway.dev's forks were
finally removed, the site gained a visible page subtitle on **856 pages** it had
silently been missing, plus `components/page-context-menu`, the
`displayPagination` config guard, `version-banner` and the `page-badges`
contract. Nothing was broken; the features simply never arrived.

Five partials exist purely so you do not have to fork. Each one defaults to
today's exact output, so adding them changed **0 of 770** built HTML pages on
the docs hub.

| Slot | Renders | Default |
|---|---|---|
| `partials/docs/chrome-top.html` | very top of the page, above the tab band | the announcement banner, and only when one is configured |
| `partials/docs/chrome-bottom.html` | very bottom, after the content wrapper closes | nothing |
| `partials/docs/width-class.html` | max-width class on the page wrapper | `hextra-max-page-width` (100%) |
| `partials/docs/content-class.html` | width + padding classes on `<main id="content">` | `hextra-max-content-width hx:px-6 hx:pt-6 hx:md:px-12` |
| `partials/docs/after-title.html` | inside `.content`, after the title and description | nothing — **detail pages only**, not section indexes |

Two things to get right:

- **Path is `layouts/partials/docs/…`, not `layouts/_partials/docs/…`.** This
  module keeps these under `partials/`, matching the existing `partials/docs/`
  directory. An override in the wrong tree is silently ignored — no error, it
  just never runs.
- **Do not call a slot from its own override.** Your file wins the lookup, so
  `{{ partial "docs/chrome-top.html" . }}` inside your `chrome-top.html` is
  infinite recursion. To keep the default banner, call it by its own name:

  ```gotemplate
  {{ partial "docs/announcement-banner.html" . }}
  {{ partial "my-custom-nav.html" . }}
  ```

Worked example — the whole of agentgateway.dev's `chrome-top.html`, which
replaced two forked layouts:

```gotemplate
<style>.nav-container { display: none !important; }</style>
{{ partial "nav.html" . }}
<div class="w-full z-10 pt-10 lg:pt-20">
  {{ partial "docs/announcement-banner.html" . }}
</div>
```

`npm run scan:overrides` reports slot overrides separately from same-path
shadows, because a slot override is the mechanism working and a layout fork is a
defect. Do not "fix" a rising slot count.

### What still needs a real layout

A slot is for injecting chrome, not for restructuring the page. If one page
needs a genuinely different layout — kgateway.dev's `/docs/envoy/` landing hides
the sidebar and TOC entirely — give it its own layout file and select it from
front matter (`layout: landing` → `layouts/docs/landing.html`). Branching inside
a forked `list.html` on a hardcoded path, which is what that site did, holds
every other section index hostage to one page.

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
