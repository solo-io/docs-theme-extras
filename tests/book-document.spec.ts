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
// The fixture opts in TWO version trees. v1 is the one that matters for the
// version-labelling checks below: it is not the tree any site-wide lookup would
// pick, so it is the only one that can tell a per-tree answer from a site-wide
// one. See fixture/content/en/test/v1/_index.md.
const BOOK_V1 = path.join(TEST_PRODUCT_ROOT, "v1/book.html");

function book(): string {
  return fs.readFileSync(BOOK, "utf8");
}

function bookV1(): string {
  return fs.readFileSync(BOOK_V1, "utf8");
}

// The <link> the book emits for its executed print-book.css.
function stylesheetHref(h: string): string {
  const m = h.match(/<link rel="stylesheet" href="([^"]*print-book[^"]*)">/);
  expect(m, "no print-book stylesheet link in the book document").not.toBeNull();
  return m![1];
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

  // THE REGRESSION THIS GROUP EXISTS FOR. The cover version and the running
  // footer version used to come from utils/resolve-latest-version.html, a
  // SITE-WIDE lookup: whichever params.versions entry carries
  // linkVersion "latest", else the first entry. A book only ever walks the
  // subtree of the page that opted in, so any product opting in a tree other
  // than that one shipped a manual of the right content under the wrong
  // version — istio's 1.30.x book printed "Version 1.31.x" throughout.
  //
  // These assertions are the reason v1 opts in at all. Against v2 alone every
  // one of them passes with the bug still present, because the site-wide answer
  // for this fixture happens to be v2.
  test.describe("version labelling is per version tree, not site-wide", () => {
    test("both books are built", () => {
      expect(fs.existsSync(BOOK), `${BOOK} was not built`).toBe(true);
      expect(fs.existsSync(BOOK_V1), `${BOOK_V1} was not built`).toBe(true);
    });

    test("each cover names its own version", () => {
      const cover = (h: string) =>
        h.match(/<p class="pdf-cover-version">([^<]*)<\/p>/)?.[1]?.trim();

      expect(cover(book()), "the v2 cover lost its version line").toBe("Version v2");
      // The whole bug in one assertion: this read "Version v2" before the fix.
      expect(cover(bookV1()), "the v1 book is labelled with another tree's version")
        .toBe("Version v1");
    });

    // print-book.css is executed per book through resources.ExecuteAsTemplate,
    // and Hugo caches an executed resource under its TARGET NAME. A fixed name
    // means the first book in the build wins and every later book links the
    // same file, so v1's footer would print v2's version. The target name is
    // keyed on the version to prevent that; two identical hrefs here means the
    // key went back to being constant.
    test("each book links its own executed stylesheet", () => {
      const a = stylesheetHref(book());
      const b = stylesheetHref(bookV1());
      expect(a, "v2 and v1 share one cached print-book.css").not.toBe(b);
    });

    // The footer version lives inside that stylesheet's @bottom-right content,
    // which is where the site-wide lookup's second copy used to be. Reading the
    // built CSS is the only way to see it — it never appears in the HTML.
    test("each stylesheet's running footer names its own version", () => {
      const cssFor = (h: string) => {
        const href = stylesheetHref(h);
        const f = path.join(target.builtRoot, href.replace(/^\/+/, ""));
        expect(fs.existsSync(f), `executed stylesheet not found at ${f}`).toBe(true);
        return fs.readFileSync(f, "utf8");
      };
      const footer = (css: string) =>
        css.match(/@bottom-right\s*\{\s*content:\s*"([^"]*)"/)?.[1];

      const v2Footer = footer(cssFor(book()));
      const v1Footer = footer(cssFor(bookV1()));
      expect(v2Footer, "no @bottom-right content in the executed stylesheet")
        .toBeDefined();
      expect(v2Footer!.endsWith(" v2"), `v2 footer reads ${v2Footer}`).toBe(true);
      expect(v1Footer!.endsWith(" v1"), `v1 footer reads ${v1Footer}`).toBe(true);
    });
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

  // merge_book.py --outline-from rebuilds the PDF bookmark tree by reading the
  // headings back out of this document, and it can only bookmark a heading it
  // can point at. Every chapter heading borrows its <section>'s id; the
  // contents heading sits in a <nav> and has to carry its own, or the manual
  // opens with no bookmark for its own table of contents. Nothing about that
  // failure is visible in the HTML, hence the assertion here.
  test("the contents heading has an id the bookmark pass can target", () => {
    const toc = book().match(/<nav class="pdf-toc">([\s\S]*?)<\/nav>/)![1];
    expect(toc, "the Contents heading lost its id").toMatch(
      /<h2 id="pdf-contents"[^>]*>/,
    );
  });

  // The same rebuild reads a heading's LEVEL as its nesting depth, so the
  // levels have to descend with the tree: a top-level chapter at h2, its
  // children at h3, and so on. A chapter emitted at the wrong level would nest
  // under the wrong parent in the bookmark panel and nowhere in the HTML.
  test("chapter heading levels descend with the section tree", () => {
    const h = book();
    const chapters = [
      ...h.matchAll(
        /<section class="pdf-chapter[^"]*" id="([^"]+)"[^>]*>[\s\S]*?<(h[2-6])[ >]/g,
      ),
    ];
    expect(chapters.length, "no chapter headings found").toBeGreaterThan(0);
    // The first chapter is a top-level one, so it anchors the scale.
    expect(chapters[0][2], "the first chapter is not an h2").toBe("h2");
    const levels = new Set(chapters.map((m) => m[2]));
    expect(levels.size, "every chapter is at the same level — nesting is lost")
      .toBeGreaterThan(1);
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
