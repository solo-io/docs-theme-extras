# Test-harness hazards

Ways a test in this repo can pass while measuring nothing. Every entry below is
a **measured** failure from this codebase, not a hypothetical — each one produced
a confident, green, wrong result before being caught.

The common shape: **a scanner that finds zero targets is indistinguishable from
a scanner that finds zero problems.** Green is not evidence.

> **The rule this file exists for:** any new scanner, crawler or measurement
> spec must assert it found at least N targets. Without that, it certifies
> nothing while looking like it certifies everything.

---

## 1. A `scanRoots` path that does not exist

`solo-io/docs` shipped `scanRoots = ["./content/en/test", "./assets/conrefs/test"]`
— the extras fixture's paths, copy-pasted. Neither has ever existed in that repo.

Every source-scanning spec skips only when `scanRoots` is **empty**, so two
non-empty-but-missing entries sailed straight through. Six author-side lints
(`curl-quotes`, `tab-syntax`, `shortcode-args`, `heading-shortcode-id`,
`include-form`, `cascade-type`) walked **zero of 11,025 markdown files** and
reported green, for as long as the config had existed.

**Now guarded:** `config.ts` throws on a missing or non-directory scan root, and
`tests/scan-roots.spec.ts` catches the remaining case (a root that exists but
holds no markdown).

**Related, and not guarded by either:** a root that exists and holds markdown but
is *too narrow*. Both OSS consumers scanned `./content/docs` and silently omitted
`./assets`, leaving ~700 conref files unlinted — which is where reuse and gating
problems actually live. Nothing can detect this automatically; check the corpus
count that `scan-roots.spec.ts` logs against what you believe the repo contains.

## 2. `npx serve` returns a directory listing for paths containing a dot

Any URL whose final segment contains a `.` — `/gateway/1.22.x/`, `/kgateway/2.3.x/`
— gets a **directory listing**, not the page. A spec pointed at a version-root
landing therefore measures the listing and passes.

This bit three separate verification scripts in one effort.

Also: `npx serve -s` (SPA mode) **rewrites paths**, so a measurement can silently
resolve to `index.html` instead of the page you asked for.

## 3. `getComputedStyle` lies about counters

- `getComputedStyle(el, "::before").content` returns the **specified** value in
  Chromium, Firefox and WebKit — never the resolved counter glyph. A spec
  asserting on it can never fail.
- `getComputedStyle(ol).counterReset` and `getComputedStyle(li).counterIncrement`
  both report `none` in Chromium **while the implicit `list-item` counter is
  actively working**.

None of the three is evidence of anything. Use pixel comparison — and give it a
negative control (force a known-wrong glyph, require the pixels to differ), or an
occluded or mis-clipped box passes vacuously.

## 4. `file://` does not load absolute-href stylesheets

Measuring layout over `file://` reports **browser defaults**, because
`<link href="/css/...">` 404s. This produced a confident report of an 86px vs
54px spacing defect that exists in no real build; over HTTP the same measurement
was 114px vs 114px, identical.

**Never measure theme CSS over `file://`.** Serve it.

## 5. `--minify` changes what greps can find

`hugo --minify` **strips CSS comments** and **removes attribute quotes** (except
on multi-class values).

A check for whether a template branch was reachable grepped the built page for a
CSS comment from that branch, found none, and concluded the branch was dead code.
It was live. The before/after page diff caught it.

Consequences:
- HTML-scanning specs must be quote-agnostic (`class=["']?foo`).
- Never use a comment as a "did this render" marker.
- Hold `--minify` constant across any before/after comparison — and **build with
  it**, because an unminified build can show an effect production never sees
  (`&#10;` entities that minification decodes back to whitespace).

## 6. Fingerprinted assets accumulate

Hugo writes `en.search.min.<hash>.js`, and the previous build's file **stays on
disk**. A spec that globs the output directory can happily read a stale bundle
that no page loads, and pass.

**Resolve assets by following the `<script src>` on a real built page**, never by
globbing.

## 7. Markup inside an HTML comment is in the bytes but not on the page

A probe that greps built HTML counts `<!-- … -->` regions unless you strip them. Hugo expands
shortcodes **before** markdown, so a `{{< reuse >}}` inside a commented-out draft still runs and
its fully-rendered output lands in the file — inside the comment, invisible to the reader.

`copy-md-fidelity` reported six `mangled-table` defects on
`gateway/*/security/extauth/oauth/keycloak` this way: "page renders a data table but its markdown
has no GFM table row". It doesn't render one. The comment spans bytes 240061–253253 and the table
sits at 249032.

Two wrong diagnoses came first — "the table is ejected 22KB downstream" (no: the source puts it
there) and "blank lines are breaking the comment" (no: tested, removing them changes nothing).
Both were artefacts of reading the byte stream as if it were the rendered document.

**"Present in the served bytes" is not "rendered to the reader."** `stripHtmlComments` in
`tests/helpers/copy-md.ts` is the fix; use it in any new HTML probe.

## 8. Playwright `testMatch` is an explicit allowlist

Every project in `playwright.config.ts` lists specs by filename. **A new spec
silently does not run until it is added.** `tab-code-fences.spec.ts` sat in no
allowlist *and* carried a selector matching no fixture output — dead twice over,
green throughout.

## 9. Output shape cannot tell you how content was produced

A runtime diagnostic tried to detect "pre-rendered HTML arrived where raw
markdown was expected" by matching the shape of `.Inner`. On a full istio build
it scored **60 false positives and 0 true positives**: authored HTML and
pre-rendered HTML are the same bytes.

If a check cannot distinguish the two, it belongs in a source lint that can see
the original markdown, not in a runtime template.

## 10. A ratchet that counts the wrong thing trains people to ignore it

When the docs layouts grew extension slots, the override scanner counted a
sanctioned slot override the same as an unsanctioned layout fork. That would have
shown agentgateway.dev's shadow count going **up** (5 → 8) at the exact moment it
stopped forking two layouts.

A metric that rises when things improve gets ignored. Slots are now counted
separately from shadows.

## 11. Check which element owns the scroll before calling content unreachable

A reference table looked clipped: the Description column was cut mid-word on
every row. `.table-wrapper` — the div that exists *specifically* to scroll —
reported `scrollWidth == clientWidth` and `scrollLeft` stayed 0, so the finding
was written up as "115px of content unreachable".

Wrong element. Hextra renders content tables `display: block; overflow-x: auto`,
so the **`<table>`** was the scroller: `clientWidth 832, scrollWidth 947`, and
setting its `scrollLeft` moved it. The content was reachable the whole time,
behind a scrollbar nobody would think to look for.

When measuring overflow, walk up from the overflowing content and test every
ancestor's `scrollWidth`/`scrollLeft`, not just the one you expect to be the
scroller. And prefer a ground-truth measure that does not depend on guessing:
`max(cell.getBoundingClientRect().right) - table.getBoundingClientRect().right`
says whether content paints outside its box regardless of who scrolls.
