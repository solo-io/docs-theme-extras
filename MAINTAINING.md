# Maintaining docs-theme-extras

This file is for people **changing** the module. People **using** it want the
docs site (`make server-docs`, published at
<https://solo-io.github.io/docs-theme-extras/>).

Two parts:

- [The shortcode header contract](#the-shortcode-header-contract) — the
  structured comment block every file under `layouts/_shortcodes/` opens with,
  which the docs-site generator reads.
- [Maintaining the shadows](#maintaining-the-shadows) — the Hextra layout files
  this module overrides, the `# ours` convention, how to debug override
  precedence, and the Hextra upgrade workflow.

[OVERRIDES.md](./OVERRIDES.md) is the generated per-file inventory that the
second part refers to.

---

# The shortcode header contract

Each file under [`layouts/_shortcodes/`](./layouts/_shortcodes/) opens with a
comment block describing its parameters and behavior. That has always been the
stated rule; what is new is that the block is now **structured**, because
`scripts/gen-docs.mjs` reads it to generate the reference pages on the docs
site and `npm run scan:docs` checks it against what the template actually does.

The source file is the source of truth. There is no second place to update.

## Why structured, and what it cost

The previous convention was prose, in four different shapes. It failed
measurably. When `npm run scan:docs` was first run against it:

| | |
|---|---|
| shortcodes | 29 |
| no header comment at all | 6 |
| header of five lines or fewer | 4 |
| read params but had no `Parameters:` block | 8 |
| **params read by the template and named nowhere in the header** | **21, across 6 shortcodes** |
| more params reachable only through a delegated partial | 3 shortcodes |
| `themeExtras.*` config params documented nowhere | 5 |

Those counts are a floor, not a ceiling: the report counts a param as
documented if its name appears *anywhere* in the block, so `version.html` scores
clean on the strength of the word "version" appearing in a prose sentence while
never documenting `version=` as a parameter.

The cost of the structured form is that type, required and default now have to
be written out rather than implied. That is deliberate: those three columns are
the ones a reader scans for, and none of them is reliably recoverable from
prose, which is exactly why a generator could never have produced them from the
old headers.

## The format

```
{{- /*
  Shortcode: table
  Summary: Wraps a markdown table so the author picks how its columns size.
  Group: ui-components
  CallForm: both
  Overrides: none

  Parameters:
    - mode | string | no | wrap | One of wrap, nowrap, or equal. See Notes.
    - 0    | string | no | wrap | Positional alias for mode.

  Example:
    {{% table mode="nowrap" %}}
    | Command | Description |
    | ------- | ----------- |
    {{% /table %}}

  Notes:
    Everything after Notes: passes through to the page as Markdown.
*/ -}}
```

The block must be the **first** thing in the file. A comment further down is an
implementation note, not the contract, and the parser is anchored at the start
so it will not find one.

### Required fields

| Field | Value |
|---|---|
| `Shortcode` | The file's basename, without `.html`. Checked against the filename. |
| `Summary` | One sentence, no trailing period needed. Becomes the page description and the index row. |
| `Group` | One of the values in [Groups](#groups). Drives site grouping and menu weight. |
| `CallForm` | `both`, `percent`, or `angle`. |
| `Overrides` | The Hextra shortcode this one shadows, or `none`. |
| `Parameters` | A list in the shape below, or the literal `Parameters: none`. |

`Example` and `Notes` are optional.

There is deliberately **no `Since` field**, though an earlier draft of the plan
proposed one. Backfilling an accurate introduced-in version for 29 shortcodes
means archaeology through a 3,986-line changelog, nothing can verify the result,
and a wrong version number is worse than an absent one because a reader will
believe it. `CHANGELOG.md` already answers the question, and answers it
correctly. There is no `Status` field for a weaker version of the same reason:
nothing can check it, so it goes stale silently.

### `Parameters` rows

```
- name | type | required | default | description
```

- **name** — the parameter name, or a bare integer for a positional argument.
  Positional args get their own row; the old convention of mentioning them
  inside a named param's prose (`- mode (or positional 0): …`) is what let
  `reuse.html` take three positional arguments while documenting none of them.
- **type** — one of `string`, `bool`, `int`, `path`, `url`. Keep the set closed;
  a new type is a change to this document, not a local decision.
- **required** — `yes` or `no`.
- **default** — the literal default, or `—` when there is none. Do not quote it.
- **description** — free text. **No pipe characters**, since the pipe is the
  delimiter and there is no escape.

Use `Parameters: none` when the shortcode takes none. An empty `Parameters:`
block is an error, not a synonym.

### Params read through a partial

Several shortcodes never touch `.Get` themselves and hand their context to a
partial that does:

| Shortcode | Params | Read in |
|---|---|---|
| `conditional-text` | `include-if`, `exclude-if` | `utils/gate-decide.html` |
| `version` | `include-if`, `exclude-if` | `utils/gate-decide.html` |
| `link-hextra` | `path`, `product`, `version` | `utils/resolve-link.html` |

**Document these in the shortcode's own `Parameters` block, as if it read them
directly.** A reader calling `{{< conditional-text include-if="…" >}}` should not
have to know which partial resolves the value, and `include-if` is among the
most-used params in the module — burying it one indirection away is how it came
to be undocumented in the first place.

Name the partial in `Notes:` so the next maintainer knows where the logic is.

`scan-docs` follows both delegation forms, including the easy-to-miss one where
the context is smuggled in as a dict value:

```
{{ partial "utils/gate-decide.html" (dict "sc" . "tokens" $t) }}
```

A scanner that matches only `partial "x" .` reports `conditional-text` as
reading zero parameters, and a presence-only gate then passes it while it
documents nothing. That is not hypothetical; it is what the first version of
`scan-docs` did.

### `Example`

Three accepted shapes. A one-line call goes inline:

```
  Example: {{< card title="Get started" path="/getting-started/" icon="solo" >}}
```

Anything longer goes in an indented block:

```
  Example:
    {{< cards cols="2" >}}
      {{< card title="First card" link="/docs/first/" >}}
    {{< /cards >}}
```

Supplying both an inline value and a block is an error, not a precedence rule.
There is no obvious winner and guessing wrong silently drops content.

The docs site is built by the module it documents, so the generator emits each
`Example` **twice**: once fenced, showing the source, and once as a real
shortcode call so the reader sees the actual output beneath it, wrapped in a
`details` block. An example that stops working fails the site build instead of
going quietly stale.

That is not theoretical. The first build after `card.html` was converted failed
on `ERROR icon "rocket" not found`: the example in that header had always been
wrong, and nothing had ever executed it. `card.html` passes `icon` to Hextra's
`utils/icon.html` **unguarded**, so a name that is not a key in
`data/icons.yaml` calls `errorf` and aborts the build — a hazard
`utils/render-icon.html` documents and deliberately leaves in place.

Two kinds of shortcode must opt out. The obvious one cannot render standalone.
The one that is easy to miss **must not render at all, because its output acts
on the page that contains it** — `redirect` emits a `window.location`
assignment, so a live example navigated the reader off its own reference page
the moment they opened it. Before leaving an example live, ask what the output
*does*, not just what it looks like.

To opt out:

```
  Example: code-only
```

Expect to need it for most of the `reuse` and `rebase` family, which need a real
asset tree and a version context, and for anything that makes a network request
on render — `github-yaml` uses it for that reason, since a live example would
hit the network on every site build. Reach for it when the example *cannot*
render, not when it is inconvenient.

### Groups

`Group` drives which section of the site a shortcode's page lands in, and its
menu weight within that section.

| Group | What belongs in it |
|---|---|
| `ui-components` | Renders a visual component on the page |
| `gating` | Decides whether content appears at all |
| `reuse-versioning` | Pulls in shared content, or varies it by version |
| `external-content` | Pulls content from outside the page's own source |
| `links` | Resolves or emits a URL |
| `deprecated` | Superseded; kept for existing content. Currently empty |

Two deviations from the docs-site plan, both because the plan's list did not
survive contact with the actual 29 files:

- **`links` is new.** The plan's five groups had nowhere to put `link`,
  `link-hextra` or `redirect`.
- **`remote-content` is renamed `external-content`.** `readfile` reads a local
  file, so "remote" was wrong for a member of the group it most obviously
  belongs to.

#### Group assignment

The backfill is **complete**: all 29 shortcodes carry a conformant header, and
`npm run gen:docs` generates a page for every one of them.

**This table is a snapshot, not a source of truth.** Each file's header carries
its own `Group` and that is what the generator reads, so this is free to rot.
It is kept because it is the only place the whole assignment is visible at once,
which is useful when deciding where a new shortcode belongs.

| Group | Shortcodes |
|---|---|
| `ui-components` | `alert`, `callout`, `card`, `cards`, `checklist`, `details`, `gloss`, `prism`, `render`, `table` |
| `gating` | `conditional-text`, `downstream`, `upstream`, `version` |
| `reuse-versioning` | `rebase`, `reuse`, `reuse-append`, `reuse-image`, `reuse-image-dark`, `reuse-image-light`, `version-cards` |
| `external-content` | `github`, `github-table`, `github-yaml`, `openapi`, `readfile` |
| `links` | `link`, `link-hextra`, `redirect` |

## Writing a header

1. Run `npm run scan:docs` and find the file's row. It lists every param the
   template actually reads, including the ones reached through a partial.
2. Write the block. `layouts/_shortcodes/table.html` is the reference
   implementation.
3. Run `npm run scan:docs` again. The file's `undoc` column should be `0` and
   its positional flag clear.

Two traps worth knowing before you hit them:

- **A pipe in a description silently truncates the row.** There is no escape
  character. Reword.
- **`Parameters: none` on a shortcode that reads something** will be caught, but
  the reverse — a documented param the template never reads — is only reported,
  not failed. A stale row is on you to notice.

## The config-param registry

Config params are the same problem one layer up. Five `themeExtras.*` keys are
read in `layouts/` or `assets/` and documented nowhere:

| Key | Read in |
|---|---|
| `themeExtras.outputs` | `_partials/docs-llms-directive.html` |
| `themeExtras.prodHost` | `_partials/page-to-markdown.html`, `partials/copy-markdown.html`, `partials/utils/prod-host.html` |
| `themeExtras.schemaOrgName` | `_partials/schema.html` |
| `themeExtras.twitterSite` | `_partials/twitter_cards.html` |
| `themeExtras.warnMissingDescription` | `partials/themeExtras/head-end.html`, `partials/utils/warn-missing-description.html` |

`themeExtras.outputs` is a **table**, not a scalar — `docs-llms-directive.html`
reads `outputs.markdown` off it. The generated params reference has to handle
nested keys, which the other four do not exercise.

`npm run scan:docs` lists these under `themeExtras config params` and marks each
as documented or not. Adding a new one without documenting it is the same class
of miss as an undocumented shortcode param, and gets the same treatment once the
gate goes blocking.

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
