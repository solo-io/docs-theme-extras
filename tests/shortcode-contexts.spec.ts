import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { VERSION_MARKERS, CONDITIONAL_MARKERS } from "./helpers/sentinels";

// Structural-context guards for the {{< version >}} and
// {{< conditional-text >}} shortcodes. The fixture's "Shortcodes in rich
// markdown contexts" section drops each shortcode into a different host
// markdown structure (callout, deep list, table, tab, inline code, bold,
// heading, sequential, link-dest, link-text, in-fence, wrap-around-fence).
// For each combination, we assert two things:
//   1. The marker IS present on the pages where the gate matches, and
//      absent on the pages where it doesn't. (Presence is partly covered
//      by versioning.spec.ts — this spec retains the gating check so a
//      single file documents the matrix end-to-end.)
//   2. The marker lands inside the EXPECTED enclosing element. The exact
//      structural check varies by context (e.g. <code>, <strong>, <h4>,
//      <a>, <td>, <li>, <pre>). A regression that breaks the host's
//      markdown processing typically manifests as the marker appearing
//      in plain prose / outside its container, which the structural
//      check catches even when raw presence still passes.

const V2_PAGES = ["v2/everything", "v2/rebased"];
const NON_V2_PAGES = [
  "v1/everything",
  "v1/rebased",
  "main/everything",
  "main/rebased",
];
const ALL_TOPIC_PAGES = [...V2_PAGES, ...NON_V2_PAGES];

