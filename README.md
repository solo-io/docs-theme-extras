# docs-theme-extras

A Hugo theme module that overlays [Hextra](https://github.com/imfing/hextra)
with shared shortcodes, partials, and CSS used across Solo's documentation
sites — plus a bundled HTML test harness that any consumer repo can
re-run against its own built `public/`.

Two faces, one repo:
- **Hugo theme module** — consumers import this via `go.mod`. Hextra
  comes along as a transitive dependency.
- **Playwright HTML-only harness** — consumers point it at their built
  output via `make test CONFIG=path/to/.docs-test.toml`.

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
# docs (enterprise)
[params.themeExtras]
  brand = "enterprise"

# agentgateway-oss-website
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

- `siteParams` — used by solo-io/docs (`docs.solo.io/<product>/<version>/...`,
  with `/docs/` in the domain). Reads `Site.Params.{folder, currentProduct,
  buildCondition, versions}`.
- `url` — used by agentgateway-oss-website (`agentgateway.dev/docs/<section>/<version>/...`).
  Parses `Page.RelPermalink`.

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
hugo mod get github.com/solo-io/docs-theme-extras@v0.1.0
hugo mod tidy
```

Use an explicit version tag, never `@latest` or a branch name. The pin
makes "did the module change or did content change?" debuggable when CI
goes red.

### 2. Declare your brand

```toml
[params.themeExtras]
  brand = "oss"          # or "enterprise"
  pageContextMode = "url"  # or "siteParams"
```

### 3. Run the harness in CI

Add a test config at the repo root:

```toml
# .docs-test.toml
version   = "1"
name      = "my-docs-site"
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

[allowlists]
hugoWarnings = []
```

In CI, after building your site:

```sh
git clone https://github.com/solo-io/docs-theme-extras
cd docs-theme-extras
make install
make test CONFIG=$GITHUB_WORKSPACE/.docs-test.toml
```

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
