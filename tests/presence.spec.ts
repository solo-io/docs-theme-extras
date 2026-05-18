import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

const BASE_URL = "/" + target.baseURL.replace(/^\/+|\/+$/g, "");

// Regression-shape spec: the things that should never disappear from a
// rendered page. Catches accidental removals or scope-creep refactors that
// drop persistent UI scaffolding.

const TOPIC_PAGES = TEST_PAGES.filter(
  (p) => p.name !== "landing" && !p.name.endsWith("/_index"),
);

// Scaffolding selectors that must appear on every topic page. A failure
// here means the layout dropped a chunk of UI — almost always a regression.
const REQUIRED_SCAFFOLDING: { selector: string; description: string }[] = [
  { selector: ".hextra-nav-container", description: "top nav container" },
  { selector: ".hextra-sidebar-container", description: "left sidebar container" },
  { selector: ".version-dropdown", description: "version dropdown" },
  { selector: ".hextra-theme-toggle", description: "theme toggle button" },
  { selector: '[type="search"]', description: "search input" },
  { selector: "footer", description: "page footer" },
  { selector: "main", description: "main content region" },
  { selector: "h1", description: "page H1" },
];

// The full set of H2 sections the everything topic should render. Listed
// in alphabetical order to match the source. If a section gets accidentally
// deleted from the asset, this spec surfaces exactly which one.
const EXPECTED_H2_SECTIONS = [
  "Alerts",
  "Callout",
  "Cards",
  "Checklist",
  "Code blocks (highlighting and language tags)",
  "Conditional text by build condition",
  "Curl URL quoting",
  "Details",
  "GitHub embed",
  "GitHub table",
  "Images",
  "Internal links via the link shortcode",
  "Lists (3-level ordered and unordered)",
  "Multi-block conditional with bullets and code (debug-gateway pattern)",
  "Nested conditionals (conditional-text wrapping version wrapping link)",
  "OpenAPI rendering",
  "Prism syntax highlighting",
  "Read file",
  "Reuse and snippets",
  "Reuse images (light and dark variants)",
  "Steps",
  "Tables",
  "Tabs in both shortcode forms",
  "Tabs in ordered lists",
  "Tabs in steps",
  "Versioned content",
];

function selectorFound(html: string, selector: string): boolean {
  // Lightweight selector matching for class/tag/[attr]. Good enough for
  // the small surface this spec covers; avoids spinning up a full DOM
  // parser since the rest of the static suite already operates on raw HTML.
  if (selector.startsWith(".")) {
    const cls = selector.slice(1);
    const re = new RegExp(`class="[^"]*\\b${cls.replace(/-/g, "\\-")}\\b[^"]*"`);
    return re.test(html);
  }
  if (selector.startsWith("[")) {
    // Attribute selector like [type="search"]
    const m = selector.match(/^\[([^=]+)="([^"]+)"\]$/);
    if (!m) return false;
    const re = new RegExp(`${m[1]}="${m[2].replace(/"/g, "\\\"")}"`);
    return re.test(html);
  }
  // Tag name
  return new RegExp(`<${selector}\\b`, "i").test(html);
}

