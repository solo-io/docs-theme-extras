# docs-theme-extras

A Hugo theme module that overlays [Hextra](https://github.com/imfing/hextra)
with shared shortcodes, partials, and CSS used across Solo's documentation
sites — plus a bundled HTML test harness that any consumer repo can
re-run against its own built `public/`.

Two faces, one repo:
- **Hugo theme module** — consumers import this via `go.mod`. Hextra comes along as a transitive dependency.
- **Playwright HTML-only harness** — consumers point it at their built output via `make test CONFIG=path/to/.docs-test.toml`.

## Architecture

```
   github.com/imfing/hextra
            │
            │  hugo module import
            ▼
    docs-theme-extras
       │   │   │
       │   │   └── tests/         Playwright HTML-only harness (12 specs)
       │   │       helpers/       config loader, crawl, target, shortcodes
       │   │
       │   └── layouts/           shortcodes, partials, _markup hooks,
       │       │                  default+docs/ layouts
       │       └── partials/utils/page-context.html  ← dual-mode (url|siteParams)
       │
       └── assets/css/
           ├── docs-theme-extras.css   always loaded; component baseline
           ├── brand-oss.css           loaded when brand=oss
           ├── brand-enterprise.css    loaded when brand=enterprise
           └── custom.css              per-repo slot (consumer overrides last)
```

### CSS layer order

A page rendered against this module loads CSS in this order:

1. Hextra's compiled bundle (Tailwind + theme defaults)
2. `docs-theme-extras.css` — component-level styling for `.version-dropdown`,
   `.copy-md-btn`, `.section-card`, breadcrumb, sidebar, TOC, etc. Uses
   CSS custom properties (`--theme-primary`, `--theme-primary-hover`,
   `--theme-primary-tint`) with neutral defaults.
3. `brand-{oss,enterprise}.css` — overrides the theme vars and adds
   brand-specific font-family rules. Ships in this module; consumers
   opt in via a single config flag (see below).
4. The consumer's own `assets/css/custom.css` — per-repo overrides
   (Hextra concatenates this into its main bundle, so it loads earlier
   in HTML order; rules with higher specificity or later cascade order
   still win on conflicts).

### Brand mechanism

Each consumer declares one of two brand variants (or leaves it unset):

```toml
# Enterprise consumer
[params.themeExtras]
  brand = "enterprise"

# OSS consumer
[params.themeExtras]
  brand = "oss"

# A new consumer with no brand layer
# (omit themeExtras.brand entirely)
```

The module's `head-end.html` partial reads the flag and conditionally
links the matching `brand-*.css` file. Brand swap is one config change;
the module's component CSS is unchanged.

| | OSS | Enterprise |
|---|---|---|
| Primary | `hsl(212, 100%, 45%)` | `#158bc2` |
| Body / heading font | Open Sans | Apple system stack |
| Heading colors | (inherits theme) | `#253e58` light / `#fff` dark |
| Link colors | inherits `--theme-primary` | `#158bc2` / `#106a94` |

### Page-context partial

Some shortcodes need to know the page's section / version / build
condition (e.g., `conditional-text`, `version`, `link-hextra`). Two
URL conventions exist across consumers:

- `siteParams` — for multi-product hubs that mount each product at
  `<host>/<product>/<version>/...` and surface that mapping via
  `Site.Params.{folder, currentProduct, buildCondition, versions}`.
- `url` — for single-site repos where the URL itself encodes section
  and version (e.g., `<host>/docs/<section>/<version>/...`). Parses
  `Page.RelPermalink`.

Each consumer picks one in their hugo config:

```toml
[params]
  pageContextMode = "siteParams"  # or "url"; default "url"
```

Shortcodes that need page context call `partial "utils/page-context" .`
and read `.section`, `.version`, `.condition`, `.prefix` from the
returned dict. Each branch handles one convention.

## Consuming this module

### 1. Pin the version in your hugo config

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

### 2. Declare your brand

```toml
[params.themeExtras]
  brand = "oss"          # or "enterprise"
  pageContextMode = "url"  # or "siteParams"
```

### 3. Add a test config at the consumer repo root

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
crossBrowser = false
smoke        = false      # set true only for cross-product hub repos

[allowlists]
hugoWarnings = []
```

### 4. Wire CI to check out the harness at the module pin

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

Multi-product hub repos (one site, many product subpaths) use the same
pattern with extra jobs for `--project=browser` and a smoke matrix per
product, plus per-product artifact downloads in place of the inline
`hugo` build step.

### 5. Run the harness locally

The local-invocation pattern depends on the consumer repo's setup. Two
working examples today:

**Pattern A — consumer ships Makefile targets that drive the harness
from a sibling clone.** Recommended for repos where multiple developers
will run tests regularly:

```sh
# One-time: clone docs-theme-extras as a sibling
git clone https://github.com/solo-io/docs-theme-extras ../docs-theme-extras
cd <consumer-repo>
make test-install        # npm + Playwright browsers in the sibling

# Build the test fixture / site, then run a project
make test                # all projects (static, browser, cross-browser)
make test-static         # fastest loop — ~2s after Hugo build
make test-browser        # chromium only
make test-cross-browser  # chromium + firefox + webkit
make test-smoke PRODUCT=<name>     # multi-product hubs only

# Override the sibling location if needed
make test THEME_EXTRAS_DIR=/abs/path/to/docs-theme-extras
```

The sibling-clone pattern, the `THEME_EXTRAS_DIR` override variable, and
the per-target signatures are conventions a Makefile-shipping consumer
opts into. See `Makefile` examples in the consumer repos for the full
template.

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

## Local development of this module

```sh
make install                # npm dependencies

# Local dev preview, brand-conditional
make server-oss             # http://localhost:1313/  (OSS brand)
make server-enterprise      # http://localhost:1313/  (enterprise brand)

# Static brand builds (production-shaped baseURL=/test)
make build-oss              # → public-oss/test/
make build-enterprise       # → public-enterprise/test/

# Self-test against the bundled fixture
make test-oss          # build-oss + harness
make test-enterprise   # build-enterprise + harness
make test-all          # both — CI default

# Generic harness against any pre-built site
make test CONFIG=/path/to/consumer-repo/.docs-test.toml

make clean                  # wipe build outputs and test reports
```

The dev server uses `baseURL = "/"` (via `hugo-{oss,enterprise}-local.toml`)
because Hugo's dev server gets confused by path-only baseURLs. The static
builds use `baseURL = "/test"` to match the URL shape consumer repos
emit in production.

If you switch brands and the dev preview still looks like the previous
brand, the make targets auto-clear Hugo's `resources/` cache and pass
`--ignoreCache`. You may also need to hard-reload the browser
(Cmd+Shift+R) — Hugo re-emits CSS at the same URL paths so a soft
reload reuses the cached version.

## Repo layout

```
.
├── go.mod                          Hugo module declaration
├── theme.toml                      Hextra-style theme metadata
├── package.json                    Playwright + serve + smol-toml
├── playwright.config.ts            Reads DOCS_TEST_CONFIG TOML
├── Makefile                        Build + test targets
├── README.md
├── LICENSE                         Apache-2.0
├── MIGRATION_AUDIT.md              Phase-0 audit (kept for reference)
│
├── hugo-oss.toml                   Static build, brand=oss
├── hugo-oss-local.toml             Dev server, brand=oss
├── hugo-enterprise.toml            Static build, brand=enterprise
├── hugo-enterprise-local.toml      Dev server, brand=enterprise
│
├── layouts/                        Module's overlay on top of Hextra
│   ├── _markup/                    render-link, render-table hooks
│   ├── default/list.html           Auto-card section index
│   ├── docs/{single,list}.html     Doc page templates
│   ├── partials/                   Navbar, sidebar, breadcrumb, copy-md, ...
│   │   └── utils/page-context.html Dual-mode partial (url|siteParams)
│   └── shortcodes/                 19 shortcodes (alert, callout, version, ...)
│
├── assets/                         Top-level CSS/JS shared by all builds
│   ├── css/{docs-theme-extras,brand-oss,brand-enterprise,custom}.css
│   └── js/{flexsearch.js,core/toc-scroll.js}
│
├── fixture/                        Bundled fixture content + assets
│   ├── content/en/test/{v1,v2,main}/{everything,rebased,_index}.md
│   ├── assets/conrefs/test/        Master conref + snippets
│   ├── assets/test/openapi/
│   ├── static/                     Static files (images, logos, openapi)
│   └── .docs-test-{oss,enterprise}.toml   Harness config per brand
│
├── tests/                          Playwright specs
│   ├── *.spec.ts                   12 specs (smoke, presence, versioning, ...)
│   └── helpers/                    config, target, crawl, shortcodes, ...
│
├── static/test/readfile-sample.txt Top-level path for Hugo's readFile
│                                   (filesystem-path, not module-mount)
│
└── .github/workflows/self-test.yml CI: runs make test-all on PRs
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
