import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PAGES, TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";
import { flattenGroups, tabGroups, type TabGroup } from "./helpers/tab-nesting";

// TABS INSIDE TABS — the structural half. The runtime half (does clicking an
// inner tab move the outer group?) is tests/tabs-nested-switch.spec.ts, which
// needs a browser and therefore a different playwright project.
//
// WHY THIS EXISTS. Nesting a tabs group inside a tab panel is not a Hextra
// feature anybody documented; it is a shape real product docs reach for ("pick
// your platform, then pick your install method") and it happens to work. Two
// implementation details are what make it work, and neither is stated anywhere:
//
//   1. `tab.html` pushes each tab's body onto `.Parent.Store`, and `.Parent` is
//      the IMMEDIATELY enclosing shortcode. An inner group therefore fills its
//      own store rather than appending to the outer group's — which is the only
//      reason an inner tab's body does not surface as a third outer tab.
//   2. `shortcodes/tabs.html` renders the button bar and the panels wrapper as
//      SIBLINGS, so an inner group nests as ordinary panel content with no
//      special handling.
//
// Both are incidental. A Hextra bump that moves tab bodies to a page-level
// store, or wraps the bar and panels in a shared container, breaks nesting
// without breaking anything a counting test measures — group and panel COUNTS
// are identical whether an inner group sits inside its outer panel or has been
// hoisted out next to it. So this spec asserts the TREE: which group is inside
// which panel, and which marker is inside which group.
//
// IT ALSO COVERS THE ONE THING NESTING GENUINELY BROKE, which this fixture
// found: Hugo numbers a shortcode's `.Ordinal` relative to its PARENT, so
// every nested group was ordinal 0, and Hextra's `tabs` derives its DOM ids
// from that ordinal. `tabs-tab-tabs-00-0` appeared five times on this page.
// `layouts/_shortcodes/tabs.html` now shadows the Hextra shortcode and mints
// ids from a page-scoped counter; the id-uniqueness and option-label tests
// below are the regression guard for that shadow.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "tabs-nested", "index.html");

// The fixture's shape, asserted rather than assumed. Every test below reads the
// tree; if the page stopped rendering tabs altogether, each would otherwise
// "pass" against an empty tree. HAZARDS.md rule: a scanner that finds zero
// targets must not look like a scanner that found zero problems.
const EXPECTED_TOP_LEVEL = 3;
const EXPECTED_TOTAL_GROUPS = 7; // 3 outer + 4 inner
const EXPECTED_TOTAL_PANELS = 14;

function page(): string {
  return readFixture(PAGE);
}