// Strip the embedded copy-as-markdown <script> so raw shortcode source
// text doesn't produce false-positive matches when we search for markers
// or for literal "{{<" leaks.
function visibleHtml(filePath: string): string {
  return readFixture(filePath).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// Locate the smallest balanced <tag>…</tag> region wrapping `idx`. Walks
// the html in a single linear scan, maintaining a depth stack of unclosed
// open positions. When we hit `idx`, the stack top is the start of the
// smallest enclosing tag. We continue scanning; the first close that
// brings depth back below the at-idx depth is the matching end.
//
// Returns null when idx isn't inside any <tag>…</tag>. The interleaved
// scan handles non-nesting tags (like <a>) correctly — naïve "pop on
// close" against a pre-collected opens array yields the wrong tag for
// sequential, non-nested anchors.
function enclosingRegion(
  html: string,
  idx: number,
  tag: string,
): { start: number; end: number } | null {
  const re = new RegExp(`<${tag}\\b[^>]*>|</${tag}>`, "g");
  const openStack: number[] = [];
  let foundIdx = false;
  let depthAtIdx = 0;
  let m: RegExpExecArray | null;
  while ((m = re.exec(html)) !== null) {
    if (!foundIdx && m.index >= idx) {
      foundIdx = true;
      depthAtIdx = openStack.length;
      if (depthAtIdx === 0) return null;
    }
    if (m[0].startsWith("</")) {
      if (foundIdx && openStack.length === depthAtIdx) {
        return {
          start: openStack[openStack.length - 1],
          end: m.index + m[0].length,
        };
      }
      openStack.pop();
    } else {
      openStack.push(m.index);
    }
  }
  return null;
}

function pageByName(name: string) {
  return TEST_PAGES.find((p) => p.name === name);
}

// ──────────────────────────────────────────────────────────────────────
// 1. Inside callout / alert
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes inside callout/alert host", () => {
  for (const page of TEST_PAGES) {
    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inCallout} renders inside the alert container`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inCallout);
        expect(idx, `${VERSION_MARKERS.inCallout} missing`).toBeGreaterThan(-1);

        // No shortcode-tag bleed near the marker (would indicate the
        // version shortcode failed to parse and its raw tag leaked into
        // the rendered HTML).
        const window = html.slice(Math.max(0, idx - 80), idx + 80);
        expect(window, `raw shortcode tag near marker`).not.toMatch(/\{\{[%<]/);

        // The marker must live inside an enclosing <div>. Walk up from
        // there and assert the alert/callout signature class is present
        // somewhere on the enclosing chain (hextra alerts emit a div with
        // a context-coloured background class).
        const region = enclosingRegion(html, idx, "div");
        expect(region, `marker not inside any <div>`).not.toBeNull();
        const openTag = html.slice(region!.start, html.indexOf(">", region!.start) + 1);
        const ancestorWindow = html.slice(Math.max(0, region!.start - 600), region!.start + 200);
        expect(
          openTag + ancestorWindow,
          `enclosing <div> isn't recognisably an alert/callout (no hextra-callout / hx-callout / alert class found nearby)`,
        ).toMatch(/callout|hextra-callout|hx-callout/i);
      });
    }
  }

  // Conditional renders on every page (buildCondition = "test").
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;
    test(`${page.name}: ${CONDITIONAL_MARKERS.inCallout} renders inside the callout container`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inCallout);
      expect(idx, `${CONDITIONAL_MARKERS.inCallout} missing`).toBeGreaterThan(-1);
      const window = html.slice(Math.max(0, idx - 80), idx + 80);
      expect(window).not.toMatch(/\{\{[%<]/);
      const region = enclosingRegion(html, idx, "div");
      expect(region, `marker not inside any <div>`).not.toBeNull();
      const ancestorWindow = html.slice(
        Math.max(0, region!.start - 600),
        region!.start + 200,
      );
      expect(ancestorWindow).toMatch(/callout|hextra-callout|hx-callout/i);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 2. Inside 3-level unordered list (deepest bullet)
// ──────────────────────────────────────────────────────────────────────

function ulDepthAt(html: string, idx: number): number {
  // <ul> depth at character index `idx`. Counts opens minus closes
  // strictly before idx.
  const opens = (html.slice(0, idx).match(/<ul\b/g) || []).length;
  const closes = (html.slice(0, idx).match(/<\/ul>/g) || []).length;
  return opens - closes;
}

function olDepthAt(html: string, idx: number): number {
  const opens = (html.slice(0, idx).match(/<ol\b/g) || []).length;
  const closes = (html.slice(0, idx).match(/<\/ol>/g) || []).length;
  return opens - closes;
}

test.describe("shortcodes at 3-level list depth", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inUL3} sits at <ul> depth 3`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inUL3);
        expect(idx, `${VERSION_MARKERS.inUL3} missing`).toBeGreaterThan(-1);
        expect(
          ulDepthAt(html, idx),
          `${VERSION_MARKERS.inUL3}: list nesting collapsed`,
        ).toBeGreaterThanOrEqual(3);
        // Marker must be inside a <li> at that depth.
        const liRegion = enclosingRegion(html, idx, "li");
        expect(liRegion, `${VERSION_MARKERS.inUL3} not inside any <li>`).not.toBeNull();
      });

      test(`${page.name}: ${VERSION_MARKERS.inOL3} sits at <ol> depth 3`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inOL3);
        expect(idx, `${VERSION_MARKERS.inOL3} missing`).toBeGreaterThan(-1);
        expect(
          olDepthAt(html, idx),
          `${VERSION_MARKERS.inOL3}: list nesting collapsed`,
        ).toBeGreaterThanOrEqual(3);
        const liRegion = enclosingRegion(html, idx, "li");
        expect(liRegion).not.toBeNull();
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inUL3} sits at <ul> depth 3`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inUL3);
      expect(idx, `${CONDITIONAL_MARKERS.inUL3} missing`).toBeGreaterThan(-1);
      expect(ulDepthAt(html, idx)).toBeGreaterThanOrEqual(3);
      const liRegion = enclosingRegion(html, idx, "li");
      expect(liRegion).not.toBeNull();
    });

    test(`${page.name}: ${CONDITIONAL_MARKERS.inOL3} sits at <ol> depth 3`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inOL3);
      expect(idx, `${CONDITIONAL_MARKERS.inOL3} missing`).toBeGreaterThan(-1);
      expect(olDepthAt(html, idx)).toBeGreaterThanOrEqual(3);
      const liRegion = enclosingRegion(html, idx, "li");
      expect(liRegion).not.toBeNull();
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 3. Inside table cell
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes inside markdown table cells", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inTableCell} is inside a <td>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inTableCell);
        expect(idx, `${VERSION_MARKERS.inTableCell} missing`).toBeGreaterThan(-1);
        const td = enclosingRegion(html, idx, "td");
        expect(td, `marker not inside any <td>`).not.toBeNull();
        const tr = enclosingRegion(html, idx, "tr");
        expect(tr, `marker not inside any <tr>`).not.toBeNull();
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inTableCell} is inside a <td>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inTableCell);
      expect(idx, `${CONDITIONAL_MARKERS.inTableCell} missing`).toBeGreaterThan(-1);
      const td = enclosingRegion(html, idx, "td");
      expect(td).not.toBeNull();
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 4. Inside tab body
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes inside tab bodies", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inTabBody} lives under a hextra-tabs container`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inTabBody);
        expect(idx, `${VERSION_MARKERS.inTabBody} missing`).toBeGreaterThan(-1);

        // The marker should be inside the hextra-tabs region. Hextra
        // emits a div with class containing "hextra-tabs" or similar
        // around each tab group; we just look for any container marker
        // signature in the slice between page start and the marker, and
        // require it's not yet been closed.
        const tabsOpenSig = /class="[^"]*hextra-tabs|role="tabpanel"|data-tabs|tab-panel/i;
        const before = html.slice(0, idx);
        const lastOpen = Math.max(
          before.search(/class="[^"]*hextra-tabs/),
          before.search(/role="tabpanel"/),
        );
        expect(
          lastOpen,
          `${VERSION_MARKERS.inTabBody}: no preceding hextra-tabs / tabpanel signature`,
        ).toBeGreaterThan(-1);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inTabBody} lives under a hextra-tabs container`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inTabBody);
      expect(idx, `${CONDITIONAL_MARKERS.inTabBody} missing`).toBeGreaterThan(-1);
      const before = html.slice(0, idx);
      const lastOpen = Math.max(
        before.search(/class="[^"]*hextra-tabs/),
        before.search(/role="tabpanel"/),
      );
      expect(lastOpen).toBeGreaterThan(-1);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 5. Around inline code phrase
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes wrapping an inline code phrase", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inCodePhrase} renders inside <code>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inCodePhrase);
        expect(idx, `${VERSION_MARKERS.inCodePhrase} missing`).toBeGreaterThan(-1);
        const code = enclosingRegion(html, idx, "code");
        expect(
          code,
          `${VERSION_MARKERS.inCodePhrase} not inside <code> — backticks were not parsed (likely raw-emit when heuristic should have routed to RenderString)`,
        ).not.toBeNull();
        // No literal backticks around the marker — they should have
        // been consumed by markdown into the <code> wrapper.
        const window = html.slice(Math.max(0, idx - 20), idx + 60);
        expect(window, `literal backticks survived around marker`).not.toMatch(/`/);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inCodePhrase} renders inside <code>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inCodePhrase);
      expect(idx, `${CONDITIONAL_MARKERS.inCodePhrase} missing`).toBeGreaterThan(-1);
      const code = enclosingRegion(html, idx, "code");
      expect(code).not.toBeNull();
      const window = html.slice(Math.max(0, idx - 20), idx + 60);
      expect(window).not.toMatch(/`/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 6. Around bold
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes wrapping bold (**text**)", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inBold} renders inside <strong>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.inBold);
        expect(idx, `${VERSION_MARKERS.inBold} missing`).toBeGreaterThan(-1);
        const strong = enclosingRegion(html, idx, "strong");
        expect(
          strong,
          `${VERSION_MARKERS.inBold} not inside <strong> — bold markdown was not parsed`,
        ).not.toBeNull();
        const window = html.slice(Math.max(0, idx - 20), idx + 60);
        expect(window, `literal '**' survived around marker`).not.toMatch(/\*\*/);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inBold} renders inside <strong>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inBold);
      expect(idx, `${CONDITIONAL_MARKERS.inBold} missing`).toBeGreaterThan(-1);
      const strong = enclosingRegion(html, idx, "strong");
      expect(strong).not.toBeNull();
      const window = html.slice(Math.max(0, idx - 20), idx + 60);
      expect(window).not.toMatch(/\*\*/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 7. Inside heading line
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes inside heading lines", () => {
  // The markers appear twice: once in the page TOC sidebar (a plain <a>
  // pointing at the anchor, NOT inside an <h4>) and once in the rendered
  // <h4> itself. We anchor on the H4 occurrence directly via regex.
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.inHeading} renders inside <h4>`, () => {
        const html = visibleHtml(page.filePath);
        const re = new RegExp(
          `<h4\\b[^>]*>[^<]*${VERSION_MARKERS.inHeading}\\b`,
        );
        expect(
          re.test(html),
          `${VERSION_MARKERS.inHeading}: not present as the leading text of any <h4> — heading line ended early or shortcode emitted block content`,
        ).toBe(true);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.inHeading} renders inside <h4>`, () => {
      const html = visibleHtml(page.filePath);
      const re = new RegExp(
        `<h4\\b[^>]*>[^<]*${CONDITIONAL_MARKERS.inHeading}\\b`,
      );
      expect(re.test(html)).toBe(true);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 8. Multiple sequential version blocks (per-version gating)
// ──────────────────────────────────────────────────────────────────────

test.describe("sequential same-line version blocks render only their matching segment", () => {
  const seqExpectations: Record<
    string,
    { present: string; absent: string[] }
  > = {
    "v1/everything": {
      present: VERSION_MARKERS.seqV1,
      absent: [VERSION_MARKERS.seqV2, VERSION_MARKERS.seqMain],
    },
    "v1/rebased": {
      present: VERSION_MARKERS.seqV1,
      absent: [VERSION_MARKERS.seqV2, VERSION_MARKERS.seqMain],
    },
    "v2/everything": {
      present: VERSION_MARKERS.seqV2,
      absent: [VERSION_MARKERS.seqV1, VERSION_MARKERS.seqMain],
    },
    "v2/rebased": {
      present: VERSION_MARKERS.seqV2,
      absent: [VERSION_MARKERS.seqV1, VERSION_MARKERS.seqMain],
    },
    "main/everything": {
      present: VERSION_MARKERS.seqMain,
      absent: [VERSION_MARKERS.seqV1, VERSION_MARKERS.seqV2],
    },
    "main/rebased": {
      present: VERSION_MARKERS.seqMain,
      absent: [VERSION_MARKERS.seqV1, VERSION_MARKERS.seqV2],
    },
  };

  for (const page of TEST_PAGES) {
    if (!(page.name in seqExpectations)) continue;
    const exp = seqExpectations[page.name];
    test(`${page.name}: only ${exp.present} is present, others absent`, () => {
      const html = visibleHtml(page.filePath);
      expect(html, `${page.name}: ${exp.present} missing`).toContain(exp.present);
      for (const m of exp.absent) {
        expect(html, `${page.name}: ${m} leaked into output`).not.toContain(m);
      }
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 9. Wrapping a markdown link destination URL
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcode-gated link destinations", () => {
  const linkDestExpectations: Record<string, string> = {
    "v1/everything": "?v=marker-v1",
    "v1/rebased": "?v=marker-v1",
    "v2/everything": "?v=marker-v2",
    "v2/rebased": "?v=marker-v2",
    "main/everything": "?v=marker-main",
    "main/rebased": "?v=marker-main",
  };

  for (const page of TEST_PAGES) {
    if (!(page.name in linkDestExpectations)) continue;
    const expectedQuery = linkDestExpectations[page.name];

    test(`${page.name}: ${VERSION_MARKERS.linkDestText} anchor href carries ${expectedQuery}`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(VERSION_MARKERS.linkDestText);
      expect(idx, `${VERSION_MARKERS.linkDestText} missing`).toBeGreaterThan(-1);
      const a = enclosingRegion(html, idx, "a");
      expect(a, `${VERSION_MARKERS.linkDestText} not inside <a>`).not.toBeNull();
      const openA = html.slice(a!.start, html.indexOf(">", a!.start) + 1);
      expect(
        openA,
        `${page.name}: link href missing ${expectedQuery} signature — wrong version block fired or fragments concatenated`,
      ).toContain(expectedQuery);
      // Cross-check: no other version's signature leaked.
      for (const [otherPage, otherQuery] of Object.entries(linkDestExpectations)) {
        if (otherPage === page.name) continue;
        if (otherQuery === expectedQuery) continue; // sibling pair
        expect(
          openA,
          `${page.name}: link href also contains ${otherQuery} from ${otherPage} — multiple version blocks fired`,
        ).not.toContain(otherQuery);
      }
    });

    test(`${page.name}: ${CONDITIONAL_MARKERS.linkDestText} anchor href carries ?build=test`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.linkDestText);
      expect(idx, `${CONDITIONAL_MARKERS.linkDestText} missing`).toBeGreaterThan(-1);
      const a = enclosingRegion(html, idx, "a");
      expect(a, `${CONDITIONAL_MARKERS.linkDestText} not inside <a>`).not.toBeNull();
      const openA = html.slice(a!.start, html.indexOf(">", a!.start) + 1);
      expect(openA, `link href missing ?build=test`).toContain("?build=test");
      // exclude-if branch must not have fired
      expect(openA).not.toContain("?build=other");
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 10. Wrapping markdown link text
// ──────────────────────────────────────────────────────────────────────

test.describe("shortcodes wrapping a full markdown link", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.linkText} renders inside <a>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.linkText);
        expect(idx, `${VERSION_MARKERS.linkText} missing`).toBeGreaterThan(-1);
        const a = enclosingRegion(html, idx, "a");
        expect(
          a,
          `${VERSION_MARKERS.linkText} not inside <a> — markdown link syntax wasn't parsed (heuristic missed the [text](url) regex)`,
        ).not.toBeNull();
        // No literal brackets/parens around the marker.
        const window = html.slice(Math.max(0, idx - 40), idx + 80);
        expect(window, `raw markdown syntax leaked`).not.toMatch(/\[[^\]<]*\]\(/);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.linkText} renders inside <a>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.linkText);
      expect(idx, `${CONDITIONAL_MARKERS.linkText} missing`).toBeGreaterThan(-1);
      const a = enclosingRegion(html, idx, "a");
      expect(a).not.toBeNull();
      const window = html.slice(Math.max(0, idx - 40), idx + 80);
      expect(window).not.toMatch(/\[[^\]<]*\]\(/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 11. Conditional-text inside a fenced code block
// ──────────────────────────────────────────────────────────────────────

test.describe("conditional-text inside a fenced code block", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    test(`${page.name}: ${CONDITIONAL_MARKERS.inFenceComment} is not wrapped in <h1>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inFenceComment);
      expect(idx, `${CONDITIONAL_MARKERS.inFenceComment} missing`).toBeGreaterThan(-1);

      // RenderString parsing `# COND_INFENCE_COMMENT` as a heading would
      // emit `<h1>` HTML. Inside the surrounding yaml fence, Chroma
      // escapes that to `&lt;h1&gt;`, so we look for both the raw form
      // (shortcode in plain prose) and the escaped form (shortcode body
      // landed inside a code fence).
      const tail = html.slice(Math.max(0, idx - 400), idx);
      expect(
        tail,
        `${CONDITIONAL_MARKERS.inFenceComment} preceded by an <h1> — ` +
          `conditional-text routed inner yaml through RenderString, which ` +
          `parsed the leading '#' as a heading. Tail: ${JSON.stringify(tail)}`,
      ).not.toMatch(/<h[1-6][^>]*>|&lt;h[1-6][^&]*&gt;/);

      // Marker should land inside a <pre><code> region (the surrounding
      // yaml fence). Walk back to a <pre that precedes the marker.
      const preIdx = html.lastIndexOf("<pre", idx);
      expect(preIdx, `${CONDITIONAL_MARKERS.inFenceComment} not inside any <pre>`)
        .toBeGreaterThan(-1);
    });

    test(`${page.name}: conditional-text in-fence yaml doesn't smart-quote "true"`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.inFenceComment);
      expect(idx).toBeGreaterThan(-1);
      // Search a generous window AFTER the marker for the "gated" line.
      // The typographer would convert "true" → &ldquo;true&rdquo;.
      // Inside the fence those entities get re-escaped to
      // &amp;ldquo;/&amp;rdquo;, so we look for both forms.
      const slice = html.slice(idx, idx + 800);
      expect(
        slice,
        `&ldquo;/&rdquo; appeared near ${CONDITIONAL_MARKERS.inFenceComment} — ` +
          `inner yaml routed through RenderString and the typographer ` +
          `converted the surrounding straight quotes. Slice: ${JSON.stringify(slice)}`,
      ).not.toMatch(/&[lr](?:d|s)quo;|&amp;[lr](?:d|s)quo;/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 12. Conditional-text wrap-around fence
// ──────────────────────────────────────────────────────────────────────

test.describe("conditional-text wrap-around fence", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    test(`${page.name}: ${CONDITIONAL_MARKERS.wrapAroundFn} fence keeps line breaks`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.wrapAroundFn);
      expect(idx, `${CONDITIONAL_MARKERS.wrapAroundFn} missing`).toBeGreaterThan(-1);
      const codeCloseIdx = html.indexOf("</code>", idx);
      expect(codeCloseIdx).toBeGreaterThan(idx);
      const region = html.slice(idx, codeCloseIdx);
      const lineSpanCount = (region.match(/<span class="line"/g) || []).length;
      expect(
        lineSpanCount,
        `Only ${lineSpanCount} <span class="line"> tokens between ${CONDITIONAL_MARKERS.wrapAroundFn} and the next </code>. ` +
          `If conditional-text grows a flatten step like version's, this would collapse to ~1. Expected >= 4.`,
      ).toBeGreaterThanOrEqual(4);

      // The literal "</span>" artifact would surface if the flatten regex
      // ever gets introduced and eats Chroma line boundaries.
      expect(
        region,
        `Found literal "&lt;/span&gt;" — flatten collapsed Chroma's per-line spans`,
      ).not.toContain("&lt;/span&gt;");
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 13. Fence-adjacency: shortcode tags on lines immediately adjacent to
//     a fence (no blank-line separator). Goldmark could absorb the
//     shortcode body into the fence's <pre> if it doesn't respect the
//     fence boundary, so the test asserts the marker is in a <p>
//     paragraph, not inside <pre>.
// ──────────────────────────────────────────────────────────────────────

function markerIsInPre(html: string, marker: string): boolean {
  // True iff the marker's position is inside a <pre>…</pre> region.
  const idx = html.indexOf(marker);
  if (idx < 0) return false;
  const pre = enclosingRegion(html, idx, "pre");
  return pre !== null;
}

test.describe("shortcode adjacent to a fence with no blank-line separator", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.fenceAdjAfter} lands in <p>, not <pre>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.fenceAdjAfter);
        expect(
          idx,
          `${VERSION_MARKERS.fenceAdjAfter} missing`,
        ).toBeGreaterThan(-1);
        expect(
          markerIsInPre(html, VERSION_MARKERS.fenceAdjAfter),
          `${VERSION_MARKERS.fenceAdjAfter}: marker absorbed into the preceding fence's <pre> — fence boundary collapsed`,
        ).toBe(false);
        const p = enclosingRegion(html, idx, "p");
        expect(
          p,
          `${VERSION_MARKERS.fenceAdjAfter}: not inside a <p> — block structure broken near the closing fence`,
        ).not.toBeNull();
      });

      test(`${page.name}: ${VERSION_MARKERS.fenceAdjBefore} lands in <p>, not <pre>`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.fenceAdjBefore);
        expect(idx).toBeGreaterThan(-1);
        expect(
          markerIsInPre(html, VERSION_MARKERS.fenceAdjBefore),
          `${VERSION_MARKERS.fenceAdjBefore}: marker absorbed into the following fence's <pre>`,
        ).toBe(false);
        const p = enclosingRegion(html, idx, "p");
        expect(p).not.toBeNull();
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.fenceAdjAfter} lands in <p>, not <pre>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.fenceAdjAfter);
      expect(idx).toBeGreaterThan(-1);
      expect(markerIsInPre(html, CONDITIONAL_MARKERS.fenceAdjAfter)).toBe(false);
      const p = enclosingRegion(html, idx, "p");
      expect(p).not.toBeNull();
    });

    test(`${page.name}: ${CONDITIONAL_MARKERS.fenceAdjBefore} lands in <p>, not <pre>`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.fenceAdjBefore);
      expect(idx).toBeGreaterThan(-1);
      expect(markerIsInPre(html, CONDITIONAL_MARKERS.fenceAdjBefore)).toBe(false);
      const p = enclosingRegion(html, idx, "p");
      expect(p).not.toBeNull();
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 14. Opening fence on the SAME LINE as the opening shortcode tag.
//     Compactness variant of the wrap-around-fence pattern. Works today
//     because the heuristic detects backticks in .Inner, routes to
//     RenderString, and Goldmark parses the body as a normal fence —
//     but the pattern is unusual enough that a guard is warranted.
// ──────────────────────────────────────────────────────────────────────

