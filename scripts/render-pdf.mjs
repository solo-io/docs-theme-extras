// PDF-export book pipeline (see layouts/docs/list.book.html for the Hugo
// side). Not mounted into consumers via module.mounts (see hugo.toml — mounts
// only cover layouts/assets/data) — this file rides along in the repo purely
// as fetchable content. A consumer's own Makefile curls it straight from
// GitHub, pinned to whatever version its go.mod already requires for
// docs-theme-extras, e.g.:
//
//   RENDER_PDF_VERSION := $(shell awk '/solo-io\/docs-theme-extras/ {print $$3}' go.mod)
//   RENDER_PDF_SCRIPT  := .pdf-tools/render-pdf-$(RENDER_PDF_VERSION).mjs
//   ...
//   test -f $(RENDER_PDF_SCRIPT) || curl -fsSL https://raw.githubusercontent.com/solo-io/docs-theme-extras/$(RENDER_PDF_VERSION)/scripts/render-pdf.mjs -o $(RENDER_PDF_SCRIPT)
//   PDF_PROD_HOST=https://example.com node $(RENDER_PDF_SCRIPT)
//
// That keeps the go.mod bump as the ONLY version pin — no second Makefile
// variable to drift out of sync with it. `playwright` and `pdf-lib` stay as
// the CONSUMER's own npm devDependencies (Node resolves node_modules relative
// to the invoking project, not this script's location), so a version bump
// here never requires a package.json change on its own.
//
// Serves the built public/ directory, opens the "book" output format
// (list.book.html — the whole docs section stitched into one document),
// waits for mermaid diagrams to finish their async client-side render, then
// drives Paged.js manually (auto:false in list.book.html) so pagination
// always runs against the final DOM, never a half-rendered one. Finally
// prints the paginated result to a PDF with Playwright.
//
// Proven so far only on ambientmesh.io, a flat/unversioned site — see
// list.book.html's own header comment for what a versioned site would still
// need.

import http from "node:http";
import fs from "node:fs";
import path from "node:path";
import { chromium } from "playwright";
import { PDFDocument, PDFName, PDFString } from "pdf-lib";

const PUBLIC_DIR = path.resolve("public");
// PDF_BOOK_PATHS (plural) is a comma-separated list, for a docs tree too big
// for Paged.js to paginate as one document — see the "known limitation" entry
// in this module's CHANGELOG.md for the ~150-200 page ceiling that forces
// this. Each path is rendered as its own independent chunk (its own
// book.html, from a page that opted in via `outputs: ["html", "book"]` PLUS
// `bookChunkRoot: true` — see list.book.html), then all chunks are merged
// into one PDF at the end. PDF_BOOK_PATH (singular) stays supported for a
// single-document book like ambientmesh.io's, and takes a fast path that
// skips the merge step entirely — kept byte-for-byte the same as before
// chunking existed, rather than routing a single chunk through pdf-lib's
// copyPages just to reach the same result a different way.
const BOOK_PATHS = (process.env.PDF_BOOK_PATHS || process.env.PDF_BOOK_PATH || "/docs/book.html")
  .split(",")
  .map((p) => p.trim())
  .filter(Boolean);
// No sensible cross-consumer default — internal links in the book render as
// relative to wherever it's loaded from (this script's own throwaway local
// server), so without rewriting them against the site's real origin they'd
// point at a dead http://127.0.0.1:<port>/... URL once the PDF is downloaded
// and the server is long gone. Required rather than defaulted so a consumer
// that forgets to set it fails loudly instead of shipping a PDF full of
// links to someone else's site.
const PROD_HOST = process.env.PDF_PROD_HOST;
if (!PROD_HOST) {
  throw new Error("PDF_PROD_HOST env var is required (e.g. https://example.com) — internal link rewriting needs the site's real origin.");
}
// Defaults to public/downloads/docs.pdf (a plain `make build` bypasses Hugo's
// static pipeline entirely, so the PDF lands directly in the same output
// that gets deployed). A consumer whose live site links a specific filename
// (e.g. ambientmesh.io's /downloads/ambientmesh-docs.pdf) must pass PDF_OUTPUT
// explicitly on every invocation that feeds a real build, not just rely on
// this default.
const OUTPUT_PATH = path.resolve(process.env.PDF_OUTPUT || "public/downloads/docs.pdf");
const MERMAID_TIMEOUT_MS = 15_000;
const PAGEDJS_TIMEOUT_MS = 60_000;

