import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// The two prose-column extension slots in `layouts/docs/single.html` render
// where their names say they do, and an unused slot still costs nothing.
//
// WHAT WENT WRONG. `docs/after-title.html` shipped rendering AFTER the page
// description. agentgateway.dev is the one consumer that overrides it, for its
// doc-test "Verified" badge, and the fork the slot replaced had put that badge
// between the `<h1>` and the description. So adopting the slot silently moved
// the badge down a line. Nothing failed: the slot's own file said "after the
// page title and description", the build was green, and the only way to notice
// was to look at a rendered page and remember what it used to look like. 0.4.0
// moves the behavior to meet the name and adds `after-description.html` at the
// old position.
//
// WHY THIS IS MOSTLY A SOURCE LINT. Both slots are EMPTY by default — that is
// the whole point of the byte-identity guarantee in single.html's header
// comment — so a fixture page renders exactly the same whether the calls are
// ordered correctly or not. Covering the position end-to-end would need the
// fixture to override a slot, and it structurally cannot: hugo-oss.toml mounts
// `layouts` before `fixture/layouts`, so the module's own default wins the
// filename conflict. Verified by trying it — a probe partial at
// `fixture/layouts/partials/docs/after-title.html` rendered zero times in a
// clean build. Making it win means letting the fixture shadow ANY module
// partial, which is a much larger hole than this test is worth.
//
// Per tests/HAZARDS.md, a test that cannot fail is worse than no test, so the
// position is pinned where it is actually decided: in the template source. The
// built-output half below covers the other half of the contract — that an
// empty slot still emits nothing — which IS observable on the fixture.
//
// SCOPE, stated plainly. This proves the slot CALLS are ordered correctly and
// that the defaults stay empty. It does not prove any particular consumer's
// override looks right; that is the consumer's own test.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const SINGLE = path.resolve(__dirname, "..", "layouts", "docs", "single.html");
const SLOT_DIR = path.resolve(__dirname, "..", "layouts", "partials", "docs");

/** Go template comments are documentation, not code. The header comment in
 *  single.html names both slots in prose, and matching those would make the
 *  ordering assertion below pass for the wrong reason. */
function stripComments(s: string): string {
  return s.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("docs/single.html prose-column slot order", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "reads this module's own layouts/ tree; meaningless against a consumer build",
  );

  test("slots are called in the order their names describe", () => {
    const src = stripComments(fs.readFileSync(SINGLE, "utf8"));

    // Five landmarks, in the order a reader of the page meets them.
    const LANDMARKS: [string, RegExp][] = [
      ["the <h1> itself", /<h1 class="hx:mb-0">/],
      ["docs/after-title.html", /\{\{ partial "docs\/after-title\.html" \. \}\}/],
      ["the page description", /<p class="page-description">/],
      [
        "docs/after-description.html",
        /\{\{ partial "docs\/after-description\.html" \. \}\}/,
      ],
      ["the page body", /\{\{ \.Content \}\}/],
    ];

    const at = LANDMARKS.map(([name, re]) => {
      const m = src.match(re);
      // A landmark that stopped matching would make every ordering comparison
      // below trivially true — the zero-match failure shape HAZARDS.md
      // catalogues. Fail loudly instead of scoring it as a pass.
      expect(
        m,
        `landmark "${name}" no longer matches layouts/docs/single.html. ` +
          `Either the markup changed and this pattern needs updating, or the ` +
          `slot was deleted. Do not delete the landmark to make this pass.`,
      ).not.toBeNull();
      return { name, index: m!.index! };
    });

    const order = at.map((x) => x.name);
    const sorted = [...at].sort((a, b) => a.index - b.index).map((x) => x.name);

    expect(
      sorted,
      "the prose-column slots are out of order. `after-title` must render " +
        "between the title block and the description, `after-description` " +
        "between the description and the body — that is what 0.4.0 was for. " +
        "Putting `after-title` back below the description reintroduces the " +
        "exact bug: agentgateway.dev's doc-test badge silently drops a line, " +
        "with no test failing and no build warning.",
    ).toEqual(order);
  });

  test("slot calls stay glued to their neighbouring tags", () => {
    const src = fs.readFileSync(SINGLE, "utf8");

    // single.html's header comment promises an empty slot produces
    // BYTE-IDENTICAL output to the pre-slot layout. That promise is carried
    // entirely by the whitespace: a slot call moved onto its own line injects
    // a newline plus indentation into every rendered page. Pin the exact glue.
    const GLUED = [
      `{{ end }}{{ partial "docs/after-title.html" . }}`,
      `{{- end }}{{ partial "docs/after-description.html" . }}`,
    ];

    const missing = GLUED.filter((g) => !src.includes(g));

    expect(
      missing,
      "a slot call is no longer glued to the tag before it. Moving one onto " +
        "its own line injects whitespace into every page and breaks the " +
        "byte-identity guarantee single.html's header comment makes. " +
        "Verified for 0.4.0 by building both brands before and after: all 107 " +
        "fixture pages identical, only the llms.txt build timestamp differed.",
    ).toEqual([]);
  });

  test("both slots are empty by default", () => {
    for (const name of ["after-title.html", "after-description.html"]) {
      const file = path.join(SLOT_DIR, name);
      expect(fs.existsSync(file), `${name} is missing from layouts/partials/docs/`).toBe(
        true,
      );

      const body = stripComments(fs.readFileSync(file, "utf8")).trim();
      expect(
        body,
        `${name} emits something by default. These slots must render NOTHING ` +
          `unless a consumer overrides them — a default body lands on every ` +
          `page of every consumer at once, which is how a slot stops being an ` +
          `opt-in. Put the markup in the consumer, not here.`,
      ).toBe("");
    }
  });
});

