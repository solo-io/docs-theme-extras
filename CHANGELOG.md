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

- **The card-image fixture's "external URL" card now points at a real, published image (the solo-io org avatar) instead of a deliberately non-existent file.** The fixture previously used `…/solo-io/docs/main/does-not-need-to-exist.png`, which 404s by design — the spec only asserts the `src` passes through verbatim and never fetches it. But a manual visual scan of the `everything` page showed a broken image, which reads as a real defect. The new URL renders, so the scan stays clean; `tests/card-image.spec.ts` asserts the new literal `src`. (Fixture/test only — no shortcode behavior change. Tradeoff: the rendered image is now network-dependent, so an offline visual scan still shows it broken.)

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

- Replaced the sidebar with a unified mobile-aware implementation shared across kgateway.dev and agentgateway-oss-website.
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
maintained inline in [solo-io/docs](https://github.com/solo-io/docs) and
[agentgateway-oss-website](https://github.com/agentgateway/website).

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