const MIME_TYPES = {
  ".html": "text/html",
  ".css": "text/css",
  ".js": "text/javascript",
  ".svg": "image/svg+xml",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".woff2": "font/woff2",
};

function serveStatic(rootDir) {
  const server = http.createServer((req, res) => {
    const reqPath = decodeURIComponent(req.url.split("?")[0]);
    let filePath = path.join(rootDir, reqPath);
    if (reqPath.endsWith("/")) filePath = path.join(filePath, "index.html");

    fs.readFile(filePath, (err, data) => {
      if (err) {
        res.writeHead(404);
        res.end("Not found");
        return;
      }
      const ext = path.extname(filePath);
      res.writeHead(200, { "Content-Type": MIME_TYPES[ext] || "application/octet-stream" });
      res.end(data);
    });
  });

  return new Promise((resolve) => {
    server.listen(0, "127.0.0.1", () => resolve(server));
  });
}

// pdf-lib has no built-in bookmark/outline helper, so this builds the PDF
// outline dictionary tree by hand per the PDF spec: one PDFDict per entry
// linked via Parent/Prev/Next/First/Last, registered under the document
// catalog's /Outlines with /PageMode /UseOutlines so viewers open the
// sidebar by default. Two passes — reserve a ref for every node first (so
// Parent/Prev/Next can point at siblings not yet built), then fill in each
// dict now that every ref in the tree is known.
async function addOutline(pdfBytes, outlineTree) {
  if (outlineTree.length === 0) return pdfBytes;

  const pdfDoc = await PDFDocument.load(pdfBytes);
  const context = pdfDoc.context;

  const reserveRefs = (nodes) => nodes.map((node) => ({ node, ref: context.nextRef(), children: reserveRefs(node.children) }));
  const countDescendants = (entries) => entries.reduce((sum, e) => sum + 1 + countDescendants(e.children), 0);

  const fillDicts = (entries, parentRef) => {
    entries.forEach((entry, i) => {
      const page = pdfDoc.getPage(entry.node.pageIndex);
      const dict = {
        Title: PDFString.of(entry.node.title),
        Parent: parentRef,
        Dest: context.obj([page.ref, PDFName.of("Fit")]),
      };
      if (i > 0) dict.Prev = entries[i - 1].ref;
      if (i < entries.length - 1) dict.Next = entries[i + 1].ref;
      if (entry.children.length > 0) {
        dict.First = entry.children[0].ref;
        dict.Last = entry.children[entry.children.length - 1].ref;
        dict.Count = countDescendants(entry.children);
      }
      context.assign(entry.ref, context.obj(dict));
      fillDicts(entry.children, entry.ref);
    });
  };

  const topRef = context.nextRef();
  const topEntries = reserveRefs(outlineTree);
  fillDicts(topEntries, topRef);
  context.assign(
    topRef,
    context.obj({
      Type: PDFName.of("Outlines"),
      First: topEntries[0].ref,
      Last: topEntries[topEntries.length - 1].ref,
      Count: topEntries.length,
    })
  );

  pdfDoc.catalog.set(PDFName.of("Outlines"), topRef);
  pdfDoc.catalog.set(PDFName.of("PageMode"), PDFName.of("UseOutlines"));

  return pdfDoc.save();
}

