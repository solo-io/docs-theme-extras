import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";

// Meta-description markdown stripping.
//
// A front-matter `description` may legitimately contain markdown (e.g. a bold
// product name or an inline link). Hextra's stock `utils/page-description.html`
// pipes the value through `plainify | htmlUnescape` only — `plainify` strips
// HTML tags but NOT markdown syntax, so `**one page**` leaked its literal `**`
// into every description meta tag and into Slack/X link unfurls. Two overrides
// fix this:
//   - `_partials/utils/page-description.html` adds `markdownify` before
//     `plainify`, so markdown is rendered to HTML and then the tags are
//     stripped. This feeds `<meta name=description>` (Hextra head.html),
//     `<meta name=twitter:description>` (twitter_cards.html), and the JSON-LD
//     `description` (schema.html).
//   - `_partials/opengraph.html` routes `og:description` through that same
//     partial. Upstream Hextra emits `og:description` from RAW `.Description`,
//     and `og:description` is the field Slack/X read first — so without this
//     override the unfurl kept the `**` even after the page-description fix.
// All four tags are asserted clean below.
//
// The `main/everything` fixture page carries a description with markdown bold
// (the shape of the real defect — a front-matter description like
// `… the **Solo Enterprise for kgateway 2.3 release**.`):
//   Every shortcode the framework cares about, in **one page**, with sentinel
//   strings tests can grep for.
// A markdown *link* is deliberately NOT added to the fixture description:
// extras' auto-section-cards generation still reads the RAW `.Description`, so a
// raw `[text](url)` would leak into the card surfaces and trip other scans. The
// two overrides here only touch the description meta tags, not auto-cards.
// Fixture-specific: against a consumer build this page won't exist, so the
// tests skip themselves.

const PAGE = path.join(TEST_PRODUCT_ROOT, "main", "everything", "index.html");

// The plain text the override must produce: bold markers gone, no residual
// markdown punctuation.
const EXPECTED =
  "Every shortcode the framework cares about, in one page, with sentinel strings tests can grep for.";

function readIfExists(p: string): string | null {
  return fs.existsSync(p) ? readFixture(p) : null;
}

// Pull the content attribute of a <meta> tag by name/property, quote-agnostic
// (hugo --minify may drop attribute quotes in a consumer build).
function metaContent(html: string, attr: string, value: string): string | null {
  // Match a <meta …> tag whose name/property attr equals `value`, in any
  // attribute order, then read its content attribute.
  const tagRe = new RegExp(`<meta\\b[^>]*\\b${attr}=("?)${value}\\1[^>]*>`, "i");
  const tag = html.match(tagRe);
  if (!tag) return null;
  const content = tag[0].match(/\bcontent=("?)([\s\S]*?)\1(?=[\s/>])/i);
  return content ? content[2] : null;
}

// JSON-LD `description` from the schema.html <script type="application/ld+json">.
function jsonLdDescription(html: string): string | null {
  const block = html.match(
    /<script[^>]*type=("?)application\/ld\+json\1[^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!block) return null;
  const m = block[2].match(/"description"\s*:\s*"((?:[^"\\]|\\.)*)"/);
  return m ? m[1].replace(/\\"/g, '"') : null;
}

test.describe("meta description strips markdown (page-description.html override)", () => {
  test("<meta name=description> is clean plain text", () => {
    const html = readIfExists(PAGE);
    test.skip(html === null, "fixture main/everything not built");
    const desc = metaContent(html!, "name", "description");
    expect(desc, "no <meta name=description> found").not.toBeNull();
    expect(desc).toBe(EXPECTED);
    expect(desc, "leaked markdown bold markers").not.toContain("**");
    expect(desc, "leaked markdown link syntax").not.toContain("](");
  });

  test("<meta name=twitter:description> is clean plain text", () => {
    const html = readIfExists(PAGE);
    test.skip(html === null, "fixture main/everything not built");
    const desc = metaContent(html!, "name", "twitter:description");
    expect(desc, "no twitter:description found").not.toBeNull();
    expect(desc).toBe(EXPECTED);
    expect(desc).not.toContain("**");
  });

  test("JSON-LD description is clean plain text", () => {
    const html = readIfExists(PAGE);
    test.skip(html === null, "fixture main/everything not built");
    const desc = jsonLdDescription(html!);
    expect(desc, "no JSON-LD description found").not.toBeNull();
    expect(desc).toBe(EXPECTED);
    expect(desc).not.toContain("**");
  });

  test("<meta property=og:description> is clean plain text", () => {
    const html = readIfExists(PAGE);
    test.skip(html === null, "fixture main/everything not built");
    // opengraph.html override routes og:description through page-description.html.
    // og:description is the field Slack/X read first, so this is what actually
    // fixes the link unfurl.
    const desc = metaContent(html!, "property", "og:description");
    expect(desc, "no og:description found").not.toBeNull();
    expect(desc!.trim()).toBe(EXPECTED);
    expect(desc, "leaked markdown bold markers").not.toContain("**");
  });
});
