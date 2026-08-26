import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";

// Behavior tests for the `github-yaml` and `reuse-append` shortcodes, both
// moved into this module from agentgateway-oss-website.
//
// These two are covered by one spec because they arrived together and neither
// warrants a file of its own: three assertions each, over the same fixture
// page, with the same region-slicing helper. Split them if either grows.
//
// WHAT IS NOT COVERED HERE. The failure branches of `github-yaml` — a timeout
// (WARN plus a link-checker-visible anchor) and a dead URL (errorf, build
// fails) — are not exercised. Asserting on them needs a build against an
// unreachable host, which is what tests/build-resilience.spec.ts is for; no
// fixture there embeds a remote YAML yet. So the dead-URL `errorf`, which is
// the behavior that CHANGED when this shortcode moved into the module, is
// currently unverified by test. Stated plainly rather than implied by absence.

function regionBetween(html: string, startMarker: string, endMarker?: string): string {
  const start = html.indexOf(startMarker);
  expect(start, `${startMarker} not found in page`).toBeGreaterThanOrEqual(0);
  if (!endMarker) return html.slice(start);
  const end = html.indexOf(endMarker, start + startMarker.length);
  expect(end, `${endMarker} not found after ${startMarker}`).toBeGreaterThanOrEqual(0);
  return html.slice(start, end);
}

const RENDERED_PAGES = TEST_PAGES.filter((p) => p.name.endsWith("/everything"));

// The same content routed through the `rebase` shortcode instead of read
// directly. Covered separately because rebase's bulk percent→angle conversion
// broke this shortcode specifically: a fence-emitting shortcode has to be
// restored to percent form in rebase.html, and nothing about a normal-page
// pass would reveal a missing restore.
const REBASED_PAGES = TEST_PAGES.filter((p) => p.name.endsWith("/rebased"));

