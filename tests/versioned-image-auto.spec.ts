import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";
import { VERSION_MARKERS } from "./helpers/sentinels";

// Auto version-resolved images: the reuse-image family resolves a bare `src`
// to a version-specific override when one exists, without any {{< version >}}
// split in the content. See layouts/_partials/utils/resolve-versioned-image.html.
//
// The "shared until it diverges" model: authors write ONE bare reference
// (`src="img/autover.svg"`) and never edit it across releases. On a page whose
// version slug is <v>, the resolver prefers `img/<v>/autover.svg` when that file
// exists, otherwise falls back to the bare `img/autover.svg`.
//
// The fixture ships `img/main/autover.svg` but no `img/v1/` or `img/v2/`
// variant, so:
//   - the main page must show the override  → /test/img/main/autover.svg
//   - every other version shares the bare    → /test/img/autover.svg
//
// Static spec: reads the built HTML from disk and asserts the resolved <img src>
// (and that the file it points at was actually published — the "won't 404" check).

const AUTO_MARKER = VERSION_MARKERS.autoVersionedImage;

// Pull the <img src> whose alt contains `marker`. reuse-image emits
// <div class="toggle-*"><figure><img src="..." width="..." alt="..."/> ...
function imgSrcByAlt(html: string, marker: string): string | null {
  for (const m of html.matchAll(/<img\b[^>]*>/g)) {
    const tag = m[0];
    if (tag.includes(marker)) {
      const src = tag.match(/\bsrc="([^"]+)"/);
      return src ? src[1] : null;
    }
  }
  return null;
}

function fileForResolvedSrc(src: string): string {
  return path.join(target.builtRoot, src.replace(/^\/+/, ""));
}

// version slug -> built everything page, keeping only versions that built.
const versionPages = target.versions
  .map((v) => ({ v, file: target.fileForUrl(`${target.baseURL}/${v}/everything/`) }))
  .filter(({ file }) => fs.existsSync(file));

test.describe("auto version-resolved images", () => {
  test.skip(
    versionPages.length === 0,
    "no built everything pages with the auto-versioned-image fixture section",
  );

  for (const { v, file } of versionPages) {
    const label = path.relative(target.builtRoot, file);
    // Only `main` has an override asset in the fixture; the rest share the bare.
    const expected =
      v === "main"
        ? `${target.baseURL}/img/main/autover.svg`
        : `${target.baseURL}/img/autover.svg`;

    test(`${label}: bare src resolves to ${expected}`, () => {
      const src = imgSrcByAlt(readFixture(file), AUTO_MARKER);
      expect(src, `${AUTO_MARKER}: no <img> rendered on ${label}`).toBeTruthy();
      expect(src).toBe(expected);
      const resolved = fileForResolvedSrc(src!);
      expect(
        fs.existsSync(resolved),
        `${AUTO_MARKER}: src "${src}" → ${resolved} was not published`,
      ).toBe(true);
    });
  }
});
