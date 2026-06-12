# Layout migration audit (Phase 0)

This is the output of phase 0 of the [docs-theme-extras plan](/Users/kristinbrown/.claude/plans/i-m-thinking-about-moving-toasty-volcano.md). It catalogs which layout files should ship in `docs-theme-extras/`, how they should be structured, and per-file sanity-check notes.

**Source repos audited:**
- `/Users/kristinbrown/Documents/GitHub/docs/layouts/shortcodes/` (29 files)
- `/Users/kristinbrown/Documents/GitHub/agentgateway-oss-website/layouts/shortcodes/` (33 files)

`/Users/kristinbrown/Documents/GitHub/kgateway.dev-fork/` was spot-checked but is not a primary reference: kgw-oss currently carries stale agentgateway content that's unmaintained, so its layouts don't represent a clean point of comparison.

**Reference for fixture coverage:** the bundled fixture's master conref at `/Users/kristinbrown/Documents/GitHub/docs/assets/conrefs/test/everything.md`, which uses 22 distinct shortcodes.

---

## Headline finding: dual-convention via a shared `page-context` partial

agw-oss and docs each use a different convention for how a shortcode determines "what's the current section / version / condition for this page":

| Convention | URL shape | How to derive context |
|---|---|---|
| **URL-path mode** (agw-oss) | `agentgateway.dev/docs/<section>/<version>/...` | parse `Page.RelPermalink` segments |
| **Site-params mode** (docs) | `docs.solo.io/<product>/<version>/...` (the `/docs/` is in the domain, not the path) | read `Site.Params.{folder, currentProduct, buildCondition, versions}` |

This isn't a "one convention is correct" question — both work for the site they were designed for. The fixture's URLs (`/test/v2/everything/`) match docs's site-params convention because that's where the fixture was born. agw-oss has a different URL shape because its domain doesn't include `/docs/` for free.

**The module accommodates both via a single shared partial.** Shortcodes that need page context (section, version, condition) call the partial; the partial dispatches on a site-param flag. Each consumer declares its mode in its hugo config:

```yaml
# agw-oss/hugo.yaml
params:
  pageContextMode: url

# docs/hugo-test.toml (and other docs configs)
[params]
  pageContextMode = "siteParams"
```

The partial returns `{ section, version, condition }`:

```go-template
{{/* layouts/partials/util/page-context.html */}}
{{ $mode := .Site.Params.pageContextMode | default "siteParams" }}
{{ $ctx := dict "section" "" "version" "" "condition" "" }}
{{ if eq $mode "url" }}
  {{ $parts := split (trim .RelPermalink "/") "/" }}
  {{ if and (ge (len $parts) 2) (eq (index $parts 0) "docs") }}
    {{/* /docs/<section>/<version>/... or /docs/<version>/... */}}
    {{ if and (ge (len $parts) 3) (in (slice "kubernetes" "standalone" "envoy" "agentgateway") (index $parts 1)) }}
      {{ $ctx = dict "section" (index $parts 1) "version" (index $parts 2) "condition" (index $parts 1) }}
    {{ else }}
      {{ $ctx = dict "section" "" "version" (index $parts 1) "condition" "" }}
    {{ end }}
  {{ end }}
{{ else }}
  {{/* siteParams mode */}}
  {{ $folder := .Site.Params.folder | default "" }}
  {{ $sectionUrl := .FirstSection.RelPermalink }}
  {{ $version := trim (replace $sectionUrl $folder "") "/" }}
  {{ $ctx = dict
      "section" $folder
      "version" $version
      "condition" (.Site.Params.buildCondition | default "")
  }}
{{ end }}
{{ return $ctx }}
```

(Sketch — final version will harden the URL parser and add the section list as a configurable param.)

Shortcodes become tiny:

