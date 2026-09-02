# Consumer overrides that shadow this module

Regenerate with `npm run scan:overrides` from the repo root, with the consumer clones as
siblings. Snapshot taken 2026-08-05 against unreleased `docs-theme-extras` — see the
Unreleased section of `CHANGELOG.md`.

## Why this file exists

A change that is correct in extras can still be a regression on a consumer that carries
its own copy of the thing being changed. That is not hypothetical — it happened with the
ordered-list counter fix in the Unreleased section. That fix was right in the module, but
the docs hub duplicated those rules in `assets/css/custom.css`, and `custom.css` is
concatenated **after** the module stylesheet, so an equal-specificity copy wins. With only the pin bumped, the hub got
the theme's new `content: counter(list-item, …)` while the hub's own
`counter-increment: … list-item 0` still pinned the counter — markers stopped incrementing
entirely, which is worse than the bug being fixed. It was found by eye, on a real build,
after the fixture was fully green.

**The fixture cannot catch this class of problem.** The bundled fixture ships a bare
`custom.css` specifically so the shared layers are tested without per-repo paint — so it
exercises a CSS environment that *no real consumer has*.

## The three mechanisms

| # | Mechanism | Why it is easy to miss |
|---|---|---|
| 1 | **Same-path file** — consumer `layouts/<p>` beats module `layouts/<p>` | Visible to a filename diff, but nothing enumerates it |
| 2 | **Duplicated CSS selector** — consumer CSS redefines a selector extras owns | *No filename collision at all.* `custom.css` is a legitimate per-repo file; the clash is at the selector level and only shows up in rendered output |
| 3 | **Divergent markup contract** — an override emits different class names | Silently scopes any extras spec matching those classes to the fixture only |

`assets/css/custom.css` is excluded from mechanism 1: it is a per-repo slot every consumer
is *meant* to replace. What is not intended is that file redefining extras' selectors,
which is mechanism 2.

## Snapshot

Current, 2026-08-07. "Duplicated selectors" counts REAL conflicts only — the consumer and
extras set at least one property in common. A selector they merely share the NAME of is not
duplication and is not counted; see the note under kagent/ambientmesh for why that
distinction mattered.

"Same-path shadows" now EXCLUDES extension-slot overrides, which are counted separately
and are not drift — see "Extension slots" below. Folding the two together would have shown
agentgateway-oss going from 5 shadows to 8 at the exact moment it stopped forking two
layouts, which is the opposite of the signal this table is for.

| consumer | same-path shadows | slot overrides (OK) | duplicated selectors | of which divergent | contract divergences |
|---|---|---|---|---|---|
| docs | 2 | 0 | 0 | 0 | 1 |
| kgateway-oss | 2 | 2 | 0 | 0 | 1 |
| agentgateway-oss-website | 4 | 5 | 0 | 0 | 2 |
| agentregistry-oss-website | 0 | 0 | 0 | 0 | 0 |
| kagent-oss-website | 0 | 0 | 0 | 0 | 0 |
| ambientmesh.io | 0 | 0 | 2 | 2 | 0 |

## Extension slots

