import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for a fenced code block inside a callout / alert body.
//
// callout.html flattens its body to ONE logical line (newlines → &#10;) so a
// callout nested in a list item can't trip Goldmark's content-continuation
// column rule and split the list. It used to do that with a bare
// `replace "\n" "&#10;"`, which has none of utils/flatten-rendered.html's
// protections. A fenced body hit two of them:
//
//   1. Hextra emits the copy button with one attribute per LINE, so the smash
//      produced `<button&#10;   class="…"`. Entities are NOT decoded inside a
//      start tag, so the parser read `&#10;` as a garbage attribute name.
//      Live symptom: /gateway/1.21.x/portal/guides/use-frontend/view-apis/.
//   2. Chroma emits `<span class="line">…</span>\n<span…>`, so the smash
//      relocated newlines INSIDE the highlight spans.
//
// The fix routes the body through utils/flatten-rendered.html — but with
// `bypassPre: false`. That partial normally emits <pre>-bearing HTML untouched
// (real newlines), because in version.html's re-parse context entity-ifying
// Chroma's newlines made the parent apply CommonMark backslash-escaping to
// `\<` inside the spans. callout is NOT that context: keeping real newlines
// here splits the enclosing list (verified — it produced `<ol>` + `<ol
// start="2">`), while the smash keeps the list intact AND leaves the code
// correct. So callout needs the copy-button collapse and the script/style
// protection, but not the bypass.
//
// This shape had NO fixture before: callout-in-table-cell.spec.ts uses an
// inline code SPAN, and callout-in-reuse-tab.spec.ts renders through
// _partials/components/github-style-alert.html, not callout.html.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "callout-fence", "index.html");

// Strip the copy-as-markdown <script>, which embeds the raw source (literal
// fences and all) and would match nearly every assertion below.
function visibleHtml(): string {
  return readFixture(PAGE).replace(
    /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

// A callout body contains NESTED divs (Hextra's code-block wrapper, the copy
// button container), so a non-greedy `…</div></div>` match truncates it before
// the copy button. Walk <div>/</div> with a depth counter instead.
function alertBodies(html: string): string[] {
  const OPEN = '<div class="solo-alert-body">';
  const out: string[] = [];
  let from = 0;
  for (;;) {
    const start = html.indexOf(OPEN, from);
    if (start === -1) break;
    let i = start + OPEN.length;
    let depth = 1;
    const tag = /<(\/?)div\b/g;
    tag.lastIndex = i;
    let m: RegExpExecArray | null;
    while (depth > 0 && (m = tag.exec(html)) !== null) {
      depth += m[1] === "/" ? -1 : 1;
      i = tag.lastIndex;
    }
    // i is just past "</div" of the matching close; body ends at its "<".
    out.push(html.slice(start + OPEN.length, html.lastIndexOf("</div", i)));
    from = i;
  }
  return out;
}

test.describe("fenced code blocks inside a callout body", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "callout-fence is a fixture-only page; skipped against consumer builds",
  );

  test("every callout body rendered its fence as a real <pre>", () => {
    const bodies = alertBodies(visibleHtml());
    // angle callout, percent callout, alert shortcode, callout in a list step
    expect(bodies.length, "expected 4 solo-alert-body blocks").toBe(4);
    for (const [i, body] of bodies.entries()) {
      expect(body, `alert body ${i} has no <pre>`).toContain("<pre");
    }
  });

  // THE REGRESSION. A &#10; between attributes is read as an attribute NAME,
  // so the copy button arrives with garbage attributes.
  test("no &#10; entity appears inside an HTML start tag", () => {
    const html = visibleHtml();
    const offenders = html.match(/<[a-zA-Z][^>]*&#10;[^>]*>/g) ?? [];
    expect(
      offenders.map((o) => o.slice(0, 120)),
      "an &#10; inside a start tag is parsed as an attribute name — the " +
        "copy-button collapse in utils/flatten-rendered.html is not running",
    ).toEqual([]);
  });

  test("the copy button survives as a well-formed element", () => {
    for (const body of alertBodies(visibleHtml())) {
      const btn = body.match(/<button[^>]*hextra-code-copy-btn[^>]*>/);
      expect(btn, "no copy button in the callout body").not.toBeNull();
      expect(btn![0], "copy button start tag carries an entity").not.toContain(
        "&#10;",
      );
    }
  });

  // The other half of the trade-off: flattening must NOT cost the enclosing
  // list. With the <pre> bypass left on, this produced <ol> + <ol start="2">.
  test("a callout with a fence inside a numbered step keeps the list intact", () => {
    const html = visibleHtml();
    const one = html.indexOf("MARKER_CALLOUTFENCE_STEP_ONE");
    const two = html.indexOf("MARKER_CALLOUTFENCE_STEP_TWO");
    expect(one, "step-one marker missing").toBeGreaterThan(-1);
    expect(two, "step-two marker missing").toBeGreaterThan(one);
    expect(
      html.slice(one, two).match(/<\/ol>/g) ?? [],
      "the ordered list was closed between step 1 and step 2 — the callout " +
        "body re-entered the markdown stream on multiple lines and terminated " +
        "the <li>",
    ).toEqual([]);
  });

  test("Chroma highlighting and backslash continuations stay intact", () => {
    const bodies = alertBodies(visibleHtml());
    const withContinuation = bodies.find((b) =>
      b.includes("MARKER_CALLOUTFENCE_ANGLE_CODE"),
    );
    expect(withContinuation, "angle-callout code body not found").toBeDefined();
    // The `\` line-continuation must remain a Chroma escape span, not become
    // literal `</span>` text or an escaped `&lt;`.
    expect(
      withContinuation!,
      "backslash continuation leaked as literal </span> text",
    ).not.toContain("&lt;/span&gt;");
    expect(withContinuation!).toContain("\\");
  });
});
