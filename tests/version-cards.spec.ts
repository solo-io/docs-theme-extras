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
//                                             the URL is not in
//                                             params.sections, so the
//                                             shortcode falls back to the
//                                             top-level params.versions
//                                             list.
//
//   {{< version-cards section="demo" … >}}  → explicit section selects
//                                             params.sections.<key>.versions.
//
// Consumer landings (kgateway.dev, agentgateway-oss-website, solo-io/docs)
// may invoke 0, 1, or 2+ times, with different version lists. The spec
// validates STRUCTURAL invariants every emitted block should satisfy
// (non-empty hrefs, non-empty titles, shared description per block,
// hrefs all relative to the current page path) — no fixture-specific
// content is hardcoded.

const LANDING_PATH = path.join(TEST_PRODUCT_ROOT, "index.html");

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

test.describe("version-cards on landing", () => {
  test("landing page exists in build output", () => {
    expect(
      fs.existsSync(LANDING_PATH),
      `${LANDING_PATH} not found — landing not emitted`,
    ).toBe(true);
  });

  test("every emitted block has at least one card", () => {
    const blocks = extractBlocks(readFixture(LANDING_PATH));
    if (blocks.length === 0) {
      test.skip(true, "landing page has no version-cards blocks (consumer doesn't use the shortcode here)");
    }
    blocks.forEach((cards, i) => {
      expect(
        cards.length,
        `block ${i + 1} has 0 cards — version-cards rendered but produced an empty .section-cards`,
      ).toBeGreaterThan(0);
    });
  });

  test("every card has a non-empty href and title", () => {
    const blocks = extractBlocks(readFixture(LANDING_PATH));
    if (blocks.length === 0) {
      test.skip(true, "landing page has no version-cards blocks");
    }
    blocks.forEach((cards, i) => {
      cards.forEach((card, j) => {
        expect(
          card.href.length,
          `block ${i + 1} card ${j + 1} has empty href`,
        ).toBeGreaterThan(0);
        expect(
          card.title.length,
          `block ${i + 1} card ${j + 1} (href=${card.href}) has empty title`,
        ).toBeGreaterThan(0);
      });
    });
  });

  test("cards within a block share the same description (shortcode's desc param)", () => {
    // The shortcode applies the desc param uniformly to every card it
    // emits. If a block has cards with mismatched descs, something has
    // mangled the output — e.g. markdownify wrapping a multi-line desc.
    const blocks = extractBlocks(readFixture(LANDING_PATH));
    if (blocks.length === 0) {
      test.skip(true, "landing page has no version-cards blocks");
    }
    blocks.forEach((cards, i) => {
      if (cards.length < 2) return;
      const descs = new Set(cards.map((c) => c.description));
      expect(
        descs.size,
        `block ${i + 1} cards have inconsistent descriptions: ${[...descs].join(" / ")}`,
      ).toBe(1);
    });
  });

  test("hrefs share a common URL prefix within a block", () => {
    // Cards in one shortcode invocation all target the same parent
    // page, just at different version segments. A heterogeneous href
    // set within a block means the shortcode's URL construction broke.
    const blocks = extractBlocks(readFixture(LANDING_PATH));
    if (blocks.length === 0) {
      test.skip(true, "landing page has no version-cards blocks");
    }
    blocks.forEach((cards, i) => {
      if (cards.length < 2) return;
      const prefixes = cards.map((c) => c.href.replace(/\/[^/]+\/?$/, ""));
      const unique = new Set(prefixes);
      expect(
        unique.size,
        `block ${i + 1} hrefs don't share a parent path: ${cards.map((c) => c.href).join(", ")}`,
      ).toBe(1);
    });
  });
});

// Fixture-specific shape check — gated on the extras fixture so the
// strict per-version expectations don't leak into consumer reports.
const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const FIXTURE_BASE = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");
const FIXTURE_BLOCKS = [
  {
    label: "top-level fallback",
    expectedDesc: "Use the framework in a fallback environment.",
    expectedCards: [
      { href: `${FIXTURE_BASE}/v2/`, title: "v2 (current)" },
      { href: `${FIXTURE_BASE}/v1/`, title: "v1" },
      { href: `${FIXTURE_BASE}/main/`, title: "main (dev)" },
    ],
  },
  {
    label: "section-keyed lookup",
    expectedDesc: "Use the framework with the demo section config.",
    expectedCards: [
      { href: `${FIXTURE_BASE}/v2/`, title: "demo override: v2 only" },
      { href: `${FIXTURE_BASE}/v1/`, title: "demo override: v1 only" },
    ],
  },
];

test.describe("version-cards: fixture-specific landing shape", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only shape check");

  test("emits exactly two .section-cards blocks", () => {
    const parsed = extractBlocks(readFixture(LANDING_PATH));
    expect(parsed.length).toBe(2);
  });

  for (let i = 0; i < FIXTURE_BLOCKS.length; i++) {
    const b = FIXTURE_BLOCKS[i];

    test(`block ${i + 1} (${b.label}): cards match expected hrefs and titles`, () => {
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
        expect(card.description).toContain(b.expectedDesc);
      }
    });
  }
});