/** The copy-as-markdown payload, unescaped enough to match marker text. */
function markdownPayload(html: string): string {
  const m = html.match(
    /<script[^>]*class=["']copy-md-source["'][^>]*>([\s\S]*?)<\/script>/i,
  );
  if (!m) return "";
  return m[1]
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#10;/g, "\n")
    .replace(/\\_/g, "_");
}

/** The page's HTML with the copy-as-markdown payload removed. */
function bodyMarkup(html: string): string {
  return html.replace(
    /<script[^>]*class=["']copy-md-source["'][^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
}

/** Group whose buttons are exactly `names`, at any depth. Fails if absent. */
function groupNamed(groups: TabGroup[], names: string[]): TabGroup {
  const found = flattenGroups(groups).filter(
    (g) => g.names.join("|") === names.join("|"),
  );
  expect(
    found.length,
    `expected exactly one tab group with buttons [${names.join(", ")}]`,
  ).toBe(1);
  return found[0];
}

test.describe("tabs nested inside tabs", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only page (v2/tabs-nested, build.list=never)",
  );

  test("the page renders the nested-tab fixture at all", () => {
    const groups = tabGroups(bodyMarkup(page()));
    expect(groups.length, "top-level tab groups").toBe(EXPECTED_TOP_LEVEL);

    const all = flattenGroups(groups);
    expect(all.length, "tab groups at every depth").toBe(EXPECTED_TOTAL_GROUPS);
    expect(
      all.reduce((n, g) => n + g.panels.length, 0),
      "tab panels at every depth",
    ).toBe(EXPECTED_TOTAL_PANELS);

    // Four of the seven are nested — the whole subject of this spec. A Hextra
    // change that hoisted inner groups out to the top level would keep the
    // totals above and fail here.
    expect(
      all.filter((g) => g.depth > 0).length,
      "groups nested inside a panel",
    ).toBe(4);
  });

  test("shape 1: the inner group sits inside the first outer panel", () => {
    const groups = tabGroups(bodyMarkup(page()));
    const outer = groupNamed(groups, ["Kubernetes", "Standalone"]);

    expect(outer.depth, "outer group is top-level").toBe(0);
    expect(outer.panels.length).toBe(2);

    // The inner group is a child of panel 0, and of nothing else.
    expect(
      outer.panels[0].groups.map((g) => g.names.join("|")),
      "groups inside the 'Kubernetes' panel",
    ).toEqual(["Helm|kubectl"]);
    expect(
      outer.panels[1].groups.length,
      "the 'Standalone' panel has no nested group",
    ).toBe(0);

    // The outer panel keeps its own prose on BOTH sides of the inner group.
    // The tail marker is the interesting one: it is authored after the inner
    // `{{< /tabs >}}` but still inside the outer `{{% tab %}}`, which is
    // exactly the content a mis-scoped `.Inner` boundary swallows or ejects.
    expect(outer.panels[0].markers, "the outer panel's own prose").toEqual([
      "MARKER_NESTTABS_S1_OUTER_A",
      "MARKER_NESTTABS_S1_OUTER_A_TAIL",
    ]);
    expect(outer.panels[1].markers).toEqual(["MARKER_NESTTABS_S1_OUTER_B"]);

    // And the inner panels hold only their own.
    const inner = outer.panels[0].groups[0];
    expect(inner.depth).toBe(1);
    expect(inner.panels.map((p) => p.markers)).toEqual([
      ["MARKER_NESTTABS_S1_INNER_A1"],
      ["MARKER_NESTTABS_S1_INNER_A2"],
    ]);
  });

  test("shape 2: each outer panel carries its own independent inner group", () => {
    const groups = tabGroups(bodyMarkup(page()));
    const outer = groupNamed(groups, ["Linux", "macOS"]);

    expect(
      outer.panels.map((p) => p.groups.map((g) => g.names.join("|"))),
      "one inner group per outer panel, each with its own buttons",
    ).toEqual([["amd64|arm64"], ["Apple silicon|Intel"]]);

    // The second outer panel's inner group is the one a hoisting bug moves:
    // it is authored inside a panel that is hidden at load, so nothing about
    // its position is visible until a reader clicks through to it.
    expect(
      outer.panels[1].groups[0].panels.map((p) => p.markers),
      "markers under the second outer panel's inner group",
    ).toEqual([
      ["MARKER_NESTTABS_S2_INNER_B1"],
      ["MARKER_NESTTABS_S2_INNER_B2"],
    ]);
  });

  test("every group selects exactly one panel, at every depth", () => {
    const all = flattenGroups(tabGroups(bodyMarkup(page())));
    expect(all.length).toBe(EXPECTED_TOTAL_GROUPS);

    for (const g of all) {
      const visible = g.panels.filter((p) => p.visible);
      expect(
        visible.length,
        `group [${g.names.join(", ")}] (depth ${g.depth}) has ${visible.length} ` +
          `panels with aria-hidden="false"`,
      ).toBe(1);
      expect(
        g.panels[0].visible,
        `group [${g.names.join(", ")}] selects a panel other than the first`,
      ).toBe(true);
    }
  });

  test("every panel is labelled by the button in its own position", () => {
    const all = flattenGroups(tabGroups(bodyMarkup(page())));
    for (const g of all) {
      expect(
        g.panels.map((p) => p.labelledBy),
        `group [${g.names.join(", ")}] (depth ${g.depth}): panel ` +
          `aria-labelledby does not match its own group's button ids in order`,
      ).toEqual(g.buttonIds);
    }
  });

  // Regression guard for layouts/_shortcodes/tabs.html. Duplicate ids are
  // invisible to a reader using a mouse — Hextra's tabs.js switches panels
  // through DOM relations and never looks an id up — so nothing else in this
  // suite, and nothing on a page, would report this coming back.
  test("every tab and panel id on the page is unique", () => {
    const body = bodyMarkup(page());
    const ids = [...body.matchAll(/id="(tabs-(?:tab|panel)-[^"]*)"/g)].map(
      (m) => m[1],
    );
    expect(ids.length, "no tab ids found at all").toBeGreaterThan(0);

    const dupes = ids.filter((id, i) => ids.indexOf(id) !== i);
    expect([...new Set(dupes)], "duplicated tab/panel ids").toEqual([]);
  });

  test("a code fence with a blank line survives at depth 2", () => {
    const body = bodyMarkup(page());

    // Same invariant tab-code-fences.spec.ts asserts one level up: the marker
    // after the blank line must still be inside an open <code>, and no <p> may
    // appear between the enclosing <pre> and it. Depth matters because the
    // inner group's panel content goes through `markdownify` a SECOND time —
    // once for the outer panel, once for the inner — so a body that survived
    // one pass can still be broken by two.
    for (const marker of [
      "MARKER_NESTTABS_S3_BEFORE",
      "MARKER_NESTTABS_S3_AFTER",
    ]) {
      const idx = body.indexOf(marker);
      expect(idx, `${marker} missing`).toBeGreaterThan(-1);

      const before = body.slice(0, idx);
      const opens = (before.match(/<code[\s>]/g) || []).length;
      const closes = (before.match(/<\/code>/g) || []).length;
      expect(
        opens,
        `${marker}: not inside any open <code> — the fence inside the nested ` +
          `tab was terminated`,
      ).toBeGreaterThan(closes);

      const preIdx = before.lastIndexOf("<pre");
      expect(preIdx, `${marker}: no preceding <pre>`).toBeGreaterThan(-1);
      expect(
        before.slice(preIdx),
        `${marker}: <p> inside the enclosing <pre> — the nested panel's body ` +
          `was markdownified after it had already been rendered to HTML`,
      ).not.toMatch(/<p[\s>]/);
    }
  });

  test("the flattened output keeps the nesting order and loses no content", () => {
    const html = page();
    const md = markdownPayload(html);
    expect(md, "no copy-as-markdown payload on the page").not.toBe("");

    // One lead-in per GROUP and one label per PANEL — the same counting
    // invariant tab-flatten.spec.ts asserts, restated here because that spec
    // only walks CONFIG's [[pages]] and this page is deliberately not in it.
    expect(
      (md.match(/You can choose from the following options\./g) || []).length,
      "lead-in sentences (expected one per tab group, nested included)",
    ).toBe(EXPECTED_TOTAL_GROUPS);
    expect(
      (md.match(/\*\*Option: /g) || []).length,
      "option labels (expected one per panel, nested included)",
    ).toBe(EXPECTED_TOTAL_PANELS);

    // Dead controls must not survive into a JS-less reading context.
    for (const chrome of [
      "hextra-tabs-toggle",
      "hextra-tab-btn",
      "hextra-tabs-panel",
      "hextra-tab-panel",
      'role="tab',
    ]) {
      expect(md, `flattened output still carries ${chrome}`).not.toContain(
        chrome,
      );
    }

    // Order is the point: an inner group's options must appear INSIDE the
    // outer option they belong to — after that option's own prose and before
    // the next outer option — or a reader of the PDF cannot tell which
    // alternatives belong to which platform.
    const order = [
      "MARKER_NESTTABS_S1_OUTER_A",
      "MARKER_NESTTABS_S1_INNER_A1",
      "MARKER_NESTTABS_S1_INNER_A2",
      "MARKER_NESTTABS_S1_OUTER_A_TAIL",
      "MARKER_NESTTABS_S1_OUTER_B",
      "MARKER_NESTTABS_S2_OUTER_A",
      "MARKER_NESTTABS_S2_INNER_A1",
      "MARKER_NESTTABS_S2_INNER_A2",
      "MARKER_NESTTABS_S2_OUTER_B",
      "MARKER_NESTTABS_S2_INNER_B1",
      "MARKER_NESTTABS_S2_INNER_B2",
    ];
    const positions = order.map((m) => {
      const at = md.indexOf(m);
      expect(at, `${m} missing from the flattened output`).toBeGreaterThan(-1);
      return at;
    });
    expect(
      positions,
      "flattened markers are out of source order — nesting was rearranged",
    ).toEqual([...positions].sort((a, b) => a - b));
  });

  // The reader-visible half of the id collision, and the reason the shadow in
  // layouts/_shortcodes/tabs.html is worth its maintenance cost.
  //
  // utils/unhide-tabs.html recovers a stock-Hextra panel's name THROUGH its
  // `aria-labelledby` id (the visible name lives two spans deep inside the
  // button, which the flattening strips). With colliding ids that lookup was
  // last-write-wins, and the per-panel substitution is a plain string replace,
  // so every panel sharing an open tag got the same label: this page's
  // 'Kubernetes' / 'Standalone' group flattened to 'Option: Shell session' /
  // 'Option: Plain', names belonging to a different group further down. The
  // COUNTS stayed right throughout, which is why tab-flatten.spec.ts's
  // counting invariant had nothing to say about it.
  test("the flattened output labels each option with its own tab name", () => {
    const md = markdownPayload(page());
    const labels = [...md.matchAll(/\*\*Option: ([^*]*)\*\*/g)].map((m) => m[1]);
    expect(labels.length, "no option labels found").toBe(EXPECTED_TOTAL_PANELS);

    // Every button name on the page, in the order the flattened document must
    // present them: a panel's own label, then the labels of any group nested
    // inside it, then the next panel of the outer group. Comparing ORDER as
    // well as membership is what catches a label attached to the wrong panel —
    // the exact failure the id collision produced, where the names present on
    // the page were all correct and merely worn by the wrong options.
    const expected: string[] = [];
    const walk = (gs: TabGroup[]) => {
      for (const g of gs) {
        g.panels.forEach((p, i) => {
          expected.push(g.names[i]);
          walk(p.groups);
        });
      }
    };
    walk(tabGroups(bodyMarkup(page())));

    expect(
      labels,
      "flattened option labels are not the page's own tab names, in order",
    ).toEqual(expected);
  });
});