function extractH2s(html: string): string[] {
  // Hextra wraps H2 text in a span before an anchor link. Match any inline
  // children of h2 and strip tags. Real shape:
  //   <h2>Alerts<span ...></span><a ...></a></h2>
  //
  // The reuse template's flatten replaces newlines inside the rendered
  // snippet (including between an H2's children) with `&#10;` entities.
  // Decode those as whitespace so the extracted text matches the source
  // heading.
  const out: string[] = [];
  for (const m of html.matchAll(/<h2[^>]*>([\s\S]*?)<\/h2>/g)) {
    const text = m[1]
      .replace(/<[^>]+>/g, " ")
      .replace(/&#10;/g, " ")
      .replace(/&amp;/g, "&")
      .replace(/&#39;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/\s+/g, " ")
      .trim();
    if (text) out.push(text);
  }
  return out;
}

test.describe("required UI scaffolding present on every topic page", () => {
  for (const page of TOPIC_PAGES) {
    for (const item of REQUIRED_SCAFFOLDING) {
      test(`${page.name}: ${item.description} (${item.selector})`, () => {
        const html = readFixture(page.filePath);
        expect(
          selectorFound(html, item.selector),
          `${page.name} missing ${item.description} (${item.selector})`,
        ).toBe(true);
      });
    }
  }
});

test.describe("expected H2 sections render on every topic page", () => {
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: every expected H2 is present`, () => {
      const html = readFixture(page.filePath);
      const h2s = extractH2s(html);
      const missing = EXPECTED_H2_SECTIONS.filter((expected) => !h2s.includes(expected));
      expect(
        missing,
        `${page.name} missing H2 sections:\n  ${missing.join("\n  ")}\nfound:\n  ${h2s.join("\n  ")}`,
      ).toEqual([]);
    });

    test(`${page.name}: H2 sections appear in alphabetical order`, () => {
      const html = readFixture(page.filePath);
      const h2s = extractH2s(html).filter((h) => EXPECTED_H2_SECTIONS.includes(h));
      const sorted = [...h2s].sort((a, b) => a.localeCompare(b));
      expect(h2s, `${page.name}: H2 order drifted from alphabetical`).toEqual(sorted);
    });
  }
});

test.describe("page main content is non-trivially populated", () => {
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: <main> contains substantial body text`, () => {
      const html = readFixture(page.filePath);
      const mainMatch = html.match(/<main[^>]*>([\s\S]*?)<\/main>/);
      expect(mainMatch, `${page.name}: no <main> element`).not.toBeNull();
      const text = mainMatch![1].replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
      // 1000 chars is well below what every topic page actually emits but
      // far above what an accidentally-empty page would produce.
      expect(text.length, `${page.name}: <main> body looks empty (${text.length} chars)`)
        .toBeGreaterThan(1000);
    });
  }
});

test.describe("breadcrumb renders on every topic page", () => {
  // Hextra's breadcrumb partial (layouts/_partials/breadcrumb.html) emits a
  // div with these utility classes, containing a home material-icon and
  // chevron-separated ancestor links ending in the current page title. The
  // partial fires automatically for the docs layout (the cascading type set
  // in _index.md) so every topic page should have one.
  for (const page of TOPIC_PAGES) {
    test(`${page.name} has the breadcrumb container and home icon`, () => {
      const html = readFixture(page.filePath);
      expect(
        html,
        `${page.name}: missing breadcrumb outer container`,
      ).toMatch(/class="[^"]*hx:mt-1\.5 hx:flex hx:items-center hx:gap-1[^"]*"/);
      expect(
        html,
        `${page.name}: missing home icon inside breadcrumb`,
      ).toMatch(/<i class="material-icons"[^>]*>\s*home\s*<\/i>/);
    });
    test(`${page.name} breadcrumb links to its parent section`, () => {
      const html = readFixture(page.filePath);
      // For a page at <BASE_URL>/<version>/<slug>/, the breadcrumb should
      // link to <BASE_URL>/<version>/. Match the version segment from the
      // page name.
      const version = page.version;
      if (!version) return;
      expect(
        html,
        `${page.name}: breadcrumb missing parent section link to ${BASE_URL}/${version}/`,
      ).toMatch(new RegExp(`href="${BASE_URL}/${version}/"`));
    });
  }
});