// Renders ONE book path end to end: link rewriting, details expansion,
// outline extraction, mermaid wait, Paged.js pagination, PDF bytes. Returns
// the outline tree with LOCAL page indices (0-based within this chunk's own
// PDF) — a multi-chunk merge is responsible for offsetting them into global
// indices once every chunk's own page count is known.
async function renderChunk(page, bookURL) {
  await page.goto(bookURL, { waitUntil: "load" });

  console.log("Rewriting links: same-book cross-references become in-PDF jumps, everything else points at the production host...");
  // Readers download this PDF specifically to read the docs offline in one
  // document — so a cross-reference whose target is itself a chapter in
  // this same book should jump within the PDF the reader is already
  // holding, not send them back to the internet for a page that's right
  // here. Only links pointing somewhere the book doesn't include become
  // real external web links; those still need internet access to resolve,
  // same as before. In a multi-chunk build, a chapter that ended up in a
  // DIFFERENT chunk isn't in THIS chunk's own DOM at all, so it's simply
  // never found below — falling through to the external-URL branch with no
  // extra code, exactly the fallback a cross-chunk reference should get,
  // since building real cross-chunk in-PDF jumps would mean mapping link
  // screen positions to PDF coordinates across separately-rendered documents.
  //
  // Each link's RAW href attribute is resolved against the page it
  // actually came from (list.book.html's data-source-path on the
  // enclosing .pdf-chapter), not against a.href/a.pathname — those are the
  // browser's resolution against book.html's OWN location, one directory
  // shallower than most of the pages it stitched together. A dot-relative
  // link like auto-section-cards.html's "../observability/" is authored to
  // work from its originating page's directory (e.g. /docs/waypoints/ ->
  // /docs/ -> /docs/observability/); resolved against book.html's
  // directory (/docs/) instead, the same ".." climbs one level too far and
  // lands on /observability/, silently dropping /docs. Root-relative
  // hrefs ("/foo/") are unaffected either way, since they ignore the
  // base's path entirely.
  //
  // The resolved pathname is then checked against every chapter's own
  // source path: a match becomes "#<chapter id>", a same-document jump —
  // exactly how the TOC and PDF bookmarks already navigate (both produce
  // real PDF GoTo destinations, confirmed via the rendered PDF's own link
  // annotations). A fragment on the original link (e.g.
  // "#deploy-a-waypoint") is honored when it matches a real element id
  // INSIDE that specific target chapter, so the reader lands on the right
  // sub-section rather than just the chapter's top; heading ids are only
  // Hugo-guaranteed unique within their own source page, not across the
  // whole stitched book, hence scoping the lookup to the one target
  // chapter rather than a document-wide getElementById. A bare "#foo"
  // fragment in the ORIGINAL href (the book's own TOC, or a link to a
  // heading within its own chapter) is left untouched — already an
  // in-PDF jump, nothing to resolve.
  await page.evaluate((prodHost) => {
    const prodOrigin = new URL(prodHost).origin;
    const normalize = (p) => p.replace(/\/$/, "");
    const chapterBySourcePath = new Map(
      Array.from(document.querySelectorAll(".pdf-chapter[data-source-path]")).map((el) => [
        normalize(el.getAttribute("data-source-path")),
        el,
      ])
    );

    document.querySelectorAll("a[href]").forEach((a) => {
      const rawHref = a.getAttribute("href");
      if (rawHref.startsWith("#")) return;
      const chapter = a.closest(".pdf-chapter");
      const sourcePath = chapter ? chapter.getAttribute("data-source-path") : location.pathname;
      let resolved;
      try {
        resolved = new URL(rawHref, prodHost + sourcePath);
      } catch {
        return;
      }
      if (resolved.origin !== prodOrigin) return;

      const target = chapterBySourcePath.get(normalize(resolved.pathname));
      if (target) {
        const heading = resolved.hash ? target.querySelector(resolved.hash) : null;
        a.href = `#${heading ? heading.id : target.id}`;
        return;
      }
      // Absolute, not just resolved.pathname + search + hash — this branch's
      // href is left for a browser/PDF viewer to actually navigate later,
      // after this throwaway local server is long gone. A root-relative
      // path here would resolve fine on a live site (this same origin), but
      // Chromium's print-to-PDF bakes it in as a URI link annotation
      // resolved against THIS page's current (localhost) location instead —
      // exactly the dead-link bug this whole rewrite exists to prevent.
      // Never triggered by ambientmesh.io's single-document book (nothing
      // in it links to a same-origin page outside the book at all); a
      // multi-chunk build exposed it immediately, since a same-origin
      // cross-CHUNK reference hits this exact branch on every chunk.
      a.href = resolved.href;
    });
  }, PROD_HOST);

  console.log("Expanding collapsed <details> blocks...");
  // The `details` shortcode (docs-theme-extras) defaults to closed, which
  // is the right call for a browsable page — but a PDF has no click
  // interaction, so a closed block would just permanently hide its
  // content. Flipping the `open` property (not just the attribute) here
  // in the DOM, rather than in list.book.html's HTML, keeps the live site
  // unaffected — this only ever touches the throwaway page this script
  // renders for the PDF.
  await page.evaluate(() => {
    document.querySelectorAll("details").forEach((d) => (d.open = true));
  });

  console.log("Reading chapter outline structure...");
  // Reuses the already-rendered TOC nav (list.book.html's book-toc-tree)
  // instead of re-walking Hugo's page tree here — same hierarchy, same
  // titles, same anchors, so there's one source of truth for both. This
  // MUST run before Paged.js paginates: the TOC's own <ul>/<li> list is
  // long enough to span a page break, and when Paged.js splits a list
  // across page boxes it can leave an <li> fragment without its <a> child
  // — walking the structure now, while it's still exactly what Hugo
  // rendered, avoids that entirely. Only the anchor id is kept per node;
  // page numbers get resolved in a separate pass after pagination.
  const outlineSkeleton = await page.evaluate(() => {
    const walk = (ul) =>
      Array.from(ul.children)
        .filter((li) => li.tagName === "LI")
        .map((li) => {
          const a = li.querySelector(":scope > a");
          const childUl = li.querySelector(":scope > ul");
          return {
            title: a.textContent,
            anchorId: a.getAttribute("href").slice(1),
            children: childUl ? walk(childUl) : [],
          };
        });
    const rootUl = document.querySelector(".pdf-toc > ul");
    return rootUl ? walk(rootUl) : [];
  });

  console.log("Waiting for mermaid diagrams to finish rendering...");
  try {
    await page.waitForFunction(
      () => Array.from(document.querySelectorAll(".mermaid")).every((el) => el.hasAttribute("data-processed")),
      { timeout: MERMAID_TIMEOUT_MS }
    );
  } catch {
    console.warn(`Mermaid didn't report done within ${MERMAID_TIMEOUT_MS}ms — continuing anyway.`);
  }

  console.log("Running Paged.js pagination...");
  await page.evaluate(
    (timeoutMs) =>
      Promise.race([
        window.PagedPolyfill.preview(),
        new Promise((_, reject) => setTimeout(() => reject(new Error("Paged.js pagination timed out")), timeoutMs)),
      ]),
    PAGEDJS_TIMEOUT_MS
  );

  console.log("Resolving chapter page numbers...");
  // getElementById is unaffected by Paged.js's list-splitting, since an id
  // stays on whichever single fragment carries it — only the surrounding
  // <ul>/<li> nesting (already captured above) is at risk. pageIndex values
  // here are LOCAL to this chunk's own PDF (0-based) — a multi-chunk merge
  // adds this chunk's page offset afterward, once every chunk's page count
  // (pageBoxes.length) is known.
  const { outlineTree, pageCount } = await page.evaluate((skeleton) => {
    const pageBoxes = Array.from(document.querySelectorAll(".pagedjs_page"));
    const pageIndexOf = (anchorId) => {
      const el = document.getElementById(anchorId);
      const box = el && el.closest(".pagedjs_page");
      return box ? pageBoxes.indexOf(box) : null;
    };
    const resolve = (nodes) =>
      nodes
        .map((node) => ({
          title: node.title,
          pageIndex: pageIndexOf(node.anchorId),
          children: resolve(node.children),
        }))
        .filter((node) => node.pageIndex !== null);
    return { outlineTree: resolve(skeleton), pageCount: pageBoxes.length };
  }, outlineSkeleton);

  console.log("Generating PDF...");
  const pdfBytes = await page.pdf({
    printBackground: true,
    preferCSSPageSize: true,
  });

  return { pdfBytes, outlineTree, pageCount };
}

