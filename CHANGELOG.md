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

**Writing entries.** Each entry must answer **why** the change was made, not just what
changed — lead with the problem or motivation (the bug, the missing behavior, the failure
mode) so a future reader understands the reason without digging through the diff. Each entry
must also link to a production page that shows the bug or the fix (for additive features with
no single defect page, link a representative page where the new behavior is observable and say
how to verify it, e.g. view-source or a validator). State how the change was verified.

---

## [0.2.2] — 2026-08-24

> **Pin provenance.** `v0.2.2-beta.3` (2026-08-21), which consumers currently pin, predates part of
> this section: the two version-less entries below ("sections no longer require versions" and "a
> section can carry an `icon`"), the second flat fixture build, and the reworded
> `extras-section-hollow` message all ship after beta.3. Everything else in this section is in the
> beta.

### BREAKING — one tagged versions list replaces per-section version lists

**Migration is required.** A consumer that declares versions under
`params.sections.<name>.versions` must move them into the single `params.versions` list, and tag an
entry with `sections` when it does not apply to every section. Registering the section itself is
unchanged: a section still exists because it is a key under `params.sections`, and an empty table is
still how you declare one. Only the `.versions` sub-key is gone.

```toml
# BEFORE — two shapes for one concept, and a second list to keep in step by hand
[params.sections.kubernetes]                       # empty = "inherit the top-level list"
[[params.sections.standalone.versions]]            # its own list = "just these"
  version = "latest"
  linkVersion = "latest"

# AFTER — one list; each entry names the sections it applies to
[[params.versions]]
  version = "latest"
  linkVersion = "latest"
  sections = ["kubernetes", "standalone"]          # omit `sections` for "every section"

[[params.versions]]
  version = "2.3.x"
  linkVersion = "2.3.x"
  sections = ["kubernetes"]

[params.sections.kubernetes]                       # registry only, no versions
[params.sections.standalone]
```

Rules, in full:

- **One entry per version, listing every section it applies to** — not one entry per
  section/version pair. agentgateway ships `latest` in both kubernetes and standalone; that is a
  single entry tagged with both. Two entries must never share a `linkVersion`.
- **No `sections` field means every section.** For a product with one tree (the docs hub's
  kgateway, gloo-mesh-*, istio) nothing changes: no tags, no registry, no edit.
- **Filtering applies only to a REGISTERED section.** `""` or any unregistered string returns every
  entry. This is load-bearing, not defensive: callers pass a string that is only sometimes a
  section — `version-cards.html` defaults to the last URL segment, and `version-root.html` passes
  the PRODUCT segment for an enterprise page with no section segment. Treating an unregistered
  string as a filter would silently reduce both to "untagged entries only", emptying the docs hub
  version dropdown the moment a product tagged its versions.

**Why this is worth a breaking change.** `reuse.html`, `rebase.html`, `flexsearch.js`, the version
banner and the noindex partial all read `site.Params.versions` directly. A version that existed only
in a per-section list was invisible to every one of them — and that is not hypothetical, it is the
single shared cause of four shipped bugs:

| reader | forgot the second list | consequence |
| --- | --- | --- |
| `resolve-link.html` | yes | 311 hrefs on agentgateway.dev lost their version segment (v0.2.1) |
| `flexsearch.js` | yes | `visibleVersions` empty, so the search version filter was silently inert |
| `version-noindex.html` | yes | partial wholly inert on agentgateway.dev — no robots meta at all |
| `warn-missing-description.html` | no | the only one of the four that walked both |

Tagging the one list makes that class of bug unrepresentable rather than fixed once per reader. It
also removes an asymmetry nobody could read: the same concept was spelled two different ways
depending on whether a section's versions happened to match the product's.

**A capability is deliberately dropped.** A per-section list could relabel the same version per
section; one entry carries one label. No consumer used it — agentgateway-oss and kgateway-oss used
per-section lists purely to say WHICH versions a section has, which is exactly what a tag expresses.
The fixture did use it, and those assertions were rewritten.

### BREAKING — other products' versions move out of `params.versions` into `params.relatedDocs`

A version dropdown may list OTHER products' versions. Until now those lived in
`params.versions` as ordinary entries, told apart only by a `product` that differed from
`currentProduct`, and carrying an absolute `url` that three readers used instead of building an
href. Two different things shared one list, and it caused four separate problems:

1. **Duplicate `linkVersion`s collided.** `hugo-gateway.toml` carried Gloo Gateway
   1.22.x–1.19.x *and* Gloo Edge 1.22.x–1.19.x — the same four slugs twice. Any resolver
   matching a URL segment on `linkVersion` alone was order-dependent, and picking Edge's entry
   removed the version banner from every Gloo Gateway version page, since the Edge entries set
   no `banner`. See <https://docs.solo.io/gateway/1.21.x/> — the "If you are interested in
   trying out Gloo Gateway with the Kubernetes Gateway API…" notice at the top of the page is
   the banner in question.
2. **Phantom versions leaked into every other reader.** `flexsearch.js`'s `visibleVersions`,
   `utils/version-noindex.html`, `version-banner.html` and `reuse`/`rebase`'s version remap all
   iterate `site.Params.versions`, so they treated another product's versions as this product's.
   On docs-hub kgateway the search filter held **11** version slugs — 8 of them Gloo
   Gateway's and Gloo Edge's, 4 of those duplicated — where only 3 exist. Verify at
   <https://docs.solo.io/kgateway/2.3.x/>: the `en.search.min.<hash>.js` bundle it loads
   contains a `new Set(JSON.parse('[…]'))` whose array is that list. After this change it is
   exactly `["2.3.x","2.2.x","2.1.x"]`.
3. **`url` was read on 20 of ~80 entries, and inert on the rest.** For a same-product entry all
   three readers *construct* the href, which is what preserves the reader's current page across
   a version switch. Being unread, the other ~60 went stale invisibly: agentgateway's still said
   `/agentgateway/latest` after its docs moved under `/agentgateway/<mode>/latest`. Verify on
   <https://docs.solo.io/kgateway/2.3.x/>: the config gives kgateway's own 2.3.x entry
   `url = "https://docs.solo.io/kgateway/2.3.x"`, but the rendered dropdown link is the
   relative `/kgateway/2.3.x/` — the field is demonstrably not the source. The cross-product
   links on the same page render byte-identical to their `url`, including the `v` in Gloo Edge's
   `/gloo-edge/v1.19.x`, which no construction rule would produce.
4. **`assemble-assets.py` demanded fields these entries cannot have.** It exits unless every
   `params.versions` entry has `version`, `ossDir` and `ossBranch`; another product's docs have
   no OSS worktree here, so cross-product entries have none of them. Only agentgateway is in
   `ASSEMBLED_PRODUCTS` today, so nothing failed — but kgateway joining it would have broken the
   build for that reason alone.

**Migration.** Move each cross-product entry into a `params.relatedDocs` group. Delete `url`
from your own entries; it was never read.

```toml
# BEFORE — one list, two meanings, distinguished by `product`
[[params.versions]]
  version = "2.3.x"
  linkVersion = "2.3.x"
  product = "kgateway"                             # == currentProduct
  url = "https://docs.solo.io/kgateway/2.3.x"      # never read
[[params.versions]]
  version = "1.21.x"
  linkVersion = "1.21.x"
  product = "gateway"                              # != currentProduct
  productName = "Gloo Gateway (K8s GW API)"
  url = "https://docs.solo.io/gateway/1.21.x"      # read

# AFTER — params.versions is only ever THIS product
[[params.versions]]
  version = "2.3.x"
  linkVersion = "2.3.x"
  product = "kgateway"
  productName = "Solo Enterprise for kgateway"     # the dropdown group header

[[params.relatedDocs]]
  productName = "Gloo Gateway (K8s GW API)"
  # position = "before"        # optional; "after" is the default
  [[params.relatedDocs.versions]]
    label = "1.21.x"
    url = "https://docs.solo.io/gateway/1.21.x"
```

Rules:

- **Order is TOML order.** Groups on the same side render in declaration order, and versions
  inside a group render in declaration order. To reorder the dropdown, move the blocks — there
  is no `weight`.
- **`position` picks the side**, and `"after"` is the default. It exists because TOML order is
  the one thing two separate keys cannot express: which side of your own versions a group sits
  on. Only `hugo-gateway.toml` needs `"before"` (Gloo Gateway is the older Kubernetes Gateway
  API product, and its dropdown deliberately lists kgateway above its own versions).
- **`productName` stays on `params.versions` entries.** It labels this product's dropdown group
  and is also the i18n context for `banner`/`bannerID`. Do not replace it with
  `params.product`: gloo-mesh-enterprise sets `product = "Gloo Mesh Enterprise"` but labels the
  group `"Gloo Mesh (Gloo Platform APIs)"`.
- **A whitespace `label` hides a related version**, matching what a whitespace `dropdown` does
  for your own versions. A *missing* `label` key is a config error and warns
  (`extras-relateddocs-nolabel`), as does a group with no `versions`
  (`extras-relateddocs-empty`) and a version with no `url` (`extras-relateddocs-nourl`).
- **Group headers are now explicit**, one per declared group. They used to be derived by
  watching `productName` change between consecutive entries, which emitted a duplicate header
  for any product whose entries were not contiguous.
- **Related products are not rendered as cards.** `version-cards` answers "which version of
  *this* product," so its cross-product branch was dropped; it never ran anywhere, since the
  only consumers of that shortcode have no related products.

Verified: the migrated `hugo-kgateway.toml` and `hugo-gateway.toml` reproduce the live
dropdowns exactly — same group headers, same order, same hrefs, `/gloo-edge/v1.19.x` quirk
included — and the Gloo Gateway banner is present again on `/gateway/1.21.x/`. 13 new
assertions in `tests/related-docs.spec.ts` cover both sides, two groups sharing a side, order
within a group, the three skip rules, and desktop/mobile parity. docs-hub kgateway 5442 pages,
gateway built clean, agentgateway-oss-website and kgateway-oss unchanged at 5442 and 2836 pages.

### Add — a product-name section selector in the navbar, and the product name leaves the version dropdown (`layouts/_partials/utils/resolve-sections.html`)

A product with parallel doc sets had no way to switch between them except the URL.
agentgateway-oss-website solved it with a "Docs" navbar dropdown holding two hardcoded
`<a>` tags; this is the same idea, generalised: a dropdown labelled with the PRODUCT name,
listing every registered section, driven by `utils/resolve-sections.html`.

```
navbar:   [ Solo Enterprise for agentgateway ▾ ]  [ 2026.8.0 (latest) ▾ ]
                 Kubernetes                            2026.8.0 (latest)
                 Standalone                            2026.7.1 (LTS)
                                                       2.3.x
```

The product name is REMOVED from the version dropdown — both the button prefix and the
in-menu group header — whenever the selector is rendering it, since showing it twice reads
"Solo Enterprise for agentgateway | Solo Enterprise for agentgateway - 2026.8.0 (latest)".
Related-product group headers are untouched: those name OTHER products, which the selector
does not cover.

**Nothing changes for a product without sections.** `utils/resolve-sections.html` returns an
empty slice when `params.sections` is unset, and the selector is suppressed below two
sections, so the other eight hub products and both OSS sites render exactly as before —
version dropdown with its product-name prefix intact. Verify on
<https://docs.solo.io/kgateway/2.3.x/>, whose dropdown button reads "Solo Enterprise for
kgateway - 2.3.x (latest)" and must keep reading that.

This also fixes two defects in the mobile section row that already existed in
`sidebar.html`, which is now the drawer counterpart of the same resolver:

- **It never rendered on the docs hub.** Hrefs were built as a literal
  `/docs/<section>/<version>/`, so the row was gated on `$isOSSShape`. The hub serves
  sections at `/<product>/<section>/…` and `/<section>/…`, so it was excluded outright.
  Hrefs now come from the section landing page's own `.RelPermalink` via `site.GetPage`,
  which is correct in all three shapes without the partial knowing which one it is.
- **Its version remap was dead code.** Section version sets diverge — agentgateway's
  kubernetes section ships 2.3.x and 2026.7.1 while standalone ships only latest — so a
  link to another section cannot reuse the current version verbatim. The remap read
  `$cfg.versions`, i.e. `site.Params.sections.<key>.versions`, which THIS release removes.
  It had therefore been nil-guarded into a no-op since the migration, sending every chip to
  the current version whether or not it existed in the target section.

  That survived the migration sweep because the lookup was split across two statements
  (`$cfg := index site.Params.sections .`, then `$cfg.versions`), which the repo-wide guard
  in `tests/link-hextra-shapes.spec.ts` matched as a single expression and could not see.
  The guard now detects the split form exactly — it collects variables assigned from the
  registry and checks whether each is used with `.versions` — rather than by a looser
  pattern, which would have flagged the legitimate `title` and `externalURL` reads and got
  itself deleted instead of fixed. Confirmed by planting the old shape in a probe file and
  watching the guard fail, then removing it.

A section with neither a landing page nor an `externalURL` is left out and warns
(`extras-section-no-target`) rather than emitting a dead menu entry.

Verified: 10 assertions in `tests/section-selector.spec.ts`, covering the product-name
label, the de-duplication, both remap directions plus a no-remap control, the active
marker, and navbar/drawer parity. The fixture gained a second section landing page
(`fixture/content/en/test/alt/`) because with one section there is nothing to select and
the selector correctly renders nothing.

### Add — `extras-section-hollow`: the section registry now says when it disagrees with the content tree (`layouts/_partials/utils/resolve-sections.html`)

- **Why.** The registry is hand-maintained config, and when it disagrees with content it fails
  silently. Two instances during this release:
  - Deleting `params.sections` from `agentgateway.dev` removed the section switcher from every docs
    page. The build stayed green and warned about nothing, because that site's own `nav.html` reads
    the section from URL *position* and the sidebar resolves through the
    `/docs/<section>/<version>/` shape — only the switcher depends on the registry, so losing it
    looks like nothing.
  - `solo-io/docs` does not define `params.sections` for `kgateway` or `gateway`. It **inherits**
    `sections.envoy` from `github.com/kgateway-dev/kgateway.dev`, which both products import for
    conrefs, snippets, pages, images and the glossary — Hugo deep-merges an imported module's params
    along with its content. The hub serves that content flat at `/<product>/<version>/`, so there is
    no `/kgateway/envoy/` tree and never should be.
- **What it does.** Warns when a registered section HAS a landing page but nests no version tree and
  sets no `externalURL` — a half-done registration on content this site demonstrably owns. A key with
  no landing page at all is deliberately NOT reported: that is the shape an inherited key takes, and
  the theme cannot tell an inherited key from a typo'd one, because Hugo merges an imported module's
  params before templates run and exposes no provenance (`hugo.Modules` does not exist — it errors
  with "can't evaluate field Modules"). The cost, accepted: a section key naming nothing anywhere is
  caught only when the product has 2+ other sections that do resolve, via `extras-section-no-target`
  — the same blind spot already documented there. Default content language only,
  matching the neighbouring no-target warning: a section whose tree exists in English but not in a
  translation is a translation gap, not a config error.
- **The message says what keeps working (reworded after beta.3).** The beta.3 wording called the key
  "inert: nothing to select between" — false for exactly the shape the warning fires on, since a
  landing-backed section still renders in the selector (its entry links the landing page) and its
  `sections` tags still scope version dropdowns. The message now states that, names the three real
  remedies (nest the trees, set `externalURL`, or allowlist `extras-section-hollow` when the
  scope-only shape is intended), and its first clause is unchanged so existing allowlist regexes
  keep matching. USAGE.md rule 7 was corrected to match.
- **The remedy is stock Hugo, not a theme flag.** An empty table cannot delete a merged key, so the
  six affected hub configs now decline the inheritance with `[params.sections]` + `_merge = "none"`.
  Verified that Hugo consumes `_merge` as a directive rather than exposing it as a section key: the
  hub `kgateway` build reports zero registered sections.
  - An earlier draft added a theme-level `ignore = true` per section instead. It was removed before
    release: `_merge` already covers both directions (no sections of your own, or your own plus a
    module's), it is one mechanism rather than two, and registering an `envoy` section in a Gloo
    Gateway config in order to neutralize it describes an import accident as though it were a product
    fact.
- **Verified.** All eight hub products build with zero non-description warnings — `kgateway` and
  `gateway` previously reported the inherited-`envoy` warning. `agentgateway.dev`, `kgateway.dev` and
  `kagent.dev` build clean. The fixture's `demo` and `alt` sections trip the warning deliberately
  (they pin the registered-without-nesting fallback) and are allowlisted in
  `fixture/.docs-test-*.toml`, so the warning firing on a real consumer is not confused with the
  fixture's own shape.

### Add — sections no longer require versions, so a version-less site can ship parallel doc sets (`layouts/_partials/utils/section-segment.html`, `layouts/partials/sidebar.html`, `layouts/_partials/navbar.html`)

- **Why.** `kagent.dev` ships two parallel doc sets — `content/kagent/` and `content/kmcp/` — with no
  version axis, because there are no release trains to version. That is exactly the shape
  `params.sections` models, but registering them did nothing: the selector was resolved *inside*
  navbar.html's `with $navVersions` block, so a site with no `params.versions` got no selector, and
  `utils/resolve-sections.html` never ran there at all. So the repo carried an 88-line
  `layouts/_partials/sidebar.html` that replaced the theme's sidebar wholesale, purely to root the
  tree at the current doc set. The cost of that shadow was everything else the theme's sidebar does:
  landing-page suppression, the mobile overlay, the sidebar logo, the `showOnLanding` opt-in.
  Without it, extras roots the version-less tree at `site.Home` whenever the home page is
  `type: docs` — which a `cascade` commonly makes true — so every page showed BOTH doc sets merged:
  **202 links per page instead of the 158 / 40 that belong there.**
- **What it does.** A registered section is now recognized on a site with no `params.versions`,
  positionally: exactly one segment below the docs root, read off `site.Home.RelPermalink` so it
  absorbs a baseURL subpath (`/docs/`), a per-product hub baseURL and a language prefix without
  knowing which it is looking at. Such a site gets the navbar section selector, the mobile drawer's
  section chips, and a left nav rooted at the current doc set. It does not get a version dropdown
  (nothing to put in it) or the `extras-section-hollow` warning (vacuous with no versions to nest).
- **A version-less site uses the positional rule ALONE, and that is a fix, not a simplification.**
  The pre-existing condition (b) accepts "last path segment, and no version precedes it". On a
  versioned site the second half carries the weight — nearly every content page sits under a version,
  so a trailing segment that happens to share a section's name is rejected. Remove versions and
  *nothing* ever has a version before it, so (b) started matching a registered name as a section at
  any depth purely for being last. Caught by a fixture page at `/docs/topics/alpha/`, where `topics`
  is not a section and `alpha` is: it resolved to section `alpha` and rendered the alpha tree on a
  page belonging to neither doc set. Condition (a) is likewise vacuous with no versions. So the
  positional test is the only meaningful one, and applying it alone is both simpler and tighter.
- **A page in no doc set now gets no left nav.** Taxonomy terms and any top-level directory that is
  not a registered section have no single tree to show, and the `site.Home` default renders every doc
  set merged — a bare `/docs/tags/` page grew a 101-link tree spanning both of kagent's. Suppressed
  instead, matching what the versioned path already does for a page above the version trees. Gated on
  2+ registered sections, so a version-less site with none (`agentregistry.dev`, `ambientmesh.io`)
  keeps the `site.Home` rooting it has always had — correct there, since every page belongs to the
  one tree.
- **Internal.** The section dropdown moved to `_partials/components/section-dropdown.html` and the
  mobile chip row to `_partials/components/sidebar-section-row.html`. Both are now needed on two
  sides of a scope boundary, and duplicating them across those call sites is how the chips and the
  dropdown drifted apart last time. Both live in the SAME partial root deliberately: Hextra v0.12+
  resolves `_partials/` over `partials/`, so splitting a feature across the two roots leaves one
  half silently shadowable by a future same-path file.
- **Verify in production.** Once `kagent.dev` picks this up:
  <https://kagent.dev/docs/kagent/concepts/agents/> — the navbar doc-set menu is
  `div.section-dropdown` rendered by the theme, not the Hextra `hextra-nav-menu-toggle` the
  hand-rolled `menu.main` children produced; and the left nav lists only `kagent` pages (79 links),
  with no `/docs/kmcp/` entries. Compare <https://kagent.dev/docs/kmcp/deploy/server/>, which lists
  only the 20 `kmcp` pages. <https://kagent.dev/docs/tags/> renders an empty `<aside>` with no
  `<nav class="sidebar-nav">` at all.
- **How it was verified.** TWO flat fixture builds (`make build-flat`), one per half of the
  positional test in `utils/section-segment.html`, since no existing fixture could reach these
  paths and each build can only ever reach its own half: `hugo-flat.toml` puts the docs root in the
  baseURL (kagent.dev's real shape — `baseURL "https://kagent.dev/docs/"` — the primary rule), and
  `hugo-flat-root.toml` puts it in a content directory literally named `docs/` below a marketing
  home at `/` (the `docs`-alternative rule). `tests/section-versionless.spec.ts` runs its
  assertions against both builds — 62 tests, and the two builds mount the same content so their
  rendered hrefs are identical by construction. Six probes were run; two exposed real bugs rather
  than test gaps (the condition-(b) hole above, and the merged tree on orphan pages), and one
  showed an assertion was vacuous: a collision directory *below* a section cannot discriminate
  positional from match-anywhere detection, because the resolver stops at its first match either
  way. That test is kept for the ordering it does cover, with the limitation recorded, and a
  discriminating case was added beside it. End-to-end: kagent.dev's working tree built against this
  layer via a temporary local `replace` — 240 pages, no section warnings, selector and chips
  render with both doc sets, the kagent sidebar carries zero `/docs/kmcp/` links, both landings
  keep their nav, and `/docs/tags/` and the docs index render none. Regression: **32,531 built
  files byte-identical** across all eight `solo-io/docs` products (including multilingual
  `agentgateway` and the products that *inherit* `sections.envoy` from an imported module),
  `agentgateway.dev`, `kgateway.dev`, and the two other version-less consumers `agentregistry.dev`
  and `ambientmesh.io`. Both fixture brands after the second build landed: 2012 passed, 17 skipped
  each.

### Add — a section can carry an `icon` (`layouts/_partials/utils/render-icon.html`, `layouts/_partials/utils/resolve-sections.html`)

- **Why.** `kagent.dev`'s hand-rolled `menu.main` doc-set dropdown showed a product mark next to each
  entry, inlined from `assets/icons/nav-<name>.svg`. Moving to the theme's section selector would have
  dropped them, because `utils/resolve-sections.html` returned no icon and neither selector component
  rendered one — a visible regression as the price of using the shared component.
- **What it does.** `params.sections.<key>.icon` is emitted on the navbar selector entry and on the
  matching mobile chip. Optional per section: entries without one render as text, and a selector where
  no section sets an icon is byte-for-byte what it was before — which is every current consumer, since
  none set one. The label is wrapped in `.section-dropdown-label` only when an icon is present, so no
  empty wrapper appears in the no-icon markup and no flex gap is introduced.
- **A shared resolver, and a NEW icon source.** The four-way resolution (`static/` svg → `assets/` svg
  → `site.Data.icons` name → Material Icons ligature) is now one partial,
  `utils/render-icon.html`, replacing three near-identical inline copies in `partials/sidebar.html`
  (twice) and `partials/auto-section-cards.html`. The `assets/` branch is new: it exists so a consumer
  can keep product marks in `assets/` instead of moving them into `static/`. `static/` deliberately
  stays FIRST, since all three copies resolved it first and reordering would change which file an
  existing `icon:` value picks up. `layouts/_shortcodes/card.html` was left alone: it is a two-branch
  variant that calls Hextra's `utils/icon.html` UNGUARDED, and since that partial calls `errorf` on an
  unknown name, one bad `icon=` there fails the build. The hub already filters card icons through an
  allowlist, and widening this into shortcodes is separate work.
- **Two details the extraction nearly lost, both caught by byte-diff rather than by review.** The
  sidebar's inlined SVGs carry an extra `sidebar-icon-svg` hook its other branches do not, so the
  partial takes an optional `svgClass`; without it every SVG icon in the left nav was silently
  restyled. And the ligature branch keeps `material-icons` ahead of the caller's class, which is what
  makes it render as a glyph rather than as the literal word.
- **Verify in production.** Once `kagent.dev` picks this up:
  <https://kagent.dev/docs/kagent/concepts/agents/> — each entry in the navbar doc-set menu carries an
  inline `<svg class="section-dropdown-icon">` from `assets/icons/nav-kagent.svg` /
  `nav-kmcp.svg`. Compare <https://agentgateway.dev/docs/kubernetes/latest/> — its sections set no
  icon, so its selector entries have no `section-dropdown-icon` and no `section-dropdown-label`
  wrapper at all.
- **How it was verified.** Coverage went from one icon source to four. Before this, the ONLY icon
  value anywhere in the fixture was a single `icon: rocket_launch` page — so the `static/` and
  `site.Data.icons` branches had no coverage at all, despite running for every left-nav and
  section-card icon. The version-less fixture now registers one section per branch, and its two SVGs
  carry `data-fixture-icon` attributes so a test can assert WHICH branch produced the markup rather
  than just that an `<svg>` appeared — without that, three of the four branches are
  indistinguishable and a resolution-order bug passes silently. Resolution order and the
  `site.Data.icons` guard are additionally pinned at source level, since covering them behaviorally
  would need a fixture shipping a deliberate same-name duplicate. Four probes, all confirmed failing.
  Regression: **32,868 built files byte-identical** across all eight `solo-io/docs` products,
  `agentgateway.dev`, `kgateway.dev`, `agentregistry.dev` and `ambientmesh.io`. Both fixture brands:
  1981 passed, 17 skipped.

### Fix — a section is detected by POSITION, not just by name (`layouts/_partials/utils/section-segment.html`)

- **Why.** Detection matched a registered section key **anywhere** in a page's path. So any ordinary
  content directory that happened to share a section's name was read as a section:
  `version-root.html` built `lookupPath = "/<key>/<version>/"`, `site.GetPage` resolved a tree
  unrelated to the page (or nothing at all), and the left nav came out wrong or **completely empty** —
  with no error and no warning, so it reads as a content problem rather than a template one.
- **The real instance, and why it matters for this release.** `solo-io/docs` imports
  `github.com/kgateway-dev/kgateway.dev` for CONTENT — conrefs, snippets, pages, images, glossary —
  and therefore inherits its `sections.envoy` key, because Hugo deep-merges an imported module's
  params along with its content. The hub also ships
  `content/en/kgateway/{2.3.x,2.2.x}/setup/customize/envoy/`: **five real pages**, every one of which
  rendered with an empty left nav (0 links, against 281 on a sibling page). Production is unaffected
  only because it pins `v0.2.0`, which has no `section-segment.html` at all — section detection is new
  in this release, so this would have shipped with it.
- **What changed.** A registered key is the section segment only where a section can legitimately sit:
  - the next segment is a version (`/<section>/<version>/…`), or
  - it is the last segment and **no version precedes it** — the section landing page.

  The second condition needs both halves. Accepting "last segment" alone fixes the leaf pages and
  breaks the directory index: `/kgateway/2.3.x/setup/customize/envoy/` would read as a section landing
  page and have its nav *suppressed*, trading an empty nav for a missing one on the same pages. A
  section sits ABOVE version trees, never below one.
- **No consumer config is required.** An earlier draft had the six affected hub configs declare
  `[params.sections]` + `_merge = "none"` to decline the inheritance. Measured against the fixed
  theme, that changes **zero** bytes of output — the fix is entirely in the theme, so the configs were
  reverted rather than carrying a line that reads like a fix and is not one.
- **Verified.** All five hub `envoy` pages regain their full nav (281 links on 2.3.x, 259 on 2.2.x)
  with `_merge` REMOVED, proving the theme fix stands alone. All eight hub products build with zero
  non-description warnings; `agentgateway.dev` (285 nav links, both section chips),
  `kgateway.dev` (240 links, external chip intact) and `kagent.dev` unchanged. Fixture probe
  `/test/v2/nested/` — a content directory named after the registered `nested` section — is pinned by
  four assertions, probe-verified to fail without the position constraint. `make test-oss` and
  `make test-enterprise` both report 1950 passed / 17 skipped.

### Fix — section landing pages suppress the left nav in every URL shape, not just the OSS one (`layouts/partials/sidebar.html`)

A section landing page is the "pick a version / deployment type" splash that sits ABOVE the
version trees, so there is no single tree for a left nav to show. `sidebar.html` has suppressed
the nav on those pages since the sidebar was centralised — but it tested for a literal
`/docs/<section>/`, which matches only the OSS URL shape. The docs hub serves the same page at
`/<product>/<section>/` in production and `/<section>/` under `hugo server`, so the suppression
never fired there: agentgateway's `/kubernetes/` and `/standalone/` rendered a full page tree
for a version that does not exist at that level. Same defect class as the rest of this module's
URL parsing — one shape hardcoded where two exist.

Detection now goes through `utils/section-segment.html`, the one place that knows where a
section segment sits in either shape, and asks whether the LAST path segment is a registered
section:

```
/docs/kubernetes/                    landing        (OSS)
/kubernetes/                         landing        (hub, hugo server)
/agentgateway/kubernetes/            landing        (hub, production)
/docs/kubernetes/latest/             NOT a landing
/agentgateway/kubernetes/latest/…/   NOT a landing
```

Requiring the section to be the last segment is what keeps every page INSIDE a section out of
the branch. The TOC needed no change: `toc.html` already self-suppresses below two headings.

The intended behavior is visible in production on the two OSS sites, whose URL shape the old
test did match — <https://agentgateway.dev/docs/kubernetes/> and
<https://kgateway.dev/docs/envoy/> both render a version picker with no left nav. The hub side
had no live counterpart to link, because agentgateway is the first hub product to register
sections and that restructure is not deployed yet; verify locally by building
`hugo-local-agentgateway.toml` and checking that `/kubernetes/` and `/standalone/` contain
`<aside class="hx:hidden">` rather than `<aside class="sidebar-container …">`.

Deliberately NOT done the way agentgateway-oss-website does it, which is two near-identical
70-line layout overrides (`layouts/docs/{kubernetes,standalone}/_index.html`) that re-implement
the page shell and hide the sidebar, navbar and TOC with `display: none !important`. That needs
one file per section per URL shape — six for the hub — where fixing the detection covers every
product and shape at once.

Verified against a real `hugo-local-agentgateway.toml` build: `/kubernetes/` and `/standalone/`
suppressed, `/kubernetes/latest/` and `/standalone/latest/` still rendering their nav. No
fixture had a section landing page in ANY shape before this, which is why the gap was invisible;
`fixture/content/en/test/demo/` is now the enterprise-shaped probe, with 6 assertions in
`tests/section-landing.spec.ts` including two controls and a source guard against the literal
path returning.

### Fix — the version banner is no longer lost to a same-slug entry from another product (`layouts/_partials/utils/match-version-entry.html`)

`utils/version-root.html` resolved `versionEntry` with a bare `range site.Params.versions` plus
`if eq .linkVersion $candidate` and no early exit, so the LAST match won. With Gloo Edge's
1.21.x entry listed after Gloo Gateway's, `/gateway/1.21.x/` resolved to Edge's entry, which
sets no `banner` — so the banner vanished from every Gloo Gateway version page. The previous
code survived by accident: it required `.banner` to be non-empty and took the first match.

First-match-wins would have been wrong too, in the other direction: `hugo-gateway.toml` opens
with three cross-product kgateway entries. So matching now prefers the first entry that both
matches the segment and belongs to `currentProduct`, falling back to any match — which is what
keeps agentgateway-oss-website and kgateway-oss working, since neither sets `currentProduct`.

With `params.relatedDocs` in place this is belt-and-braces (one product's list cannot hold a
duplicate `linkVersion`, which is already a documented config error), but it makes the resolver
independent of config ordering rather than dependent on a rule nothing enforces.

Fix visible at <https://docs.solo.io/gateway/1.21.x/> — the banner at the top of the page.
Verified by building `hugo-gateway.toml` and asserting the banner renders; 11 assertions in
`tests/version-entry-product.spec.ts`, including both list orderings.

**Note for anyone calling a `return`-partial:** assign the result, then test it. Do NOT write
`{{ with partial "utils/match-version-entry.html" … }}`. `with` rebinds the dot, and Hugo's
return-partial wrapper calls `._pushPartialDecorator` on it, so the build dies with
`_partials/utils/version-root … is nil; wrap it in if or with` reported at
`version-root.html:1:10` — a line inside a comment block, and advice that is the opposite of
the fix. Both forms were built against the fixture to confirm.

### Fix — a hidden version no longer renders an empty clickable row in the version dropdown (`layouts/_partials/navbar.html`)

- **Why.** A whitespace-only `dropdown` label means "published but not advertised". The navbar
  emitted the `<li>` anyway and marked it `version-dropdown-hidden` with an empty label — but that
  class only set `font-size: 0`, which hides nothing. A hidden version therefore rendered as a ~4px
  empty row that was still clickable, still focusable, and still announced as a `menuitem`. It also
  disagreed with the mobile version chips in `sidebar.html`, which have always skipped hidden
  entries, even though `static.spec.ts` asserts the two offer identical destinations.
- **Why it stayed hidden until now.** No consumer had a hidden version in the list the navbar reads:
  under the old schema a hidden entry could sit in a per-section list this loop never saw. Collapsing
  to one list surfaced it immediately — the parity assertion failed on the first build after the
  fixture migration.
- **What changed.** Hidden entries are skipped outright, matching the mobile chips. The dead
  `.version-dropdown-hidden` CSS rule is removed; no consumer emits that class.
- **Verified.** `agentgateway` on the docs hub, whose `2.2.x` and `2.1.x` are configured exactly this
  way, no longer emits either in the dropdown, and the desktop/mobile parity assertions pass on both
  brands.

### Fix — the "section has nowhere to point" warning no longer fires on translation gaps or on section keys inherited from an imported module (`layouts/_partials/utils/resolve-sections.html`)

- **Why.** The new section resolver warned once per registered section that resolved to neither a
  landing page nor an `externalURL`. That is the right guard, raised at the wrong granularity: it
  fired four times per build across three hub products for two situations that are not config
  errors, and because `solo-io/docs`'s `hugoWarnings` allowlist is deliberately near-empty, each one
  failed `framework-test-content` outright.
- **The two false positives, both real.**
  - *A translated tree that has not been restructured.* `params.sections` is site-wide but content
    is per-language. `content/en/agentgateway/` moved to `<section>/<version>/`, while
    `content/ja/agentgateway/` still holds the flat `<version>/` layout with no section landing
    pages, so both sections resolved in English and neither did in Japanese. The advice the warning
    gave — "add a content page at that path" — was wrong for that case; the fix is to translate the
    tree.
  - *A section key the product never wrote.* Neither `hugo-kgateway.toml` nor `hugo-gateway.toml`
    defines `params.sections` at all. They **inherit** `sections.envoy` from the
    `github.com/kgateway-dev/kgateway.dev` module, because Hugo deep-merges an imported module's
    params into the project's. The hub serves that content flat at `/kgateway/<version>/`, so
    `/kgateway/envoy/` does not exist and must not. Worth knowing on its own: a product can gain a
    section key from an OSS module it imports, and nothing it puts in its own config removes one —
    an empty table does not delete a merged key.
- **What changed.** Dropped sections are collected and reported once, and only when the omission is
  user-visible: the default content language (a missing translation is a translation gap) **and**
  more than one section still resolves (both callers gate the selector on `gt (len $sections) 1`, so
  with 0 or 1 resolved sections no menu renders and nothing is missing from anything). The message
  now names every dropped key and says how many sections do render. `(index hugo.Sites 0)` is used
  to identify the default language rather than `site.LanguagePrefix == ""`, which only works while
  `defaultContentLanguageInSubdir` is false.
- **Accepted blind spot,** recorded in the source: a product registering exactly two sections and
  resolving only one loses its selector silently, because that is indistinguishable from the
  inherited-key case above.
- **Verified.** `latest` on
  [Solo Enterprise for agentgateway](https://docs.solo.io/agentgateway/kubernetes/latest/) still
  renders the section selector (view-source: five `section-dropdown` matches), the Japanese tree
  correctly renders none, and `kgateway`/`gateway`/`agentgateway` builds now emit no
  `extras-section-no-target` warning at all — the only remaining `WARN` is the allowlisted
  `.Site.Data` deprecation that Hextra itself raises. `make test-oss` and `make test-enterprise`
  both report 1924 passed / 17 skipped.

### Fix — the description lint scopes itself to where a fix is actually actionable: the newest version tree, in the default language (`layouts/partials/utils/warn-missing-description.html`)

Two independent narrowings, both because the lint was reporting the same missing description several
times under paths nobody can usefully edit.

**1. Translated pages are no longer linted.** A translated page's front matter is produced from its
English source by the translation sync, so a `description` added directly to a translated page is
overwritten on the next run — the actionable fix is always on the source page. Of `agentregistry`'s 69
warnings, **35** were `/agentregistry/ja/latest/…`, near-duplicates of the 34 English ones; it now
reports **34**. `(index hugo.Sites 0)` identifies the default-language site, the same accessor
`utils/resolve-sections.html` uses and for the same reason — it does not depend on
`defaultContentLanguageInSubdir`, and on a single-language site it is a no-op.

**2. No `main` version now falls back to the newest tree, not to every tree.**

- **Why.** The lint normally scopes itself to the `main` (dev) tree. A product with no `main` version
  fell back to linting **everything**, which multiplies one missing description by the number of
  frozen version trees a product ships. Measured on the docs hub: `kgateway` reported **294** warnings
  for **96** distinct pages copied across `2.3.x`/`2.2.x`/`2.1.x`, and `gateway` **43** for ~9 pages
  across five trees. A frozen tree is an archived copy — a description added there ships nowhere — so
  those duplicates are pure noise, and since `hugo-warnings.spec.ts` fails on any non-allowlisted
  `WARN`, they fail CI too.
- **Why it surfaced now.** Dropping the second version list (see the tagged-versions entry above)
  changed `kgateway` and `gateway` from linting *nothing* to linting *everything*. Neither declares
  `main`, but both **inherit** `sections.envoy.versions` from the `kgateway.dev` module — and that
  list *does* contain `main`, which made the old two-list walk see an active version and skip every
  page. So the lint had been silently disabled on both products by an inherited OSS config that has
  nothing to do with the hub's own versions. Confirmed by restoring the old walk: `kgateway` goes back
  to 0 warnings.
- **What changed.** With no `main`, the active tree is now `latest` if declared, else the first
  configured entry (TOML order is release order on every consumer config). All comparisons are on
  `linkVersion` — the URL segment — never the canonical `.version`, because the two diverge
  (gloo-mesh-enterprise ships `version = "2.14.x"` with `linkVersion = "main"`).
  `utils/resolve-latest-version.html` is deliberately **not** reused: it returns `.version`, which is
  the wrong coordinate for a path comparison.
- **Both changes are strictly narrower,** so no consumer that passes today can start failing.
  Verified across five hub products: `kgateway` 294 → **96**, `gateway` 43 → **9**, `agentregistry`
  69 → **34**, `istio` **0**, `gloo-mesh-enterprise` **0**.
- **Verified.** Observable on
  [Solo Enterprise for kgateway 2.2.x](https://docs.solo.io/kgateway/2.2.x/) — pages in that frozen
  tree no longer warn, while the same page under `2.3.x` still does. `make test-oss` and
  `make test-enterprise` both report 1924 passed / 17 skipped.
- **Known limitation.** "First in TOML order" is an assumption, not a derivation. Every consumer
  config holds it today; where it did not, the effect would be under-reporting rather than reporting
  the wrong pages.

### Fix — `search-visible-versions.spec.ts` no longer asserts one fixture's version list against another consumer's (`tests/search-visible-versions.spec.ts`)

- **Why.** Two of its assertions name specific fixture entries (`v4` / `v4-link`) rather than a
  property that holds for any config, but the spec's only guard was "no built search bundle". A
  consumer that *has* a bundle therefore ran them. `solo-io/docs` keeps a hand-maintained partial
  copy of this fixture's config in `hugo-preview-test.toml` (and `hugo-test.toml`,
  `hugo-local-test.toml`), and the `v4` entry added in this release was never mirrored into it — so
  `framework-test-static` failed on a difference between two fixture configs rather than on any
  theme defect.
- **What changed.** Those two assertions now carry the same `IS_FIXTURE_TARGET` guard that every
  sibling fixture-specific spec already uses. The generic half of the keying assertion — that the
  raw `version` must not leak into the set, which is the bug that actually shipped — still runs on
  every target, so consumer coverage is not weakened.
- **Verified.** The `static` project against `solo-io/docs` goes from 2 failed / 4990 passed to
  4991 passed, and the fixture run still exercises all five assertions on both brands.

### Fix — the version dropdown and mobile chips no longer offer a version tree the section does not have (`layouts/_partials/navbar.html`, `layouts/partials/sidebar.html`)

- **Why.** Both templates ended their version-switch fallback chain at the target version's landing
  page, and both carried a comment asserting that page "always exists" so the switch "can never
  404". That holds only without sections. An **untagged** `params.versions` entry applies to every
  section by definition, so a section that nests no tree for it is still offered it, and
  `/<section>/<version>/` was never built — a dead entry in both the desktop dropdown and the mobile
  drawer.
- **How it was found.** The moment a fixture section nested its version trees, its dropdown emitted
  `/test/nested/v3/` and `/test/nested/v4-link/` for the two untagged entries. Nothing had ever built
  a page at the section-then-version shape before, which is why an invariant stated in a comment
  survived as long as it did.
- **What changed.** Both now verify the target version's landing page exists and fall back to the
  **section** landing page — the version picker for that doc set, and the right answer to "this
  version exists, but not here". Only for a sectioned URL: without a section there is nothing above
  the version, and a configured version with no tree at all is a config error rather than a shape to
  paper over. The two are kept in step deliberately — `static.spec.ts` asserts the chips and the
  dropdown land on identical destinations, so fixing one alone is a divergence.
- **Verified.** Every internal href in the fixture's nested dropdown and chip row now resolves on
  disk, and the two lists are equal. Re-checked against both OSS consumers, whose sidebars share this
  code: `agentgateway.dev` (290 internal `/docs/` hrefs) and `kgateway.dev` (248) have no dead links.

### Changed — every reader now resolves versions through `utils/resolve-section-versions.html`

`version-cards.html` had its own `sections.<x>.versions`-then-top-level lookup; `flexsearch.js` and
`warn-missing-description.html` each collected from both lists themselves; `version.html` carried a
whole second branch for sections-only sites; `resolve-link.html` carried a second
`$siteHasVersioning` check. All of that is gone.

`version.html`'s removed branch is worth recording, because the tagged model makes its bug
unrepresentable rather than merely fixed: it flattened EVERY section's version list into one slice
and matched the first hit, without scoping to the page's own section. On a site whose sections ship
different version sets, a `standalone` page could gate against the `kubernetes` entry's canonical
`.version` and silently render nothing. It stayed invisible only because agentgateway's two sections
happened to ship identical version numbers.

A new repo-wide assertion (`tests/link-hextra-shapes.spec.ts`) fails if any template reads a
per-section versions list again, so the two-list shape cannot creep back.

### Test coverage — the section-then-version URL shape, which had none (`fixture/content/en/test/nested/`, `tests/section-nested-versions.spec.ts`)

- **Why.** `/<product>/<section>/<version>/…` is the shape this release exists for, and no fixture
  page used it. `demo` and `alt` register sections **without** nesting version trees — their versions
  live at `/test/<version>/` — so the fixture only ever exercised the fallback branch. Four behaviors
  were pinned by SOURCE assertions reading template text, which cannot see a wrong answer, only
  changed text: `version-root.html` prefixing `lookupPath` with the section,
  `resolve-sections.html` appending a version, `breadcrumb.html` collapsing a version at depth 3, and
  `resolve-section-versions.html` filtering by tag. The worst of those is silent — a section-less
  `lookupPath` makes `site.GetPage` resolve nothing, the left nav renders **empty**, the page still
  builds, and it reads as a content problem.
- **What was added.** A third section, `nested`, with real trees at `/test/nested/v2/` and
  `/test/nested/v1/` sharing a `page/` path, tagged on v2 and v1 but not on `main` (`alt`-only).
  `demo` and `alt` stay non-nesting, so both branches of the resolver are now covered side by side.
  The fixture's `contentDir` (`fixture/content/en/test`, `baseURL = /test`) already reproduces the
  production enterprise shape — product segment in the URL, absent from the `GetPage` path — so
  `/test/nested/v2/page/` resolves through `GetPage "/nested/v2/"`, the same two-coordinate
  translation the docs hub performs.
- **10 assertions**, covering: the nav tree resolves and is non-empty; it does not leak another
  version's pages; the selector appends the version for a nesting section while the two non-nesting
  ones still fall back; a section link remaps when the current version is absent there (the remap that
  had been dead code since the migration); the dropdown is filtered to this section's tags and omits
  `main`; a version switch preserves both section and path; no version link points at a missing tree;
  chips and dropdown agree; and the breadcrumb shows the section between home and the version.
- **Each assertion was probe-verified**, and one was wrong. The nav-tree check searched the enclosing
  `<aside>`, which also holds the mobile version chips and section chips — so with the tree
  **completely empty** it still found `/test/nested/v2/page/` and passed. Scoping it to the sidebar
  `<nav>` makes it fail under the probe, as it should. That is the whole reason for probing rather than
  trusting a green run.

### Test coverage — proving the same-product `url` field is really dead (`tests/related-docs.spec.ts`)

The release removed `url` from all 27 real configs on the argument that no reader consults it. That
was an argument, not a test: the fixture still carried `url` on every same-product entry, and every
value was **correct**, so a reader that did consult it would have produced identical output and moved
no assertion. Those values are now a poison host (`must-not-render.invalid`), asserted absent from
every built page — and a second assertion checks the poison is still *present in the config*, so
"tidying up" the field cannot leave the first one passing vacuously. Probe-verified by making
`navbar.html` prefer `.url`, which fails it. `relatedDocs` urls are the opposite case — the one place
a version URL is written by hand and **must** render — so they use a different host and are asserted
present.

### Verified

- Fixture suite, both brands: **1950 passed**, 17 skipped, 0 failures (was 1874/14 earlier in this
  release; +76 from the section selector, relatedDocs, breadcrumb, nested-shape, poison-url and
  name-collision specs).
- Fixture suite, both brands, earlier in this release: **1874 passed**, 14 skipped, 0 failures.
- **docs hub agentgateway** (`make build PRODUCT=agentgateway`): `kubernetes/latest` offers its three
  visible versions, `standalone/latest` offers only `latest` (the tag filter working), and the
  version-root picker page at `/agentgateway/latest/` offers the full set (the unregistered-section
  rule working). Version banner on 327 pages, `kubernetes/2.3.x` noindexed on 210, zero doubled or
  version-less hrefs.
- **agentgateway-oss-website**: 5442 pages, no warnings. Its two sections shipped identical lists, so
  the duplication collapsed to one untagged list. Every `/docs/<section>/` href keeps its version
  segment; its own `nav.html` dropdown still offers `main` and `1.4 (latest)`.
- **kgateway-oss**: 2836 pages, no warnings. Its `envoy` section held a byte-for-byte copy of the
  top-level list, with a comment instructing maintainers to keep the two in sync by hand; that copy
  is deleted. All five version chips render with the active one marked.
- **kagent docs-site**: 240 pages, no warnings — registers no sections, so unaffected, which is the
  point of "no `sections` field means every section".


### Fix — old-version pages are actually noindexed now, on every consumer shape (`layouts/partials/utils/version-noindex.html`)

- **Why.** This partial marks an old version's copy of a still-existing page `noindex, follow` so
  near-duplicates stop competing with the current version, while leaving a page that exists ONLY in
  an old version indexable. It shipped with **no tests at all**, and it was broken in two of the
  three consumer shapes — both because it re-derived the version and the content-lookup path itself
  instead of using the shared resolver:
  1. **Docs hub: the lookup could never resolve.** It built the lookup path from the full
     `RelPermalink`, so the path kept the `/<product>/` segment — but hub `GetPage` paths are
     relative to `contentDir` (`content/<lang>/<product>`). `site.GetPage
     "/gloo-mesh-enterprise/latest/getting_started"` was therefore always nil and **not one page on
     the entire hub was ever marked**. Verify at
     <https://docs.solo.io/gloo-mesh-enterprise/2.11.x/getting_started/> — view-source shows only
     `index, follow`, though `latest` serves the same page. `sidebar.html` and `navbar.html` both
     strip the product prefix before `GetPage`; this partial was the one that forgot.
  2. **Sections-only sites: entirely inert.** It gated on a top-level `site.Params.versions`, which
     agentgateway.dev does not have (its versions live only under
     `params.sections.{kubernetes,standalone}.versions`), so it emitted nothing at all. Compare
     <https://kgateway.dev/docs/envoy/main/about/overview/> (two robots tags, correct) with
     <https://agentgateway.dev/docs/kubernetes/main/> (no robots meta at all).
- **What changed.** It now calls `utils/version-root.html` for the version and uses that resolver's
  `lookupPath` (already contentDir-relative) plus the new `pathAfterVersion` to build the
  current-version equivalent, and it resolves its version list through
  `utils/resolve-section-versions.html`, which handles both config shapes. Resolving the section's
  own list also makes "current" mean the current version *of that section*, which starts to matter
  as agentgateway's `kubernetes` and `standalone` version sets diverge.
- **Verified.** Local `hugo160` build of the docs hub (`make build PRODUCT=gloo-mesh-enterprise`):
  `getting_started` under `2.12.x`, `2.11.x` and `2.10.x` now each carry `index, follow` **plus**
  `noindex, follow`, where before all three carried only `index, follow`; `latest` correctly carries
  only `index, follow`. Plus **9 new assertions** in `tests/version-noindex.spec.ts` — the partial's
  first-ever coverage. That required making it non-inert in the fixture: no fixture entry set
  `latest = true` or `linkVersion = "latest"`, so the partial had been dead code in every test run.
  `hugo-{oss,enterprise}.toml` now mark the v2 entry `latest = true`, and
  `fixture/content/en/test/v1/removed-feature.md` is the fixture's only page with no current-version
  counterpart, covering the "leave history indexable" branch (one assertion guards the fixture flag
  itself, since without it the whole spec would pass vacuously).
- **Also verified on the two sections-only shapes**, once an unrelated content break was cleared (an
  unclosed `{{< version >}}` in `assets/agw-docs/pages/agentgateway/llm/providers/azure.md`, 3 opens
  vs 2 closes, introduced 2026-08-21 in `bd10723f`, which failed both agentgateway builds; confirmed
  independent of this change by reproducing it with the module reverted to `HEAD`):
  - agentgateway-oss-website, which declares versions ONLY under `params.sections.*.versions` and so
    used to emit nothing at all: `kubernetes/main` 283 of 297 pages noindexed, `1.3.x` 262 of 266,
    `1.0.x` 210 of 223, `standalone/main` 228 of 239 — while `kubernetes/latest` and
    `standalone/latest` stay at 0. The un-noindexed remainder in each old tree is the point: those
    are pages with no counterpart in the current version, left findable.
  - docs hub agentgateway, which nests versions under a section segment: `kubernetes/2026.7.1` 321
    of 327 and `kubernetes/2.3.x` 210 of 213 noindexed, `kubernetes/latest` 0 of 331. `standalone`
    resolves its OWN current version (`standalone/latest` 0 of 7), which is what the section-aware
    version list buys — a single shared "latest" would have been wrong for one of the two sections.

### Test coverage — the `card` shortcode's `path=` branch

- **Why.** Not one fixture card used `path=` — every one passed `link=` — so the whole
  resolve-against-the-version-root branch was unexercised. It is also the branch with a shipped
  failure: the docs hub keeps its own `card.html` override (Material Icons plus translation export),
  and that copy derived its prefix straight from `.Page.FirstSection.RelPermalink`. `FirstSection`
  returns the SECTION, not the version, once a product nests version trees under a section segment,
  so it emitted hrefs such as `/agentgateway/kubernetes/observability/` with the version missing —
  178 of them, every one a 404. It had worked before the restructure only because the version *was*
  the first section. Fixed in `solo-io/docs`; this is the theme-side guard that was absent.
- **What changed.** `fixture/content/en/test/v2/card-path.md` plus `tests/card-path.spec.ts` (10
  assertions): a leading-slash path, a slashless path (must not fuse into `/test/v2rebased/`), a
  nested path, and a path with a fragment (must keep the fragment and gain no trailing slash). Each
  href is also resolved against the built output, and one assertion states the property that
  actually broke — every `path=` href carries the version segment — so a failure names the cause
  rather than just showing an inequality.
- **Not covered, deliberately stated.** The section-segment URL shape itself. This fixture serves
  `/test/<version>/…` with no section segment, so it exercises the branch that resolves correctly,
  not the one that broke; that needs a `/test/<section>/<version>/…` tree which does not exist yet.
  Standing in for it is a source-contract assertion that fails if the module's `card.html` ever
  regresses to deriving the prefix from `FirstSection` ahead of `page-context` — the exact mistake
  the override made. That assertion is generic, so it runs against consumer builds too (verified on
  the `agentgateway-oss-website`, `kgateway-oss` and `docs` configs, where the fixture-shape
  assertions skip and this one still executes).
- **Verified.** Full suite on both brands: **1874 passed**, 14 skipped, 0 failures.

### Test coverage — a fixture version whose `linkVersion` differs from its `version`

- **Why.** Every entry in both fixture configs set `version` and `linkVersion` to the same string
  (v2/v2, v1/v1, main/main, v3/v3), so no assertion in the suite could distinguish "matched on the
  canonical version" from "matched on the URL slug" — they were the same value. Production diverges
  routinely and always has: gloo-mesh-enterprise and gloo-mesh-gateway both map `2.14.x`→`main` and
  `2.13.x`→`latest`, kgateway-oss maps `2.5.x`→`main` and `2.4.x`→`latest`, agentgateway-oss maps
  `1.5.x`→`main` and `1.4.x`→`latest`. The shape that matters is an author writing
  `include-if="2.13.x"` on a page served at `/latest/` — see
  <https://docs.solo.io/gloo-mesh-enterprise/latest/getting_started/>, whose canonical version is
  `2.13.x`. An entire class of regression was therefore invisible here while being live everywhere.
- **What changed.** A `version = "v4"` / `linkVersion = "v4-link"` entry plus a content tree at
  `fixture/content/en/test/v4-link/`, and `tests/version-linkversion.spec.ts` (8 assertions). The
  names are deliberate: `v4` is a strict SUBSTRING of `v4-link`, and `version.html` matches with
  `in $condition .linkVersion` — a substring test, not equality — so a slug collision now surfaces.
  Each gate is asserted in BOTH directions, because a gate that emits nothing looks identical to one
  that correctly suppressed; one-sided assertions would pass against a completely broken shortcode.
  One assertion guards the fixture entry itself, since collapsing the two fields back together would
  leave every other assertion passing vacuously.
- **Outcome: no bug found — the behavior was already correct**, and is now pinned. `include-if` on
  the canonical version and on the slug both render; both `exclude-if` forms suppress; another
  version's token emits nothing and its inverse still renders.
- **Also updated, and both are the point rather than churn.**
  `tests/search-visible-versions.spec.ts` expects `v4-link` (not `v4`) in the search set, which is a
  direct check that the set is keyed on `linkVersion`; and `tests/version-cards.spec.ts` expects the
  v4 card href to be `/v4-link/`, since a card pointing at `/v4/` would 404. The new page's markers
  use the `MARKER_` prefix so `gate-containment.spec.ts` snapshots each rendered block's DOM ancestor
  path too — gated content being *ejected* out of `div.content` (and so rendering unstyled) is a
  distinct failure from being gated wrongly, and only the ancestor-path snapshot catches it. The
  three rendered blocks now record `div.content > p`; the three suppressed ones are correctly absent.
- **Verified.** Full suite on both brands: **1861 passed**, 14 skipped, 0 failures. The fixture's own
  `gate-form` lint caught the first draft of the new page for using angle-form gates
  (`{{< version >}}`) where content must use percent form — fixed, and worth noting as the lint doing
  its job. Both new specs were then run against the real `agentgateway-oss-website` and
  `kgateway-oss` test configs to confirm the consumer path: 14 fixture-only assertions skip cleanly
  and the 3 source-contract guards still execute, so a consumer keeps the regression protection
  without inheriting fixture-shape expectations.

### Additive — `utils/version-root.html` reports `pathAfterVersion`, and `matchedIdx` in both URL shapes

- **Why.** "Swap the version, keep the rest of the path" is a recurring need — the noindex partial
  builds an old page's current-version equivalent, and the sidebar and navbar build version-switch
  destinations — and each caller was slicing the segment list itself with its own off-by-one risk.
  `matchedIdx` was also left at `0` in the OSS branch, which is the only reason `sidebar.html`
  carried a `cond $isOSSShape 4 (add $matchedIdx 1)` special case.
- **What changed.** The OSS branch now records `matchedIdx = 3` (where the version always sits in
  that shape), `pathAfterVersion` is derived once from `matchedIdx` for both shapes, and the
  sidebar's special case collapses to a plain `add $matchedIdx 1` — the same value it computed
  before, so the mobile version row is unchanged.
- **Verified.** Full suite on both brands: **1851 passed**, 14 skipped, 0 failures (up from 1839;
  the additions are the 9 noindex assertions plus the new fixture page's auto-card checks).
  `tests/auto-cards.spec.ts` gained a `V1_ONLY_TOPICS` list mirroring the existing `V2_ONLY_TOPICS`,
  since the new v1 page also surfaces as a section card.

### Fix — the version banner reappears on pages inside a section subtree (`layouts/partials/version-banner.html`)

- **Why.** The banner derived "which version is this page in" from
  `.Page.FirstSection.RelPermalink`, then checked `in $versionPath .linkVersion`. Inside a section
  subtree (`/<product>/<section>/<version>/…`, the shape agentgateway enterprise adopted so
  kubernetes and standalone can sit side by side) `.FirstSection` resolves to the *section*
  (`kubernetes`), not the version — so the substring check never matched and the banner silently
  rendered nothing. Silently is the operative word: no warning, no broken link, just a missing
  "this is an older version" notice on every page of every non-latest tree, which is the one place
  it matters most. Verify on
  <https://docs.solo.io/agentgateway/kubernetes/2.3.x/quickstart/> — the "Review the docs for the
  2.3 LTS version" bar should be present above the title.
- **What changed.** The banner now calls `utils/version-root.html`, the resolver the sidebar,
  navbar and docs-tabs band already share, and reads the matched entry from its new `versionEntry`
  return key. It no longer parses a URL itself.
- **Verified.** Local `hugo160` build of the docs hub (`make build PRODUCT=agentgateway`) with a
  before/after comparison against the same commit's baseline: pages under
  `agentgateway/kubernetes/latest/` carrying `class="version-banner"` went from **0 to 327** (the
  4 remaining are alias/meta-refresh stubs, correctly bannerless). Each tree resolves its *own*
  entry — `kubernetes/2.3.x` renders the 2.3 LTS text, `kubernetes/2026.7.1` the 2026.7.1 LTS
  text, `kubernetes/latest` and `standalone/latest` the latest text.

### Fix — `link`/`link-hextra` version inference no longer re-derives its own answer (`layouts/_partials/utils/resolve-link.html`)

- **Why.** Three partials each independently worked out which version tree a page was in, and each
  had its own bug: this one dropped the version segment on a sections-only site (v0.2.1 above), the
  version banner stopped rendering inside section subtrees (above), and the sidebar rendered empty
  when a section segment shifted the version's position. Fixing the class rather than the instances
  means one implementation, so the next URL-shape change is one edit rather than three.
- **What changed.** `resolve-link.html`'s ~90-line segment walk is replaced by a call to
  `utils/version-root.html`. Two details the delegation has to get right, both documented inline:
  the resolver returns a *published-URL* prefix (product and language included) while the URL
  assembly here re-prepends `.Site.BaseURL`, so the baseURL path and language prefix are stripped
  back off — passing it through unchanged emits `/kgateway/kgateway/2.1.x/…`. The flat-site
  (`ambientmesh.io`) and sections-only (`agentgateway.dev`) branches are unchanged.
- **Also fixed, found by the source guard this move tripped.** `version-root.html`'s own version
  shape-fallback pattern was the narrow `^[0-9]+\.[0-9]+\.x$`, written out once per URL-shape
  branch. It rejected fully qualified LTS versions (`2026.7.1`), the exact defect
  `tests/link-hextra-lts-version.spec.ts` was created for after it broke once already in
  `resolve-link.html`. The pattern is now declared once as `$versionShapeRE`, accepts `X.Y.Z`, and
  a new assertion fails if an inline copy reappears beside it. No fixture has an LTS tree, so this
  was invisible to every behavioral test — the source guard was the only thing that caught it.
- **Verified.** Full suite on both brands: **1839 passed**, 14 skipped, 0 failures. Consumer builds
  against a local `replace`, all exit 0 with no new warnings: agentgateway-oss-website (5434
  pages), kgateway-oss (2836), kagent docs-site (240), docs hub agentgateway (2125 EN + 821 JA).
  Link-shape sweeps: every `href` into `/docs/<section>/` on agentgateway.dev (~577k) and
  kgateway.dev carries a version segment; on the docs hub, a before/after baseline build shows the
  doubled-product-segment count (4) and the version-dropped `card path=` count (178) **unchanged**,
  confirming both are pre-existing defects of the section restructure rather than regressions from
  this change. Both are tracked separately.

- **Regression coverage.** Neither fixture (`hugo-oss.toml`, `hugo-enterprise.toml`) declares
  versions *only* under `params.sections` — both also carry a top-level `params.versions`, so this
  branch was never behaviorally exercised. Added a source assertion
  (`tests/link-hextra-shapes.spec.ts`, "a sections-only versions declaration... still counts as
  versioned") that fails if the sections-only fallback is ever removed from
  `resolve-link.html`, until a fixture reproducing the real shape exists.


## [0.2.1] — 2026-08-20

### Fix — `link`/`link-hextra` no longer drops the version segment on a site that only declares versions per-section (`layouts/_partials/utils/resolve-link.html`)

- **Why.** `$siteHasVersioning` — the switch between the version-segment walk and the flat-site
  fallback added in v0.2.0 — only checked a top-level `site.Params.versions`. agentgateway-oss-website
  has never had one: its versions are declared under `params.sections.standalone.versions` and
  `params.sections.kubernetes.versions` only, because its pre-unification forked `link-hextra` did
  its own path-segment walk regardless of any versions list. The v0.2.0 unification made the
  top-level check load-bearing for the first time, misclassified agw oss as a flat, unversioned
  site (the branch meant for ambientmesh.io), and every `link-hextra` call on it lost its
  `/standalone/<version>` or `/kubernetes/<version>` prefix. Confirmed live:
  <https://agentgateway.dev/docs/kubernetes/latest/llm/prompt-templates/> currently renders its
  "JWT authentication guide" link as `href=/docs/security/jwt/`, which 404s (`curl -I` → `404`),
  instead of `/docs/kubernetes/latest/security/jwt/`. Some call sites happened to survive in
  production only because of an unrelated Cloudflare redirect rule that maps bare
  `/docs/configuration/*` paths to `/docs/standalone/latest/configuration/*` — that rule doesn't
  cover `/docs/security/*` or any kubernetes-flavor path, which is why this one hard-404s while
  others merely took an extra redirect hop.
- **What changed.** `$siteHasVersioning` now also treats a site as versioned if any
  `params.sections.*.versions` list is non-empty, not just a top-level one. The version-segment
  regex walk it enables already matched agw oss's actual URL segments (`main`, `latest`, `1.x.x`)
  without needing `$configuredVersions` from a top-level list, so this one check was the whole fix.
- **Verified.** Local `hugo160` build of agentgateway-oss-website (via its local `replace` on this
  module): before the fix, a site-wide sweep of every `href="/docs/..."` found 311 hrefs missing
  their `/standalone/<version>` or `/kubernetes/<version>` segment, including the exact
  `/docs/security/jwt/` case confirmed live above; after the fix, 0 remain (the 2 leftover
  non-prefixed hrefs are unrelated — the bare `/docs/` section root, and a hardcoded href in
  `layouts/_default/enterprise.html` that this shortcode never touches). All 27 existing
  `tests/link-hextra-*.spec.ts` cases still pass on both fixture brands.
- Takes effect for agentgateway-oss-website (and any future consumer with the same
  per-section-only versions shape) once it bumps its extras pin; kgateway-oss and the docs hub
  already declare a top-level `params.versions` in addition to their section overrides, so they
  were never exposed to this and need no action beyond their normal pin bump.

---

## [0.2.0] — 2026-08-20

Work on the gating and reuse shortcodes producing markdown/HTML leaks in visible output — plus the consumer-override convergence that fixing it exposed.


### Breaking — a reused snippet with a fenced code block no longer breaks the enclosing numbered list (`layouts/_partials/utils/flatten-rendered.html`, `layouts/_shortcodes/reuse.html`)

- **Why.** `flatten-rendered` skipped its whole newline-encoding pass whenever the content
  contained `<pre`, so a percent-form reuse of a snippet with a fenced code block returned REAL
  newlines — which terminate the enclosing list item. Measured: `</ol>` count between step 1 and
  step 3 went to **1** (list broken, step 3 restarting a new `<ol>`); with the pass enabled it is
  **0**. The shape occurs **58 times in `docs`** and once each in kgateway oss and
  agentgateway oss.
- **The plan said not to fix it this way. The plan was out of date.** Item 7i read *"do NOT fix
  with `bypassPre: false` by analogy with `callout.html` … needs its own design"*, because the
  bypass was documented as protecting Chroma output — flattening was said to turn `\`
  line-continuations into literal `</span>` text via CommonMark backslash-escaping of `\<`.
  Re-tested against the post-Phase-5 pipeline with a snippet containing the exact trigger
  (`echo \<not-a-tag\>`, a `cat <<EOF` heredoc, trailing `\` continuations) and Chroma
  genuinely active (**7 `<span class="line">` chains**, verified so the check is not vacuous):
  the decoded code text is **byte-identical** with the bypass on and off, and `&lt;/span&gt;`
  never appears. The warning predates the refactor that removed the re-parse causing it.
- **But it did need a design, just a different one.** Turning the bypass off naively put a
  literal `&#10;` inside heading TEXT on **23 headings** of the fixture's `everything` page —
  extras' heading hook emits `<h2>Alerts<span id=…></span>\n    <a class="subheading-anchor">`,
  and encoding that newline pollutes the TOC label, the copy-as-markdown payload and the
  accessible name. My first repro snippet was too simple to catch it; the fixture's `presence`
  spec did. So `<pre>` is now **protected with placeholders exactly as `<script>`/`<style>`
  already were** — its newlines are content (the code's line breaks) while every other newline is
  source formatting, and only the latter is collapsed.
- **Verified.** All eight `gate-blockhtml` cases now keep their marker inside its list item;
  four (A, C, E and G, including the no-gate control whose name was literally
  *"breaks anyway — backlog 7i"*) were pinned as escaping and are flipped, which is what that
  spec's failure message asks for. Extras **1831 passed** on both brands. `PRODUCT=kgateway`,
  `gateway` and `istio` content suites: **170 passed** each.

### Breaking — `assets/css/main.css` deleted from the module (dead code, loaded by nothing)

- **Why.** 668 lines of marketing CSS (proxima-nova, 4rem `h1`, `.p-lead`) from the module's
  "First draft" commit, **loaded by no template in any of the seven repos, nor by Hextra
  0.12.3.** Verified by grepping every `resources.Get` / `resources.Match` CSS lookup across
  all of them: each one is an explicit path, and none is `css/main.css` except
  agentregistry oss's — which resolves to that repo's OWN file, not this one.
- **Marked breaking out of caution, not measurement.** Nothing observed loads it, but a
  consumer outside these seven that did `resources.Get "css/main.css"` and relied on the
  module's copy would lose it. Verified where it can be verified:
  [agentregistry.dev](https://agentregistry.dev/docs/) builds with **0 HTML pages and 0 CSS
  files changed** (11 `llms.txt` timestamps only), and its own Tailwind bundle keeps the
  identical fingerprint `main.7a32dc4c…css`. The fixture is unchanged. The docs hub had
  already deleted its byte-identical copy with no effect.
- **This closes plan item 7e, whose premise was backwards.** That item read "agentregistry
  overrides `assets/css/main.css` with 1,863B against extras' 13,368B — determine whether that
  is deliberate or is silently dropping theme CSS." Neither. agentregistry's file is a
  **Tailwind entry point** (`@import "tailwindcss"`, `@source "hugo_stats.json"`, brand
  keyframes, HSL tokens) read by that repo's own `layouts/_partials/css.html` — and **no other
  consumer ships a `css.html`, nor does Hextra 0.12.3**, whose entry is `styles.css`. It was
  supplying the only file that reads that path, not shadowing a theme file. With the module's
  copy gone, agentregistry oss is at **zero same-path shadows, zero duplicated
  selectors, zero contract divergences** — the first consumer completely clean.
- **A byte-count gap between two same-named files is not evidence of drift.** These two shared
  a filename and nothing else. Same mistake shape as reading `link-hextra` as a "587B stub vs
  6KB module file", which was also wrong.

### Breaking — the gating shortcodes emit `.Inner` untouched, and `reuse` / `rebase` now decide the shortcode form (`layouts/_shortcodes/{version,conditional-text,reuse,rebase}.html`, `layouts/_partials/utils/{gate-decide,gate-emit,gate-normalize-form}.html`)

- **Why.** Hugo does not tell a shortcode whether it was called as `{{%% %%}}` or `{{< >}}`.
  `version.html` and `conditional-text.html` therefore **guessed** the form from the shape of
  `.Inner` — six regex heuristics in `utils/inner-shape.html` selecting one of four emit
  strategies — while `reuse.html` and `rebase.html` regex-rewrote forms to nudge those
  guesses. Every leak is
  either a misfired guess or a **double render**: content that was already rendered getting
  parsed a second time.
- **What changed.** One emit path. Both gates resolve their condition, then emit `.Inner`
  exactly as Hugo handed it over, via the new `utils/gate-emit.html`. Condition evaluation
  moved to the shared `utils/gate-decide.html`. `utils/{inner-shape,emit-inner,has-markdown}.html`
  are **deleted** (218 lines, grep-confirmed zero callers in extras or any of the six
  consumers). `version.html` goes 201 → 122 lines, `conditional-text.html` 211 → 25.
- Raw emit only works if `.Inner` really is raw markdown, so choosing the form moved to
  `utils/gate-normalize-form.html`, called by `reuse.html` and `rebase.html`. It puts each
  gate in the form correct for its position — see the two Fix entries below for what each
  direction repairs.
- **Three condition-evaluation bugs fixed on the way**, all previously silent: setting both
  `include-if` and `exclude-if` now `errorf`s instead of letting `include-if` quietly win and
  hide the typo; comma-list entries are trimmed, so `include-if="a, b"` matches instead of
  matching nothing; and membership is a slice test rather than a substring test, so
  `include-if="2.4.x"` no longer matches version `12.4.x`.
- **Consumer action.** A consumer that ships its own `reuse.html` or `rebase.html` gets no
  normalization, so its gates emit raw markdown into a parsed stream and leak. Delete the
  override, or port the block carrying the `GATE-FORM-NORMALIZATION-v1` sentinel into it.
  `tests/override-parity.spec.ts` fails until one of those happens. This is why the change
  is breaking rather than a patch.
- **Verified.** 1779 fixture tests on both brands; all seven enterprise products, plus
  `kgateway oss` (152/152) and `agentgateway oss` (152/152 once its fork is
  deleted). No product has a `markdown-leaks` failure. Every remaining consumer failure is a
  pre-existing backlog item (the hub's `scanRoots` pointing at directories that do not
  exist; the `build-test.log` Makefile mismatch; `missing-images`; the `keycloak.md` tables).
- Production page showing the class of bug this removes:
  [gloo-mesh-enterprise external-auth OPA BYO](https://docs.solo.io/gloo-mesh-enterprise/latest/security/external-auth/opa/opa-byo/)
  — see the Fix entry below for what is wrong on it.
- **Added the one shape that no fixture covered:**
  a `{{% version %}}` wrapping a heading, then `{{< tabs >}}`, then another heading, all in
  one gate — the exact structure that ejected trailing headings out of `.content` on the
  agentgateway OSS `jwt/setup` page before this refactor (the old `RenderString` re-parse of
  already-expanded tabs HTML mis-nested a `<div>` and prematurely closed `.content`). Added
  as Shape 15 in `fixture/content/en/test/v2/gate-transparency.md`, carrying a
  `MARKER_SHAPE15_HEADING_AFTER_TABS` sentinel. Two independent checks now pin it:
  `gate-transparency.spec.ts` (gated renders byte-identical to the tags-removed baseline) and
  `gate-containment.spec.ts` (the sentinel's ancestor path resolves to
  `main > div.content > p`, not bare `main`). Verified passing on both brands.

### Add — source lint: a gate must not sit inside an inline construct (`tests/helpers/gate-inline-form.ts`, `tests/gate-inline-form.spec.ts`)

- **Why.** `**{{% version include-if="v2" %}}text{{% /version %}}**` renders as **four literal
  asterisks** when the gate excludes — CommonMark does not treat `****` as empty-strong, it emits
  the characters. Measured on the fixture: `The setting **** is v2-only`, on both the reuse and
  rebase pipelines. Raw-emit does not fix this, because the delimiters were never inside the gate
  to begin with.
- **`markdown-leaks` was blind to it.** `RAW_BOLD` is `/\*\*[^\s*][^*\n]{0,60}\*\*/`, which
  requires at least one character between the delimiters, so the collapsed-to-empty form slipped
  through. An `empty-emphasis` pattern now catches the symptom; the new lint catches the cause at
  source, with the offending line and column.
- **It found a latent bug on its first real run.**
  `assets/conrefs/snippets/istio/nodeport-peering.md:5` gates *inside* a bold label
  (`**NodePort {{% version %}}(alpha){{% /version %}}…**`). No istio version currently falls
  outside both gate lists, so nothing leaks today — but the next version added that isn't listed
  would render `**NodePort **` literally. Restructured so the gates sit outside the bold;
  rendering is unchanged on all four versions that use it (`1.28.x` → "NodePort (alpha)",
  `1.29–1.31.x` → "NodePort (beta)").
- Both the fixture's `version` and `conditional-text` cases moved to the supported form
  (gate WRAPS the emphasis). Break-tested: reverting either one turns the lint and the leak
  scanner red.

### Add — a `scanRoots` that reads nothing is now an error, not a silent pass (`tests/helpers/config.ts`, `tests/scan-roots.spec.ts`)

- **Why.** One consumer shipped `scanRoots = ["./content/en/test", "./assets/conrefs/test"]`
  — the extras FIXTURE's paths, copy-pasted. Neither has ever existed in that repo. The
  source-scanning specs skip only when `scanRoots` is **empty**, so two non-empty-but-wrong
  entries sailed through and walked zero files. Six author-side lints (`curl-quotes`,
  `tab-syntax`, `shortcode-args`, `heading-shortcode-id`, `include-form`, `cascade-type`)
  passed **vacuously over 11,025 markdown files** for as long as the config existed.
  Undetectable from outside: "walked nothing, found nothing" and "walked everything, found
  nothing" are the same result.
- **What changed.** `config.ts` throws if a `scanRoots` entry does not exist or is not a
  directory. `tests/scan-roots.spec.ts` (3 tests) covers the case `config.ts` cannot see — a
  root that exists but holds no markdown — and logs the corpus size so the number is visible
  in CI output rather than assumed. Break-tested by pointing a throwaway config at a bad path.
- **This is the third instance of the same bug class in this effort**, after `npx serve`
  returning a directory listing for any URL whose last segment contains a dot, and
  `getComputedStyle(el, "::before").content` returning the specified value rather than the
  resolved glyph. **Any new scanner needs a "found at least N targets" self-check**, or it
  certifies nothing while looking like it certifies everything.
- **What it immediately found.** The hub's own roots were already fixed and all six lints pass on its 11,025 files. But the two OSS
  consumers scan only `./content/docs` and **never scanned `./assets`** — 297 conref files on
  kgateway.dev and 392 on agentgateway.dev, which is exactly where reuse and gating problems
  live. Widening both configs surfaced 24 deprecated tab usages and 3 unanchored shortcode
  headings; all are fixed, and both repos are green at the wider scope (1,396 and 1,869 files).
- **One of those was live on production.**
  [docs.solo.io/kgateway/latest/…/max-headers-count/](https://docs.solo.io/kgateway/latest/traffic-management/header-control/max-headers-count/)
  renders tabs labelled **"Tab 0"** and **"Tab 1"** instead of "Cloud Provider LoadBalancer"
  and "Port-forward for local testing". Cause, confirmed by reading the templates rather than
  guessing: the source uses the pre-0.12 `tabName=`, the hub's own `layouts/_shortcodes/tab.html`
  does `{{ .Get "name" | default (printf "Tab %d" .Ordinal) }}` and never reads `tabName`, and
  the hub's `tabs.html` never reads `items` either — so both label sources fall through.
  Note kgateway.dev itself looked **fine**, because Hextra 0.12.3's own tabs still honours
  `items=`; only the hub's override does not. Fixed at source (`name=`), which both
  implementations honour.

### Add — extension slots on the docs layouts, so a consumer stops forking `docs/single.html` and `docs/list.html` (`layouts/docs/{single,list}.html`, `layouts/partials/docs/*.html`)

- **Why.** A consumer that needs to inject its own navbar, chatbot or page width
  had no option but to copy the whole layout. Both OSS sites did, each for two or
  three lines. The cost is invisible and compounding: **a forked layout stops
  receiving every feature the module adds afterwards.** Measured on
  [kgateway.dev](https://kgateway.dev/docs/envoy/latest/install/) — deleting its two
  forks gained a visible page subtitle on **856 pages** that had silently been
  missing it, plus `components/page-context-menu`, the `displayPagination` config
  guard, `version-banner` and the `page-badges` contract. Nothing was broken; the
  features simply never arrived. To be precise about the subtitle, since it is easy
  to overstate: `<meta name="description">`, OpenGraph and JSON-LD were **already
  correct** on those pages (a different partial feeds them). What was missing is the
  rendered `<p class="page-description">` under the heading.
- **What changed.** Five override points in `layouts/partials/docs/`:
  `chrome-top.html` (above the tab band; defaults to the announcement banner),
  `chrome-bottom.html` (below everything; defaults to nothing),
  `width-class.html` and `content-class.html` (the two max-width class strings),
  and `after-title.html` (inside `.content`, detail pages only). The docs layouts
  also stopped emitting an empty announcement wrapper and a `padding-top: 0` style
  attribute when neither applies.
- **Byte-identical by construction, and verified.** Every slot call is glued to its
  neighbouring tag so an empty slot adds no whitespace. Two docs-hub products built
  before and after: **kgateway 0 of 770 HTML pages differ, istio 0 of 1,113** — all
  diffs are `llms.txt` build timestamps. The first attempt was *not* byte-identical
  (67 fixture pages differed on whitespace alone); the trim markers were rebalanced
  until it was.
- **Consumer action — already done in both OSS repos.** `kgateway-oss` and
  `agentgateway oss` deleted all four layout forks and now ship small slot
  overrides instead. Two things moved out of the layouts on the way: kgateway.dev's
  inline breadcrumb-hiding `<style>` and agentgateway.dev's inline
  `padding-top: 2.5rem` both went to `assets/css/custom.css`, where styling belongs.
  Verified feature-by-feature on agentgateway.dev's build: custom navbar, chatbot,
  section cards (477 pages / 2,091 links / 510 grids) and page descriptions are all
  **identical counts** before and after.
- **One page needed a real layout, not a slot.** kgateway.dev's `/docs/envoy/`
  landing hides the sidebar and TOC, and lived as an `if $isEnvoyIndex` branch keyed
  on a hardcoded path inside the forked `list.html` — holding every other section
  index hostage to one page. It is now `layouts/docs/landing.html`, selected by
  `layout: landing` in front matter, and renders byte-identically apart from the
  stylesheet fingerprint. Worth recording how nearly this was missed: an early check
  grepped the built page for a CSS **comment** from that branch and found none, so
  the branch looked like dead code. `--minify` strips CSS comments. The before/after
  page diff is what caught it.
- **The override scanner now separates slots from forks.** A slot override is the
  mechanism working; a `layouts/docs/single.html` override is a defect. Counting
  them together would have shown agentgateway.dev's shadow count going **up** (5 → 8)
  at the moment it stopped forking two layouts, which trains everyone to ignore the
  number. Real unsanctioned shadows: kgateway-oss 4 → **1**, agentgateway-oss 7 → **3**.

### Add — `OVERRIDES.md` and a re-runnable scanner for consumer files that shadow this module (`OVERRIDES.md`, `tests/helpers/scan-overrides.ts`)

- **Why.** A change that is correct in extras can still be a regression on a consumer that
  carries its own copy of the thing being changed, and nothing enumerated those copies.
  This is not hypothetical — it is what the ordered-list counter fix below did. That fix was right
  in the module, but the hub duplicated those rules in `assets/css/custom.css`, which is
  concatenated *after* the module stylesheet and so wins on equal specificity; with only the
  pin bumped, markers stopped incrementing entirely, which is **worse than the bug being
  fixed**. It was caught by eye on a real build, after the fixture was fully green. Nothing
  in the harness would have said so.
- **The fixture structurally cannot catch this class of problem.** It ships a bare
  `custom.css` precisely so the shared layers are tested without per-repo paint — so it
  exercises a CSS environment that no real consumer has.
- **What changed.** `OVERRIDES.md` documents the three distinct shadowing mechanisms and
  carries a per-consumer snapshot. Only the first is visible to a filename diff:
  1. **same-path file** — consumer `layouts/<p>` beats module `layouts/<p>`;
  2. **duplicated CSS selector** — *no filename collision at all*; `custom.css` is a
     legitimate per-repo slot, and the clash is at the selector level;
  3. **divergent markup contract** — an override emitting different class names, which
     silently scopes any extras spec matching those classes to the fixture only.
- `node tests/helpers/scan-overrides.mjs [--json]` regenerates the inventory from sibling
  consumer clones, so the snapshot can be re-derived rather than hand-maintained.
- **What the first run found**, beyond the docs hub (resolved below): `agentgateway oss`
  and `kgateway-oss` both override `layouts/docs/single.html` at a revision that never emits
  `page-badges`, `page-description`, `badge-*` or `section-card-badge`, so **those extras
  features do not render on those sites at all** — a capability gap, not cosmetic drift.
  `.hextra-toc` is redefined divergently by four of six consumers, which suggests the
  module's own default is wrong rather than four consumers each being wrong.
  `agentregistry oss` overrides `assets/css/main.css` with 1,863B against extras'
  13,368B. None of these are addressed here; they are tracked as a cleanup backlog so each
  release stays bisectable.
- No production page — this entry adds documentation and a scanner and changes no rendered
  output. Verified by running the scanner against all six consumer clones and hand-checking
  its docs-hub output against the `custom.css` cleanup below, which it drove.

### Add — a Paged.js PDF-export book pipeline, so a docs section can ship a downloadable PDF alongside the site (`layouts/docs/list.book.html`, `assets/css/print-book.css`, `layouts/_partials/utils/shift-headings.html`, `scripts/render-pdf.mjs`)

- **Why.** ambientmesh.io wanted a single downloadable PDF of its entire docs section, and
  nothing in this module (or any consumer) stitched a Hugo docs tree into one paginated
  document. Piloted entirely site-local first (see ambientmesh.io's own history) — a new Hugo
  `book` output format, a template that walks the docs tree depth-first into one long HTML
  document, and a print stylesheet for Paged.js (driven by a Playwright script) to paginate
  into a PDF. Moved here once the pattern proved out on a real site, so the next consumer that
  wants this doesn't re-solve the same problems: real tab names surviving into the linearized
  output (shared with `unhide-tabs.html`, see below), heading levels that don't invert when a
  section nests a few levels deep, empty section-landing pages reading as a stray page break
  instead of a deliberate divider, running-header breadcrumbs that don't leak a stale value
  onto the next top-level section, and internal cross-references becoming real in-PDF jumps
  instead of round-tripping through the internet for a page the reader is already holding.
- **`scripts/render-pdf.mjs` is included, but not as a Hugo module mount** — `module.mounts` in
  `hugo.toml` only covers `layouts`/`assets`/`data`, so this file is never pulled into a
  consumer's build; it just rides along in the git repo as fetchable content. A consumer's own
  Makefile curls it from GitHub, pinned to whatever version its `go.mod` already requires for
  this module (`https://raw.githubusercontent.com/solo-io/docs-theme-extras/<version>/scripts/render-pdf.mjs`),
  so the `go.mod` bump stays the single version pin — no second Makefile variable to drift out
  of sync with it. Two site-specific constants that were hardcoded during the pilot
  (`PROD_HOST`, `BOOK_PATH`) are now `PDF_PROD_HOST`/`PDF_BOOK_PATH` env vars the consumer's
  Makefile passes in, so the fetched file itself needs no editing per consumer.
- **What still does NOT move here, and why.** The `book` output format's `outputFormats` block
  (hugo.yaml top-level config isn't merged from an imported module), a page's own
  `outputs: ["html", "book"]` front-matter opt-in, and `playwright`/`pdf-lib` as npm
  devDependencies (Node resolves `node_modules` relative to the invoking project, not to
  wherever the curled script landed) all stay in the consumer.
- **Known limitation.** Proven so far only on a flat, unversioned site (ambientmesh.io, one
  fixed docs root, no `site.Params.versions`). A version line is already wired into the cover
  and footer conditionally (resolves to nothing when a site has no versions), but proper
  per-page version-root scoping for a genuinely versioned site (agw, kgw, the docs hub) is not
  done — see the comments in `list.book.html` for the exact gap.
- **No production page yet** — the PDF pilot hasn't shipped to ambientmesh.io's live site
  (checked <https://ambientmesh.io/docs/> directly: no PDF download link or mention there today).
  **Verified locally**: `make pdf` in an ambientmesh.io checkout, fetching this module's
  `render-pdf.mjs` by its pinned `go.mod` version instead of the old site-local copy, produces a
  byte-identical PDF to the pre-move version — same page count, same chapter/bookmark structure,
  same internal/external link split.
- **`v0.2.0-beta.7` shipped a wrong Makefile-snippet example** in this file's own header comment:
  `awk '{print $2}'` on a `require github.com/x/y v1.2.3` line grabs the module path, not the
  version — the leading `require` keyword shifts every field over by one, so it needed `$3`.
  Caught immediately by actually running the snippet against ambientmesh.io's real `go.mod`
  (curl 404'd on the module path instead of a version string) before it reached any real
  consumer's committed Makefile; fixed in `v0.2.0-beta.8`.
- **`v0.2.0-beta.7`/`.8` also shipped a stale pre-flight check**: `main()` still hardcoded
  `public/docs/book.html` for its existence check even though `BOOK_PATH` became configurable in
  the same change, so any consumer whose book output lands somewhere other than the site root
  (a versioned site's `/docs/envoy/latest/book.html`, say) failed immediately with a misleading
  "not found" error even though the file existed. Caught trying this pipeline against
  kgateway-oss — the first versioned consumer, and the first consumer other than ambientmesh.io
  to try it at all. Fixed in `v0.2.0-beta.9`.

### Add — the PDF pipeline can chunk a docset too big for Paged.js into several PDFs and merge them, so a versioned site's docs aren't limited to ambientmesh.io's book size (`scripts/render-pdf.mjs`, `layouts/_partials/docs/book-document.html`, `layouts/docs/{list,single}.book.html`)

- **Why.** Trying the single-document pipeline above against kgateway-oss's `latest` version
  docset (253 pages, 7.3MB stitched HTML) never completed pagination — not in 60 seconds, not
  in 5 minutes, with no JS error. Bisecting individual subsections (12 pages: 1.5s; 84 pages:
  25s — already worse than linear) confirmed this isn't a bad page poisoning the whole
  document, and a web search turned up others hitting the identical wall independently around
  150-200 pages, with WeasyPrint (a completely different, non-browser rendering engine)
  reporting the same category of problem and the same community-recommended fix: split into
  pieces, generate separate PDFs, merge them back together. This is apparently inherent to
  monolithic CSS Paged Media rendering, not a Paged.js-specific defect.
- **How it works.** A consumer opts in per top-level SECTION instead of once at the version
  root — each section page sets `outputs: ["html", "book"]` plus new `bookChunkRoot: true`
  front matter (see below), producing its own independent `book.html`. `render-pdf.mjs` now
  accepts `PDF_BOOK_PATHS` (plural, comma-separated) instead of a single path, renders each one
  through the same pipeline as before (own link rewriting, own pagination), then merges the
  resulting PDFs with `pdf-lib` and combines their outline trees (offsetting each chunk's
  page indices by the running total of pages before it) into one continuous bookmark tree.
  `PDF_BOOK_PATH` (singular) keeps working unchanged for a single-document book like
  ambientmesh.io's, and takes a fast path that skips pdf-lib's `copyPages` round-trip entirely
  — verified byte-for-byte equivalent in page count and outline structure to the pre-chunking
  output (238 pages, 50 TOC entries, identical both before and after this change).
- **`bookChunkRoot: true`** makes the opted-in page's own title render as the first
  chapter/TOC entry before recursing into its children, instead of starting silently at its
  children the way a true book root does. Without it, a merged multi-chunk PDF loses its
  section groupings entirely — a flat run of subsections with no heading marking which
  top-level section they came from, since a section landing page was never itself a chapter
  in the single-document design (only its children were, walked from the true root).
- **Set `outputs`/`bookChunkRoot` via `cascade`, not by hand-editing every section's own
  `_index.md`.** kgateway-oss's first attempt set both directly on each of its 14 chunk roots;
  a `cascade` block on the VERSION root instead (`target.path: "/docs/envoy/latest/*"` — a
  single path-segment glob, matches direct children only, confirmed NOT to reach
  `setup/listeners/` two levels down) pushes both fields onto every direct child automatically,
  and a new section added later picks them up with no content edit at all. Not a module change
  (`cascade` is plain Hugo, works today against every released version of this module) — noted
  here since it's the pattern worth reaching for instead of the per-page front matter this
  CHANGELOG entry originally described. `render-pdf.mjs`'s `PDF_BOOK_PATHS` still has to be an
  explicit, ordered list maintained by hand — Hugo has no query for "every page that opted into
  an output format" to generate it from, so a new section still needs one manual addition
  there even with the cascade in place.
- **The chunk root's title is always centered, and centering is now reserved exclusively for a
  chunk root** (`.pdf-chunk-title` CSS, a `$chunked` flag threaded through the chapter walk).
  Caught immediately when tried against kgateway-oss: the pre-existing "empty landing page gets
  a centered `.pdf-divider` treatment" rule (designed for a single-document book, where it's the
  only kind of section boundary there is) fired on an ordinary NESTED empty page
  (`setup/listeners/_index.md`, "Listeners") instead of the chunk's own root
  (`setup/_index.md`, "Gateway setup") — the two had swapped roles from what a reader would
  expect once each chunk gets its own title page automatically. Fixed by having the chunk root
  ALWAYS get a centered title (`.pdf-chunk-title` if it has real content, so the content still
  renders in normal flow below rather than being buried or dropped; the original full-page
  `.pdf-divider` only when genuinely empty, e.g. `traffic-management/_index.md`), and by
  suppressing `.pdf-divider` for any DESCENDANT of a chunk root even when empty — it still shows
  its Description as a plain paragraph (`.pdf-chapter-description`), just not centered, since
  the chunk already has a title page and a second one mid-chunk would read as a stray boundary.
  A true single-document book (ambientmesh.io, which never sets `bookChunkRoot`) is completely
  unaffected — `$chunked` is `false` throughout its whole walk, so every nested empty landing
  page (`about`, `operations`, `resiliency`, `traffic-management`, `traffic-management/ingress`)
  keeps its original centered-divider treatment exactly as before. **Verified**: ambientmesh.io's
  `book.html` is byte-for-byte identical before and after this fix; kgateway-oss's `setup` chunk
  now centers "Gateway setup" (with its real intro paragraph still rendered below) and renders
  "Listeners" as a plain heading with a left-aligned description.
- **New `layouts/docs/single.book.html`, and the refactor into `_partials/docs/book-document.html`.**
  A LEAF page (no `_index.md`, no children — kgateway's `quickstart.md`/`faqs.md`) opting into
  the `book` output format silently fell back to the site's normal HTML template instead of
  erroring, since Hugo resolves an output format's template per page KIND and this module only
  ever shipped a `list.book.html` (for section/branch pages). Caught because the resulting
  chunk had no `<script src=".../paged.polyfill.js">` at all — Paged.js was never loaded, so
  `window.PagedPolyfill` was undefined at pagination time. Fixed by extracting the actual body
  into a shared partial both `list.book.html` and the new `single.book.html` call, rather than
  duplicating ~200 lines of template between them.
- **Also fixed while testing this: a same-origin, out-of-book link resolved to the throwaway
  local Playwright server instead of the production host** (`scripts/render-pdf.mjs`'s link
  rewriter set `a.href` to a root-relative path instead of an absolute URL in its
  not-in-this-document fallback branch). This is the exact dead-link bug the whole rewrite
  exists to prevent, but it never triggered against ambientmesh.io's single-document book
  (nothing in it links to a same-origin page outside the book at all) — a multi-chunk build
  exposed it immediately, since every cross-chunk reference to a same-origin page hits this
  exact branch. Fixed by using the already-constructed `URL` object's own `.href` (which
  already carries the correct origin) instead of re-assembling one without it.
- **Only the first chunk keeps its cover page, and every chunk's own TOC is dropped** — every
  chunk's `book.html` renders a full cover + "Contents" page, since Hugo has no idea at build
  time that its output will be merged with others. Merged as-is against kgateway-oss's 14
  chunks, that stacked 14 title pages and 14 separate "Contents" pages into one PDF — and none
  of those TOCs was even complete on its own, since a chunk's TOC only ever lists its own
  descendants (`bookChunkRoot`). `renderChunk()` takes new `keepCover`/`keepToc` options
  (both default `true`, so a single-document book like ambientmesh.io's is unaffected); the
  multi-chunk loop in `main()` keeps the cover on chunk 0 only and drops every chunk's TOC
  outright, relying on the PDF's own bookmark sidebar (already complete and correct across
  every chunk, see the outline-offsetting above) for navigation instead of a second, harder-
  to-keep-in-sync table of contents. A full consolidated TOC page (real page numbers, built
  fresh once every chunk's final page count is known) was considered and set aside — real new
  engineering (a fresh render pass, a dotted-leader print style this module doesn't have,
  reworked offset math) for something the bookmark sidebar already covers. **Verified**:
  kgateway-oss's merged PDF now opens directly on one cover page, then straight into chapter
  content with no "Contents" page anywhere in its 1681 pages (down from 1709, the removed
  cover/TOC pages); ambientmesh.io's single-document PDF is unchanged (238 pages, 50 TOC
  entries, cover and Contents page both still present, same as ever).
- **Cross-chunk internal references intentionally do NOT become in-PDF jumps** — a link whose
  target ended up in a different chunk than its source has no matching element in that chunk's
  own DOM, so the existing link-rewriter (unchanged) simply doesn't find it and falls through
  to the external-URL branch above, exactly like a link genuinely outside the book. Building
  real cross-chunk jumps would mean mapping link screen positions to PDF coordinates across
  separately-rendered documents and adding manual GoTo annotations after merging — decided
  against for now as materially bigger and more fragile than the rest of this feature combined.
- **Continuous page numbers across chunks are NOT attempted.** Paged.js's own `counter-reset:
  page N` support for this has open, unresolved bug reports independent of this project. Each
  chunk's printed footer shows its own local page count instead — a known, cosmetic-only
  mismatch against the actual PDF page a reader's viewer reports, since the real navigation
  (bookmarks, the offset-adjusted outline tree above) uses actual PDF page objects and stays
  correct regardless of what text is printed in any page's footer.
- **Chunking by section, not by a page-count budget, is a real trade-off, not a universal fix.**
  kgateway's `latest` docset (biggest section: 84 pages) and agentgateway's `kubernetes/main`
  (biggest: 53 pages) both stay comfortably under the ~150-200 page ceiling with this scheme.
  But `gloo-mesh-enterprise/main/reference` in the Solo.io docs hub already has 209 markdown
  files today — a single section already past the same ceiling that broke kgateway's whole
  tree. A consumer whose sections can grow this large will eventually need to split that
  section's own `outputs` opt-in further; this module doesn't do that automatically.
- **No production page yet, same as the pipeline above** — not shipped to any live site.
  **Verified locally**: `make pdf`-equivalent run against a real kgateway-oss checkout (14
  section chunks: quickstart, about, install, setup, traffic-management, resiliency, security,
  observability, operations, reference, integrations, migrate, faqs, ai) produced a single
  merged 1709-page PDF with 14 top-level bookmarks (one per section, each pointing at the right
  absolute page) in 28 seconds total — the same docset that never finished as one document.
- **Each chunk's local page counter is now prefixed with a static "Section N" label** (e.g.
  "Section 2, Page 1"), so a reader can at least tell which chunk restarted the count, addressing
  the cosmetic mismatch the "continuous page numbers are NOT attempted" bullet above documents.
  `renderChunk()` takes a new `sectionLabel` option (default `null`, so a single-document book
  like ambientmesh.io's is unaffected — its render never logs a "Labeling page footers" line at
  all); the multi-chunk loop in `main()` passes `Section ${i + 1}` from its own existing loop
  index. Injected as a `page.addStyleTag()` call overriding `@bottom-center`'s `content` right
  before `PagedPolyfill.preview()` runs, rather than edited into `print-book.css` itself — Hugo
  builds each chunk's `book.html` with no idea what position it'll occupy in the final merged
  PDF, so only this script's own chunk loop knows the number to use. **Verified**: extracting
  every page's footer text from a real 2-chunk kgateway-oss merge (`setup` + `observability`)
  shows "Section 1, Page 1" through "Section 1, Page 194", then "Section 2, Page 1" through
  "Section 2, Page 55" — the restart is now labeled instead of silently ambiguous.
- **A section landing page's auto-generated child cards (e.g. a `## Guides` heading with no
  manual `{{< cards >}}`) never appeared in the book at all** (`layouts/_partials/docs/
  book-document.html`). The live site's `docs/list.html` renders `partials/auto-section-cards.
  html` AFTER `.Content` for exactly this case — the book's chapter walk rendered `.Content`
  but never called that partial, so a heading like kgateway-oss's `observability/_index.md`
  ("## Guides") printed with nothing under it, and the same gap silently affected ambientmesh.io
  too (`observability`, `security` both rely on auto-cards). Fixed by calling
  `auto-section-cards.html` after content in both the chunk-root and per-descendant branches of
  the chapter walk; it already no-ops on its own for a page with no children, `disableCards:
  true`, or manual cards. Rendered in `print-book.css` as a plain bordered-box list rather than
  the live site's card grid — Paged.js's page-break decisions around a CSS grid/flex row are
  unpredictable, and a PDF has no hover/click affordance to preserve anyway. A card's `icon`
  front matter can resolve to a bare Material Icons ligature name (`<i class="material-icons">`)
  instead of an `<svg>`; that font isn't loaded by this standalone document, so it's hidden
  outright rather than printing literal text like "monitoring" next to a card title — not
  triggered by either proven consumer today (no child page under either site sets `icon`), but
  a real gap the same activation would otherwise have shipped silently. **Verified**: the card
  links for both kgateway-oss's Observability chapter and ambientmesh.io's Observability/Security
  chapters now render with real title/description text extractable from the PDF; ambientmesh.io's
  page count goes from 238 to 241 (the newly-rendered card content), its 50 TOC entries unchanged.
- **A wide reference table visibly changed column widths from one page to the next, and on at
  least one page ran past the right margin entirely** (`assets/css/print-book.css`) — reported
  against kgateway-oss's "Control plane metrics" table. `table-layout` was never set, so it
  defaulted to `auto`: when Paged.js splits a table across a page break, each resulting page
  fragment is effectively a separate table for column-width purposes, and the browser reruns its
  content-based width algorithm against only the rows that fragment holds — visibly shifting
  column widths page to page. Worse, an unbroken long token (a full metric name like
  `kgateway_resources_updates_dropped_total`) can grow its column past the page's own content
  box under `auto`, which is the overflow the report's screenshot showed. Fixed with
  `table-layout: fixed` (pins every fragment to the same column widths, set once from the first
  row) plus `overflow-wrap: break-word` on `th`/`td` (required alongside `fixed` — a fixed-width
  column no longer grows to fit a long token, so without wrapping that token would overflow its
  own cell instead of the whole table overflowing the page). **Verified**: re-rendered
  kgateway-oss's `observability` chunk and measured every page's table bounding box directly
  (`pymupdf`'s `find_tables()`) across the 8-page "Control plane metrics" table — width now
  562.1-562.2pt on every page (previously varying and, once, over the 612pt page width), 0
  overflow.

### Fix — the navbar's Solo corporate mark links to `docs.solo.io`, not the current product's own home page (`layouts/partials/navbar-title.html`)

- **Why.** In the older enterprise logo arrangement (`params.sidebar.logo` set to the product
  mark, `params.navbar.logo` carrying the Solo corporate mark), the navbar logo's link had no
  brand-aware default and fell back to `.Site.Home.RelPermalink` — the current product's own
  docs home. Clicking the Solo mark took a reader to, say, `/gloo-mesh-enterprise/latest/`
  again instead of to Solo's corporate docs hub. The newer arrangement (product lockup in the
  navbar, Solo mark moved to `params.footer.logo`, shipped in v0.1.21) isn't affected — there
  the navbar logo is the product's own mark, and linking home is correct.
- **The fix reuses an existing signal instead of adding a new config key.** `sidebar.logo` being
  set already meant "the navbar carries the Solo mark, not the product's own mark" (it's the
  same condition `$hasMobileLogo` already computed, a few lines down, to decide whether the
  navbar logo is desktop-only). `$defaultLogoLink` now reads that same signal: `docs.solo.io`
  when `sidebar.logo` is set, the site's own home otherwise. An explicit
  `params.navbar.logo.link` still overrides either default. This avoids repeating the same
  literal URL across every enterprise product's `hugo-<product>.toml`.
- Observable in production today (the bug, pre-fix): the Solo mark at the top left of
  [docs.solo.io/gloo-mesh-enterprise/latest/](https://docs.solo.io/gloo-mesh-enterprise/latest/)
  links back into the same product tree instead of to `docs.solo.io`.
- **Test gap.** The module's own fixture (`hugo-enterprise-local.toml`) has already fully moved
  to the newer footer-logo arrangement and no longer exercises the `sidebar.logo`-set shape this
  fix targets, so there's no automated coverage for it in this repo. Verifying requires either a
  temporary fixture config with `sidebar.logo` set, or checking a real consumer (`docs`) build
  after it bumps its pin. Takes effect when a consumer bumps its extras pin.

### Fix — an unhidden tab panel is labeled with its real tab name, not the internal DOM id its `aria-labelledby` pointed at (`layouts/_partials/utils/unhide-tabs.html`)

- **Why.** Linear-reading contexts (markdown export, PDF/book stitching) unhide every Hextra
  tab panel and label it "Option: X", but X came from the panel's `aria-labelledby` attribute —
  an autogenerated id like `tabs-tab-tabs-03-1`, not the tab's visible name (e.g. "Service",
  "Pod"). The real name only exists on the tab *button*, two `<span>`s deep, and that whole
  button bar gets stripped in the same pass. Fixed by capturing each button's visible name into
  an id->name map before the buttons are discarded, then using it when unhiding the matching
  panel. While fixing this, also found and fixed a Hugo template bug: plain `replace` takes its
  subject FIRST (`replace SUBJECT OLD NEW`), unlike `replaceRE`, which takes it last — piping
  the subject in the way `replaceRE` is piped elsewhere in this file silently put it in the
  wrong argument slot, collapsing an entire page's content down to a few dozen characters
  whenever it contained tabs, with no build error. Separately, a tab whose content hand-numbers
  its list to continue from the step it's nested under (via `<ol start="N">`) now has that
  `start` attribute stripped, so the option reads as its own list starting at 1 once every
  option is unhidden and stacked in a linear document, rather than one long sequence that skips
  straight to N.
- **Production page confirms the bug**: <https://ambientmesh.io/docs/waypoints/configuration.md>
  (the markdown export this partial actually runs for — the interactive HTML page uses real JS
  tabs and never touches this code path) currently shows "Option: tabs-tab-tabs-03-0" /
  "...-03-1" / "...-03-2" for what should be "Option: Namespace" / "Service" / "Pod".
  **Verified the fix locally**: with the fix, that same page's PDF book output shows the correct
  names, with each option's content fully present (the `replace` bug had been silently
  truncating this exact page to ~170 characters); a tabs block whose second option was
  hand-numbered steps 6-7 (`content/docs/resiliency/circuit-breakers.md`) now restarts at 1-2 in
  the unhidden output.

### Fix — `link`/`link-hextra` no longer drops a flat, unversioned site's own path prefix (`layouts/_partials/utils/resolve-link.html`)

- **Why.** The shortcode derives the `/docs`-style prefix that belongs before a version segment
  by finding a version segment in the current page's URL and treating everything before it as
  the root. A site with no `site.Params.versions` at all (ambientmesh.io) has no version segment
  anywhere, so that prefix was never established and silently disappeared from every
  `{{< link path="/foo/" >}}` call — `path="/security/verify-mtls/"` resolved to
  `/security/verify-mtls/` instead of `/docs/security/verify-mtls/`. Confirmed by reading the
  tagged v0.2.0-beta.5 source directly and by a local build of ambientmesh.io against that
  pinned version (no local override): the same page's rendered `href` was missing `/docs/`.
  Fixed by falling back to `.Page.FirstSection.RelPermalink` specifically when
  `site.Params.versions` is absent — the same lookup `link`'s pre-unification implementation
  used, which was only ever wrong for a *versioned* OSS site, never for this flat-site case.
- **Note on production.** <https://ambientmesh.io/docs/setup/sidecar-migration/> currently
  renders this link correctly in production, which appears to mean the live site isn't built
  from the same v0.2.0-beta.5 state this repo has tagged — not something resolved from inside
  this repo. Not relying on a live URL for verification here; see below instead.
- **Verified locally.** Rebuilding ambientmesh.io with the fix: `content/docs/setup/sidecar-migration.md`'s
  `{{< link path="/security/verify-mtls/" >}}` call renders `href=/docs/security/verify-mtls/`;
  a site-wide sweep of the built PDF book output found 0 remaining internal links missing the
  `/docs/` prefix (down from several dozen with the unpatched v0.2.0-beta.5) and 0
  double-prefixed (`/docs/docs/`) regressions.

### Fix — `link` is now an alias for `link-hextra`, so it stops silently mis-resolving reused/rebased content (`layouts/_shortcodes/{link,link-hextra,reuse,rebase}.html`, `layouts/_partials/utils/resolve-link.html`, `USAGE.md`)

- **Why.** `link` resolved `path` against `.Page.FirstSection.RelPermalink` — no notion of
  version or product. That happens to work on the docs hub, where a product's own build treats
  the version as the true top-level section, but not on a standalone OSS site (kgateway.dev,
  agentgateway.dev), where one build serves multiple doc flavors under path segments several
  levels deep. `link` also had no equivalent of `link-hextra`'s product-aware `reference/api` /
  `reference/cel` cross-flavor routing, and `reuse.html` / `rebase.html` only ever injected the
  `version`/`product` args they compute into `link-hextra` calls, never into `link` calls — so a
  `link` call inside content pulled across products via `rebase` had no way to land on the right
  page. Measured on a live page: [Request retries](https://docs.solo.io/kgateway/2.3.x/resiliency/retry/retry/)
  rebases `conrefs/kgateway/envoy/main/resiliency/retry/retry.md`, which reuses a `link
  path="/quickstart/"` snippet; before this fix the rendered "Get started guide" link was
  `https://kgateway.dev/kgateway/2.3.x/quickstart/` — the OSS site's domain glued to the
  enterprise site's path shape, a broken URL that had shipped silently because nothing 404s on a
  mixed domain/path until a reader actually clicks it.
- **What changed.** `link` and `link-hextra` now share one implementation,
  `utils/resolve-link.html`, called via a plain `partial` from both shortcode files (not the
  `alert`-calls-`callout` pattern of building a shortcode string and re-expanding it through
  `RenderString` — link-hextra's output is a bare URL with no markdown to reprocess, and routing
  it through RenderString anyway broke version inference inside doubly-nested contexts, such as a
  `card` shortcode's own RenderString evaluation of a backtick-quoted `link=` attribute; a plain
  partial call passes `.Page` straight through instead). `reuse.html` and `rebase.html` now inject
  `version`/`product` into `link` calls exactly as they already did for `link-hextra`. Two
  supporting fixes surfaced by the merge: a `path` with no leading slash used to fuse silently
  with the version segment (documented as a known trap); it's now normalized for both names,
  since a docs-hub-wide scan found dozens of real `link path="foo/"` call sites (kgateway,
  agentregistry, gateway, gloo-mesh-*, istio, JA translations) that only worked because `link`'s
  old implementation always inserted the separator itself. Version inference also now checks a
  segment against the site's own configured `site.Params.versions` (the same check `reuse.html` /
  `rebase.html` already use), not just the hardcoded `X.Y.x`/`latest`/`main` shape regex, so a site
  free to name its versions however it likes is recognized correctly either way.
- **`link` keeps `link-hextra`'s existing production behavior, including absolute URLs.**
  `link-hextra` has always emitted a full `https://docs.solo.io/...` URL (rather than a
  root-relative `/kgateway/...` one) whenever a build's `baseURL` is a real domain, which is true
  of every docs-hub production build (preview and local builds use path-only baseURLs, so they're
  unaffected). `link` now inherits that identically — this was a deliberate call, not an
  oversight, made after surfacing that it changes ~1,000 hrefs per docs-hub product build from
  root-relative to absolute on the next rebuild. Nothing 404s either way.
- **A site with no versioning at all is not a missed inference — there is no version to find.**
  Forwarding `link` here meant every plain `link path="/foo/"` call on a single-tree site with no
  `site.Params.versions` (ambientmesh.io) hit "could not infer a version" and fell back to a
  `/latest/` prefix that does not exist on that site. Worse, the naive fix — checking
  `gt (len $.Site.Params.versions) 0` — crashed the ambientmesh.io build outright:
  `len` on a completely unset Params key panics with "reflect: call of reflect.Value.Type on zero
  Value" specifically inside the `EXECUTE-AS-TEMPLATE` re-execution Hugo does for flexsearch's
  `search-data.json`, even though `range` over the same unset value is a safe no-op elsewhere in
  this same file. Counting via `range` instead avoids the crash. A site with no configured
  versions now resolves `link`/`link-hextra` with no version segment at all and no warning —
  confirmed on a real page, [Migrate a sidecar to ambient](https://ambientmesh.io/docs/setup/sidecar-migration/)
  (`{{< link path="/setup/add-workloads/" >}}`), which resolves to `/setup/add-workloads/` with a
  clean `hugo160 --gc` build log (previously two WARNs and, before the `range` fix, a hard build
  error).
- **Verified.** Full `test-all` suite (both OSS and enterprise fixtures, `static` + `content`
  projects): 1,464 + 170 passed on each brand, 0 failed, 0 unexpected warnings. Real builds:
  kgateway-oss (2,860 pages) diffs byte-identical against its pre-change baseline outside
  `llms.txt` timestamps. The docs hub's kgateway product (1,842 pages) diffs on 1,036 pages,
  entirely explained by the accepted absolute-URL change above and by broken `kgateway.dev`/
  `docs.solo.io` domain-mixing links like the retry-page example being corrected — spot-checked
  across the diff for any newly-introduced `/latest/` fallback or unexpected domain; found none.
  ambientmesh.io (no `site.Params.versions`) builds clean with `hugo160 --gc`, no warnings, no
  errors.

### Fix — link and accent TEXT gets its own contrast-safe token, so it stops failing WCAG AA (`assets/css/brand-{oss,enterprise}.css`, `assets/css/docs-theme-extras.css`, `layouts/_shortcodes/openapi.html`, `tests/contrast.spec.ts`)

- **Enterprise body links could not pass WCAG AA against any background at all. `#158bc2` has a relative luminance of 0.2252, which caps it at 3.82:1 even on pure white — below the 4.5:1 floor for normal-size text (WCAG 1.4.3) — so every link in the enterprise docs body, every active tab label, and every section-card title failed, down to 3.29:1 inside a `.alert-default` callout.** No background adjustment could rescue it; the color itself had to change. The root cause is that one `--theme-primary` was serving two jobs with different floors: text needs 4.5:1, while icons, borders, and other non-text UI need only 3:1 (1.4.11). A single value cannot satisfy both without over-darkening every accent in the theme. Both brand layers now define `--theme-link` / `--theme-link-hover` alongside `--theme-primary`, with `.dark` overrides, and only the text-bearing rules were repointed at them: `.content a`, `.version-banner a`, `.docs-tab-active`, `.hextra-tabs-toggle[data-state="selected"]`, `.sidebar-mobile-tab-active`, and the `copy-md-btn` / `version-dropdown` hover states. Alert icons, `.section-card-icon`, and every accent border stay on `--theme-primary`, which already clears the 3:1 they are held to.
- **Each new value is the smallest perceptual step (CIEDE2000) from the current color that clears 4.5:1 on every surface that text can land on** — solved against the seven light and six dark backgrounds in the theme, the darkest being the `.alert-default` callout fill `#eaeefb` (26 of 160 real callouts across the consumer repos pass no `type`/`context` and land there, since `$ctx := or $type "default"`). Enterprise light moves `#158bc2` → `#0274a0` (dE 9.08, the one unavoidably visible change, worst ratio 4.52:1) and keeps the existing `#106a94` as its hover. Enterprise dark moves to `#2f93c7` (dE 2.94, near-imperceptible, 4.54:1). **OSS light does not change at all** — `#0060cf` already cleared 5.07:1; the token just makes the value explicit.
- **Dark mode had no link color of its own in either brand.** The enterprise rule hardcoded `#158bc2` with no `.dark` variant, and OSS inherited Hextra's prose link color, which emits one value for both schemes — so link text was the single component that never flipped with the theme, and OSS dark links sat at 3.21:1. Painting `.content a` in the component layer from a token the brand layers override under `.dark` is what fixes this; OSS dark links now use the brand's own dark accent, matching every other dark component.
- **Also fixed two failures in the OpenAPI widget (`openapi.html`), where the light-island `!important` block was incomplete.** swagger-ui's own sheet declares `.swagger-ui a.nostyle { color: inherit }`, and `inherit` resolves against the theme rather than the `color` pinned on `.swagger-ui` — so in dark mode an opblock-tag heading inherited the theme's near-white body text and rendered white on the deliberately-white panel: **1.00:1, literally invisible**. Tag headings are now pinned to the island's `#333333`. Real links inside the widget move off swagger's stock `#4990e2` (3.10:1 against the `#ffffff` panel and `#f8f8f8` summary strip) to `#1074ca`, the smallest step that clears 4.52:1.
- Observable in production on [Gloo Gateway 1.21.x — Quickstart](https://docs.solo.io/gateway/1.21.x/quickstart/): `.content a` computes to `rgb(21, 139, 194)` in **both** light and dark mode (the served `brand-enterprise.css` has no `.dark` variant), scoring 3.82:1 on the white page. Verified by auditing every built fixture page in both brands, both schemes, compositing each element's real background up the ancestor chain: enterprise went 16 → 0 failures and OSS 12 → 0, across 49 distinct color/background/size combinations on 66 pages. `tests/contrast.spec.ts` gains an "accent text contrast" block that re-derives this from the build rather than trusting the numbers in these comments — it samples the accent-colored text selectors on every configured page in both schemes, applies the correct floor per element (3:1 only for genuinely large text), and dedupes identical visual states. Confirmed it fails on the pre-fix color (`3.82 < 4.5 — content fg=rgb(21, 139, 194)`) and passes after. Full `make test-all` green on both brands (1811 passed, 14 skipped each; the one unrelated `gate-transparency` shape-07 failure reproduces on the branch without these changes). Takes effect when a consumer bumps its extras pin.
- **Measurement note for anyone extending this spec:** transitions must be disabled before reading computed styles. Several rules transition `color`, so sampling right after a `.dark` class flip returns a mid-interpolation value — `.sidebar-link` reports its light gray for ~150ms, which produced two phantom "failures" during this investigation that were not real. The spec injects a `transition:none !important` stylesheet first, and alpha-composites backgrounds, since the dark banner and alert fills are `hsla(…, 0.1)` and their computed `background-color` is not what the eye sees.

### Fix — CI failed on every build because `package.json` never declared the `parse5` dev dependency it uses (`package.json`, `package-lock.json`)

- **Why.** `tests/helpers/ancestor-path.ts` (added for the gate-containment work below) imports
  `parse5`, and at some point it ended up resolvable in `node_modules`/`package-lock.json`
  without ever being added to `package.json`'s `devDependencies`. Hugo's `hugo mod npm pack`
  compares the two and fails the build with `WARN npm dependencies are out of sync`, which
  `tests/hugo-warnings.spec.ts` treats as a hard failure — so both `brand (oss)` and
  `brand (enterprise)` CI jobs went red on this PR. A later `package-lock.json` regeneration
  (adding the `packages/hugoautogen` npm workspace) then dropped the undeclared `parse5`
  entry from the lockfile entirely, which would have made `gate-containment.spec.ts` fail to
  even resolve its import on a clean `npm ci`.
- **What changed.** Added `"parse5": "^8.0.1"` to `devDependencies`, reran `npm install` and
  `hugo mod npm pack` to resync `packages/hugoautogen/hugo_packagemeta.json`.
- **Verified.** `hugo160 --config hugo-oss.toml --gc` / `--config hugo-enterprise.toml --gc`
  no longer warn about npm sync; full `test-oss` and `test-content` suites pass on both
  brands (1636/1636, 3 skipped) with a clean `npm install`.

### Fix — `link-hextra` works on sites whose docs are not at the URL root, so two consumers can stop forking it (`layouts/_shortcodes/link-hextra.html`, `tests/link-hextra-{lts-version,lang-prefix}.spec.ts`)

- **Why.** Version inference was two regexes: one anchored to a known product name
  (`kgateway|agentgateway|gateway|envoy`), one anchored to the start of the URL. Between
  them they recognized only the docs hub's URL shape. An OSS site serves
  `/docs/envoy/2.1.x/…` and `/docs/standalone/latest/…`, where no segment is a product name
  and the version is not first — so `kgateway.dev` inferred the version but **lost the
  `/docs/envoy` prefix**, emitting `/2.1.x/quickstart/` for a page that lives at
  `/docs/envoy/2.1.x/quickstart/`, and `agentgateway.dev` could not infer a version at all
  and fell through to `/latest/…`. That is why both repos carry their own fork of this file,
  and why `OVERRIDES.md` described those forks as stale 587B/940B stubs. They are not stale.
  They are the only reason those sites' links work.
- **What changed.** Inference walks path segments, takes the first that looks like a version,
  and records everything before it as the **version root**. The root is then part of the
  emitted URL. The docs hub is unaffected because its baseURL carries the product
  (`https://docs.solo.io/kgateway/`) and the shortcode already strips that prefix, so its
  root comes out empty and the URL is the same string as before.
- **Also added:** a warning when `path` is empty. That fails silently today — the shortcode
  emits a bare version root, which is often a real page, so nothing 404s and nobody notices.
  It caught two `agentgateway.dev` pages calling `{{< link-hextra link="https://…" >}}`;
  `link` is not a parameter on any copy of this shortcode, so `path` was empty and the href
  pointed at the section root instead of the intended cross-flavor target. Fixed in that repo
  as plain relative links, since a cross-flavor link is not a same-version-tree link and
  `link-hextra` cannot express one.
- **Verified on three real builds.**
  [kgateway docs](https://kgateway.dev/docs/envoy/latest/quickstart/): 266,013 versioned
  internal links, **0 broken**, and the only diff against the fork's output across 104 pages
  is a trailing slash (`/overview` → `/overview/`, one fewer redirect).
  [agentgateway docs](https://agentgateway.dev/docs/kubernetes/latest/): 352,212 links,
  **30 broken before and after** — all pre-existing dead targets, none introduced — and the
  two `/latest/` cases gone. [Docs hub kgateway](https://docs.solo.io/kgateway/latest/):
  **0 of 769 HTML pages differ** (166 files differ, every one an `llms.txt` timestamp).
- **Sequencing:** the two consumer forks can only be deleted AFTER a release carrying this
  fix and a pin bump to it. Deleting them against an older pin breaks 913 pages on
  agentgateway.dev and 637 on kgateway.dev. **Both are now deleted**, against the
  `v0.2.0-beta.2` pin, and both deletions were re-verified on a fresh before/after
  `--gc --minify` build: agentgateway.dev **356 of 1,516 pages differ, 535 href changes**;
  kgateway.dev **104 of 1,161 pages differ, 130 href changes**; **100% of those changes are a
  trailing slash being added**, with zero links retargeted and zero link-count changes. The
  remaining diffs are `llms.txt` build timestamps.
- **The input contract is now tested and documented, which it was not.** This shortcode had
  16 tests across three files and **none of them covered what `path` may contain** — they
  pinned path REWRITING (`reference/api` → enterprise subpages, cel collapsing) and version
  inference, both of which assume you already know what a valid path looks like. `USAGE.md`
  had one sentence and no parameter list. That is why the `link=` misuse above went
  unnoticed: there was nothing to read and nothing that failed. Added
  `tests/link-hextra-shapes.spec.ts` (11 tests) over a new fixture page, covering the
  working shapes AND pinning the broken ones — notably that a `path` with **no leading
  slash silently fuses with the version** (`/2.1.x` + `quickstart/` → `/2.1.xquickstart/`),
  which I found by writing the test rather than by reasoning, having first written the
  fixture prose claiming it worked. `USAGE.md` now carries the parameter table, worked
  examples, and a "what does NOT work" table covering external URLs, cross-flavor links,
  wrong parameter names, and both slash traps.

### Fix — reference tables no longer cut off their last column (`assets/css/docs-theme-extras.css`, fixture, `tests/table-display.spec.ts`)

- **Why.** On
  [gateway 1.22.x open_source_helm_chart_values](https://docs.solo.io/gateway/1.22.x/reference/helm/open_source_helm_chart_values/)
  the Description column is cut off mid-word — "The container image's hash digest (e",
  "consumed when v" — on every row. Measured at a 1440px viewport: the table box is 832px
  wide while its four columns end at 1250px, so 115px of the last column paints outside the
  box. Worse, `.table-wrapper` reports `scrollWidth == clientWidth` and will not scroll, so
  the wrapper built to reveal that overflow does nothing; the reader has to find and drag a
  scrollbar on the `<table>` itself.
- **Root cause.** Hextra's typography layer renders content tables `display: block`. A
  `display: block` element is not a table box, so of the two declarations extras sets right
  next to it, `width: 100%` sized the *block* while the anonymous table inside sized to its
  own content and spilled out, and `table-layout` did not apply at all. Both had been inert
  since they were written.
- **What changed.** `.table-wrapper table` now also sets `display: table`. The columns are
  laid out inside `width: 100%`, nothing paints outside the box, and where content genuinely
  cannot fit, `.table-wrapper`'s `overflow-x: auto` scrolls as designed. This is containment,
  not restyling: **column widths are byte-for-byte unchanged** (262/86/223/375 before and
  after on that page, at 1440px, 768px and 375px alike).
- **Scale.** A 40-page sample of the docs hub found **169 tables** painting outside their
  box, most of them plain markdown tables rather than `table`-shortcode ones. After the fix,
  a 120-page / **4,425-table** sweep across `gateway`, `kgateway`, `istio`,
  `gloo-mesh-gateway` and `gloo-mesh-enterprise` finds **0**, with 225 wrappers now
  scrolling legitimately.
- **Two rejected alternatives, both measured.** (1) Stripping render-table.html's inline
  `white-space: nowrap` from short cells removed the overflow but let `overflow-wrap:
  anywhere` collapse the short columns — the `Type` column rendered `b/o/o/l` down four
  lines and the long dotted keys went from 3 lines to 10. (2) Capping cells at `max-width:
  20rem` fixed this page and only this page; the value was tuned to one table at one
  viewport.
- **Verified.** New fixture section (four columns, short leading cells, long prose
  Description — the exact shape that broke) plus two specs in `table-display.spec.ts`. Both
  break-tested: removing `display: table` turns them red. Phone-width check across 50 pages
  and **68,562 cells** at 375px found no page-level horizontal scroll and 2 marginally
  narrow cells, both identical on production. Full fixture suite green on both brands;
  content scanners green on all five hub products.
- **Note on the earlier `wrap` mode wording.** A comment in the CSS used to call the inline
  `white-space: nowrap` on short cells "harmless, they're short by definition". That was the
  wrong suspect for this bug but the comment is now corrected rather than deleted, so the
  measurement does not have to be redone.

### Fix — `copy-md-fidelity` counted markup inside HTML comments (`tests/helpers/copy-md.ts`, `tests/copy-md-fidelity.spec.ts`)

- **Why.** Six `mangled-table` defects on
  [gateway/*/security/extauth/oauth/keycloak](https://docs.solo.io/gateway/latest/security/extauth/oauth/keycloak/)
  — "page renders a data table but its markdown has no GFM table row". It doesn't render one.
  `assets/gateway-docs/pages/security/oauth-keycloak.md` ends with a 29-line draft wrapped in
  `<!--If we add authorization code … -->`. Hugo expands shortcodes **before** markdown, so the
  `{{< reuse >}}` inside the comment still runs and a fully-rendered `<table>` lands in the
  output — **inside the comment**, where no reader will ever see it. Measured: the comment spans
  bytes 240061–253253 and the table sits at 249032. The page markdown correctly omits it; the
  scanner called that a defect.
- **What changed.** `stripHtmlComments`, applied in `htmlHasDataTable`, `htmlHasMermaid` and
  `cardDescriptions`. `PRODUCT=gateway` content goes from **1 failed / 156 passed to 160 passed**.
  Four unit tests pin it, including that a real table elsewhere on the same page still counts.
- **I got this wrong twice first, and both mistakes have the same shape.** Diagnosis one: "the
  table is ejected 22KB downstream and renders after Cleanup" — no, the source puts it there
  (`## Cleanup` is line 147, the reuse is line 176). Diagnosis two: "blank lines inside the
  comment are breaking it", the known `html-comment-blank-line` shape — no, tested, stripping
  every blank line changed nothing. Both came from reading the raw byte stream as if it were the
  rendered document. Added to `tests/HAZARDS.md` as #7: **"present in the served bytes" is not
  "rendered to the reader."**

### Fix — content defects unblocked by the v0.1.26 `<ol start>` fix (no module change)

- **The istio "Global Services" step was duplicated into every tab** as a workaround for the
  pre-v0.1.26 bug where CSS counters ignored `<ol start>`. That fix shipped, so the workaround
  is gone: **10 duplicate steps removed across 3 files and 8 source blocks**
  (`assets/istio-docs/snippets/apps/{global,bookinfo-global}.md`,
  `assets/istio-docs/pages/istio/apps/multi/global.md`). Verified on
  [istio 1.31.x sidecar sample-apps](https://docs.solo.io/istio/1.31.x/sidecar/sample-apps/):
  38 → 28 rendered steps, `<ol start="3">` now appears 10 times where it appeared 0 times, and
  a parse5-style ancestor check confirms the surviving step sits in
  `div/ol/li/ol[start=3]/li/p` — outside the tabs — rather than inside a tab panel.
  Marker glyph verified by **pixel comparison with a negative control**: the rendered marker is
  byte-identical to a forced `content:"c"` and differs from both `"a"` and `"3"`. (Per
  `tests/HAZARDS.md` #3, `getComputedStyle(::before).content` cannot answer this — it returns
  `counter(list-item, lower-alpha)` either way. My first clip captured empty space and the
  negative control caught it.)
- **A blank line after `{{< /tabs >}}` is mandatory**, and this was not in the original plan.
  Collapsing the step without one renders it as **literal markdown** —
  `</ol>3. Navigate to **Global Services**`, asterisks visible. So the duplication was working
  around two problems, not just the `<ol start>` one.
- **An `&lt;br /&gt;` leak on two kgateway API-reference pages** traced to a single stray
  backslash: `applied.\<br />` in
  `assets/{kgw-docs,conrefs}/pages/.../enterprise-kgateway_2.{1,2}.md`. The 2.3 file was already
  correct, which is what made the diff obvious. `PRODUCT=kgateway` content tests go from
  **1 failed / 156 passed to 157 passed**. Note the first fix attempt missed a **second copy of
  the same file** under `assets/conrefs/pages/gateway/…`; the build was the only thing that
  caught it.
- **Two findings logged rather than fixed**, both pre-existing and neither caused by this work:
  the gateway keycloak settings table renders ~22KB downstream of its source, after the Cleanup
  section and adding a trailing
  newline does NOT fix it); and the API-reference generators emit literal `<br />` inside code
  spans in **27 files**, so readers see the characters `<br />` printed in the docs (plan item
  7p — belongs in the generator, not a bulk content edit).

### Fix — the docs hub's `gloss` shortcode injected blank lines mid-sentence

- **Why.** The hub carried its own `layouts/_shortcodes/gloss.html`, functionally identical to
  the module's but **not flattened to a single line**. Every glossary term therefore emitted
  newline runs into the surrounding prose. On
  [docs.solo.io/kgateway/latest/install/helm/](https://docs.solo.io/kgateway/latest/install/helm/)
  the source sentence rendered as `you install the Solo Enterprise for kgateway ⏎⏎⏎ control
  plane ⏎⏎⏎ in a Kubernetes cluster`. HTML collapses that in the body, so it is invisible on
  the page — but it is **not** collapsed everywhere: `2.1.x/about/architecture`'s
  `<meta name="description">` shipped `data plane . These components`, with a space before the
  period. Same flatten rationale already applied to `reuse.html` and `alert.html`.
- **What changed.** Nothing in the module — the hub's shadow was **deleted** so the module's
  already-correct version applies. Verified on a before/after `PRODUCT=kgateway` build:
  **29 pages differ and every single edit is whitespace** — 42 removals of
  `&#10;&#10;&#10;&#10;` and 18 of a stray space, **zero content changes**, checked by
  normalising whitespace and confirming the files then match byte-for-byte.
- **`table.html` deleted too, and this one is a visual change.** All 18 hub call sites pass no
  argument, so there is no clash with the module's `mode=` parameter (the hub's took a
  positional CSS class). **12 pages change**, all
  `gateway/*/reference/helm/*_helm_chart_values`:
  `<div class="hx:overflow-x-auto">` becomes `<div class="solo-table solo-table--wrap">`.
  Horizontal scroll survives either way — `.table-wrapper` already carries `overflow-x: auto`
  and is present in both builds — so the effect is that cells stop being capped at 24rem and
  fill the body width, which is what `wrap` mode is documented to do. **Include these pages in
  the visual pass.**
- **`card.html` and `cards.html` must stay, and deleting them FAILS THE BUILD.** Not a judgment
  call: `ERROR icon "open_in_new" not found`. The hub uses the Material Icons font and passes
  font ligature names; the module looks names up in `site.Data.icons` as inline SVG and
  `errorf`s on a miss. The hub's `icons.yaml` has two entries, both product logos. This is the
  third "stale stub" in this effort that turned out to be a deliberate adaptation, after both
  `link-hextra` forks.
- **A grep of the hub's own tree is not enough to judge a hub shortcode.** `gloss` looked like
  it had **zero** uses in `docs/content` and `docs/assets` — and would have, if that were the
  whole corpus. It has 26, arriving through the pinned `kgateway.dev` module mount. `icon` has
  4 by the same route and is live. Always count usage in the pinned modules a product imports,
  not just the repo you are standing in.

### Fix — search "Other versions" dropped `main` and `latest` on three production sites, and filtered nothing at all on a fourth (`assets/js/flexsearch.js`, `tests/search-visible-versions.spec.ts`)

- **Why.** `visibleVersions` decides which versions may appear under "Other versions" in
  search results. It was built from `params.versions` alone and keyed on each entry's
  `version`. Both halves are wrong, and both fail in a way nothing surfaces:
  - The filter compares against a **URL path segment** (`getVersionFromURL`), so the set has
    to hold segments. Where a config declares `version = "2.5.x"` with
    `linkVersion = "main"`, the entry can never match — and three production sites do exactly
    that for their two newest versions, so a search run from an older version returned **no
    results at all for main or latest**, the two versions a reader is most likely to want.
    Confirmed live before the fix by reading each shipped bundle:
    [kgateway.dev](https://kgateway.dev/docs/envoy/latest/) served
    `["2.5.x","2.4.x","2.3.x","2.2.x","2.1.x"]` for pages that live at `/docs/envoy/main/`
    and `/docs/envoy/latest/`;
    [gloo-mesh-enterprise](https://docs.solo.io/gloo-mesh-enterprise/main/) and
    [gloo-mesh-gateway](https://docs.solo.io/gloo-mesh-gateway/main/) served
    `["2.14.x","2.13.x",…]` for pages at `/main/` and `/latest/`.
  - Versions declared under `params.sections.<x>.versions` were not collected at all.
    [agentgateway.dev](https://agentgateway.dev/docs/kubernetes/latest/) configures versions
    **only** that way, so its set came out empty — and an empty set *disables* the filter
    (`visibleVersions.size === 0 || …`), so hidden versions were offered rather than
    suppressed. That one line is the entire reason that repo forks this 20KB file.
- **What changed.** Collection now walks `params.versions` **and** every
  `params.sections.<x>.versions`, and keys on `linkVersion | default .version`. This is not a
  new convention: `_partials/utils/warn-missing-description.html` already did exactly this.
  `flexsearch.js` was simply the one place that never got updated.
- **Verified by build, on all three real shapes.** Against a local `replace`:
  `PRODUCT=gloo-mesh-enterprise` moves from `["2.14.x","2.13.x",…]` to `["main","latest",…]`
  with the other eight entries unchanged; `kgateway-oss` moves from
  `["2.5.x","2.4.x",…]` to `["main","latest","2.3.x","2.2.x","2.1.x"]`; and
  `agentgateway.dev` with its fork **removed** produces a search bundle **byte-identical** to
  the one the fork produces, which is what makes the fork deletable. The remaining consumers
  (`ambientmesh.io`, `agentregistry`, `kagent`) declare no `linkVersion` at all, so the
  fallback leaves their output unchanged.
- **Consumer action — done.** agentgateway oss `/assets/js/flexsearch.js` is deleted
  against the `v0.2.0-beta.2` pin. No other consumer had a fork of this file. Confirmed
  harmless by rebuilding: the search bundle keeps the **same fingerprint hash**, so the
  output is byte-identical. (Doing this *before* the bump would have reverted that site to an
  inert filter, which is why it waited.)
- **The bug class, for next time.** This failed open, minified away its own identifier, and
  had no test — so a build looked healthy in every way while silently returning the wrong
  result set. `tests/search-visible-versions.spec.ts` (7 tests) now reads the set out of the
  built bundle, and the fixture gained a `params.sections.searchonly` block that exists purely
  to make the assertions non-vacuous: the pre-existing `demo` section duplicated the top-level
  v2/v1 and set `linkVersion == version`, so it could detect neither bug. Break-tested by
  restoring the old expression: 3 of the 5 build-output tests go red.

### Fix — nested ordered lists continue their count across a split list, so a `{{< tabs >}}` in the middle of numbered steps no longer restarts sub-steps at "a" (`assets/css/docs-theme-extras.css`, fixture, `tests/ordered-list-numbering.spec.ts`, `tests/cross-browser.spec.ts`)

- **Why.** The theme hides native list markers (`list-style: none`) and draws the grey badge with `::before { content: counter(…) }`. The nested levels counted with **custom** counters (`sublistitem`, `subsublistitem`), and a custom counter can't see the HTML `start` attribute. When a numbered list is interrupted by a block Goldmark renders outside the parent `<li>` — a `{{< tabs >}}` block, a fenced code block, raw HTML — Goldmark emits two `<ol>`s and puts `start="N"` on the second. The old `ol ol:not([start])` rule only rescued the case where the two fragments are **direct siblings**; when a tabs block closed the parent `<li>`, the second fragment landed under a *different* parent and the custom counter's scope never reached it, so sub-steps restarted at "a". 
- **What changed.** The custom counters are gone. Nested levels now use the **built-in `list-item` counter** — `content: counter(list-item, lower-alpha)` and `counter(list-item, lower-roman)` — which the UA seeds from `start` for free (per the HTML Standard's list rendering rules, `ol` implies `counter-reset: list-item` and `<ol start="N">` maps onto `counter-reset: list-item N-1`), and increments per `display: list-item` element regardless of `list-style: none`. The top-level rule already relied on exactly this, which is why top-level steps were never affected. Net −22 lines: the four `counter-reset` / `counter-increment` rules all disappear, and the `counter-increment: … list-item 0` pin turns out to have been a no-op.
- **No JS shim.** The issue proposed reading `start` in JavaScript and setting `style.counterReset` on load. That isn't needed, and it would have cost a visible number flip on every page load plus a duplicated depth→counter-name mapping. Hugo/Goldmark has no `ol` render hook, so there was no server-side alternative either — pure CSS is the only option with no flip.
- **Side fix.** An explicit `<ol start="1">` (an author deliberately restarting a nested list) rendered as a *continuation* of the previous letter before, because `:not([start])` excluded it from the reset. It now correctly restarts at "a".
- **Production pages — 22 in the `gateway` product alone.** [Gloo Gateway 1.19.x quickstart](https://docs.solo.io/gateway/1.19.x/quickstart/) and [1.22.x TLS passthrough](https://docs.solo.io/gateway/1.22.x/setup/listeners/tls-passthrough/) both render sub-steps "a", "b" where they should read "c", "d" (activate the last tab). Measured after the fix on a real `gateway` build: "c", "d". The split fragments there sit **inside `hextra-tab-panel` subtrees** (`ol > li > div.hextra-tabs > … > ol[start="3"] > li`), which is why an earlier markdown-source scan for a column-0 `{{< tabs >}}` reported zero affected pages — it could not see this shape. Separately, [Istio 1.28.x — Make services global](https://docs.solo.io/istio/1.28.x/ambient/multicluster/multi-apps/multi-apps/) is *masked* by a content workaround: `assets/istio-docs/snippets/apps/global.md` duplicates the trailing "Navigate to **Global Services**" step inside **every** `{{% tab %}}` (lines 52 and 61) so each tab is one unbroken `<ol>`. After the pin bump that step can live once, after `{{< /tabs >}}`.
- **Verified** with `hugo160` OSS + enterprise builds; full suites green on both brands (1683 passed each). New `fixture/content/en/test/v2/ol-split.md` covers four shapes — nested split across different parent `<li>`s (the regression), top-level split, nested split as direct siblings, and a doubly-nested split plus a legitimate no-`start` restart. New `tests/ordered-list-numbering.spec.ts` asserts each marker glyph, and `tests/cross-browser.spec.ts` gains a slice that runs the regression shape in **chromium, firefox and webkit** — the fix rests on an engine behavior, so all three are checked. Break-tested by restoring the old CSS: shape 1 fails with `MARKER_OLSPLIT_S1_SUB_C: marker did not render as "c"` (it renders "a", the reported bug) while shapes 2–4 stay green, confirming those three are genuine non-regression cases. **Shape 5 is the real-world shape** — the continuation fragment inside a `{{< tabs >}}` panel, matching the 22 `gateway` sites — and it also checks the outer step is not inflated, plus a second test that clicks into an initially `display:none` panel (a hidden subtree contributes nothing to CSS counters, so the marker has to be right after the reveal). 7 tests, both brands, plus all three engines via `cross-browser.spec.ts`.
- **Reading a `::before` counter needs a pixel comparison, not `getComputedStyle`** — and the pixel comparison needs a negative control. `getComputedStyle(el, "::before").content` returns the *specified* value (`"counter(list-item, lower-alpha)"`) in all three engines, never the resolved glyph; `innerText` and `ariaSnapshot` exclude generated content too, so a spec written the obvious way could never fail. Both specs instead screenshot the 20×20 `::before` box, re-screenshot with the expected literal forced via an injected rule, and require the PNGs to be byte-equal. They *also* force a deliberately wrong glyph and require the pixels to **differ**: if the clip is occluded (a sticky navbar over the marker) or lands off-element, forcing any glyph changes nothing and the assertion passes without measuring anything. A throwaway version of this script hit exactly that and reported "b" for a marker that visibly renders "d". Also note `getComputedStyle(ol).counterReset` reports `none` on an `<ol start="N">` and `getComputedStyle(li).counterIncrement` reports `none` on an `<li>` — Chromium does not surface the implicit list-item counter as CSS declarations, so neither is evidence that the counter is inactive.
- **REQUIRES A PAIRED CONSUMER CHANGE — a pin bump alone makes the hub WORSE.** The hub carried its own stale copy of these rules in `assets/css/custom.css`, and `custom.css` loads *after* the module stylesheet, so it won on equal specificity. With only the pin bumped, the hub got the theme's new `content: counter(list-item, …)` while its own `counter-increment: … list-item 0` still pinned the counter — measured on a real `gateway` build: markers stopped incrementing entirely, "b", "b" where the old CSS at least gave "a", "b". The hub's nested/doubly-nested counter block must be deleted in the same release (done: `assets/css/custom.css`, replaced by a comment explaining why it must not come back). Its `list-item` reset is no longer needed — removing the block leaves the UA's implicit `ol { counter-reset: list-item }` intact, so nested items cannot inflate the outer list (the "8 instead of 3" failure its old comment described); fixture shape 5 asserts the outer step still renders "2". No other consumer duplicates these rules (checked kgw-oss, agw-oss, agr-oss, kagent, ambientmesh).
- Otherwise takes effect when a consumer bumps its extras pin. No content edits required; the per-tab duplication in the istio snippets can be undone afterward as a separate content PR.

### Fix — a fenced code block inside a callout or alert body no longer garbles the copy button (`layouts/_shortcodes/callout.html`, `layouts/_partials/utils/flatten-rendered.html`, fixture, `tests/callout-fence.spec.ts`)

- **Why.** `callout.html` flattens its body to one logical line (newlines → `&#10;`) so a callout nested in a list item can't trip Goldmark's content-continuation column rule and split the list. It did that with a bare `replace "\n" "&#10;"` — none of `utils/flatten-rendered.html`'s protections. A fenced body hit two of them. Hextra emits the copy button with **one attribute per line**, so the smash produced `<button&#10;    class="hextra-code-copy-btn …"`; entities are **not** decoded inside a start tag, so the parser read `&#10;` as a garbage attribute name. Chroma emits `<span class="line">…</span>\n<span…>`, so the smash also relocated newlines *inside* the highlight spans.
- **What changed.** The body now goes through `utils/flatten-rendered.html`, which pre-collapses the copy-button block before flattening and protects `<script>`/`<style>` — but with a new `bypassPre: false` option.
- **The `bypassPre` option exists because this fix sits between two mutually exclusive failure modes, and the obvious version of it trades one bug for the other.** `flatten-rendered` normally emits `<pre>`-bearing HTML untouched, with real newlines, because in `version.html`'s re-parse context entity-ifying Chroma's newlines made the parent apply CommonMark backslash-escaping to `\<` inside the spans. Routing callout through the partial as-is inherits that bypass — and real newlines in a **percent-form** callout body inside a list item re-enter the markdown stream on multiple lines and terminate the `<li>`, which measurably split the fixture list into `<ol>` + `<ol start="2">`. callout is not `version.html`'s context: with the smash restored, the list stays intact **and** the code stays correct (the `\` continuation remains a Chroma `<span class="se">` — no literal `</span>` text, no `&lt;` escapes). So `flatten-rendered` now accepts either a plain HTML string (bypass on, unchanged for every existing caller) or `{ html, bypassPre }`, and callout passes `false`.
- Angle-form callouts were never at risk from the newlines either way — their output is substituted after Goldmark runs, so it is never re-parsed. Only percent form and the list-item shape made the bypass matter.
- **Deliberately not done:** the dedent loop at `callout.html:37-56` is still a local copy of the one in `utils/inner-shape.html` / `conditional-text.html`. Extracting it now would be churn — the gate refactor deletes two of the three copies, leaving callout as the only caller.
- **Production page.** [Gloo Gateway 1.21.x — View APIs in the portal frontend](https://docs.solo.io/gateway/1.21.x/portal/guides/use-frontend/view-apis/) (source: `docs/content/en/gateway/1.21.x/portal/guides/use-frontend/view-apis.md:43`, a `{{% alert %}}` whose body carries fenced `sh` blocks). View-source inside `.solo-alert-body`: the copy button renders as `<button&#10; class="hextra-code-copy-btn …" &#10; title="Copy code" …>` — four bogus `&#10;` attributes — and Chroma line spans carry relocated newlines. ~50 callout/alert bodies across the local repos contain a fence.
- **Verified** by reproducing the defect in the theme fixture first: new `fixture/content/en/test/v2/callout-fence.md` (angle callout, percent callout, `alert` shortcode, and a percent callout with a fence inside a numbered step) produced **4** `&#10;`-in-start-tag occurrences before the change and **0** after. New `tests/callout-fence.spec.ts` (5 tests) asserts each body rendered a real `<pre>`, no `&#10;` in any start tag, a well-formed copy button, an intact enclosing `<ol>`, and surviving Chroma/backslash markup. Both halves of the trade-off were break-tested: reverting `callout.html` entirely fails the two copy-button tests while the list test passes (the production bug), and keeping the `<pre>` bypass on fails the list test while the others pass (the regression avoided). Full suites green on both brands, 1693 passed each, with `hugo160`.
- This shape had **no** fixture before — `callout-in-table-cell.spec.ts` uses an inline code *span*, and `callout-in-reuse-tab.spec.ts` renders through `_partials/components/github-style-alert.html`, not `callout.html`. Takes effect when a consumer bumps its extras pin; no content edits required.

### Fix — a multi-line `{{% reuse %}}` expansion no longer terminates the list item it sits in (`layouts/_shortcodes/reuse.html`, fixture, `tests/reuse-list-continuation.spec.ts`)

- **Why.** Hugo substitutes a shortcode's output at the call's **source position**. For
  `2. {{% reuse "…" %}}`, the first line of the expansion lands at the list-item content
  column but every later line lands at column 0 — and Goldmark's list-item continuation
  rule terminates the list there, closing `</li>`/`</ol>` early and hoisting the snippet's
  tail out of the list as an `<ol start="N">` fragment.
- **Angle form is immune**, because its output is placeholder-substituted *after* Goldmark
  runs, so the list is already parsed. That asymmetry is the whole reason this survived in
  the module for so long: **the fixture only ever exercised angle form.**
- **What changed.** `reuse.html` now routes its rendered output through
  `utils/flatten-rendered.html`, which encodes newlines as `&#10;`. Goldmark does not decode
  HTML entities, so the entity carries no block meaning; browsers decode it to LF, and inside
  `<pre>` it still renders as a line break.
- **This is an upstream, not an invention.** The flatten has existed in
  `docs/layouts/_shortcodes/reuse.html` for as long as the hub has had that override, and
  only there. This is precisely the shadowing problem `OVERRIDES.md` describes: the module
  and the override had silently diverged, and every consumer without the override was
  exposed. The override is now deleted.
- **The override's other divergence — a lone-`<p>` unwrap — was verified dead before
  deletion, not assumed dead.** `.Page.RenderString` with no options renders at
  `display: "inline"`, which does not wrap single-line content in `<p>` at all, so the
  condition was unreachable. It was not upstreamed.
- **Production page.** [Solo Enterprise for Istio 1.28.x — Migrate to the Gloo Operator](https://docs.solo.io/istio/1.28.x/sidecar/setup/install/onboard/#cross-cluster-traffic-addresses)
  (source: `docs/content/en/istio/1.28.x/sidecar/setup/install/onboard.md:212`, a bullet
  reading `* **Cross-cluster traffic addresses**: {{% reuse "conrefs/snippets/istio/nodeport-peering.md" %}}`
  against a 12-line, fence-free snippet). View-source: the whole expansion stays inside one
  `<li>` — `<li><a id=cross-cluster-traffic-addresses></a><strong>Cross-cluster traffic
  addresses</strong>:<p>…</p><p>…</p><ul>…` — and the page carries 223 `&#10;` entities.
  **It renders that way only because the hub carried the override**; the module could not
  produce it. Consumers without the override would break on this shape.
- **Verified.** New `fixture/content/en/test/v2/reuse-list-continuation.md` covers both
  forms, with `tests/reuse-list-continuation.spec.ts` counting `</ol>` between step 1 and
  step 3 (expects 0). Break-tested: removing the flatten fails the percent-form test with
  "reuse.html is not flattening its output" while the angle-form control stays green,
  confirming the control is a genuine non-regression case. **Deleting the hub's override
  against a local `replace` of the converged module changed 0 of 1,555 built pages** — the
  convergence is provably behavior-preserving there. Full suites green on both brands,
  1699 passed each, with `hugo160`.
- **Consumers without an override see a diff, but no body-content change.** Measured on
  `kgateway-oss` with a production `hugo160 --gc --minify` build, v0.1.25 vs a local
  `replace`: **285 of 1,160 pages differ**, and **every substantive change is inside
  `<head>`** — meta `description` / `og:description` / `twitter:description` / JSON-LD, from
  the `page-description.html` fix below. Zero pages change outside `<head>`; the remaining
  75 differ only by whitespace in the body. 1,261 static + content tests pass, including
  `markdown-leaks` and `built-html-integrity`.
- **Verify a claim like that on a MINIFIED build.** An earlier non-minified measurement put
  this at "693 of 1,160 pages, reuse'd content collapsing onto one logical line" — more
  than double the real number, and wrong about the mechanism. `--minify` decodes `&#10;`
  back to whitespace, so the flatten is largely invisible in production output. Both
  `kgateway-oss` and `ambientmesh.io` build with `--minify`, so the unminified number
  described a build nobody ships.
- **`ambientmesh.io` was verified too, and is the cleanest case:** it has no `reuse.html`
  override and 14 percent-form call sites, and its minified output is **byte-identical to
  baseline apart from the stylesheet fingerprint** (which moves because of the ordered-list
  CSS change above).
  The flatten does fire there — an unminified build of the same page carries 21 `&#10;`
  entities — it just leaves no trace after minification. 217 static + content tests pass.
- `agentregistry oss` and `kagent oss` have **zero** percent-form `reuse`
  calls, so they are unaffected. `agentgateway oss` keeps its own stale
  `reuse.html` fork, so the fix does not reach it; it has 57 percent-form calls but none
  inside a list item with a multi-line target, so there is no live defect there to fix.
- **Known limitation, deliberately not fixed here.** A snippet containing a **fenced code
  block** takes `flatten-rendered`'s `<pre>` bypass and gets real newlines back, so a
  percent-form call still splits the list and the fence emits `<p>` inside `<pre>`. That
  matches the hub's override exactly — same partial, same default — so it is pre-existing
  on every consumer and unchanged by this release, not a regression. It is not fixtured
  because the invalid HTML would permanently fail `built-html-integrity`. Do **not** fix it
  with `bypassPre: false` by analogy with the `callout.html` fix above: callout `markdownify`s
  its body and emits a self-contained div, whereas a reuse expansion re-enters the page's
  markdown stream, which is the context the bypass exists to protect.
- **REQUIRES A PAIRED CONSUMER CHANGE, and the ordering matters.** The hub's
  `layouts/_shortcodes/reuse.html` must be deleted, but **only once the pin reaches
  the release carrying this change** — deleting it against an earlier pin removes the
  flatten outright, since no tagged module contains it yet. Also deleted from the hub in the same pass, as
  byte-identical duplicates of module files: `assets/css/main.css`,
  `assets/js/core/toc-scroll.js`, `assets/js/flexsearch.js`.

### Fix — a gate nested inside another shortcode stops corrupting copy-pasteable commands and list markup (`layouts/_partials/utils/gate-normalize-form.html`)

- **Why.** At nesting depth 0 the two shortcode forms hold the same bytes, but at depth ≥ 1
  they do not: Hugo hands a **percent-form** gate PRE-RENDERED HTML while angle form still
  hands over raw markdown. Raw-emitting pre-rendered HTML into a markdown context damages it,
  and because the rule *inverts* with nesting, the old blanket "angle → percent" rewrite made
  the nested cases worse. No body-shape test separates the two populations — 49 top-level
  gates have structural bodies too. Only nesting does.
- **What changed.** The normalizer computes nesting depth and converts in both directions:
  angle → percent at top level, percent → angle when nested. Go's RE2 cannot count nesting,
  so it splits the content on `{{` and walks the chunks against a stack.
- **What it repairs, measured on a real `gloo-mesh-enterprise` build:** 50 pages, every change
  a repair. The worst are copy-pasteable commands that had lost a character. On
  [external-auth OPA BYO](https://docs.solo.io/gloo-mesh-enterprise/latest/security/external-auth/opa/opa-byo/)
  production currently serves `kubectl apply &ndash;context $REMOTE_CONTEXT1-f - <<EOF` — a
  literal en-dash HTML entity where `--` belongs, and the context value fused to the next
  flag. On [external-auth basic](https://docs.solo.io/gloo-mesh-enterprise/latest/security/external-auth/basic/)
  it is `meshctl logs ext-auth-kubecontext` for `ext-auth --kubecontext`. The rest are
  malformed lists (`<ul></li></ul>`, `<ul></p>`) on
  [external-auth OPA about](https://docs.solo.io/gloo-mesh-enterprise/latest/security/external-auth/opa/about/)
  and [system requirements](https://docs.solo.io/gloo-mesh-enterprise/latest/setup/prepare/system-requirements/),
  and swallowed spaces (`isolation.For more information`) on
  [workspace setup example](https://docs.solo.io/gloo-mesh-enterprise/latest/setup/prod/workspaces/about/setup-example/).
- **Verified.** Diffed a full minified `gloo-mesh-enterprise` build with and without the
  nesting rule and reviewed all 50 changed pages by hand; none regressed. `kgateway-oss`
  produced zero differing HTML pages, confirming the change is inert where nothing is nested.

### Fix — a gate whose body is an already-rendered `reuse` no longer terminates the list it sits in (`layouts/_partials/utils/gate-normalize-form.html`, `tests/helpers/gate-form.ts`)

- **Why.** Nesting is not the only way `.Inner` ends up holding HTML instead of markdown. A
  body containing a `reuse` call holds that call's **output**, which is rendered and
  flattened — and percent form splices it into the markdown stream, where a block-level
  fragment inside a list item ends the list and swallows the following steps.
- **This entry prevents a regression rather than repairing a live defect.** Production is
  correct today on
  [header manipulation](https://docs.solo.io/gloo-mesh-enterprise/latest/traffic_management/header-manipulation/)
  — step 3 and its nested sub-steps render as a proper list. Converting these gates put
  **105 markdown leaks** on `gloo-mesh-enterprise`, and that page is where the first six
  showed up: step 3 collapsed out of the numbered list into escaped plain text. Verify by
  comparing that page before and after the pin bump.
- **This is not a gate defect.** The control case in the fixture is a bare
  `2. {{%% reuse "block-snippet" %%}}` with **no gate at all**, and it breaks identically —
  the pre-existing `reuse` behavior tracked in the Phase 7 backlog as 7i. A gate in percent
  form merely re-exposes it.
- **What changed.** The normalizer leaves a top-level angle gate alone when its body is
  nothing but shortcode calls and one of them is `reuse`/`rebase`. This follows from what
  percent is *for*: percent exists to get a body's markdown parsed, and when there is no
  markdown to parse, converting can only lose. 49 gates corpus-wide. Shapes that genuinely
  need percent — a gate wrapping a whole `3. …` step, or a `| … |` table row — have markdown
  of their own and keep converting. `reuse-image` is deliberately excluded: it emits one
  inline element, and including it measurably broke the fixture's everything/rebased parity.
- The `gate-form` source lint applies the same predicate. If it did not, these gates would be
  a permanent red line with no valid repair, since converting them is what breaks them.
- **Verified.** `gloo-mesh-enterprise` goes from 105 leaks to **0 across 2,350 pages**. Pinned
  in `tests/gate-blockhtml.spec.ts` as eight cases compared by parse5 ancestor path, including
  the no-gate control.

### Fix — drop the runtime nesting warning, which was 60-for-60 wrong on `istio`, and move the check to source (`layouts/_partials/utils/gate-emit.html`, `tests/helpers/gate-scan.ts`, `tests/gate-form.spec.ts`)

- **Why.** An earlier revision of `gate-emit.html` warned when a gate had a `.Parent` and its
  `.Inner` was multi-line and started with `<ul>`, `<ol>`, `<h1-6>` or a `<p>` full of pipes,
  on the theory that only Hugo's pre-rendering of a nested percent body produces that shape.
  It does not. **The shape is ambiguous:** `.Inner` starting with `<ul>` means either "Hugo
  rendered your markdown list" or "the author typed `<ul>`", and by the time the partial runs
  the markdown is gone either way. A full `istio` build emitted **60 warnings, 60 false
  positives, 0 true positives.** Every one traced to
  `assets/conrefs/snippets/istio/version-alerts.md`, whose bodies are hand-written
  `<ul><li>…</li></ul>` — and where the normalizer had already put the nested gates in angle
  form, so `.Inner` held the author's own bytes, exactly as intended. Observable on
  [supported Istio versions](https://docs.solo.io/istio/latest/ambient/about/images/versions/),
  which renders correctly under "Known Istio issues and version restrictions" while the build
  that produced it logged the warning.
- **It was also obsolete.** The warning was written when normalization ran one way
  (angle → percent) and left nested percent gates pre-rendered. `gate-normalize-form.html` is
  now bidirectional, so every gate arriving through `reuse` or `rebase` is in the right form
  before render. The hazard is gone at the source, not merely reported.
- **What replaces it.** `unnormalizedHazards` in `tests/helpers/gate-scan.ts`, asserted by
  `tests/gate-form.spec.ts`. It covers the one path normalization cannot reach — a gate
  authored directly in `content/`, which no `reuse`/`rebase` pass rewrites — and it judges the
  **authored** body, so literal HTML is not mistaken for pre-rendered markdown. Gates inside
  `downstream` are exempt: that shortcode evaluates `.Inner` and emits nothing, so its contents
  never reach a reader. This is the symmetric partner to the existing angle-at-top-level lint;
  together they enforce in `content/` exactly the rule the normalizer applies to `assets/`.
- **Verified.** Rebuilt `istio` with the warning removed: `nested inside` count 60 → **0**,
  and the check is not vacuous — five unit tests pin the predicate, including the authored-HTML
  false positive that caused the removal and the `downstream` exemption. Current corpus count
  is **0 hazards** across all six consumers' `content/` roots (`docs` 10 gates,
  `ambientmesh.io` 85, `kgateway-oss` 3, the rest 0), so the lint lands as a ratchet with no
  backlog to clear.

### Fix — `<meta name="description">` is no longer emitted with literal newlines in it (`layouts/_partials/utils/page-description.html`)

- **Why.** A description is a single-line attribute value, but the summary fallback path
  could reach the meta tags carrying real newlines, producing multi-line
  `<meta name="description">`, `og:description` and JSON-LD values. Those tags are what
  Slack and X read for link unfurls.
- **Two independent sources, both fixed.** A front-matter description can carry stray
  newlines from a wrapped YAML string — this is live in production today, independent of
  anything else in this release. Separately, the flatten added above encodes newlines as
  `&#10;`, and this partial's existing `htmlUnescape` decoded them **straight back into
  literal newlines**. So the normalization runs on every path rather than only the summary
  one.
- **What changed.** The value is captured into a variable and collapsed with
  `replaceRE `\s+` " "` plus a trim, instead of being emitted inline.
- **Production page.** [kgateway 2.1.x — TLS encryption](https://kgateway.dev/docs/envoy/2.1.x/install/tls/)
  (source: `kgateway-oss/content/docs/envoy/2.1.x/install/tls.md`, no front-matter
  `description`, so it takes the summary path). View-source today: the `content` attribute
  runs across two lines — `…see the Architecture docs.` then a literal newline then
  `TLS encryption is disabled by default.…`. Note the page contains **zero** `&#10;`
  entities, which is the evidence that this defect is *not* caused by the flatten and would
  not have been fixed by leaving the summary path alone. Compare
  [the same page at `latest`](https://kgateway.dev/docs/envoy/latest/install/tls/), which
  has an explicit front-matter description and is single-line.
- **Verified** on a real `kgateway-oss` build before and after. This is the **entire**
  substantive half of that repo's 285-page diff noted above — 210 pages whose only change
  is inside `<head>`, and no page changes outside it. 1,261 static + content tests pass.
  Takes effect when a consumer bumps its extras pin.

### Fix — every Swagger UI method badge rendered the same blue, so GET/POST/PUT/DELETE were no longer visually distinguishable (`layouts/_shortcodes/openapi.html`, `tests/openapi-method-colors.spec.ts`, fixture)

- **Why.** Reported in #docs Slack (2026-08-12): on the agentregistry API reference
  (https://docs.solo.io/agentregistry/latest/reference/api/), every operation's method badge
  rendered identically blue, "making it harder to read and group methods mentally." The
  shortcode's `<style>` block set
  `.swagger-ui .opblock .opblock-summary-method { background: #4990e2 !important; color: #fff !important; ... }`.
  Swagger UI's own stylesheet already colors each method distinctly via
  `.opblock.opblock-get .opblock-summary-method` (and `-post`, `-put`, `-delete`, `-patch`, …),
  but none of those rules carry `!important`, so the blanket override always won regardless of
  method — predating any deliberate design choice, per the thread.
- **What changed.** Dropped the `background`/`color` lines from that rule, keeping only the
  layout tweaks (`font-weight`, `padding`, `border-radius`). Swagger UI's stock per-method
  palette (GET `#61affe`, POST `#49cc90`, PUT `#fca130`, DELETE `#f93e3e`, …) now shows through.
- **Verified.** Added a GET+POST operation pair to the fixture spec
  (`fixture/assets|static/test/openapi/sample.yaml`) and a new Playwright spec
  (`tests/openapi-method-colors.spec.ts`, `browser` project) asserting the two badges render
  distinct, method-correct colors. Confirmed it fails against the old CSS and passes with the
  fix, on both the OSS and enterprise fixture builds.

### Fix — Swagger UI's request/response example blocks rendered white-on-white in light mode (`layouts/_shortcodes/openapi.html`, `tests/openapi-example-contrast.spec.ts`, fixture)

- **Why.** Swagger UI renders its "Example Value" panel as
  `.opblock-body pre.microlight`, styled by Swagger's own stylesheet as
  `background:#333; color:#fff`. Because the widget renders inside `.content`
  (`layouts/docs/{single,list}.html`), it inherits the site-wide
  `.content pre { background-color: #fff !important; ... }` rule, which repaints the
  background white but leaves Swagger's white text untouched — invisible except for the
  syntax-colored string values. This is the same bug class as the `a.nostyle` /
  `.opblock-tag` fix above: a global `!important` rule reaching into the light-island panel
  and only partially overriding Swagger's own styles.
- **What changed.** Added `.swagger-ui .opblock-body pre.microlight { background: #333333
  !important; color: #ffffff !important; }` to the shortcode's light-island `<style>` block.
  At three classes plus an element, it out-specifies `.content pre`'s one class plus element,
  so it wins regardless of source order. No `.dark` variant is needed since this panel is
  deliberately pinned to light-mode colors independent of site theme, unlike the docs's
  own `custom.css`, which patches the same bug with light/dark variants because it repaints
  `.content pre`'s background per scheme.
- **Live today** on the agentregistry API reference
  (https://docs.solo.io/agentregistry/latest/reference/api/) and the kgateway portal OpenAPI
  pages (2.2.x, 2.3.x) — both consume this shortcode and inherit the same `.content pre`
  override.
- **Verified.** Extended the fixture spec (`fixture/assets|static/test/openapi/sample.yaml`)
  with a response schema/example on the GET operation, so Swagger's Example Value panel
  actually renders, and added `tests/openapi-example-contrast.spec.ts` (`browser` project)
  asserting the panel's background isn't white and its text stays white. Confirmed it fails
  against the old CSS (`background !== #ffffff` assertion trips) and passes with the fix, on
  both the OSS and enterprise fixture builds.

### Fix — `hugo server` got stuck answering every request with a 500 after an unrelated content edit, until restarted (`layouts/_partials/head.html`)

- **Why.** Editing `fixture/assets/conrefs/test/everything.md` (a test fixture, no template
  change) repeatedly crashed the local dev server's rebuild with `error calling Concat: expected
  slice of Resource objects, received []interface {} instead`, thrown from Hextra's vendored,
  unmodified `_partials/head.html`. That partial builds `$scriptsHead` from
  `resources.Match "js/head/*.js"` and pipes it straight into `resources.Concat` — this project
  defines zero `js/head/*.js` scripts, so the match is always empty, and `$scriptsHead` stays
  Hugo's untyped `slice` (an empty `[]interface {}`), which `Concat` rejects. It never surfaces on
  a cold `hugo server` start or a production build (both resolve the empty match without issue,
  confirmed by the fixture and all seven consumer builds staying green) — only on this project's
  live rebuild path, where every failed rebuild left the dev server serving a 500 until killed and
  restarted. No production page shows this: it is a `hugo server`-only regression, never shipped.
- **What changed.** Added a local override of `_partials/head.html` (byte-for-byte copy of Hextra
  v0.12.3 except one guard) that skips the `Concat`/`<script>` emission entirely when
  `$scriptsHead` is empty, following the same override-Hextra-core pattern already used for
  `opengraph.html`.
- **Verified.** Reproduced the crash locally: with the unguarded upstream partial, two consecutive
  edits to `fixture/assets/conrefs/test/everything.md` each logged `WARN File "" not found,
  skipping.` immediately followed by `ERROR Rebuild failed` with the exact `Concat` error above,
  and the dev server answered `HTTP 500` until restarted. With the override in place, the same two
  edits rebuilt clean (no `ERROR` line) and the affected page (`/v2/everything/`) served `HTTP
  200` after each.

### Test harness — the override scanner compares CSS properties, not selector names, and the phantom backlog it created is gone (`tests/helpers/scan-overrides.ts`, `tests/override-parity.spec.ts`, `tests/helpers/override-baseline.json`, `OVERRIDES.md`)

- **Why.** The scanner reported a conflict whenever a consumer stylesheet mentioned a
  selector extras also defines. That is not what a conflict is. extras sets
  `.hextra-toc { display: none }`; four consumers set `font-family` on the same class from
  a Tailwind `styles.css`. Different properties never fight — yet the report called all four
  DIVERGENT, and that produced a backlog item to "fix extras' wrong `.hextra-toc` default,
  since four of six consumers override it." **Nobody overrides it.** The item was an
  artifact of the measurement.
- **What changed.** `compareRule` now diffs property by property and sorts each selector
  into one of three buckets: *redundant* (every shared property has the same value, safe to
  delete), *DIVERGENT* (a shared property really differs), *shared-name only* (ignore). Hex
  and `rgb()` spellings of one colour compare equal, so `#1e40af` versus
  `rgb(30, 64, 175)` no longer needs converting by hand. `hsl()` is deliberately left
  unconverted — a wrong "these are equal" deletes a live rule, while a spurious DIVERGENT
  only asks a human to look. `!important` is compared before the value is canonicalized,
  because a rule matching extras' colour but adding `!important` is not interchangeable
  with it.
- **The real cleanup this exposed.** `agentgateway oss` and `kagent oss`
  carried the identical 10-selector block, copy-pasted between the two sites. Five were
  byte-identical to extras, two were the same colour in different notation, and only three
  carried a genuinely different value — the selected-tab underline (hardcoded
  `hsl(212,100%,50%)` versus extras' `var(--theme-primary)`, so it never adapted in dark
  mode) and `.section-cards` top margin (`1rem` versus `1.5rem`). All resolved in favour of
  the module and deleted from both consumers. Observable on
  [agentgateway docs](https://agentgateway.dev/docs/): the selected tab's underline now
  follows the brand token instead of a fixed blue.
- **Verified** by computed-style diff on a real minified `agentgateway oss` build,
  two pages, light and dark: **6 differences across 12 snapshots, all three intended changes
  × both colour schemes, nothing incidental.** That also proved the `!important` on
  `.dark .sidebar-link.sidebar-active-item` was inert — the computed colour and background
  are unchanged after deleting it. Scanner totals across all six consumers went from 30
  flagged selectors to **one real divergence**: ambientmesh's `.nav-container` font, which
  is its brand font and stays. Eleven new unit tests pin the comparison logic, including the
  `.hextra-toc` false positive that motivated the change.
- Consumer edits are local to `agentgateway oss` and `kagent oss`; they need
  no pin bump, since deleting a duplicate just lets the module's existing rule apply.
- **`agentgateway oss` also dropped its `reuse-image` / `reuse-image-dark` forks**,
  which had to move as a set. extras emits `class="reuse-image-nodark"` on the light image
  and `class="toggle-light"` on the dark one, and the rule that stops both showing at once is
  `.dark .reuse-image-nodark:has(+ .toggle-light)`. agw's forks emitted `dark-only`, styled by
  its own CSS, so deleting either alone would have rendered both images in dark mode. The
  `.light-only` / `.dark-only` block and the two hand-written `<div>`s in
  `content/docs/_index.md` that used it moved over too. Verified headlessly on
  [agentgateway debug guide](https://agentgateway.dev/docs/standalone/latest/operations/debug/):
  exactly one figure visible in light and one in dark, in both directions.
- **Recorded a correction in `OVERRIDES.md` rather than acting on it.** That file described
  consumer forks by byte gap, on the assumption that a fork much smaller than the module's
  file is a stale copy to delete. Measured by deleting each fork, rebuilding and diffing the
  built HTML, that is wrong for at least two: `link-hextra.html` is small because
  agentgateway's URLs are `/docs/<flavor>/<version>/…` rather than the hub's
  `/product/version/…`, and deleting it rewrites links on **913 pages** into 404s;
  `flexsearch.js` differs by 13 lines that read versions from `params.sections.*.versions`
  instead of `params.versions`, without which the search version filter silently stops
  working. Every row now carries a measured verdict. No extras behavior changed.

### Test harness — delete the `cond-list-order` lint, whose antipattern the gate refactor made impossible (`tests/helpers/cond-list-order.ts`, `tests/cond-list-order.spec.ts`, `tests/helpers/config.ts`, `playwright.config.ts`, fixture)

- **Why it existed.** Before the refactor, `conditional-text` rendered its body in INLINE
  display mode only, unlike `version`, which had block and trailing-step handling. A gated
  bullet placed AHEAD of an always-shown bullet in the same list therefore broke the list
  continuation, and the gated bullet's markdown survived as literal text — the
  `reference/release-notes.md` `[Changelog](url)` leak. The authoring rule was ordering: a
  `conditional-text` bullet had to be the LAST item(s) of its list. The lint caught that at
  the source, including the case the rendered-HTML leak scan cannot see — a PLAIN-TEXT gated
  bullet placed first breaks the list silently, with no leak signature to match on.
- **Why it is gone.** That template no longer exists. `conditional-text` emits `.Inner`
  untouched, exactly like `version`, so the inline-only render that broke the list cannot
  happen. Re-measured against the current templates on a fixture reproducing the exact
  antipattern in all three shapes the rationale named — plain text, a markdown link, and bold
   — with the gate both including and excluding: **every case renders as one contiguous list**,
  correctly renumbered, with no `<ol start=`, no literal `2.` marker, and no leaked `](url)`
  or `**`. The 20 violations it had reported on the docs hub were all stale.
- **What was deleted.** The helper (193 lines), its spec (141 lines), four fixture files, the
  `condListOrder` config key, and its `playwright.config.ts` allowlist entry. It had already
  been disabled by default; this removes the inert code. The rationale is preserved in this
  entry, which is the only copy — restore from git history if a real failing shape ever turns
  up.
- Also removed, all zero-caller: `stripFences` in `tests/helpers/gate-scan.ts` (orphaned when
  the parser fix stopped `scanFile` calling it — see the four parser bugs below),
  `_resetCrawlCache` in `tests/helpers/crawl.ts`, and `markerAncestorPathsForFile` in
  `tests/helpers/ancestor-path.ts`.
- No production page: harness-only, no rendered output changes. Observable indirectly on
  [Gloo Mesh Enterprise release notes](https://docs.solo.io/gloo-mesh-enterprise/latest/reference/release-notes/),
  the page whose `[Changelog](url)` leak motivated the lint and which now renders correctly.
  Verified: both brands green with the files removed, and the deleted fixture page confirmed
  absent from the `gate-containment.json` ancestor-path snapshot beforehand, so the baseline
  did not move.

### Test harness — the shadow inventory becomes a one-way ratchet instead of a snapshot (`tests/override-parity.spec.ts`, `tests/helpers/override-baseline.json`, `tests/helpers/scan-overrides.ts`, `scripts/scan-overrides.mjs`, `playwright.config.ts`, `package.json`)

- **Why.** `OVERRIDES.md` on its own is a document that starts rotting the moment it is
  written, and the ordered-list regression was found by eye rather than by a test. A prose
  inventory does not fail a build.
- **What changed.** `tests/helpers/override-baseline.json` freezes the currently-accepted
  shadows, and `tests/override-parity.spec.ts` enforces it in both directions: a shadow
  that is not in the baseline fails, **and** a baseline entry a consumer no longer carries
  also fails, so the list shrinks as consumers get cleaned up rather than going stale. Two
  further checks keep the prose honest: every consumer with accepted shadows must have a
  section in `OVERRIDES.md`, and every same-path shadow must be named **inside that
  consumer's own section**.
- **The section-scoping matters more than it sounds.** A document-wide name match passed on
  the first run, then found three undescribed `agentgateway oss` overrides once
  scoped — `kgateway-oss` and `agentgateway oss` both fork `navbar.html`, so one
  mention was vacuously satisfying both. `OVERRIDES.md` now tabulates all eight of that
  consumer's shadows individually.
- **A sentinel check that arms itself.** A consumer forking `reuse.html` / `rebase.html`
  will need to carry Phase 5's `GATE-FORM-NORMALIZATION-v1` normalization block. Rather
  than land dead code or a `test.skip` somebody has to remember to remove, the check reads
  the module's own copy: it is inert until extras carries the sentinel, and from that moment
  every consumer fork must carry it too. It reports as skipped today, which is the intended
  visible state.
- **Fixed a real defect in the scanner while writing its unit tests.** `cssBlocks` split
  selector groups with a naive `sel.split(",")`, which tore `:where(.dark, .dark *)` into
  `:where(.dark` and `.dark *)` — the first can never match, the second is a phantom
  collision. Hextra v0.12 emits that shape heavily; it was inflating
  `kagent oss`'s duplicated-selector count by one. Splitting now tracks paren and
  bracket depth, with unit tests for pseudo-classes, attribute selectors and at-rules.
- **Scope, stated plainly: the cross-repo half does NOT run in CI**, because it needs the
  consumer clones as siblings. It is a pre-release check for a developer machine, wired into
  the `OVERRIDES.md` checklist. The scanner's own unit tests do run everywhere, since a
  false negative there disarms everything else.
- Also renamed `tests/helpers/scan-overrides.mjs` → `.ts` to match every other helper, and
  moved its CLI to `scripts/scan-overrides.mjs` (`npm run scan:overrides`). The old file
  self-invoked via `import.meta.url`, which forced ESM loading while Playwright transpiled
  it to CJS — importing it from a spec failed outright with "exports is not defined in ES
  module scope".
- No production page: this changes no rendered output. **Verified by breaking it three
  ways.** Appending `.section-card` to `ambientmesh.io/assets/css/custom.css` fails with
  `+ "custom.css :: .section-card"`; adding a stub `layouts/_shortcodes/table.html` there
  fails the same-path check; adding a fictional baseline entry fails the stale check. Most
  directly, **re-injecting the actual ordered-list regression** — the hub's
  `#content > .content ol ol > li::before { content: counter(sublistitem, …) }` — into
  `docs/assets/css/custom.css` fails with exactly that selector named, so the check
  demonstrably catches the bug it was written for. Full suites green on both brands,
  1718 passed each.

### Test harness — a measurement baseline for the gate refactor, and four parser bugs it exposed (`tests/helpers/gate-scan.ts`, `tests/helpers/ancestor-path.ts`, `tests/{gate-containment,gate-transparency,cond-list-order,versioning}.spec.ts`, `scripts/scan-gates.mjs`)

- **Why.** The gate refactor changes how ~4,000 gates render. The existing
  `versioning.spec.ts` compared the `everything` and `rebased` fixture pages *to each other*
  over 10 tag names, which is blind to a symmetric regression and cannot see container
  ejection at all — it counts `<li>` without knowing which `<ol>` the `<li>` is in. There was
  no absolute baseline to refactor against.
- **What changed.**
  - `tests/helpers/gate-scan.ts` + `npm run scan:gates` — the corpus scanner, classifying
    every gate by nesting depth and body shape.
  - `tests/gate-containment.spec.ts` — a **parse5** ancestor-path snapshot (1,060 markers,
    32 pages). This is the tool the issue asks for: diagnose container ejection with a real
    HTML parser, not by counting `<div>`s. `parse5` is the first HTML parser in this repo.
  - `tests/gate-transparency.spec.ts` + a 14-shape fixture — asserts a gated block renders
    **byte-identically** to the same content with the tags deleted. Authored against the
    pre-refactor templates with the failures pinned `test.fail()`, so the pinned list *was*
    the bug inventory.
  - `versioning.spec.ts` widened from 10 tags to 19 and scoped to `.content` — whole-page
    comparison was unsound, since chrome links differ between two URLs.
  - `tests/cond-list-order.spec.ts` wires up a source lint that existed but that **no spec
    imported**. Turning it on revealed its `OPEN_THEN_MARKER` branch was unreachable, so the
    shape it was written for had never been detectable.
- **Four parser bugs in the scanner, which mean the first corpus numbers were wrong.** Found
  by cross-checking it against an independent implementation over 14,884 files:
  1. it stripped fenced code before scanning, but **Hugo expands shortcodes before Goldmark**,
    so a gate in a fence really does run — 485 real gates dropped. Worse, the fence regex
    requires a bare closing line, and the corpus is full of ``` ```{{% /conditional-text %}} ```,
    so the blank ran on and swallowed the tags between, giving 41 gates the wrong depth;
  2. `${{{% version %}}` — a shell expansion flush against a tag — went unrecognized;
  3. `{{%/ version %}}` (slash before the space), which Hugo accepts, was invisible as a
    closer, so every gate after it in that file read as nested;
  4. Hextra's nested shortcode names (`filetree/container`, `filetree/folder`,
    `filetree/file`) all collapsed to `filetree`, so the self-closing one pushed a level
    nothing popped and every gate after a file tree read as nested.
- Corrected totals: **4,268 gates, 3,547 top-level, 721 nested**, 10 go/no-go, 16
  already-broken — against 3,900 / 3,303 / 597 / 13 / 28 before.
- No production page: harness-only, no rendered output changes. Verified by re-running the
  scanner against the corrected implementation and by the parity spec below.

### Test harness — the form normalizer is checked against an independent parse over the real corpus (`tests/helpers/gate-normalize.ts`, `tests/{gate-normalize,gate-normalize-corpus,gate-blockhtml,gate-form}.spec.ts`, `fixture/layouts/_shortcodes/gate-normalize-probe.html`)

- **Why.** `utils/gate-normalize-form.html` decides the form for every gate on every page, and
  it does so with a cheap parse — split on `{{`, walk the chunks against a stack — because
  RE2 cannot count nesting. A cheap parse that is wrong somewhere silently mangles content,
  and the only honest way to know it is right is to run it over real content.
- **What changed.** Three layers, each catching what the others cannot:
  1. unit tests on the decision logic, including the shell-brace and slash-before-space
     spellings and the reuse-body exception;
  2. a fixture page rendering 17 cases through the **real Go template** (via a fixture-only
     probe shortcode) and comparing to the TypeScript port, so the port cannot drift from
     the thing it models;
  3. `gate-normalize-corpus.spec.ts` — the walk's depth against `gate-scan.ts`'s independent
     tokenizer across every markdown file in the sibling consumer clones. **4,268 gates,
     14,884 files, 0 disagreements.**
- The corpus spec deliberately does **not** filter its roots by existence: a configured root
  that is not on disk must reach the "walked 0 files" assertion and fail loudly. That check
  is what surfaced the docs hub pointing `scanRoots` at two directories that have never
  existed, leaving six source lints passing vacuously over 11,025 unread files.
- `tests/gate-blockhtml.spec.ts` pins the rendered-body boundary, authored in `content/` on
  purpose — an earlier version routed the cases through `reuse`, which normalizes the form
  before rendering, so the angle cases silently became percent and the distinction under
  test disappeared.
- `tests/gate-form.spec.ts` lints `content/` for angle-form gates (assets are normalized, so
  they cannot be wrong). Real violations fixed: `kgateway-oss` `install/sample-app.md` across
  `main`/`latest`/`2.3.x`.
- No production page: harness-only. Verified by break-testing each layer, and by the
  consumer sweep recorded in the breaking entry above.

### Test harness — re-enable `tab-code-fences.spec.ts`, which had been silently dead, and fix the stale selector it was hiding (`playwright.config.ts`, `tests/tab-code-fences.spec.ts`)

- **Why.** `tests/tab-code-fences.spec.ts` appeared in **no** `testMatch` allowlist in `playwright.config.ts`, so it never ran — every project's allowlist is a hand-maintained per-filename alternation, and a spec absent from all of them is skipped with no signal. It is the regression guard for the `{{% tab %}}` double-`markdownify` bug (Goldmark terminating a `<pre>` at a blank line and injecting `<p>`, breaking code blocks and the Hextra copy button), and its fixture at `fixture/assets/conrefs/test/everything.md:862-884` is live.
- **What changed.** Added to the `static` project allowlist. Turning it on surfaced that it had gone stale while dark: it matched `class="hextra-tab-panel`, but the spec runs against the extras fixture, which renders **Hextra v0.12.3's** tabs — and those emit `hextra-tabs-panel` / `hextra-tabs-toggle` (plural). All six page assertions failed on "no `.hextra-tab-panel` preceding prose marker". The singular form the spec looked for is what the **docs hub's own local `layouts/_shortcodes/tabs.html` override** emits (`hextra-tab-panel` / `hextra-tab-btn`), so the selector was presumably written against hub output. Fixed to match Hextra's class, and to match the bare class name rather than `class="…` so it also survives an attribute-quote-stripping `--minify` build.
- **The behavior it guards was fine** — this was a dead test with a stale selector, not a live rendering bug. 18/18 pass on both brands once corrected.
- No production page: this is test-harness only and changes no rendered output. Verified by running `--project=static --grep "tab panel code fences"` on both brands.

### Test harness — the re-enabled `tab-code-fences.spec.ts` (previous entry) now also recognizes the docs hub's tab-panel class, not just Hextra's (`tests/tab-code-fences.spec.ts`)

- **Why.** The previous entry guessed the singular `hextra-tab-panel` selector was a stale leftover and switched the spec to match only Hextra's plural `hextra-tabs-panel`. It wasn't stale: the docs hub's `layouts/_shortcodes/tabs.html`/`tab.html` still ship the singular class today, deliberately — it predates this spec and is unrelated to the Hextra-version tracking the previous entry assumed. `copy-markdown.html` in this module already names and handles both shapes side by side (`.hextra-tab-panel[data-tab-name]` for "docs's tab override", `.hextra-tabs-panel` for Hextra's default), so a test that recognizes only one of the two is a gap in the test, not evidence the other shape is wrong. Surfaced when `docs` bumped its pin to pick up this spec: the "no <p> inside any <pre> within the tab panel" case failed on all six of its content pages with "no .hextra-tabs-panel preceding prose marker", even though the panel was rendered correctly.
- **What changed.** The panel-boundary lookup now checks for either class name and reports both in its failure message. No template or layout file changed — this is a test-only fix.
- No production page: test-harness only, changes no rendered output. Verified by running `--project=static --grep "tab panel code fences"` against this module's own fixture (18/18, unchanged — it only ever renders the plural Hextra form) and against a local `docs` build carrying the singular form (27/27, previously 6 failing).

---

## [v0.1.25] — 2026-08-04

### Change — `docTabs` moves from a front-matter `tab` model to a content-directory (`id`) model (`layouts/_partials/docs-tabs.html`, `layouts/partials/sidebar.html`, `hugo-*.toml`, `USAGE.md`)

- **Why.** The v0.1.21 `docTabs` prototype grouped pages by a front-matter `tab: "<name>"` key, re-derived the grouping by filtering the whole tree on every render, matched the active tab by URL string (which drifts between the OSS, enterprise, and local-dev URL shapes), and — because a tab was a virtual grouping, not a real container — linked each tab to its *first item's* page instead of a stable landing.
- **What changed.** A tab is now a real content directory: config declares each tab with an `id` (a top-level directory under the version root) plus its `name`, the sidebar roots the left-nav tree *inside* that directory, the active tab resolves by page ancestry (`.IsDescendant`) so every URL shape agrees, and each tab links to its directory `_index`. The enable gate becomes "2+ present tab directories in this version"; below that the band is suppressed and the full tree renders as before. Two supporting fixes: a tab holding only its `_index` now emits a link to its own landing (an empty pre-rendered panel made the mobile chip a dead end), opt-in per call site so non-tab sidebars are untouched; and the band centers its tab row in the same `utils/page-width` container as the content column, so tabs align with the sidebar/content left edge at every `page.width`.
- **Consumer contract change (opt-in feature only).** `[[params.docTabs]]` now requires an `id` per tab, and enabling `docTabs` means partitioning that version's content into one top-level directory per tab; the `tab:` front-matter key is no longer read. **No production consumer has enabled `docTabs`**, so nothing in production changes — this supersedes the prototype before its first real use. `USAGE.md` is rewritten to the directory model.
- No production page — the feature stays available-but-dormant. Observable on the theme fixture: `make server-oss`, then compare `/test/v3/api/authentication/` (the `v3` version partitions into `documentation/`, `api/`, `changelog/`, so three tabs render and the nav is rooted in the active tab's directory) with `/test/main/everything/` (no tab dirs → no band, full tree). Verified with `hugo160` OSS + enterprise builds; the rewritten `tests/docs-tabs.spec.ts` pins both the enabled and disabled states plus the page-width wrapper, 9/9 on both brands. Takes effect when a consumer sets `params.docTabs` with `id`s, partitions its content, and bumps its extras pin.

### Add — per-tab `hideSidebar` drops the left nav on a `docTabs` tab, desktop only (`layouts/_partials/docs-tabs.html`, `layouts/partials/sidebar.html`, `assets/css/docs-theme-extras.css`, `hugo-*.toml`, `tests/docs-tabs-sidebar.spec.ts`, `USAGE.md`)

- **Why.** With `docTabs`, the left nav is rooted inside the active tab's directory — so a tab that owns a single page (a one-page changelog, one generated API reference) renders a one-item nav whose only link is the page the reader is already on, spending a 16rem column to say nothing. There was no way to say "this tab has no tree"; the choice was a full nav on every tab or no tabs at all.
- **What changed.** `[[params.docTabs]]` takes an optional `hideSidebar = true`. `docs-tabs.html` resolves it for the ACTIVE tab (off the present-tab list, so a tab whose directory is missing in this version can't suppress a nav for pages it doesn't own) and puts it on the page store; `sidebar.html` turns it into a `sidebar-desktop-hidden` class on the `<aside>`; one rule in the existing `@media (min-width: 1280px)` block hides it. `display: none` rather than `visibility`/width, so the flex row gives the column back and the article widens instead of showing a blank gutter. Absent or `false` → nav renders, which is every existing tab, so nothing changes until a tab opts in.
- **Mobile always shows it, and that's the whole design constraint.** Below `xl` the same `<aside>` *is* the slide-out drawer, and the drawer is the only route to the tab chips, the version chips, and the other tabs' pre-rendered trees — hiding it on a phone would strand the reader on the current page with no way off it. So the suppression is CSS inside the desktop media query and the markup is always emitted; skipping the markup instead (the obvious first implementation) would have killed the drawer. The desktop tab band also stays, since it's how a reader gets from a nav-less tab back to one that has a nav.
- **Bool flag, not `isset`/`default`.** Read as a plain truth test. `.hideSidebar | default false` would misreport an explicit `false` the same as unset, and Hugo's `isset` has bitten this repo before (the `warnMissingDescription` opt-out needed a case-sensitivity fix), so neither is used. Verified: setting `hideSidebar = false` in the fixture fails the new tests exactly as removing the key does.
- No production page — `docTabs` is still enabled in no consumer, so this ships dormant alongside the directory-model change above. Observable on the theme fixture: `make server-oss`, then compare `/test/v3/changelog/` (the Changelog tab sets `hideSidebar = true`: no left nav at laptop width, article reclaims the column, band still there) with `/test/v3/api/authentication/` (same config, no flag → nav intact). Narrow the window below 1280px on the changelog page and the drawer opens with all three tab chips and a tappable tree.
- Verified with `hugo160` OSS + enterprise builds. New `tests/docs-tabs-sidebar.spec.ts` (browser project — the behavior is CSS, which the HTML-only `static` project cannot see) asserts the desktop hide, the reclaimed column, that an unflagged tab keeps its nav, and that the drawer still opens with its chips and tree at 390px; `docs-tabs.spec.ts` gains a static check that the marker class lands on the flagged tab's pages and *only* those. docs-tabs specs 14/14 on both brands, and the full `static` + `browser` suites stay green (1438 passed on enterprise). Both guards were checked by breaking them: deleting the CSS rule fails the two desktop tests and leaves the mobile one passing; flipping the flag to `false` fails the static marker test too.

### Add — the mobile drawer AJAX-swaps a section/version selection in place (`assets/js/mobile-nav.js`, `assets/css/docs-theme-extras.css`, `tests/mobile-drawer.spec.ts`, `playwright.config.ts`)

- **Why.** Below the sidebar breakpoint, tapping a section (Kubernetes/Standalone) or version chip in the drawer navigated to the target page, which closed the drawer — so a reader working through section → version → topic was ejected and had to re-open and re-orient after every hop. Unlike the tab chips, whose trees are already pre-rendered in the page, those chips point at a content tree that isn't in the DOM.
- **What changed.** `mobile-nav.js` now fetches the target page, lifts its `.sidebar-mobile-panel` nav out of the response, and swaps it into the open drawer, so the reader keeps drilling down; a brief `.drawer-loading` dim covers the fetch, and any fetch/parse failure falls back to plain navigation so a chip always does something. Drawer wiring moved behind a single `bindDrawer(root)` so listeners re-attach to the swapped-in markup.
- **Hardening the swap needed.** (1) An in-flight request token, so two fast taps can't leave the drawer showing the earlier response's tree. (2) The loading lock widened to `.sidebar-mobile-header` — the chips sit *above* the dimmed nav wrapper, so they stayed clickable during a fetch. (3) Focus moves to the swapped-in `.sidebar-nav`; replacing `panel.innerHTML` dropped focus to `<body>`. (4) Closing the drawer restores the pre-swap markup, so a reader who peeks at another version and closes without picking a topic doesn't reopen onto a tree they aren't on (commit-on-close was rejected: it would navigate a reader who only wanted to look). The close is caught with a `MutationObserver` on the panel class rather than by wrapping `toggleMobileSidebar`/`closeMobileSidebar`, which consumers' own nav templates call and manipulate. (5) Per-binding `AbortController` teardown: the `window` `resize` listener and per-row `ResizeObserver` are the two registrations that survive an `innerHTML` swap, and they accumulated for as long as a reader kept hopping. (6) A 5s timeout on the swap fetch. `.drawer-loading` dims the header and nav wrapper and turns off their pointer events, with no spinner, so a fetch that neither resolves nor rejects — a phone that loses signal mid-tap — left the drawer dimmed and input-locked indefinitely. (Not a hard trap: the overlay is a sibling of the panel, so tap-outside still closed it, but the reader had to discover that.) The abort lands in the same `catch` as any other failure, so it reuses the navigate fallback rather than adding a second recovery path. `AbortController` + `setTimeout` rather than `AbortSignal.timeout`, which is newer than the APIs this file already feature-detects and would throw on a missing property instead of degrading to no timeout; the timer clears only after the body is read, so a response that starts streaming and then stalls also falls back. (7) Crossing UP past the breakpoint with the drawer open now closes it. `restoreDrawer` fires on the open→closed class edge and nothing was watching the viewport, so a swap at 390px followed by a widen past 1280px (tablet rotation, a desktop window drag) *promoted* the swapped tree into the desktop sidebar while the page, its URL, and the navbar version dropdown all still belonged to the original version — the drawer's deliberately temporary divergence made permanent. The resize handler calls the existing `closeMobileSidebar`, so clearing `.mobile-sidebar-open` is the same edge the observer already watches and the reset falls out of the path that was there. That also fixes a second, pre-existing symptom: `.sidebar-mobile-overlay.active` carries no media query, so the full-screen scrim used to survive onto the desktop layout.
- Desktop is unaffected — these chips are hidden at `xl` and above, where the tab band and version dropdown navigate normally. The breakpoint is now a single `DRAWER_MAX` constant in `mobile-nav.js` instead of three hardcoded `1280` comparisons that all had to agree with the CSS bound.
- Observable in production at phone width on any versioned page, e.g. [Solo Enterprise for kgateway — Quickstart](https://docs.solo.io/kgateway/2.3.x/install/quickstart/): tapping a version chip reloads the page and closes the drawer today; after a pin bump the nav swaps in place. Verified with `hugo160` OSS + enterprise builds and a new `tests/mobile-drawer.spec.ts` — seven tests at 390px covering the in-place swap, a *second* hop (the only thing that exercises the `bindDrawer` re-bind), the fetch-failure fallback, close-and-reopen reset, `ResizeObserver` accumulation, a fetch that *hangs* rather than rejecting (`route.abort()` is immediate, so the existing failure test passed with no timeout at all — this one leaves the route unfulfilled and asserts the fallback happens anyway), and a widen past the breakpoint mid-swap; each fails with its guard disabled. The spec lives outside `browser.spec.ts` (whose file-level `test.skip(!EVERYTHING)` would have skipped it on every real consumer) and discovers its target by crawling the built output, so it also runs against consumer builds: **kgateway-oss 5/5**, **agentgateway-oss 4/5** (second hop legitimately skipped, only one hop target). Unversioned consumers have no version chip row and skip all five.
- **Two discovery guards worth knowing about.** `npx serve` resolves a URL whose final path segment contains a dot as a file, so a version-root landing like `/docs/kubernetes/1.0.x/` returns a directory listing with no scripts and every assertion vacuous — discovery skips dotted last segments (harness quirk only; the real sites serve those landings fine). Discovery also requires a chip marked `sidebar-mobile-version-active`, because archived trees are still built but dropped from the switcher, so nothing is active and there's no version to swap away from and back to.

### Fix — stop remapping `keepVersion` version blocks in reused content (`layouts/_shortcodes/reuse.html`, `hugo-*.toml`, fixture, `tests/reuse-version-remap.spec.ts`)

- **Why.** A `{{< version include-if="…" keepVersion="true" >}}` block reused inside a `{{< rebase >}}` had its `include-if` tokens silently rewritten by the OSS→enterprise remap, so an author-supplied enterprise mapping resolved to the wrong version or none. `keepVersion="true"` means "these are already enterprise tokens — don't remap." The keepVersion transform converts such a block to percent form with a `version="…"` param, and v0.1.22 broadened the remap's Pass-1 anchor from angle-only to both forms (to fix the `get_cookie` rows), which started matching those blocks too. Since enterprise tokens overlap `ossVersion` values, the remap shifted the tokens, yielding empty, shifted, or doubled matches. `rebase.html` never had this bug — it bulk-converts percent→angle before keepVersion runs, so its angle-only remap can't see these blocks.
- **What changed.** Before the remap, any percent-form block carrying a `version="…"` param (the keepVersion signature) has its condition attribute renamed to a remap-invisible token (`include-if=`→`kvincif=`, `exclude-if=`→`kvexcif=`, neither containing the `clude-if` the remap keys on), restored afterward. Genuine percent-form blocks like `get_cookie` carry no `version=` param and still remap as v0.1.22 intended.
- **Consumer note — the docs hub carries a LOCAL `layouts/_shortcodes/reuse.html` override that shadows this module file** (it flattens reuse output to one line). The production defect is fixed by the identical edit to that override in the consumer repo; this module change keeps the two copies in parity. A pin bump alone does NOT change hub output while the override exists.
- Observable in production: on [Solo Enterprise for kgateway — Sample app](https://docs.solo.io/kgateway/2.3.x/install/sample-app/#deploy-app) the httpbin `kubectl apply` command rendered `refs/heads//examples/httpbin.yaml` (empty branch), [2.1.x](https://docs.solo.io/kgateway/2.1.x/install/sample-app/#deploy-app) rendered a doubled `refs/heads/v2.2.xv2.3.x/…`, and 2.2.x rendered `main` — the branch comes from `kgw-docs/versions/github-branch.md`, which maps enterprise versions to branches with keepVersion. Verified with a local `hugo160` `kgateway` build: the three pages now render `main`, `v2.3.x`, and `v2.2.x`, a site-wide sweep finds no empty or doubled branch tokens, and the v0.1.22 `get_cookie` remap still works. The fixture now reproduces the production shape (the `v1` entry carries `ossVersion = "v3"`, so the token `v3` — itself a fixture version — remaps to `v1`) with a matched pair of inline blocks differing only in `keepVersion`; `tests/reuse-version-remap.spec.ts` asserts the plain block IS remapped onto v1 (the control, so the keepVersion assertion can't pass vacuously) while the keepVersion block stays on v3, and fails on all three counts without the guard. Takes effect on the hub via the override edit; for other consumers, on a pin bump.

### Fix — capped reference tables stop folding one character per line on phones (`assets/css/docs-theme-extras.css`, fixture, `tests/table-display.spec.ts`)

- **Why.** A wide reference table auto-tagged `.table-capped` (`render-table.html` applies it to any table with 3+ columns) collapsed into an unreadable vertical strip on phones: at 375px, `table-layout:auto; width:100%` squeezes the columns toward nothing and the `overflow-wrap: anywhere` cap folds the content — measured on the fixture at **1 character per line over 50 lines** for a registry token and 1 over 146 for a prose Description cell.
- **What changed.** Below the same `767px` breakpoint `main.css` uses, capped cells switch from `overflow-wrap: anywhere` to `break-word`. The keywords differ in exactly the property that matters: `anywhere` lets a cell's min-content width collapse to one glyph, `break-word` floors it at the longest unbreakable token. Measured after: 13 chars/line over 4 lines, 10 over 21, no horizontal scroll. Desktop is unchanged (the rule is inside the media query).
- **Why not `white-space: nowrap`** (now a comment in the CSS): `.table-capped` hits every 3+ column table, i.e. the `Field | Type | Default | Description` shape whose Description holds prose — 25% of capped cells in kgateway-oss exceed 60 characters, the longest ~2750. Forcing those onto one line measured a **5.7x-viewport** horizontal scroll on the fixture and **33x** against real agentgateway airgap/CRD tables. Prose has to keep wrapping; only the collapse floor needed fixing.
- Observable in production: [Solo Enterprise for kgateway — Air-gapped installation](https://docs.solo.io/kgateway/2.3.x/install/airgap/) carries an image table whose Registry column holds long `us-docker.pkg.dev/…` tokens, folding one character per line on a phone today. Verified with `hugo160` OSS + enterprise builds; `tests/table-display.spec.ts` now bounds the behavior from both sides at 375px — an unbreakable-token block asserting ≥4 chars/line, and a prose block (backed by a new fixture table with ~200-char sentences) asserting the cell isn't `nowrap`, wraps, clears the same floor, and keeps the table under 3x the viewport. Line counts come from real line boxes (Range client rects), since computed `line-height` on these cells is `normal`. The pair fails on `anywhere` and on `nowrap`. Takes effect on a pin bump.

### Fix — mobile chip-row edge fade uses a content mask so chip text no longer slides under the ‹ / › arrows (`assets/css/docs-theme-extras.css`, `assets/js/mobile-nav.js`)

- **Why.** The scrolling version/tab chip rows faded their edge with a solid `linear-gradient` *background* behind the arrows, so the gradient sat behind the text and a chip still slid visibly under the arrow — and the effect needed a hand-maintained dark-mode variant to match the panel color.
- **What changed.** A `mask-image` on the scroll track fades the content itself toward whichever edge can still scroll, so chip text dissolves before reaching the arrow and no dark-mode color variant is needed. `mobile-nav.js` toggles `.scroll-fade-start`/`.scroll-fade-end` per edge and clears them at rest, so the first/last chip isn't faded where there's no arrow; the fade widths default to `0`.
- Observable in production at phone width, e.g. the drawer's version chip row on [Solo Enterprise for kgateway — Quickstart](https://docs.solo.io/kgateway/2.3.x/install/quickstart/). Verified with `hugo160` OSS + enterprise builds: the built stylesheet carries the `[data-scroll-track]` mask rule and the two fade widths, and both solid-gradient rules (plus their `.dark` variants) are gone. **Test gap:** the per-edge toggle is verified by inspection, not by an assertion — the code runs on the path the AJAX-swap test exercises, but the fade itself is unasserted. Takes effect on a pin bump.

### Fix — paint markdown links in the version banner so they read as links (`assets/css/docs-theme-extras.css`, `hugo-*.toml`, `tests/version-banner-link.spec.ts`)

- **Why.** A markdown link in a consumer's `[[params.versions]].banner` rendered as a real `<a href>` but in the banner's own body color with no underline and no weight change — clickable but unfindable, which reads to an author as "the banner link is broken." Link *generation* was never the problem: the banner renders outside `.content`, and the theme's only anchor rules are scoped `.content a`, while Hextra's Tailwind preflight resets `a` to inherit color and text-decoration. The anchor therefore inherited `--tw-prose-body` from `.version-banner`.
- **What changed.** New `.version-banner a` rules take color from the brand's runtime `--theme-primary` (both brand layers redefine it under `.dark`, so one rule covers both brands and both schemes) plus `font-weight: 500` and an unconditional underline, since a color shift alone is weak against the banner's tinted fill. `:hover` moves to `--theme-primary-hover` and drops the underline, with a `:where(.dark, .dark *)` override holding the resting color in dark mode (`--theme-primary-hover` is defined only in the light `:root`, and reusing it would darken the link toward the banner background).
- **Why no test caught it.** The fixture's `main` banner was link-free, so no build in the harness had ever rendered a banner anchor. All four fixture configs now carry an internal *and* an external markdown link there, which also exercises `render-link.html`'s `relURL` and `target="_blank"` branches inside the banner.
- Observable in production on [Gloo Gateway 1.21.x](https://docs.solo.io/gateway/1.21.x/), whose banner links to the kgateway docs: the served HTML has the anchor, but neither deployed stylesheet contains a `.version-banner a` rule, so it renders in gray body text. Verified with `hugo160` OSS + enterprise builds and a new `tests/version-banner-link.spec.ts`, which auto-discovers a configured page whose banner holds an anchor and asserts, in both light and dark mode, that every anchor has a resolvable `href`, differs from the banner body color or is underlined, and clears 3:1 against the banner fill (compositing the translucent dark-mode background over its opaque ancestor). Confirmed failing without the CSS and passing with it; full `make test-all` green on both brands (1648 passed, 14 skipped each). Because the spec keys off the consumer's own config, it carries signal against consumer builds too. Takes effect on a pin bump.
- **Known limitation:** on the enterprise brand the resting `--theme-primary` (`#158bc2`) clears only ~3.6:1 against the light banner fill, under WCAG AA's 4.5:1 for normal text — which is why the spec's floor is 3:1. That is the brand's existing `.content a` color, so darkening it is a brand-layer decision, not a banner fix.

### Fix — `link-hextra` stops mangling `reference/api-*` sibling sections, and routes the agentgateway CEL reference to the enterprise page (`layouts/_shortcodes/link-hextra.html`, `fixture/assets/conrefs/test/everything.md`, `tests/link-hextra-apiref.spec.ts`)

- **Why.** Two enterprise-only 404 classes in the agentgateway link report. (1) The reference/api routing guard tests `in $path "reference/api"`, a substring that also matches the sibling section `reference/api-kubespec`, so a shared-source link to `/reference/api-kubespec/policies/#…` was rewritten to `/reference/api/api-kubespec/policies/` — a path that exists on no build. Live on [/agentgateway/2026.7.1/security/backend-authn-cross-app-access/](https://docs.solo.io/agentgateway/2026.7.1/security/backend-authn-cross-app-access/): the `crossAppAccess` field link points at `/agentgateway/2026.7.1/reference/api/api-kubespec/policies/`. (2) agentgateway OSS splits its CEL reference into `/reference/cel/variables/` and `/reference/cel/yaml-and-examples/`; the enterprise docs serve one `/reference/cel/` page carrying the same anchors, so every rebased OSS page linking the CEL functions list 404s — 8 of them across `latest`, `2026.7.1`, and `2.3.x`, e.g. the "CEL functions" link on [/agentgateway/2026.7.1/traffic-management/transformations/rewrite/](https://docs.solo.io/agentgateway/2026.7.1/traffic-management/transformations/rewrite/), which should land on [/agentgateway/2026.7.1/reference/cel/#functions-policy-all](https://docs.solo.io/agentgateway/2026.7.1/reference/cel/#functions-policy-all).
- **What changed.** `reference/api-` joins the `$alreadyRouted` list, so any `reference/api-*` sibling passes through untouched instead of being treated as the single-page reference. A new rule collapses `reference/cel/(variables|yaml-and-examples)/` to `reference/cel/`, gated on the rebase-injected `product == "agentgateway"` — the same product-only signal the existing agentgateway branch uses, so the OSS site (which sets no product) keeps its own paths and no assumption is made about the OSS site config. Anchors ride along unchanged, which is the point: the enterprise page publishes the same `#functions-policy-all` IDs.
- Verified with `hugo160` on both fixture brands. `tests/link-hextra-apiref.spec.ts` grows five markers (the `api-kubespec` sibling, plus the CEL variables/yaml/already-collapsed/no-signal cases): 9/9 on OSS and enterprise. Both guards were break-tested — dropping the `reference/api-` term and disabling the CEL rule fails exactly the three new assertions and leaves the six pre-existing ones green. Takes effect in the docs hub when it bumps its extras pin (currently `v0.1.25-beta.2`, no local replace).

### CI — parallelize the two brand layers and keep a single required status check (`.github/workflows/test.yml`, `playwright.config.ts`)

- **Why.** `make test-all` chains `build-oss` + `test-oss` + `build-enterprise` + `test-enterprise` in one job, so every push paid ~2x the single-brand cost back-to-back; and a stalled `sudo apt-get` during the browser install could hang to the 15-minute job timeout while a stale run lingered on the same branch. The brands are independent (separate builds, `publishDir`, `DOCS_TEST_CONFIG`), so nothing required a shared runner.
- **What changed.** The job fans out over `matrix.brand: [oss, enterprise]` with `fail-fast: false`; `PW_WORKERS` is tunable and set to `4` in CI; a `concurrency` group keyed on `github.ref` supersedes in-flight PR runs; the browser-install steps carry `timeout-minutes: 5` so a hung `apt-get` fails fast and re-runnable; and failure artifacts are per-brand so the jobs don't collide. Nothing here touches the published Hugo module.
- **All three engines run on PRs, and workers stay at the core count.** An earlier revision dropped firefox + webkit on PRs while raising `PW_WORKERS` to 6. `ubuntu-latest` is a **4-core** runner for public repos, and firefox is the engine that shows oversubscription first — locally at high parallelism it produced three `page.goto` timeouts plus a `cross-browser.spec.ts` flake, all 11/11 at `--workers=1`. Making main the only home of firefox coverage *and* running it oversubscribed would mean engine regressions surface post-merge, in the runs most likely to be waved off as flake. So `PW_BROWSERS` is the full set on every event, `PW_WORKERS` is `4`, and `CROSS_BROWSER=chromium` survives only as a local escape hatch CI never sets. The cache key drops its `PW_BROWSER_TAG` component, which existed only to keep a chromium-only PR cache from being restored by an all-engines main run.
- **`cancel-in-progress` is now PR-only.** Cancellation is keyed on the branch, not the commit, so on main two quick merges would cancel the first one's run and leave a merged commit with no completed sweep.
- **A `test-all` aggregation job keeps branch protection stable.** The matrix reports as `brand (oss)`/`brand (enterprise)`, so requiring those directly would mean re-pointing branch protection whenever the matrix changes shape. The matrix job is renamed `brand`, and a dependent job (`needs: [brand]`, `if: always()`, asserting `needs.brand.result == 'success'`) re-exposes the single `test-all` context the rule already requires — `cancelled` and `skipped` fail the assertion too. **No branch-protection edit is needed.**
- No production page: this is test-infra only, outside the module consumers pin, so no pin bump is involved. Verified locally with `hugo160`: the full suite passes on both fixtures with all three engines, `CROSS_BROWSER=chromium` drops firefox + webkit, and the workflow resolves to exactly two jobs. *(Moved here from v0.1.23 — the code landed after that tag was cut.)*

### Fixture — give the `link-hextra` reference/api markers real link targets (`fixture/content/en/test/{main,v1,v2}/reference/`)

- **Why.** The v0.1.20 routing markers on the Everything page pointed at `/test/v2/reference/api/…#TypeA` paths the fixture never published, so every fixture build shipped seven broken links, reported against the docs hub. `tests/link-hextra-apiref.spec.ts` asserts the emitted `href` strings, so the markers were right — nothing had created the pages.
- **What changed.** Each version gains a `reference/api/` subtree with the three routed targets (single-page index, the `kgateway` enterprise subpage, the `api` agentgateway subpage). They exist in all three versions, not just `v2`, because the Rebased pages run the `version="v2"` links through the two-pass remap onto their own version — which is why the report listed `v1` and `main` paths too. Anchors are explicit `{#TypeA}` heading attributes, not Goldmark slugs: generated API references emit CamelCase type IDs and the inbound links use that case, so `## TypeA` alone would publish `id="typea"` and lychee's `include_fragments` pass would flag it. Each page carries `build: {list: never, render: always}` so the subtree renders as link targets without entering the sidebar or the auto-card counts that `auto-cards.spec.ts` and `sidebar-rail.spec.ts` pin.
- No production page: the fixture is mounted only for the `test` product, which is excluded from `firebase-hosting-merge.yml`, so no pin bump is involved. Verified with `hugo160` on both brands: all nine pages build with `id="TypeA"` intact, per-version auto-card counts unchanged, no `warnMissingDescription` warnings, `static` + `content` projects pass (1469 passed). Re-ran `lychee 0.24.2` with the CI action's exact flags: all seven errors gone with zero fragment warnings, and a deliberately bogus `#TypeZZZ` probe still fails, so the anchors are genuinely checked.

## [v0.1.24] — 2026-07-31

### Fix — infer fully qualified (LTS) versions in `link-hextra` (`layouts/_shortcodes/link-hextra.html`, `tests/link-hextra-lts-version.spec.ts`)

- **Every reuse-nested cross-doc link on a fully qualified version tree — e.g. agentgateway's new `2026.7.1` LTS docs — resolves to `/latest/…` instead of `/2026.7.1/…`, and the build logs a `link-hextra called with no version and could not infer one from …` WARN for each one (which fails `hugo-warnings.spec.ts`, so the LTS branch can't go green).** `link-hextra` infers the target version by regex-matching the page's permalink when no `version=` was passed, and both of its patterns accepted only `\d+\.\d+\.x`, `latest`, or `main`. A three-segment version matched neither, so inference fell through to the last-resort `$ver = "latest"` fallback. This is not a version-tree-only concern: the pages that hit it are ordinary `{{< reuse "…" >}}` stubs, and `reuse.html` injects `version=` into nested `link-hextra` calls only when the page passed a version POSITIONALLY (`$parentVersion`) — the version it resolves from the permalink for asset lookup (`$resolvedVersion`, which matches against `params.versions` and therefore handled `2026.7.1` fine) is never injected. So on any product whose reuse stubs omit the positional version, the shortcode's own regex is the only thing standing between the page and a wrong-version link. `2.3.x`-style trees were unaffected only because they happen to match the narrow pattern. Fix: widen both alternations to `\d+\.\d+\.(?:x|\d+)`, so `X.Y.x` and `X.Y.Z` both infer. Nothing else in the shortcode changes — the language-prefix strip, the `reference/api` subpage routing, and the baseURL handling are untouched, and a version that still can't be inferred keeps warning and falling back to `latest`.
- **Consumer note — `docs` carries a LOCAL `layouts/_shortcodes/link-hextra.html` override with the identical widening**, because the LTS branch there can't wait on a pin bump (it pins v0.1.23). That override is marked for deletion once the hub bumps to a release carrying this fix; while it exists, module-side `link-hextra` changes do NOT reach the hub. Same shape as the v0.1.22 `reuse.html` override note.
- Observable in production: on the [agentgateway 2026.7.1 WAF overview](https://docs.solo.io/agentgateway/2026.7.1/security/waf/overview/), the in-body "Custom rules" / "IP filtering" links point at `/agentgateway/latest/security/waf/…` before the fix and `/agentgateway/2026.7.1/security/waf/…` after — links that silently retarget as soon as `latest` moves on. Verified against the hub's real build (`make build-preview PRODUCT=agentgateway`): the pre-fix log carried 60+ `link-hextra called with no version` WARNs across the `2026.7.1` tree and zero after, the only remaining WARN being the allowlisted `.Site.Data` deprecation; the rendered page's `custom-rules` hrefs are `/agentgateway/2026.7.1/security/waf/custom-rules/` (plus the `#body-inspection` anchor), with `/latest/` left only in the version-dropdown and nav index where it belongs; and the hub's `content` project passes 130/130. `tests/link-hextra-lts-version.spec.ts` extracts both `findRE` patterns from the shipped shortcode and exercises them directly (source-level, since the bundled fixture has no fully qualified version tree and adding one would shift the URLs the rest of the suite asserts on) — it fails if either alternation is narrowed back to `X.Y.x`-only. Full `static` project green (1307 passed) on the enterprise fixture. Takes effect on the hub via its override; for other consumers, when they bump their extras pin.

## [v0.1.23] — 2026-07-29

### Fix — actually hide the llms.txt discovery directive from sighted readers (`layouts/_partials/docs-llms-directive.html`)

- **The llms.txt discovery hint wired up in v0.1.22 renders as plain, visible body text on every product — "For the complete documentation index, see llms.txt. Markdown versions of all docs pages are available by appending .md to any docs URL." — instead of the screen-reader-only hint it was meant to be.** The partial wrapped the paragraph in `class="sr-only"`, but the extras/Hextra Tailwind build only generates the `hx:`-prefixed utilities that Hextra core already references; a bare, unprefixed `sr-only` class has **no** rule in the compiled CSS, so it hides nothing and the paragraph falls back to normal flow text near the top of every docs page. (The theme's own navbar uses the correct `hx:sr-only` form, which is why that label stays hidden.) Fix: change the class to `hx:sr-only`, matching the generated utility (`.hx\:sr-only{clip-path:inset(50%);position:absolute;width:1px;height:1px;overflow:hidden;…}`). The `tests/llms-directive.spec.ts` HTML-directive matcher was updated to the new class.
- Observable in production: [ambientmesh.io — Quickstart](https://ambientmesh.io/docs/quickstart/) (and every other docs product) shows the "For the complete documentation index, see llms.txt…" sentence as visible text at the top of the content today; after a consumer bumps its extras pin, the same sentence is present in the HTML for AI agents/screen readers but visually hidden. Verified with a local `hugo160` `make build-oss`: the rendered directive now carries `<p class="hx:sr-only">`, no unprefixed `<p class="sr-only">` directive remains, and the `.hx\:sr-only` visually-hidden rule is present in the CSS the page loads. `tests/llms-directive.spec.ts` passes 4/4 on both the OSS and enterprise fixtures. Takes effect when a consumer bumps its extras pin.

## [v0.1.22] — 2026-07-29

### Fix — remap OSS→enterprise version numbers inside percent-form `{{% version %}}` blocks in reused content (`layouts/_shortcodes/reuse.html`)

- **A version-gated table row authored in percent form — `…row… |{{% version include-if="2.4.x,2.5.x" %}}` … `{{% /version %}}` — renders on the OSS site but is DROPPED on the enterprise docs hub, because `reuse.html`'s two-pass OSS→enterprise version remap only matched angle-form `{{< version …>}}` blocks.** The remap rewrites an OSS version number (`ossVersion`, e.g. `2.4.x`) to the enterprise one (`version`, e.g. `2.3.x`) so an `include-if` authored against OSS releases still resolves on the hub. Its Pass-1 regex was anchored on `\{\{<` (angle only). Content authored in percent form therefore kept its OSS version numbers; on the enterprise page the current version (`2.3.x`) was not in the un-remapped `include-if="2.4.x,2.5.x"`, so `version.html` excluded the rows entirely. This is the `get_cookie` / `get_cookie_i` block in kgateway's `templating-language.md` (pulled via `{{< reuse >}}` nested inside `{{< rebase >}}`). It only bites percent-form blocks: `rebase.html` bulk-converts percent→angle in its Stage 3 before remapping, but `reuse.html` never does that conversion, and the OSS site worked only because `2.5.x` matched the `/main` page directly (no remap needed). Fix: broaden the Pass-1 anchor to `\{\{[<%]` (and the intervening class to `[^>%]`, keeping each match confined to a single tag) so both angle and percent version blocks are remapped. Also synced this file's table-row exception to the multi-row form `((?:\s*\|[^\n]*\|)+\s*)` (it still had the old single-line `(\s*\|[^\n]*?\|\s*)`), matching `rebase.html`, so an angle-form block wrapping more than one pipe row re-flows into the parent table instead of being dropped.
- **Consumer note — the docs hub carries a LOCAL `layouts/_shortcodes/reuse.html` override that shadows this module file** (it exists to flatten reuse output to one line and avoid Goldmark list-item breaks). The production defect is therefore fixed by the identical parallel edit to that override in consumer repos; this module change keeps the two copies in parity for consumers without an override and for when the override is eventually retired. A pin bump alone does NOT change hub output while the override exists.
- Observable in production: [Solo Enterprise for kgateway — Templating language, Custom transformation functions](https://docs.solo.io/kgateway/2.3.x/traffic-management/transformations/simple/templating-language/#custom-inja-functions) is missing the `get_cookie(cookie_name)` and `get_cookie_i(cookie_name)` rows, while the same table on [kgateway.dev OSS](https://kgateway.dev/docs/envoy/main/traffic-management/transformations/templating-language/#custom-inja-functions) shows them; after the docs override edit ships, both rows appear on the 2.3.x hub page. Verified with a local `hugo160` build of the `kgateway` product: the two rows render as real `<tr><td>` cells on `2.3.x` (ossVersion `2.4.x`) and stay correctly excluded on `2.1.x`/`2.2.x`, the surrounding table is intact (the only raw pipes are inside the `<script class="copy-md-source">` block), and the 5 other kgw pages that use percent-form OSS-version blocks (cors, external-auth-http, policies-index, waypoint, timeouts) build with no shortcode leaks or stray version tokens. Now covered by the Playwright harness: the fixture's v2 version entry carries `ossVersion = "v2oss"` (both brand configs), and `content/en/test/{v2,v1}/version-remap.md` reuse a snippet whose gated row is authored in percent form against `v2oss`; `tests/reuse-version-remap.spec.ts` asserts the row is remapped in and renders as a real `<td>` cell on v2, stays excluded on v1, and leaves no shortcode/placeholder token behind — it FAILS if the Pass-1 anchor is reverted to angle-only. Takes effect on the hub via the override edit; for other consumers, when they bump their extras pin.

### Fix — flatten the GitHub-style alert HTML so a callout survives being reused inside a tab (`layouts/_partials/components/github-style-alert.html`)

- **A `> [!TIP]`/`> [!NOTE]`/etc. callout that lives in a reuse snippet renders as a raw `<div class="hx:w-full …">` code dump — not a styled box — when that snippet is pulled into a `{{% tab %}}` that itself sits indented inside a numbered list item.** This is the exact shape in agentgateway's `agentgateway-setup.md`/`prereq.md`, which reuse `kind-loadbalancer-tip.md` inside a "Cloud Provider LoadBalancer" tab under a numbered step. Root cause is a double markdown render: `reuse` pre-renders the callout to HTML, then the percent-form `{{% tab %}}` runs that HTML through a SECOND Goldmark pass. The alert partial emitted a **blank line** between its header `<p>` and the body `<div>`s and **indented** those inner divs (2/4/6 spaces). On the re-render — already offset by the list item's 3-space indent — the blank line terminated the HTML block and the indented inner divs crossed CommonMark's "4 spaces = code" threshold, so the box's body leaked into a literal `<pre><code>`. The box's header still rendered, which is why the bug looks like a half-broken callout. A callout used directly at column 0 (not inside a reused/indented tab) never tripped this, which is why it went unnoticed. Fix: emit the entire alert `<div>…</div>` on ONE contiguous line — no blank line, no leading indentation — so it stays a single raw HTML block that passes through the second markdown pass untouched. The copy-as-markdown body-end `<span data-alert-md-end>` sentinel and all class strings are unchanged, so `[!SOLO]`/`[!SUCCESS]` custom types, icons, and the `.md` round-trip are unaffected. No content edits required; the ~three intermediate agentgateway snippets (and every page that reuses them) self-heal on the pin bump.
- Observable in production: [agentgateway — Set up an API gateway (Kubernetes)](https://agentgateway.dev/docs/kubernetes/latest/setup/gateway/) — open the "Cloud Provider LoadBalancer" tab under the step that gets the proxy address; before the fix the Kind-cluster Tip shows raw `<div class="hx:w-full hx:min-w-0 …">` markup instead of a green Tip box. After a consumer bumps its extras pin, it renders as a normal callout. Verified: added a "Reused inside a tab in a numbered list" subsection to the `everything.md` fixture (reusing a callout snippet whose body deliberately mixes a paragraph, a list, AND a fenced code block) plus `tests/callout-in-reuse-tab.spec.ts` — the leak guard FAILS on the pre-fix partial (wrapper markup leaks into a `<pre>`) and passes after, and the box-completeness assertions confirm the multi-block body renders in full inside the alert with the only `<pre>` being the callout's own fenced code. `callout-icon`, `custom-alert`, `callout-in-table-cell`, and `copy-md-fidelity` stay green on the OSS + enterprise fixtures. Takes effect when a consumer bumps its extras pin.

### Fix — emit the llms.txt discovery directive on hub-rendered docs pages (`layouts/docs/single.html`, `layouts/docs/list.html`, `layouts/_partials/docs-llms-directive.html`)

- **Every docs.solo.io product fails the afdocs `llms-txt-directive-html` check (0/50 sampled pages) while the OSS sites pass it, because the `docs-llms-directive.html` partial that emits the `<p class="sr-only">…llms.txt…</p>` hint was only ever called from the OSS repos' own `docs/single.html`/`list.html` overrides — extras' own `docs/` layouts, which the hub renders through unmodified, never invoked it.** Wired the partial into extras' `docs/single.html` and `docs/list.html` (top of `<div class="content">`, matching the OSS placement), so any consumer without a layout override — i.e. the whole `docs` hub — now emits the directive. Also fixed the partial's hardcoded `href="/docs/llms.txt"`, which 404s on the hub (llms.txt is product-prefixed there, e.g. `/kgateway/llms.txt`, not `/docs/llms.txt`): the href is now derived from the home page's `llms` output format (`site.Home.OutputFormats.Get "llms"`), so it resolves to `/llms.txt` on the OSS domains and `/kgateway/llms.txt` on the hub, and the llms half renders only when that output format actually exists. Non-breaking for the OSS sites: their override still calls the same partial, and the derived `/llms.txt` returns 200 on both agentgateway.dev and kgateway.dev (as does the old `/docs/llms.txt`).
- **Same hardcoded `/docs/llms.txt` fixed on the `.md` output surfaces too.** The `page.markdown.md` and `section.markdown.md` output-format templates emit the SAME discovery directive as a leading blockquote (`> …[llms.txt](…)…`) for readers who append `.md` to a URL — and they still pointed at `/docs/llms.txt`, so that link 404s on the hub exactly as the HTML one did. All three surfaces now derive the href through one shared partial, `layouts/_partials/utils/llms-href.html` (returns the home page's `llms` output-format `RelPermalink`, or `""`), so the HTML hint and the two `.md` templates cannot drift apart again — which is how the `.md` templates got missed the first time.
- Observable in production: view-source on [Solo Enterprise for kgateway landing](https://docs.solo.io/kgateway/latest/) (or any docs.solo.io page) shows no `llms.txt` reference in the HTML today; after a consumer bumps its extras pin, each page carries `<p class="sr-only">…<a href="/kgateway/llms.txt">llms.txt</a>…</p>` near the top of content, and appending `.md` to a hub URL yields a leading `> …[llms.txt](/kgateway/llms.txt)…` blockquote that resolves instead of 404ing. Tracked by the agent-readiness scan (`llms-txt-directive-html`, FAIL on all 8 hub products). Verified on the extras OSS fixture (`make build-oss`, served under `/test`): the directive renders on all 31 doc pages (single + section-index) with `href="/test/llms.txt"` pointing at the real generated `public-oss/test/llms.txt` (no 404), at ~13% into the page — inside the check's "near the top of content" band; `tests/llms-directive.spec.ts` locks in all three surfaces (HTML single + section, `.md` single + section) using the derived, resolves-to-a-real-file href on both brand fixtures. Takes effect when a consumer bumps its extras pin.

### Add — section-index child navigation in the `.md` output and "Copy as Markdown" (`layouts/partials/copy-markdown.html`, `layouts/_partials/page-to-markdown.html`)

- **A section-index page's child-navigation card grid is rendered by the LIST layout (`layouts/partials/auto-section-cards.html`), not from `.Content`, so it never reached either markdown-output surface — a reader who appended `.md` to a section landing or clicked "Copy as Markdown" got the intro prose but NONE of the child navigation the rendered page shows.** Both partials now emit the section's children as a plain markdown link list (`- [Title](url): description`), mirroring `auto-section-cards.html`'s child selection (`.Pages.ByWeight`, drop `hidden: true`, and honor both `disableCards` and the `hasManualCards` store flag that a `{{< cards >}}` in the body sets — that content already lives in `.Content` and is handled by the existing card-collapse regexes, so a page with manual cards is never double-listed). The `:` separator matches the repo's own `llms.txt` entry format. Two coupled cleanups ride along: (1) the footnotes block is pulled off the end of `.Content` and re-appended AFTER the child list — matching the rendered page, where `docs/list.html` splits footnotes below the cards — instead of wedging them between the body and the nav; and (2) Goldmark's body/footnote `<hr>` separator, which `transform.HTMLToMarkdown` serializes as a bare `* * *`, is stripped, since a thematic rule carries no meaning in a plain-markdown artifact.
  - **Shared, not copy-pasted:** the footnote pull-off and the child-link-list generation are extracted into two returning partials — `layouts/_partials/utils/md-footnote-split.html` (returns `{html, footnote}`) and `layouts/_partials/utils/md-section-child-links.html` (returns the markdown link list or `""`) — which both `page-to-markdown.html` and `copy-markdown.html` call. The two markdown surfaces are meant to produce identical output, so the logic lives in one place instead of two blocks that have to be "kept in sync" by hand.
  - **Also fixes a latent punctuation bug in `page-to-markdown.html`:** its smart-punctuation pass used ASCII straight quotes in the character classes instead of the curly quotes it meant to match, so it silently no-op'd; and a child `description` rendered through `markdownify` emits the curly apostrophe entity-encoded (`&rsquo;`), which that pass — running before `htmlUnescape` in this partial — also missed. Corrected the classes to the curly `[‘’]`/`[“”]` and decode entities in the description pipe (`markdownify | plainify | htmlUnescape`, matching `auto-section-cards.html`), so the `.md` output is plain ASCII and consistent with "Copy as Markdown" (which was already correct — it uses curly-quote classes and unescapes before normalizing). This stayed latent because Solo docs prose rarely uses contractions or curly quotes; the new markdownify'd card descriptions are what surface it.
- Observable in production: [Solo Enterprise for kgateway landing](https://docs.solo.io/kgateway/latest/) renders 13 auto navigation cards (Get started, About, Install, …) and a "Copy as Markdown" button; append `.md` to the URL, or click the button — today the output ends at the intro paragraph with no child links. After a consumer bumps its extras pin, the 13 children render as a `- [Title](url): description` list. (No production section index currently carries a footnote, so the footnote-reorder + `* * *`-strip and the ASCII-punctuation fix are verified on the theme fixture.) Verified: a new `tests/footnotes-after-cards.spec.ts` block exercises BOTH surfaces on the fixture's v2 landing (which has auto-cards AND a footnote) — the child link list is present, the footnote follows it, there is no `* * *`, and the description carries a straight apostrophe; `copy-md-fidelity`, `markdown-leaks`, and `auto-cards` stay green on the OSS + enterprise fixtures. Takes effect when a consumer bumps its extras pin.

## [v0.1.21] — 2026-07-27

### Fix — stop legacy image pairs from stacking in dark mode (`layouts/_shortcodes/reuse-image.html`, `assets/css/docs-theme-extras.css`)

- **Pages authored with the pre-`srcDark` pattern — a lone `{{< reuse-image src=... >}}` immediately followed by a separate `{{< reuse-image-dark srcDark=... >}}` for the same figure — render BOTH images stacked on top of each other in dark mode; light mode is correct.** Root cause: the v0.1.17 "lone `src` renders in both modes" change made a lone `reuse-image` emit an UNWRAPPED figure (visible in both light and dark) instead of the old `.toggle-dark` (light-only) wrapper. So in dark mode the light image (now always visible) and the dark image (`.toggle-light`, shown by `.dark .toggle-light`) both display. The v0.1.17 note claimed a survey found "zero" such pairings, so the case was treated as future-authoring only — but later found the pattern across ~535 files (it regressed silently because the default authoring view is light mode, where it looks fine). Fix WITHOUT a content migration: the SINGLE branch of `reuse-image` now tags its wrapper `.reuse-image-nodark`, and CSS adds `.dark .reuse-image-nodark:has(+ .toggle-light) { display: none; }` — the both-modes light image is hidden in dark mode ONLY when a dark-only sibling immediately follows it. A truly lone image (no dark sibling) never matches and still shows in both modes; the canonical single-call `src`+`srcDark` PAIR form is unaffected. Graceful degradation: browsers without `:has()` fall back to the pre-fix stacked rendering (no worse than today). This makes the #3265 content migration optional rather than required. Observable in production: [SPIRE workload identity — How it works](https://docs.solo.io/istio/1.31.x/security/workload-identity/spire/#how-it-works) shows two stacked diagrams in dark mode before the pin bump; after, one diagram per mode. Verified: added the legacy pattern to the extras fixture (`everything.md`) and a computed-visibility guard (`tests/reuse-image-dark-pair.spec.ts`) — in dark mode the light half is `toBeHidden()` and only the dark half is visible, in light mode the reverse, and a lone image with no dark sibling stays visible in dark; the emitted-class contract is pinned in `tests/versioned-image-auto.spec.ts`. Takes effect when a consumer bumps its extras pin.

### Add — opt-in source lint for the legacy image-pair anti-pattern (`tests/reuse-image-pair-lint.spec.ts`, `tests/helpers/reuse-image-pair.ts`, `checks.reuseImagePair`)

- **With the CSS defense above the legacy pattern renders correctly, but it is still non-canonical and easy to reintroduce — and the failure mode is invisible in the light-mode authoring view (the same reason it went unnoticed since v0.1.17).** Added a source scanner that flags a lone `reuse-image` (no `srcDark`) immediately followed (whitespace-only — the same DOM adjacency that stacks the two figures) by a `reuse-image-dark`, so a team that wants clean source can enforce the single-call `src`+`srcDark` form. Detection is narrow: prose between the two calls breaks the DOM adjacency and is not flagged; a call that already carries `srcDark`, and the correct `reuse-image-light`+`reuse-image-dark` dedicated pair, are never flagged. Gated on `checks.reuseImagePair`, which **defaults `false`** — the runtime CSS fix means this is a "prefer the canonical form" nudge, not a correctness gate, so it never forces the migration the CSS fix was written to avoid. The pure matcher unit tests always run; the source walk runs only when a consumer opts in. Verified: the 9 helper unit tests pass and the gated walk skips under the default config on the extras fixture. Takes effect immediately for consumers that enable the check.

### Fix — externalize the mobile-nav `<head>` script so it can't blind the link checker (`themeExtras/head-end.html`, new `assets/js/mobile-nav.js`)

- **The mobile-navigation bootstrap (theme toggle, sidebar open/close, hamburger wiring, version/tab chip scroller, tab structure-swap) shipped as an INLINE `<head>` `<script>`, and its `for (var i = 0; i < n.length; i++)` loops minify to `i<n.length` — a `<`+letter sequence. A naive HTML parser (the docs link checker's, lychee / html5ever) reads `<n` as a start-tag and silently drops every link after it; in `<head>` that loses the ENTIRE page body from link extraction, so broken-link checking goes dark site-wide while the page still renders fine in browsers.** This is the exact regression that already forced `docs-init.js` to be externalized; the `inlineScriptSafety` check added in `built-html-integrity.spec.ts` now catches it, and beta.4 shipped the check while still failing it (2087/2087 agw pages flagged). Fix: move the inline block verbatim into a new external `assets/js/mobile-nav.js`, referenced with `<script src defer>` exactly like `docs-init.js`. An external `.js` file is never parsed as HTML, so it can't trip the parser; the `toggleMobileTheme` / `toggleMobileSidebar` / `closeMobileSidebar` function declarations stay global (consumers' nav templates call them via inline `onclick`), and `defer` + the existing `DOMContentLoaded` wrappers preserve execution timing. Observable in production: view-source on any agw docs page (e.g. [agentgateway docs](https://agentgateway.dev/docs/)) before the fix shows an inline `<head>` `<script>` containing `…mobile-scroller"),t=0;t<n.length;t++…`; after, that script is a single `<script src="…/js/mobile-nav.js" defer>` and no inline `<head>` script contains `<`+letter. Verified: rebuilt the extras OSS fixture — `mobile-nav.js` is emitted and referenced externally, the `inlineScriptSafety` test passes, and the mobile hamburger/sidebar behavior tests (`viewport.spec.ts` "clicking hamburger slides sidebar into view", cross-browser hamburger) stay green. Takes effect when a consumer bumps its extras pin.

### Fix — strip markdown from auto-section-card descriptions (`partials/auto-section-cards.html`)

- **A child page's front-matter `description` containing markdown rendered wrong on the auto-generated section cards.** The card description was emitted as `{{ .Description | truncate 100 | markdownify }}`, which had two failure modes: (1) a markdown *link* (`[text](url)`) in a description `markdownify`s into an `<a>` NESTED inside the card's own `<a href>` wrapper — invalid HTML that trips the build-integrity/link scans; and (2) truncating BEFORE rendering can slice a token in half (`… in **one page` → `**one`), leaking a stray `**`. Fix: strip to plain text with `markdownify | plainify | htmlUnescape` and truncate LAST, matching the plain-text treatment in `utils/page-description.html` — so bold/italic/code/links all reduce to clean text, no nested anchors, no half-tokens. (Card behavior change: descriptions that previously rendered inline bold/italic on the card now show as plain text, consistent with the meta-tag surfaces.) Verified: built the extras OSS fixture whose `everything` child description is `… in **one page**, …`; before, the card `section-card-desc` carried the rendered/half-rendered markdown; after, it reads `… in one page, …` with zero `**`, and `tests/auto-cards.spec.ts` stays green. Takes effect when a consumer bumps its extras pin.

### Fix — strip markdown from meta descriptions (`_partials/utils/page-description.html`, `_partials/opengraph.html`)

- **A front-matter `description` containing markdown (e.g. `Review summaries of the main changes in the **Solo Enterprise for kgateway 2.3 release**.`) leaked its literal `**` into every description meta tag, so Slack/X link unfurls displayed the raw asterisks.** Hextra's `utils/page-description.html` pipes the value through `plainify | htmlUnescape` only, and `plainify` strips HTML tags but NOT markdown syntax — so a plain string with `**` passes straight through. Two overrides are needed because two independent code paths emit the description:
  - **`_partials/utils/page-description.html`** — inserts `markdownify` before `plainify` (`**x**` → `<strong>x</strong>` → `x`; `[a](b)` → `<a href=b>a</a>` → `a`). This feeds `<meta name="description">` (Hextra `head.html`), `<meta name="twitter:description">` (`twitter_cards.html`), and the JSON-LD `description` (`schema.html`), all of which resolve to this one partial. Logic otherwise mirrors upstream (explicit `.Description` wins; home falls back to the site description; other pages fall back to the already-rendered `.Summary`, which skips `markdownify`).
  - **`_partials/opengraph.html`** — Hextra emits `og:description` from RAW `.Description` in its own partial, NOT via `page-description.html`, and `og:description` is the field Slack/X read *first*. So `page-description.html` alone left the unfurl broken. This override is a byte-for-byte copy of Hextra v0.12.3's `opengraph.html` with the single `og:description` `content` re-routed through `utils/page-description.html`, so all four description surfaces share one markdown-stripping path. On a Hextra bump, re-diff against upstream and re-apply just that one line. Scope note: this does NOT touch extras' auto-section-cards, which still read raw `.Description` by design.
- Observable in production: view-source on [Solo Enterprise for kgateway 2.3 — Release notes](https://docs.solo.io/kgateway/2.3.x/reference/changelog/release-notes/) shows `og:description` (and `name="description"`, `twitter:description`, JSON-LD) as `… the **Solo Enterprise for kgateway 2.3 release**.` with literal asterisks — the `og:description` value is what the Slack unfurl renders. Verified: `tests/meta-description.spec.ts` asserts all four tags on the `main/everything` fixture page (description `… in **one page**, …`) reduce to `… in one page, …` with no `**`/`](`; a fixture build confirms the built `og:description`, `name="description"`, `twitter:description`, and JSON-LD all render the clean string. Takes effect when a consumer bumps its extras pin.

### Feature — section tab navigation (`docTabs`) — PROTOTYPE, opt-in 

- **New opt-in tab band that scopes the left sidebar to a subset of a version's top-level sections, so a product with a large nav can group its sections into tabs and keep each tab's sidebar short (the Mintlify/Portkey pattern) instead of one long flat tree.** New `layouts/_partials/docs-tabs.html` renders a horizontal tab row between the navbar and the sidebar/content row; `layouts/partials/sidebar.html` reads the active tab from the page store and filters its depth-0 items; version detection was extracted from the sidebar into a shared `layouts/_partials/utils/version-root.html` so the band and the sidebar never disagree about which version tree the page is in. Config declares the bar (`[[params.docTabs]]` with a `name` and optional `default = true`); front matter assigns a top-level page (`tab: "<name>"`), and anything untagged falls into the default tab. Opt-in and backward compatible: with no `params.docTabs` — or fewer than 2 non-empty tabs in the current version — the partial emits nothing and the sidebar renders the whole tree exactly as before (this is why every existing consumer and the fixture's untagged versions are unaffected). Below the `xl` desktop-sidebar breakpoint the band is hidden and the tabs move into the slide-out drawer as a chip row that structure-swaps the nav tree (`layouts/partials/themeExtras/head-end.html` JS). **Not yet enabled in any production consumer**, so there is no production page to link — this ships as an available-but-dormant prototype. Observable only on the theme's own fixture build: `make server-enterprise`, then compare `/test/main/everything/` (two pages tagged into a "Reference" tab → band renders "Documentation" + "Reference", left nav scoped to the active tab) with `/test/v1/everything/` (untagged → no band, full tree). Verified: new `tests/docs-tabs.spec.ts` (static project) pins BOTH states in one build — ENABLED (band present, active tab reflects the page, left nav scoped to the tab's pages, mobile chip row present) and DISABLED (no band, full unscoped tree); OSS + enterprise fixtures green, and documented in `USAGE.md` ("Section tab navigation"). Takes effect when a consumer sets `params.docTabs` and bumps its extras pin.

### Feature — configurable logo placement (`params.footer.logo`; navbar logo on mobile)

- **New `params.footer.logo` (a `path` plus optional `dark`) renders a logo in the footer, and `navbar-title.html` now shows the navbar logo at every breakpoint when no separate `params.sidebar.logo` is set — so an enterprise site can carry its product lockup in the navbar and move the Solo corporate mark to the footer, rather than the previous Solo-mark-in-navbar arrangement.** `layouts/partials/footer.html` gains an opt-in footer-logo block (`<img class="solo-footer-logo">`, with a `.dark` variant); `layouts/partials/navbar-title.html` derives its light/dark logo visibility classes from whether `sidebar.logo.path` is set (no mobile logo → the navbar logo is also the mobile brand mark). Backward compatible: with no `params.footer.logo` the footer is unchanged, and with a `sidebar.logo` the navbar logo stays desktop-only as before. This pairs with the `docTabs` work above (enterprise now puts the product logo in the navbar so the tab band sits directly above the left nav). Observable in production on the enterprise docs (product lockup in the navbar, Solo corporate mark in the footer) — **exact page/URL to be confirmed by the maintainer before release**. Verified: new footer-logo assertion in `tests/brand.spec.ts` (enterprise footer resolves to the corporate mark; OSS has no footer logo), and the existing navbar-logo assertion updated to expect the enterprise product lockup; OSS + enterprise fixtures green. Takes effect when a consumer bumps its extras pin.

### Fix — `link-hextra` infers the version on localized (language-prefixed) pages

- **A `link-hextra` cross-doc link authored on a non-default-language page (a JA page at `/<product>/ja/<version>/…` or `/ja/<version>/…`) resolved its version to `latest` because the version-inference regex doesn't expect the `/ja/` language segment, so the link could point at the wrong version tree.** `layouts/_shortcodes/link-hextra.html` now strips `.Site.LanguagePrefix` from the permalink before matching the version — a no-op on the default language (empty prefix), so English links are byte-identical. Observable in production on the JA docs (a `link-hextra` link on a versioned JA page) — **exact page to be confirmed by the maintainer**. Verified: OSS + enterprise fixtures green (the fixture is single-language, so this exercises only the default-language no-op path). **Test gap:** the language-prefixed path has no automated coverage yet — the fixture would need a localized (multilingual) build to exercise it. Takes effect when a consumer bumps its extras pin.

### Fix — `warn-missing-description` skips static-HTML pages and honors its opt-out

- **The build-time "missing description" lint (a) warned on raw static-HTML content pages (a `.html` source file, e.g. a standalone Redoc/Swagger viewer that ships its own `<head>`), where a front-matter `description` can't reach a `<meta>` tag anyway, and (b) never actually silenced when a consumer set `warnMissingDescription = false`, because the old `isset . "warnMissingDescription"` guard matched Hugo's lowercased param key case-sensitively and so never fired.** `layouts/partials/utils/warn-missing-description.html` now skips pages whose `.File.Ext` is `html` (generated pages with no source file stay in scope, since they're not static HTML) and reads the opt-out via case-insensitive dot access (`eq .warnMissingDescription false` disables only on an explicit `false`; an unset key stays default-on). Verified: OSS + enterprise fixtures build warning-free. **Test gap:** no dedicated automated test — capturing this would need a static-HTML fixture page plus build-warning assertions (the `hugo-warnings` harness). Takes effect when a consumer bumps its extras pin.

### Fix — version switcher can no longer 404

- **`layouts/_partials/navbar.html`: switching to a version that has neither the current page nor a `not-in-version` page now falls back to that version's landing page (which always exists), instead of building a URL that 404s.** Verified: OSS + enterprise fixtures green (the version dropdown resolves for every fixture version). Observable via the version dropdown on any versioned site — **representative page to be confirmed by the maintainer**. Takes effect when a consumer bumps its extras pin.

### Fix — FlexSearch build no longer fails on a transient CDN error (`_partials/scripts/search.html`)

- **After v0.1.20 capped the FlexSearch `resources.GetRemote` with a `15s` timeout (so a slow/unreachable jsdelivr CDN fails FAST instead of hanging the build), the fast failure still hit the upstream `errorf` and failed the WHOLE build — turning a transient, network-only CI blip we don't control (a throttled CDN or a `read: connection reset by peer`) into a red build.** `search.html` now `warnf`s on the fetch-`.Err` branch and emits a runtime `<script defer src>` pointing at the same pinned CDN URL, so the build stays green and search still works (the browser loads the bundle at page load). This keeps NO vendored copy to go stale: the normal path still fetches the live pinned bundle and self-hosts it with a fingerprint + SRI on every build; only the rare failure path defers to the CDN at runtime (no SRI there, since Hugo never saw the bytes). The one thing that can drift is the version pin (`site.Params.search.flexsearch.version`), which the `check-versions` skill already watches. The other `errorf`s in the file — a missing local asset or a misconfigured non-remote base — are genuine misconfiguration, not transient, and stay fatal by design. Observable in production: view-source on any docs page with search enabled (e.g. [agentgateway docs](https://agentgateway.dev/docs/)) shows the self-hosted `…/js/flexsearch.<fingerprint>.js` with an `integrity=` hash — the normal (build-time-fetch) path; the fallback only appears when the build-time fetch fails, which needs a black-holed network to reproduce. Verified: added a source-scan guard in `tests/build-resilience.spec.ts` that isolates the GetRemote `.Err` branch and asserts it does NOT `errorf`, and DOES `warnf` and emit a `<script src>` fallback at the pinned URL (a companion to the existing timeout-cap scan); OSS + enterprise fixtures green. Takes effect when a consumer bumps its extras pin.

### Test harness — additions and fixes (this cycle)

- **`tests/meta-description.spec.ts` (new, static project)** pins the `page-description.html` markdown-stripping fix documented above: the built `main/everything` fixture page (description carries `**one page**`) emits clean plain text in `<meta name="description">`, `twitter:description`, and the JSON-LD `description`. `og:description` is intentionally excluded — Hextra's `opengraph.html` reads raw `.Description`, which the override does not touch (the same reason a markdown *link* isn't exercised: it would leak raw into og:description and the auto-card, tripping other scans).
- **`heading-shortcode-id` scan now skips YAML/TOML front matter** (`tests/helpers/heading-shortcode-id.ts`, +2 unit tests), so a `#`-comment in front matter that mentions a shortcode isn't mis-flagged as a shortcode-bearing heading. (This refines the `heading-shortcode-id` source scan whose own entry is elsewhere in this v0.1.21 section — both the scan and this refinement shipped in the v0.1.21 cycle.)
- **`auto-cards.spec.ts` tolerates minified (unquoted) attributes**, so it stays correct against a consumer `hugo --minify` build as well as the quoted (non-minified) fixture build; the comment claiming the fixture itself is minified was corrected.
- **`brand.spec.ts` gains a footer-logo assertion** and its enterprise navbar-logo expectation was updated (see the logo-placement entry) — the prior expectation went stale when the fixture moved the Solo mark to the footer.
- **Fixture:** the two shortcode-in-heading test headings in `everything.md` (`MARKER_VERSION_HEADING_HOST`, `COND_HEADING_HOST`) gained an explicit `{#id}` so the `heading-shortcode-id` scan passes on the theme's own fixture — they now demonstrate the recommended convention, and the `shortcode-contexts` `<h4>` assertions still match.

### Test harness — new `heading-shortcode-id` source scan (shortcode in a heading with no `{#id}`)

- **`tests/heading-shortcode-id.spec.ts` (new, in the `content` project) fails the build when a markdown heading contains a Hugo shortcode (`{{< … >}}` or `{{% … %}}`) but no explicit `{#id}` attribute — the source cause of the `hahahugoshortcode…` anchor that `markdown-leaks` catches only later, in the rendered HTML.** Hugo derives a heading's anchor ID from the RAW heading text BEFORE it substitutes shortcode placeholders, so a heading like `## Install {{< reuse "conrefs/snippets/product-names.md" >}}` renders its visible text correctly ("Install Solo Enterprise for kagent") but its anchor ID, TOC link, and inline `<span id>` all become the literal Hugo placeholder — a broken, build-nondeterministic anchor that no in-page or inbound link can target. The overwhelming majority of shortcode-bearing headings in the corpus already append `{#id}`; this scan keeps the few that don't from regressing (and gives authors a source-level failure with a clear fix — "append `{#id}`" — instead of the cryptic `shortcode-placeholder` leak in built HTML). The helper (`tests/helpers/heading-shortcode-id.ts`) blanks HTML comments (preserving line numbers) and skips fenced code blocks so it only flags real ATX headings, matches any `{{<`/`{{%` shortcode (not Go-template `{{ … }}`), and passes a heading that already carries a `{#…}` block. New `headingShortcodeId` toggle (default `true`) in `[checks]` and a `headingShortcodeId` regex allowlist in `[allowlists]` for a genuine exception. Observable in production: the "Solo Enterprise for kgateway" heading on [Solo Enterprise for kgateway — Version support](https://docs.solo.io/kgateway/2.3.x/reference/versions/) has anchor `id="hahahugoshortcode217s3hbhb"` (view-source, or note its "On this page" link points at `#hahahugoshortcode217s3hbhb`), and the same failure shows on [kgateway — Airgap "Step 3: Install …"](https://docs.solo.io/kgateway/2.3.x/install/airgap/) and [kagent — Get started "Install …"](https://docs.solo.io/kagent/latest/quickstart/) — each authored with a `{{< reuse "…/product-names.md" >}}` in the heading and no `{#id}`. Verified: 12 helper unit tests cover the flag/skip cases (angle- and percent-form shortcodes, heading-only shortcode, existing `{#id}`, prose shortcode, Go template, commented-out heading, fenced `#` line, 1-based line numbers); run against real docs content the scan flagged exactly the 41 shortcode headings then fixed by appending `{#id}`, after which a rebuilt kagent/kgateway/istio carried zero `hahahugoshortcode` placeholders. Takes effect when a consumer bumps its extras pin and runs the `content` project (with `scanRoots` configured).

## [v0.1.20] — 2026-07-21

### Build resilience — cap every build-time remote fetch so a slow/unreachable remote can't hang the build

- **`github-table.html`, `github.html`, `openapi.html`, `_partials/scripts/mermaid.html`, and `_partials/scripts/search.html` now call `resources.GetRemote` with a `(dict "timeout" "15s")` cap and a `try` wrapper, degrading to a warning + fallback (or, for search, a clear `errorf`) instead of blocking the build indefinitely.** These five shortcodes/partials fetch remote content at build time (a markdown section, a raw file, an OpenAPI spec + the unpkg Swagger UI assets, the mermaid CDN bundle, and the FlexSearch bundle from the jsdelivr CDN), and none of them capped the request. On a cold CI build — the docs hub caches only npm, so its Hugo `getresource` cache starts empty every run — an unreachable or throttled remote made each `GetRemote` block for Hugo's ~30s default per attempt, and across the ~20 distinct URLs a docs build fetches (cel.md, mermaid, three Swagger assets, ~14 example YAMLs, …) with retries, that compounded into a ~20-minute silent stall until CI cancelled the job. The tell was that `agentgateway.dev` (which builds the same OSS content but does NOT render the enterprise reference pages through this theme) never hung, while the assembled hub build did — so the hang was theme-side, not in the OSS shortcodes. The canonical trigger is the "cel.md GetRemote stall": `github-table.html` fetching `schema/cel.md` from `raw.githubusercontent.com` for the CEL reference table. Each fix uses the same pattern — `try (resources.GetRemote $url (dict "timeout" "15s"))`, required because Hugo v0.141 removed `resource.Err` (a network error/timeout now surfaces via the `try` wrapper's `.Err`, a dead/404 URL via a nil `.Value`) — and on failure logs a `warnf` naming the URL: `github-table`/`github` render a link-checker-visible `<a href>` fallback, `openapi` falls back to loading the Swagger assets straight from the CDN (client-side, no SRI) and keeps its client-side spec load, `mermaid` (which already had `try`) just gains the timeout, and `search.html` — a new shadow of Hextra core's `_partials/scripts/search.html` whose only change from upstream is the timeout dict — keeps upstream's `errorf` so an unreachable FlexSearch CDN fails fast at 15s with a clear message instead of hanging. A transient *transport error/timeout* (the `try` wrapper's `.Err`) is treated as recoverable — the build stays green, the docs-hub `hugo-warnings` framework test escalates a *persistent* warning to a CI failure, and the link checker reports a genuinely dead URL. A definitively *dead/404 URL* (a nil `.Value` with no `.Err`) is instead treated as a real reference bug: both `github` and `github-table` now fail loudly with `errorf` (alongside `github-table`'s existing wrong-`section=` error) rather than warning and emitting the link-checker fallback — a broken remote reference should block the build, not ship a broken page. Observable in production on [Solo Enterprise for agentgateway — CEL reference](https://docs.solo.io/agentgateway/latest/reference/cel/), whose function/variable tables are inlined by `github-table` from the remote `schema/cel.md` — the exact fetch that stalled cold CI builds. Verified locally by reproducing the hang: with a black-holed HTTP proxy and a cleared `getresource` cache, the assembled agentgateway build stalled on these fetches (naming `github-table.html`/`schema/cel.md` and Hextra's FlexSearch CDN fetch in the error trace); with the caps, each fetch fails fast at 15s with a `warnf` instead. The OSS + enterprise fixtures build warning-free (`build exit=0`). The cap is now pinned by `tests/build-resilience.spec.ts` (new, `static` project): a source scan of the theme's own `layouts/` asserts every `resources.GetRemote` passes a `timeout` (all 8 current call sites), so a future edit that adds an uncapped fetch or drops an existing cap fails there instead of in a cold consumer CI build — verified non-vacuous by dropping a timeout and watching the scan go red. **Remaining infra follow-up:** a `getresource` cache in the docs-hub CI so these remotes are fetched once and reused across runs — the caps make a cold build fail fast, but a warm cache avoids the fetch (and the failure risk) entirely. (Hextra core's FlexSearch fetch, previously listed here as uncapped, is now covered by the `search.html` shadow described above — it needed the partial override this release adds.) Takes effect when a consumer bumps its extras pin.

### Shortcode — `rebase` fails with an actionable message, not a nil-pointer crash, when the rebased resource is missing

- **`layouts/_shortcodes/rebase.html` now reads the rebased resource's `.Content` through a `with $doc` guard, so a missing `file=` target fails with the existing actionable `errorf` alone instead of *also* throwing a confusing `nil pointer evaluating resource.Resource.Content`.** The shortcode already called `errorf "rebase: resource not found: …"` when the resource didn't resolve, but control still fell through to an unconditional `{{ $content := $doc.Content }}`, and Hugo evaluated `.Content` on a `false` `$doc` — surfacing a nil-pointer error that masked the real message (a wrong path, or an incomplete `make server PRODUCT=<product>` assembly). Moving the content read inside `{{ with $doc }} … {{ else }} errorf {{ end }}` keeps the exact same fail-the-build behavior but leaves only the message that tells a build author what to fix. This is the missing-resource failure path of the same rebase pipeline that renders the enterprise reference and versioned content in production — for example [Solo Enterprise for kgateway — Templating language](https://docs.solo.io/kgateway/2.3.x/traffic-management/transformations/simple/templating-language/) renders because its rebased `file=` resolved; this change only alters what happens when one does not. Verified: the OSS + enterprise fixture builds stay green (every rebased `file=` resolves), and `tests/build-resilience.spec.ts` guards the invariant with a source scan asserting `rebase.html` carries no unguarded `$doc.Content` deref (the pre-fix crash form), so a regression that reintroduces it fails the scan. Takes effect when a consumer bumps its extras pin.

### Shortcodes — `version` wrapping MULTIPLE table rows now re-flows into the table

- **`layouts/_shortcodes/rebase.html` and `layouts/_shortcodes/reuse.html` now widen the table-row exception to match a *run* of pipe rows, not just a single line, so a `version` block that wraps more than one row re-enters the markdown stream as percent-form and its rows merge into the parent table.** Both files bulk-normalize authored shortcodes and then convert specific cases back to percent-form because percent output re-flows through Goldmark (angle output is spliced in as opaque HTML *after* the table is parsed, so gated rows fall out of the table and vanish). The table-row exception that does this only matched single-line content (`\|[^\n]*?\|`), so a block whose opener is glued to the end of the preceding row and whose closer is glued to the end of the *last* of several gated rows — the `get_cookie` / `get_cookie_i` shape authors used in kgateway `templating-language.md` — never matched, stayed angle-form, and its rows silently dropped. A *single* gated row on its own line already worked (the leading `\s*` absorbs one newline), which is why `replace_with_string` rendered but the two `get_cookie` rows did not. The content group is now `(?:\s*\|[^\n]*\|)+\s*`: every matched line must still be a full `|...|` row, so it stays narrow enough not to trip the indented-list or fence-adjacent cases that rely on staying in angle-form. The bug is observable on [Solo Enterprise for kgateway — Templating language](https://docs.solo.io/kgateway/2.3.x/traffic-management/transformations/simple/templating-language/): the "Custom transformation functions" table lists `env`, `replace_with_random`, `replace_with_string`, etc. but is missing the `get_cookie` and `get_cookie_i` rows the OSS source gates with `{{% version include-if="2.4.x" %}}`. Verified on the OSS fixture build with a new multi-row block in `everything.md` and matching tests in `tests/version-table-row.spec.ts` (both gated rows render as real `<tr>` with two `<td>` cells, share the table with the baseline row, and leak no literal pipes) — green on both the reuse path (`v2/everything`) and the rebase path (`v2/rebased`), with the structural-parity spec (`versioning.spec.ts`) still matching everything-vs-rebased. Takes effect when a consumer bumps its extras pin (or, for repos on a local `replace`, immediately).

### Shortcode — `reuse-image-light` now preserves its source form in the translation snapshot (JA image-path doubling)

- **`layouts/_shortcodes/reuse-image-light.html` now carries the `hugo.Environment == "translation"` export-mode guard that `reuse-image` and `reuse-image-dark` already had — so the JA translation sync keeps the `{{< reuse-image-light … >}}` shortcode instead of baking a resolved `<img>` whose absolute `src` then doubles on the next build.** `reuse-image-light` was the one member of the family missing the guard. In translation mode it fell through to the normal render path and emitted `<img src="{{ .RelPermalink }}">`, i.e. an absolute `/agentgateway/img/route-delegation-basic.svg`. The translation pipeline's HTMLToMarkdown step then wrote that into the JA markdown as `![](/agentgateway/img/route-delegation-basic.svg)`, and on the next JA build Hextra's `_markup/render-image.html` treats a leading-slash static path as site-root-relative and runs it through `relURL`, prepending the site's `/agentgateway` baseURL path **again** → `/agentgateway/agentgateway/img/route-delegation-basic.svg`, a 404. The tell was structural: on the JA route-delegation pages the *light* image had degraded to a raw markdown link while the *dark* half was still a `{{< reuse-image-dark >}}` shortcode (that one kept its guard). The fix mirrors the existing two shortcodes exactly — register a `XTRANSPH<n>X` placeholder that restores to `{{< reuse-image-light src=… >}}` after HTMLToMarkdown — so future syncs never bake the path. Observable in production on the JA page [ルート委任 — 基本](https://docs.solo.io/agentgateway/ja/latest/traffic-management/route-delegation/basic/): its diagram `<img src="/agentgateway/agentgateway/img/route-delegation-basic.svg">` 404s (view-source, or note the broken-image icon), while the English [Route delegation — Basic](https://docs.solo.io/agentgateway/latest/traffic-management/route-delegation/basic/) renders correctly because its source still uses the shortcode. Verified locally: the OSS fixture build's `reuse-image-light` rendering is byte-identical (the non-translation branch is unchanged — `tests/versioned-image-auto.spec.ts` stays green), and on a local agentgateway-enterprise build the new `missing-images` scan dropped from 86 → 81 offenders once the five baked JA route-delegation refs were restored to the shortcode (the remaining 81 are an unrelated upstream provider-icon-path issue). NOTE: this stops FUTURE recurrence; JA pages already corrupted by an earlier sync need their baked `![](/agentgateway/img/…)` lines restored to `{{< reuse-image-light src="img/…" >}}` (a content fix in the docs repo) or a re-sync. Takes effect when a consumer bumps its extras pin and re-runs the translation sync.

### Shortcodes — `link-hextra` routes `reference/api` anchors to enterprise subpages on every enterprise version

- **`layouts/_shortcodes/link-hextra.html` now re-routes a `reference/api` cross-doc link to the enterprise reference *subpages* on any enterprise build (via a new `.Site.Params.currentProduct == "kgateway"` signal), not just the `2.1.x` special-case it was hard-coded to; and `layouts/_shortcodes/rebase.html` sets `$product = "envoy"` for every `kgateway/envoy` source dir instead of only `envoy/latest` / `envoy/main`.** The OSS site serves the API reference as a single `/reference/api/` page, so its `#anchor` links are correct as authored; the enterprise site splits the same reference into subpages (`kgateway`, `solo`, `portal`, `waf`), so a shared source link to `/reference/api/#SomeType` must be rewritten to the right subpage on the enterprise build or it lands on a page where the anchor doesn't exist. The previous logic only rewrote when `$ver == "2.1.x"`, so enterprise versions built from a `kgateway/envoy/2.2.x` rebase (e.g. enterprise `2.3.x`) kept the bare `/reference/api/#…` link and broke. Two independent signals now mark an enterprise build so both link paths are covered: `$product == "envoy"`, injected by `rebase.html` on rebased pages (now matched for *all* `kgateway/envoy` version dirs, since enterprise `2.1.x` rebases `envoy/2.2.x` and needs the same routing), and `currentProduct == "kgateway"` from the enterprise kgateway site config, which covers reuse-based pages that get no rebase-injected product. The OSS `kgateway.dev` config sets neither, so OSS anchors stay untouched. Links that already target a subpage (`reference/api/kgateway|solo|portal|waf|api|kubernetes`) are left alone so re-routing can't double up the path, and the version gate is dropped entirely (the routing now applies on every enterprise version). The `agentgateway` branch stays product-only. Observable in production: enterprise reference links resolve to subpages such as [Solo Enterprise for kgateway — API reference (kgateway)](https://docs.solo.io/kgateway/latest/reference/api/kgateway/), whereas OSS [kgateway.dev — API reference](https://kgateway.dev/docs/reference/api/) is the single-page form the OSS anchors point at unchanged. Verified on a local enterprise (`hugo-enterprise.toml`) fixture build and consumer replace-build: `reference/api/#…` links on rebased and reuse-based enterprise pages resolve to the `kgateway` subpage, already-subpaged links are untouched, and the OSS fixture build leaves `reference/api` anchors byte-identical. Covered by `tests/link-hextra-apiref.spec.ts` (new, `static` project), which pins all four cases on the reuse fixture page: an OSS anchor left untouched, `product=envoy` routed to the `kgateway` subpage, `product=agentgateway` routed to the `api` subpage, and an already-subpaged link not doubled up. (The `currentProduct == "kgateway"` signal reaches the same replace but can't be forced per-call — the fixture's `currentProduct` is the site-global `test` — so the markers force each branch via the `product` param; on the rebase path the pipeline overrides the author-supplied product, so the markers carry routing signal only on the reuse page.) Takes effect when a consumer bumps its extras pin.

### Test harness — new `missing-images` content scan (broken `<img>`/`<source>` references)

- **`tests/missing-images.spec.ts` (new, in the `content` project) fails the build when an image reference in the rendered HTML resolves to a same-origin file the build never published — the reader's broken-image icon, and a 404 the link checker would flag later.** The theme resolves image sources through several indirections the author never sees at write time: `reuse-image`/`reuse-image-dark`, the auto version-resolved-image splice (`img/foo.svg` → `img/<version>/foo.svg` when an override exists), and cards' `image=`. A typo, or a per-version override that exists for `main` but was never added for a frozen release, silently falls through to a path that isn't on disk — invisible until someone loads the page or a link checker runs (and not every consumer runs one, or runs it as often as these fast file-read scans). The scan reads every built HTML page under `target.builtScanRoot`, pulls each local `<img src>` and every candidate URL in a `srcset` on `<img>`/`<source>` (the light/dark `<picture>` variants the theme emits), resolves absolute refs against `builtRoot` and relative refs against the page's own directory (query string/fragment stripped, percent-encoding decoded), and reports any that aren't on disk — grouped by src with a page count so one missing shared asset reports once, not N times. Remote (`http:`/`https:`/protocol-relative `//`), inline (`data:`), and in-page (`#…`) references are skipped; `<script>` (the copy-as-markdown source embed), `<style>`, and HTML comments are blanked first so a commented-out or embedded `<img>` can't false-positive. New `missingImages` toggle (default `true`) in `[checks]`, and a `missingImages` regex allowlist in `[allowlists]` for a reference a downstream build injects. The mechanism it guards is observable in production on [Solo Enterprise for kgateway — Architecture](https://docs.solo.io/kgateway/latest/about/architecture/), whose body renders light/dark diagram pairs (`/kgateway/img/gw-control-plane-components.svg` + `…-dark.svg`, `/kgateway/img/translation-loop.svg` + `…-dark.svg`) through exactly this reuse-image path — a missing per-version override there is the failure this scan now catches at the `<img>`. Verified on the OSS and enterprise fixture builds: the scan passes clean across all built pages (it exercises real refs — the fixture's `/test/img/test/light.svg`, logo SVGs, and the auto-versioned `autover.svg` overrides all resolve), the 11 helper unit tests cover extraction/resolution/allowlist with an injected filesystem, and a throwaway page with a bogus absolute and a bogus relative `<img>` was correctly flagged with both srcs and their tags as context, then removed. Takes effect when a consumer bumps its extras pin and runs the `content` project.

### Layout — TOC rail reserves its width even on heading-less pages

- **`layouts/_partials/toc.html` now always renders the right-hand TOC rail when `toc` is enabled — an empty, width-reserving rail on pages with too few headings to list — so the main content column stays the same width across sibling pages.** The rail (`hx:w-64`) previously rendered only when a page had ≥ 2 in-page headings; on a page whose entire body is a single generated table with no `##` headings (e.g. a Helm values reference), the rail dropped out and the flex layout let the content expand into the freed column. Sibling reference pages that *do* have headings (Supported versions, with Support matrix / Compatibility matrix / …) kept the rail and stayed narrower, so navigating between them visibly jumped the content width. The fix renders the `<nav>` container whenever `toc` is enabled but only fills it (heading list, "On this page" label, back-to-top footer) when there are enough headings; otherwise it's an empty reserved gutter marked `aria-hidden` so screen readers don't announce an empty navigation landmark. `toc: false` in front matter still removes the rail entirely. This surfaced while investigating a width difference between [agentregistry — Supported versions](https://docs.solo.io/agentregistry/latest/reference/versions/) (has headings, rail present) and [agentregistry — Helm](https://docs.solo.io/agentregistry/latest/reference/helm/) (heading-less table, rail previously dropped). Verified on a local OSS fixture build: 9 pages render a populated rail and 18 heading-less pages now render an empty `hx:w-64` rail (`aria-hidden="true"`) instead of no rail, keeping the content column width constant. **Tradeoff:** heading-less pages now carry an empty right gutter rather than using that space; this is the intended cost of consistent content width. Takes effect when a consumer bumps its extras pin.

### CSS — restrict the table column-width cap to wide reference tables only

- **The `max-width: 24rem` cell cap added in v0.1.18 now applies only to tables whose header has 3+ columns (`_markup/render-table.html` flags them with a `table-capped` class); 2-column tables render uncapped.** The v0.1.18 cap was applied to *every* cell to stop a long dotted key or a 600-char JSON default from crowding out the Description column in generated Helm/CRD tables. But a per-cell ceiling also bounds the whole table: a 2-column table can reach at most ~48rem (2 × cap), and a legitimately long text column folds at 24rem. On a wide viewport that left small tables sitting narrow with dead space to the right and wrapping text earlier than needed — visible on the [Istio metrics reference](https://docs.solo.io/istio/1.31.x/ui/observability/metrics/#default-metrics-in-the-pipeline), a 2-column Metric/Description table that looked cramped and under-width. The offenders the cap was written for are always multi-column generated tables (`Key | Type | Default | Description`), so the fix gates on header column count rather than viewport (pure CSS can't test overflow state): `render-table.html` counts `.THead` cells and adds `table-capped` only at 3+ columns, and the `max-width` rule moved behind `.table-wrapper.table-capped th/td`. `overflow-wrap: anywhere` stays global — harmless on uncapped tables, and it still keeps a lone long URL from forcing horizontal scroll. Verified on a local OSS fixture build (`hugo-oss.toml`): across the built pages, all 50 two-column tables render `class="table-wrapper"` (uncapped) and all 12 three-column tables render `class="table-wrapper table-capped"`, zero mismatches. The wide reference tables the cap targets are unchanged — still capped and wrapping, e.g. [Solo Enterprise for agentregistry — Helm](https://docs.solo.io/agentregistry/latest/reference/helm/) (4 columns). **Threshold caveat:** a genuine 3-column *narrative* table is now capped too; bump the gate to 4 if that surfaces. Takes effect when a consumer bumps its extras pin.

### New `table` shortcode — author-selectable column display

- **New `layouts/_shortcodes/table.html` lets an author wrap a markdown table and choose how its columns size, overriding the default column-count cap when it doesn't suit a specific table.** The column-count heuristic above is a good global default, but it can't know intent: a wide 2-column table might want to fill the page and wrap, while a 5-column command reference reads better sized-to-content with a horizontal scroll than wrapped. The shortcode wraps the rendered table in `.solo-table--<mode>` and supports three modes: `wrap` (default) fills the body width and wraps content, never scrolling — best for prose/description tables; `nowrap` sizes each column to its content and never wraps, letting the wrapper scroll horizontally when the table exceeds the body — best for code/command tables; `equal` divides the columns evenly (`table-layout:fixed`). Two implementation notes that cost real debugging: (1) `nowrap` uses `width: max-content` on the table, not `width:auto` — `auto` shrink-to-fit is capped at the available width, so a nowrap table clamps to the body and its content overflows the cells instead of scrolling; `max-content` lets the table grow past the wrapper so `overflow-x:auto` engages. (2) `equal` can't rely on `table-layout:fixed` alone — Chrome content-sizes the leading columns and dumps the remainder in the last, so the shortcode counts header columns and exposes them as `--solo-table-cols`, and the CSS gives each cell `width: calc(100% / var(--solo-table-cols))`. Rendered through `.Page.RenderString` so both `{{%/* table */%}}` and `{{</* table */>}}` call forms produce identical HTML (the rebase pipeline rewrites percent-form to angle-bracket form). An unknown `mode` emits a Hugo `WARN` and falls back to `wrap`. This is additive with no production page yet; it's the author-facing counterpart to the automatic cap fix above (motivated by the same [Istio metrics](https://docs.solo.io/istio/1.31.x/ui/observability/metrics/#default-metrics-in-the-pipeline) / [agentregistry Helm](https://docs.solo.io/agentregistry/latest/reference/helm/) tables). Verified on OSS and enterprise fixture builds via `tests/table-display.spec.ts` (registered in the `browser` project), which asserts the computed layout of each mode: `wrap` fills the body width with uncapped wrapping cells and no scroll, `nowrap` cells stay `white-space:nowrap` and the wrapper scrolls when the table overflows, and `equal` renders `table-layout:fixed` with evenly divided columns. Available to every consumer on the next pin bump.

### New theme-shipped `[!SUCCESS]` GitHub-style alert type

- **`layouts/_partials/components/github-style-alert.html` now ships a `success` custom alert type, and `layouts/_markup/render-blockquote-alert.html` adds it to the supported list — so `> [!SUCCESS]` renders a green box with a check icon instead of warning and falling back to the default style.** GitHub markdown has only five native alert types (note/tip/important/warning/caution), but the theme's `callout` shortcode has always carried a green `success` context. As repos migrate `alert`/`callout` shortcodes to GitHub-default `> [!TYPE]` syntax, `success` notes had no target — the closest native type is `tip`, which loses the success semantic. `[!SUCCESS]` closes that gap the same way the existing `[!SOLO]` type does: a theme-shipped entry with an icon (`check-circle`, resolved from the transitively-mounted Hextra `data/icons.yaml`), a "Success" header, and the green palette reused verbatim from `tip`/`solo` (this theme only compiles the `hx:` color utilities Hextra core already uses, so a novel palette such as emerald would silently no-op). For copy-as-markdown / `.md` export it carries `copyAs: tip`, so a copied `> [!SUCCESS]` round-trips to `> [!TIP]` (GitHub would render a bare `[!SUCCESS]` as an inert blockquote). The rendering mechanism is identical to the already-in-production `[!SOLO]` type, observable on [ambientmesh.io](https://ambientmesh.io/) (view-source: a `<div data-alert-type="SOLO" …>` with the green `hx:bg-green-100` classes); `[!SUCCESS]` produces the same structure with `data-alert-type="SUCCESS"` and the check-circle SVG. Verified in the OSS and enterprise fixture builds (both warning-free) via `tests/custom-alert.spec.ts`, which now asserts the SUCCESS label, the check-circle SVG path, the green style, and that copy-md downgrades `[!SUCCESS]` to a native type without leaking the theme-only marker. No consumer config required; takes effect when a consumer bumps its extras pin.

---

## [v0.1.19] — 2026-07-16

### SEO improvements — JSON-LD + Twitter cards (fill Hextra's empty stubs), missing-description lint, non-latest-version noindex

- **`layouts/_partials/schema.html` now emits schema.org JSON-LD, overriding Hextra's zero-byte `schema.html` placeholder so structured data is finally produced on every page.** Hextra's `_partials/head.html` calls `{{ partial "schema.html" . }}`, but the partial it ships is an empty file in every version we pin (0.9.7, 0.12.2, 0.12.3), so no structured data was ever emitted — Google saw only the raw `<title>`/`<meta description>`. The override emits a single `@graph`: on the home page a `WebSite` + `Organization` node; on every other page a `TechArticle` (headline, description, `datePublished`/`dateModified` when present, publisher `Organization`) plus a `BreadcrumbList` that mirrors `_partials/breadcrumb.html` (Home → each non-home ancestor → current page). URLs are made absolute with `utils/prod-host.html` (same helper llms.txt uses) so they survive preview builds whose `baseURL` is root-relative. No `SearchAction` is emitted because Hextra search is client-side (FlexSearch) with no query-param results URL to point at. The `Organization` logo resolves from `params.navbar.logo` (docs hub) or `params.themeExtras.logo` (OSS sites); the publisher name defaults to `site.Title` and is overridable via `params.themeExtras.schemaOrgName`. Verified on a local `hugo-oss.toml` fixture build (home emits valid `WebSite`+`Organization`, a content page emits `TechArticle`+`BreadcrumbList`, both parse as JSON, dates correctly omitted when the fixture page has none) and on real docs-hub builds (gloo-mesh-enterprise 2345 pages, kgateway 735): every content page's `TechArticle`+`BreadcrumbList` parses, uses absolute `https://docs.solo.io/...` URLs, and reproduces the breadcrumb hierarchy. (On the docs hub the `WebSite`+`Organization` home node does not render because each product root is a version-redirect stub, not a content home; it renders on single-home OSS sites.) After release this is inspectable in view-source or Google's [Rich Results Test](https://search.google.com/test/rich-results) on any page of, e.g., [agentgateway.dev](https://agentgateway.dev/) and [kgateway.dev](https://kgateway.dev/). Applies to every consumer of the theme.

- **`layouts/_partials/twitter_cards.html` now emits `twitter:card`/`title`/`description`/`image`, overriding Hextra's other empty stub.** Same story: Hextra's `head.html` calls `{{ partial "twitter_cards.html" . }}` and ships an empty file, so no Twitter/X card metadata was produced. X and most platforms fall back to OpenGraph (which Hextra does emit), so this is mostly belt-and-suspenders, but declaring `summary_large_image` explicitly opts into the large-image card rather than letting the crawler infer it. Image resolution mirrors Hextra's `opengraph.html` (page `images` first, then site `images`) so the card and the OG preview stay in sync; `twitter:site` is emitted only when `params.themeExtras.twitterSite` is set. Verified in the fixture build and on the real docs-hub builds above: every page carries `twitter:card=summary_large_image` with the per-product absolute `twitter:image` (e.g. `https://docs.solo.io/gloo-mesh-enterprise/ogimage-gloo-mesh-enterprise.png`), matching the OG image. Applies to every consumer of the theme.

- **New build-time SEO lint (`utils/warn-missing-description.html`, wired from `themeExtras/head-end.html`) warns when an indexable content page has no front-matter `description`.** Hextra's `utils/page-description.html` silently falls back to the raw page Summary (first ~70 words of body, markdown stripped) when `description` is absent, so `<meta name=description>`, OpenGraph, Twitter, and the JSON-LD above all get a poor, truncated snippet with no visible signal that it happened. The lint emits a non-fatal Hugo `WARN` (the build still succeeds — it does not fail CI) naming the page's URL. Scope is deliberately narrow to limit noise: only leaf pages (`.IsPage`), skipping home, section indexes, taxonomy/term pages, the 404, and `noindex` pages. **Enabled by default on every consumer** (opt out with `params.themeExtras.warnMissingDescription = false`). **Scoped to the dev version only:** on a versioned site it lints only pages in `main` (`linkVersion: "main"`) — the authoring source, where a description added now flows into the next release, and where scoping avoids warning the same page twice (once in `main`, once in `latest`). Everything else is skipped: frozen old versions (`1.0.x`, `2.1.x`, …), the current release (`latest`), and unversioned pages (blog, marketing). Version lists come from both `params.versions` (top level) and `params.sections.<s>.versions` (agw keeps them per section); a site with no version config is linted in full, and a versioned site with no `main` version falls back to linting everything rather than going silent. Consumers ship the shared `hugo-warnings.spec.ts` framework test, which fails CI on any non-allowlisted build `WARN`, and this lint is deliberately **not** allowlisted — so a consumer's framework test stays red until every `main` page has a `description` (the intentional forcing function). Verified: agentgateway-oss dropped from 229 raw warnings to **0** (its `main` is fully described; the 229 were all frozen versions + blog), and kgateway-oss from 199 to **1** (a single undescribed source page, surfaced once in `main`). The theme's OSS + enterprise fixtures build warning-free, so `hugo-warnings.spec.ts` passes.

- **New `utils/version-noindex.html` (wired from `themeExtras/head-end.html`) marks *duplicate* old-version pages `noindex, follow` so old versions stop competing with the current one in search — while pages that exist ONLY in an old version stay indexable.** For versioned docs, an old version's copy of a page that still exists in the current version is near-duplicate content for the same query; without this, ranking signal is split and Google often surfaces an *old* version. This is surgical, not blanket: a non-latest page is noindexed **only when the same page exists in the current version**. The page's URL is rebuilt with the current version swapped in — preserving any path segments *before* the version (e.g. `/docs/envoy/2.2.x/install/` → `/docs/envoy/latest/install/`) — and that page is looked up with `site.GetPage`; if it resolves, the old page is a duplicate. A page with no current-version equivalent — a feature removed in the latest release — has no duplicate and is left indexable, so removed-feature docs remain findable in search (that was the whole point of not doing a blanket per-version noindex). Note this also suppresses duplicates in a *newer-than-latest* dev version (e.g. kgw-oss `main`/`2.4.x`): its pages that already exist in latest are noindexed too, while dev-only new-feature pages stay indexable — desirable, since unreleased docs shouldn't outrank the current release. **Opt-in and fail-safe:** the current version is identified by either of two signals — an explicit `latest = true` on its `params.versions` entry, or a `linkVersion = "latest"` segment (kgw-oss and agw-oss already serve the current version at `/…/latest/`, so that URL segment is the signal and no extra field is needed). Detection is deliberately limited to these two unambiguous markers rather than inferred from a `"(latest)"`/`"(current)"` dropdown label — those are not uniform across repos (the docs hub even carries a stale `"(latest)"` label on an OLD entry), so guessing would risk noindexing the wrong version and deindexing live docs. A repo whose current version is a bare number and is not served at `/latest/` (e.g. the docs hub) uses the explicit `latest = true` flag. Matching neither signal emits nothing — worst case is the pre-existing everything-indexable behavior. **Caveat — two robots tags:** Hextra's `head.html` has already emitted its own `index, follow` before `head-end.html` runs, and the theme does not shadow `head.html`, so on a duplicate this emits an *additional* `<meta name="robots" content="noindex, follow">`. Per Google/Bing the most restrictive directive wins, so noindex takes effect, but a validator will note the duplicate; a consumer preferring a single clean canonical-to-current tag can instead set `.Params.canonical` via a config `cascade` on its old version paths and leave `latest` unset (a second `rel=canonical` from here is not viable — Hextra already emitted a self-canonical, and conflicting canonicals make engines ignore both). Version-segment detection **scans** the URL for the first segment matching a known `linkVersion`/`version` rather than assuming a fixed position: consumers differ in how many segments precede the version (`/<version>/…` on the docs hub, `/docs/envoy/<version>/…` on kgw-oss) and not all set `params.folder`, so a positional skip silently fails (it did — an earlier positional version emitted nothing on kgw-oss). Verified on a real kgateway-oss build (current version `2.3.x`, detected via its `linkVersion: "latest"`, no flag): `latest` pages 0/224 noindexed, `2.2.x` 200/209, `2.1.x` 180/202 (the remainders are old-only pages, correctly left `index, follow`), `main` 214/231; the latest-equivalent lookup requires the full path prefix (`/docs/envoy/latest/install`) — the prefixless form (`/latest/install`) resolved nothing. First consumer wired: kgateway-oss (`2.3.x`); takes effect when kgw-oss bumps its extras pin.

---

## [v0.1.18] — 2026-07-15

### Layout — main nav links now appear in the mobile menu

- **The mobile navbar dropdown (`#mobile-icons-menu`) now renders plain `menu.main` links (Docs, Blog, …), which were previously dropped on mobile — leaving the site's top navigation unreachable below `md`.** The desktop navbar loop renders every menu entry: `theme-toggle`, `language-switch`, icon items, and a final `else` for a plain link (via `navbar-link.html`). The mobile loop only had branches for `theme-toggle` and icon items, so a plain link (no `type`, no `icon`) matched nothing and rendered as empty. On a docs page the left hamburger opens the docs sidebar and the right dropdown held only search, so the main menu links appeared **nowhere** on mobile. Fix: stop skipping `type:link` in the mobile loop and add the missing `else` branch that renders a plain/`link` entry as a drawer item (mirroring the desktop fallback). Verified on a local mobile build of [Ambient Mesh docs](https://ambientmesh.io/docs/), whose `menu.main` is all typeless links: the dropdown now lists Search + Docs, Labs, FAQ, Enterprise, Get Support, Blog. Affects every consumer using the theme navbar with plain `menu.main` links.

- **That same mobile fallback branch now emits an anchor only when the entry resolves to a URL, so a `menu.main` entry with neither `type`/`icon` nor `URL`/`PageRef` (a separator or a future custom type) no longer renders `<a href="">` — a clickable drawer row pointing at the current page.** The desktop loop routes such entries through `navbar-link.html`, which guards the empty case; the mobile reimplementation added above did not, so the branch is now wrapped in `{{ if $itemLink }}`. No current consumer uses a separator-type `menu.main` entry, so this is defensive parity with the desktop path rather than a fix for an observed break.

### CSS — cap table column width so one cell can't crowd out the others

- **Table cells now carry a `max-width` cap plus `overflow-wrap: anywhere`, so no single column can grow wide enough to push the others off-screen; over-long content wraps at the cap instead.** Content tables are `width:100%; table-layout:auto` (the wrapper comes from `_markup/render-table.html`), so column widths follow each column's intrinsic content size. A generated reference table (Helm values, CRD fields) has two offenders: long dotted keys the browser can't break (`audit.collector.containerSecurityContext.allowPrivilegeEscalation` — a `.` is not a break opportunity) and giant inline defaults (a ~600-char JSON blob in one Default cell). The auto layout grew those columns to fit, which on the agentregistry Helm page pushed the Description column clean off the right edge. The fix is two rules on every cell, with **no per-column or header-name targeting**: `max-width: 24rem` bounds how wide any column may grow, and `overflow-wrap: anywhere` (not `break-word`, which does not fold into the table algorithm's intrinsic-width calculation) lets an unbreakable token wrap at that cap rather than overflow it. The cap is a ceiling, not a width — narrow columns and short-content tables are unchanged; it only bites a column that would otherwise blow past it. Verified on a local build of [Solo Enterprise for agentregistry — Helm](https://docs.solo.io/agentregistry/latest/reference/helm/): the Default column now caps at 24rem and wraps its JSON, and all four columns (Key, Type, Default, Description) fit with no horizontal scroll. Applies to every content table via `.table-wrapper`.

### Layout — Hextra main.js null-deref guard, injected only when the toggle markup is missing

- **`assets/js/docs-init.js` now injects a hidden hamburger/sidebar stand-in for Hextra's `core/menu.js`, but only when the real element is absent — so a page keeps exactly one, never a duplicate.** `menu.js` wires the mobile hamburger with no null guard: `querySelector('.hextra-hamburger-menu')` then `menu.querySelector('svg')` / `menu.addEventListener(...)`, and likewise `.hextra-sidebar-container`. On a consumer whose navbar omits that markup, or any page rendered without the navbar/sidebar (a bare landing), those are absent and `menu.js` throws "Cannot read properties of null" on load. The guard runs immediately (deliberately **not** inside `DOMContentLoaded`) as a deferred `<head>` script, so it executes after the DOM is parsed and before Hextra's deferred `main.js` — the stand-in exists by the time `menu.js` queries it. Because it injects **only when the real element is missing**, a page that already renders the genuine navbar hamburger keeps that one and gets no second element; a page that lacks it gets exactly one injected. The hamburger stand-in wraps an `<svg>` (`isMenuOpen()` reads `menu.querySelector('svg')`); both the old unprefixed and current hextra-prefixed class names are set so a Hextra rename can't silently re-break the query.

- **Why injection rather than a rendered stand-in:** the theme navbar already renders a real `.hextra-hamburger-menu`, so a stand-in emitted unconditionally in a shared partial double-renders on every consumer that uses the theme navbar. Verified in a browser both ways: on the bundled fixture (navbar renders the real hamburger) the count stays at one after load with no duplicate and no null-deref; on a custom-navbar consumer whose navbar omits the toggle, the built HTML has zero and `docs-init.js` injects exactly one at load, again with no null-deref.

### Layout — navbar version dropdown hidden on versionless pages

- **The navbar version dropdown no longer renders on a page whose version-position URL segment isn't a known version, so it can't emit broken version-swap links.** `layouts/_partials/navbar.html` builds each dropdown entry's href by swapping the version segment while keeping the rest of the path (`/<folder>/<version>/<pathAfterVersion>`). On a versionless page — one that lives outside the version tree, e.g. a flat guide at `/<folder>/<section>/<page>/` — it wrongly treated the section segment as the version slot and produced swaps like `/test/v1/alpha/`, `/test/v2/alpha/`, `/test/main/alpha/` for pages that exist only under `/flatguide/`. The sidebar already suppresses its version switcher on these pages (`sidebar.html`'s `$isVersionedDocs` branch); the navbar hadn't been updated to match. Fix: compute `$matchedVersion` while scanning `site.Params.versions` and treat the page as versionless when the segment is present but matches neither a configured version nor a version-like marker (`2.1.x` / `main` / `latest` / …); gate the dropdown on `not $isVersionless`. Product landings (empty segment, e.g. `/<folder>/`) and versioned pages are unchanged — verified against the docs-hub products, all of which keep content under a version segment (`agentregistry` content, for instance, lives under `/agentregistry/latest/…`), so there is **no production incidence**; the bug was surfaced only by the docs framework-test link checker on the bundled fixture's `flatguide` pages. New regression guard in `tests/sidebar-flat.spec.ts` asserts the dropdown is absent and no `/test/<version>/alpha/` swap link is emitted on the versionless page.

- **The version-like-marker test now also matches a pre-release or build suffix (`1.5.0-beta`, `2.1.0-rc.1`), so a genuinely versioned page under such a segment isn't misread as versionless and stripped of its dropdown.** The versionless test is `$urlVersion` present AND not the current-matched version AND not version-like. The marker pattern was `^v?[0-9]+(\.[0-9]+)*(\.x)?$`, which a pre-release segment failed — so a page under `.../1.5.0-beta/...` that wasn't matched as the current version (e.g. its menu entry belongs to a different `.product` than `currentProduct`, leaving `$matchedVersion` false) fell to `$isVersionless=true` and lost its switcher. Widened to `^v?[0-9]+(\.[0-9]+)*(\.x)?(-[0-9A-Za-z.]+)?$`. Arbitrary codename segments (`enterprise`) still fall through — extend the `main`/`latest`/… marker slice if a product adopts one. No current consumer uses a non-numeric, non-marker version segment, so there is no production incidence.

### Assets — inline theme init script externalized so the link checker can see the page body

- **The sidebar/TOC/tabs/copy-as-markdown init script now loads as an external `assets/js/docs-init.js` (`defer`) instead of inlined in `<head>`, because its minified inline form silently blinded the docs link checker to every link in the page body.** The script contains `<`-before-identifier comparisons (`i<targets.length`, `linkRect.top<scrollerRect.top`). Spec-compliant browsers parse `<t` / `<s` inside a `<script>` harmlessly — which is why the site rendered fine — but the link checker's HTML parser (lychee / html5ever) mis-reads `<t` as a start-tag and drops every link that follows it in the document. Inlined in `<head>`, that took the **entire `<body>` offline to link extraction**: the checker only ever saw `<head>` resource links (css / fonts / favicons), so it never reported a broken content link on any page (the observed symptom: agw link-checking "never finds any broken links"). Moving the script to an external `.js` file — never parsed as HTML — is immune; it's wrapped in `DOMContentLoaded`, so `defer` preserves execution timing. Verified against a local build of the production page [Solo Enterprise for agentgateway — Backend authentication](https://agentgateway.dev/docs/standalone/main/configuration/security/backend-authn/): lychee link extraction went from **14** (head resources only) to **303**, so the page's body links — the RFC references at `datatracker.ietf.org`, the `github.com/agentgateway` example links — are now actually checked. Because the script ships from extras, this fixes the link checker for **every consumer** (agentgateway, kgateway, docs hub). Extras browser/static/content suites stay green — the externalized script still drives the sidebar chevrons, TOC scroll-spy, tabs, version dropdown, and copy-as-markdown.

- **`copy-markdown.html` now escapes `<` → `&lt;` in the embedded copy-as-markdown source, closing the same parser trap in a latent per-page form.** The `<script type="text/markdown" class="copy-md-source">` block embeds the page's raw markdown, so a page whose markdown carries `<identifier` with no nearby `>` (e.g. a `for(i=0;i<n;i++)` code sample) would re-truncate link extraction *on that page* even after the head script was externalized. Escaping only `<` (leaving `&`, `>`, and existing entities untouched, so the entity round-trip is unchanged) removes the trap; `processCopyMd()` already runs the source through `decodeEntities()`, which reverses `&lt;` → `<`, so the copied/downloaded markdown is byte-identical (`copy-md-fidelity` stays green). As a bonus it neutralizes a literal `</script>` in page markdown, which would otherwise close the tag early.

- **`page-feedback.html` builds its "open an issue" link via DOM construction instead of an `innerHTML` string, removing a literal `<a` from the inline feedback script.** The widget (on every doc page) set `thanksMsg.innerHTML = '…Please <a href="' + issueUrl + …'` — that literal `<a` is the same `<`+letter trap. It sits at the end of `<body>`, so its blast radius was only trailing links (not catastrophic like the `<head>` case), but it's the same class of bug. The anchor is now created with `document.createElement('a')` + `textContent`/`setAttribute` and appended, so the served `<script>` carries no `<`+letter and no URL is interpolated into markup. Surfaced by the new `inlineScriptSafety` check (see Tests) before it was scoped to `<head>`.

### Tests

- **`built-html-integrity.spec.ts` gains an `inlineScriptSafety` check (new `inlineScriptSafety` toggle, default on) — the regression guard for the head-break class above.** It fails a built page whose `<head>` has an inline `<script>` (no `src`) containing `<`+ASCII-letter — the pattern the link checker's parser mis-reads as a start-tag, losing the entire page body. Scoped to `<head>` on purpose: a body script only drops links after it, and site JS usually sits at the end of `<body>`, so flagging every body script would be noise (the fixture and agw both carry benign body-script `<`+letter, e.g. minified `i<n.length` in interactive viewers). Validated both ways — an injected `<head>` script with `i<n.length` fails the check; a clean build passes. Runs in the `content` project; `src` scripts are exempt (their body is a URL, not HTML), as are `<=`, `<`+digit, `< ` (spaced), and `</`. **Test-harness only.**

- **`tab-syntax.spec.ts` (new) guards against pre-0.12 Hextra tab styling in consumer source.** Hextra 0.12 takes each tab's label from a `name=` attribute on `{{% tab %}}`; the old `{{< tabs items="…" tabTotal="N" >}}` + `{{% tab tabName="…" %}}` forms are deprecated (`items=`), no-ops (`tabTotal=`), or silently ignored (`tabName=` → the tab renders as "Tab 0", "Tab 1", …). The `tabName=` case is the dangerous one: it produces **no** Hugo build warning, so `hugo-warnings.spec.ts` can't catch it — the build looks clean while the reader sees numbered tabs. This surfaced on the agentgateway `agctl` install page (`https://docs.solo.io/agentgateway/latest/operations/agctl/#install-agctl`), whose install tabs rendered "Tab 0"–"Tab 3" after the theme moved to Hextra 0.12. The new spec is a source-side scanner (mirrors `shortcode-args.spec.ts`): it walks the consumer's configured `scanRoots` and flags `items=`/`tabTotal=` on `tabs`, `tabName=` on `tab`, and nameless `tab` opens, reporting `file:line` + the fix. Helper `tests/helpers/tab-syntax.ts` carries the detection logic and 10 unit tests. Gated on the new `tabSyntax` check (defaults on); registered in `playwright.config.ts`'s `static` project. The bundled fixture is clean, so extras' own suite stays green. **Test-harness only** — no layout, CSS, shortcode, or rendered-output change; consumers pick it up when they bump the module pin and re-run the harness against their content.

- **The file-scan specs are re-split into two projects by what each spec reads — `static` (fixture/theme behavior) and `content` (the consumer's real content) — so content checks run on content PRs, not just layout PRs.** Previously the leak scan and source lints lived in `static`, so a consumer workflow gated only on `layouts/**` never fired on a content-only PR — the exact PRs that introduce content rendering breaks (fragmented code blocks, orphaned list markers, escaped-HTML) went unscanned. Now every `static` spec renders the bundled **fixture** and `test.skip`s against a consumer build (signal only on layout changes), while `content` holds every spec that reads the consumer's own build or source: `markdown-leaks` + `copy-md-fidelity` + `hugo-warnings` (built HTML) and `curl-quotes` + `tab-syntax` + `shortcode-args` + `include-form` + `cascade-type` (markdown source). Consumers gate `--project=content` on content **and** layout paths, and `--project=static` on layout paths only (README §4). Example of the escaped-HTML leak class the content scan guards, now caught on content edits too: [Solo Enterprise for Gloo Mesh — BYO external database](https://docs.solo.io/gloo-mesh-enterprise/latest/setup/prod/databases/about-databases/#byo-external). **Test-harness only** — no layout, CSS, shortcode, or rendered-output change; consumers pick it up when they bump the module pin.

- **The `smoke` project is gone; its checks live in `content`, scoped by a new `CONTENT_DIR` env.** `smoke.spec.ts` was a separate per-product bundle (`SMOKE_PRODUCT` env) that overlapped `content`'s leak scan but also uniquely held the whole-site `codeBlockIntegrity` checks (`<p>`-in-`<pre>`, fragmented `hextra-code-block` wrapper) — which a single-site consumer running `content` (smoke off) never got. Those checks, plus the copy-as-md-presence and build-produced-pages sanity, moved into the new `tests/built-html-integrity.spec.ts` in the `content` project, so every consumer gets them. The per-product scoping `SMOKE_PRODUCT` provided is now `CONTENT_DIR=<product>`, honored by all `content` built-HTML scanners (`builtScanRoot` = `builtRoot/$CONTENT_DIR`, default whole build) — multi-product hubs set it per matrix job. The `smoke` check and `[smoke].maxFiles` config are removed; the browser-crawl cap is renamed to `[crawl].maxFiles` (only `console-errors` reads it). The dead `crossBrowser` check is removed too — it was declared but never read, so it gated nothing (the `cross-browser-*` projects run whenever a `/everything/` fixture page exists, regardless of it). This closes the gap where agentgateway-oss (smoke off) never ran the whole-site `codeBlockIntegrity` scan — the check for the fragmented-code-block break fixed in `conditional-text` above: [Solo Enterprise for agentgateway — Debug](https://docs.solo.io/agentgateway/latest/operations/debug/). **Test-harness only.**

- **`hugo-warnings` now finds a multi-product hub's per-product build log via `CONTENT_DIR`.** `target.buildLog` is now `CONTENT_DIR`-aware (mirroring `builtScanRoot`): with `CONTENT_DIR` set it resolves to `<builtScanRoot>/<basename>` — i.e. the log that ships **inside** that product's downloaded artifact — instead of the fixed config path. A multi-product hub that scans one product per matrix job (downloading only `public/<product>`) can now run `hugo-warnings` against that product's real build log; it just copies the log into `public/<product>/` at build time. Single-site consumers are unchanged — with `CONTENT_DIR` unset the configured path is returned as-is — but they do need to set `buildLog` and have CI write the log there for `hugo-warnings` to run at all (it `test.skip`s when `buildLog` is unset or the file is absent; agentgateway-oss and kgateway.dev had the `[allowlists].hugoWarnings` list but no `buildLog`, so the check silently skipped). **Test-harness only.**

- **Dead-config sweep of the test harness.** Removed four `[checks]` toggles that no spec read (so they gated nothing): `shortcodeLeaks` (its delimiter scan is covered by `markdown-leaks`' `shortcode-delim` kind), `imageAltText` and `shortcodeStructure` (never had a spec), and the `versioning` *boolean* (the `[versioning]` config block is unaffected — versioning specs gate on `target.versions`). Removed the orphaned `shortcodeStructure` family with it: `tests/helpers/shortcodes.ts` (no importers), the `shortcodeAllowlist` getter, and the `[allowlists].shortcodes` field. Moved `dev-build` (the dev-server LiveReload guard — it reads the consumer's built HTML) from `static` into `content`, where the other builtRoot scanners live. Renamed the `browser-smoke` project → `browser-crawl` (the "smoke" concept is gone; it's the all-pages Chromium console/4xx crawl). **Test-harness only** — no consumer-visible behavior change; stray `[checks]`/`[allowlists]` keys in a consumer's `.docs-test.toml` now warn (see next bullet) rather than being silently ignored.

- **Unknown or renamed `.docs-test.toml` keys now `console.warn` instead of being dropped silently.** After this release's config sweep (`smoke` → `crawl` rename, four removed `[checks]` toggles), a consumer's stale toggle left over from a rename — or a typo in a live one — passed unnoticed, because `mergeChecks`/`mergeCrawl`/`mergeAllowlists` only ever iterated the *known* keys. Each now emits `[docs-test] ignoring unknown [<table>] key "…"` for any key the harness doesn't read. A leftover `[smoke]` block gets a dedicated warning telling the consumer to move `maxFiles` to `[crawl]`, since silently dropping it would revert a `[smoke].maxFiles = 0` (unlimited crawl) config back to the default 50-file cap with no signal — the one case where the rename carries a real behavior change. These are warnings, not errors, so a pre-rename config still loads. The bundled fixture config is clean (zero warnings); verified that a config with a bogus `[checks]` key plus a `[smoke]` block emits both warnings. **Test-harness only** — no current consumer carries a removed key on its upgrade branch, so there is no production incidence; this is a footgun guard for future renames.

---

## [v0.1.17] — 2026-07-10

### `reuse-image` family — auto-resolve a per-version image override, no `{{< version >}}` split

- **The `reuse-image`, `reuse-image-light`, and `reuse-image-dark` shortcodes now resolve a bare `src` to a version-specific override automatically, so authors no longer wrap images in a `{{< version >}}` split to vary a screenshot across doc versions.** The resolver (new `_partials/utils/resolve-versioned-image.html`) splices the page's version slug into the path — `src="img/foo.png"` on a page whose version is `main` looks for `img/main/foo.png` — and uses it *when that file exists*, otherwise falls back to the bare `img/foo.png`. The version slug comes from the shared `utils/page-context` partial. This is the "shared until it diverges" model: one bare reference that never changes across releases, with a diverged version served purely by dropping a file at `img/<version>/`. A release cut becomes an image-file move, not a content edit.
- **Resolution order is override → bare → legacy per-product tree.** Step 1 is the new `<dir>/<version>/<file>` override; step 2 is the pre-existing bare `resources.Get src`; step 3 is the pre-existing `assets/<product>/<version>/img/<file>` fallback (kept verbatim for consumers that store images under a per-product tree). The nested-subdir case is handled — `img/screens/foo.png` → `img/screens/<version>/foo.png` — and the bare fallback the previous behavior relied on is preserved. Note the ordering change: step 1 now runs *before* the bare lookup, so a `<dir>/<version>/<file>` file that a consumer never intended as an override will now win over the bare path. This is the intended semantics, but consumers migrating should confirm they have no coincidental `img/<version>/` files.
- **Additive and inert for every current consumer.** Steps 1 and 3 only fire when the resolved file actually exists, so: the default version (which has no `img/<default-version>/` dir) always lands on the bare image exactly as before; consumers with no versioned image dirs see zero change; and a page that previously used an explicit `{{< version >}}` image split keeps working (the split still gates, and each branch's bare `src` resolves as it did). The three shortcodes now share one resolver instead of each carrying a copy of the legacy fallback, so their behavior is identical by construction. Guarded by `versioned-image-auto.spec.ts` (see Tests).
- **`url`-mode caveat — the auto-override needs `page-context` to resolve a version slug.** Step 1's slug comes from `utils/page-context`. In `siteParams` mode (multi-product hubs) the slug is derived from the section URL and always resolves, so those consumers are unaffected. In `url` mode (single-site repos) two conditions must hold: (a) the path is shaped `/docs/<section>/<version>/…` (or `/docs/<version>/…`) — pages outside `/docs/` yield an empty slug; and (b) for the `/docs/<section>/<version>/` shape, `<section>` must be in `page-context`'s hardcoded known-section allowlist — a `/docs/` page whose section isn't listed is misread (the section segment is taken as the version), so the override looks under the wrong slug and misses. When the slug is empty or wrong, step 1 is skipped and resolution falls through to the bare path (step 3's legacy tree does its own URL-segment scan). That's safe — no regression — but the auto-override won't engage until `page-context` resolves a correct slug. Before enabling this on a `url`-mode consumer, confirm its doc pages sit under `/docs/<section>/<version>/` and that every section is allowlisted (adding one is a one-line edit to `page-context`).

### `reuse-image` — a lone `src` (no `srcDark`) now renders in BOTH modes

- **`{{< reuse-image src="img/foo.png" >}}` with no `srcDark` now shows the image in both light and dark mode (a plain figure, no `toggle-*` wrapper), instead of being treated as the light half of a pair and hidden in dark mode.** This is the least-surprising default for a single image with no dark counterpart — a diagram, or a screenshot that reads fine in either theme — which previously vanished in dark mode. The `src` + `srcDark` **pair** form is unchanged (light in `.toggle-dark`, dark in `.toggle-light`). For a light-ONLY asset that must stay hidden in dark (e.g. a white-card screenshot with no dark version), use the dedicated `reuse-image-light`; for dark-only, `reuse-image-dark`.
- **Behavior change to watch on upgrade — two cases:** (1) a lone `reuse-image` deliberately **paired with a separate `reuse-image-dark`** for the same figure will now show BOTH images stacked in dark mode (the lone call renders in both modes); fix by moving `srcDark` onto the one `reuse-image` call. (2) a light-only white screenshot authored as a bare `reuse-image` will now appear (possibly looking off) in dark mode; move it to `reuse-image-light`. Standalone images with no dark sibling need no change — they simply become visible in dark mode, which is the intent. A survey of current agentgateway/docs/kgateway content found **zero** bare-`reuse-image` + sibling-`reuse-image-dark` pairings (case 1), so that case affects future authoring rather than existing pages; the light-only-screenshot case (2) should be spot-checked per consumer on upgrade.

### Tests

- **`versioned-image-auto.spec.ts` (new) guards the auto version-resolved override across all three shortcodes.** The `everything` conref gains four "Auto version-resolved image" sections, and the fixture ships bare assets plus overrides at multiple version slugs:
  - `reuse-image` bare `src="img/autover.svg"` (`MARKER_AUTO_VERSIONED_IMAGE`) — overrides at `img/main/` **and** `img/v2/`, so the spec proves the splice generalizes beyond `main`: `main`→`img/main/…`, `v2`→`img/v2/…`, `v1`→bare `img/autover.svg`.
  - `reuse-image` nested `src="img/screens/autover.svg"` (`MARKER_AUTO_VERSIONED_IMAGE_NESTED`) — override at `img/screens/main/`, pinning that the slug is spliced *before* the filename, not appended to the path.
  - `reuse-image-light src="img/autover.svg"` (`MARKER_AUTO_VERSIONED_IMAGE_LIGHT`) and `reuse-image-dark srcDark="img/autover-dark.svg"` (`MARKER_AUTO_VERSIONED_IMAGE_DARK`) — pin that the standalone light/dark shortcodes are wired to the shared resolver (the dark case exercises the `srcDark` slot).

  The static spec is table-driven (case × built version page): it asserts each resolved `<img src>` and that the file it points at was actually published (the "won't 404" check). Registered in `playwright.config.ts`'s `static` project; both brands (oss/enterprise) green, build log clean.

- **The same spec guards `reuse-image` rendering mode.** A `reuse-image rendering mode` block asserts the lone-`src` cases (`MARKER_AUTO_VERSIONED_IMAGE`, `…_NESTED`) render with **no** `toggle-*` wrapper (visible in both modes), while `reuse-image-light` keeps `.toggle-dark` and `reuse-image-dark` keeps `.toggle-light` — pinning the single-image / light-only / dark-only distinction. The block also covers `reuse-image`'s **own pair form** (`src` + `srcDark` on one call, `MARKER_REUSE_IMAGE_PAIR`): it must emit one `.toggle-dark` (light) + one `.toggle-light` (dark) and not collapse to the ungated single-image output. This is the ~285-usage two-variant case that the lone-`src` and standalone-shortcode cases don't exercise.

---

## [v0.1.16] — 2026-07-07

### Rebase — `upstream` / `downstream` source-filter shortcodes for single-source content

- **New `upstream` and `downstream` shortcodes, paired with a new rebase Stage 3b, let one source file serve both an OSS source site and its rebased downstream docs without duplicating content.** The pattern is a single-source authoring aid for the ambientmesh.io → Solo Enterprise for Istio (`docs.solo.io/istio`) pairing, where the same Markdown is authored once in the OSS repo and pulled into the Solo docs through the `rebase` shortcode. Two pieces:
  - **The shortcodes themselves** (copied into the module from the ambientmesh.io source repo, so ambientmesh drops its local `layouts/shortcodes/` copies): `_shortcodes/upstream.html` is `{{- .Inner -}}` (renders its body) and `_shortcodes/downstream.html` is `{{- $_ := .Inner -}}` (evaluates its body but emits nothing). On a **direct** render — i.e. the OSS source site rendering its own content — this means `{{< upstream >}}` content is visible and `{{< downstream >}}` content is hidden.
  - **Rebase Stage 3b — SOURCE FILTERS** (`_shortcodes/rebase.html`): when the same file is pulled into the downstream Solo docs via `rebase`, two `(?s)` regex passes run after the form-conversion stage and *before* the tags could ever reach the shortcode implementations — one strips `{{< upstream >}}…{{< /upstream >}}` blocks entirely (source-only content), the other unwraps `{{< downstream >}}…{{< /downstream >}}` blocks (removes the wrapper tags, keeps the inner content). So the polarity inverts across the two render paths: `upstream` shows in the source and vanishes downstream; `downstream` hides in the source and appears downstream. Because Stage 3b consumes the tags textually, the `upstream.html`/`downstream.html` implementations only ever execute on the direct source-site path — never on the rebase path.
- **Additive and inert for every current consumer.** No consumer content authors these tags today, so there is no rendered-output change on any existing page (agw/kgw/agentregistry/docs), and the bundled fixture does not exercise them. Adding the two shortcodes to the module only means a consumer that *does* write `{{< upstream >}}` / `{{< downstream >}}` no longer needs a local copy and no longer trips Hugo's "unknown shortcode" error on a direct render.
- **No production page demonstrates the filter yet, and no fixture guard is added.** The ambientmesh.io content that will use these tags is still in flight (the source-repo change adds only the plumbing, not tagged content), so the source-vs-downstream difference is not observable on a live page until that content ships and is rebased into `docs.solo.io/istio`. The Stage 3b regexes carry no fixture coverage for the same reason — the fixture has no `upstream`/`downstream` blocks — tracked as a follow-up alongside the ambientmesh rebase.

---

## [v0.1.15] — 2026-7-06

### Docs layout — footnotes render after the auto section cards

- **On a docs section-index page (`docs/list.html`) that uses Markdown footnotes AND auto-generates section cards, the footnote list no longer renders wedged between the page body and the card grid — it now renders after the cards, at the bottom of the content.** Goldmark appends the footnotes block (`<div class="footnotes" role="doc-endnotes">`) to the very end of `.Content`, and the template rendered `.Content` and *then* `auto-section-cards.html`, so the footnote list landed above the cards (e.g. `https://ambientmesh.io/docs/traffic/` has a `[^1]` footnote and auto-cards, and shows the footnotes between the "Explore the following sections" intro and the card grid). The fix splits the trailing footnotes block out of `.Content` with a `findRE`/`replaceRE` pair, renders the body, then the cards, then the footnotes. **Behavior-neutral for pages without footnotes** — the regex matches nothing, so `$body == .Content` and `$footnotes` is empty (no stray element emitted); confirmed against the fixture's no-footnote section indexes, which still render cards and no footnotes div. `docs/single.html` is unchanged (it has no cards; footnotes at the end of `.Content`, before the pager, is already correct). Template-only; no CSS, shortcode, or content change. Observable in production once a consumer with footnoted section indexes ships on the module (ambientmesh). Guarded by `footnotes-after-cards.spec.ts` (see Tests).

### Sidebar — honor `displayPlaceholder` so Hextra blog lists stay centered

- **`sidebar.html` now honors the `displayPlaceholder` argument, restoring the left spacer column that keeps Hextra's blog list (`blog/list.html`) centered.** Hextra's blog list centers its content with a symmetric layout: a left sidebar *placeholder* (`{{ partial "sidebar.html" (dict … "disableSidebar" true "displayPlaceholder" true) }}`) that reserves the same `w-64` width as the right-hand TOC spacer. The module's `sidebar.html` overrides Hextra's but had dropped the `displayPlaceholder` branch — for any `disableSidebar` call it emitted a zero-width `<aside class="hx:hidden">`, so the left column reserved no width, the right spacer had no counterpart, and the centered content shifted left (visible on a consumer that themes its blog section, e.g. ambientmesh's `/blog/`). The fix mirrors Hextra's own sidebar: when `disableSidebar` (or a hidden landing) is set AND `displayPlaceholder` is true, emit the width-reserving `<div class="hx:max-xl:hidden hx:h-0 hx:w-64 hx:shrink-0">` instead of the hidden aside. **Defaults to false, so every current call is unaffected** — the module's own `docs/list.html` and `docs/single.html` never pass `displayPlaceholder` (they render the real sidebar or the zero-width hidden aside as before, confirmed by the fixture suite staying byte-stable), and only Hextra's blog templates pass it. Partial-only; no CSS or content change. No fixture guard yet: the bundled fixture is docs-only (no `blog` section / `[params.blog]` config), so nothing exercises `displayPlaceholder` there; verified against the ambientmesh consumer build (its `/blog/` now renders a balanced left placeholder + right spacer, 2 spacers total). A fixture blog section would let this be guarded like the footnote fix — tracked as a follow-up.

### Callout — optional `icon=` override

- **The `callout` shortcode now accepts an optional `icon=` argument that overrides the type-derived icon.** The Solo callout derives its icon from `type`/`context` (info→ℹ, warning→⚠, …) via a Material Icons map, and previously ignored any `icon=` attribute entirely — so a consumer that authored branded callouts (e.g. ambientmesh's `{{< callout icon="solo" >}}` / `icon="waypoint"`) silently got the default `notifications` bell instead. When `icon=` is set it now wins: a name present in `site.Data.icons` renders as an inline `<svg class="solo-alert-icon-svg">` (via Hextra's `utils/icon.html`, the same lookup the section cards use); any other value renders as a Material Icons ligature. The SVG is flattened to a single line so it can't reintroduce the list-continuation break the body-escaping guards against, and a new `.solo-alert-icon .solo-alert-icon-svg` CSS rule sizes it to the 20px material glyph (branded logos keep their own fills; single-color icons using `currentColor` inherit the per-type color). **Unset (every existing callout across agw/kgw/agr/docs) is unchanged** — the type-derived Material icon still renders, confirmed by the fixture suite. Translation-export mode carries `icon=` through in the round-trip placeholder. Guarded by `callout-icon.spec.ts` (see Tests).

### GitHub-style alerts — custom types, plus built-in `[!SOLO]`

- **The GitHub-alert render path now supports custom alert types beyond the five GitHub-native ones (note/tip/important/warning/caution), and ships one built-in: `[!SOLO]`.** Hugo parses any `> [!TYPE]` blockquote into an alert (setting `.AlertType`); Hextra's hook warned "unsupported" for anything outside the five and fell back to a default green/lightbulb box. This overrides `_markup/render-blockquote-alert.html` + `_partials/components/github-style-alert.html` so that (1) the theme-shipped type renders properly — `[!SOLO]` (Solo logo + "Solo Enterprise for Istio" label), tinted green to match the production ambientmesh rendering (reusing Hextra's tip/default palette); and (2) a consumer can declare its own types under `params.themeExtras.alertTypes` (`{title, icon, style}` per type; icon resolves through `site.Data.icons`, so a consumer SVG or a Hextra icon both work). The built-in needs **zero consumer config** — its icon ships in this module's new `data/icons.yaml`, mounted via a new `data` mount in `hugo.toml` (declared explicitly because the module overrides the default mounts); a consumer's own `data/` still merges on top. **Built-in-only and additive:** the five GitHub types are untouched, and consumers that never write `[!SOLO]` see no change. Guarded by `custom-alert.spec.ts` (see Tests).

### Copy-as-markdown / `.md` output — preserve GitHub alerts

- **Copy-as-markdown and the `.md` output format now keep GitHub alerts as `> [!TYPE]` instead of flattening them to a bare label + text.** `transform.HTMLToMarkdown` sees a styled alert `<div>` and serialized it as two loose paragraphs ("Note\n\nbody"), dropping the alert syntax. `github-style-alert.html` now tags the box with `data-alert-type`/`data-alert-copyas` and marks the body end with an empty `<span data-alert-md-end>` sentinel; both `copy-markdown.html` and `page-to-markdown.html` capture the body up to that sentinel (robust to nested `<div>`s like a code block's chroma wrapper — an HTML comment was tried first but Goldmark strips comments from `.Content`) and rewrite it into a `<blockquote>` so the conversion emits `> [!TYPE]` + the `>`-prefixed body. A post-pass un-escapes the `\[!` that HTMLToMarkdown adds and drops the blank `>` line it inserts between the marker and body — matching leading indentation, so it also cleans up alerts nested in list items — yielding the canonical form (`> [!NOTE]` immediately followed by the content). **Custom types downgrade to a native type on export** — the alert div carries `data-alert-copyas` (native types = themselves; `solo` → `tip`; consumer types via a `copyAs` field, default `note`), so `[!SOLO]` exports as `> [!TIP]` and renders as a real alert on GitHub instead of an inert `[!SOLO]` blockquote. Guarded by `custom-alert.spec.ts` + `copy-md-fidelity.spec.ts`.

### Tests

- **`callout-icon.spec.ts` (new) guards the callout `icon=` override.** The fixture's `flatguide/alpha` page carries two callouts: `icon="solo"` (a `site.Data.icons` entry, now theme-shipped) and `icon="rocket_launch"` (not one). The static spec asserts the first renders the inline SVG (`solo-alert-icon-svg` + the solo logo's `viewBox="0 0 84 84"`, not a `material-icons` ligature named "solo") and the second renders `<i class="material-icons">rocket_launch</i>`. Gated on `IS_FIXTURE_TARGET`; registered in `playwright.config.ts`'s `static` project.

- **`custom-alert.spec.ts` (new) guards the built-in `[!SOLO]` alert type.** The `everything` conref's "Callouts - Github default styling" section carries a `> [!SOLO]` alert alongside the five GitHub-native types (so both direct and rebase/RenderString paths cover it, and `versioning.spec`'s everything-vs-rebased equivalence still holds). The fixture declares **no** `themeExtras.alertTypes`, so the spec proves a bare consumer gets it purely from the theme: it asserts `[!SOLO]` renders the "Solo Enterprise for Istio" label + the solo logo (`viewBox="0 0 84 84"`) + the green box. Gated on `IS_FIXTURE_TARGET`; registered in the `static` project. Both brands stay green (oss/enterprise passed) with no "unsupported alert type" warnings.

- **`footnotes-after-cards.spec.ts` (new) guards the footnote-reorder fix above.** The fixture's `test/v2/_index.md` now carries a footnote (`[^order]`) alongside its child pages (which drive the auto-cards), so the v2 landing exercises both features at once. The static spec reads the built `test/v2/index.html` and asserts the `class="section-cards"` grid appears *before* the `class="footnotes"` block — minify-tolerant (matches quoted or bare class attributes). Gated on `IS_FIXTURE_TARGET`. Registered in `playwright.config.ts`'s `static` project. Confirmed to fail when `docs/list.html` is reverted to the naive `{{ .Content }}` → cards order (footnotes then land before the cards).

---

## [v0.1.14] — 2026-7-06

### Docs layout — "Was this page helpful?" feedback widget

- **The module's own `docs/single.html` and `docs/list.html` now render the `components/page-feedback.html` widget (after the pager, before comments), so a consumer using the module's docs templates gets the feedback buttons from config alone — no local template override needed.** Previously only consumers that override the docs templates wholesale (agw, kgw) called this partial; a consumer relying on the module's templates (agentregistry) had no way to surface it. The partial already self-gates on `site.Params.feedback.enable` (and per-page `hide_feedback: true`), so this is inert for any consumer that hasn't opted in — including the bundled fixture, which sets no feedback config (self-test output unchanged, 1352 passed). Consumers enable it with `params.feedback.enable: true` + `params.feedback.issueRepo: "owner/repo"` (thumbs-down opens a GitHub issue there). Template-only; the widget markup/JS are unchanged. Guarded by `page-feedback.spec.ts` (see Tests).

### Sidebar — flat, unversioned sites render the full nav tree

- **The sidebar's first nav item no longer sits flush against the navbar — the nav wrapper gains `padding-top: 1rem` so its top lines up with the content pane's top.** The content pane carries `hx:pt-6` (1.5rem) in `docs/list.html`, but `.sidebar-nav-wrapper` had `padding-top: 0`, so the first sidebar link touched the bottom of the (tall, `hx:h-24`) navbar while the article text started well below it — a visible top-edge asymmetry, most obvious on a consumer with no sidebar product-logo (agentregistry). Changed `.sidebar-nav-wrapper`'s shorthand from `0 1rem 1rem` to `1rem 1rem 1rem` in `docs-theme-extras.css`. **This shifts the first sidebar item down ~1rem on every consumer** (agw/kgw included); it's a small, consistent alignment improvement, not a breaking change. CSS-only.

- **New `params.sidebar.showOnLanding` opt-in renders the left nav ON the docs-index / section-landing pages (`/docs/`, `/docs/<section>/`) instead of hiding it.** The sidebar partial suppresses the rail on those landing pages by emitting an empty `<aside class="hx:hidden">` — right for versioned sites whose `/docs/` is a "pick your version / deployment type" splash with no single tree to show (agw's `/docs/` is exactly that), but wrong for a flat site like agentregistry where `/docs/` is the real docs entry and readers expect the full nav (confirmed against production `https://aregistry.ai/docs/`). The landing detection now clears `$isLandingPage` when `site.Params.sidebar.showOnLanding` is true, so those pages fall through to the normal (here, non-versioned) sidebar render. The lookup is nil-safe via `with site.Params.sidebar`, so consumers with no `[params.sidebar]` table are untouched. **Default is false — agw/kgw and every other current consumer are unaffected.** Not exercised by the bundled fixture: the landing detection is hardcoded to the `/docs/` path + `docs` section and the fixture is served at `/test/`, so neither the suppression nor this flag fires there; the behavior is validated through the agentregistry consumer build (its `/docs/` renders the full section tree with the flag on).

- **On a flat, unversioned OSS site (`/docs/<section>/<page>/`, no `site.Params.sections`, no version segment — e.g. agentregistry), the left nav now shows the whole docs tree from every page instead of collapsing to just the current section's children.** The non-versioned fallback branch in `layouts/partials/sidebar.html` rooted `render-sidebar-tree` at `$context` (the current page), so visiting `/docs/install/` rendered a sidebar containing only `install`'s own children (Docker, Kubernetes) — none of the sibling sections. The fix roots the fallback tree at the top-level docs section using the same expression Hextra's own sidebar uses, `cond (eq site.Home.Type "docs") site.Home $context.FirstSection`, so every section stays visible from any page. The `.sidebar-mobile-overlay` div (emitted before the versioned/non-versioned split) plus the `.sidebar-mobile-panel` class on the fallback `<aside>` are unchanged, so the mobile slide-in and the `head-end.html` hamburger toggle keep working. Partial-only; no CSS, shortcode, or content change. **Versioned consumers are unaffected** — agw/kgw match `site.Params.sections` + a version segment and take the versioned branch (rooted at `$docsSection`), never this fallback. Note the pre-existing extension point in the same branch, `templates.Exists "partials/hextra/sidebar.html"`, is a no-op under Hextra v0.12 (which ships its sidebar at `_partials/sidebar.html`, not that path) and is left in place for consumers who want to supply a full replacement. No production page demonstrates the pre-fix behavior yet: the only consumer that reaches this path (agentregistry) is not deployed on the module, and every currently-deployed consumer is versioned and never hits the fallback — the fix is observable once agentregistry ships on the module.

### Tests

- **`page-feedback.spec.ts` (new) guards that the docs templates render the feedback widget.** The bundled fixture now enables feedback (`[params.feedback]` in `hugo-oss.toml` / `hugo-enterprise.toml`, `issueRepo = "solo-io/docs-theme-extras"`), and the static spec asserts a versioned content page (docs/single.html) and the docs landing (docs/list.html) both contain the `#page-feedback` container, the "Was this page helpful?" prompt, and the `submitPageFeedback` handler — locking in the partial call so a template refactor can't silently drop it. Gated on `IS_FIXTURE_TARGET` (the fixture enables feedback; consumers opt in via their own config). Registered in `playwright.config.ts`'s `static` project. Enabling feedback fixture-wide left both brand self-tests green (oss 1421 / enterprise 1425, 0 failures — the widget only defines `submitPageFeedback` on load, so no console-error noise).

- **`sidebar-flat.spec.ts` (new) guards the non-versioned sidebar fallback described above.** The bundled fixture is entirely versioned, so the fallback branch had no coverage; a new `/test/flatguide/` section (a plain `_index.md` + two topics, `alpha`/`beta`, with no version segment) exercises it. The static spec reads the built `/test/flatguide/alpha/` page and asserts its sidebar `<aside>` still contains a link to the sibling `/flatguide/beta/` — which is present only when the fallback roots the tree at the docs section/home, and absent if it regresses to rooting at `$context` (the childless `alpha` leaf). The `flatguide` pages are intentionally kept out of the `[[pages]]` list (static.spec.ts would treat them as comprehensive topic pages) and resolved by direct path, gated on `IS_FIXTURE_TARGET` so consumer runs skip. Registered in `playwright.config.ts`'s `static` project. Confirmed to fail when the fallback root is reverted to `$context`.

- **`shortcode-contexts.spec.ts` gains a GitHub-native callout host for the `reuse`, `version`, and `conditional-text` shortcodes.** The existing callout/alert case (section 1) covers the `callout`/`alert` shortcodes, whose bodies land in a `.solo-alert` div; GitHub-native `[!NOTE]` alerts are a *different* host — Goldmark's GFM-alert extension renders them through Hextra's blockquote-callout hook into a bordered `hx:rounded-lg` container with a type label (Note/Tip/…), not the `solo-alert` markup — so the shortcode bodies ride a separate render path that was previously untested. A new `### With reuse, version, and conditional-text shortcodes` subsection in the `everything` fixture drops all three inline shortcodes into one `[!NOTE]`: a `reuse` snippet, a v2-gated `version` block (angle-bracket form), and a `conditional-text` block (percent form), opened by a unique lead sentinel so the test can locate the alert independently of the (non-unique) reuse snippet text. Per topic page the spec anchors on that sentinel, asserts it sits inside the GFM-alert container (bordered box + type label), then asserts `reuse` + `conditional-text` render inline *in that same region* on every page and `version` renders in-region only on v2, with no raw `{{<`/`{{%` tag leaking anywhere inside the callout and the version marker page-wide absent off v2 (added to the section-16 negative-control list). Runs on both brands across v1/v2/main and their `rebased` companions, so both the direct and `RenderString` rebase render paths are covered. Fixture-only; no shortcode, template, or CSS change. Confirmed to fail when a shortcode body leaks its raw tag into the callout or the v2 version gate is bypassed.

---

## [v0.1.13] — 2026-7-01

### Smooth in-page scrolling for TOC and anchor clicks

- **Clicking an "On this page" TOC entry, a heading anchor, or any in-page `#section` link now glides to the target instead of instantly snapping, and the target heading lands *below* the sticky navbar instead of tucked under it.** Requested in [agentgateway/website#664](https://github.com/agentgateway/website/issues/664). Two coordinated CSS rules in `docs-theme-extras.css`, plus one JS hardening in `head-end.html`:
  - `@media (prefers-reduced-motion: no-preference) { html { scroll-behavior: smooth } }` animates the browser's native anchor-jump. It is gated on `no-preference` so it is opt-out for reduced-motion users; Hextra's own `prefers-reduced-motion: reduce` reset already forces `scroll-behavior: auto`, so the motion-safe path is covered from both sides. Hextra ships no `scroll-behavior` of its own (only that reset), and its `toc-scroll.js` merely highlights the active link via an IntersectionObserver — it does no programmatic scrolling — so the smooth glide is pure native-anchor behavior with no JS conflict.
  - `.content h1…h6 { scroll-margin-top: calc(var(--solo-rail-top, 4rem) + 0.5rem) }` reserves the navbar (+ banner) height so an anchored heading clears Hextra's sticky nav container instead of landing at the very top of the viewport underneath it. This reuses the existing `--solo-rail-top` var (navbar + `--hextra-banner-height`) that the side rails already pin to. Content headings previously had *no* scroll offset; the abrupt instant jump masked it, but it is a real pre-existing usability bug that smooth scroll would otherwise have made obvious.
  - `head-end.html`'s load-time hash handler — which deliberately lands deep links *instantly* and flash-free — had a bare `window.scrollTo(0, 0)` that CSS `scroll-behavior: smooth` would have animated, racing the handler's instant `scrollIntoView` and mispositioning the anchor. It now passes an explicit `{ top: 0, left: 0, behavior: 'instant' }`, so deep-link landing stays instant regardless of the new rule.

  CSS + a one-line JS hardening; no template, shortcode, or content change. Affects only programmatic/anchor scrolling, never manual wheel/trackpad/scrollbar scrolling. Production page showing the pre-fix behavior: <https://agentgateway.dev/docs/standalone/latest/integrations/mcp-clients/windsurf/> — clicking a right-rail "On this page" entry snaps instantly today (and a heading clicked from the TOC sits high, partly under the navbar); after a consumer bumps the module pin the same click glides and the heading rests just below the nav.

---

## [v0.1.12] — 2026-6-30

### Back-to-top — sits beside the AI chat launcher

- **On a product that mounts the AI chat, the `#solo-back-to-top` arrow keeps the bottom-right corner (always flush right) and the chat launcher is shifted left so the two sit side by side instead of overlapping.** Both controls are `position: fixed` in the bottom-right at `right: 1.5rem`, so on agw-oss — the only consumer with the chat today — the arrow (`z-index: 30`) sat directly under the "Ask AI" pill (`z-index: 9998`) and was unreachable; agw had been hiding the arrow entirely with a local `#solo-back-to-top { display: none !important }`, which cost it a scroll-to-top control on every non-`xl` viewport (the TOC's `#backToTop` link only renders at `xl` and up). The fix leaves the arrow at its default corner and adds `#chatbot-widget .chatbot-trigger { right: 4.75rem !important }` to `docs-theme-extras.css`: the 40px (2.5rem) arrow sits at `right: 1.5rem`, so shifting the launcher to `right: 4.75rem` (1.5rem corner + 2.5rem arrow + 0.75rem gap) clears it, and `!important` overrides the launcher's inline `right`. The chat dialog stays right-anchored. Sites without a chat widget are unaffected, and the agw-local hide rule is removed. **Contract:** a product's AI chat must wrap itself in `#chatbot-widget` with the launcher carrying class `.chatbot-trigger` for the shift to apply. CSS-only. Production page: <https://agentgateway.dev/docs/standalone/latest/quickstart/> — the "Ask AI" pill sits shifted left of the corner, and scrolling past 300px reveals the blue back-to-top arrow flush in the corner to its right (visible once agw redeploys / bumps the module pin; before this, agw shows no floating arrow at all).

### Sidebar — long nav labels wrap instead of clipping

- **A long, unbreakable left-nav label (e.g. a CRD name like `EnterpriseKgatewayTrafficPolicy`) now wraps onto multiple lines instead of being clipped at the sidebar's right edge.** `.sidebar-link` is a flex row whose label lives in a `.hx:flex-1` `<span>`; the span had no word-breaking rule, so a single word with no break opportunity overran the fixed-width (16rem) sidebar and was cut off mid-word with no ellipsis. The fix adds `.sidebar-link > span { min-width: 0; overflow-wrap: anywhere }` in `docs-theme-extras.css`. `anywhere` is load-bearing and `break-word` would NOT work here: only `overflow-wrap: anywhere` reduces the flex item's *min-content* size, so the word is allowed to break rather than forcing the box wider than its track; `min-width: 0` lets the flex span shrink below its content width in the first place. CSS-only, no template or content change. Production page showing the pre-fix clipping: <https://docs.solo.io/kgateway/2.2.x/about/policies/trafficpolicy/> — the `EnterpriseKgatewayTrafficPolicy` entry in the left **Policies** nav is truncated to `EnterpriseKgatewayTrafficP` until a consumer bumps the module pin.

### Pager — long prev/next titles wrap instead of forcing a horizontal scrollbar

- **A long, unbreakable title on a prev/next pager link (e.g. a CRD name like `EnterpriseKgatewayTrafficPolicy`) now wraps instead of overrunning the link box and shoving the pager's arrow icon past the viewport's right edge — which produced a horizontal scrollbar on mobile.** This is the same root cause as the sidebar-label fix above, in a different component: Hextra's pager anchors carry its `[word-break:break-word]` utility, but `word-break: break-word` does NOT reduce the flex item's *min-content* size, so a single unbreakable word fails to wrap and overflows the `hx:max-w-[50%]` anchor. The fix adds `a[class*="word-break:break-word"] { min-width: 0; overflow-wrap: anywhere }` to `docs-theme-extras.css` — the same `overflow-wrap: anywhere` + `min-width: 0` pairing applied to `.sidebar-link > span`: `anywhere` lets the word break (where `break-word` does not), `min-width: 0` lets the flex anchor shrink below its content width. The attribute selector targets exactly Hextra's pager links without needing the Tailwind `:`/`[]` escaping. CSS-only, no template change. Production page: <https://docs.solo.io/kgateway/2.2.x/about/policies/trafficpolicy/> — at a narrow/mobile width the prev/next pager linking to the long CRD-named policy page overruns the viewport until a consumer bumps the module pin.

### Tests

- **`sidebar-rail.spec.ts` gains a browser test that a long, unbreakable nav label wraps.** It runs at 1280px (desktop sidebar visible), finds the `/enterprise-kgateway-traffic-policy/` sidebar link, and asserts the label span's `overflow-wrap` computes to `anywhere`, that its content does not overflow horizontally (`scrollWidth <= clientWidth`, i.e. it is not clipped), and that it occupies more than one line. A new fixture topic page `enterprise-kgateway-traffic-policy.md` (in v1/v2/main) supplies the long single-word title; the test skips on real consumer builds where that fixture page is absent. Confirmed to fail when the `overflow-wrap` rule is reverted.

- **`sidebar-rail.spec.ts` also guards the pager-link wrap.** At a 375px (mobile) viewport — where the `hx:max-w-[50%]` pager anchor is narrow enough that an unbroken CRD name would overflow — it walks the fixture's versioned pages to the one whose prev/next pager links to `/enterprise-kgateway-traffic-policy/`, then asserts that pager anchor's `overflow-wrap` computes to `anywhere` and that it does not overflow horizontally (`scrollWidth <= clientWidth`). Skips on consumer builds where the fixture page is absent. Confirmed to fail when the `a[class*="word-break:break-word"]` rule is reverted.

- **`back-to-top.spec.ts` (new) guards the chat-launcher shift.** At desktop width it injects a `#chatbot-widget` whose `.chatbot-trigger` launcher pins to the corner (inline `right: 1.5rem`, like agw's), then asserts the arrow stays flush in the corner (`right`/`bottom` 1.5rem) while the launcher's computed `right` shifts to `4.75rem` — proving the `#chatbot-widget .chatbot-trigger` rule fired and beat the inline `right`. The fixture has no chat widget of its own, so the test synthesizes one; registered in `playwright.config.ts`'s `browser` project.

- **`callout-in-table-cell.spec.ts` guards admonitions placed inside a markdown table cell.** Against the `everything` fixture it covers the two in-cell note forms — the `callout` shortcode (whose `solo-alert` div is emitted on one logical line, body newlines flattened to `&#10;`, so it stays inside the `<td>` instead of breaking the row) and a faked inline note built from `<br><br>` + a bold `**Note**` lead-in (GFM `[!NOTE]` blocks can't live in an inline-only cell) — asserting each note's markup lands in the same `<td>` as the cell's description marker, plus that the cell's `` `--set apiVersion` `` backtick span renders as a literal `--` (not an en dash). Fixture-only; self-skips on consumer targets.

---

## [v0.1.11] — 2026-06-29

### Version shortcode

- **`version`'s `include-if`/`exclude-if` now match the stable `linkVersion` token (e.g. `main`, `latest`) in addition to the canonical version number (e.g. `1.4.x`).** Previously the conditions compared only against each versions entry's `.version` string, which rotates every release — so a block meant for the in-development docs had to be written `include-if="1.4.x"` and re-bumped to `1.5.x` at every release, and silently flipped onto the wrong branch if anyone forgot. The two match sites in `_shortcodes/version.html` now also test `.linkVersion`, so `include-if="main"` / `exclude-if="main"` target a directory by its release-stable name and never need a per-release edit. This is backward-compatible: numeric conditions (`include-if="1.3.x"`, and the frozen-old-version `exclude-if="1.2.x,1.1.x,1.0.x"` idiom) still match exactly as before, since `.version` is checked alongside `.linkVersion`. Consumers that also run the agentgateway Python doc-test extractor carry the mirrored change in `_evaluate_version_block`, so generated tests and rendered pages agree on what `"main"` resolves to. The change is additive with no rendered-output change for any existing page, so there is no reader-facing production page to demonstrate it; the new behavior is observable only when a consumer authors a `linkVersion`-keyed condition (first use: the agentgateway `install-agentgateway-binary` doc-test snippet, which serves the nightly build on `main` and the latest release elsewhere).

---

## [v0.1.10] — 2026-06-26

### Callout / alert

- **`alert` now ships its own renderer in this module, so consumers no longer need a local `alert.html` override to get the single-source behavior.** v0.1.9 made `callout` the one renderer and showed that a consumer could map `alert`'s `context` → `callout`'s `type` and delegate via `RenderString`; that mapping was carried in each consumer repo's local `layouts/_shortcodes/alert.html`. This release moves that 21-line delegating shortcode into the module (`_shortcodes/alert.html`), replacing the old standalone `solo-alert` markup. `alert` reads `context` (falling back to `type`), takes its body from a self-closing `text="…"` attribute or block inner content, and always emits the block `{{< callout >}}…{{< /callout >}}` form through `RenderString` so a body with quotes or markdown can't break an attribute — inheriting callout's list-safety, `role="note"` a11y, and translation-snapshot output wholesale. The legacy `icon="…"` and `role="alert"` overrides are dropped (no content occurrences; callout derives the icon from type).

  Backward-compatible for the docs repo, whose local override already delegated to callout — output is byte-identical there, so this is a refactor that deletes the now-redundant override. Consumers still on the old standalone `solo-alert` markup (agw, kgw) pick up the callout rendering only when they bump the module pin. Example of an `alert` that renders identically through this path: [Solo Enterprise for agentgateway — Microsoft Purview DLP guardrail](https://docs.solo.io/agentgateway/latest/llm/guardrails/purview-dlp/).

### Test harness

- **Added nested-list coverage to the conref `everything.md` fixture** — a callout inside an ordered-list item, with a further callout inside a substep and an ordered sublist, to exercise the list-safety dedent path through a second nesting level. Fixture-only; no shortcode, partial, or rendered-output change.

---

## [v0.1.9] — 2026-06-24

### Callout / alert

- **`callout` is now the single renderer for both callout and alert, gained `text=` support and a `translation`-environment branch, and carries `role="note"` for accessibility.** Four related changes, all in `_shortcodes/callout.html`:
  - **Translation gating (extends v0.1.6).** v0.1.6 gated `link`/`reuse-image`/`reuse-image-dark` in this module and left `callout`/`alert` to consumer-local overrides. That gating now lives here: under `eq hugo.Environment "translation"` the shortcode emits its opening and closing tags as `XTRANSPH<n>X` placeholders (registered in `.Store.transReg`, with the store re-read between the open and close registrations so a placeholder a nested shortcode registers while the body renders keeps its order) and lets the body flow through between them. `copy-markdown.html` restores them after `transform.HTMLToMarkdown`, so the translation-export snapshot keeps the `{{< callout >}}` shortcode (and its translatable body) instead of flattening to the rendered `<div>`, whose `aria-hidden` material-icons `<i>` was leaking as an italic `*info*` / `*warning*` label. No-op for normal/preview/prod builds.
  - **`text=` attribute.** Callout now accepts a self-closing `text="…"` body in addition to inner content, so a consumer's `alert` (which uses `text=` heavily) can map straight onto it.
  - **Single source for alert.** `alert` no longer needs its own renderer: a consumer maps `alert`'s `context` onto `type` and calls this shortcode (e.g. via `RenderString`), so the two are byte-identical — including reducing to the same `{{< callout >}}` form in the translation snapshot, which matches the convention the Japanese pages already standardized on. (This supersedes the v0.1.6 note that `alert` was intentionally left ungated.)
  - **List-safety + a11y.** The rendered `<div>` is emitted on one logical line (body newlines → `&#10;`) and the body is dedented before `markdownify`, so a callout nested in a numbered-list item no longer trips Goldmark's content-continuation column rule and fragments the list. The container gains `role="note"` — the correct ARIA role for a static admonition (ancillary content), as opposed to `role="alert"`, an assertive live region meant for dynamically-injected messages that would make screen readers announce every box on load.

  Behavior is backward-compatible: existing `{{< callout type=… >}}…{{< /callout >}}` calls render the same box (now one-line and with `role="note"`), and the `translation` branch only activates under `--environment translation`. Example of the bug this fixes — a Japanese page whose experimental-feature note currently renders as a bare italic `info` label instead of a callout box: [Solo Enterprise for agentgateway — 日本語 コスト追跡](https://docs.solo.io/agentgateway/ja/latest/llm/cost-tracking/).

### Test harness

- **Bumped the `@playwright/test` dev dependency from 1.60.0 to 1.61.0 (Dependabot, `npm-minor-and-patch` group).** This is a dev-tooling-only bump of the Playwright HTML-test harness; it does not change any shortcode, partial, or rendered output, so consumer repos need not re-pin the module on its account. v1.61.0 adds WebAuthn passkey and Web Storage test APIs and new video-retry modes, none of which the current specs use. NOTE: this change has no reader-facing production page to demonstrate — it is observable only in the `tests/` harness ([@playwright/test 1.60.0…1.61.0](https://github.com/microsoft/playwright/compare/v1.60.0...v1.61.0)).

---

## [v0.1.8] — 2026-06-22

### Cards

- **Section-card icons now accept a local SVG file, so a card can show a brand/product logo instead of only a Material Symbols glyph or a Hextra icon name.** ([#8](https://github.com/solo-io/docs-theme-extras/pull/8).) The card `icon` resolution in `_shortcodes/card.html` and `partials/auto-section-cards.html` gains an SVG branch that mirrors the v0.1.7 sidebar change: when the `icon` value ends in `.svg` and the file exists under `static/`, the partial `readFile`s the SVG and injects `class="section-card-icon"` (via `replaceRE "<svg"`) so it's styled like any other card icon, rather than passing the name to `utils/icon.html` (which only knows Hextra `data/icons.yaml` names) or emitting a `material-icons` `<i>`. `auto-section-cards.html` additionally picks up the `data/icons.yaml` lookup branch that `card.html` already had, so an auto-generated child-card grid now resolves the same three icon kinds (local SVG → Hextra icon name → Material Symbols glyph) as an explicit `{{< card >}}`. Behavior is unchanged for any card whose `icon` is a glyph or Hextra name. Example in production — the LLM-providers landing page, whose child cards now render each provider's brand logo from `static/integrations/providers/bw/*.svg`: [agentgateway — LLM providers](https://agentgateway.dev/docs/standalone/latest/llm/providers/).

---

## [v0.1.7] — 2026-06-22

### Sidebar

- **A per-page sidebar `icon` can now be a local SVG path or a Hextra icon name, not just a Material Symbols glyph name.** ([#7](https://github.com/solo-io/docs-theme-extras/pull/7).) The sidebar adornment block in `partials/sidebar.html` previously emitted the front-matter `icon` value verbatim inside a `material-icons` `<i>`, so anything that wasn't a Material Symbols glyph name rendered as broken ligature text. It now branches three ways: an `icon` ending in `.svg` whose file exists under `static/` is read inline (`readFile … | replaceRE "<svg" … | safeHTML`) with `class="sidebar-icon sidebar-icon-svg"`; a value present in `site.Data.icons` resolves through `utils/icon.html`; everything else falls back to the original `material-icons` `<i>`. A new `.sidebar-icon-svg { transform: scale(0.833333) }` rule (≈20/24) shrinks the inline SVG to match the optical size of the Material Symbols glyphs alongside it, so a mixed sidebar stays visually even. Behavior is unchanged for pages whose `icon` is a glyph name. Example in production — the LLM-provider pages, whose left-nav entries now show each provider's brand logo from `static/integrations/providers/bw/*.svg`: [agentgateway — OpenAI provider](https://agentgateway.dev/docs/standalone/latest/llm/providers/openai/).

---

## [v0.1.6] — 2026-06-17

### Translation export

- **Presentational shortcodes are now preserved in the Copy-as-Markdown output when a build runs under the `translation` Hugo environment, so the exported Japanese translation source stays structurally parallel to its English source instead of being flattened.** The same `transform.HTMLToMarkdown` round-trip that powers the reader's Copy button (`copy-markdown.html`) also feeds the JA translation pipeline via `scripts/export-copy-md-en.py`, which scrapes the embedded `<script class="copy-md-source">` markdown. For a *reader* pasting into a chat window, flattening `{{< tabs >}}` to `**Option: …**`, `{{< cards >}}` to bare title links, `{{< link path=… >}}` to a root-absolute URL, and `{{< reuse-image >}}` to a resolved/stripped `<img>` is fine. For a *translation source* it is actively harmful: the flattened forms (a) don't match the shortcode structure the JA pages are authored in, so the JA can never be kept line-parallel to the snapshot (the invariant that makes incremental, line-scoped translation updates cheap), and (b) force the translator to reconstruct every tab/card/link by hand from the raw English — error-prone, and the source of an all-English translation regression. Gated on `eq hugo.Environment "translation"`, the affected shortcodes now emit a unique `XTRANSPH<n>X` placeholder (registered verbatim, in order, in the page's `.Store` under `transReg`) in place of their rendered HTML; `copy-markdown.html` then restores each placeholder to its source shortcode form *after* `transform.HTMLToMarkdown` has run, so the shortcode lines land exactly where the source had them instead of being collapsed onto one line or rewritten. Wrapper bodies (a `{{< callout >}}` body, a `{{% tab %}}` panel) still flow through the HTML→markdown conversion between their wrapper placeholders, so the prose remains translatable; only the structural lines are pinned. The restore also re-indents a multi-line wrapper to the placeholder line's leading whitespace, so a shortcode nested inside a numbered-list item keeps every wrapper line at the list-item column (a column-0 continuation line would otherwise break the list when the JA page is built). In this module the gating covers `link.html`, `reuse-image.html`, and `reuse-image-dark.html` (which reconstruct `{{< link path=… >}}` / `{{< reuse-image … >}}` from their params) plus the restore pass in `copy-markdown.html`; a consumer that keeps **local overrides** of other presentational shortcodes (e.g. `tabs`/`tab`, `cards`/`card`, `callout`) adds the same `transReg` placeholder branch to those overrides — the restore pass here picks up any placeholder they register. `alert` is intentionally **not** gated: it lives mostly inside reuse snippets and the JA standardized it to `callout`, so preserving it would diverge from the existing translations rather than match them. Behavior is **byte-identical** for every normal/preview/production build — the env gate is off, so the reader's Copy-as-Markdown output still flattens exactly as before, and the placeholder restore is a no-op when nothing registered a `transReg` entry. NOTE: this change has no reader-facing production page to demonstrate — it is observable only in the translation-export output (`export-copy-md-en.py --environment translation`); the closest production artifact is a Japanese page whose tabs this keeps intact end-to-end, e.g. [Solo Enterprise for agentregistry — 日本語 プライベートリポジトリ](https://docs.solo.io/agentregistry/ja/latest/security/private-repo.md/).

---

## [v0.1.5] — 2026-06-16

### Copy as Markdown

- **Tables, mermaid diagrams, and cards now survive the "Copy as Markdown" button and the `.md` output instead of being mangled, stripped, or collapsed.** Both `copy-markdown.html` (the button) and `_partials/page-to-markdown.html` (the `markdown` output format) convert rendered HTML back to markdown with Hugo's `transform.HTMLToMarkdown`, which silently degrades three constructs: (1) it does not emit GFM tables — some tables, notably the `{{% github-table %}}` schema tables, flatten to pipe-less concatenated cell text with a blank line per row, so a multi-column reference table becomes an unreadable run of `` `field`stringThe field… ``; (2) it drops the language tag on a mermaid block, so `<pre class="mermaid">` becomes a plain ` ``` ` fence that no longer renders as a diagram when the markdown is re-used; (3) the partials' own card cleanup collapsed each `section-card` to a bare title link, discarding the `section-card-desc` description. Each construct is now pre-processed *before* `transform.HTMLToMarkdown` and swapped for an inert placeholder so the conversion can't re-escape it, then restored: a new shared `_partials/utils/html-table-to-gfm.html` rebuilds every `<table>` as a real GFM table (converting each cell's inner HTML per cell so inline code and links survive, flattening multi-line cells to one line, escaping literal pipes; the first row becomes the header + delimiter); `<pre class="mermaid">` is extracted, HTML-unescaped, and re-fenced as ` ```mermaid `; and the card regexes now run a description-required pass before the title-only pass — an optional desc group followed by a lazy `.*?</a>` tail gets skipped by RE2's leftmost match, so the description has to be its own required match — emitting `[Title](url)` plus the description rather than a bare link. Behavior is unchanged for pages with none of these constructs, and the existing static suite stays green on both the oss and enterprise brands. A new framework test (`tests/copy-md-fidelity.spec.ts` + `tests/helpers/copy-md.ts`) cross-references every built page's `.md` output against its rendered HTML and fails if a table, mermaid diagram, or card description is present in the HTML but absent from the markdown. (Section-landing pages render an auto-generated child-card *navigation* grid from the list layout; that grid is not page content — it lives outside `.Content` and so appears in neither markdown output — so the test scopes the card check around `index.md` landings.) Example of the broken pattern (open the "Copy as Markdown" button on this CEL reference page — the schema table comes out as pipe-less concatenated cell text): [Solo Enterprise for agentgateway — CEL expressions](https://docs.solo.io/agentgateway/latest/reference/cel/).

### Sidebar

- **The product logo no longer reads as tiny for shorter-named products.** The "Solo Enterprise for &lt;product&gt;" sidebar lockups all share one glyph height but vary in width by name length, so their aspect ratios run from ~5.7:1 (agentgateway, the longest name) down to ~3.2:1 (gloo-mesh, the shortest). The previous `max-height: 2.5rem` cap held every logo to the same glyph height, which kept the optical size consistent but left the shorter names filling only ~50% of the 256px sidebar column — so next to agentgateway, which nearly fills the column, products like gloo-mesh, istio, gateway, kagent, and kgateway looked small and lost. Raising the cap to `3.5rem` (the rule keeps `width: auto; max-width: 100%`, so the widest logo still binds on width and fills the column exactly at ~45px) lets the shorter logos bind on the taller height cap instead, growing them to fill ~70–95% of the column. The trade-off is intentional: the shorter-named products now render at a slightly larger glyph size than agentgateway, which is the prominence boost the complaint asked for. Behavior is unchanged for agentgateway (still width-bound, still ~45px). Example of the too-small pattern before the bump (gloo-mesh, the worst-case ~3.2:1 lockup, floating in a half-empty sidebar column): [Gloo Mesh Enterprise — latest](https://docs.solo.io/gloo-mesh-enterprise/latest/).

- **The mobile version chip now keeps the product and language prefix on translated pages, so tapping the current-version chip no longer 404s.** The empty-sidebar fix in v0.1.4 taught the enterprise URL-shape detector to find the version at `segments[3]` for the multilingual `/<product>/<lang>/<version>/…` shape, but the mobile version row (`sidebar-mobile-version-row`) still built its hrefs from `$section`, which holds only the single product segment and is deliberately left empty for any non-production shape (the version-at-`segments[3]` language case and local dev). With `$section` empty, the href fell through to `printf "/%s%s" .linkVersion $newPath` and emitted a root-relative `/latest/…` link that dropped the whole `/<product>/<lang>` prefix — on the docs hub every Japanese agentregistry page carried one broken self-link (87 link-checker errors, one per page), and the equivalent agentgateway JA pages the same. The row now builds hrefs from a new `$versionBase` — the joined run of URL segments *before* the version (`delimit (first $matchedIdx $segments) "/"`), i.e. `""` in local dev, `/<product>` in production, `/<product>/<lang>` for a translated page — so the prefix that precedes the version is always carried through, for both the swapped-version href and the `not-in-version` fallback. This sits alongside the navbar's "Version dropdown" fix (which uses `site.LanguagePrefix`); the sidebar's mobile row is a separate code path that the earlier fix didn't cover. Behavior is byte-identical for the default language and every single-language consumer: their version still matches at `segments[2]`/`segments[1]`, where `$versionBase` rebuilds to the same `/<product>` (or `""`) prefix the old `$section` branch produced; the multi-section OSS shape keeps its own `/docs/<section>/<version>/…` branch unchanged. Verified against an agentregistry build — EN version chip unchanged at `/agentregistry/latest/…`, JA chip now `/agentregistry/ja/latest/…` where it was `/latest/…` before, and the JA tree's 87 "File not found" link-checker errors drop to zero. Example of the broken pattern (open the mobile nav and tap the version chip — it 404s today): [Solo Enterprise for agentregistry — 日本語 arctl CLI](https://docs.solo.io/agentregistry/ja/latest/reference/cli/arctl/).

---

## [v0.1.4] — 2026-06-12

### Redirect

- **New `redirect` shortcode — a client-side redirect for stub pages that have moved.** This centralizes the shortcode that previously lived only in `agentgateway oss` (`layouts/_shortcodes/redirect.html`), where the MIGRATION_AUDIT had deferred it from phase 1. It emits an inline `<script>` that sets `window.location`, a `<noscript>` `<meta http-equiv="refresh">` fallback, and a visible "Redirecting to …" link, so a page that has moved bounces readers (and, via the meta-refresh/link, no-JS clients and crawlers) to the canonical location. It accepts a URL three ways: positional (`{{< redirect "/some/url" >}}`), named (`{{< redirect url="/some/url" >}}`), or section-relative (`{{< redirect path="/tutorials/basic/" >}}`). The one change from the agw copy is the `path=` resolution: the original hardcoded an agw-only regex (`^/docs/(?:kubernetes|standalone)/[^/]+`) to find the version-scoped section prefix, which wouldn't resolve on any other product's section layout (e.g. kgateway's `/docs/envoy/`). The centralized version resolves through `utils/page-context.html` instead — the same prefix `card.html` and the `link` shortcodes already use — so it works for every section the partial knows about (kubernetes, standalone, envoy, agentgateway, …) and falls back to `FirstSection.RelPermalink` for pages outside the `/docs/<section>/<version>/` shape. Because agw is already configured for `page-context` (its `card.html` depends on it), this is behavior-preserving for the existing agw redirect pages while generalizing to the other consumers. A `redirect` fixture page (`fixture/content/en/test/v2/redirect.md`, kept out of the harness `[[pages]]` list and resolved by direct path) plus `tests/redirect.spec.ts` guard both forms: that the `url=` form emits the script/noscript/link verbatim, and that the `path=` form resolves to the section-prefixed URL (`/everything/` → `/test/v2/everything/`) rather than leaking the bare path. The fixture's redirect targets point at a real page so the browser-smoke crawl that opens every built page lands somewhere valid instead of aborting `page.goto`. Example of the shortcode in production (an old LLM-provider stub that redirects to its new home): [agentgateway — OpenAI integration](https://agentgateway.dev/docs/standalone/latest/integrations/llm-providers/openai/).

### Language switcher

- **The language switcher now only appears on pages that actually have a translation.** Hextra's `language-switch.html` gates the switcher on `hugo.IsMultilingual`, which is true site-wide the moment a consumer's config defines more than one language. On the `docs` hub that means the switcher renders on every product and version even though only the `latest` trees are translated (currently agentgateway/agentregistry enterprise into Japanese), so clicking it on an untranslated page dead-ends on the default-language fallback. A centralized override at `layouts/_partials/language-switch.html` tightens the guard to `and (hugo.IsMultilingual) ($page.IsTranslated)`, so the button renders only when the current page has a real counterpart in another language — Hugo pairs the `content/{en,ja}/<product>/<version>/…` trees as translations automatically. Single-language consumers are unaffected (`IsMultilingual` is false for them, short-circuiting the `if`). The override is a near-verbatim copy of the `hextra@v0.12.3` partial with the one-line guard change, and lives in `_partials/` so it wins over Hextra the same way the centralized sidebar/TOC do; re-sync it on a Hextra bump. Example of the broken pattern (the switcher rendering on an untranslated older version, where it has no Japanese target): [Solo Enterprise for agentgateway — 2.1.x](https://docs.solo.io/agentgateway/2.1.x/).

### Version banner

- **The version banner can now be translated per language instead of always rendering its English `[[params.versions]]` string.** `version-banner.html` read the `banner` field straight off the matched `[[params.versions]]` entry and `markdownify`'d it. Because that `versions` array lives under the shared, language-agnostic `[params]` table — and Hugo's per-language param merge replaces arrays wholesale rather than element-wise — there was no practical way to localize a single banner string, so a translated page (e.g. the Japanese `latest` trees for agentgateway/agentregistry enterprise) showed the English banner. The partial now reads an optional `bannerID` from the matched entry and, when present, looks up `i18n .bannerID .` — passing the whole version entry as the i18n template context; a non-empty result replaces the banner text, and an empty one (the default language, which has no i18n table, or any key a consumer hasn't translated) falls back to the literal `banner` string. This is behavior-preserving for every entry that sets no `bannerID` and for every single-language consumer: with no key the lookup is skipped and the English `banner` renders exactly as before. Because the version entry is the context, a translation string can interpolate its fields — `{{ .version }}`, `{{ .productName }}`, etc. — so the older-version banners share one parameterized key (`version_banner_review: "… {{ .productName }} の {{ .version }} バージョン …"`) instead of one hardcoded string per version, and adding a new version needs no new i18n entry. (The i18n value is a plain `text/template`, so only field access works there, not Hugo funcs; `{{ .version }}` yields the raw field, e.g. `2.3.x`.) The consumer side is a `bannerID` on each translatable `[[params.versions]]` entry plus the matching strings in `i18n/ja.yaml`. Example of the broken pattern (a Japanese `latest` page whose "newest features / no long-term support" banner is still rendered in English): [Solo Enterprise for agentgateway — 日本語 latest](https://docs.solo.io/agentgateway/ja/latest/).

### Version dropdown

- **The version dropdown now keeps the language prefix when switching versions, so picking another version on a translated page no longer 404s.** The dropdown builds each entry's URL by splitting the current page's `RelPermalink` into `/<folder>/<version>/<rest>` and swapping the version segment. On a non-default-language page that path carries an extra language segment (`/<folder>/ja/<version>/<rest>`), so the splitter read `"ja"` as the version, appended the real version as path, and dropped the `/ja/` prefix entirely — every dropdown entry pointed at a non-existent URL like `/agentgateway/2.3.x/latest/` and dead-ended on a 404. The partial now derives the language segment from `site.LanguagePrefix` (empty for the default language, `"/ja"` otherwise; `TrimPrefix "/"` normalizes either shape), skips past it during version detection, and re-inserts it into both the swapped-version URL and the existing `not-in-version` fallback URL. Default-language consumers and single-language sites are unaffected: `site.LanguagePrefix` is empty, so the skip is zero and the URLs are byte-identical to before. This pairs with a consumer providing per-version landing/`not-in-version` pages in the translated tree (e.g. the docs hub adds Japanese `_index.md` + `not-in-version.md` for the untranslated agentgateway versions), so an older version that isn't translated lands the reader on a "this version isn't available in Japanese — view it in English" page (via `site.GetPage`, which resolves within the current language) instead of nowhere. Example of the broken pattern (open the version dropdown and pick an older version — it 404s today): [Solo Enterprise for agentgateway — 日本語 latest](https://docs.solo.io/agentgateway/ja/latest/).

### Sidebar

- **The left nav now renders on translated (non-default-language) pages instead of coming up empty.** The sidebar's enterprise URL-shape detection located the version segment by checking two fixed positions — `segments[2]` (production `/<product>/<version>/…`) and `segments[1]` (local dev `/<version>/…`). A non-default language inserts a `/<lang>/` segment after the product (`defaultContentLanguageInSubdir=false`), so on a Japanese page the URL is `/<product>/<lang>/<version>/…` and the version lands at `segments[3]` — a position the detector never tried. `$isVersionedDocs` stayed false, so the partial fell through to its non-versioned fallback (a tree rooted at the current page, which has no children) and the entire left nav rendered empty; English was unaffected because the default language carries no prefix and keeps the version at `segments[2]`. The detector now also checks `segments[3]`, and `$versionPrefix` (the published-URL prefix that `render-sidebar-tree`'s `hasPrefix` filter matches page permalinks against) is now built from the matched leading segments (`first (add $matchedIdx 1) $segments`) rather than reassembled from `$section`/`$currentVersion`, so it carries any product *and* language prefix — without that change the JA pages would pass version detection but then filter to nothing. `$lookupPath` stays `/<version>/` because `site.GetPage` is already language-scoped (each language's `contentDir` is `content/<lang>/<product>`). This is byte-identical for the default language and every single-language consumer: their version still matches at `segments[2]`/`segments[1]` and `$versionPrefix` rebuilds to the same string it did before (verified against an agentgateway build — EN `latest` sidebar unchanged at 94,006 bytes, JA `latest` now populated at 93,214 bytes with the active item marked, where it was empty before). Example of the broken pattern (a Japanese `latest` page with no left nav at all): [Solo Enterprise for agentgateway — 日本語 Token exchange](https://docs.solo.io/agentgateway/ja/latest/security/token-exchange/).

- **The left-nav label now comes from a page's `linkTitle`, so an author can give a long-titled page a short sidebar entry without shortening the page title.** `render-sidebar-tree` built each nav label (and the collapsible branch's toggle `aria-label`) from `.Title`, so the only way to shorten a sidebar entry was to shorten the H1/title itself — there was no separate handle for the nav label. Both spots now read `.LinkTitle | default .File.LogicalName` instead. This is behavior-preserving for every page that does not set `linkTitle`: Hugo's `.LinkTitle` returns the page's `linkTitle` front matter when present and otherwise falls back to `.Title`, so a page with no `linkTitle` renders the same label it did before, while a page that sets `linkTitle: Short label` gets the short form in the nav (the breadcrumb, page `<title>`, and auto-section cards still use `.Title`, so they are unaffected). The change is one line in two places in `layouts/partials/sidebar.html`; a consumer that keeps a local override of this partial (e.g. the docs hub carried one purely to make this swap) can drop the override once it picks up this version. New `sidebar-linktitle.spec.ts` plus a `linkTitle` on the `nav-group` fixture section (`linkTitle: Nav grp` / title "Nav group") and its child (`linkTitle: NG child` / title "Nav group child") guard all three behaviors: the leaf label, the section label and its toggle `aria-label`, and the `.Title` fallback for a sibling page that sets no `linkTitle`. Example of the pattern this addresses (a 66-character title that today fills the sidebar entry with no way to shorten just the nav label): [Gloo Mesh Enterprise — Tutorial: Federate clusters and isolate workloads for multitenancy](https://docs.solo.io/gloo-mesh-enterprise/latest/getting_started/multi/gs_bookinfo/).

- **The product logo no longer bleeds past the sidebar into the content gutter.** The sidebar logo was sized with `width: 108%` — a deliberate overscan meant to make the wordmark optically align with the text column. That pushes every logo 8% past the column's right edge, which is tolerable for most product logos but breaks on the widest one: the *Solo Enterprise for agentgateway* logo is ~5.7:1 (`3796×667`) versus ~4.3:1 for kgateway and ~3.9:1 for kagent, because the agentgateway and agentregistry SEF logos were generated in a different batch (single-line "SOLO ENTERPRISE FOR" label, height 667) than the kgateway/kagent/istio set (two-line label, height 672). All five logos carry the same 200-unit trailing margin in their viewBox, but on agentgateway that is only 5.3% of the width versus ~7% on kgateway, so the 8% overscan drove the actual `agentgateway` glyphs off the dark sidebar background and into the content area. Sizing-by-width was also making each product's wordmark a visibly different size (kagent rendered ~50% taller than agentgateway). The rule now sizes by a capped height (`max-height: 2.5rem`) with `width: auto; max-width: 100%`, so the widest logo binds on `max-width` and fits the column exactly while narrower logos bind on `max-height` and read at a consistent size. The mobile-panel override that re-forced `width: 100%` to undo the overscan is no longer needed and was removed (the breathing-room padding stays). Because a narrower logo no longer fills the column under the new sizing, `margin-inline: auto` centers it horizontally (the widest logo fills the column exactly, so its margins collapse to zero), matching the centered hairline below — otherwise the narrow logos sat left-aligned with dead space on the right. The logo is also centered vertically. The capped-height rule above set `display: block` on `.sidebar-product-logo img`, but that selector (specificity 0,1,1) outranks the `.sidebar-logo-dark { display: none }` toggle (0,1,0), so BOTH the light and dark variants rendered at once: the dark variant is light-on-light against the sidebar so it read as invisible, but it still occupied a logo-height row below the visible one, pushing the logo to the top of its block and dropping the hairline well below it. The `display` declaration was removed from the img rule (the light/dark toggle rules own `display`, and `margin-inline: auto` still centers the one visible block variant), the logo's `<a>` wrapper was set to `display: block` so it wraps the single image tightly, and the block's vertical padding was made symmetric so the logo sits centered between the navbar above and the hairline below. Example of the broken pattern (the `agentgateway` wordmark bleeding into the gutter in the sidebar): [Solo Enterprise for agentgateway — Token exchange](https://docs.solo.io/agentgateway/latest/security/token-exchange/).

### Alerts

- **Alert body text now renders at one size regardless of how the body was authored.** The global `.content p` and `#content > .content li` rules size block children to `1rem`, but a bare inline text node inside an alert fell back to the `.solo-alert` `0.9rem`, so the same alert looked like a different size depending on its body shape (markdown bullets vs literal `<ul>/<li>` HTML, vs a single inline sentence). The most visible case is two back-to-back alerts where the second one contains a list: the list-bearing alert rendered smaller than its plain neighbor. A new `.solo-alert-body, .solo-alert-body :where(p, ul, ol, li)` rule pins the body and its `p`/`ul`/`ol`/`li` children to `1rem`/`1.7` line-height so every alert matches. Example of the broken pattern (two consecutive alerts, list in the second): [Gloo Mesh Enterprise — LoadBalancerPolicy reference](https://docs.solo.io/gloo-mesh-enterprise/latest/reference/api/load_balancer_policy/#loadbalancerpolicyspec-config-consistenthashlb).

### Conditional text

- **`conditional-text` now keeps inline HTML intact when the block wraps a whole markdown table.** A `conditional-text` body that is a self-contained table (header + `|---|---|` delimiter + rows), as opposed to a single appended row, needs the opposite emit strategy from a row fragment: a row fragment must raw-emit so it joins the surrounding table's markdown stream, but a self-contained table must be rendered to HTML here and emitted via `safeHTML`. Raw-emitting a full table broke in two ways — angle form (`{{< >}}`) bypasses markdown entirely so the raw table never rendered and leaked as literal `| … |` text, and percent form (`{{% %}}`) nested inside another `RenderString` (a reuse'd conref) reparsed the table in a context that escapes inline HTML in cells, so `<ul><li>` sizing-list cells leaked as `&lt;ul&gt;`. A new `$isFullTable` check (a table-row body that *also* contains a delimiter line) routes these through `RenderString(display:"block")` + `flatten-rendered.html`, so the table always renders and cell HTML survives. New `fixture/assets/conrefs/test/cond-table-htmllist.md` fixture plus Case 3 (percent-form reused table) and Case 4 (angle-form table) in `cond-reuse-table.spec.ts` guard both the extras template and any consumer's local override. Example of the broken pattern (table cells with `<ul><li>` lists): [Gloo Mesh Enterprise — BYO external databases](https://docs.solo.io/gloo-mesh-enterprise/latest/setup/prod/databases/about-databases/#byo-external).

### Code blocks

- **`version` and `conditional-text` now emit a fenced code block inside a reused list step exactly once, instead of fragmenting it.** When either shortcode wrapped a fenced code block — e.g. a `{{% version %}}`- or `{{% conditional-text %}}`-gated `yaml`/`json` block inside a numbered step — the body took the `RenderString` path, which rendered the fence to `<div class="hextra-code-block">…<pre>` HTML *inside the shortcode*. When that already-rendered HTML was then re-parsed (the conref is pulled in by `reuse`/`rebase`, which runs a second `RenderString`), the parent saw the `<div>` as a CommonMark HTML block, closed the enclosing `<li>`/`<ol>` early, and re-wrapped the code guts in a `<p>`. The damage showed up two ways: an empty `hextra-code-block` wrapper orphaned outside the list (a fragmented code block with a dead copy button), or `</li></ol><p>` swept *inside* the `<pre>` (literal closing tags visible in the rendered code). A new `isFencedBlock` shape check — in `utils/inner-shape.html` (shared by `version` via `utils/emit-inner.html`) and inline in `conditional-text.html` — detects a body whose first non-blank line opens a fence (` ``` `/`~~~`) or a `prism` shortcode and raw-emits it instead, so the single outer `RenderString` builds a well-formed `<li>…<pre></li>`. Detection trims leading whitespace first, so a 2-digit step (`13. `, whose continuation indents 4 spaces) is caught too; angle-form safety is unchanged (`reuse.html`/`rebase.html` already rewrite the gated angle blocks to percent form before this runs). Example of the broken pattern (a `{{% version %}}`-gated YAML block in the "Add RBAC rules" step): [Solo Enterprise for kgateway — JWT provider example](https://docs.solo.io/kgateway/2.1.x/security/jwt/provider/). Example via `conditional-text` (gated `kubectl apply` YAML steps): [Gloo Mesh Gateway — OPA server as a sidecar](https://docs.solo.io/gloo-mesh-gateway/latest/security/external-auth/opa/opa-sidecar/). Guarded by `fixture/assets/conrefs/test/cond-reuse-fence.md` (a percent-gated fence in a numbered step) reused as Case 5 of the `cond-reuse-table` fixture, so `built-html-integrity`'s fragmented-code check catches this fragmentation on the fixture build.

- **The `prism` shortcode is deprecated and will be removed in a future release — use a fenced code block instead.** `prism` is a lotus-legacy compatibility stub (`{{< prism lang="yaml" line="9" >}} … {{< /prism >}}`) that just maps onto Hugo's built-in Chroma highlighter, so a fenced ` ```yaml {hl_lines=[9]} ` block produces byte-identical highlighted output. The stub is also actively harmful inside reused content: because it emits already-rendered `<pre>` HTML (rather than native markdown), a `prism` block inside a reused numbered step breaks list continuation the same way described above — the `<p> inside <pre>` failure — whereas a fenced block in the same spot is parsed in-context and renders cleanly. Consumers should migrate `{{< prism lang="X" line="a,b,c" >}}` to ` ```X {hl_lines=[a,b,c]} ` (ranges like `30-31` become `{hl_lines=["30-31"]}`); the reference consumer (the docs hub) has migrated all 210 usages. The stub remains in `layouts/_shortcodes/prism.html` for now — no other consumer references it — and carries a removal reminder at the top of the file. Example of a former `prism` block (line-highlighted JSON access-log "Example output") now rendering via a fenced block: [Gloo Mesh Enterprise — Mirroring](https://docs.solo.io/gloo-mesh-enterprise/latest/traffic_management/mirror/).

### Diagrams (Mermaid)

- **The Mermaid loader now actually overrides Hextra's, and pins the Mermaid version instead of tracking `@latest`.** `docs-theme-extras` shipped its Mermaid loader at `layouts/partials/scripts/mermaid.html`, but Hextra v0.12+ resolves partial overrides from `_partials/` — so the file was silently shadowed and **Hextra's built-in loader ran instead** on every consumer, which also meant extras' dark-theme actor/note color fix (added so `sequenceDiagram` participant labels stay legible) was dead the whole time. The loader moved to `layouts/_partials/scripts/mermaid.html`, where it wins over Hextra's (the same chain that lets the centralized sidebar/TOC override Hextra). Separately, both the extras and Hextra defaults loaded `https://cdn.jsdelivr.net/npm/mermaid@latest/dist`, so every visitor pulled whatever version jsdelivr was currently serving at their CDN edge — meaning a render regression in a freshly published `@latest` is invisible to anyone holding an older cached copy and impossible to reproduce on demand. The default is now pinned to `mermaid@11.15.0` (verified to render the agentgateway diagrams correctly); the loader still self-copies, fingerprints, and SRIs the file, and a consumer can still override with `params.mermaid.base`/`params.mermaid.js`. (The pin is hygiene against `@latest` drift, not the fix for the corner-collapse render bug — that is the next entry.) Example page whose diagrams this loader renders: [Solo Enterprise for agentgateway — Token exchange](https://docs.solo.io/agentgateway/latest/security/token-exchange/).

- **Mermaid diagrams no longer render as a microscopic speck in the top-left corner of an empty box in Chrome and Firefox.** Mermaid sizes the SVG from a `getBBox()` call during init, and in Blink (Chrome) and Gecko (Firefox) `getBBox()` *includes a `<foreignObject>`'s declared width* — so when Mermaid measures while a temporary text-measurement `foreignObject` still carries an oversized sentinel width, it bakes a `viewBox` (and matching inline `max-width`) up to ~16× the real content (`~16482×16434` vs the true `~997×290`). The browser scales that mostly-empty canvas down to fit the container, stranding the real diagram in the corner. WebKit (Safari) excludes the `foreignObject` width, so it is unaffected; a clean headless Chromium also renders correctly, which is why this is per-machine intermittent and slips past review. The loader now runs a post-render pass that recomputes each diagram's `viewBox` and `max-width` from its real `getBBox()` once the temporary elements are gone — guarded to act only when the declared `viewBox` is more than 1.5× the measured content, so correct renders are left untouched. As a secondary measure, rendering is deferred (`startOnLoad: false` + a `requestAnimationFrame`/`visibilitychange` gate) so the measurement runs on a painted tab and `document.fonts.ready` has resolved; this also closes a latent race where the `dataset.original` capture could store an already-rendered SVG. `htmlLabels: false` (the upstream-suggested fix) was tried first but does not disable `foreignObject` for these diagrams on the pinned Mermaid, and there is no newer 11.x to upgrade to, so the recompute is the durable fix. Example of the affected diagrams: [Solo Enterprise for agentgateway — Token exchange](https://docs.solo.io/agentgateway/latest/security/token-exchange/).

- **The raw Mermaid graph source no longer flashes before the diagram renders.** Deferring the render (above) widened the window in which a `<pre class="mermaid">` still shows its literal source (`graph LR …`) before Mermaid replaces it with the SVG, which looked broken. A new CSS rule in `docs-theme-extras.css` hides the unprocessed source — `pre.mermaid:not([data-processed]) { visibility: hidden }` — so the SVG simply replaces an empty space (Mermaid sets `data-processed` once it renders). The element keeps its box, and because Mermaid rendering requires JS here, a never-processed block staying hidden is acceptable. Same page as above: [Solo Enterprise for agentgateway — Token exchange](https://docs.solo.io/agentgateway/latest/security/token-exchange/).

### Table of contents (TOC)

- **A long "On this page" list no longer scrolls behind, and visually overlaps, the "Scroll to top" footer.** The `.solo-toc-bottom` footer was `position: sticky; bottom: 0` *inside* the scrollable `.solo-toc-inner` with a transparent background (see the v0.1.1 entry that made it transparent for brand-matching), so on a page with enough headings the TOC links scrolled up *behind* the footer and bled through it — the footer text and the heading links rendered on top of each other. `.solo-toc-inner` is now a `display: flex; flex-direction: column` container where only the top-level heading list (`.solo-toc-inner > .solo-toc-sublist`) is the scroll region (`flex: 1 1 auto; min-height: 0; overflow-y: auto`), and the "On this page" heading and the footer are pinned as fixed `flex-shrink: 0` rows. Nothing scrolls behind the footer anymore, so the overlap is structurally impossible regardless of brand background — which also retires the v0.1.1 tradeoff (no solid-fill fade needed, because links no longer pass behind it). The `head-end.html` scroll-spy now scrolls that list element instead of the whole container, and its `getStickyFooterHeight()` reservation workaround (added only to dodge the old overlap) was removed. Example with a long enough TOC to have triggered the overlap (65-entry TOC): [Solo Enterprise for kagent — kagent API reference](https://docs.solo.io/kagent/latest/reference/api/kagent/).

### Sidebar

- **The desktop left nav is now a pinned, independently scrolling rail, mirroring the right-hand TOC, instead of scrolling with the article.** Previously the sidebar had no internal scroll — it grew with its tree and moved with the page, so on a deep section you scrolled the whole document just to reach a lower nav entry. At `min-width: 1280px`, `.sidebar-container` is now `position: sticky; top: var(--solo-rail-top); max-height: calc(100vh - var(--solo-rail-top) - env(safe-area-inset-bottom)); display: flex; flex-direction: column; overflow: hidden`; the product logo stays pinned as a `flex-shrink: 0` row and `.sidebar-nav-wrapper` is the scroll region (`flex: 1 1 auto; min-height: 0; overflow-y: auto`) with the same thin scrollbar Hextra gives the TOC. The `display: flex` wins over the aside's `hx:xl:block` because `docs-theme-extras.css` loads after Hextra's CSS at equal specificity. The `< 1280px` mobile slide-in panel is untouched. Example with a long left nav that stays put while the article scrolls: [Solo Enterprise for kagent — Observability](https://docs.solo.io/kagent/latest/observability/).
- **Both side rails now stay fully pinned the moment you scroll the content — they no longer drift up by the announcement-banner height first.** The sidebar and TOC stuck at a hardcoded `top: 4rem` (the navbar height alone), but Hextra's sticky `.hextra-nav-container` is the navbar *plus* the announcement banner (`--navbar-height` + `--hextra-banner-height` = 4rem + 2rem = 6rem on the docs hub, where the nav container measures 96px). So both rails — including the sidebar's product logo — started 32px below where they stuck and slid up under the navbar by exactly the banner height as the page scrolled, reading as a small "logo drift." A new `--solo-rail-top: calc(var(--navbar-height, 4rem) + var(--hextra-banner-height, 0rem))` is now the sticky `top` (and is subtracted in each rail's `max-height`, so a long rail's bottom no longer extends a banner-height below the viewport). It self-adjusts: with no banner the `0rem` fallback leaves it at the navbar height. Measured drift dropped from 32px to 0 on the docs hub and the extras fixture. Example where the drift was visible on first scroll: [Solo Enterprise for kagent — Observability](https://docs.solo.io/kagent/latest/observability/).
- **Expanded left-nav sections no longer persist across tabs or survive a refresh — the expand state is now scoped per tab.** The sidebar remembers which branches you've expanded so they stay open as you navigate (the multi-section-expand behavior), but that state was written to `localStorage` under `solo-sidebar-expanded`, which is shared across every tab on the origin and never expires. Two failures followed: a new tab loaded the full saved set, so the nav never looked fresh; and the "clear on hard refresh" escape hatch (`localStorage.removeItem` gated on `performance.getEntriesByType('navigation')[0].type === 'reload'`) was unreliable because any *other* open tab still held the in-memory `state` object and re-wrote the shared store the moment you navigated there, clobbering the reset. The three storage calls in `head-end.html` now use `sessionStorage` instead, which scopes the expanded set to a single tab: a fresh tab starts clean, state can't bleed across tabs, and — with no shared store for another tab to re-populate — the reload-clear now works reliably, so a refresh resets to just the current page's server-rendered ancestors. In-tab navigation still preserves manually expanded sections, and this also makes the expand-state store consistent with the adjacent scroll-position block, which already used `sessionStorage`. (One residual: a Cmd/middle-click that opens a sidebar link in a new tab copies the originating tab's `sessionStorage`, so that specific tab inherits the expanded set; a tab opened by URL does not.) Example with a deep left nav where the cross-tab/refresh stickiness was observable: [Gloo Mesh Enterprise — External Redis](https://docs.solo.io/gloo-mesh-enterprise/latest/setup/prod/databases/byo-external-redis/).
- **The left nav now keeps its scroll position across page navigations.** Because the site is static — every nav link is a plain `<a href>`, so each click is a full page reload that re-renders the sidebar from scratch — the newly independent scroll region (above) would otherwise snap back to the top on every click, dropping the reader at the top of a long nav after clicking an entry near its bottom. `head-end.html` now saves `.sidebar-nav-wrapper`'s `scrollTop` to `sessionStorage` on `pagehide` and restores it on the next load (after the expand/collapse state is applied, so the tree is at full height, and before the existing rAF reveal), so the scrollbar stays exactly where it was while the brand-new content pane lands at the top. The `html.sidebar-loading … { visibility: hidden }` reveal rule was extended to `.sidebar-nav-wrapper` — it previously matched only Hextra's `.hextra-scrollbar`, which the centralized sidebar doesn't have, so our rail was never part of the flash-prevention window — making the restore flicker-free. Back/forward navigations restore scroll natively via the browser's bfcache and skip this path. The position is remembered tab-wide (one `sessionStorage` key), not per-section, so navigating to a page whose nav is shorter than the saved offset clamps to that page's maximum. Example with a long left nav where the saved position matters: [Solo Enterprise for kagent — kagent API reference](https://docs.solo.io/kagent/latest/reference/api/kagent/).

---

## [v0.1.3] — 2026-06-08

### Version and conditional-text shortcodes (centralized)

- **Shape detection and emit strategy are now shared between the `version` and `conditional-text` shortcodes instead of being copy-pasted into each.** Both shortcodes have to dispatch on the *shape* of `.Inner` (Hugo doesn't expose whether a block was called in `{{% %}}` or `{{< >}}` form), and the two copies had drifted — a fix landed in one and not the other. The detection and emit logic moved into four new partials under `layouts/_partials/utils/`: `inner-shape.html` (trailing-step / dedent / has-markdown / block / row-content classification), `has-markdown.html` (the inline-markdown heuristic — `**bold**`, inline `` `code` ``, lowercase HTML tags, list markers, `[text](url)` links), `emit-inner.html` (the version shortcode's raw / block / inline emit selector), and `flatten-rendered.html` (collapses rendered HTML newlines to `&#10;` so the output doesn't break an enclosing list, with the `<pre>`/`<script>`/`<style>`/copy-button bypasses preserved). `version.html` dropped from ~133 lines to ~64 by delegating to these; `conditional-text.html` shares the detection regexes and `page-context` resolution but deliberately keeps its own emit path (its raw-emit set differs from version's, and routing a list/table body through `emit-inner` would leak on the rebase re-render). The net behavior is intended to match the proven docs-hub local overrides — this is a de-duplication, not a behavior change.
- **`utils/page-context.html` moved from `layouts/partials/` to `layouts/_partials/`.** Hextra v0.12+ resolves overrides from `_partials/`; a partial left under the old `partials/` path is silently shadowed, so both shortcodes' `partial "utils/page-context.html"` calls were at risk of resolving the wrong file. (Internal; no consumer action.)
- **`conditional-text` now renders block content (headings, fenced code, tables) correctly instead of escaping it.** Before centralization the shortcode only ever rendered its body inline, so a `{{< conditional-text >}}## Heading …{{< /conditional-text >}}` escaped to literal `## …` text. The shared `inner-shape` partial flags a body that leads with a block marker, and the shortcode renders it with `display:"block"`. New `tests/conditional-block.spec.ts` and the `fixture/content/en/test/v2/block-direct.md` fixture cover the block-content shapes.
- **`conditional-text` table-row, trailing-step, and dedent paths restored.** An earlier centralization pass had dropped these, which regressed the docs hub's heavy "gme vs gmg" conditional content: a `conditional-text` block spanning a numbered-list step boundary broke the surrounding list and leaked the following fenced code block as raw ```` ```text ````, and a conditional table row containing a nested `{{< reuse >}}` had the reuse's rendered inline HTML (`<code>`, `<a>`) escaped to `&lt;code&gt;`. The `isTableRow` test now anchors on the *first* non-blank line (a numbered-list step that merely *contains* a markdown table is a list, not a table row, so it raw-emits the whole step rather than routing through the row path). New `tests/cond-reuse-table.spec.ts` and `fixture/content/en/test/v2/cond-reuse-table.md` guard both failure modes.
- **`version` trailing-step detection no longer gates on "has a heading/fenced code".** That guard (added to fix a kgateway session-persistence leak) regressed the docs hub: a percent-form `{{% version %}}` glued to a closing code fence (e.g. `` ```{{% version %}} `` across ~70 istio/gme pages) was forced to render-as-block, so its `<ol>` HTML glued straight after the ` ``` ` and the fence never closed — leaking `` ```<ol start="3"> `` into the code block. Because `reuse.html`/`rebase.html` already rewrite the angle-form shapes the guard was protecting, it was removed; both consumers verified leak-free. A second trigger was added for a trailing bare orphan marker (a body that closes on the next step's `3.` marker). The `<pre>` flatten bypass that used to live inline in `version.html` now lives in `flatten-rendered.html`.

### Tabs

- **Hextra tab toggle buttons no longer collapse to run-together text under a consumer's Tailwind Preflight.** Hextra v0.12.3 styles its tab `<button>` toggles entirely with `hx:` utilities in `@layer utilities`. A consumer whose local Tailwind build emits an unlayered Preflight (`button { padding: 0; margin: 0 }`, `* { border-width: 0 }`) overrides those layered utilities — unlayered declarations beat layered ones — so the tab bar rendered as plain text with no padding, spacing, or underline. `docs-theme-extras.css` now re-asserts the toggle styling as plain unlayered `.hextra-tabs-toggle` rules (padding, bottom-border, hover and `[data-state="selected"]` accent via `var(--theme-primary)`, plus dark-mode variants) so it survives any consumer Preflight. Only the buttons are restyled; the panels are `<div>`s untouched by the button reset, so Hextra's own show/hide still works.

### Card shortcode

- **The card-image fixture's "external URL" card now points at a real, published image instead of a deliberately non-existent file.** The fixture previously used a raw-GitHub URL to a file that does not exist, which 404s by design — the spec only asserts the `src` passes through verbatim and never fetches it. But a manual visual scan of the `everything` page showed a broken image, which reads as a real defect. The new URL renders, so the scan stays clean; `tests/card-image.spec.ts` asserts the new literal `src`. (Fixture/test only — no shortcode behavior change. Tradeoff: the rendered image is now network-dependent, so an offline visual scan still shows it broken.)

### Framework tests / leak scanner

- **The markdown-leak scanner (`tests/helpers/markdown-leaks.ts`) gained three leak kinds.** `escaped-html` catches escaped block HTML that survived into body text (`&lt;div&gt;&lt;figure&gt;…`) — the shape a `reuse-image` or nested `{{< reuse >}}` produces when its output is fed through an inline `RenderString` and Goldmark HTML-escapes the tags (the kgateway "Debug your gateway setup" figure leak; the `applyToRoutes`/api-key `<code>`→`&lt;code&gt;` cell leak). It's scoped to a curated set of structural/embed/inline tag names the theme's own shortcodes emit, so a positive match is almost always a real escaping bug rather than an author writing about a tag in prose. `raw-bold` catches unrendered `**bold**` in visible body text (the fault-injection `**Abort**` / insights `**Dashboard**` leaks, where a broken parent list dropped the next step's bold lead-in to literal text). `shortcode-placeholder` catches Hugo's internal `hahahugoshortcode…` token, which only appears when a shortcode failed to be replaced.
- **`smoke.spec.ts` gained a `codeBlockIntegrity` check group**, separated from the markdown/shortcode-leak checks behind its own `checks.codeBlockIntegrity` CONFIG toggle (default on). It flags a fragmented code block — a `<div class="hextra-code-block …">` wrapper immediately followed by a closing `</li>`/`</ol>`/`</ul>`/`</p>` instead of its expected inner `<div><pre>` — which is the structural signature of a fenced block inside a list item being re-parsed by the rebase/reuse/`{{% tab %}}` chain, orphaning the wrapper and breaking the list. A consumer with a known backlog of these can disable just this group while keeping the docs-fixable leak checks fatal. The per-sample markdown-leak scan also now honors a per-consumer `allowlists.markdownLeaks` array (exposed as `target.markdownLeaksAllowlist`).
- **New static specs registered in `playwright.config.ts`:** `conditional-block.spec.ts` and `cond-reuse-table.spec.ts` (both fixture-only, self-skipping on consumer targets that lack the v2 fixture pages). `auto-cards.spec.ts` was updated to register the new `block-direct` fixture page so its page-list expectations stay correct.

---

## [v0.1.2] — 2026-06-03

### Sidebar

- **Mobile deployment/section-switcher chips now point at a version that exists in the target section, instead of blindly reusing the current page's version.** The `.sidebar-mobile-section-row` built every chip's href as `/docs/<section>/<currentVersion>/`, which assumes the same version number is published in every section. That holds when a site's sections share a version axis, but not when they diverge: agentgateway's `kubernetes` section ships `1.0.x`/`1.1.x`/`2.2.x`/`latest`/`main` while its `standalone` section ships only `latest`/`main`. So the "Standalone" chip on any `kubernetes/1.1.x` page produced `/docs/standalone/1.1.x/`, a 404. The chip for the *current* section is unchanged (the page it links to always exists); for *other* sections the template now resolves the target version from that section's own `versions` config: prefer an exact `linkVersion` match, then a `latest` entry, then the first configured version. So from `kubernetes/1.1.x` the Standalone chip now lands on `/docs/standalone/latest/`, while exact matches (`latest`↔`latest`, `main`↔`main`) are preserved in both directions. Sections with an `externalURL` are unaffected (their href is overridden after this resolution), and the row only renders for OSS-shape sites, so the enterprise hub is untouched.

---

## [v0.1.1] — 2026-06-02

### Table of contents (TOC)

- **"Scroll to top" footer background is now transparent so it matches every brand's page background.** The `.solo-toc-bottom` sticky footer hardcoded a fill color (`white` in light mode, `#030712` in dark) plus a matching `box-shadow` fade. That dark hex only matched agentgateway (whose dark background is `#030712`); on kgateway, whose dark background is Hextra's default `#111`, it rendered a visible blue-tinted box behind the "Scroll to top" button. Because the two brands use different dark backgrounds, no single hardcoded hex works. The footer now uses `background: transparent`, which reveals whatever each consumer paints behind it (kgw `#111`, agw-oss `#030712`, light-mode white). Tradeoff: the solid-fill fade for TOC links that scroll behind the sticky footer is gone; the `border-top` still separates it from the list.
- **"Scroll to top" button no longer flashes visible on page load.** The centralized `toc.html` re-created Hextra's `#backToTop` button but dropped the initial `hx:opacity-0` class and `tabindex="-1"` that the stock Hextra template ships with. As a result the button painted fully visible on first load, then Hextra's bundled `main.js` scroll handler hid it the moment the reader scrolled while still near the top (`scrollY <= 300`), and revealed it again past 300px — a show/hide/show flicker. The button now starts with `hx:opacity-0` and `tabindex="-1"`, matching Hextra's design, so it stays hidden until the reader scrolls down. `.solo-toc-back-to-top` also gains an `opacity` transition so the reveal fades rather than snaps.

### Sidebar

- **Mobile version-switcher chips now generate correct URLs for enterprise products.** The cached v0.1.0 build on the Go module proxy contained an older version of `sidebar.html` in which the mobile version-row always emitted `/docs/<section>/<version>/` hrefs regardless of URL shape. For enterprise products whose `baseURL` is `/<product>/` (not `/docs/…`), this produced broken links such as `/docs/test/v2/` instead of `/test/v2/`. The template now branches on `$isOSSShape`: OSS products (`/docs/<section>/…` URLs) keep the existing `/docs/…` form; enterprise products emit `/<section>/<version>/…`; and local-dev builds (no product prefix) emit `/<version>/…`. 
- **Mobile version chips now match the desktop version dropdown exactly — same versions, same destinations.** The mobile version-row previously filtered `site.Params.versions` down to current-product entries only, so cross-product versions that the desktop navbar dropdown lists (e.g. the `kgateway` and `edge` entries under `gateway`, or the `istio` entries under `gloo-mesh-enterprise`) were silently dropped from the slide menu. A reader switching versions on a phone saw a shorter list than on a laptop, and never reached the other products' docs. The mobile row now mirrors `navbar.html`: it keeps every visible entry, routes same-product entries through the version-swap (with the `not-in-version` fallback) and cross-product entries to their configured `.url`, and renders `productName` group headers when more than one product is represented so same-labelled versions across products (e.g. `gateway` 1.20.x vs `edge` 1.20.x) are disambiguated. The active highlight is now scoped to the current product's matching version, so a cross-product entry sharing a `linkVersion` no longer lights up. New group-header styling: `.sidebar-mobile-version-group`. A `static.spec.ts` guard now asserts the mobile chip hrefs equal the dropdown hrefs (same order) on every versioned page, so the two link-builders can't drift apart again.

### Navbar

- **The navbar version dropdown is now hidden below 1280px on pages that have a mobile slide-out sidebar, so the version switcher no longer appears in two places at once on phones and tablets.** The `.version-dropdown` in `navbar.html` rendered at every width, while below `xl` (1280px) the slide-out sidebar already provides its own version switcher (`.sidebar-mobile-version-row`). A reader on a phone or tablet therefore saw the same control twice: once in the top nav, once in the left slide-out menu. A new `@media (max-width: 1279px)` rule scoped to `body:has(.sidebar-mobile-panel)` hides the navbar dropdown across that range, leaving the slide-out row as the single mobile switcher. The dropdown still shows on desktop (≥ 1280px), where there is no slide-out, and the `:has()` scope keeps it as the only switcher on landing / non-docs pages that have no slide-out panel. The 1279px bound matches the existing `.sidebar-mobile-panel` breakpoint. Only the docs hub renders the navbar `.version-dropdown` today, so kgateway (its own navbar, which renders no `.version-dropdown`) and agentgateway (a separate `nav.html`) are unaffected.
- **Search is now reachable on mobile from the navbar drawer.** Hextra hides the navbar search below `md` (`nav .hextra-search-wrapper { display: none }`) because stock Hextra relocates search into its own mobile menu, which the centralized `navbar.html` does not use — so on phones there was no way to search from the top nav. `navbar.html` now renders the `search`-type menu entry once at the top of `#mobile-icons-menu` (wrapped in `.solo-mobile-drawer-search`), and the loop that fills the rest of the drawer skips `type "search"` so it is not emitted twice. A CSS rule re-shows it: `#mobile-icons-menu .hextra-search-wrapper { display: block }` — the ID selector (specificity 100) beats Hextra's `nav .hextra-search-wrapper` (11) without `!important`. At ≥ 768px the drawer's parent is `hx:md:hidden` (`display: none`), so the re-shown wrapper never produces a second *visible* search box on desktop, keeping exactly one for Hextra's `getActiveSearchElement()`. A `viewport.spec.ts` guard asserts mobile search is reachable and that exactly one active search wrapper results. (Enterprise products needed a follow-up fix where the wrapper resolved but rendered empty.)
- **Mobile drawer items now show visible text labels, not icon-only controls.** The theme-toggle and social/link icons in `#mobile-icons-menu` previously rendered icon-only with an `hx:sr-only` (screen-reader-only) label, so a sighted reader on a phone saw a column of bare icons with no text. Each item is now a `hx:flex` row with the icon (`hx:shrink-0`) plus a visible `<span>` label; the drawer container switched from `hx:items-center` to `hx:items-stretch` so the rows fill its width. The theme-toggle gains a `toggleTheme` i18n string (falling back to "Toggle theme") used for both its `aria-label` and the visible label.

---

## [v0.1.0] — 2026-05-29

### Version cards (new)

- **`{{< version-cards >}}` shortcode renders a grid of version-chooser cards** sourced from the consumer's `site.Params.versions` config. Each card emits the same `section-card` markup as `{{< card >}}`, so the visual treatment matches manually authored cards and the auto-generated child-page grid. The shortcode honors a `dropdown` label override per entry and falls back to the `version` string when `dropdown` is unset. Empty labels are skipped so a placeholder row in the config does not produce a blank card.
- **Cross-product href handling.** Entries whose `product` field does not match `site.Params.currentProduct` use the explicit `url` field rather than the current page's base permalink. This mirrors the navbar version-dropdown logic so a docs-hub kgateway config that lists pre-2.0 versions whose content lives under `/gateway/` produces cards that point at the right product path instead of 404-ing under the current product. Same-product entries (and builds without a `currentProduct` set) keep the original `<currentBase>/<linkVersion>/` form so dev and preview baseURLs stay relative.
- New `tests/version-cards.spec.ts` regression guard covers label resolution, empty-label skipping, and the same-product vs cross-product href paths.

### Version shortcode

- **Table-row gating works on both reuse and rebase paths.** An inline `{{< version include-if=... >}}| row content |{{< /version >}}` (or the `{{% %}}` equivalent) wrapping a single markdown table row now renders as a real `<tr>` with parsed cells on both the direct `{{< reuse >}}` path and the `{{< rebase >}}` path. Previously, angle-form authors got a single `<td>` with literal pipes leaked as text inside it, and percent-form authors got the row spilling out of the table as a `<p>` on rebased pages. A narrow preprocessing step in both `reuse.html` and `rebase.html` rewrites the inline angle-form table-row block to percent form so the shortcode output reaches the markdown stream before Goldmark parses the table. The pattern is restricted to single-line invocations where both tags sit on the row line and the content begins and ends with `|`. Multi-line forms (tags on their own lines), nested-list bodies, and fence-adjacent uses are unaffected.
- **`keepVersion="true"` and other extra args are honored.** The table-row regex extends past the closing quote of `include-if`/`exclude-if` so any extra version-shortcode args (currently `keepVersion`, plus future params) stay inside the rewritten percent block.
- **List-item gating no longer leaks.** A `{{< version include-if=... >}}* item{{< /version >}}` (or `{{< version >}}\n* a\n* b\n{{< /version >}}`) wrapping list-item content now renders as real sibling `<li>` elements that merge with neighbouring bullets on both the reuse and rebase paths. Previously the angle-form output left the `* [link](url)` marker as literal text inside the surrounding `<li>` (the `kgateway.dev` JWT-snippet leak, the docs-hub `policy-merging.md` "Merging examples" leak, the agentgateway `bedrock.md` optional-SSO step). Mirrors the table-row fix: a narrow preprocessing step in `reuse.html` and `rebase.html` rewrites the block to percent form when the inner content starts with a list marker at column 0, and `version.html` raw-emits for first-non-blank-line list-marker content so percent-form re-flow produces real bullet items.
- **Multi-row percent-form `{{% version %}}` blocks in tables render as real `<tr>` rows.** Previously a percent-form version wrapping a header-less table-row fragment (e.g. `{{% version %}}|`x`|y|\n|`z`|w|{{% /version %}}` in the middle of a metrics table) was routed to `RenderString` because backticks in the rows tripped the `$hasMarkdown` check; the standalone render produced `<p>|<code>…</code>|</p>` paragraphs that escaped the parent `<table>` (the Solo docs-hub istio `pipeline-metrics.md` leak that broke the entire metrics table for 1.29.x/1.30.x). `version.html` now detects `.Inner` whose every non-blank line is a pipe-delimited row and raw-emits, letting the percent-form re-flow drop the rows into the parent table's `<tbody>`. Restricted to inputs where every non-blank line is a row, so prose with stray pipes is unaffected.
- New `tests/version-table-row.spec.ts` regression guard covers percent form, angle form, `keepVersion`, and the per-cell pattern across both `everything` (direct reuse) and `rebased` pages. Drift in any of the four shapes fails the suite.

### Card shortcode

- **`{{< card link=… >}}` resolves nested shortcode calls passed in the `link` argument.** Backtick-quoted args are raw strings in Hugo, so a `link=`​`` `{{< link path="foo" >}}` ``​` value reached the `href` attribute unexpanded and rendered as literal text. `card.html` now detects the `{{<` pattern, evaluates the value through `RenderString`, and trims the result before assigning it to `href`. Plain string links (`link="/foo/"`) take the same fast path as before.
- **`image` arg resolves `assets/`-relative paths through the asset pipeline.** A bare `image="assets/img/x.png"` was emitted as a page-relative `<img src>` and 404'd (Hugo doesn't publish `assets/` directly). `card.html` now runs non-URL image values through `resources.Get` (stripping a leading `assets/`) and uses the published `.RelPermalink`; external (`http…`) and absolute (`/img/…`, served from `static/`) values are unchanged.

### Sidebar

- **Tablet sidebar is reachable again (768–1279px, e.g. iPad Pro).** The theme navbar now renders its own `.solo-sidebar-mobile-trigger`, so consumers that use the theme navbar (the docs hub, the fixture) get a working sidebar opener in the tablet band. Previously only the wired `.hextra-hamburger-menu` toggled the sidebar, and it is `md:hidden` (gone at ≥ 768px) while the persistent sidebar doesn't return until `xl` (1280px) — leaving 768–1279px with no way to open the left nav. The trigger is rendered `hidden` and revealed by `themeExtras/head-end.html` only when a `.sidebar-mobile-panel` exists on the page, so landing / non-docs pages don't show a dead button; it is scoped to the tablet band (below 768px the hamburger still covers it, at/above 1280px the sidebar is visible). Consumers with their own navbar (kgw, agw) already render this trigger themselves and are unaffected.
- New regression guard in `tests/viewport.spec.ts` asserts that below the 1280px breakpoint a visible sidebar opener (`.solo-sidebar-mobile-trigger` or `.hextra-hamburger-menu`) exists on version pages, so the tablet dead zone can't return silently.
- **Product logo no longer overflows the mobile slide-in panel.** `.sidebar-product-logo img` uses `width: 108%` as a deliberate overscan in the desktop sidebar, but the slide-in panel is a fixed 280px, so the logo overflowed and crowded against the right edge. Below `xl` the logo is now constrained to the panel width with symmetric horizontal padding (centered with breathing room); the desktop sidebar keeps its overscan.

### Framework tests

- New `tests/card-image.spec.ts` (static). Guards the card shortcode's `image` attribute against the 404 regression: the fixture's `everything` page renders one card per author form (`assets/`-prefixed, prefix-less asset-relative, root-absolute static, external `http`), and the spec asserts the asset-relative cards resolve to a file that actually exists in the built output (the on-disk equivalent of "doesn't 404"), the root-absolute card points at a real published static file, and the external URL is passed through verbatim. A belt-and-suspenders check fails on *any* card-image `src` that is neither `http` nor root-relative, so a future regression is caught even if the markered fixture cards are renamed. (Registered in the `static` project's `testMatch` in `playwright.config.ts`.)
- New `tests/viewport.spec.ts` guard "sidebar logo stays within its container below xl". Below 1280px the sidebar product logo's rendered edges must stay inside its container (edge comparison, not width — container padding can mask a width overrun while the logo still pokes past the edge). Runs only below `xl` so the intentional desktop 108% overscan doesn't false-positive, and self-skips when no `site.Params.sidebar.logo` is configured (the OSS fixture leaves it unset on purpose; the enterprise fixture and the docs hub both set it, so they exercise it). Both new guards were mutation-verified — reintroducing the original CSS / template bug turns them red.
- New `tests/dev-build.spec.ts` (static). Guards against running the harness over a `hugo server` dev build: such builds inject a LiveReload client (`/livereload.js?…port=1313…`) into every page, which 404s under the test's static server and otherwise produces hundreds of near-identical `console.error: Failed to load resource: 404 /livereload.js` failures. This spec collapses that into one clear, actionable failure ("this build was produced by `hugo server`; rebuild for production"), and the matching 404 is now in `console-errors.spec.ts` `BUILTIN_NOISE` so the signal surfaces once here instead of per page. A real production build has no LiveReload injection and the spec passes. (Registered in the `static` project's `testMatch`.)
- **`console-errors.spec.ts` `console.error` messages now carry the failing resource URL.** Chromium's "Failed to load resource: … 404" console message has no URL in its text (the URL is only on the message's `location`), so a URL-scoped allowlist/`BUILTIN_NOISE` pattern (e.g. the new `/livereload\.js/`) could never match the `console.error` channel — only the parallel `response` 4xx channel. The handler now appends `msg.location().url`, so failed-resource console errors are both actionable in the report and suppressible by URL.
- **`console-errors.spec.ts` now includes the error stack when matching uncaught exceptions against the allowlist.** Previously only `err.message` was matched, so suppressing a vendored-bundle error (e.g. Hextra's `main.min.js` dereferencing `.hextra-sidebar-container` with no null guard, which throws "Cannot read properties of null (reading 'removeAttribute')" on every sidebar-less page) meant allowlisting a generic message site-wide — which would also hide that error from the theme's or the consumer's own code. With the stack in the matched string, a consumer can scope the suppression to the originating source file (e.g. `reading 'removeAttribute'\)[\s\S]*main\.min\.[0-9a-f]+\.js`). The stack also now appears in the failure report for un-allowlisted errors.
- New `tests/markdown-leaks.spec.ts` and `tests/helpers/markdown-leaks.ts`. Scans every rendered HTML file under `target.builtRoot` for five classes of markdown that survived into the output: literal `[text](url)` link syntax, table-row pipe leaks (cell content opening with `|`), stray shortcode delimiters, empty list items (scoped to an `<ol start=N>` whose only child is an empty `<li>` — the orphan-step-marker leak shape — so version-gated and code-only items don't false-positive), and unconverted triple-backtick code fences (a ``` ``` ``` that survived as body text instead of becoming a Chroma `<pre><code>` block). Reports offenders by file with matched substring and surrounding context. Catches the *general* class of "the parser didn't recognize my markdown" — not just shapes we wrote fixtures for. Per-consumer false-positive allowlist via the new `allowlists.markdownLeaks` array in the CONFIG TOML. Toggle off with `checks.markdownLeaks = false` if you don't want the scan.
- **Scanner skips api-kubespec field-description blocks (`<div class=ks-rich-block>…</div>`).** The api-kubespec generator emits CRD descriptions verbatim into these containers without running them through Goldmark, so any `[text](url)` the upstream API author wrote shows up as literal text by design — the same source renders as a real `<a>` on the docs-hub Goldmark path, so the agw-oss api-kubespec display is intentional "JSON-like" structure rather than a render failure. Handles both `class="ks-rich-block"` and the minified-HTML `class=ks-rich-block` (unquoted) forms.
- New `tests/console-errors.spec.ts`. Opens every built page in Chromium and fails on uncaught JS exceptions (`pageerror`), explicit `console.error` logging from theme or third-party JS, and HTTP 4xx/5xx on `.js` or `.css` resources. Each page is its own test so Playwright parallelism keeps the runtime manageable, and the existing `smoke.maxFiles` cap (50 by default; set to 0 in `.docs-test.toml` for unlimited coverage) still applies. Built-in noise from analytics CDNs is suppressed; per-consumer patterns go under `[allowlists].consoleErrors` in the CONFIG TOML and are compiled to `RegExp` and matched against each error message.
- New `tests/theme-toggle.spec.ts`. Regression suite for the Hextra theme-toggle dropdown, guarding against the CSS `@layer` cascade conflict that surfaces when a consumer loads Tailwind v3 alongside Hextra v0.12+ (unlayered preflight `button { padding: 0 }` / `* { border-width: 0 }` beats Hextra's layered `hx:*` utilities, producing dropdown buttons with no padding, no border, and no shadow). The suite asserts visible padding, border, and shadow on the toggle button and dropdown container so a missing unlayered override is caught before consumers ship a broken header.

---

## [0.0.2] — 2026-05-26

This release merges the kgateway.dev theme into the shared module, centralizes the sidebar, TOC, breadcrumb, and navbar, and ships two new features: a glossary shortcode and AI-discoverability output formats.

### ⚠️ Breaking changes

**Card class rename.** The `{{< cards >}}` and `{{< card >}}` shortcodes now emit `section-cards` / `section-card` instead of `hextra-cards hextra-cards-grid` / `hextra-card hextra-card-styled`. The inline CSS variable also renamed from `--hextra-cols` to `--section-cards-cols`. Update any consumer CSS, inline `<style>` blocks, or local templates that target the old class names.

**Sidebar breakpoint.** The persistent sidebar now requires a viewport width of ≥ 1280px (`xl`) instead of ≥ 768px (`md`). Tablet-width screens (768–1279px) get the new slide panel instead of a permanently visible sidebar.

**`_partials/` navbar.** `layouts/partials/navbar.html` has been moved to `layouts/_partials/navbar.html` for Hextra v0.12+ precedence compatibility. Any consumer with a local `layouts/partials/navbar.html` override will now be silently shadowed by this version. Move your override to `layouts/_partials/navbar.html`.

### Sidebar

- Replaced the sidebar with a unified mobile-aware implementation shared across kgateway.dev and agentgateway oss.
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
maintained inline in the docs hub and
[agentgateway oss](https://github.com/agentgateway/website).

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