test.describe("numbered list continues across tabs", () => {
  // The "Numbering across tabs" section in the fixture has 4 numbered
  // items: 2 before the tabs, 2 after. The post-tab items must continue
  // from 3 (not restart at 1) so multi-step procedures with embedded
  // tab-of-options blocks render correctly. The substep numbering inside
  // each tab is independent and should restart at 1 within each tab body.
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: post-tab list resumes from 3`, () => {
      const html = readFixture(page.filePath);
      const beforeIdx = html.indexOf("MARKER_NUMBERED_BEFORE_TAB");
      const afterIdx = html.indexOf("MARKER_NUMBERED_AFTER_TAB");
      expect(beforeIdx, `${page.name}: missing before-tab marker`).toBeGreaterThan(-1);
      expect(afterIdx, `${page.name}: missing after-tab marker`).toBeGreaterThan(beforeIdx);

      // The <li> containing MARKER_NUMBERED_AFTER_TAB must be the third
      // item in its surrounding <ol>. Either the <li> has value="3", the
      // surrounding <ol> declares start="3", or the items 1 and 2 (before
      // tab) are siblings in the same <ol>. Test for any of these.
      const afterLi = html.lastIndexOf("<li", afterIdx);
      expect(afterLi).toBeGreaterThan(-1);
      const liTag = html.substring(afterLi, html.indexOf(">", afterLi) + 1);
      const liHasValue3 = /value="3"/.test(liTag);

      // Walk backward from the after marker to find the surrounding <ol>.
      const olOpenIdx = html.lastIndexOf("<ol", afterIdx);
      const olOpenTag = html.substring(olOpenIdx, html.indexOf(">", olOpenIdx) + 1);
      const olHasStart3 = /start="3"/.test(olOpenTag);

      // Same-list case: count opening vs closing <ol> tags between the
      // two markers. If they're in the same <ol>, the count balances out.
      const between = html.substring(beforeIdx, afterIdx);
      const opens = (between.match(/<ol\b/g) || []).length;
      const closes = (between.match(/<\/ol>/g) || []).length;
      const sameList = closes <= opens;

      expect(
        liHasValue3 || olHasStart3 || sameList,
        `${page.name}: post-tab item neither value=3, start=3, nor in the same <ol> as item 1`,
      ).toBe(true);
    });

    test(`${page.name}: substep inside tab restarts at 1`, () => {
      const html = readFixture(page.filePath);
      const insideIdx = html.indexOf("MARKER_NUMBERED_INSIDE_TAB");
      expect(insideIdx, `${page.name}: missing inside-tab marker`).toBeGreaterThan(-1);
      // The first occurrence of this marker should be in a fresh <ol>
      // (no value > 1, no explicit start > 1). Find the enclosing <li>
      // and assert it doesn't carry value="2"+ or come after a value>=2 sibling.
      const insideLi = html.lastIndexOf("<li", insideIdx);
      const liTag = html.substring(insideLi, html.indexOf(">", insideLi) + 1);
      expect(
        /value="[2-9]/.test(liTag),
        `${page.name}: first substep should not have value≥2`,
      ).toBe(false);
    });
  }
});

// Helper: returns the substring of `html` that lies inside the .hextra-steps
// wrapper containing an <h3> that includes the given marker. We have to
// anchor on the H3 (not just any occurrence of the marker) because each
// marker also appears in the page TOC and in the Copy-as-Markdown <script>
// source — both before the rendered content. From the H3, walk back to the
// enclosing `class="hextra-steps"` div, then forward balancing <div> tags
// to its matching close so adjacent steps blocks don't bleed in.
function extractStepsWrapper(html: string, anchorMarker: string): string {
  // The marker appears immediately after the opening <h3> tag in the
  // rendered output — Hextra's heading template emits the marker text
  // before any anchor span. Tight match to avoid swallowing earlier h3s.
  const h3Re = new RegExp(`<h3\\b[^>]*>${anchorMarker}\\b`);
  const h3Match = html.match(h3Re);
  if (!h3Match || h3Match.index === undefined) return "";
  const anchorIdx = h3Match.index;

  const wrapperOpen = html.lastIndexOf('class="hextra-steps', anchorIdx);
  if (wrapperOpen < 0) return "";
  const divStart = html.lastIndexOf("<div", wrapperOpen);
  const divRe = /<div\b|<\/div>/g;
  divRe.lastIndex = divStart;
  let depth = 0;
  let m: RegExpExecArray | null;
  while ((m = divRe.exec(html)) !== null) {
    if (m[0] === "</div>") {
      depth--;
      if (depth === 0) return html.substring(divStart, m.index + m[0].length);
    } else {
      depth++;
    }
  }
  return "";
}

test.describe("steps shortcode renders all H3s in source order", () => {
  // Hextra renders step numbers via CSS counter on H3 children. The counter
  // increments per H3 inside the .hextra-steps wrapper. So if all expected
  // H3 markers are present in the wrapper IN SOURCE ORDER and there are no
  // EXTRA H3s before them, the visible "1, 2, 3..." numbering is correct.
  // Catches: dropped step bodies, extra H3 leaks, or the percent->angle
  // rebase rewrite breaking H3 rendering inside steps.
  const stepCases: { label: string; markers: string[] }[] = [
    {
      label: "Steps section",
      markers: ["MARKER_STEP_1", "MARKER_STEP_2", "MARKER_STEP_3"],
    },
    {
      label: "Steps with tabs section",
      markers: [
        "MARKER_STEPS_TABS_1",
        "MARKER_STEPS_TABS_2",
        "MARKER_STEPS_TABS_3",
        "MARKER_STEPS_TABS_4",
      ],
    },
  ];

  for (const page of TOPIC_PAGES) {
    for (const { label, markers } of stepCases) {
      test(`${page.name}: ${label} H3s appear in source order with no gaps`, () => {
        const html = readFixture(page.filePath);
        const wrapper = extractStepsWrapper(html, markers[0]);
        expect(
          wrapper,
          `${page.name}: could not locate .hextra-steps wrapper around ${markers[0]}`,
        ).not.toBe("");

        // Each marker must be wrapped in an <h3>...marker...</h3>. If the
        // shortcode rebase pipeline mis-renders, markers leak as plain text
        // instead — that breaks the CSS counter even if the markers are
        // present, so check the H3 wrapping explicitly.
        const positions: number[] = [];
        for (const marker of markers) {
          const h3Re = new RegExp(`<h3\\b[^>]*>${marker}\\b`);
          const m = wrapper.match(h3Re);
          expect(
            m,
            `${page.name}: ${marker} not the leading text of any <h3> within the steps wrapper`,
          ).not.toBeNull();
          positions.push(wrapper.indexOf(m![0]));
        }
        // Source order: positions must be strictly increasing.
        for (let i = 1; i < positions.length; i++) {
          expect(
            positions[i],
            `${page.name}: ${markers[i]} appears before ${markers[i - 1]} in the steps wrapper`,
          ).toBeGreaterThan(positions[i - 1]);
        }

        // Count H3 children directly under the wrapper — must match the
        // number of expected markers. A surplus H3 means stray content
        // inflated the step counter; a shortage means a step body went
        // missing.
        const h3Count = (wrapper.match(/<h3\b/g) || []).length;
        expect(
          h3Count,
          `${page.name}: ${label} steps wrapper has ${h3Count} <h3> children, expected ${markers.length}`,
        ).toBe(markers.length);
      });
    }
  }
});

test.describe("steps with tabs: tabs render inside step 2 only", () => {
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: Option A and B tab markers nested inside step 2`, () => {
      const html = readFixture(page.filePath);
      const wrapper = extractStepsWrapper(html, "MARKER_STEPS_TABS_2");
      expect(wrapper, `${page.name}: missing steps-with-tabs wrapper`).not.toBe("");

      // Both tab-body markers must live inside the wrapper (i.e., inside
      // the steps shortcode, not after it).
      expect(wrapper).toContain("MARKER_STEPS_TABS_A");
      expect(wrapper).toContain("MARKER_STEPS_TABS_B");

      // The tab markers must appear AFTER step 2's marker and BEFORE
      // step 3's marker in source order.
      const step2Idx = wrapper.indexOf("MARKER_STEPS_TABS_2");
      const step3Idx = wrapper.indexOf("MARKER_STEPS_TABS_3");
      const optionAIdx = wrapper.indexOf("MARKER_STEPS_TABS_A");
      const optionBIdx = wrapper.indexOf("MARKER_STEPS_TABS_B");
      expect(optionAIdx, `${page.name}: Option A not between step 2 and step 3`)
        .toBeGreaterThan(step2Idx);
      expect(optionAIdx).toBeLessThan(step3Idx);
      expect(optionBIdx).toBeGreaterThan(step2Idx);
      expect(optionBIdx).toBeLessThan(step3Idx);

      // The tabs container must be present in the wrapper.
      expect(
        wrapper,
        `${page.name}: no .hextra-tabs found inside steps-with-tabs`,
      ).toMatch(/class="[^"]*hextra-tabs/);
    });
  }
});

