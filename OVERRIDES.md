# Consumer overrides that shadow this module

Regenerate with `node tests/helpers/scan-overrides.mjs` from the repo root, with the
consumer clones as siblings. Snapshot taken 2026-08-05 against `docs-theme-extras` at
v0.1.26.

## Why this file exists

A change that is correct in extras can still be a regression on a consumer that carries
its own copy of the thing being changed. That is not hypothetical — it happened in
v0.1.26. The ordered-list counter fix was right in the module, but the docs hub duplicated
those rules in `assets/css/custom.css`, and `custom.css` is concatenated **after** the
module stylesheet, so an equal-specificity copy wins. With only the pin bumped, the hub got
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

| consumer | same-path shadows | duplicated selectors | of which divergent | contract divergences |
|---|---|---|---|---|
| docs | 8 (3 byte-identical) | **169** | 22 | 1 |
| kgateway-oss | 4 | 1 | 1 | 3 |
| agentgateway-oss-website | 8 | 12 | 8 | 5 |
| agentregistry-oss-website | 1 | 0 | 0 | 0 |
| kagent-oss-website | 0 | 14 | 9 | 0 |
| ambientmesh.io | 0 | 3 | 3 | 0 |

### docs — the big one

**169 duplicated selectors in `custom.css`, 147 of them byte-identical to extras.** This is
not a stray copy; it is a near-wholesale duplication of extras' CSS layer. The ordered-list
block fixed in v0.1.26 was *one of these*.

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

Same-path template shadows: `card.html`, `cards.html`, `gloss.html`, `table.html`.

**Resolved in v0.1.27:** the 169 duplicated selectors are gone (`custom.css` 26,997 →
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

`navbar.html` is a full fork with its own class vocabulary (`nav-container`, `dropdown`,
`github-white-icon`) rather than extras' (`hextra-nav-container`, `version-dropdown`,
`solo-sidebar-trigger-tabletonly`). `docs/single.html` and `docs/list.html` are missing
`page-badges`, `page-description`, `badge-*` and `section-card-badge` — so those extras
features do not render here at all. `link-hextra.html` is a 587B stub against extras' 6KB.

### agentgateway-oss-website

Eight same-path shadows. `reuse.html` is the known stale 59-line fork (single-row-only
table regex, no keepVersion, no version remap). `announcement.html` is a full fork
(`agw-banner*`). `docs/single.html` again drops the badge/description contract.
`flexsearch.js` is a near-copy that has drifted (20929B vs 20564B).

### agentregistry-oss-website

Cleanest — zero duplicated selectors, zero contract divergences. One same-path shadow:
`assets/css/main.css` at 1863B against extras' 13368B. Worth checking whether that is
intentional or is silently dropping theme CSS.

### kagent-oss-website and ambientmesh.io

No same-path shadows and no contract divergences, but both redefine extras selectors in
`custom.css` — kagent 14 (9 divergent, incl. `:root`, `.hextra-tabs-toggle*`,
`.section-cards`), ambientmesh 3 (all divergent: `.hextra-toc`,
`.sidebar-product-logo`, `.nav-container`). `.hextra-toc` is redefined divergently by
**four** of the six consumers, which suggests extras' own rule may be the wrong default
rather than four consumers each being wrong.

## How to use this before shipping a theme change

1. Re-run the scanner and confirm nothing new appeared.
2. For every file or selector the change touches, check this inventory for a shadow.
3. If a shadow exists, the consumer needs a paired change in the same release — a pin bump
   alone will not take effect, and may make things worse (see v0.1.26).
4. Verify on a real consumer build, not only the fixture. See the verification standard in
   the Phase 3 plan: build all eight docs products plus kgw-oss and agw-oss against a local
   `replace`, sweep the built HTML for the invariants touched, and spot-check visually.