// THE SAME SHAPE, ARRIVING THROUGH `reuse` / `rebase` — a second pipeline, not
// a second spelling of the tests above.
//
// `fixture/assets/conrefs/test/everything.md` carries a nested group, so every
// content page renders one: `everything` through `{{< reuse >}}`, `rebased`
// through `{{< rebase >}}`, on all three version trees. Content that reaches
// `.Content` that way goes through utils/flatten-rendered, which replaces every
// newline with the `&#10;` entity — and a pattern written against `\s*` between
// two tags silently stops matching there (utils/unhide-tabs.html carries a
// comment about exactly this, and `(?:\s|&#10;)*` in it is the scar). Nesting
// is where that bites hardest, because the flattening has to survive being
// applied to markup that already contains a tab group.
const NESTED_REUSE_MARKER = "MARKER_REUSE_NESTTABS_OUTER_A";

test.describe("nested tabs that arrive through a conref", () => {
  test.skip(!IS_FIXTURE_TARGET, "reads this module's own fixture conref");

  const pages = TEST_PAGES.filter((p) =>
    readFixture(p.filePath).includes(NESTED_REUSE_MARKER),
  );

  test("the conref reached the content pages at all", () => {
    // Six: {v1,v2,main} x {everything,rebased}. Asserted rather than assumed,
    // so a conref that stops being mounted cannot turn the per-page tests below
    // into an empty loop that reports success.
    expect(
      pages.map((p) => p.name).sort(),
      `pages carrying ${NESTED_REUSE_MARKER}`,
    ).toEqual([
      "main/everything",
      "main/rebased",
      "v1/everything",
      "v1/rebased",
      "v2/everything",
      "v2/rebased",
    ]);
  });

  for (const p of pages) {
    test(`${p.name}: the conref's inner group stays inside its outer panel`, () => {
      const body = readFixture(p.filePath).replace(
        /<script[^>]*class=["']copy-md-source["'][^>]*>[\s\S]*?<\/script>/gi,
        "",
      );
      const all = flattenGroups(tabGroups(body));
      const outer = all.filter(
        (g) => g.names.join("|") === "Kubernetes|Standalone",
      );
      expect(outer.length, "the conref's outer group").toBe(1);

      expect(
        outer[0].panels[0].groups.map((g) => g.names.join("|")),
        "the inner group is not inside the outer panel — the conref pipeline " +
          "hoisted it out",
      ).toEqual(["Helm|kubectl"]);
      expect(outer[0].panels[0].markers).toEqual([
        "MARKER_REUSE_NESTTABS_OUTER_A",
        "MARKER_REUSE_NESTTABS_OUTER_A_TAIL",
      ]);
      expect(
        outer[0].panels[1].groups.length,
        "the second outer panel picked up a nested group it does not have",
      ).toBe(0);

      // Every tab id on the page, not just this group's: the pages carrying
      // this conref have four tab groups of their own, so they are where a
      // page-scoped id counter would collide if it were ever scoped to the
      // conref or to the shortcode instead.
      const ids = [...body.matchAll(/id="(tabs-(?:tab|panel)-[^"]*)"/g)].map(
        (m) => m[1],
      );
      expect(ids.length, "no tab ids on a page with tab groups").toBeGreaterThan(
        0,
      );
      expect(
        [...new Set(ids.filter((id, i) => ids.indexOf(id) !== i))],
        "duplicated tab/panel ids",
      ).toEqual([]);
    });

    test(`${p.name}: the conref's nested options flatten with their own names`, () => {
      const md = readFixture(p.filePath).match(
        /<script[^>]*class=["']copy-md-source["'][^>]*>([\s\S]*?)<\/script>/i,
      );
      expect(md, "no copy-as-markdown payload").not.toBeNull();

      const labels = [...md![1].matchAll(/\*\*Option: ([^*]*)\*\*/g)].map(
        (m) => m[1],
      );
      const at = labels.indexOf("Kubernetes");
      expect(at, "the conref's outer group is not labelled").toBeGreaterThan(-1);
      expect(
        labels.slice(at, at + 4),
        "the nested group's options do not flatten between their parent " +
          "option and the next one, under their own names",
      ).toEqual(["Kubernetes", "Helm", "kubectl", "Standalone"]);
    });
  }
});
