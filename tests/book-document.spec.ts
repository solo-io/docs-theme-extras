import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { PUBLIC_ROOT, TEST_PRODUCT_ROOT } from "./helpers/fixture";
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
// A book on a SECTION-NESTED tree (/test/nested/v2/). Its version segment is the
// same `v2` as the top-level tree's, which is what makes it the useful case:
// agentgateway has exactly this shape and its two mode trees both sit on
// `latest`.
const BOOK_NESTED = path.join(TEST_PRODUCT_ROOT, "nested/v2/book.html");
// A book on the docTabs tree, where the tab band and the book pipeline meet.
const BOOK_TABS = path.join(TEST_PRODUCT_ROOT, "v3/book.html");

// This suite runs against ANY consumer's built output, not just the bundled
// fixture — solo-io/docs' framework-test-static job points it at that repo's own
// `test` product, which mounts the fixture CONTENT but keeps its own Hugo config.
// So every assertion that depends on fixture CONFIG (releaseVersion on v1, the
// pdfDownload table, the product/distribution in a download URL) or on fixture
// content the consumer does not mount (only `v3/_index.md` is mounted there, not
// the tab subtree) has to be gated on the target.
//
// Same gate and same reason as tests/section-nested-versions.spec.ts. It is a
// target check, NOT a brand check: the hub's test product is also the enterprise
// brand, so `target.brand` cannot tell them apart. That is exactly how these
// assertions went green locally and red in the hub.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

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

  // THE OTHER HALF of that assertion, and the reason it is not redundant with
  // it. `outputs` front matter is static — it cannot say "only when a PDF is
  // being made" — so before `params.buildbook` existed, every ordinary consumer
  // build rendered every book: on solo-io/docs, 12 files and 92 MB on top of a
  // 4.3 GB site, ~7% of the build time on the largest product, and 12 crawlable
  // URLs each holding a complete unstyled duplicate of a manual with no
  // `noindex`, because a book document skips baseof.html and all the head
  // chrome. None of it was deployed or read; the PDF workflow builds its own.
  //
  // That makes one param the single point of failure for the feature, failing
  // silently in BOTH directions: always-on and every consumer quietly pays
  // again, always-off and no PDF can ever be built. public-nobook/ is
  // build-enterprise with that one key flipped and nothing else — same content,
  // same version trees, same `outputs` front matter — so a book.html appearing
  // there can only mean the gate stopped working.
  test("is NOT built when the site does not ask for one", () => {
    test.skip(!IS_FIXTURE_TARGET, "reads this repo's public-nobook build");
    const root = path.resolve(PUBLIC_ROOT, "..", "public-nobook");
    expect(fs.existsSync(root), `${root} is missing — run \`make build-nobook\``).toBe(true);
    // Guard against the build having silently produced nothing at all, which
    // would make the real assertion below pass for the wrong reason.
    const pages = fs.readdirSync(path.join(root, "test"));
    expect(pages.length, "the gate-off build produced no pages, so it proves nothing")
      .toBeGreaterThan(0);
    for (const rel of ["v1", "v2", "v3", "nested/v2"]) {
      expect(fs.existsSync(path.join(root, "test", rel, "book.html")),
        `${rel} built a book with buildBook = false, so the gate is not holding`)
        .toBe(false);
    }
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
    // Only the cover/footer/URL assertions below need the gate; they are marked
    // individually so the brand-agnostic stylesheet checks still run everywhere.
    test("both books are built", () => {
      expect(fs.existsSync(BOOK), `${BOOK} was not built`).toBe(true);
      expect(fs.existsSync(BOOK_V1), `${BOOK_V1} was not built`).toBe(true);
    });

    test("each cover names its own version", () => {
      test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's version config");
      const cover = (h: string) =>
        h.match(/<p class="pdf-cover-version">([^<]*)<\/p>/)?.[1]?.trim();

      // v2 sets no releaseVersion, so this is the `.version` fallback.
      expect(cover(book()), "the v2 cover lost its version line").toBe("Version v2");
      // v1 sets releaseVersion = "1.9.3", which must WIN over its .version of
      // "v1". Two failures are distinguishable here and both matter: "Version
      // v2" means the resolution went back to being site-wide, and "Version v1"
      // means releaseVersion is being ignored.
      expect(cover(bookV1()), "the v1 book is not using its releaseVersion")
        .toBe("Version 1.9.3");
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

    // The download URL uses the URL SEGMENT, deliberately NOT the print label —
    // so v1 stays `test-enterprise-v1` even though its cover reads 1.9.3. The
    // two coordinates are different on purpose: the cover answers "what am I
    // holding", while the URL has to match the release asset the PDF workflow
    // publishes, which is named from the version directory. Making these agree
    // would break the link on every product whose tree is served at /latest/.
    test("the download item names its own version segment", () => {
      test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's version config");
      test.skip(target.brand !== "enterprise", "only the enterprise fixture sets pdfDownload");
      const urlOn = (rel: string) => {
        const h = fs.readFileSync(path.join(TEST_PRODUCT_ROOT, rel, "index.html"), "utf8");
        return h.match(/https:\/\/github\.com\/solo-io\/docs-pdfs\/releases\/download\/[^"]+/)?.[0];
      };
      expect(urlOn("v2")).toContain("test-enterprise-v2/test-enterprise-v2.pdf");
      expect(urlOn("v1")).toContain("test-enterprise-v1/test-enterprise-v1.pdf");
    });

    // A page-geometry rule, asserted here because this harness has no renderer
    // and the alternative is no coverage at all. It is a deletion guard, not a
    // behavior test: a split table row keeps its cell marks on the first
    // fragment and continues with EMPTY value columns, so a comparison table
    // reads as "unsupported" on the page after the break. Verified against a
    // real WeasyPrint render; see the comment on the rule itself.
    test("the executed stylesheet keeps table rows off page boundaries", () => {
      const href = stylesheetHref(book());
      const css = fs.readFileSync(path.join(target.builtRoot, href.replace(/^\/+/, "")), "utf8");
      expect(css, "the tr break-inside rule is gone — split rows will print with empty value columns")
        .toMatch(/\.pdf-chapter tr\s*\{[^}]*break-inside:\s*avoid/);
    });

    // The footer version lives inside that stylesheet's @bottom-right content,
    // which is where the site-wide lookup's second copy used to be. Reading the
    // built CSS is the only way to see it — it never appears in the HTML.
    test("each stylesheet's running footer names its own version", () => {
      test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's version config");
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
      // Same two values as the covers, which is the point: the footer used to
      // resolve the version independently, so the two could disagree.
      expect(v2Footer!.endsWith(" v2"), `v2 footer reads ${v2Footer}`).toBe(true);
      expect(v1Footer!.endsWith(" 1.9.3"), `v1 footer reads ${v1Footer}`).toBe(true);
    });
  });

  // Callout/alert shortcodes in a book. Deletion guards, like the tr rule
  // above: this harness has no renderer, so the only thing it can check is
  // that the stylesheet the book links still carries the rules. Worth the
  // coverage because the failure was silent for the life of the pipeline —
  // every callout in every published PDF printed as unset-off body text with
  // the word "info" or "warning" floating above it, and nothing failed.
  // Symptom of record: page 11 of istio-enterprise-1.30.x.pdf.
  test.describe("callouts keep their box and lose their ligature", () => {
    const bookCss = () => {
      const href = stylesheetHref(book());
      const f = path.join(target.builtRoot, href.replace(/^\/+/, ""));
      expect(fs.existsSync(f), `executed stylesheet not found at ${f}`).toBe(true);
      return fs.readFileSync(f, "utf8");
    };

    // Guards the assertions below against passing for the wrong reason. If the
    // fixture stops emitting callouts into the book, every rule check becomes
    // vacuous while still going green.
    test("the fixture book actually contains callouts", () => {
      const types = new Set(
        [...book().matchAll(/solo-alert alert-([a-z]+)/g)].map((m) => m[1]),
      );
      expect([...types].sort(), "the fixture book emits no callouts to style")
        .toEqual(["danger", "info", "success", "warning"]);
    });

    test("every callout type in the book has a box rule", () => {
      const css = bookCss();
      expect(css, "the .solo-alert base box is gone — callouts print as plain prose")
        .toMatch(/\.pdf-chapter \.solo-alert\s*\{[^}]*background:/);
      for (const type of ["info", "warning", "danger"]) {
        expect(css, `no per-type rule for alert-${type} — it falls back to the success box`)
          .toMatch(new RegExp(`\\.pdf-chapter \\.solo-alert\\.alert-${type}\\b`));
      }
    });

    // The stray-word bug itself. callout.html renders the icon as a Material
    // Icons ligature, and this document loads no such font, so without the
    // hide rule the ligature NAME prints as literal italic text.
    test("the Material Icons ligature is hidden", () => {
      // The bug is only reachable while callout.html still emits a ligature;
      // if it ever moves to inline <svg> like the GitHub alerts, this test
      // should be deleted rather than kept passing on a dead rule.
      expect(book(), "callout.html no longer emits a material-icons ligature")
        .toMatch(/class="material-icons"/);
      expect(bookCss(), "the ligature hide rule is gone — 'info' prints as text next to the note")
        .toMatch(/\.pdf-chapter \.solo-alert-icon i\.material-icons\s*\{[^}]*display:\s*none/);
    });

    // The replacement for the hidden icon, and the reason hiding it is not the
    // whole fix: printed in grayscale the per-type tints all reduce to the
    // same pale gray, so the label is the only thing left distinguishing a
    // caution from a note.
    test("each callout type prints a text label instead", () => {
      const css = bookCss();
      const labelFor = (sel: string) =>
        css.match(new RegExp(`${sel}\\s*\\.solo-alert-icon::before\\s*\\{\\s*content:\\s*"([^"]*)"`))?.[1];
      expect(labelFor("\\.pdf-chapter"), "no default callout label").toBe("Note");
      expect(labelFor("\\.pdf-chapter \\.alert-warning")).toBe("Warning");
      expect(labelFor("\\.pdf-chapter \\.alert-success")).toBe("Tip");
      expect(labelFor("\\.pdf-chapter \\.alert-danger")).toBe("Caution");
    });
  });

  // Glossary tooltips in a book. Unlike the callout assertions above, these are
  // not stylesheet-only: the leak is visible in the BOOK HTML, so the fixture
  // can prove both halves — the term survives, the definition does not reach
  // the page. fixture/data/glossary.yaml puts a MARKER_GLOSS_DEF sentinel in
  // the definition text for exactly that reason.
  test.describe("glossary definitions are stripped from a book", () => {
    // Every assertion below is about content only the bundled fixture mounts
    // (fixture/data/glossary.yaml + v2/glossary-term.md). A consumer running
    // this spec against its own build has its own glossary, or none.
    test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's glossary");

    test("the fixture book actually contains a glossary term", () => {
      // Same anti-vacuity guard as the callout block: if the gloss call stops
      // reaching the book, "no definition in the book" passes for free.
      expect(book(), "the fixture book emits no glossary term to strip")
        .toMatch(/class="glossary-term"/);
    });

    test("the term text survives", () => {
      // The point of stripping rather than hiding the whole element. The word
      // the sentence is built around has to stay, or the prose loses a noun.
      const h = book();
      expect(h, "the glossary term itself is gone from the book")
        .toMatch(/data-glossary-term="MCP"/);
      expect(h, "the custom display text is gone from the book")
        .toContain("proxy layer");
    });

    test("the definition does not reach the page", () => {
      const href = stylesheetHref(book());
      const css = fs.readFileSync(path.join(target.builtRoot, href.replace(/^\/+/, "")), "utf8");
      expect(css, "the tooltip strip rule is gone — every definition prints inline mid-sentence")
        .toMatch(/\.pdf-chapter \.glossary-term > \.tooltip-content\s*\{[^}]*display:\s*none/);
    });

    // The failure this whole block exists to prevent, asserted on the web page
    // rather than the book: glossary.css is what hides the tooltip there, so if
    // its selector and print-book.css's ever disagree, one of the two outputs
    // silently starts leaking. Cheap cross-check, since both read the same
    // markup.
    test("the web page hides the same element the book strips", () => {
      const page = fs.readFileSync(
        path.join(TEST_PRODUCT_ROOT, "v2", "glossary-term", "index.html"), "utf8");
      expect(page, "the fixture page did not render a tooltip")
        .toMatch(/class="tooltip-content"/);
      const glossaryCss = fs.readFileSync(
        path.join(__dirname, "..", "assets", "css", "glossary.css"), "utf8");
      expect(glossaryCss, "glossary.css no longer hides the tooltip by default")
        .toMatch(/\.glossary-term > span\s*\{[^}]*display:\s*none/);
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

  // The "Download all docs (PDF)" item in copy-markdown.html had no coverage at
  // all until this group, which is uncomfortable for a menu item whose URL is
  // assembled from three separate config values. It has TWO gates and each one
  // fails in a different, silent direction.
  test.describe("the download item's two gates", () => {
    test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's pdfDownload config");
    const PDF_URL = /https:\/\/github\.com\/solo-io\/docs-pdfs\/releases\/download\//;

    function pageHTML(rel: string): string {
      return fs.readFileSync(path.join(TEST_PRODUCT_ROOT, rel, "index.html"), "utf8");
    }

    // GATE 1: the version root's own output formats. This is what lets the menu
    // follow the build instead of a second flag somebody has to keep in sync —
    // and it is why agentgateway's standalone tree, which does not opt in, shows
    // no item while its kubernetes tree does. `main` is this fixture's
    // equivalent: a real version tree that never opted into `book`.
    test("a version tree that builds no book shows no item", () => {
      test.skip(target.brand !== "enterprise", "only the enterprise fixture sets pdfDownload");
      expect(fs.existsSync(path.join(TEST_PRODUCT_ROOT, "main/book.html")),
        "the `main` tree opted into `book`, so it can no longer stand in for a tree that did not")
        .toBe(false);
      expect(pageHTML("main"), "an item rendered for a version that publishes no PDF")
        .not.toMatch(PDF_URL);
    });

    // GATE 2: `params.pdfDownload.distribution`. The URL template is defaulted
    // rather than repeated in every consumer config, and this gate is the only
    // thing keeping that default off the consumers it would be WRONG for —
    // kgateway.dev and ambientmesh.io both build books and both publish to their
    // own pages, so an unconditional default would hand them a link to a
    // docs-pdfs release that does not exist. hugo-oss.toml stands in for them.
    test("a site that sets no pdfDownload shows no item, even with a book", () => {
      test.skip(target.brand !== "oss", "hugo-oss.toml is the config with no pdfDownload");
      expect(fs.existsSync(BOOK), "the OSS fixture must still BUILD a book, or this proves nothing")
        .toBe(true);
      for (const rel of ["v2", "v1"]) {
        expect(pageHTML(rel), `${rel} rendered a download item with no pdfDownload configured`)
          .not.toMatch(PDF_URL);
      }
    });
  });

  // A product with parallel SECTIONS has one book per section, and both used to
  // be indistinguishable — same download URL, same cover. The fixture's `nested`
  // section is the shape: its tree is at /test/nested/v2/, and its version
  // segment is the same `v2` as the top-level tree's, so nothing keyed on the
  // version alone can tell them apart. agentgateway is the production case, with
  // kubernetes/latest and standalone/latest.
  test.describe("a section-nested book identifies its section", () => {
    test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's `nested` section tree");
    test("the book is built", () => {
      expect(fs.existsSync(BOOK_NESTED), `${BOOK_NESTED} was not built`).toBe(true);
    });

    // Two books, two release assets. Before the section prefix, both of these
    // resolved to `test-enterprise-v2`, and because the PDF workflow publishes
    // with --clobber the second render would replace the first with no error and
    // both sections' pages would link the survivor.
    test("the download URL carries the section segment", () => {
      test.skip(target.brand !== "enterprise", "only the enterprise fixture sets pdfDownload");
      const urlOn = (rel: string) =>
        fs.readFileSync(path.join(TEST_PRODUCT_ROOT, rel, "index.html"), "utf8")
          .match(/docs-pdfs\/releases\/download\/([^/]+)\//)?.[1];

      expect(urlOn("nested/v2")).toBe("test-enterprise-nested-v2");
      // The regression half, and the more dangerous one: an ordinary product
      // must NOT gain a prefix. version-root.html's `section` field holds the
      // PRODUCT segment for a product with no params.sections, so reading it
      // instead of utils/section-segment.html would rewrite every published URL
      // on every product.
      expect(urlOn("v2"), "a non-section tree gained a section prefix").toBe("test-enterprise-v2");
    });

    // The cover is the other half. Two manuals with the same logo, subtitle and
    // version are only distinguishable by filename, which is the first thing
    // lost when a file is renamed or printed.
    test("the cover subtitle names the section, and only for a section tree", () => {
      const subtitle = (f: string) =>
        fs.readFileSync(f, "utf8").match(/<p class="pdf-cover-subtitle">([^<]*)<\/p>/)?.[1]?.trim();

      // The fixture's `nested` config sets no `title`, so this comes from the
      // section landing page — the middle rung of book-section.html's ladder.
      expect(subtitle(BOOK_NESTED), "the section-nested cover does not name its section")
        .toBe("Nested");
      expect(subtitle(BOOK), "a non-section cover lost its generic subtitle")
        .toBe("Documentation");
    });
  });

  // docTabs and the book pipeline interact by accident of layout, not by design:
  // a tab `id` is a top-level content directory under the version root, and the
  // book walks that root's children recursively, so each tab becomes a top-level
  // chapter with its subtree below it. No book-specific handling exists, which is
  // what makes it worth pinning — the SIDEBAR deliberately scopes itself to one
  // tab, and a change teaching the book to do likewise would drop every
  // non-default tab from the manual silently.
  test.describe("a book on a docTabs tree keeps every tab", () => {
    test.skip(!IS_FIXTURE_TARGET, "asserts the bundled fixture's tabs-demo subtree, which a consumer need not mount");
    test("the book is built", () => {
      expect(fs.existsSync(BOOK_TABS), `${BOOK_TABS} was not built`).toBe(true);
    });

    test("each tab directory is a top-level chapter, with its subtree nested", () => {
      const h = fs.readFileSync(BOOK_TABS, "utf8");
      const chapters = [
        ...h.matchAll(/<section class="pdf-chapter[^"]*" id="([^"]+)"[\s\S]*?<(h[2-6])[ >]/g),
      ].map((m) => ({ id: m[1], level: m[2] }));

      // Every configured tab id must appear, and at h2 — the top chapter level.
      // A tab missing entirely is the failure this test exists for.
      for (const tab of ["documentation", "api", "changelog"]) {
        const ch = chapters.find((c) => c.id.endsWith(tab));
        expect(ch, `tab '${tab}' has no chapter in the book`).toBeDefined();
        expect(ch!.level, `tab '${tab}' is not a top-level chapter`).toBe("h2");
      }

      // And the tabs' contents nest BELOW them rather than being flattened
      // alongside, which is what makes the grouping readable in print.
      expect(
        chapters.some((c) => c.id.includes("documentation") && c.level === "h3"),
        "no chapter nests under the documentation tab — the subtree was flattened or dropped",
      ).toBe(true);
    });
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
