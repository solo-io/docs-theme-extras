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
> versioned one (kgateway.dev, 14 chunks merged into a 1,828-page PDF). A book
> stitches whichever page opts in plus that page's own subtree, so version
> scoping falls out of where the opt-in lives rather than needing any version
> logic of its own, and the version printed on the cover and in the running
> footer is read from that same tree. Several version trees of one product can
> opt in, each producing its own book. The constraint that remains is on the
> **download link**, not on the books: see
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
| `scripts/render-pdf.mjs` | Fetched from this repo | See [Fetching the renderer](#4-fetching-the-renderer) |
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
Most repos wrap what follows in a `make pdf` target; see
[Generating a PDF locally](#generating-a-pdf-locally) for that and for the
WeasyPrint equivalent.

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

**Two of these three are in production and the third was never enabled.** Read
the status row first — the rest of the table is a comparison of capabilities, not
a menu of supported options.

| | Paged.js + Chromium | WeasyPrint 69.0 | Pandoc 3.10.2 + TeX Live |
| --- | --- | --- | --- |
| **Status** | **Shipping.** Drives `render-pdf.mjs`; kgateway.dev publishes with it (`make pdf`) | **Shipping.** Drives the split/merge pipeline; solo-io/docs publishes every product PDF with it | **Never enabled.** Evaluated once, in the spike above, and abandoned. No supported path uses it and none is planned |
| `print-book.css` | Used as authored | Used as authored, **zero** unsupported-property warnings | Discarded; CSS has no role in a LaTeX pipeline |
| `string-set` running headers, `@bottom-*` boxes, `counter(page)` | Yes | Yes | Reimplement in a LaTeX template |
| Repeats `<thead>` when a table splits | **No** | **Yes** | Yes, via `longtable` |
| `reference` chunk | 363 pages | 404 pages, 12s | No PDF produced |
| `traffic-management` chunk | Renders | 595 pages, 25s | No PDF produced |
| Whole tree as ONE document (7.1 MB, 227 chapters) | Never completes (inherited claim, not re-measured here) | 1,879 pages, **~90s** | Not reached |
| Extra runtime dependency | Chromium | Pango, GLib | TeX Live, `rsvg-convert` |
| Client-side JS, for example mermaid | Renders it | Needs a pre-render step | Needs a pre-render step |

> [!WARNING]
> **Pandoc is not a supported engine, and the row above is the whole story.**
> Every attempt in the spike ended without a PDF, so there are no page counts or
> timings to compare against — the two "No PDF produced" cells are not gaps in
> the measurements, they are the result. See
> [Pandoc did not produce a PDF](#pandoc-did-not-produce-a-pdf-from-this-content-at-all)
> below for the five configurations that were tried and where each one stopped.
> Choosing it is a project, not a configuration change.

**Which of the two shipping engines applies to you** depends on which pipeline
your site is wired into, not on a preference: an OSS site that curls
`render-pdf.mjs` from a `make pdf` target is on Paged.js, and a product built by
solo-io/docs's `pdf-export.yml` is on WeasyPrint. Nothing selects between them at
runtime, and there is no engine setting to change.

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

### Page numbers in the table of contents

Splitting costs one more thing than links, and it is not obvious: the printed
contents page.

CSS Paged Media has an answer — `target-counter(attr(href url), page)` on a TOC
link prints the page its target landed on, and WeasyPrint implements it. It
works only while the book is **one document**, and a book long enough to want a
printed contents page is exactly the book that had to be cut up. After the cut,
every chapter the TOC points at lives in a different document from the TOC, and
`target-counter` has nothing to count.

So the numbers come from the finished article instead:

1. Render every part and merge, with `merge_book.py --page-map pages.json`. The
   merged file is the first moment any destination's page is knowable.
2. `number_toc.py pages.json --manifest book.parts.txt` finds the part holding
   the TOC, writes the numbers into its empty `.pdf-toc-page` spans, and prints
   that part's path.
3. Re-render **only** that part, at the same page offset it had before.
4. Merge again.

The second render cannot invalidate the numbers it is printing, because
`.pdf-toc-page` is `flex: 0 0 3em` — a fixed-width column, so an empty box and a
`1234` box take identical space. No title rewraps, the TOC keeps its length, and
every chapter after it stays where it was. That invariant is the whole design, so
`number_toc.py --expect-pages/--assert-pages` checks it rather than assuming it,
and fails the build if the count moved.

Reading destinations back is two linear passes. pypdf's `get_page_number()`
scans the page list per call, which on this book would be ~2,900 destinations
against ~6,500 pages, or roughly 19 million comparisons.

#### Numbering starts at the contents page

The cover is unnumbered, which is the usual convention for a manual and also
means the number a reader reads off the footer is the number the contents page
printed against that chapter. Two settings have to agree for that:

- `print-book.css` blanks all four margin boxes on `@page pdf-cover`, a **named
  page** that only the cover element uses. `@page :first` cannot do this job —
  it means the first page of the document being rendered, and the book is
  rendered as one document per part, so it would blank a footer somewhere in the
  middle of the book for every part after the first.
- The caller renders the first part with `counter-reset: page 0` rather than `1`,
  and passes `merge_book.py --page-map` the matching `--first-page 0`. Without
  the second half, the page map holds physical positions while the footers hold
  printed ones, and every line of the contents page is one out.

### The bookmark tree has to be rebuilt after a split

WeasyPrint derives the PDF bookmark tree from heading levels, **per document**.
Each part is its own document, so each part's tree is nested against the
shallowest heading that part happens to contain rather than against the book.
Concatenate those trees and the bookmark panel is correct until the first part
boundary and flat afterwards. In the gloo-mesh-enterprise manual that meant
"Get started", "About" and "Setup" nested properly and then 56 more entries at
the top level, most of them third- and fourth-level headings whose parents were
in an earlier part.

The part HTML still knows the real answer, because the levels there are
absolute: the book layout emits a chapter at h2 plus its depth, and
`utils/shift-headings.html` pushes each page's own headings down to match. So
`merge_book.py --outline-from book.parts.txt` drops the imported per-part trees,
reads the headings back out of the HTML, and builds one tree over the merged
file.

Two things this depends on, both easy to break by accident:

- **A heading's id is almost never on the `<h*>` element.** Hextra's heading
  render hook emits it on an empty offset anchor span *inside* the heading:

  ```html
  <h5>Before you begin<span class="hx:absolute hx:-mt-20" id="…"></span>
    <a href="#…" class="subheading-anchor"></a></h5>
  ```

  So a descendant id is used when the element has none. Reading only the
  element's own id finds 459 headings in the gloo-mesh-enterprise book — one per
  chapter and not one inside a page — which produces a plausible-looking panel
  missing 84% of its entries. A chapter's title heading comes from the layout
  rather than from Goldmark and has neither, so it borrows its `<section>`'s id;
  the contents heading is not in a chapter at all, which is why the layout gives
  it `id="pdf-contents"` explicitly.
- Pass `--outline-from` to **both** merges. The second merge (after the contents
  page is re-rendered with its numbers) rewrites the same file, so leaving it off
  puts the flat trees straight back into the artifact people download.

One limit carries over rather than being introduced here: heading levels stop at
`h6`, so a chapter nested five or more deep and the body headings inside it all
land at `h6` and become siblings in the panel. `utils/shift-headings.html` caps
there because HTML has nothing deeper, and WeasyPrint's own tree had the same
ceiling.

### Fonts the renderer needs

Beyond `fonts-dejavu-core` and `fonts-liberation` (diagram SVGs ask for
Helvetica, and Liberation Sans is the metric-compatible stand-in), the emoji
font matters more than it sounds like it should. Comparison tables in this
content use ✅ and ❌, and under WeasyPrint they came out unreadable.

**WeasyPrint cannot draw a color font.** Not badly — at all. Rendered side by
side in the container below, all three kinds embed into the PDF and all three
leave the glyph box blank:

| Font | Technology | What WeasyPrint 69 draws |
| ---- | ---------- | ------------------------ |
| Noto Color Emoji | CBDT (bitmap) | nothing; the advance is reserved and no ink is placed |
| Noto COLRv1 | COLRv1 (vector) | nothing |
| Twemoji Mozilla | COLRv0 (vector) | nothing |
| Noto Emoji | `glyf` (outline) | the glyph, in the inherited text color |

So install the monochrome outline font,
[Noto Emoji](https://github.com/google/fonts/tree/main/ofl/notoemoji), and get
the color back a different way — see
[Color emoji](#color-emoji-come-from-the-html-not-the-font) below.

Installing it is not sufficient on its own. A hosted GitHub runner image already
ships the color font, and Pango keeps choosing it, so the color font has to be
rejected outright:

```xml
<!-- /etc/fonts/conf.d/99-no-color-emoji.conf -->
<?xml version="1.0"?>
<!DOCTYPE fontconfig SYSTEM "fonts.dtd">
<fontconfig>
  <selectfont>
    <rejectfont>
      <pattern>
        <patelt name="family"><string>Noto Color Emoji</string></patelt>
      </pattern>
    </rejectfont>
  </selectfont>
</fontconfig>
```

> [!WARNING]
> Do not verify this with `fc-match`. `fc-match "sans-serif:charset=2705"`
> answers `Noto Emoji` even in the configuration that ships color glyphs,
> because Pango resolves emoji fallback by script tag rather than by that query.
> Render the characters and read back the embedded font instead:
>
> ```sh
> printf '%s' '<meta charset="utf-8"><p>&#x2705;</p>' > probe.html
> weasyprint probe.html probe.pdf
> python3 -c "from pypdf import PdfReader; print([str(f.get_object()['/BaseFont']) for f in PdfReader('probe.pdf').pages[0]['/Resources']['/Font'].values()])"
> ```

### Color emoji come from the HTML, not the font

Because no color font renders, the color is reapplied to the **characters**
instead, before the renderer sees them. `prepare_book.py --color-emoji` wraps
each emoji it knows a meaning-bearing color for in
`<span class="pdf-emoji" style="color:…">`. An outline glyph honors `color`; a
bitmap one does not, which is the reason the monochrome font is the one
installed rather than a workaround around it.

The map lives in `EMOJI_COLOURS` in that script and covers the colored circles
and squares (🔴 🟠 🟡 🟢 🔵 🟣 🟤 ⚫ ⚪ and the square set) plus the status
marks (✅ ✔ ❌ ❎ ✖ ❗ ⛔ 🚫 ⚠ ❓ ℹ). Values are GitHub Primer colors, so a
table of status dots in the PDF reads the way the same table reads on the
website. Anything outside the map is left to the monochrome font.

Three details worth knowing before you change it:

- **Tinting, not substituting.** The character stays in the PDF's text layer, so
  it still copies, searches and reads out. A CSS shape in its place would look
  cleaner and lose all three.
- **Noto Emoji's hatching survives**, and that is a feature: 🟡 is dotted, 🟢 is
  diagonally hatched and 🔴 is vertically striped, so the distinction does not
  rest on hue alone for a color-blind reader.
- **⚪ and ⬜ are gray, not white.** White on a white page is an invisible glyph,
  which is worse than the monochrome one it replaced.

The flag is opt-in because it is a WeasyPrint workaround. A Paged.js consumer
renders in Chromium, which draws the real color font, and there the tint would
repaint emoji that are already correct.

### Pandoc did not produce a PDF from this content at all

This is why the status row above says **never enabled**, and why the Pandoc
column has no page counts to compare: there was never an output to count.

Five configurations
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

## Generating a PDF locally

Which command you run depends on which engine your site is wired into — see the
status row in [Choosing a rendering engine](#choosing-a-rendering-engine).

### Paged.js sites (kgateway.dev)

There is a `make` target, because the renderer is a Node script the repo already
curls:

```sh
make pdf     # Hugo first, then render-pdf.mjs over the built public/
```

`make serve` runs the same thing with `PDF_OUTPUT` redirected into `static/`, so
the download link resolves during local preview instead of 404ing — see
[The dev server never sees it](#the-dev-server-never-sees-it).

### WeasyPrint sites (solo-io/docs)

**There is no `make` target for this one.** The pipeline lives in
`.github/workflows/pdf-export.yml`, and that workflow is the source of truth —
the steps below reproduce it rather than replace it, so check them against the
workflow if the two ever disagree.

Run it in a container. Not for isolation, but because **the fonts are part of
the output**: the renderer picks up whatever emoji font the host provides, and
the wrong one silently prints ✅/❌ as invisible specks (see
[Fonts the renderer needs](#fonts-the-renderer-needs)). A container that matches
CI is the only way to see locally what will actually publish.

```dockerfile
FROM ubuntu:24.04
ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update -qq && apt-get install -y -qq --no-install-recommends \
      libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz0b \
      fonts-dejavu-core fonts-liberation \
      fontconfig curl ca-certificates python3-pip poppler-utils
RUN pip install --quiet --break-system-packages weasyprint lxml cssselect pypdf
RUN curl -fsSL -o /usr/local/share/fonts/NotoEmoji.ttf \
      "https://github.com/google/fonts/raw/main/ofl/notoemoji/NotoEmoji%5Bwght%5D.ttf"
COPY 99-no-colour-emoji.conf /etc/fonts/conf.d/
RUN fc-cache -f
```

#### The quick check: does this page look right?

This is the question you actually have most of the time, and it needs none of the
splitting or numbering machinery:

```sh
hugo --config=hugo-<product>.toml
python3 -m http.server 8000 --bind 127.0.0.1 --directory public &
weasyprint "http://127.0.0.1:8000/<product>/<version>/book.html" out.pdf
```

Serve the tree rather than opening the file directly — WeasyPrint has no notion
of a site root, so root-relative image and stylesheet URLs only resolve over
HTTP.

Two things will look wrong, and both are expected here: **the table of contents
has no page numbers**, and on a large book this either takes many minutes or
exhausts memory, because nothing has split it. Neither is a bug in your page.

#### The full pipeline

Reproduce the published artifact — split, continuous page numbers, working
cross-references, numbered contents — with the four stages the workflow runs, in
order:

```sh
# 1. Prepare: unique ids, deferred jumps, emoji color, SVG font fix, split.
python3 prepare_book.py public/<product>/<version>/book.html \
        public/<product>/<version>/book.html https://docs.solo.io \
        --strict --color-emoji --fix-svg-fonts public

# 2. Render each part IN ORDER, telling each one where its page numbers start.
#    Sequential is not an optimization choice — a part cannot know its first
#    page number until every earlier part has been rendered and counted.
#    The FIRST part starts at 0, because the cover is unnumbered.
echo "@page :first { counter-reset: page $NEXT; }" > offset.css
weasyprint -s offset.css "http://127.0.0.1:8000/<product>/<version>/$NAME.html" "$PDF"

# 3. Merge: record where every destination landed, and rebuild the bookmark
#    tree from the part HTML. --first-page must match the first part's offset.
python3 merge_book.py out.pdf pdf-parts/*.pdf --page-map pages.json \
        --first-page 0 --outline-from public/<product>/<version>/book.parts.txt

# 4. Number the contents, re-render only that part, merge again.
python3 number_toc.py pages.json --manifest public/<product>/<version>/book.parts.txt
#    ...re-render the part it names, then merge once more.
```

Stage 2's loop over `book.parts.txt` and stage 4's re-render are the fiddly
parts; copy them out of the workflow's `Render PDF` step rather than retyping
them.

### Checking what you produced

The failures worth catching do not announce themselves — a diagram that vanished,
emoji that rendered blank, a contents page of blanks, a bookmark panel that goes
flat halfway down. These read the finished file:

```sh
# Emoji resolved to the outline font, not a color one.
python3 -c "from pypdf import PdfReader; print([str(f.get_object()['/BaseFont']) \
  for f in PdfReader('out.pdf').pages[0]['/Resources']['/Font'].values()])"

# Bookmark nesting. Every top-level entry should be a top-level SECTION; a run
# of deep headings here is the per-part flattening described above.
python3 -c "
from pypdf import PdfReader
r = PdfReader('out.pdf')
print([i.title for i in r.outline if not isinstance(i, list)])"

# Look at a page instead of guessing.
pdftoppm -png -r 100 -f 12 -l 12 out.pdf page
```

`merge_book.py` already fails on any cross-reference that resolves to nothing,
and `number_toc.py` fails on any contents entry with no page — so a clean run of
the full pipeline is itself a check. A WeasyPrint `ERROR:` line, though, does
**not** stop it: the renderer logs an unrenderable image and exits 0, which is
how a diagram goes missing from a green build. The workflow greps its own log for
`^ERROR:` and fails; do the same locally.

## Naming the version on the cover

The cover and the running footer print the version of the tree the book walked,
resolved by `utils/book-version.html` from that tree's own `params.versions`
entry. Most products need no configuration at all — the entry's `version` already
holds a real number:

```toml
[[params.versions]]
  version = "2.13.x"      # printed: "Version 2.13.x"
  linkVersion = "latest"  # served at /latest/
```

A product that instead puts the URL segment in `version` has nothing printable,
and its book comes out labelled **"Version latest"**:

```toml
[[params.versions]]
  version = "latest"                # printed: "Version latest"  ← useless on paper
  dropdown = "2026.8.0 (latest)"    # the real number, but this is a UI label
  linkVersion = "latest"
```

Add `releaseVersion`, which wins over `version` and is read by nothing else:

```toml
[[params.versions]]
  version = "latest"
  releaseVersion = "2026.8.0"       # printed: "Version 2026.8.0"
  dropdown = "2026.8.0 (latest)"
  linkVersion = "latest"
```

> [!WARNING]
> **Do not fix this by correcting `version` instead.** That field is not
> display-only. `assemble-assets.py` in solo-io/docs names asset directories
> `assets/<product>/<version>`, and `reuse.html` locates them by matching each
> URL segment against `.version` — so on a tree served at `/latest/`, renaming
> the field breaks the match, the resolved version comes back empty, and every
> `{{< reuse >}}` snippet silently falls back to the unversioned asset path.
> `reuse.html` and `rebase.html` also substitute `.version` into content for the
> OSS→enterprise version remap. None of it fails loudly.

`releaseVersion` is deliberately not parsed out of `dropdown`. That string is a
UI label: it carries a `(latest)` suffix, and a hidden entry sets it to a single
space.

**It changes the print label only, not the download URL.** The link in the
Copy-as-Markdown menu resolves `{version}` from the URL segment, because it has
to match the release asset the PDF workflow publishes — and that asset is named
from the version directory. So a tree at `/latest/` keeps a stable
`…-latest.pdf` URL while its cover names the actual release. Those two
coordinates answer different questions and are meant to differ.

## Linking to the published PDF

Set `params.pdfDownload` and the Copy-as-Markdown menu on every docs page gains a
**Download all docs (PDF)** item, next to Print. For a site publishing to
`solo-io/docs-pdfs`, one line is the whole configuration:

```toml
[params.pdfDownload]
  distribution = "enterprise"
```

The release-asset URL shape is supplied by the partial, so it is not repeated per
consumer. Setting `distribution` is what turns the item on. Override the shape
only if you publish somewhere else:

```toml
[params.pdfDownload]
  urlTemplate = "/downloads/docs.pdf"
```

`{product}` comes from `params.pdfDownload.product`, falling back to
`params.currentProduct` and then `params.folder`. `{version}` is the version
segment of the current URL. With neither `distribution` nor `urlTemplate` the
item does not render at all, so a site that publishes no PDFs needs no change —
and that is deliberate rather than incidental. A site that renders its PDF into
its own `static/` (kgateway.dev, ambientmesh.io) builds a book and still wants no
item, so defaulting the URL for every consumer would give those sites a link to a
release that does not exist.

> [!WARNING]
> `[params.pdfDownload]` is a fully-qualified TOML table header, so **every bare
> `key = value` line after it belongs to it** until the next header. Dropped in
> above the loose keys of a `[params]` block, it silently swallows
> `currentProduct`, `folder` and everything else that follows — and the symptom is
> not a build error, it is a download URL with a product name like
> `Docs%20framework%20test%20fixture` in it, because `{product}` fell through to
> the next candidate. Put it after the loose keys, immediately before the next
> table header.

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

**The download link cannot tell two trees apart that share a version segment.**
`copy-markdown.html` fills `{version}` from `utils/version-root.html`'s
`currentVersion`, which is the version **segment** of the URL and nothing above
it. A product whose version trees nest under a section — agentgateway's
`/agentgateway/kubernetes/latest/` and `/agentgateway/standalone/latest/` — has
two trees whose segment is `latest`, so both resolve to the same download URL.
Opting both in publishes two books and links only one of them. Until the
template grows a `{section}` of its own, opt in **one tree per version
segment**.

**A tree served at `/latest/` needs `releaseVersion` to print a real number.**
The cover and footer read `releaseVersion` off the tree's own `params.versions`
entry, falling back to `version`. Most products need nothing: their `version`
already holds the real number, so gloo-mesh-enterprise's `latest` tree prints
"Version 2.13.x" with no extra configuration. But agentregistry, kagent and
agentgateway set `version = "latest"` literally and keep the number only in
`dropdown`, so without `releaseVersion` their covers read "Version latest" — see
[Naming the version on the cover](#naming-the-version-on-the-cover).

**A tree with no `params.versions` entry falls back to its URL segment.**
`utils/version-root.html` treats a segment matching `X.Y.x`, `X.Y.Z`, `latest`
or `main` as a version even with nothing configured for it, so an unregistered
tree prints the segment itself rather than nothing. Correct, but it is the raw
segment: a `main` tree's cover reads "Version main".

**The Paged.js page ceiling** is a property of the renderer, not of this module.
Chunking is the workaround, not a fix.

**`PDF_BOOK_PATHS` is hand-maintained.** No Hugo query returns every page that
opted into an output format, so the list stays manual. The mismatch runs both
ways: a section added after the cascade is in place gets
a `book.html` and is still missing from the PDF until it is listed, and a page
that should stay out of the PDF still gets a `book.html` built for it. The
second case costs build time and nothing else.