```go-template
{{/* conditional-text.html */}}
{{ $ctx := partial "util/page-context" . }}
{{ if $ctx.condition }}
  {{ $include := split (.Get "include-if" | default "") "," }}
  {{ $exclude := split (.Get "exclude-if" | default "") "," }}
  {{ if and (isset .Params "include-if") (in $include $ctx.condition) }}
    {{ .Inner | .Page.RenderString }}
  {{ else if and (isset .Params "exclude-if") (not (in $exclude $ctx.condition)) }}
    {{ .Inner | .Page.RenderString }}
  {{ end }}
{{ end }}
```

```go-template
{{/* version.html */}}
{{ $ctx := partial "util/page-context" . }}
{{ if $ctx.version }}
  {{ $include := split (.Get "include-if" | default "") "," }}
  {{ range .Site.Params.versions }}
    {{ if eq .linkVersion $ctx.version }}
      {{/* ...include-if / exclude-if logic against .version... */}}
    {{ end }}
  {{ end }}
{{ end }}
```

The module ships one canonical implementation per shortcode. Each consumer flips the `pageContextMode` flag and the same module file handles both URL conventions.

---

## Per-shortcode disposition

| Shortcode | Disposition | Notes |
|---|---|---|
| `alert` | Module ships docs's version verbatim | Solo-custom; not in hextra; no context dependency |
| `callout` | Module ships docs's (alias-to-alert) | Hextra has a default `callout`; docs aliases to `alert` for consistency. Module preserves docs's behavior so callout/alert render identically. |
| `cards`, `card` | Hextra default; module overrides only if needed | Hextra ships these; need to diff docs's vs hextra's to decide. ~5 min |
| `checklist` | Module ships docs's version verbatim | Solo-custom |
| `conditional-text` | **Module ships dual-mode merged version** | Calls `util/page-context` partial; agw-oss flips `pageContextMode: url`, docs uses `siteParams` (default) |
| `details` | Hextra default | Both repos use hextra's; no override needed |
| `github`, `github-table` | Module ships merged version | Need 5-min diff to confirm docs's and agw-oss's are close. Likely no context dependency. |
| `icon` | Hextra default | Both repos use hextra's |
| `link` | Module ships docs's version | Solo-custom in-product link resolver; not in agw-oss or hextra |
| `link-hextra` | **Module ships dual-mode merged version** | Calls `util/page-context` to get section prefix; works in both URL and siteParams modes |
| `openapi` | Module supports both `url=` and `src=` parameters | Two parameter signatures; shortcode dispatches based on which is set. agw-oss uses `url=` (remote swagger); docs uses `src=` (local file). |
| `prism` | Module ships docs's version verbatim | Solo-custom syntax-highlighting wrapper |
| `readfile` | Module ships merged version | Need 5-min diff. Likely no context dependency. |
| `reuse` | **Module ships dual-mode merged version** | Simple file-fetch in url mode; full version-namespacing + keepVersion + parent-injection in siteParams mode (gated on `Site.Params.currentProduct` being set) |
| `reuse-image`, `reuse-image-dark` | Module ships merged version | Need 5-min diff |
| `steps` | Module ships merged version | Both are CSS-counter wrappers; minor styling differences. Need 5-min diff. |
| `tabs`, `tab` | Hextra default | Both repos use hextra's; need to confirm docs doesn't override |
| `version` | **Module ships dual-mode merged version** | Calls `util/page-context` partial |

**4 shortcodes use the dual-mode partial:** `conditional-text`, `version`, `link-hextra`, `reuse`.

**`openapi`** is dual-mode but in a different way (parameter dispatch, not context dispatch) — supports both `url=` and `src=` to cover both consumers' calling conventions.

**~5 simple shortcodes** still need a quick diff to confirm there's no hidden context dependency (`cards`, `card`, `github*`, `readfile`, `reuse-image*`, `steps`).

**Hextra defaults handle** `details`, `icon`, `tabs`, `tab`.

**Pure docs-side overrides** (no merge needed): `alert`, `callout`, `checklist`, `link`, `prism`.

---

## Reuse: the one shortcode where dual-mode is real work

