import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// Guards the docs/list.html footnote-reorder fix.
//
// Goldmark appends the footnotes block to the very END of `.Content`. A docs
// section-index page renders `.Content` and then the auto-generated section
// cards, so without intervention the footnote list is wedged between the body
// and the card grid. docs/list.html splits the trailing footnotes block out of
// `.Content` and re-emits it after the cards. This spec locks that ordering in:
// on the fixture's v2 landing (which carries a footnote AND auto-cards), the
// `<div class="footnotes">` must appear AFTER `<... class="section-cards">`.
//
// Fixture-only: it depends on the fixture's v2/_index.md footnote and its child
// pages (which drive the auto-cards). Server-rendered markup, read statically.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// Minify-tolerant: the class attribute may be quoted (fixture build) or bare
// (a consumer's --minify build), e.g. class="section-cards" or class=section-cards.
const SECTION_CARDS = /class=["']?section-cards["' >]/;
const FOOTNOTES = /class=["']?footnotes["' ]/;

test.describe("footnotes render after auto section cards", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: relies on the fixture's v2 landing footnote + child cards",
  );

  const filePath = path.join(TEST_PRODUCT_ROOT, "v2", "index.html");

  test("v2 section index: footnotes block follows the section-cards grid", () => {
    test.skip(!fs.existsSync(filePath), "v2 section index not built");
    const html = fs.readFileSync(filePath, "utf8");

    const cards = html.search(SECTION_CARDS);
    const footnotes = html.search(FOOTNOTES);

    expect(cards, "section-cards grid missing on v2 landing").toBeGreaterThan(-1);
    expect(footnotes, "footnotes block missing on v2 landing").toBeGreaterThan(
      -1,
    );
    expect(
      footnotes,
      "footnotes block should render AFTER the section-cards grid, not between the body and the cards",
    ).toBeGreaterThan(cards);
  });
});

// The two markdown-output surfaces — the `markdown` output format (`.md` URL,
// page-to-markdown.html) and the "Copy as Markdown" button embed
// (copy-markdown.html) — carry the same auto-card-as-link-list + footnote
// handling. The auto section-cards grid is rendered by the LIST layout and is
// NOT part of `.Content`, so those partials emit the children as a plain
// markdown link list, then re-append the footnotes AFTER that list (matching
// the rendered page). This block locks in that both surfaces:
//   - emit the child pages as a plain link list (a child that appears ONLY in
//     the grid, never in the body prose, proves the list is the auto-cards),
//   - place the footnote block AFTER the link list,
//   - strip Goldmark's footnote <hr> separator (serialized as `* * *`),
//   - normalize typographer output to ASCII (curly quote → straight).
// Fixture-only, same as above.

function readMdOutputFormat(): string | null {
  const p = path.join(TEST_PRODUCT_ROOT, "v2", "index.md");
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : null;
}

function readCopyMdSource(): string | null {
  const p = path.join(TEST_PRODUCT_ROOT, "v2", "index.html");
  if (!fs.existsSync(p)) return null;
  const html = fs.readFileSync(p, "utf8");
  const m = html.match(
    /<script[^>]*type=["']text\/markdown["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  // copy-markdown.html escapes ONLY `<` → `&lt;`; the button's JS decodes it
  // back before copying, so mirror that here to compare the real payload.
  return m ? m[1].replace(/&lt;/g, "<") : null;
}

const MARKDOWN_SURFACES: { name: string; read: () => string | null }[] = [
  { name: ".md output format", read: readMdOutputFormat },
  { name: "copy-as-markdown button source", read: readCopyMdSource },
];

test.describe("section-index markdown: auto-card link list + footnote order", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: relies on the fixture's v2 landing footnote + child cards",
  );

  for (const surface of MARKDOWN_SURFACES) {
    test(`${surface.name}: child link list, footnote after it, no hr, ASCII punctuation`, () => {
      const md = surface.read();
      test.skip(md === null, `${surface.name} not built for v2 landing`);

      // "Nav group" is a v2 child page that never appears in the body prose,
      // so a "- [Nav group](" bullet can only come from the auto-card link list.
      const listPos = md!.indexOf("- [Nav group](");
      expect(listPos, "auto-card child link list missing").toBeGreaterThan(-1);

      // The footnote block (its `#fnref` backref is unique to the bottom
      // footnote list) must come AFTER the link list.
      const footnotePos = md!.indexOf("#fnref");
      expect(footnotePos, "footnote block missing").toBeGreaterThan(-1);
      expect(
        footnotePos,
        "footnote block should follow the child link list, not precede it",
      ).toBeGreaterThan(listPos);

      // Goldmark's body/footnote <hr> separator is dropped for plain markdown.
      expect(md, "footnote `* * *` separator should be stripped").not.toContain(
        "* * *",
      );

      // Typographer output is normalized to ASCII: markdownify emits an
      // entity-encoded curly apostrophe in the child description, which the
      // entity-decode + smart-punctuation passes turn back into a straight `'`.
      expect(md, "curly apostrophe should be normalized to ASCII").not.toContain(
        "’",
      );
      expect(
        md,
        "child description should carry a straight apostrophe",
      ).toContain("sidebar's right edge");
    });
  }
});
