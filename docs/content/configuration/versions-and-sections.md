---
title: Versions and sections
description: >-
  The params.versions and params.sections contract every consumer config must follow.
weight: 10
---

Two params drive every version-aware and section-aware behavior in this module:
the version dropdown and its mobile chips, the section selector, the left nav,
the version banner, `noindex` on superseded versions, the search "other
versions" filter, `{{</* version-cards */>}}`, `{{</* version */>}}` gating, and
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