`conditional-text`, `version`, `link-hextra` are mechanical merges once the partial exists — extract context, branch on it, render. `openapi` is parameter-signature dispatch.

`reuse` is more involved. agw-oss's `reuse` is 30 lines of "get resource, render markdown." docs's `reuse` is 100+ lines that handle:

- Versioned asset paths (`<currentProduct>/<version>/<asset>` for assembled products like agentgateway in docs)
- OSS→enterprise version remapping (TOML-driven, two-pass to avoid overlapping matches)
- Parent-version injection into nested `{{< version >}}` and `{{< reuse >}}` calls
- `keepVersion="true"` support to convert angle-bracket form to percent form

Three of those four features are docs-specific (assembled products, enterprise remap, nested-version injection). The fourth (`keepVersion`) is exercised by the fixture's `MARKER_KEEP_VERSION` test.

**Recommendation: gate on `Site.Params.currentProduct`.** All four features no-op in agw-oss because agw-oss doesn't set `currentProduct`. So a single merged `reuse.html` looks like:

```go-template
{{ $asset := strings.TrimPrefix "/" (.Get 0) }}
{{ $r := resources.Get $asset }}
{{ if not $r }}{{ errorf "..." }}{{ end }}

{{ $content := $r.Content }}

{{ if .Site.Params.currentProduct }}
  {{/* docs-style: full versioning machinery */}}
  {{/* ...resolve versioned asset path... */}}
  {{/* ...inject parent version into nested shortcodes... */}}
  {{/* ...OSS→enterprise remap... */}}
  {{/* ...keepVersion handling... */}}
{{ end }}

{{ $content | .Page.RenderString | chomp }}
```

agw-oss never enters the `if currentProduct` branch, so the simple file-fetch behavior is preserved. docs sets `currentProduct = "test"` (or whatever) and the full machinery activates. One file, two behaviors, gated on a config flag the consumer already sets.

---

## Other findings worth keeping

### agw-oss has shortcodes the fixture doesn't exercise

These are docs-framework-relevant but not exercised by the fixture. Defer to phase 2 follow-up if fixture coverage expands:
- `doc-test.html` — test wrapper for embedded YAML; investigate if useful generally
- `gloss.html` — glossary shortcode
- ~~`redirect.html` — utility~~ — DONE: centralized into extras (`layouts/_shortcodes/redirect.html`), `path=` resolution moved onto `utils/page-context.html`; covered by `tests/redirect.spec.ts` + the `v2/redirect` fixture page. See the Redirect entry in CHANGELOG.
- `reuse-append.html` — variant of reuse
- `github-yaml.html` — variant of github

### docs has shortcodes the fixture doesn't exercise

Probably docs-specific; revisit during docs's incremental adoption (phase 3):
- `doc-nav.html`, `doc-test.html` (test product internals)
- `gist.html`, `gloss.html`
- `rebase.html`, `render.html` (versioning machinery)
- `table.html` (likely override of `_markup/render-table`)
- `versioned_link_path.html`

### Layout templates and partials

agw-oss has substantial `_default/`, `docs/`, `partials/` trees. The current plan does not propose moving any non-shortcode layouts into the module for the MVP. The standalone fixture build relies on hextra's defaults; if it surfaces missing pieces, address them as phase-2 follow-ups.

---

## Resolved decisions

1. **Dual-mode partial approach: confirmed.** Each shortcode that has context dependency calls `util/page-context`, which dispatches on `Site.Params.pageContextMode`.

2. **Default `pageContextMode = "url"`.** When a consumer doesn't set the param, the partial defaults to URL-derived behavior. Rationale: more likely to work for new consumer repos (any new Hugo site that follows the `/docs/<section>/<version>/...` convention works without setup). The fixture and docs explicitly opt into `siteParams` via the param.

3. **`reuse` enterprise features: gated logic in one file.** All docs-specific behavior (versioned asset paths, OSS→enterprise remap, parent-version injection, keepVersion) wrapped in `{{ if .Site.Params.currentProduct }}` so it no-ops in agw-oss and any other consumer that doesn't set `currentProduct`.

