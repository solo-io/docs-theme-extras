import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { VERSION_MARKERS } from "./helpers/sentinels";
import { target } from "./helpers/target";
import { extractContent } from "./helpers/ancestor-path";

// Version-conditional rendering: the {{% version %}} shortcode resolves at
// render time per-section. Each per-version page must show only its own
// version sentinel and (for non-v1 pages) the "not v1" sentinel.

type Expectation = { include: string[]; exclude: string[] };

const expectations: Record<string, Expectation> = {
  "v1/everything": {
    include: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqV1,
    ],
    exclude: [
      VERSION_MARKERS.v2,
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV2,
      VERSION_MARKERS.seqMain,
    ],
  },
  "v2/everything": {
    include: [
      VERSION_MARKERS.v2,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceKey,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV2,
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.main,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqV1,
      VERSION_MARKERS.seqMain,
    ],
  },
  "main/everything": {
    include: [
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqMain,
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.v2,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV1,
      VERSION_MARKERS.seqV2,
    ],
  },
  // rebased.md lives at /v2/rebased/. The rebase shortcode rewrites the OSS
  // version strings (v1-oss) into enterprise versions (v1) using the two-pass
  // remap in rebase.html. The page is on v2, so v1 content stays excluded
  // post-remap and v2 content renders.
  "v2/rebased": {
    include: [
      VERSION_MARKERS.v2,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceKey,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV2,
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.main,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqV1,
      VERSION_MARKERS.seqMain,
    ],
  },
  // /v1/rebased/: rebase resolves to v1, OSS remap v1-oss → v1, so v1
  // sentinel renders and the others are excluded.
  "v1/rebased": {
    include: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqV1,
    ],
    exclude: [
      VERSION_MARKERS.v2,
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV2,
      VERSION_MARKERS.seqMain,
    ],
  },
  "main/rebased": {
    include: [
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
      VERSION_MARKERS.seqMain,
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.v2,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
      VERSION_MARKERS.inFenceComment,
      VERSION_MARKERS.inFenceGated,
      VERSION_MARKERS.inFencePlaceholderUpper,
      VERSION_MARKERS.inFencePlaceholderLower,
      VERSION_MARKERS.wrapAroundBullet,
      VERSION_MARKERS.wrapAroundFn,
      VERSION_MARKERS.wrapAroundComment,
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
      VERSION_MARKERS.seqV1,
      VERSION_MARKERS.seqV2,
    ],
  },
};

for (const page of TEST_PAGES) {
  if (!(page.name in expectations)) continue;
  const exp = expectations[page.name];
  test.describe(`version gating on ${page.name}`, () => {
    for (const sentinel of exp.include) {
      test(`includes ${sentinel}`, () => {
        const html = readFixture(page.filePath);
        expect(html, `${sentinel} missing from ${page.name}`).toContain(sentinel);
      });
    }
    for (const sentinel of exp.exclude) {
      test(`excludes ${sentinel}`, () => {
        const html = readFixture(page.filePath);
        expect(html, `${sentinel} should not appear on ${page.name}`).not.toContain(
          sentinel,
        );
      });
    }
  });
}

