---
title: Testing
description: >-
  Run the bundled harness against your own built site, and understand which specs apply.
weight: 40
---

## Run the harness locally

The local-invocation pattern depends on the consumer repo's setup. Two
working examples today:

**Pattern A — consumer ships Makefile targets that drive the harness
from a sibling clone.** Recommended for repos where multiple developers
will run tests regularly. Targets are prefixed `framework-test-*` so they
don't collide with the `test-*` namespace some consumers reserve for doc
tests (code blocks executed against a cluster):

```sh
# One-time: clone docs-theme-extras as a sibling
git clone https://github.com/solo-io/docs-theme-extras ../docs-theme-extras
cd <consumer-repo>
make framework-test-install        # npm + Playwright browsers in the sibling

# Build the test fixture / site, then run a project
make framework-test                # all projects (static, browser, cross-browser)
make framework-test-static         # fastest loop — ~2s after Hugo build
make framework-test-browser        # chromium only
make framework-test-cross-browser  # chromium + firefox + webkit
make framework-test-content CONTENT_DIR=<product>   # scope content scan to one product subtree (hubs)

# Override the sibling location if needed
make framework-test FRAMEWORK_EXTRAS_DIR=/abs/path/to/docs-theme-extras
```

The sibling-clone pattern, the `FRAMEWORK_EXTRAS_DIR` override variable,
and the per-target signatures are conventions a Makefile-shipping consumer
opts into. See `Makefile` examples in the consumer repos for the full template.

**Pattern B — consumer invokes the harness directly.** Works for any
consumer without Makefile scaffolding; useful as a starter or for
ad-hoc runs:

```sh
# One-time: clone docs-theme-extras as a sibling and install
git clone https://github.com/solo-io/docs-theme-extras ../docs-theme-extras
cd ../docs-theme-extras && npm ci && npx playwright install --with-deps chromium

# Build the consumer site, then run the harness against it
cd <consumer-repo> && hugo --gc --minify
cd ../docs-theme-extras && \
  DOCS_TEST_CONFIG=$(pwd)/../<consumer-repo>/.docs-test.toml \
  npx playwright test --project=static
```

Either pattern resolves `builtRoot` from the consumer's `.docs-test.toml`,
so any consumer can run the same harness against its own `public/` once
the config is in place.

## Why a consumer may run fewer specs than the module's self-test

A consumer that imports the module will see strictly fewer Playwright tests
than `make test-oss` / `make test-enterprise` runs against the bundled
fixture. This is by design, not a bug — different specs need different
inputs, and a real product site can't provide all of them.

Four mechanisms determine which specs run for a given `.docs-test.toml`:

### 1. Fixture-aware specs require `/everything/` and `/rebased/` pages

These specs were written against the bundled fixture, which contains a
`/everything/` page (calls every shortcode the framework cares about) and
a `/rebased/` page (alternate-render path). Each spec greps `target.pages`
for a URL ending in those segments; if neither match, the whole spec is
`test.skip`'d. Affected specs:

- `browser.spec.ts` — tabs, mermaid SVG, copy-md script, theme toggle, console errors
- `cross-browser.spec.ts` — same checks across chromium/firefox/webkit
- `presence.spec.ts` — DOM-structure assertions
- `auto-cards.spec.ts` — `<div class="hextra-cards">` child assertions
- `github-shortcode.spec.ts` — `{{</* github */>}}` rendered-body presence
- `versioning.spec.ts` — needs `/everything/` to exist under each declared version

To opt in, declare `[[pages]]` entries in your `.docs-test.toml` whose URLs
end in `/everything/` and `/rebased/`. Real product docs rarely have pages
that call every shortcode in one place, so most consumers leave these
specs off and rely on the module's own self-test for fixture-dependent
checks.

### 2. `[checks]` table can disable specs explicitly

```toml
[checks]
codeBlockIntegrity = false   # e.g. a consumer with a known backlog of fenced-block fragmentation
```

All checks default to enabled. Setting `false` skips that spec entirely.

### 2a. `[crawl].maxFiles` caps the browser crawl

```toml
[crawl]
maxFiles = 0   # 0 = unlimited; default 50
```

Only the browser crawl (`console-errors.spec.ts`, the `browser-crawl`
project) is capped — opening pages in Chromium is expensive, so it samples 50
by default. Set `maxFiles = 0` to open every built page. The cheap file-read
scans (`content` project) always walk every page regardless.
For the consumer's own build the static project already crawls
everything, so the default cap is the right choice.

### 3. `buildLog` enables hugo-warnings.spec

```toml
buildLog = "./.build.log"   # path the harness reads for Hugo warnings
```

The Hugo-warnings spec parses the build log for unallowlisted warnings.
If `buildLog` isn't set, the spec skips. The consumer's make/CI must
arrange for Hugo to write the log at that path (`hugo > .build.log 2>&1`).

### 4. `scanRoots` controls source-side lints

```toml
scanRoots = ["./content/docs"]
```

Source-tree lints (currently `curl-quotes.spec.ts`) walk every `*.md`
under each listed root. An empty or omitted list means the lint skips —
useful when a corpus has too many pre-existing violations to ratchet
in one go.

### What still runs without any of the above

Specs that operate on the whole built tree by crawling `builtRoot` work
for every consumer regardless of `[[pages]]`:

- `static.spec.ts` — shortcode delimiter leaks, raw markdown bleed,
  copy-as-md script presence, image alt text
- `contrast.spec.ts` / `viewport.spec.ts` (mostly) — sampled across
  crawled pages

So the floor for any consumer is structural HTML quality. Fixture-driven
interactive checks are bonus coverage that only the module's self-test
(or a consumer that ships a synthetic fixture page) can provide.