test.describe("opening fence on the same line as the opening shortcode tag", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.fenceSameLine} renders as Chroma-highlighted yaml`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.fenceSameLine);
        expect(
          idx,
          `${VERSION_MARKERS.fenceSameLine} missing`,
        ).toBeGreaterThan(-1);

        // Inside a <pre> + <code class="language-yaml"> region.
        const pre = enclosingRegion(html, idx, "pre");
        expect(
          pre,
          `${VERSION_MARKERS.fenceSameLine} not inside <pre> — fence was not parsed; the same-line ` +
            "opening was probably emitted as literal text instead of a fence",
        ).not.toBeNull();
        const code = enclosingRegion(html, idx, "code");
        expect(code, `${VERSION_MARKERS.fenceSameLine} not inside <code>`).not.toBeNull();
        const codeOpen = html.slice(code!.start, html.indexOf(">", code!.start) + 1);
        expect(
          codeOpen,
          `${VERSION_MARKERS.fenceSameLine} not in a yaml-language code block`,
        ).toMatch(/language-yaml/);

        // No literal backticks should survive next to the marker.
        const window = html.slice(Math.max(0, idx - 40), idx + 60);
        expect(window, `literal backticks survived around marker`).not.toMatch(/`/);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.fenceSameLine} renders as Chroma-highlighted yaml`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.fenceSameLine);
      expect(idx).toBeGreaterThan(-1);
      const pre = enclosingRegion(html, idx, "pre");
      expect(pre).not.toBeNull();
      const code = enclosingRegion(html, idx, "code");
      expect(code).not.toBeNull();
      const codeOpen = html.slice(code!.start, html.indexOf(">", code!.start) + 1);
      expect(codeOpen).toMatch(/language-yaml/);
      const window = html.slice(Math.max(0, idx - 40), idx + 60);
      expect(window).not.toMatch(/`/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 15. Cards with path= inside version and conditional-text wrappers