test.describe("reuse and rebase pipelines produce equivalent content", () => {
  // The two pipelines read the same asset and render it through different
  // shortcodes — `reuse` for /<v>/everything/, `rebase` for /<v>/rebased/.
  // The set of MARKER_*/COND_* sentinels that survive rendering should be
  // identical per version, because both pipelines apply the same version
  // gating against the page's URL section. Drift here would surface a
  // pipeline divergence: one shortcode dropping a nested call, one failing
  // to re-resolve a percent-form block that the other handles, etc.
  //
  // This is the structural-integrity guarantee the prior OSS-leak test was
  // protecting; with the asset on enterprise version strings, that test no
  // longer has anything to leak. Cross-pipeline parity is the equivalent
  // assertion in the new shape.
  for (const version of target.versions) {
    test(`${version}: everything and rebased contain the same sentinel set`, () => {
      // Fixture-only assertion: skip when the consumer doesn't ship
      // everything.md / rebased.md (i.e. .docs-test.toml has no [[pages]]).
      const everythingPage = TEST_PAGES.find(
        (p) => p.name === `${version}/everything`,
      );
      const rebasedPage = TEST_PAGES.find(
        (p) => p.name === `${version}/rebased`,
      );
      test.skip(
        !everythingPage || !rebasedPage,
        "fixture pages not configured for this consumer",
      );
      const everything = readFixture(everythingPage!.filePath);
      const rebased = readFixture(rebasedPage!.filePath);
      // Strip the embedded copy-as-md <script> tag so the comparison is
      // against rendered HTML, not the raw markdown source it captures.
      const sentinelsOf = (html: string): Set<string> => {
        const visible = html.replace(
          /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
          "",
        );
        return new Set(visible.match(/(?:MARKER|COND)_[A-Z0-9_]+/g) ?? []);
      };
      const evSet = sentinelsOf(everything);
      const reSet = sentinelsOf(rebased);
      const onlyInEverything = [...evSet]
        .filter((m) => !reSet.has(m))
        .sort();
      const onlyInRebased = [...reSet].filter((m) => !evSet.has(m)).sort();
      expect(
        { onlyInEverything, onlyInRebased },
        "reuse and rebase produced different sentinel sets",
      ).toEqual({ onlyInEverything: [], onlyInRebased: [] });
    });
  }

  // Structural-HTML parity. The sentinel-set comparison above catches
  // content drift (a marker present on one page but not the other), but
  // it does not catch FORMATTING drift — e.g., backticks rendering as
  // <code> on everything.md but as literal `text` on rebased.md. This
  // exact bug bit us when the rebase pipeline converted
  // {{%/* include */%}} to {{</* include */>}} and didn't convert back;
  // the included page's markdown stopped being re-processed and
  // backticks/links/headings landed as plain text.
  //
  // We count occurrences of specific HTML tags that come from markdown
  // syntax (not from shortcode output) and expect them to be roughly
  // equal between the two pages. Strict equality is the right bar — both
  // pages source the same conref through the same version filter, so
  // structural element counts should be identical post-render.
  for (const version of target.versions) {
    test(`${version}: everything and rebased have matching structural-HTML counts`, () => {
      const everythingPage = TEST_PAGES.find(
        (p) => p.name === `${version}/everything`,
      );
      const rebasedPage = TEST_PAGES.find(
        (p) => p.name === `${version}/rebased`,
      );
      test.skip(
        !everythingPage || !rebasedPage,
        "fixture pages not configured for this consumer",
      );
      // Strip the embedded copy-as-md <script> (raw markdown captured
      // for the clipboard feature) and the rendered scripts block; both
      // pages capture different raw source, which would skew counts.
      const cleanHtml = (html: string): string =>
        html
          .replace(
            /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
            "",
          )
          .replace(/<script\b[\s\S]*?<\/script>/gi, "")
          .replace(/<style\b[\s\S]*?<\/style>/gi, "");

      // Scope to the article's content region before counting.
      //
      // The whole page is not comparable: `everything` and `rebased` are two
      // DIFFERENT URLs, so their sidebar, breadcrumb, prev/next pager and TOC
      // link to different targets and nest differently. Measured on the widened
      // tag list below, that alone produced a 2-anchor difference with no
      // content defect behind it. The narrow original list only looked clean
      // because it happened to miss most chrome.
      const everything = extractContent(cleanHtml(readFixture(everythingPage!.filePath)));
      const rebased = extractContent(cleanHtml(readFixture(rebasedPage!.filePath)));
      expect(
        everything.length > 0 && rebased.length > 0,
        "no .content region found in one of the pages — the comparison would " +
          "be between two empty strings and pass vacuously",
      ).toBe(true);

      const countTag = (html: string, tag: string): number =>
        (html.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;

      // Tags that originate from markdown syntax (backticks, fences,
      // headings, lists, etc.). If a pipeline stops processing markdown
      // partway through (the include bug), these counts diverge.
      //
      // Widened for the gate refactor. The original list stopped at block
      // containers, so a gate that emitted its body as an extra paragraph, or
      // dropped a link/emphasis while re-rendering, changed nothing it counted.
      // `p` and `div` catch the double-wrap shapes in solo-io/docs#3280 §1
      // (`<p>Optional: <p>…</p></p>`); `td`/`tr`/`th` catch a table fragment
      // collapsing into a single cell; `a`/`strong` catch inline markdown lost
      // to a second render pass; `figure`/`blockquote` catch a block escaping
      // its wrapper.
      //
      // NOTE the standing limitation this does not fix: counting is blind to
      // container ejection, because a moved element keeps its count. That is
      // what `gate-containment.spec.ts` is for. Keep both — this one compares
      // the two PIPELINES to each other, that one pins ABSOLUTE structure.
      const tags = [
        "code", "pre", "h2", "h3", "h4", "ul", "ol", "li", "table", "img",
        "div", "p", "td", "tr", "th", "a", "strong", "figure", "blockquote",
      ];

      // Four of the widened tags diverge TODAY, before any refactor. Rather
      // than drop them (which hides the signal) or fail the suite (which is not
      // this change's job), the divergent SET is pinned: a newly-divergent tag
      // fails, and so does one that stops diverging, so the list ratchets down
      // as Phase 5 lands.
      //
      // RESOLVED. The root cause was a gate placed INSIDE a bold span in the
      // fixture: `**{{%% version include-if="v2" %%}}...{{%% /version %%}}**`. Where
      // the gate excluded, the delimiters collapsed and BOTH pipelines rendered
      // `The setting **** is v2-only` -- four literal asterisks in visible output.
      // `markdown-leaks` was blind to it because RAW_BOLD requires content
      // between the delimiters.
      //
      // Fixed three ways: the fixture moved to the supported form (gate WRAPS
      // the emphasis), `tests/gate-inline-form.spec.ts` now lints the cause at
      // source, and an `empty-emphasis` pattern in markdown-leaks catches the
      // symptom in any already-built output.
      //
      // KNOWN_DIVERGENT is kept as a ratchet: a newly-divergent tag fails, and
      // so does one that stops diverging, so the list only shrinks.
      const KNOWN_DIVERGENT = ["a", "div", "p", "strong"];
      const counts: Record<string, { everything: number; rebased: number }> = {};
      for (const tag of tags) {
        counts[tag] = {
          everything: countTag(everything, tag),
          rebased: countTag(rebased, tag),
        };
      }

      // Diff: only report tags where counts differ. Empty diff = parity.
      const diffs = Object.fromEntries(
        Object.entries(counts).filter(
          ([_, v]) => v.everything !== v.rebased,
        ),
      );

      const unexpected = Object.fromEntries(
        Object.entries(diffs).filter(([t]) => !KNOWN_DIVERGENT.includes(t)),
      );
      expect(
        unexpected,
        "structural-HTML element counts differ between everything and rebased — " +
          "if `code` or `pre` is off, the rebase pipeline likely lost markdown " +
          "processing on an included/embedded block (e.g., `{{< include >}}` " +
          "should be `{{% include %}}`).",
      ).toEqual({});

      // Ratchet the other way too: a tag that stops diverging must leave
      // KNOWN_DIVERGENT, or the list quietly stops meaning anything. Scoped to
      // this version's actual divergences, since which tags diverge varies by
      // version (`strong` only on v1, `div` only on v2).
      const stillDivergent = KNOWN_DIVERGENT.filter((t) => t in diffs);
      expect(
        stillDivergent.length,
        `all known-divergent tags now match on ${version} — remove them from ` +
          `KNOWN_DIVERGENT so the check tightens`,
      ).toBeGreaterThan(0);
    });
  }
});
