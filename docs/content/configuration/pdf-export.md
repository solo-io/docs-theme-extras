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
> Proven so far only on a **flat, unversioned site** with a single fixed docs
> root. A version line is already wired into the cover and footer conditionally,
> and resolves to nothing when a site has no versions, but proper per-page
> version-root scoping for a genuinely versioned site is **not done**. See
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
```

The script imports from `playwright`, not `@playwright/test`. A repo that
already has the test package still needs this one.

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

> [!NOTE]
> If your live site links a specific filename, pass `PDF_OUTPUT` explicitly on
> every invocation that feeds a real build. Do not rely on the default.

The output lands directly in `public/`, which a plain `make build` does not
touch, so the PDF is in the same tree that gets deployed.

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

Paged.js has a real ceiling somewhere around **150–200 pages**. Past it,
pagination degrades. This appears to be inherent to monolithic CSS Paged Media
rendering rather than a Paged.js defect.

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
>     bookChunkRoot: true
> ```
>
> That single path-segment glob matches direct children only — it does **not**
> reach two levels down. This is plain Hugo, not a module feature.
>
> `PDF_BOOK_PATHS` still has to be an explicit ordered list maintained by hand.
> Hugo has no query for "every page that opted into an output format", so a new
> section needs one manual addition there even with the cascade in place.

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

**Versioned sites are not supported yet.** The pipeline is proven on a flat,
unversioned site with one fixed docs root and no `params.versions`. Per-page
version-root scoping is real work that has not been done. The comments in
`layouts/_partials/docs/book-document.html` mark the one place that already
anticipates it.

**The Paged.js page ceiling** is a property of the renderer, not of this module.
Chunking is the workaround, not a fix.

**`PDF_BOOK_PATHS` is hand-maintained.** There is no way to derive it from Hugo.