`layouts/partials/docs/{chrome-top,chrome-bottom,width-class,content-class,after-title,after-description}.html`
are OVERRIDE POINTS. A consumer replacing one is using the module correctly; a consumer
replacing `layouts/docs/single.html` is not. The distinction is the whole reason the slots
were added — a forked layout silently stops receiving new module features, which cost
kgateway.dev a visible page subtitle on 856 pages. Full contract in [`MAINTAINING.md`](./MAINTAINING.md#extension-slots--override-these-instead-of-forking-a-docs-layout).

For history, the counts before this round of cleanup were: docs 8 shadows / 169 duplicated
selectors, kgateway-oss 4 / 1, agentgateway-oss 9 / 12, agentregistry 1 / 0, kagent 0 / 13,
ambientmesh 0 / 3. Unsanctioned template shadows are now **5 across all six consumers**,
down from 22: 2 on docs, 1 on kgateway-oss, 2 on agentgateway-oss, 0 elsewhere. Every one
that remains has a measured verdict saying why it stays. **CSS duplication is now zero everywhere except one deliberate brand
font.** What remains is same-path template shadows, which are a separate and harder problem
— several are load-bearing, not stale.

### docs — the big one

**169 duplicated selectors in `custom.css`, 147 of them byte-identical to extras.** This is
not a stray copy; it is a near-wholesale duplication of extras' CSS layer. The ordered-list
block fixed in that same batch was *one of these*.

The 22 divergent ones share a single pattern: **the hub hardcodes hex colors where extras
uses brand custom properties.**

```
.content a              hub: color:#158bc2;font-weight:500
                     extras: font-weight:500
.section-card:hover     hub: border-color:#158bc2; box-shadow:… rgba(21,139,194,.1)
                     extras: border-color:var(--theme-primary); box-shadow:… var(--theme-primary-tint)
#solo-back-to-top:hover hub: background:#106a94
                     extras: background:var(--theme-primary-hover)
```

So `custom.css` is a **stale snapshot of extras' CSS from before the brand-token refactor**.
Consequence: for those selectors the hub is not receiving extras' theming at all, and any
future extras change to them is silently discarded. A handful are genuinely different rather
than merely stale and need a judgment call, notably `.section-card-image` (extras adds
`max-height` / `object-fit`), `.page-description` (`margin-top` −0.5rem vs 1.25rem),
`.solo-footer-inner` (extras adds `text-align:center`) and `.dark .solo-footer`
(transparent vs dark background).

Same-path template shadows: `card.html`, `cards.html`. (`gloss.html` and `table.html` were
deleted in v0.2.0-beta.3 — see below.)

| shadow | measured verdict |
|---|---|
| `layouts/_shortcodes/card.html` | **KEEP — deleting BREAKS THE BUILD.** Its own header comment says why: "Hextra's card uses utils/icon.html (SVG lookup) but docs uses Material Icons font." The hub passes Material Icons names (`open_in_new`, `rocket`) and renders `<i class="material-icons">`; extras looks the name up in `site.Data.icons` and `errorf`s when absent. The hub's `data/icons.yaml` has **2 entries**, both product logos. Deleting produced `ERROR icon "open_in_new" not found` and a failed build. Same shape as the `link-hextra` forks: an adaptation to a different convention, not a stale copy |
| `layouts/_shortcodes/cards.html` | **KEEP.** Pairs with `card.html`; same icon contract |

**Resolved (v0.2.0-beta.3):**

- `layouts/_shortcodes/gloss.html` deleted. Functionally identical to extras' but **not
  flattened**, so it injected newline runs into the middle of sentences. Measured on a
  before/after `PRODUCT=kgateway` build: **29 pages differ, every edit pure whitespace** —
  42 removals of `&#10;&#10;&#10;&#10;` and 18 of a stray space, zero content changes. The
  visible wins are small but real: body text went from `you install the Solo Enterprise for
  kgateway ⏎⏎⏎ control plane ⏎⏎⏎ in a Kubernetes cluster` to one clean sentence, and the
  `<meta name="description">` on `2.1.x/about/architecture` went from `data plane . These`
  to `data plane. These`. This is the same flatten rationale as `reuse.html` and `alert.html`.
- `layouts/_shortcodes/table.html` deleted. All **18** hub call sites pass no argument, so
  there is no collision with extras' `mode=` parameter (the hub's took a positional CSS
  class; extras' takes `wrap`/`nowrap`/`equal`). **12 pages change**, all
  `gateway/*/reference/helm/*_helm_chart_values`, and the change is real markup:
  `<div class="hx:overflow-x-auto">` becomes
  `<div class="solo-table solo-table--wrap" style="--solo-table-cols: 4">`. Scroll is
  preserved either way — `.table-wrapper` already carries `overflow-x: auto`, and the inner
  `.table-wrapper` is present in both builds — so the net effect is that cells stop being
  capped at 24rem and fill the body width, which is exactly what `wrap` mode documents.
  **Flag for the visual pass**: this is the one item in this batch that changes appearance
  rather than whitespace.

**SEPARATE FINDING — the glossary feature is DEAD on the docs hub.** Not caused by the
deletion above, and not fixed by it. Both `gloss.html` versions look the key up in
`site.Data.glossary` and fall back to plain text on a miss. `kgateway.dev` ships
`data/glossary.yaml`, but the hub's module import declares **explicit mounts**
(`content/docs`, `assets/kgw-docs/*`), and explicit mounts REPLACE the defaults — so the
module's `data/` is never mounted and every lookup misses. Measured in production:
`docs.solo.io/kgateway/latest/about/architecture/` has **0** `glossary-term` spans and **0**
tooltips; the same page on `kgateway.dev` has **4** of each. So 26 terms that carry hover
definitions on the OSS site render as bare text on the hub, with no error and no missing
content — just a missing affordance. This is the same trap already recorded for the solo
icon. Fix is one mount (`source = "data"`, `target = "data"`) in `hugo-kgateway.toml`, plus
`hugo-gateway.toml` and `hugo-agentregistry.toml` which import the same module — but it needs
a check that the merged `data/` does not collide with the hub's own keys, so it is its own
change. Deliberately left as a backlog item.

**Not shadows at all, despite looking like candidates:** `icon.html` (394B) and
`doc-test.html` (20B) have no counterpart in extras — extras' `icon` is a PARTIAL
(`_partials/utils/icon.html`), not a shortcode. `icon` is **live** (4 uses arriving via the
pinned kgateway.dev module, invisible to a grep of the hub's own tree). `doc-test` has 0 uses
in the hub, its assets, the pinned kgateway.dev module and ambientmesh.io — but
agentgateway.dev has **364**, so it is a cheap compatibility shim, not dead code. Keep both.

**Resolved (unreleased):** the 169 duplicated selectors are gone (`custom.css` 26,997 →
5,008 bytes), the three byte-identical asset duplicates were deleted
(`assets/css/main.css`, `assets/js/core/toc-scroll.js`, `assets/js/flexsearch.js`), and
`layouts/_shortcodes/reuse.html` was deleted after its only live divergence — a
`flatten-rendered` call — was upstreamed. Its other divergence, a lone-`<p>` unwrap, was
verified dead first: `.Page.RenderString` with no options renders at `display:"inline"`,
which never wraps single-line content in `<p>`, so the condition was unreachable.
Deleting the override changed **0 of 1,555** built pages.

**Not in the module at all:** `docs/layouts/_shortcodes/tabs.html` and `tab.html`. extras
ships no tabs shortcode; Hextra provides it. Hextra v0.12.3 emits `hextra-tabs-panel` /
`hextra-tabs-toggle`; the hub's override emits `hextra-tab-panel` / `hextra-tab-btn` /
`hextra-tab-panels`. **Verified consequence:** any extras spec matching tab classes is
fixture-only-valid. This is exactly how `tab-code-fences.spec.ts` came to sit in no
`testMatch` allowlist *and* carry a selector that matched no fixture output.

### kgateway-oss

Four same-path shadows remain (five before `link-hextra.html` was deleted).

| shadow | verdict |
|---|---|
| `layouts/_partials/navbar.html` | **KEEP.** 29,118B against extras' 20,921B — a full fork with its own class vocabulary (`nav-container`, `dropdown`, `github-white-icon`) rather than extras' (`hextra-nav-container`, `version-dropdown`, `solo-sidebar-trigger-tabletonly`). Deleting it is a visual redesign of the site header, not a cleanup |
| `layouts/404.html` | **KEEP for now — revisit.** Predates extras' own `layouts/404.html` (v0.3.1) and does a job that one deliberately does not: it AUTO-REDIRECTS for this site's `/docs/{version}/` → `/docs/envoy/{version}/` restructure, and hardcodes the `envoy` and `agentgateway` section names. It also renders `nav.html`, so it is the one 404 in the fleet with site chrome. Deleting it would drop those restructure redirects on the floor. See the note below |
| `layouts/partials/docs/width-class.html` | **SLOT OVERRIDE — sanctioned.** Routes the wrapper class through `utils/page-width` so this site's `page.width: wide` is honoured |
| `layouts/partials/docs/content-class.html` | **SLOT OVERRIDE — sanctioned.** `hx:max-w-6xl` content column |

**On the 404 shadow (v0.3.1).** These two files now overlap in purpose, and the overlap is
worth closing later rather than now. Both answer "the reader is on a URL that does not
exist, in a versioned tree"; they differ on what to do about it. kgateway-oss AUTO-REDIRECTS
(`window.location.assign`) on a guess derived from a regex over `/docs/([a-zA-Z0-9.]+)/`,
with no check that the destination exists — so a wrong guess replaces one broken URL with
another, and the reader cannot see what happened. Extras probes with HEAD and OFFERS a link
it has confirmed resolves. The kgateway rules are also genuinely site-specific: no other
consumer has a `/docs/envoy/` section split.

Converging them means teaching extras' 404 a consumer-supplied "path rewrite" hook and
proving the restructure redirects still fire, which is its own change with its own tests.
Until then this shadow is correct, and the cost is that kgateway-oss does not get the
version-aware suggestions the other consumers get.

**Resolved (v0.2.0-beta.3):** `layouts/docs/single.html` and `layouts/docs/list.html`
deleted, replaced by the two slot overrides above. The site **gained a visible page
subtitle on 856 pages** it had silently been missing, plus
`components/page-context-menu`, the `displayPagination` guard and the `page-badges`
contract. (Its `<meta name="description">` was already correct — a different partial
feeds that — so the gain is the rendered `<p class="page-description">`, not SEO.)
Two other things moved on the way out: the inline breadcrumb-hiding `<style>` went to
`assets/css/custom.css`, and the `/docs/envoy/` landing became
`layouts/docs/landing.html`, selected by `layout: landing` in front matter, instead of
an `if $isEnvoyIndex` branch keyed on a hardcoded path. That landing renders
byte-identically apart from the stylesheet fingerprint. 154 content + 1,155 static +
7 browser specs pass.

Also noted while doing this: `layouts/docs/envoy/_index.html` and
`layouts/docs/agentgateway/_index.html` are **dead files**. Hugo has no lookup path of
the form `layouts/<section>/<subsection>/_index.html`, so neither has ever rendered.
Left in place pending a separate cleanup.

**Resolved (v0.2.0-beta.2):** `layouts/_shortcodes/link-hextra.html` deleted. The version-root
fix in that release makes the 587B fork redundant. Verified by a before/after
`hugo160 --gc --minify` build: **104 of 1,161 pages differ, 130 href changes, every one a
trailing slash being ADDED** (`/quickstart/install` → `/quickstart/install/`, one fewer
redirect) — zero links retargeted, zero link-count changes, and the remaining 438 non-HTML
diffs are `llms.txt` timestamps plus the same slashes. 154 content + 1,155 static specs pass.

### agentgateway-oss-website

Two of the four same-path shadows below are **transitional, and count UPWARD for a good
reason**: `github-yaml.html` and `reuse-append.html` were adopted INTO the module from this
consumer, so the shadow appeared because the module grew, not because agw drifted. The
ratchet cannot tell those two cases apart, which is why both rows carry an explicit deletion
deadline (the next pin bump) rather than a KEEP verdict. If they are still here after agw
moves off `v0.2.1`, that is drift and they should be deleted.

Two unsanctioned same-path shadows plus five sanctioned slot overrides (nine unsanctioned
before the image pair, the two forks and the two docs layouts below were resolved). Three
arrived on 2026-08-06 in the
commit "Moved shortcodes to `_shortcodes`": those files already existed under the old
`layouts/shortcodes/` path, where they did NOT collide with the module, and moving them made
them shadow it.

**This consumer's shadow set depends on which branch the clone has checked out**, so the
ratchet is only meaningful against a known branch. Over one working session the scanner saw
the set change four times as the clone moved between `kkb-mcp-gaps` and `kkb-theme-upgrade`;
`layouts/partials/announcement.html` exists on some branches and not others. The snapshot
below is `kkb-theme-upgrade` at `dd7f0083`. **Re-run `npm run scan:overrides` against the
release branch before trusting these counts**, and expect this consumer, not the module, to
be the reason the ratchet goes red.

That is exactly what happened on 2026-08-07. The snapshot was taken at `3769c7c2`, where
`layouts/partials/announcement.html` had been deleted; `dd7f0083` then merged `origin/main`,
which carried a *modification* to that file (`9317b55d`, "Remove Govern AI Costs workshop
banner"). A modify/delete merge resolves in favour of the modification, so the override came
back and the ratchet went red on a file no module change had touched. It is re-listed below
rather than re-deleted: agw's copy is a real 3.1KB site-specific fork (the AAIF banner — a
dismissible fixed bar, `localStorage` dismissal, and an `agw-has-banner` class that shifts
the fixed navbars down) against extras' generic 1.5KB partial, so deleting it would drop the
banner. Re-check this after the theme-upgrade branch merges.

**SIZE IS NOT EVIDENCE OF STALENESS.** The rows below used to be described purely by byte
gap, on the assumption that a fork much smaller than the module's file is an old copy to
delete. Measured — delete each fork, rebuild, diff the built HTML — **that assumption is
wrong for at least two of them.** They are small because they do a *different, simpler job
that is correct for this site's URL shape*, and deleting them breaks pages. Every row now
carries a measured verdict instead of a byte count.

| file | measured verdict |
|---|---|
| `layouts/_partials/navbar.html` | **KEEP.** 832B against extras' 20.9KB. Deleting changes **1515 pages** and renders extras' full navbar with dropdowns — a visual redesign of the site header, not a cleanup |
| `layouts/partials/announcement.html` | **KEEP.** 3,092B against extras' 1,509B. Not a stale copy: it is the AAIF banner — a dismissible fixed bar with `localStorage` dismissal and an `agw-has-banner` class that offsets the fixed navbars. Resurrected by the `origin/main` merge at `dd7f0083`; see the branch note above |
| `layouts/partials/docs/chrome-top.html` | **SLOT OVERRIDE — sanctioned.** The navbar-hiding CSS, `nav.html` and the announcement wrapper. This one file replaced two forked layouts |
| `layouts/partials/docs/chrome-bottom.html` | **SLOT OVERRIDE — sanctioned.** `chatbot.html` |
| `layouts/partials/docs/width-class.html` | **SLOT OVERRIDE — sanctioned.** `utils/page-width` plus the `agw-docs-topgap` hook class |
| `layouts/partials/docs/content-class.html` | **SLOT OVERRIDE — sanctioned.** `hx:pt-2` rather than the default `hx:pt-6` |
| `layouts/partials/docs/after-title.html` | **SLOT OVERRIDE — sanctioned.** `test-status-badge.html`. **Not inert, despite what this row said before 0.4.0.** The badge is gated on `.Params.test_status`, which no committed page carries — so a local build from source renders it zero times, which is what "inert" was measured against. CI injects the field into front matter (`make test-status` → `scripts/doc_test_inject_status.py`) before the production build, so it is live on the real site: see [`/docs/kubernetes/latest/install/helm/`](https://agentgateway.dev/docs/kubernetes/latest/install/helm/). Do not delete this slot as unused |
| `layouts/_shortcodes/github-yaml.html` | **TRANSITIONAL — delete on the next pin bump.** Not drift in the usual direction: the module's copy was taken FROM this file, so agw shadowed the module the moment the module gained it. agw pins `v0.2.1`, which has no `github-yaml`, so deleting the fork before the pin moves breaks 22 pages. Delete it in the same PR that bumps the pin, then remove this row and the baseline entry. The module's copy is not byte-identical — it fixes a `path.Dir`-derived `base_url` that emitted `https:/host/…` with one slash, and its dead-URL branch now `errorf`s instead of warning |
| `layouts/_shortcodes/reuse-append.html` | **TRANSITIONAL — delete on the next pin bump.** Same situation and same deadline as `github-yaml` above. 2 call sites, both in `llm/providers/azure.md`. The module's copy is behaviourally identical; only the doc comment grew |
| ~~`layouts/_shortcodes/openapi.html`~~ | **DELETED 2026-08-17 — it was emitting invalid HTML.** Affects **7** pages, not the 2 recorded here before. Measured by deleting the fork and diffing the whole build: exactly those 7 pages change out of 2,237, nothing else. The fork emits a complete standalone document *inside* the docs page template, so every one of those pages shipped with **2 `<!doctype>`, 2 `<html>` and 2 `<body>` tags**; extras' version emits a fragment and the page has 1 of each. Browser-checked side by side on `/docs/kubernetes/latest/llm/guardrails/webhook/openapi-spec/`: both render Swagger UI with 2 operations and the same live title ("GuardRail Webhook API 0.1.0 OAS 3.1"), and both carry the same 2 pre-existing `invalid_request` page errors, so nothing regressed. Extras' version is also a strict superset on network resilience (`try` 6 vs 2, `timeout` 5 vs 4, `warnf` 5 vs 3, `GetRemote` 4 vs 1, plus a client-side unpkg fallback) and adds `src=` for a local spec. `make framework-test` after deletion: 2455 passed, 0 failed (4 flaky, all `console-errors` on unrelated pages) |

**Resolved (v0.2.0-beta.3):** `layouts/docs/single.html` and `layouts/docs/list.html`
deleted, replaced by the five slot overrides above. Verified feature-by-feature on a
before/after `--gc --minify` build: the custom navbar (1,512 pages), chatbot (1,492),
section cards (477 pages / 2,091 links / 510 grids) and page descriptions (841) all carry
**identical counts**, and no page vanished. The hand-rolled section-card block in the old
`list.html` was dropped in favour of the module's `auto-section-cards.html`, which is a
strict superset of it (same markup and badges, plus SVG/data-icon support). The inline
`padding-top: 2.5rem` moved to `assets/css/custom.css` behind an `agw-docs-topgap` hook
class supplied by the width-class slot — note that if this site ever enables docTabs, the
module emits an inline `padding-top` on the same element and inline wins, so that rule
needs revisiting at that point. 1,705 content + static + browser specs pass.

**Resolved (v0.2.0-beta.2) — the two forks that were previously marked KEEP:**

- `layouts/_shortcodes/link-hextra.html` (940B). Previously KEEP, because deleting it against
  an older pin rewrote links on **913 pages** from `/docs/kubernetes/1.0.x/setup/gateway/` to
  `/latest/setup/gateway/`, a 404. The version-root fix in beta.2 removes that. Verified by a
  before/after `hugo160 --gc --minify` build: **356 of 1,516 pages differ, 535 href changes,
  every one a trailing slash being ADDED** — zero links retargeted, zero link-count changes.
- `assets/js/flexsearch.js` (20,929B). The entire fork existed for one expression: extras read
  `site.Params.versions`, agw reads `site.Params.sections.*.versions` keyed on `linkVersion`.
  extras now walks both and keys on `linkVersion | default .version`, matching what
  `utils/warn-missing-description.html` already did. Verified: the built search bundle keeps
  the **same fingerprint hash** with the fork gone, i.e. byte-identical output.

1,699 content + static specs pass on the fork-free build, and the build's warning count is
unchanged. Note that this repo's `Makefile` has **no `framework-test-content` target** (kgw
has one), so the content project has to be run by hand from the extras checkout — worth
adding.

**Resolved 2026-08-07 — the image shortcodes, which had to move as a set:**
`reuse-image.html` and `reuse-image-dark.html` were deleted, along with the
`.light-only` / `.dark-only` CSS block in `custom.css` and the two hand-written `<div>`s in
`content/docs/_index.md` that used those class names. They could not be split: extras emits
`class="reuse-image-nodark"` on the light image and `class="toggle-light"` on the dark one,
and the rule that stops both showing at once is
`.dark .reuse-image-nodark:has(+ .toggle-light) { display: none }`. agw's forks emitted
`dark-only` instead, styled by its own CSS. Deleting either shortcode alone would have left
one image unpaired and rendered both in dark mode. Verified in a headless browser on
`/docs/standalone/latest/operations/debug/`: exactly one figure visible in light and one in
dark, in both directions.

### agentregistry-oss-website

**Now completely clean: zero of everything** — no same-path shadows, no duplicated
selectors, no contract divergences, no slot overrides.

**Resolved (v0.2.0-beta.3), and the premise was backwards.** This entry used to read
"`assets/css/main.css` at 1863B against extras' 13368B — worth checking whether that is
intentional or is silently dropping theme CSS." It was neither. The two files have nothing to
do with each other:

- agentregistry's is a **Tailwind entry point** (`@import "tailwindcss"`, `@source
  "hugo_stats.json"`, brand keyframes, HSL design tokens), read by that repo's own
  `layouts/_partials/css.html`. **No other consumer ships a `css.html`, and neither does
  Hextra 0.12.3** (its entry is `assets/css/styles.css`; it has no `main.css` at all). So
  agentregistry is not overriding a theme file — it is supplying the only file that reads
  that path.
- extras' was **668 lines of marketing CSS** (proxima-nova, 4rem `h1`, `.p-lead`) dating from
  the "First draft" commit, and **loaded by no template in any of the seven repos or in
  Hextra.** Verified by grepping every `resources.Get`/`Match` call for CSS across all of
  them: every lookup is by explicit path and none is `css/main.css` except agentregistry's.

So the fix was to delete **extras'** copy, not to touch agentregistry's. Verified by build:
the fixture is unchanged (0 non-`llms.txt` diffs) and agentregistry's build differs only in
11 `llms.txt` timestamps — **0 HTML pages, 0 CSS files**, with its own Tailwind bundle keeping
the identical fingerprint `main.7a32dc4c…css`. The docs hub had already deleted its
byte-identical copy of the same dead file, with no effect, which corroborates this.

**Lesson worth keeping:** a byte-count gap between two files at the same path is not evidence
of drift. These two shared a filename and nothing else. Same mistake shape as the `link-hextra`
"587B stub vs 6KB module file" reading, which also turned out to be wrong.

### kagent oss and ambientmesh.io

**kagent oss' Hugo root is `docs-site/`, not the repo root.** The repo root is a
Next.js marketing site (`next.config.mjs`, `open-next.config.ts`, no `go.mod`) — the Hugo
docs, `go.mod`, and the extras pin all live under `kagent-oss-website/docs-site/`. Point
`scan:overrides` (and any manual `hugo`/`git` check) there, or it looks like this consumer
doesn't use the module at all. `tests/helpers/scan-overrides.ts` already knows this; this note exists so
a human doing the same check by hand doesn't draw the same wrong conclusion.

No same-path shadows and no contract divergences. One accepted duplicated selector, on
ambientmesh only:

| Selector | Why it stays |
| --- | --- |
| `custom.css :: .nav-container` | `font-family: Figtree` where extras sets `Open Sans`. ambientmesh's brand font, deliberately different |

`print-book.css` (the Paged.js PDF-export book pipeline, `layouts/docs/list.book.html`) used
to be listed here as an ambientmesh-only override; both files now live in this module
(`assets/css/print-book.css`, `layouts/docs/list.book.html`) since the pattern proved out, so
there's no longer a same-path shadow to note — ambientmesh.io carries no local copy of either.
The pipeline's `scripts/render-pdf.mjs` followed the same way, but isn't a module mount at all
(`module.mounts` in `hugo.toml` only covers `layouts`/`assets`/`data`) — a consumer's Makefile
curls it from GitHub instead, pinned to its own `go.mod` version for this module, so there's
never a local copy to fall out of sync in the first place. See the CHANGELOG entry for details.

### The CSS duplication that used to be listed here, and why the count fell to one

An earlier revision reported 12 duplicated selectors on `agentgateway-oss-website`, 13 on
`kagent-oss-website` and 3 on `ambientmesh.io`, and concluded that `.hextra-toc` "is
redefined divergently by four of the six consumers, which suggests extras' own rule may be
the wrong default." **That conclusion was wrong, and so were most of the counts.**

The scanner compared SELECTOR NAMES, not properties. extras sets
`.hextra-toc { display: none }`; the four consumers set `font-family` on the same class
from a Tailwind `styles.css`. Different properties never collide, so nobody was overriding
anything. `scan-overrides.ts` now compares property-by-property and reports three separate
buckets — *redundant* (same value, safe to delete), *DIVERGENT* (a shared property really
differs), and *shared-name only* (ignore).

Against the corrected scanner the real figures were 10 conflicts each on agentgateway-oss
and kagent-oss — the identical block, copy-pasted between the two sites — of which only
three carried a genuinely different value. Those were resolved in favour of the module:

| Selector | Resolution |
| --- | --- |
| `.nav-container`, `.hextra-tabs-toggle`, `.hextra-tabs-toggle:hover`, `.dark .hextra-tabs-toggle`, `.dark .hextra-tabs-toggle:hover` | byte-identical to extras — deleted |
| `.sidebar-link.sidebar-active-item` | `#1e40af` vs extras' `rgb(30, 64, 175)`, the same colour — deleted |
| `.dark .sidebar-link.sidebar-active-item` | same colour but `!important`. Measured inert (computed style unchanged after deletion) — deleted |
| `.hextra-tabs-toggle[data-state="selected"]` (+ `.dark`) | underline hardcoded `hsl(212,100%,50%)`; extras uses `var(--theme-primary)` — deleted, underline now follows the brand token and adapts in dark mode |
| `.section-cards` (+ both media queries) | `margin-top: 1rem` vs extras' `1.5rem` — deleted, extras wins |

Verified by computed-style diff on a real minified `agentgateway-oss-website` build across
two pages in both colour schemes: **6 differences across 12 snapshots, all three intended
changes × light and dark, nothing incidental.** Note `!important` is treated as part of the
value by the scanner, so a rule matching extras' colour but adding `!important` still
reports DIVERGENT — deleting it changes what wins against other sheets even when the
declared value matches.

## Enforcement

This document is the prose half of a two-part inventory. The machine half is
`tests/helpers/override-baseline.json`, and `tests/override-parity.spec.ts` holds the two
together as a **one-way ratchet**:

- a shadow that is not in the baseline **fails** — adding one has to be deliberate;
- a baseline entry a consumer no longer has **also fails**, so the list shrinks as
  consumers are cleaned up instead of silently going stale;
- every consumer with accepted shadows must have a section here, and every same-path
  shadow must be named **inside that consumer's own section** — a document-wide name match
  was too weak, since `kgateway-oss` and `agentgateway-oss-website` both fork
  `navbar.html` and one mention would have vacuously satisfied both.

**The cross-repo half does not run in CI**, because it needs the consumer clones as
siblings. It is a pre-release check for a developer machine. The scanner's own unit tests
do run everywhere, since a false negative there disarms everything else.

## How to use this before shipping a theme change

1. Run `npm run scan:overrides` and `npx playwright test --project=static --grep
   "override-parity"`, and confirm nothing new appeared.
2. For every file or selector the change touches, check this inventory for a shadow.
3. If a shadow exists, the consumer needs a paired change in the same release — a pin bump
   alone will not take effect, and may make things worse (see the ordered-list fix).
4. Verify on a real consumer build, not only the fixture. See the verification standard in
   the Phase 3 plan: build all eight docs products plus kgw-oss and agw-oss against a local
   `replace`, sweep the built HTML for the invariants touched, and spot-check visually.