test.describe("empty slots emit nothing", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "asserts against the bundled fixture's built output",
  );

  test("nothing separates the title block from the description", () => {
    const root = path.resolve(target.builtRoot);
    const pages: string[] = [];
    const walk = (d: string) => {
      for (const e of fs.readdirSync(d, { withFileTypes: true })) {
        const full = path.join(d, e.name);
        if (e.isDirectory()) walk(full);
        else if (e.name === "index.html") pages.push(full);
      }
    };
    expect(
      fs.existsSync(root),
      `built output not found at ${root} — run \`make build-oss\` first`,
    ).toBe(true);
    walk(root);

    // Detail pages only. `docs/list.html` renders section indexes with its own
    // header — no inner <div> wrapper and, deliberately, no slots — so keying
    // on the wrapper is what separates the two layouts in built HTML.
    const TITLE_OPEN = /<div class="hx:flex hx:flex-col[^"]*hx:gap-4 hx:mb-4">\s*<div>\s*<h1/;
    const DESCRIPTION = /<p class="page-description">/;

    /* Where the title row CLOSES. It cannot be matched with a regex: the row
       contains copy-markdown's <dialog>, which nests several divs of its own,
       so `[\s\S]*?</div>\s*</div>` stops at the dialog's inner pair and reports
       the dialog's own markup as content in the gap. Count depth instead. */
    function closeOf(html: string, openAt: number): number | null {
      let depth = 0;
      const re = /<div\b|<\/div>/g;
      re.lastIndex = openAt;
      for (let m = re.exec(html); m; m = re.exec(html)) {
        depth += m[0] === "</div>" ? -1 : 1;
        if (depth === 0) return m.index + m[0].length;
      }
      return null;
    }

    const offenders: string[] = [];
    let checked = 0;
    for (const p of pages) {
      /* Scripts and styles are stripped before ANY index is taken. The
         copy-markdown partial inlines the page's own markdown in a
         <script type="text/plain">, and a fixture page whose body contains
         `<div` would otherwise unbalance the counter above. Every index below
         is into the stripped string, so they stay mutually consistent. */
      const html = fs
        .readFileSync(p, "utf8")
        .replace(/<script[\s\S]*?<\/script>/gi, "")
        .replace(/<style[\s\S]*?<\/style>/gi, "");
      const title = html.match(TITLE_OPEN);
      const desc = html.match(DESCRIPTION);
      if (!title || !desc) continue;
      const gapStart = closeOf(html, title.index!);
      if (gapStart === null || desc.index! < gapStart) continue;
      checked++;
      const gap = html.slice(gapStart, desc.index!);
      if (gap.trim() !== "") {
        offenders.push(`${path.relative(root, p)}: ${JSON.stringify(gap.slice(0, 120))}`);
      }
    }

    // Same zero-match guard as above: if the shape stops matching, this test
    // would pass while measuring nothing.
    expect(
      checked,
      "no fixture detail page matched both a title block and a description — " +
        "the markup shape changed and TITLE_BLOCK/DESCRIPTION need updating.",
    ).toBeGreaterThan(20);

    expect(
      offenders,
      "content appeared between the title block and the page description on " +
        "the fixture, where BOTH slots are unoverridden and must therefore be " +
        "silent. Either a slot grew a default body, or something else moved " +
        "into that gap.",
    ).toEqual([]);
  });
});
