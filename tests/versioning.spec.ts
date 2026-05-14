import { test, expect } from "@playwright/test";
import { TEST_PAGES, readFixture } from "./helpers/fixture";
import { VERSION_MARKERS } from "./helpers/sentinels";
import { target } from "./helpers/target";

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
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.main,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
    ],
  },
  "main/everything": {
    include: [
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
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
    ],
    exclude: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.main,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
    ],
  },
  // /v1/rebased/: rebase resolves to v1, OSS remap v1-oss → v1, so v1
  // sentinel renders and the others are excluded.
  "v1/rebased": {
    include: [
      VERSION_MARKERS.v1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
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
    ],
  },
  "main/rebased": {
    include: [
      VERSION_MARKERS.main,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.v1OrMain,
      VERSION_MARKERS.keepVersion,
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

      const everything = cleanHtml(readFixture(everythingPage!.filePath));
      const rebased = cleanHtml(readFixture(rebasedPage!.filePath));

      const countTag = (html: string, tag: string): number =>
        (html.match(new RegExp(`<${tag}\\b`, "g")) ?? []).length;

      // Tags that originate from markdown syntax (backticks, fences,
      // headings, lists, etc.). If a pipeline stops processing markdown
      // partway through (the include bug), these counts diverge.
      const tags = ["code", "pre", "h2", "h3", "h4", "ul", "ol", "li", "table", "img"];
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
      expect(
        diffs,
        "structural-HTML element counts differ between everything and rebased — " +
          "if `code` or `pre` is off, the rebase pipeline likely lost markdown " +
          "processing on an included/embedded block (e.g., `{{< include >}}` " +
          "should be `{{% include %}}`).",
      ).toEqual({});
    });
  }
});
