import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Structural guard for the PDF book document: docs/list.book.html,
// docs/single.book.html and _partials/docs/book-document.html, plus the
// print-book.css link they emit.
//
// WHY THIS EXISTS. Until v2/_index.md opted into `outputs: ["html", "book"]`,
// the fixture never built a book, so none of those templates were ever
// EXECUTED by the suite. Hugo parses every template it can find, so a syntax
// error in them did fail the build — but nothing semantic did. A deliberate
// `{{ .ThisMethodDoesNotExist.AtAll }}` inside book-document.html built green
// across the entire suite. Everything below is about keeping that file on a
// code path some test actually runs.
//
// It asserts STRUCTURE, not appearance: page geometry belongs to the renderer,
// and there is no renderer here. What it can prove is that the document the
// renderer will be handed has the shape the rest of the pipeline assumes.

const BOOK = path.join(TEST_PRODUCT_ROOT, "v2/book.html");

function book(): string {
  return fs.readFileSync(BOOK, "utf8");
}

function count(h: string, re: RegExp): number {
  return (h.match(re) || []).length;
}

test.describe("book document", () => {
  test("is built at all", () => {
    // The whole point of the fixture opt-in. If this fails, every other
    // assertion here is meaningless rather than merely failing.
    expect(fs.existsSync(BOOK), `${BOOK} was not built`).toBe(true);
    expect(book().length).toBeGreaterThan(1000);
  });

  // The checks the "Verifying the output" table in docs/configuration/
  // pdf-export.md tells a human to run by hand.
  test("is the book template, not the ordinary page template", () => {
    const h = book();
    expect(h, "print-book stylesheet not linked").toContain("print-book");
    expect(h, "paged.polyfill missing — the renderer would get no pagination")
      .toContain("paged.polyfill");
    // Site chrome means list.book.html did not win the template lookup, which
    // produces a PDF of the website rather than of the docs.
    expect(h).not.toContain("sidebar-container");
    expect(h).not.toContain("hextra-navbar");
  });

  test("has a cover and exactly one table of contents", () => {
    const h = book();
    expect(count(h, /class="pdf-cover"/g)).toBe(1);
    expect(count(h, /<nav class="pdf-toc">/g)).toBe(1);
  });

  // The invariant the whole numbering pass rests on: scripts/number_toc.py
  // resolves each TOC link against the named destination WeasyPrint emits for
  // the matching chapter id. If either side's anchorize changes, or a chapter
  // stops carrying an id, every contents entry silently loses its page number.
  test("every TOC entry points at a chapter that exists in the document", () => {
    const h = book();
    const chapterIds = new Set(
      [...h.matchAll(/<section class="pdf-chapter[^"]*" id="([^"]+)"/g)].map((m) => m[1]),
    );
    const tocHrefs = [...h.matchAll(/<a href="#([^"]+)"><span class="pdf-toc-title">/g)]
      .map((m) => m[1]);

    expect(tocHrefs.length, "TOC is empty").toBeGreaterThan(5);
    expect(chapterIds.size, "no chapters rendered").toBeGreaterThan(5);

    const dangling = tocHrefs.filter((t) => !chapterIds.has(t));
    expect(dangling, `TOC entries with no matching chapter: ${dangling.join(", ")}`)
      .toEqual([]);
    expect(tocHrefs.length).toBe(chapterIds.size);
  });

  // Chapter ids must be distinct BEFORE prepare_book.py runs its own
  // de-duplication, because that pass rewrites duplicate ids from page BODIES
  // and relies on the chapter sections themselves already being unique — one
  // per page, keyed on RelPermalink.
  test("chapter ids are unique", () => {
    const ids = [...book().matchAll(/<section class="pdf-chapter[^"]*" id="([^"]+)"/g)]
      .map((m) => m[1]);
    expect(ids.length).toBe(new Set(ids).size);
  });

  test("each chapter carries a breadcrumb source for the running header", () => {
    const h = book();
    // string-set in print-book.css reads this span to fill @top-left. One per
    // chapter, or pages print under the wrong heading.
    expect(count(h, /class="pdf-breadcrumb-source"/g))
      .toBe(count(h, /<section class="pdf-chapter/g));
  });

  // Exercises the recursive walk in book-toc-tree / book-chapter-tree rather
  // than just its first level. v2 has nested subsections precisely so this can
  // be asserted; a flat fixture would let a broken recursion pass.
  test("the TOC nests", () => {
    const toc = book().match(/<nav class="pdf-toc">([\s\S]*?)<\/nav>/)![1];
    expect(count(toc, /<ul>/g), "TOC has no nested list — recursion not exercised")
      .toBeGreaterThan(1);
  });

  // The page-number slots number_toc.py fills in after rendering. They must be
  // present and EMPTY here: the number is not knowable at build time, and a
  // slot that never renders is a contents page of blank columns.
  test("TOC page-number slots are present and empty", () => {
    const h = book();
    const slots = [...h.matchAll(/<span class="pdf-toc-page">([^<]*)<\/span>/g)];
    const tocLinks = count(h, /<span class="pdf-toc-title">/g);
    expect(slots.length).toBe(tocLinks);
    expect(slots.filter((m) => m[1].trim() !== ""), "a slot is pre-filled").toEqual([]);
    // The dot leader between title and number.
    expect(count(h, /class="pdf-toc-dots"/g)).toBe(tocLinks);
  });

  // The book is a SECOND caller of utils/unhide-tabs.html, separate from
  // copy-markdown.html. Today's tab bug was in exactly this path and not the
  // other, so tab-flatten.spec.ts alone would not have caught it.
  //
  // The book cannot be its own reference: flattening REMOVES the button bar,
  // so counting groups in the book finds zero however broken the partial is.
  // (The first version of this test did exactly that and skipped itself.) The
  // reference has to be the ordinary rendered pages the chapters came from,
  // which still carry the raw markup — reached through each chapter's
  // data-source-path.
  test("tab groups are flattened in the book too", () => {
    const h = book();
    const sources = [...h.matchAll(/data-source-path="([^"]+)"/g)].map((m) => m[1]);
    expect(sources.length, "no chapters carry a data-source-path").toBeGreaterThan(0);

    let groups = 0;
    let panels = 0;
    let unreadable = 0;
    for (const rel of sources) {
      const f = path.join(target.builtRoot, rel, "index.html");
      if (!fs.existsSync(f)) {
        unreadable++;
        continue;
      }
      // Strip the copy-as-markdown payload: it holds an already-flattened copy
      // of the same content and would double every count.
      const page = fs
        .readFileSync(f, "utf8")
        .replace(/<script[^>]*class=["']copy-md-source["'][^>]*>[\s\S]*?<\/script>/gi, "");
      groups +=
        count(page, /<div class="hextra-tabs[^"]*"[^>]*>(?:\s|&#10;)*<nav/g) +
        count(page, /role="tablist"/g);
      panels +=
        count(page, /data-tab-name="/g) + count(page, /<div class="hextra-tabs-panel/g);
    }

    // Silent under-coverage is the failure mode this whole spec exists to
    // prevent, so an unresolvable source path fails rather than shrinking the
    // sample.
    expect(unreadable, "chapters whose source page could not be read").toBe(0);
    test.skip(groups === 0, "fixture book contains no tab groups");

    expect(count(h, /class="pdf-tab-intro"/g)).toBe(groups);
    expect(count(h, /class="pdf-tab-option-label"/g)).toBe(panels);
    // A surviving button bar is a dead control in print.
    expect(count(h, /hextra-tab-btn/g)).toBe(0);
  });
});