test.describe("ordered list (3 levels) renders all <li> with no gaps", () => {
  // The Lists section's ordered list has structure 2-2-2: top-level <ol>
  // with 2 <li>; the first <li> contains a nested <ol> with 2 <li>; and
  // the first nested <li> contains a 3rd-level <ol> with 2 <li>. Total
  // <li> count: 2 + 2 + 2 = 6, contributed by 3 <ol> elements.
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: nested <ol> structure is 2-2-2`, () => {
      const html = readFixture(page.filePath);
      const startIdx = html.indexOf("MARKER_OL_L1");
      expect(startIdx, `${page.name}: MARKER_OL_L1 missing`).toBeGreaterThan(-1);

      // Walk back to the enclosing <ol> and forward through its matching
      // </ol> to extract the full nested-list region.
      const olOpen = html.lastIndexOf("<ol", startIdx);
      expect(olOpen).toBeGreaterThan(-1);
      const olRe = /<ol\b|<\/ol>/g;
      olRe.lastIndex = olOpen;
      let depth = 0;
      let region = "";
      let m: RegExpExecArray | null;
      while ((m = olRe.exec(html)) !== null) {
        if (m[0] === "</ol>") {
          depth--;
          if (depth === 0) {
            region = html.substring(olOpen, m.index + m[0].length);
            break;
          }
        } else {
          depth++;
        }
      }
      expect(region, `${page.name}: could not extract <ol> region`).not.toBe("");

      const olCount = (region.match(/<ol\b/g) || []).length;
      const liCount = (region.match(/<li\b/g) || []).length;
      // Skipping/duplication shows up as an off-by-N count, with no need
      // to read the rendered numbers.
      expect(
        olCount,
        `${page.name}: ordered-list region has ${olCount} <ol> elements, expected 3`,
      ).toBe(3);
      expect(
        liCount,
        `${page.name}: ordered-list region has ${liCount} <li> elements, expected 6`,
      ).toBe(6);

      // No <li> should carry an unexpected value="N" (Goldmark only emits
      // value when the source list explicitly used a non-1 starting
      // number). In the fixture, every numbered item starts at 1, so any
      // value attribute means continuation broke and a sibling <ol>
      // restarted with an explicit value.
      expect(
        /<li[^>]*\bvalue="\d+"/.test(region),
        `${page.name}: ordered-list <li> carries an explicit value=, suggesting a list continuation broke`,
      ).toBe(false);
    });
  }
});

test.describe("consumer override hooks are still wired", () => {
  // Regression guard for "module silently drops a partial call" bugs.
  //
  // Two near-misses motivated this:
  //   1. layouts/partials/footer.html shadowed Hextra's but didn't
  //      forward to `partial "custom/footer.html"` — consumers'
  //      copyright + back-to-top JS silently disappeared.
  //   2. layouts/partials/custom/head-end.html in the module shadowed
  //      consumers' override — module bootstrap loaded but consumers'
  //      glossary / GTM / per-repo scripts didn't.
  //
  // Both classes of bug are caught by asserting that markers emitted
  // from the fixture's custom/* partials appear in rendered HTML. If a
  // future module change stops calling either custom hook, the marker
  // won't render and the test fails with a precise pointer to which
  // chain broke.
  //
  // The fixture ships:
  //   fixture/layouts/partials/custom/head-end.html → MARKER_CUSTOM_HEAD_END
  //   fixture/layouts/partials/custom/footer.html   → MARKER_CUSTOM_FOOTER
  for (const page of TOPIC_PAGES) {
    test(`${page.name}: MARKER_CUSTOM_HEAD_END appears (head-end hook fires)`, () => {
      const html = readFixture(page.filePath);
      expect(
        html,
        `${page.name}: Hextra → custom/head-end.html chain broken — module bootstrap will fail to load on consumers`,
      ).toContain("MARKER_CUSTOM_HEAD_END");
    });
    test(`${page.name}: MARKER_CUSTOM_FOOTER appears (footer hook fires)`, () => {
      const html = readFixture(page.filePath);
      expect(
        html,
        `${page.name}: module footer.html → custom/footer.html chain broken — consumer footer content will silently disappear`,
      ).toContain("MARKER_CUSTOM_FOOTER");
    });
  }
});

test.describe("section index pages preserve their navigation", () => {
  // Section index pages have different layout (they're auto-generated
  // landing pages) but should still have nav, footer, sidebar, etc.
  //
  // Derived from TEST_PAGES (the fixture). When a consumer doesn't ship
  // the fixture (i.e. .docs-test.toml has no [[pages]] entries), the
  // result is an empty array and the for-loop below generates no tests.
  const sectionIndexPages = target.versions
    .map((v) => {
      const page = TEST_PAGES.find((p) => p.name === `${v}/everything`);
      if (!page) return null;
      return {
        name: `${v} index`,
        filePath: page.filePath.replace(
          /everything\/index\.html$/,
          "index.html",
        ),
      };
    })
    .filter((x): x is { name: string; filePath: string } => x !== null);

  for (const idx of sectionIndexPages) {
    test(`${idx.name} has nav, sidebar, footer, version dropdown`, () => {
      const html = readFixture(idx.filePath);
      for (const sel of [
        ".hextra-nav-container",
        ".hextra-sidebar-container",
        ".version-dropdown",
        "footer",
      ]) {
        expect(
          selectorFound(html, sel),
          `${idx.name} missing ${sel}`,
        ).toBe(true);
      }
    });
  }
});