// Adds `offset` to every pageIndex in a chunk's outline tree, recursively —
// turns chunk-local indices into indices valid against the final merged PDF.
function offsetOutline(nodes, offset) {
  return nodes.map((node) => ({
    ...node,
    pageIndex: node.pageIndex + offset,
    children: offsetOutline(node.children, offset),
  }));
}

async function main() {
  for (const bookPath of BOOK_PATHS) {
    if (!fs.existsSync(path.join(PUBLIC_DIR, bookPath))) {
      throw new Error(`${bookPath} not found under public/ — build the site with the "book" output format first.`);
    }
  }
  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });

  const server = await serveStatic(PUBLIC_DIR);
  const { port } = server.address();

  const browser = await chromium.launch();
  try {
    const page = await browser.newPage();

    if (BOOK_PATHS.length === 1) {
      // Single-document fast path — kept exactly as it was before chunking
      // existed (no pdf-lib copyPages round-trip), since this is the proven,
      // already-shipped case (ambientmesh.io) and there's no reason to route
      // it through machinery it doesn't need.
      const { pdfBytes, outlineTree } = await renderChunk(page, `http://127.0.0.1:${port}${BOOK_PATHS[0]}`);
      console.log(`Adding bookmarks and writing PDF to ${OUTPUT_PATH}...`);
      const finalBytes = await addOutline(pdfBytes, outlineTree);
      fs.writeFileSync(OUTPUT_PATH, finalBytes);
    } else {
      // Multi-chunk: render each book path independently (own link
      // rewriting, own pagination), then merge the resulting PDFs in order.
      // Continuous page numbers across chunks are NOT attempted — Paged.js's
      // own counter-reset support for this has open, unresolved bug reports
      // (see CHANGELOG.md), so each chunk's printed footer shows its own
      // local page count. The PDF's real navigation (bookmarks, this
      // function's own outline offsetting) uses actual PDF page objects and
      // is correct regardless of what text is printed in any page's footer.
      const merged = await PDFDocument.create();
      let offset = 0;
      let combinedOutline = [];
      for (const bookPath of BOOK_PATHS) {
        console.log(`--- Chunk: ${bookPath} ---`);
        const { pdfBytes, outlineTree, pageCount } = await renderChunk(page, `http://127.0.0.1:${port}${bookPath}`);
        const chunkDoc = await PDFDocument.load(pdfBytes);
        const copiedPages = await merged.copyPages(chunkDoc, chunkDoc.getPageIndices());
        copiedPages.forEach((p) => merged.addPage(p));
        combinedOutline = combinedOutline.concat(offsetOutline(outlineTree, offset));
        offset += pageCount;
      }
      console.log(`Adding bookmarks and writing merged PDF (${BOOK_PATHS.length} chunks, ${offset} pages) to ${OUTPUT_PATH}...`);
      const mergedBytes = await merged.save();
      const finalBytes = await addOutline(mergedBytes, combinedOutline);
      fs.writeFileSync(OUTPUT_PATH, finalBytes);
    }
  } finally {
    await browser.close();
    server.close();
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
