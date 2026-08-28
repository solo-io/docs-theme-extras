---
title: PDF export
description: >-
  Stitch a docs section into one paginated PDF with the book output format and
  render-pdf.mjs.
weight: 30
---

A docs section can ship a downloadable PDF alongside the site. The module
provides the Hugo half — a `book` output format template that stitches every
page under a section into one long print document, plus the print stylesheet.
The consumer provides the Node half that paginates it and prints it.

> [!IMPORTANT]
> This pipeline is proven on a flat site (ambientmesh.io, one book) and on a
> versioned one (kgateway.dev, 14 chunks merged into a 1,828-page PDF). On a
> versioned site, opt **one version tree in at a time**. A book stitches
> whichever page opts in plus that page's own subtree, so version scoping falls
> out of where the opt-in lives rather than needing any version logic of its
> own. The one piece that is still not version-aware is the version string
> printed on the cover and in the running footer. See
> [Known limitations](#known-limitations).

## How the pieces split

The split is not arbitrary, and knowing it saves an afternoon of wondering why
importing the module did not give you a PDF.

| Piece | Lives in | Why |
| --- | --- | --- |
| `docs/list.book.html`, `docs/single.book.html`, `_partials/docs/book-document.html` | **This module** | Ordinary layouts, so `module.mounts` carries them |
| `assets/css/print-book.css` | **This module** | Ordinary asset, linked by the book document itself |
| The `outputFormats` block | **Your repo** | Hugo does **not** merge top-level `outputFormats` config from an imported module |
| `outputs: ["html", "book"]` front matter | **Your repo** | Per-page opt-in |
| `scripts/render-pdf.mjs` | Fetched from this repo | See [Fetching the renderer](#fetching-the-renderer) |
| `playwright`, `pdf-lib` | **Your repo's** `package.json` | Node resolves `node_modules` relative to the invoking project, not to wherever the script was downloaded |

## 1. Define the output format

In your own Hugo config. Three keys is the whole requirement:

```toml
[outputFormats.book]
  mediaType = "text/html"
  baseName  = "book"
  isHTML    = true
```

```yaml
# hugo.yaml
outputFormats:
  book:
    mediaType: text/html
    baseName: book
    isHTML: true
```

`baseName` is what produces `book.html` next to the section's `index.html`.

> [!WARNING]
> Define it in **every config that builds the opted-in content**, not just the
> production one. A repo with `hugo-<product>.toml`, `hugo-preview-<product>.toml`,
> and `hugo-local-<product>.toml` needs the block in all three. The `outputs`
> front matter is a property of the page, so it applies to every build, and a
> config missing the format fails the **entire** build, not just the PDF:
>
> ```
> ERROR error building site: assemble: failed to create page from pageMetaSource
> /latest: failed to resolve output formats [html book]:
> OutputFormat with key "book" not found
> ```
>
> This is easy to miss locally, because the config you test with is usually the
> one you remembered to edit. It surfaces in CI as a broken preview build on a
> PR that looks like it only touched PDF plumbing.

## 2. Opt a page in

```yaml
---
title: Documentation
outputs: ["html", "book"]
---
```

A section page (one with its own `_index.md`) renders through
`list.book.html`; a leaf page renders through `single.book.html`. Both exist
because Hugo resolves an output format's template per page **kind**.

> [!WARNING]
> A leaf page that opts in when no `single.book.html` is reachable **silently
> falls back to the site's normal HTML template** instead of erroring. You get a
> `book.html` that looks plausible and is not a book document at all. The tell is
> a missing `paged.polyfill.js` script tag — see [Verifying](#verifying-the-output).

## 3. Add the dependencies

```sh
npm install --save-dev playwright pdf-lib
npx playwright install chromium
```

The script imports from `playwright`, not `@playwright/test`. A repo that
already has the test package still needs this one.

The second command is separate on purpose. Installing the `playwright` package
does not download a browser binary, so a machine that has never run Playwright
gets a launch failure rather than a PDF. A repo whose Playwright browsers are
already installed for a test harness needs nothing extra, which is why this step
is easy to miss locally and then fail in CI.

Paged.js is loaded from a CDN by the book document itself, so it is **not** an
npm dependency. A `pagedjs` entry in `package.json` is unused weight.

## 4. Fetching the renderer

`scripts/render-pdf.mjs` is **not** a module mount. `module.mounts` covers only
`layouts`, `assets` and `data`, so the file rides along in this repo purely as
fetchable content.

Fetch it pinned to the version your `go.mod` already requires, so the `go.mod`
bump stays the single version pin and there is no second Makefile variable to
drift out of sync with it:

```make
RENDER_PDF_VERSION := $(shell awk '/solo-io\/docs-theme-extras/ {print $$3}' go.mod)
RENDER_PDF_SCRIPT  := .pdf-tools/render-pdf-$(RENDER_PDF_VERSION).mjs

pdf:
	@mkdir -p .pdf-tools
	@test -f $(RENDER_PDF_SCRIPT) || curl -fsSL \
	  https://raw.githubusercontent.com/solo-io/docs-theme-extras/$(RENDER_PDF_VERSION)/scripts/render-pdf.mjs \
	  -o $(RENDER_PDF_SCRIPT)
	PDF_PROD_HOST=https://example.com node $(RENDER_PDF_SCRIPT)
```

The version is part of the cached filename, so a pin bump fetches a new copy
instead of reusing a stale one.

## 5. Run it

Build the site first — the script serves the built `public/` directory itself.

| Variable | Required | Default | What it does |
| --- | --- | --- | --- |
| `PDF_PROD_HOST` | **yes** | — | The site's real origin, for rewriting internal links |
| `PDF_BOOK_PATH` | no | `/docs/book.html` | Single-document book |
| `PDF_BOOK_PATHS` | no | — | Comma-separated, ordered. Chunked book; see below |
| `PDF_OUTPUT` | no | `public/downloads/docs.pdf` | Output path |

`PDF_PROD_HOST` is required rather than defaulted, deliberately. Internal links
in the book resolve relative to wherever the document is loaded from — the
script's own throwaway local server — so without rewriting them against the real
origin they would point at a dead `http://127.0.0.1:<port>/` URL once the PDF is
downloaded and the server is gone. Failing loudly beats shipping a PDF full of
links to nowhere.

Both shipped consumers read `PDF_PROD_HOST` out of the site config rather than
hardcoding it twice, which keeps one origin to change when a domain moves:

```make
PDF_PROD_HOST := $(shell yq '.params.themeExtras.prodHost' hugo.yaml)
```

> [!NOTE]
> If your live site links a specific filename, pass `PDF_OUTPUT` explicitly on
> every invocation that feeds a real build. Do not rely on the default.

The output lands directly in `public/`, which a plain `make build` does not
touch, so the PDF is in the same tree that gets deployed. Order the target so
Hugo runs first and the renderer second, since the renderer reads the built
`public/` rather than producing it.

### The dev server never sees it

`hugo server` renders in memory, so there is no `public/` tree for the renderer
to read and no `public/downloads/` for the dev server to hand back. A download
link is a 404 during local preview unless the PDF is written to `static/`
instead, which the dev server serves verbatim:

```make
serve:
	hugo --gc --minify
	PDF_OUTPUT=static/downloads/docs.pdf $(MAKE) render-pdf
	hugo server
```

For that override to reach the script, the `render-pdf` target has to leave
`PDF_OUTPUT` overridable. A recipe that assigns it inline on the `node` command
wins over the environment and silently discards the caller's value, so declare
it as a `?=` variable instead:

```make
PDF_OUTPUT ?= public/downloads/docs.pdf

render-pdf:
	... PDF_OUTPUT=$(PDF_OUTPUT) node $(RENDER_PDF_SCRIPT)
```

The PDF written this way is a snapshot as of server startup. Content edited
during the session does not reach it until the target is rerun.

### Nothing links to the PDF for you

Generating the file is the whole of what this pipeline does. No layout, card, or
sidebar entry points at the result, so a site that renders a PDF and never adds
a link ships a file reachable only by guessing its URL. Add the download link
yourself, and point it at the same path `PDF_OUTPUT` writes to.

### Deploying it

The PDF exists only if the deploy build runs the renderer. A hosting provider
configured to run bare `hugo` produces a site with no PDF in it, no matter how
the Makefile is wired. Point the build command at one target that covers the
whole job instead:

```make
ci-build: hugo-install
	npm ci
	npx playwright install chromium
	$(MAKE) build HUGO=$(abspath bin/hugo)
```

Pinning Hugo inside that target, rather than in the provider's own settings,
earns the extra lines twice over: the version stops living in a dashboard nobody
reviews, and the same command reproduces the deploy locally. One caveat on such
an installer target is that Hugo ships the extended build as a tarball for Linux
and as a `.pkg` for macOS, so it works in a build image and not on a
contributor's Mac.

### What the script does

1. Serves the built `public/` on a throwaway local server.
2. Opens each book path.
3. Waits for every `.mermaid` element to gain `data-processed`, so pagination
   never runs against a half-rendered diagram.
4. Drives Paged.js manually. The book document sets `auto: false` precisely so
   pagination happens after the DOM is final rather than racing it.
5. Prints to PDF, rewriting internal links and building an outline
   (bookmark) tree from the chapter structure.

## Chunking a large docset

Paged.js has a real ceiling, but it is set by the **size of the stitched HTML**
rather than by the page count of the result. An earlier version of this page put
it at "150–200 pages", which measurement disproves: kgateway.dev's `reference`
chunk is 584 KB of HTML and paginates to **363 pages** without complaint, and its
2.8 MB `traffic-management` chunk succeeds too, while the full 7.1 MB tree never
finishes. Watch input size, not output pages.

The ceiling does look inherent to monolithic CSS Paged Media rendering rather
than being a Paged.js defect. WeasyPrint, a completely separate implementation,
slows down on the same document in the same way. See
[Choosing a rendering engine](#choosing-a-rendering-engine).

Above that size, generate one book per top-level section and merge. Each chunk
root sets `bookChunkRoot: true` in addition to opting in:

```yaml
outputs: ["html", "book"]
bookChunkRoot: true
```

`bookChunkRoot` makes the opted-in page's **own** title render as the first
chapter and TOC entry before recursing into its children, instead of starting
silently at the children the way a true book root does. Without it, a merged
multi-chunk PDF loses its section groupings and reads as a flat run of
subsections with nothing marking which section each came from.

Then pass the chunks in order:

```sh
PDF_BOOK_PATHS=/docs/a/book.html,/docs/b/book.html node render-pdf.mjs
```

Each is rendered independently, then merged with `pdf-lib`, with each chunk's
outline page indices offset by the running page total so the bookmark tree stays
continuous.

`PDF_BOOK_PATH` (singular) keeps working for a single-document book and takes a
fast path that skips the merge entirely.

> [!TIP]
> **Set `outputs` and `bookChunkRoot` with `cascade`, not by hand on every
> section.** kgateway-oss first set both directly on each of its 14 chunk roots.
> A `cascade` block on the version root instead pushes both onto every direct
> child automatically, and a section added later picks them up with no content
> edit:
>
> ```yaml
> cascade:
>   - target:
>       path: "/docs/envoy/latest/*"
>     outputs: ["html", "book"]
>     params:
>       bookChunkRoot: true
> ```
>
> `outputs` is a reserved front-matter field and stays at the top level.
> `bookChunkRoot` is a custom one, read as `.Params.bookChunkRoot`. Hugo still
> routes an unnested custom key into `Params`, so the `params:` block is not
> strictly required, but writing it out says which of the two fields is which.
>
> That single path-segment glob matches direct children only — it does **not**
> reach two levels down. This is plain Hugo, not a module feature.
>
> `PDF_BOOK_PATHS` still has to be an explicit ordered list maintained by hand.
> Hugo has no query for "every page that opted into an output format", so a new
> section needs one manual addition there even with the cascade in place.

## Choosing a rendering engine

Paged.js is not the only way to turn the book document into a PDF, and the
alternatives get suggested often enough to be worth recording. These numbers come
from one afternoon's spike against real kgateway.dev content on 2026-08-27,
against `docs-theme-extras` v0.3.3. Two chunks were used as the benchmark:
`reference` (584 KB of stitched HTML, 246 tables) and `traffic-management`
(2.8 MB, 77 chapters).

| | Paged.js + Chromium (current) | WeasyPrint 69.0 | Pandoc 3.10.2 + TeX Live |
| --- | --- | --- | --- |
| `print-book.css` | Used as authored | Used as authored, **zero** unsupported-property warnings | Discarded; CSS has no role in a LaTeX pipeline |
| `string-set` running headers, `@bottom-*` boxes, `counter(page)` | Yes | Yes | Reimplement in a LaTeX template |
| Repeats `<thead>` when a table splits | **No** | **Yes** | Yes, via `longtable` |
| `reference` chunk | 363 pages | 404 pages, 12s | No PDF produced |
| `traffic-management` chunk | Renders | 595 pages, 25s | No PDF produced |
| Whole tree as ONE document (7.1 MB, 227 chapters) | Never completes (inherited claim, not re-measured here) | 1,879 pages, **~90s** | Not reached |
| Extra runtime dependency | Chromium | Pango, GLib | TeX Live, `rsvg-convert` |
| Client-side JS, for example mermaid | Renders it | Needs a pre-render step | Needs a pre-render step |

**WeasyPrint is the closest substitute, and it is the only one that removes the
chunking requirement.** It consumed `print-book.css` without a single
unsupported-property warning, including every paged-media feature the stylesheet
leans on, and it rendered the whole tree as one document where Paged.js cannot.

Rendering the whole tree in one pass is what makes the difference, because four
of the chunked pipeline's compromises exist only because of chunking:

| | Chunked, Paged.js | One document, WeasyPrint |
| --- | --- | --- |
| Table of contents | None; each chunk's own TOC is dropped as incomplete | Complete, whole book |
| Page numbers | Restart per chunk, hence the "Section N" footer label | Continuous, 1 to 1,879 |
| Bookmark outline | 14 top-level, hand-built via `pdf-lib` | 1,688 entries, generated by the renderer |
| In-PDF jumps | 1,386; cross-section links fall back to web URLs | 4,074 |

The renderer generating its own outline is worth noting on its own: the
hand-rolled PDF outline-dictionary code in `render-pdf.mjs` can be deleted
rather than ported.

The one prerequisite is **globally unique ids**. Hugo only guarantees heading
ids unique within their own source page, so the stitched tree carries 78
duplicated ids, `before-you-begin` alone appearing 112 times. Chunked, that was
survivable because every fragment lookup was scoped to the target chapter; in a
single document there is nothing to scope to, so ids have to be rewritten with
their owning chapter as a prefix, and links rewritten to match. That work ports
out of the browser cleanly. A ~150-line Python pass over the stitched HTML with
`lxml` does it in **0.3 seconds**, leaving zero duplicate ids and zero dangling
jumps.

Its one quality win independent of chunking is repeating table headers across
page breaks.

### Memory, and why a big book is still split

One document does not mean one render. Peak memory tracks **output pages**, not
input bytes, at a steady ~1.6 MB per page measured across cuts of the
gloo-mesh-enterprise book from 347 pages up to 3,481. That book is ~6,500 pages,
so a single render needs ~11 GB and a 16 GB GitHub runner is torn down
mid-render. The failure is unhelpful: the runner dies, so the job reports only
`The runner has received a shutdown signal` and exit 143, with no traceback and
no partial output.

So `prepare_book.py --max-part-bytes` (default 2 MB) cuts the prepared document
into parts, the caller renders them one at a time, and `merge_book.py`
reassembles the result. Input size is only a proxy for pages, and a leaky one:

| Content | Pages per MB | 2 MB part |
| --- | --- | --- |
| Ordinary prose | ~250 | ~500 pages, ~0.8 GB |
| Table-dense reference | ~620 | ~1,240 pages, ~2.0 GB |

The default is set for the table-dense case, since that is what actually
constrains it.

**Splitting is unconditional, and that is deliberate.** A small book yields one
part and a merge that is effectively a copy, so its output is unchanged. A
conditional split would mean two code paths, with the rarely-exercised one
belonging to the largest, slowest, least-frequently-run build.

Nothing is lost in the split, because WeasyPrint writes internal links as jumps
to **named** destinations and emits one for every element id, whether or not
anything links to it. Since the ids are already unique document-wide, the merged
file has one global namespace. The single gap is that WeasyPrint *drops*
`<a href="#x">` when `x` is not in the part being rendered, logging
`No anchor #x for internal URI reference`, so every jump is rewritten to a
`pdfjump:` URI that survives as an ordinary link annotation and becomes a real
jump again at merge time.

Two consequences worth knowing:

- **Parts must render sequentially.** Page numbers are baked in during layout,
  so each part needs the previous part's page count, supplied as
  `@page :first { counter-reset: page N }`. A bare `@page` resets the counter on
  *every* page, and `counter-reset` on `html` or `body` is ignored.
- **A chapter larger than the target is cut between its direct children**, never
  inside a table or `details`. Continuation slices are marked
  `pdf-chapter-cont` so they do not start a new page.

On the gloo-mesh-enterprise book this took peak memory from >15 GB to 2,134 MB
and total render time from 32+ minutes, never finishing, to 5m20s across 10
parts.

**Pandoc did not produce a PDF from this content at all.** Five configurations
were tried, and each fix surfaced the next failure: a missing `rsvg-convert`, then
emoji that `pdflatex` cannot typeset, then LaTeX's nested-list depth limit
("Too deeply nested"), then the `svg` package wanting `-shell-escape`, then a
`This can't happen (vertbreak)` internal error inside a table. The HTML-to-LaTeX
conversion itself always succeeded, in a few seconds. The wall is the LaTeX
compile meeting real documentation content. None of this proves Pandoc cannot be
made to work, and a custom template with Lua filters and content sanitizing
probably would, but that is a project rather than a swap, and it starts by
throwing `print-book.css` away.

> [!NOTE]
> Treat the timings as orders of magnitude, not benchmarks. They were taken in
> Docker Desktop on a laptop, where repeat runs of identical input ranged from
> 87s to 428s purely on VM contention. ~90s is the steady-state figure on an
> unloaded machine; a CI runner deserves its own measurement before anyone
> promises a number. The structural results (page counts, link counts, duplicate
> ids, which CSS is honored) are stable and repeatable; the clock is not.

## Linking to the published PDF

Set `params.pdfDownload` and the Copy-as-Markdown menu on every docs page gains a
**Download all docs (PDF)** item, next to Print:

```toml
[params.pdfDownload]
  urlTemplate = "https://github.com/solo-io/docs-pdfs/releases/download/{product}-{distribution}-{version}/{product}-{distribution}-{version}.pdf"
  distribution = "enterprise"
```

`{product}` comes from `params.pdfDownload.product`, falling back to
`params.currentProduct` and then `params.folder`. `{version}` is the version
segment of the current URL. Without `urlTemplate` the item does not render at
all, so a site that publishes no PDFs needs no other change.

**The item appears only for a version that builds a book**, because it asks the
version root for its output formats rather than reading a separate flag:

```go-html-template
{{ $vr := partial "utils/version-root.html" . }}
{{ with $vr.docsSection }}{{ if .OutputFormats.Get "book" }}…{{ end }}{{ end }}
```

That is the same `outputs: ["html", "book"]` opt-in that makes a PDF publishable
in the first place, so the menu follows the build and there is nothing to keep
in sync.

> [!WARNING]
> Set `params.pdfDownload` in **every** config that builds the product, not just
> the production one. Unlike `[outputFormats.book]`, a missing block does not
> fail the build — the item just silently disappears from preview and local
> builds, which is harder to notice.

> [!NOTE]
> The build knows the book is produced; it cannot know the PDF has been
> uploaded. A version enabled between two nightly runs shows a link that 404s
> until the next one, so dispatch the PDF workflow when you enable a version
> rather than waiting for the schedule.

A build-time existence check was prototyped and rejected. `resources.GetRemote`
with `method: head` does work, returning nil on a 404 without downloading the
file, but it requires `[security.http] methods` to be widened to permit HEAD in
every consumer, and `caches.getresource` defaults to `maxage = -1`, so a cached
"missing" answer would never expire.

## Verifying the output

The book document deliberately skips `baseof.html` and all normal docs chrome —
no navbar, no sidebar, no in-page TOC. It is a print artifact, self-contained
from `<!DOCTYPE html>` down. So a quick check on the built `book.html`:

| Check | Expected |
| --- | --- |
| `paged.polyfill` script present | yes — its absence means the fallback described above |
| `print-book` stylesheet linked | yes |
| `sidebar-container` present | **no** — site chrome means you got the wrong template |

> [!WARNING]
> Do not check a `book.html` produced while `hugo server` is running against the
> same `publishDir`. A dev server can write a LiveReload script into the output
> and race a static build. Stop the server, delete the output directory, and
> rebuild before inspecting or shipping.

## Known limitations

**The printed version string is not version-aware.** Content scoping on a
versioned site works, because a book only ever walks the subtree of the page
that opted in. The version printed on the cover and in the running footer does
not: `utils/resolve-latest-version.html` returns whichever `params.versions`
entry carries `linkVersion: "latest"`, regardless of which version tree the book
actually walked. On kgateway.dev that happens to be right, since `latest` is
also the only tree that opts in. Opting an older or a `main` tree in as well
gives that book a cover labeled with the `latest` version instead of its own.
Until per-page version-root scoping is done, keep one version tree opted in.

**The Paged.js page ceiling** is a property of the renderer, not of this module.
Chunking is the workaround, not a fix.

**`PDF_BOOK_PATHS` is hand-maintained.** No Hugo query returns every page that
opted into an output format, so the list stays manual. The mismatch runs both
ways: a section added after the cascade is in place gets
a `book.html` and is still missing from the PDF until it is listed, and a page
that should stay out of the PDF still gets a `book.html` built for it. The
second case costs build time and nothing else.
