---
title: Consuming the module
description: >-
  Pin the module, declare a brand, add a test config, and wire CI.
weight: 20
---

## 1. Pin the version in your hugo config

```yaml
# hugo.yaml (or hugo.toml)
module:
  imports:
    - path: github.com/solo-io/docs-theme-extras
```

```sh
# During active development, track main:
hugo mod get github.com/solo-io/docs-theme-extras@main
hugo mod tidy
```

The module is still iterating quickly, so consumers track `main` for now.
Hugo's module system rewrites `@main` into a pseudo-version + commit SHA
in `go.mod` (e.g., `v0.0.0-20260508153012-abc1234def56`), so the pin is
still reproducible — bumping it is `hugo mod get …@main` again, which
shows up as a SHA change in the PR diff.

Once the module stabilizes, switch to explicit semver tags (`@v0.1.0`,
etc.) and treat `@latest` / floating branch refs as unsupported.

## 2. Declare your brand

```toml
[params.themeExtras]
  brand = "oss"          # or "enterprise"
  pageContextMode = "url"  # or "siteParams"
```

## 3. Add a test config at the consumer repo root

```toml
# .docs-test.toml
version   = "1"
name      = "my-docs-site"
brand     = "oss"        # or "enterprise"; matches params.themeExtras.brand
builtRoot = "./public"
baseURL   = "/docs"
buildLog  = "./build.log"

[[pages]]
url = "/docs/quickstart/"

[versioning]
versionFromPath = "^/docs/(?<version>v\\d+|main)/"
versions        = ["v1", "v2", "main"]

[checks]
codeBlockIntegrity = false

[allowlists]
hugoWarnings = []
```

## 4. Wire CI to check out the harness at the module pin

The harness lives here, in `tests/`. Each consumer's CI checks out
`solo-io/docs-theme-extras` at the SHA pinned in its own `go.mod` (the
pseudo-version that `hugo mod get` produced) so layouts and tests stay
in lockstep — bumping the module pin is one PR that updates both.

The minimum-viable workflow for a single-site consumer:

```yaml
# .github/workflows/framework-tests.yml
name: Framework tests
on: [pull_request, workflow_dispatch]
jobs:
  framework-test-static:
    runs-on: ubuntu-latest
    continue-on-error: true   # soft signal for the first ~week
    steps:
      - uses: actions/checkout@v6
      - uses: actions/setup-go@v6
        with: { go-version: 'stable', cache: false }
      - uses: peaceiris/actions-hugo@v3
        with: { hugo-version: '0.160.1', extended: true }

      - name: Resolve docs-theme-extras SHA from go.mod
        id: theme-sha
        run: |
          sha=$(grep "docs-theme-extras" go.mod | grep -oE '[0-9a-f]{12}' | head -1)
          echo "sha=$sha" >> "$GITHUB_OUTPUT"

      - uses: actions/checkout@v6
        with:
          repository: solo-io/docs-theme-extras
          ref: ${{ steps.theme-sha.outputs.sha }}
          path: docs-theme-extras

      - uses: actions/setup-node@v6
        with:
          node-version: '20'
          cache: 'npm'
          cache-dependency-path: 'docs-theme-extras/package-lock.json'

      - name: Build site
        run: hugo --gc --minify

      - name: Install harness deps
        working-directory: docs-theme-extras
        run: npm ci

      - name: Run static specs
        working-directory: docs-theme-extras
        env:
          DOCS_TEST_CONFIG: ${{ github.workspace }}/.docs-test.toml
        run: npx playwright test --project=static --reporter=list,html
```

### Static vs content: run content scanners on content PRs too

The harness splits into two file-scan projects, categorized by **what each
spec reads**:

- **`--project=static`** — every spec renders the theme's bundled **fixture**
  and asserts theme behavior (versioning, cards, sidebar, callouts, shortcode
  edge cases). Against a consumer's own build these `test.skip` (their fixture
  pages aren't in the consumer's `builtRoot`), so they carry signal only when
  **layouts** change. Gate on layout paths (`layouts/**`, `static/**`,
  `assets/css/**`, `assets/js/**`, `go.mod`, `hugo.yaml`).
- **`--project=content`** — every spec reads the consumer's **own** content:
  the built HTML tree (`markdown-leaks` rendering leaks; `missing-images`
  `<img>`/`<source>` references that resolve to an unpublished file;
  `copy-md-fidelity` copy-as-markdown output; `hugo-warnings` build-log
  warnings) or the markdown source (`curl-quotes`, `tab-syntax`,
  `shortcode-args`, `include-form`, `cascade-type` — all walk `scanRoots`).
  Pass/fail tracks content edits, so
  gate on **content paths AND layout paths** (`content/**`, plus your
  page/snippet roots such as `assets/<product>-docs/**`, plus the layout paths
  above) — content edits and layout edits both change what renders.

The categorization is by input, not by name: a spec that scans consumer
content belongs in `content` even if it feels "static." Because every `static`
spec skips against a consumer build, running `static` on a content PR is pure
no-op — so a content PR only needs `--project=content`, and only a layout PR
needs both.

The common trap this split fixes: a workflow gated only on `layouts/**`
never fires on a content-only PR, so the leak scan never runs on the exact
PRs that introduce content rendering breaks. The fix is just the trigger —
make sure `content` runs on content paths. The simplest wiring is a single
workflow gated on **content paths + layout paths** that builds once and runs
both projects in one step:

```yaml
    run: npx playwright test --project=static --project=content --reporter=list,html
```

Two viable wirings, both fine:

- **One workflow, both projects** (shown above) — simplest. Since every
  `static` spec skips against a consumer build, running it on a content PR is
  an instant no-op, and both projects share the one Hugo build (the slow
  part), so the waste is negligible. agw-oss's `framework-tests.yml` uses this.
- **Two path-filtered workflows** — a content workflow (`--project=content`,
  content + layout paths) and a layout workflow (`--project=static`, layout
  paths only). Slightly more config, but a content PR then runs only the specs
  that can actually fail on it. Prefer this if you want the CI summary to show
  only relevant checks per PR.

Multi-product hub repos (one site, many product subpaths) run the same
`content` project **per product** via a matrix, setting `CONTENT_DIR=<product>`
so each job scans only that product's subtree of `builtRoot`. They add extra
jobs for `--project=browser`, plus per-product artifact downloads in place of
the inline `hugo` build step. (`CONTENT_DIR` replaced the former dedicated
"smoke" project + `SMOKE_PRODUCT` env — the built-HTML checks now live in
`content`, scoped by directory.)
