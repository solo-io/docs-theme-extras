# docs-theme-extras

A Hugo theme module that overlays [Hextra](https://github.com/imfing/hextra)
with shared shortcodes, partials, and CSS used across Solo's documentation
sites — plus a bundled HTML test harness that any consumer repo can
re-run against its own built `public/`.

Two faces, one repo:
- **Hugo theme module** — consumers import this via `go.mod`. Hextra comes along as a transitive dependency.
- **Playwright HTML-only harness** — consumers point it at their built output via `make test CONFIG=path/to/.docs-test.toml`.

> [!TIP]
> **Authoring content, or wiring this module into a repo?** The reference is the
> docs site: <https://solo-io.github.io/docs-theme-extras/>. It covers call
> form, render hooks, gating, every shortcode's parameters, the
> `params.versions` contract, logos, pinning the module, and running the
> harness. Preview it from a clone with `make server-docs`.
>
> **Changing this module?** See [MAINTAINING.md](./MAINTAINING.md) for the
> shortcode comment-header contract and for the Hextra files this module
> shadows.

> [!WARNING]
> Writing a scanner, crawler or measurement spec? Read
> [tests/HAZARDS.md](./tests/HAZARDS.md) first. It catalogues eleven ways a test in
> this repo has passed while measuring **nothing** — each one a real incident, not
> a hypothetical. The worst of them hid six lints walking zero of 11,025 files.
> **Assert that your scanner found at least N targets**, or it certifies nothing
> while looking like it certifies everything.

## Architecture

```
   github.com/imfing/hextra
            │
            │  hugo module import
            ▼
    docs-theme-extras
       │   │   │
       │   │   └── tests/         Playwright HTML-only harness (17 specs)
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
├── USAGE.md                        Stub. Points at the docs site; kept so old
│                                   inbound links keep resolving
├── MAINTAINING.md                  For people CHANGING the module: the shortcode
│                                   comment-header contract, and the Hextra files
│                                   this module shadows
├── docs/                           The module's own docs site (hugo-docs.toml).
│   ├── content/                    Hand-written pages, plus a GENERATED
│   │                               shortcode reference under authoring/
│   ├── layouts/                    Consumer-side bootstrap (custom/head-end)
│   └── static/                     Logos, favicon passthrough
├── OVERRIDES.md                    Per-consumer inventory of files that shadow
│                                   this module, with a measured verdict each
├── tests/HAZARDS.md                Ways a test here can pass while measuring
│                                   NOTHING. Read before writing a scanner
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
│   └── shortcodes/                 21 shortcodes (alert, callout, version, ...)
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
│   ├── *.spec.ts                   specs (content, static, browser, ...)
│   └── helpers/                    config, target, crawl, shortcodes, ...
│
├── static/test/readfile-sample.txt Top-level path for Hugo's readFile
│                                   (filesystem-path, not module-mount)
│
└── .github/workflows/self-test.yml CI: runs make test-all on PRs
```

## License

Apache 2.0 — see [LICENSE](LICENSE).