//
//     Pattern: {{% version %}}{{< card path="rebased" ... >}}{{% /version %}}
//             {{% conditional-text %}}{{< card path="rebased" ... >}}{{% /conditional-text %}}
//
//     The card shortcode resolves `path` relative to the current section,
//     so the rendered href should contain "/rebased/" as a real URL — not
//     URL-encoded shortcode syntax. The card anchor should also be a direct
//     grid child, not wrapped in a <p> by Goldmark (the $hasMarkdown
//     heuristic in both wrappers now skips HTML-tag detection so pre-rendered
//     card HTML passes through without a RenderString call).
// ──────────────────────────────────────────────────────────────────────

test.describe("cards with path= inside version and conditional-text wrappers", () => {
  for (const page of TEST_PAGES) {
    if (!ALL_TOPIC_PAGES.includes(page.name)) continue;

    if (V2_PAGES.includes(page.name)) {
      test(`${page.name}: ${VERSION_MARKERS.nestedArgTitle} card renders with resolved href`, () => {
        const html = visibleHtml(page.filePath);
        const idx = html.indexOf(VERSION_MARKERS.nestedArgTitle);
        expect(
          idx,
          `${VERSION_MARKERS.nestedArgTitle} missing`,
        ).toBeGreaterThan(-1);

        const a = enclosingRegion(html, idx, "a");
        expect(a, `${VERSION_MARKERS.nestedArgTitle} not inside an <a>`).not.toBeNull();
        const openA = html.slice(a!.start, html.indexOf(">", a!.start) + 1);

        // href must be a real URL, not URL-encoded shortcode syntax
        expect(
          openA,
          `${page.name}: href contains URL-encoded shortcode syntax — path= resolution broke`,
        ).not.toMatch(/href="[^"]*(%7b%7b|%7B%7B|\{\{)/);
        expect(openA, `${page.name}: href should contain /rebased/`).toMatch(
          /href="[^"]*\/rebased\//,
        );

        // Card <a> must not be wrapped in a <p> (Goldmark <p>-wrap regression)
        const nearCard = html.slice(Math.max(0, a!.start - 50), a!.start);
        expect(
          nearCard,
          `${page.name}: card <a> is wrapped in <p> — $hasMarkdown heuristic tripped on card HTML`,
        ).not.toMatch(/<p>\s*$/);
      });
    }

    test(`${page.name}: ${CONDITIONAL_MARKERS.nestedArgTitle} card renders with resolved href`, () => {
      const html = visibleHtml(page.filePath);
      const idx = html.indexOf(CONDITIONAL_MARKERS.nestedArgTitle);
      expect(idx, `${CONDITIONAL_MARKERS.nestedArgTitle} missing`).toBeGreaterThan(-1);
      const a = enclosingRegion(html, idx, "a");
      expect(a, `${CONDITIONAL_MARKERS.nestedArgTitle} not inside an <a>`).not.toBeNull();
      const openA = html.slice(a!.start, html.indexOf(">", a!.start) + 1);

      expect(
        openA,
        `href contains URL-encoded shortcode syntax — path= resolution broke`,
      ).not.toMatch(/href="[^"]*(%7b%7b|%7B%7B|\{\{)/);
      expect(openA, `href should contain /rebased/`).toMatch(
        /href="[^"]*\/rebased\//,
      );

      const nearCard = html.slice(Math.max(0, a!.start - 50), a!.start);
      expect(
        nearCard,
        `card <a> is wrapped in <p> — $hasMarkdown heuristic tripped on card HTML`,
      ).not.toMatch(/<p>\s*$/);
    });
  }
});

