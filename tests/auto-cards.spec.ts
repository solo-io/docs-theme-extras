import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Section index pages auto-render <a class="section-card"> for each child
// page, populated from the child's frontmatter title and description. This
// is rendered by the theme's list.html, suppressed via Page.Store
// "hasManualCards" only when the page's own content already includes a
// {{< cards >}} block. The fixture's per-version landings (_index.md) have
// no manual cards, so auto-generation should fire.

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");

type SectionCheck = {
  name: string;
  filePath: string;
  expected: { href: string; title: string; descriptionContains: string }[];
};

// Per-version expected card set on the section landing page. The two
// children ("everything", "rebased") are fixture-specific; the version
// list comes from CONFIG.
const CHILD_TOPICS = [
  {
    slug: "everything",
    title: "Everything",
    descriptionContains: "Every shortcode the framework cares about",
  },
  {
    slug: "rebased",
    title: "Rebased",
    descriptionContains: "rendered through the rebase shortcode",
  },
  {
    slug: "trailing-step",
    title: "Trailing step",
    descriptionContains: "Regression page for the percent-form version",
  },
];

// Spec is fixture-specific: it asserts that every version's section index
// auto-renders cards for `everything` and `rebased` (the fixture's two
// child topics). Real product content has different child topics and a
// different per-version URL shape — drop entries where the expected
// section-index file doesn't exist on disk. If all drop, the for-loop
// below generates zero tests and the spec is effectively a no-op for that
// consumer.
// block-direct is a v2-only page (block-content patterns placed directly on
// the page, no reuse/rebase). It renders a section card on the v2 index only,
// so it's appended per-version rather than added to the shared CHILD_TOPICS.
const V2_ONLY_TOPICS = [
  {
    slug: "block-direct",
    title: "Block Direct",
    descriptionContains: "placed directly on the page",
  },
  {
    slug: "cond-reuse-table",
    title: "Cond Reuse Table",
    descriptionContains: "with a nested reuse",
  },
];

const sectionPages: SectionCheck[] = target.versions
  .map((v) => ({
    name: `${v} section index`,
    filePath: path.join(TEST_PRODUCT_ROOT, v, "index.html"),
    expected: [...CHILD_TOPICS, ...(v === "v2" ? V2_ONLY_TOPICS : [])].map(
      (t) => ({
        href: `${BASE_URL}/${v}/${t.slug}/`,
        title: t.title,
        descriptionContains: t.descriptionContains,
      }),
    ),
  }))
  .filter((s) => fs.existsSync(s.filePath));

function extractCards(
  html: string,
): { href: string; title: string; description: string }[] {
  // Each card is <a class="section-card" href="..."> ...
  //   <p class="section-card-title">TITLE</p>
  //   <p class="section-card-desc">DESC</p>
  // </a>
  const out: { href: string; title: string; description: string }[] = [];
  const cardRe =
    /<a\s+class="section-card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const match of html.matchAll(cardRe)) {
    const inner = match[2];
    const titleMatch = inner.match(
      /<p[^>]*class="section-card-title"[^>]*>([\s\S]*?)<\/p>/,
    );
    const descMatch = inner.match(
      /<p[^>]*class="section-card-desc"[^>]*>([\s\S]*?)<\/p>/,
    );
    // Strip any badge spans from the title: list.html appends
    // `<span class="section-card-badge ...">LABEL</span>` next to the
    // title text when the target page sets enterprise/alpha/etc. flags.
    // The badge presence is asserted separately; here we want just the
    // human-readable title text.
    const rawTitle = titleMatch?.[1] ?? "";
    const titleWithoutBadges = rawTitle.replace(
      /<span[^>]*class="section-card-badge[^"]*"[^>]*>[\s\S]*?<\/span>/g,
      "",
    );
    out.push({
      href: match[1],
      title: titleWithoutBadges.replace(/\s+/g, " ").trim(),
      description: (descMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
    });
  }
  return out;
}

for (const section of sectionPages) {
  test.describe(`auto-generated cards: ${section.name}`, () => {
    test(`${section.filePath} exists`, () => {
      expect(fs.existsSync(section.filePath)).toBe(true);
    });

    test(`renders one section-card per child topic`, () => {
      const html = readFixture(section.filePath);
      const cards = extractCards(html);
      expect(cards.length, `expected ${section.expected.length} cards, got ${cards.length}`).toBe(
        section.expected.length,
      );
    });

    for (const exp of section.expected) {
      test(`card for ${exp.title} has correct href, title, description`, () => {
        const html = readFixture(section.filePath);
        const cards = extractCards(html);
        const card = cards.find((c) => c.title === exp.title);
        expect(card, `no auto-card with title ${exp.title}`).toBeDefined();
        expect(card!.href).toBe(exp.href);
        expect(card!.description).toContain(exp.descriptionContains);
      });

      test(`card href for ${exp.title} resolves to a built page`, () => {
        const html = readFixture(section.filePath);
        const cards = extractCards(html);
        const card = cards.find((c) => c.href === exp.href);
        expect(card, `no auto-card href ${exp.href}`).toBeDefined();
        const rel = exp.href.replace(new RegExp(`^${BASE_URL}/`), "").replace(/\/$/, "");
        const targetFile = path.join(TEST_PRODUCT_ROOT, rel, "index.html");
        expect(fs.existsSync(targetFile), `card href ${exp.href} → ${targetFile} missing`).toBe(true);
      });
    }
  });
}

// NOTE: distinguishing manual `{{< card >}}` blocks from list.html's
// auto-generated section cards is not possible from rendered HTML alone —
// they share the `.section-card` class. The "no auto-leak on everything
// pages" check that lived here was a category error; removed. Auto-card
// presence on section *index* pages (above) is the meaningful coverage.
