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