4. **Remaining diffs: completed below.** See "Simple-shortcode diffs" section.

---

## Simple-shortcode diffs

### `readfile.html` — identical

The two files are byte-for-byte the same modulo a doc-comment header on agw-oss's. Ship docs's version verbatim.

### `github.html` — module ships docs's

Behavior diverges on a feature the fixture exercises:

- **docs**: branches on URL extension. `.md` URLs go through `Page.RenderString` (markdown rendered to HTML). Other extensions get `safeHTML` passthrough (caller wraps in code fence).
- **agw-oss**: always `safeHTML`. Markdown URLs would render as raw text.

Fixture has all three modes — `MARKER_GITHUB` with markdown rendering, `MARKER_GITHUB_YAML` with yaml passthrough, `MARKER_GITHUB_TEXT` with plain text. Module needs docs's branched implementation.

### `github-table.html` — module ships docs's

Both versions extract a section from a remote markdown file. Difference:

- **docs**: extracts via `Page.RenderString` so the extracted markdown renders as HTML; comment notes both `{{% %}}` and `{{< >}}` call forms produce the same output.
- **agw-oss**: passes the extracted markdown through `safeHTML` as-is (no markdown rendering).

Fixture's `MARKER_GITHUB_TABLE` test extracts a markdown table and expects it rendered as `<table>`. Module needs docs's version.

### `reuse-image.html` and `reuse-image-dark.html` — merged with `currentProduct` gate

Same pattern as `reuse`:

- **agw-oss**: simple `resources.Get $src` → render `<figure>`.
- **docs**: also tries a versioned fallback path (`<currentProduct>/<version>/<src>`) for assembled products.