test.describe("github-yaml shortcode", () => {
  for (const page of RENDERED_PAGES) {
    test(`${page.name} emits its own fenced yaml code block`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB_YAML_SHORTCODE.", "MARKER_REUSE_APPEND");

      // The shortcode writes the fence itself, so this asserts the PERCENT-form
      // call actually re-entered the markdown renderer. Called with the angle
      // form the backticks would survive as literal text and there would be no
      // <pre><code> here at all — the single most likely way to misuse it.
      expect(
        region,
        "no yaml code block — check the call site uses {{% %}}, not {{< >}}, since the shortcode emits a markdown fence",
      ).toMatch(
        /<pre[\s\S]*?<code[^>]*(?:language-yaml|data-lang=["']yaml)[\s\S]*?<\/code>[\s\S]*?<\/pre>/i,
      );

      // The pinned config's own content, to prove the fetch resolved rather
      // than silently emitting an empty block. Chroma tokenizes the YAML into
      // per-token <span>s, so `port: 3000` never appears as a contiguous
      // string in the HTML — strip tags and decode the newline entity first.
      // (Chroma emits line breaks as `&#10;`, not literal newlines.)
      const text = region.replace(/<[^>]+>/g, "").replace(/&#10;/g, "\n");
      expect(text, "expected 'port: 3000' from the fetched config").toMatch(
        /port:\s*3000/,
      );
    });

    test(`${page.name} strips the yaml-language-server directive`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB_YAML_SHORTCODE.", "MARKER_REUSE_APPEND");

      // The fixture URL is pinned to a SHA whose file DOES start with the
      // directive, so this is a live assertion and not a vacuous one. If the
      // strip regex breaks, the line reappears as the first line of the block.
      expect(
        region,
        "'yaml-language-server' leaked into the rendered block; the strip regex is not matching",
      ).not.toMatch(/yaml-language-server/);
    });

    test(`${page.name} captions the block with filename and base_url`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB_YAML_SHORTCODE.", "MARKER_REUSE_APPEND");

      // Hextra's codeblock component renders the `filename` attribute as a
      // visible caption. This is one of the three reasons the shortcode exists
      // rather than callers hand-wrapping `github` in a fence, so it is worth
      // pinning: passing the attributes through the fence is easy to lose in a
      // refactor and produces no error when it happens.
      expect(region, "no 'config.yaml' filename caption on the code block").toMatch(
        /config\.yaml/,
      );

      // The caption's link must carry a WELL-FORMED absolute URL. The original
      // of this shortcode derived it with `path.Dir`, a filesystem function that
      // collapses `//`, so every rendered block linked to `https:/host/…` with
      // one slash. Browsers mostly recover from that; link checkers need not.
      //
      // QUOTE-AGNOSTIC on purpose. `--minify` drops attribute quotes, and that
      // is not hypothetical here: the production defect was invisible to a
      // `href="https:/…"` grep for exactly that reason, and only showed up once
      // the quotes were taken out of the pattern.
      expect(
        region,
        "base_url link has a malformed scheme (https:/ with one slash) — path.Dir collapsed the '//'",
      ).not.toMatch(/href=["']?https:\/(?!\/)/);
      // Hextra joins `base_url` and `filename`, so the caption's href is the
      // full file URL, not the directory.
      expect(region, "no well-formed base_url link on the code block caption").toMatch(
        /href=["']?https:\/\/raw\.githubusercontent\.com\/[^"'\s>]*\/examples\/mcp-basic\/config\.yaml/,
      );
    });
  }
});

test.describe("github-yaml shortcode inside an ordered list", () => {
  // Every production call site indents this shortcode inside a numbered step,
  // so this is the shape that actually has to work. A block-level element
  // emitted at the wrong indent terminates the list, and the tell is the
  // numbering: the step after the embed either restarts at 1 (a severed
  // <ol start=…>) or falls out of the <ol> entirely. Counting <li> cannot see
  // either failure, so assert on the containing list.
  for (const page of [...RENDERED_PAGES, ...REBASED_PAGES]) {
    test(`${page.name} keeps all three steps in one <ol>`, () => {
      const html = readFixture(page.filePath);
      // Anchor on the heading's generated id, not its text: the text also
      // appears in the TOC, and slicing from the marker itself would start
      // INSIDE the first <li>, putting the <ol> open tag outside the region.
      const region = regionBetween(html, 'id="inside-a-numbered-list-step"', "<h2");

      for (const m of ["MARKER_GHYAML_STEP_1", "MARKER_GHYAML_STEP_2", "MARKER_GHYAML_STEP_3"]) {
        expect(region, `${m} missing`).toContain(m);
      }

      // One <ol> open tag in the region. Two means the embed split the list.
      const olCount = (region.match(/<ol[\s>]/gi) || []).length;
      expect(
        olCount,
        "expected exactly one <ol> — a second one means the embed terminated the list and step 3 restarted the numbering",
      ).toBe(1);

      // A severed list is re-opened with an explicit start offset. Quote-agnostic
      // because --minify drops attribute quotes.
      expect(region, "found <ol start=…> — the list was severed and renumbered").not.toMatch(
        /<ol[^>]*\sstart=/i,
      );

      // The embed itself still has to render as a code block in this position.
      expect(region, "no yaml code block inside the list step").toMatch(
        /<pre[\s\S]*?<code[^>]*(?:language-yaml|data-lang=["']yaml)/i,
      );
      expect(region, "literal ``` leaked inside the list step").not.toMatch(/```/);
    });
  }
});

test.describe("github-yaml shortcode under rebase", () => {
  for (const page of REBASED_PAGES) {
    test(`${page.name} still renders a code block, not literal backticks`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_GITHUB_YAML_SHORTCODE.", "MARKER_REUSE_APPEND");

      expect(
        region,
        "literal ``` in prose — rebase.html is not restoring github-yaml to percent form",
      ).not.toMatch(/```/);

      expect(region, "no yaml code block on the rebased page").toMatch(
        /<pre[\s\S]*?<code[^>]*(?:language-yaml|data-lang=["']yaml)/i,
      );
    });
  }
});

test.describe("reuse-append shortcode", () => {
  for (const page of RENDERED_PAGES) {
    test(`${page.name} appends the extra row into the base table`, () => {
      const html = readFixture(page.filePath);
      const region = regionBetween(html, "MARKER_REUSE_APPEND.", "<h2");

      expect(region, "no <table> in the reuse-append region").toMatch(/<table[\s>]/i);

      // Both rows present is necessary but not sufficient — they could be a
      // table plus a stray paragraph of pipes, which is exactly the failure the
      // shortcode exists to prevent. So assert on the cells, and that there is
      // only ONE table.
      expect(region, "base row missing from the combined table").toMatch(
        /<td[^>]*>[^<]*MARKER_APPEND_BASE_ROW/i,
      );
      expect(
        region,
        "extra row is not in a <td> — appended content fell out of the table and rendered as a paragraph of pipes",
      ).toMatch(/<td[^>]*>[^<]*MARKER_APPEND_EXTRA_ROW/i);

      const tableCount = (region.match(/<table[\s>]/gi) || []).length;
      expect(
        tableCount,
        "expected exactly one table — two means the base and the appended rows rendered as separate blocks",
      ).toBe(1);
    });
  }
});
