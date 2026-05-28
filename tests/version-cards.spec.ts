import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// `version-cards` is a shortcode in layouts/_shortcodes/ that renders one
// .section-card per entry in the navbar version dropdown. The fixture's
// section landing at /test/_index.md invokes it twice to exercise both
// lookup paths the shortcode supports:
//
//   {{< version-cards … >}}                 → section auto-detected from
//                                             the URL ("test") is not in
//                                             params.sections, so the
//                                             shortcode falls back to the
//                                             top-level params.versions
//                                             list (v2, v1, main).
//
//   {{< version-cards section="demo" … >}}  → explicit section selects
//                                             params.sections.demo.versions
//                                             (x1, x2).
//
// Hrefs are built as <currentPagePath>/<linkVersion>/ regardless of which
// list supplied the versions, so both blocks emit cards under /test/.
// This mirrors how agentgateway-oss-website's /docs/kubernetes/ landing
// page and kgateway.dev's /docs/envoy/ landing page use the shortcode.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const LANDING_PATH = path.join(TEST_PRODUCT_ROOT, "index.html");

type CardExpect = {
  href: string;
  title: string;
};

type BlockCase = {
  label: string;
  expectedCards: CardExpect[];
  expectedDesc: string;
};

// Order matches the order of the shortcode invocations in
// fixture/content/en/test/_index.md. The fallback block comes first,
// the section-keyed block second.
const blocks: BlockCase[] = [
  {
    label: "top-level fallback",
    expectedDesc: "Use the framework in a fallback environment.",
    expectedCards: [
      { href: `${BASE_URL}/v2/`, title: "v2 (current)" },
      { href: `${BASE_URL}/v1/`, title: "v1" },
      { href: `${BASE_URL}/main/`, title: "main (dev)" },
    ],
  },
  {
    // Demo section reuses v2/v1 linkVersion values so hrefs land on real
    // fixture content; the unique dropdown labels prove the shortcode is
    // reading from params.sections.demo and not falling back to the
    // top-level versions list (which would emit "v2 (current)" / "v1").
    label: "section-keyed lookup",
    expectedDesc: "Use the framework with the demo section config.",
    expectedCards: [
      { href: `${BASE_URL}/v2/`, title: "demo override: v2 only" },
      { href: `${BASE_URL}/v1/`, title: "demo override: v1 only" },
    ],
  },
];

type Card = { href: string; title: string; description: string };

// Splits the page HTML into one chunk per `<div class="section-cards">`
// block. The shortcode emits one block per invocation, so two blocks are
// expected. Each chunk is then parsed into Card objects.
function extractBlocks(html: string): Card[][] {
  const out: Card[][] = [];
  const blockRe = /<div class="section-cards"[^>]*>([\s\S]*?)<\/div>\s*(?=<|$)/g;
  for (const match of html.matchAll(blockRe)) {
    out.push(extractCardsFromBlock(match[1]));
  }
  return out;
}

function extractCardsFromBlock(inner: string): Card[] {
  // Shortcode emits:
  //   <a class="section-card" href="..."><span class="section-card-body">
  //     <span class="section-card-title">TITLE</span>
  //     <span class="section-card-desc">DESC</span>
  //   </span></a>
  //
  // Spans (not <p>) so the markup stays valid when wrapped by markdownify
  // from a percent-form shortcode. The auto-section-cards partial uses
  // <p>; we tolerate both so this helper can be reused.
  const out: Card[] = [];
  const cardRe =
    /<a\s+class="section-card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of inner.matchAll(cardRe)) {
    const cardInner = match[2];
    const titleMatch = cardInner.match(
      /<(?:p|span)[^>]*class="section-card-title"[^>]*>([\s\S]*?)<\/(?:p|span)>/,
    );
    const descMatch = cardInner.match(
      /<(?:p|span)[^>]*class="section-card-desc"[^>]*>([\s\S]*?)<\/(?:p|span)>/,
    );
    out.push({
      href: match[1],
      title: (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
      description: (descMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

test.describe("version-cards on /test/ landing", () => {
  test("landing page exists in build output", () => {
    expect(
      fs.existsSync(LANDING_PATH),
      `${LANDING_PATH} not found — fixture build did not emit the landing`,
    ).toBe(true);
  });

  test("emits exactly two .section-cards blocks (one per shortcode call)", () => {
    // auto-section-cards in docs/list.html also looks at this page. The
    // shortcode sets Page.Store "hasManualCards" so the auto partial
    // skips. If both fired we would see a third block here.
    const parsed = extractBlocks(readFixture(LANDING_PATH));
    expect(
      parsed.length,
      "expected 2 .section-cards blocks (auto-section-cards should be suppressed)",
    ).toBe(2);
  });

  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];

    test(`block ${i + 1} (${b.label}): renders one card per configured version`, () => {
      const parsed = extractBlocks(readFixture(LANDING_PATH));
      const cards = parsed[i] ?? [];
      expect(
        cards.length,
        `expected ${b.expectedCards.length} cards in block ${i + 1}, got ${cards.length}`,
      ).toBe(b.expectedCards.length);
    });

    test(`block ${i + 1} (${b.label}): cards appear in config order with expected hrefs and titles`, () => {
      const parsed = extractBlocks(readFixture(LANDING_PATH));
      const actual = (parsed[i] ?? []).map(({ href, title }) => ({
        href,
        title,
      }));
      expect(actual).toEqual(b.expectedCards);
    });

    test(`block ${i + 1} (${b.label}): each card carries the shortcode's desc parameter`, () => {
      const parsed = extractBlocks(readFixture(LANDING_PATH));
      const cards = parsed[i] ?? [];
      for (const card of cards) {
        expect(
          card.description,
          `card ${card.href} missing desc text`,
        ).toContain(b.expectedDesc);
      }
    });
  }
});