Module ships a merged version that gates the versioned fallback on `Site.Params.currentProduct` — no-ops in agw-oss (which doesn't set currentProduct), full behavior in docs. Same recipe as `reuse`.

### `steps.html` — hextra default; no module override

- **docs**: no override; uses hextra's default.
- **agw-oss**: ships its own override with custom inline styles.

The fixture works in docs today using hextra's default. Module ships nothing for steps; agw-oss's own override is agw-oss-specific and can stay as a local override there.

### `tabs.html` and `tab.html` — module ships docs's

Important divergence:

- **docs**: implements a `tabTotal=` + `tabName=` API using Hugo `Scratch`. The fixture uses this API exclusively.
- **hextra default (0.12.2)**: a different, newer API using `Store` and `selected`/`name` on `tab`. agw-oss uses hextra's directly (no override).

Fixture calls `{{< tabs tabTotal="2" >}}{{% tab tabName="YAML" %}}...{{% /tab %}}...{{< /tabs >}}`. That works in docs because docs overrides hextra's. In agw-oss without an override, those calls would either fail or render wrong against hextra's API.

Module ships docs's `tabs.html` and `tab.html`. When agw-oss eventually adopts the module, any agw-oss content that uses hextra's tab API directly would either need to switch to the docs API or keep a local override.

### `cards.html` and `card.html` — divergent; recommend agw-oss-style with extensions

This is the messiest pair. The two repos have **completely different visual implementations**:

- **docs `cards`**: 1-line wrapper `<div class="section-cards">` + custom CSS.
- **agw-oss `cards`**: hextra-style grid `<div class="hextra-cards hextra-cards-grid" style="--hextra-cols: ...">` with a `cols` parameter.
- **docs `card`**: heroicon-to-material-icons mapping, `<a class="section-card">`, uses `Page.FirstSection.RelPermalink`.
- **agw-oss `card`**: hardcoded section regex (`/docs/(kubernetes|standalone)/...`), `<a class="hextra-card hextra-card-styled">`, uses `partial "utils/icon.html"`.

Recommendation: use agw-oss's hextra-aligned styling as the canonical visual, but rewrite the URL/section logic to call `util/page-context` (so it works for both URL-mode and siteParams-mode consumers). Drop the hardcoded section regex.

The fixture uses `cards`/`card` minimally (one cards block with one or two cards). Whichever visual is used, the fixture's structural assertions still pass — the harness checks for the rendered card structure, not for a specific CSS class name. Pick the visual once and stick with it.

When docs eventually adopts the module's card styling, that's a real visual change for docs pages — flag it in phase 3 as a deliberate design decision, not a silent shadow.

---

## Final source map

| Shortcode | Source / Strategy | Notes |
|---|---|---|
| `alert` | docs verbatim | Solo-custom |
| `callout` | docs verbatim (alias-to-alert) | |
| `card` | agw-oss visual + page-context partial for URL logic | Real visual change for docs at adoption |
| `cards` | agw-oss verbatim (hextra grid) | |
| `checklist` | docs verbatim | Solo-custom |
| `conditional-text` | merged via page-context partial | Default mode `url` |
| `details` | hextra default | No override |
| `github` | docs verbatim | Markdown branching |
| `github-table` | docs verbatim | Markdown rendering |
| `icon` | hextra default | No override |
| `link` | docs verbatim | Solo-custom |
| `link-hextra` | merged via page-context partial | |
| `openapi` | merged: dispatches on `url=` vs `src=` | |
| `prism` | docs verbatim | Solo-custom |
| `readfile` | docs verbatim (identical to agw-oss) | |
| `reuse` | merged; currentProduct gate for enterprise features | |
| `reuse-image` | merged; currentProduct gate for versioned fallback | |
| `reuse-image-dark` | merged; same | |
| `steps` | hextra default | No override needed |
| `tab` | hextra default; no module override | docs keeps local `tabTotal/tabName` override; fixture migrated to hextra API |
| `tabs` | hextra default; no module override | same |
| `version` | merged via page-context partial | Default mode `url` |

**Summary of where files come from:**
- **7 docs verbatim** (alert, callout, checklist, github, github-table, link, prism, readfile)
- **2 agw-oss verbatim** (cards, card visual + page-context partial for URL logic)
- **7 merged** (conditional-text, link-hextra, openapi, reuse, reuse-image, reuse-image-dark, version)
- **5 hextra defaults, no override needed** (details, icon, steps, tabs, tab)

The "5-from-docs" estimate from the original plan was low; the realistic count is 7 docs-verbatim + 7 merges that started from docs's logic. The plan's effort estimates for phase 2 stand because copying a file vs writing a merged-mode file is similar work — the partial does the heavy lifting.

---

## Fixture changes required for phase 2

When the fixture is copied into the module, two source changes are needed before the standalone build will pass `make self-test`:

### Tabs sections must use hextra's API, not docs's

In `assets/conrefs/test/everything.md`, two tabs sections currently use docs's `tabTotal=` / `tabName=` API:

```
{{< tabs tabTotal="2" >}}
{{% tab tabName="YAML" %}}...{{% /tab %}}
{{% tab tabName="Bash" %}}...{{% /tab %}}
{{< /tabs >}}
```

Rewrite them to hextra's API:

```
{{< tabs >}}
{{% tab name="YAML" %}}...{{% /tab %}}
{{% tab name="Bash" %}}...{{% /tab %}}
{{< /tabs >}}
```

Affected sections in the conref:
- "Tabs in both shortcode forms"
- "Tabs in steps"
- "Tabs in ordered lists"

This is the only fixture content change phase 2 requires. The tabs section in `MARKER_NUMBERED_INSIDE_TAB`, `MARKER_TAB_YAML`, `MARKER_TAB_BASH`, `MARKER_STEPS_TABS_A`, `MARKER_STEPS_TABS_B` testing all stays — only the param names on the shortcode tags change.

(docs's local `tabs.html` / `tab.html` override stays in docs untouched, so docs's existing fixture copy continues to work there.)

---

## Resolved follow-ups

1. **Cards visual**: agw-oss verbatim in the module. docs's `section-cards` `cards.html` and `card.html` stay as docs-local overrides. Hugo lookup means docs pages keep their existing visual; agw-oss and any new consumer get the hextra-grid styling.

2. **Tabs API**: module ships no override; hextra default in play. Fixture rewritten to use hextra's `name=` API (see "Fixture changes required" above). docs's `tabTotal/tabName` override stays in docs; docs pages keep their current API.

---

## Deferred cleanup list

Out of scope for the active phases (0, 1, 2). These are real cleanup items the audit surfaced that are worth tracking so they don't get lost.

### A. agw-oss's `steps.html` override

**Why**: agw-oss has a `steps.html` that adds custom inline styling (border-left, padding, counter-reset) on top of hextra's default. Functionally redundant with hextra's `hextra-steps` wrapper but visually different.

**When**: phase 4, when agw-oss adopts the module. Decide whether to delete agw-oss's local override and accept hextra's default visual.

**Risk**: tiny visual change for agw-oss readers (border styling differs). No broken pages, no API change.

### B. docs's `tabs.html` and `tab.html` overrides

**Why**: docs's tabs/tab implement a different API (`tabTotal=` / `tabName=`) than hextra's default (`name=` on `tab`). Not redundant — they exist because docs's content uses an older API.

**When**: as part of phase 3 (docs's incremental adoption). The order matters: migrate content first, delete overrides second.

**Steps**:
1. Find all `{{< tabs tabTotal="..." >}}{{% tab tabName="..." %}}` in docs's content corpus and rewrite to `{{< tabs >}}{{% tab name="..." %}}`. Likely a sed/find-replace plus per-file review for ordering and edge cases.
2. Confirm `make test PRODUCT=...` is green for every product after the rewrite.
3. Delete `layouts/shortcodes/tabs.html` and `layouts/shortcodes/tab.html` from docs. Hextra default takes over silently.

**Risk**: medium. Every tabbed page in docs renders wrong between step 1 (incomplete) and step 1 (complete). Land as a single PR with the override deletion gated behind the rewrite, or land in two PRs with override deletion second.

### C. agw-oss-only shortcodes the fixture doesn't exercise

**Why**: agw-oss has `doc-test`, `gloss`, `redirect`, `reuse-append`, `github-yaml`. Some are docs-framework-relevant; others may be agw-oss-specific.

**When**: phase 2 follow-up, after the standalone fixture build is green. Audit each, decide whether to:
- Add to the module (general-purpose docs-framework shortcode).
- Leave as agw-oss-local (truly agw-oss-specific).
- Delete from agw-oss (deprecated/unused).

### D. docs-only shortcodes the fixture doesn't exercise

**Why**: docs has `doc-nav`, `doc-test`, `gist`, `gloss`, `rebase`, `render`, `table`, `versioned_link_path`. Most are docs-framework machinery (rebase, render are versioning helpers) or potentially deprecated.

**When**: phase 3, as part of docs's incremental adoption. Each override gets reviewed individually:
- Is it general-purpose? → contribute to module.
- Is it docs-only? → keep as docs-local.
- Is it dead? → delete.

### E. Layout templates and partials beyond shortcodes

**Why**: agw-oss has substantial `_default/`, `docs/`, `partials/` trees with overrides for `single.html`, `list.html`, breadcrumb, sidebar, copy-markdown, etc. The current plan ships nothing non-shortcode in the module.

**When**: phase 2 follow-up, if the standalone fixture build surfaces missing pieces (e.g., the fixture pages need a sidebar partial, copy-markdown script, etc.). Address as gaps when they appear, not preemptively.

### F. Repo naming finalization

**Why**: working name `docs-theme-extras` is reasonable but not committed. Final name affects the Go module path baked into every consumer's `go.mod`.

**When**: before phase 2 git-init in the new repo, since changing it after consumers pin a version requires `replace` directives or a re-pin.

**Recommendation**: stick with `docs-theme-extras` unless something better surfaces. Honest about the boundary (overlay on hextra), not over-promising.
