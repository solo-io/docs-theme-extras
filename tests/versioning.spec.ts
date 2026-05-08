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
    ],
  },
  "v2/everything": {
    include: [
      VERSION_MARKERS.v2,
      VERSION_MARKERS.notV1,
      VERSION_MARKERS.nestedLink,
      VERSION_MARKERS.versionedImage,
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
      const everything = readFixture(
        TEST_PAGES.find((p) => p.name === `${version}/everything`)!.filePath,
      );
      const rebased = readFixture(
        TEST_PAGES.find((p) => p.name === `${version}/rebased`)!.filePath,
      );
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
});