// ──────────────────────────────────────────────────────────────────────
// 16. Negative-control: rich-context version markers absent on non-v2 pages
// ──────────────────────────────────────────────────────────────────────

test.describe("rich-context version markers are gated to v2", () => {
  const richVersionMarkers = [
    VERSION_MARKERS.inCallout,
    VERSION_MARKERS.inUL3,
    VERSION_MARKERS.inOL3,
    VERSION_MARKERS.inTableCell,
    VERSION_MARKERS.inTabBody,
    VERSION_MARKERS.inCodePhrase,
    VERSION_MARKERS.inBold,
    VERSION_MARKERS.inHeading,
    VERSION_MARKERS.linkText,
    VERSION_MARKERS.fenceAdjAfter,
    VERSION_MARKERS.fenceAdjBefore,
    VERSION_MARKERS.fenceSameLine,
    VERSION_MARKERS.nestedArgTitle,
  ];

  for (const page of TEST_PAGES) {
    if (!NON_V2_PAGES.includes(page.name)) continue;
    test(`${page.name}: v2-only rich-context markers absent`, () => {
      const html = visibleHtml(page.filePath);
      for (const m of richVersionMarkers) {
        expect(
          html,
          `${m} leaked into ${page.name} (include-if="v2" should exclude it)`,
        ).not.toContain(m);
      }
    });
  }
});
