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
// Coverage matrix (each CASE below is one fixture section in everything.md):
//   - reuse-image (bare `src`)         override on main + v2   → proves the
//                                                                 splice isn't
//                                                                 main-specific
//   - reuse-image (nested `src`)       override on main only   → proves the slug
//                                                                 is spliced
//                                                                 before the file
//                                                                 name, not the
//                                                                 whole path
//   - reuse-image-light (`src`)        override on main + v2   → standalone light
//                                                                 shortcode wiring
//   - reuse-image-dark (`srcDark`)     override on main only   → standalone dark
//                                                                 shortcode wiring
//
// Static spec: reads the built HTML from disk and asserts the resolved <img src>
// (and that the file it points at was actually published — the "won't 404" check).

interface Case {
  marker: string;
  // Bare (shared) path the author wrote, as it appears in the published <img src>.
  bare: string;
  // Versions that ship a `<dir>/<version>/<file>` override in the fixture.
  overrideVersions: string[];
}

const CASES: Case[] = [
  {
    marker: VERSION_MARKERS.autoVersionedImage,
    bare: "img/autover.svg",
    overrideVersions: ["main", "v2"],
  },
  {
    marker: VERSION_MARKERS.autoVersionedImageNested,
    bare: "img/screens/autover.svg",
    overrideVersions: ["main"],
  },
  {
    marker: VERSION_MARKERS.autoVersionedImageLight,
    bare: "img/autover.svg",
    overrideVersions: ["main", "v2"],
  },
  {
    marker: VERSION_MARKERS.autoVersionedImageDark,
    bare: "img/autover-dark.svg",
    overrideVersions: ["main"],
  },
];

// Splice the version slug in before the filename: img/screens/foo.svg → img/screens/<v>/foo.svg.
function overridePath(bare: string, v: string): string {
  const dir = path.posix.dirname(bare);
  const file = path.posix.basename(bare);
  return dir === "." ? `${v}/${file}` : `${dir}/${v}/${file}`;
}

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

  for (const { marker, bare, overrideVersions } of CASES) {
    for (const { v, file } of versionPages) {
      const label = path.relative(target.builtRoot, file);
      // The version shows its own override when the fixture ships one; else it
      // falls back to the shared bare path.
      const rel = overrideVersions.includes(v) ? overridePath(bare, v) : bare;
      const expected = `${target.baseURL}/${rel}`;

      test(`${marker} — ${label}: resolves to ${expected}`, () => {
        const src = imgSrcByAlt(readFixture(file), marker);
        expect(src, `${marker}: no <img> rendered on ${label}`).toBeTruthy();
        expect(src).toBe(expected);
        const resolved = fileForResolvedSrc(src!);
        expect(
          fs.existsSync(resolved),
          `${marker}: src "${src}" → ${resolved} was not published`,
        ).toBe(true);
      });
    }
  }
});

// Rendering mode (independent of which version resolved): a lone `reuse-image`
// src with no dark counterpart shows in BOTH modes (a plain figure, no
// toggle-* wrapper), while the explicit light/dark variants stay mode-gated.
// This pins the "single image stays visible in dark mode" default added
// alongside the resolver.
function wrapperClassByAlt(html: string, marker: string): string | null {
  for (const m of html.matchAll(/<div\b([^>]*)><figure><img\b[^>]*>/g)) {
    if (m[0].includes(marker)) {
      const cls = m[1].match(/\bclass="([^"]*)"/);
      return cls ? cls[1] : "";
    }
  }
  return null;
}

// All wrapper classes for a marker, in document order. The PAIR form emits two
// figures with the same alt (light + dark), so a single-match lookup isn't
// enough — collect both.
function wrapperClassesByAlt(html: string, marker: string): string[] {
  const out: string[] = [];
  for (const m of html.matchAll(/<div\b([^>]*)><figure><img\b[^>]*>/g)) {
    if (!m[0].includes(marker)) continue;
    const cls = m[1].match(/\bclass="([^"]*)"/);
    out.push(cls ? cls[1] : "");
  }
  return out;
}

test.describe("reuse-image rendering mode", () => {
  const anyPage = versionPages[0]?.file;
  test.skip(!anyPage, "no built everything page");

  // Lone reuse-image / reuse-image-light-with-no-dark → both modes, no toggle.
  for (const marker of [
    VERSION_MARKERS.autoVersionedImage,
    VERSION_MARKERS.autoVersionedImageNested,
  ]) {
    test(`${marker}: lone src has no toggle wrapper (both modes)`, () => {
      const cls = wrapperClassByAlt(readFixture(anyPage!), marker);
      expect(cls, `${marker}: no wrapping <div>`).not.toBeNull();
      expect(
        /\btoggle-(dark|light)\b/.test(cls!),
        `${marker}: lone reuse-image should not be mode-gated, got class "${cls}"`,
      ).toBe(false);
    });
  }

  // The explicit single-mode variants keep their toggle wrappers.
  test(`${VERSION_MARKERS.autoVersionedImageLight}: reuse-image-light stays light-only (.toggle-dark)`, () => {
    const cls = wrapperClassByAlt(readFixture(anyPage!), VERSION_MARKERS.autoVersionedImageLight);
    expect(cls).toContain("toggle-dark");
  });
  test(`${VERSION_MARKERS.autoVersionedImageDark}: reuse-image-dark stays dark-only (.toggle-light)`, () => {
    const cls = wrapperClassByAlt(readFixture(anyPage!), VERSION_MARKERS.autoVersionedImageDark);
    expect(cls).toContain("toggle-light");
  });

  // reuse-image's OWN pair form (src + srcDark on one call) must gate each
  // variant — one .toggle-dark (light) + one .toggle-light (dark) — and must
  // NOT collapse to the ungated single-image output. Neither the lone-src
  // cases above nor the standalone reuse-image-light/dark shortcodes exercise
  // this branch of reuse-image.
  test(`${VERSION_MARKERS.reuseImagePair}: src+srcDark gates one figure per mode`, () => {
    const classes = wrapperClassesByAlt(readFixture(anyPage!), VERSION_MARKERS.reuseImagePair).sort();
    expect(classes).toEqual(["toggle-dark", "toggle-light"]);
  });
});
