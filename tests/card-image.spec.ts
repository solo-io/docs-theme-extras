import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the card shortcode's `image` attribute.
//
// The bug (2026-05-29, kgw landing): a card written as
//   {{< card image="assets/img/logo.png" ... >}}
// emitted that string straight into the <img src>. Hugo never publishes a
// bare `assets/...` path, so the browser resolved it page-relative and the
// image 404'd. The fix routes asset-relative values through the asset
// pipeline (resources.Get → .RelPermalink) so the file is published and the
// src points at it; `http(s)://` and root-absolute `/` values pass through
// verbatim.
//
// The fixture's card-image section (assets/conrefs/test/everything.md) renders
// one card per form, each tagged with a MARKER_CARD_IMAGE_* title:
//   ASSET    image="assets/img/test/light.svg"  → pipeline, must publish
//   NOPREFIX image="img/test/light.svg"         → pipeline, must publish
//   ROOTED   image="/test/images/logos/..."     → verbatim, real static file
//   HTTP     image="https://.../x.png"          → verbatim external URL
//
// This is a static spec: it reads the built HTML from disk and, for the
// pipeline forms, asserts the resolved src maps to a file that actually
// exists under builtRoot (the on-disk equivalent of "doesn't 404").

type Card = { href: string; title: string; imageSrc: string | null };

function extractCards(html: string): Card[] {
  const out: Card[] = [];
  const cardRe =
    /<a\s+class="section-card"\s+href="([^"]+)"[^>]*>([\s\S]*?)<\/a>/g;
  for (const m of html.matchAll(cardRe)) {
    const href = m[1];
    const inner = m[2];
    const titleMatch = inner.match(
      /<span[^>]*class="section-card-title"[^>]*>([\s\S]*?)<\/span>/,
    );
    // card.html emits <img src="..." alt="..." class="section-card-image" ...>
    // (src first, class after) — match the image by its class, then read src.
    const imgMatch = inner.match(
      /<img\b[^>]*class="section-card-image"[^>]*>/,
    );
    let imageSrc: string | null = null;
    if (imgMatch) {
      const srcMatch = imgMatch[0].match(/\bsrc="([^"]*)"/);
      imageSrc = srcMatch ? srcMatch[1] : null;
    }
    out.push({
      href,
      title: (titleMatch?.[1] ?? "").replace(/\s+/g, " ").trim(),
      imageSrc,
    });
  }
  return out;
}

// Map a root-relative published URL ("/test/img/test/light.svg") to its file
// on disk under builtRoot. builtRoot is served at "/", and baseURL is part of
// the path, so the leading slash is simply stripped and joined to builtRoot.
function fileForResolvedSrc(src: string): string {
  return path.join(target.builtRoot, src.replace(/^\/+/, ""));
}

// Only the version pages that include the fixture's everything content carry
// the card-image section. Drop any that didn't build (mirrors auto-cards).
const everythingPages = target.versions
  .map((v) => target.fileForUrl(`${target.baseURL}/${v}/everything/`))
  .filter((f) => fs.existsSync(f));

test.describe("card shortcode image attribute", () => {
  test.skip(
    everythingPages.length === 0,
    "no built everything pages with the card-image fixture section",
  );

  for (const file of everythingPages) {
    const label = path.relative(target.builtRoot, file);

    test(`${label}: asset-relative images resolve to a published file`, () => {
      const cards = extractCards(readFixture(file));
      for (const marker of [
        "MARKER_CARD_IMAGE_ASSET",
        "MARKER_CARD_IMAGE_NOPREFIX",
      ]) {
        const card = cards.find((c) => c.title.includes(marker));
        expect(card, `no card titled ${marker} in ${label}`).toBeDefined();
        const src = card!.imageSrc;
        expect(src, `${marker}: card rendered no <img src>`).toBeTruthy();
        // The original bug: src kept the literal "assets/..." (or a bare
        // relative path). After the fix it must be a root-relative pipeline
        // URL — never "assets/"-prefixed.
        expect(
          src!.startsWith("assets/"),
          `${marker}: src "${src}" still points at the unpublished assets/ path`,
        ).toBe(false);
        expect(
          src!.startsWith("/"),
          `${marker}: src "${src}" is not a root-relative published URL`,
        ).toBe(true);
        // The real "won't 404" check: the resolved file exists in the build.
        const resolved = fileForResolvedSrc(src!);
        expect(
          fs.existsSync(resolved),
          `${marker}: src "${src}" → ${resolved} was not published`,
        ).toBe(true);
      }
    });

    test(`${label}: root-absolute image passes through and exists`, () => {
      const cards = extractCards(readFixture(file));
      const card = cards.find((c) =>
        c.title.includes("MARKER_CARD_IMAGE_ROOTED"),
      );
      expect(card, `no ROOTED card in ${label}`).toBeDefined();
      expect(card!.imageSrc).toBe("/test/images/logos/logo-oss-test.svg");
      const resolved = fileForResolvedSrc(card!.imageSrc!);
      expect(
        fs.existsSync(resolved),
        `ROOTED: ${card!.imageSrc} → ${resolved} missing`,
      ).toBe(true);
    });

    test(`${label}: external image URL passes through verbatim`, () => {
      const cards = extractCards(readFixture(file));
      const card = cards.find((c) =>
        c.title.includes("MARKER_CARD_IMAGE_HTTP"),
      );
      expect(card, `no HTTP card in ${label}`).toBeDefined();
      // External URLs must NOT be sent through resources.Get — left as-is.
      expect(card!.imageSrc).toBe(
        "https://raw.githubusercontent.com/solo-io/docs/main/does-not-need-to-exist.png",
      );
    });

    // Belt-and-suspenders: no card anywhere on the page may keep an
    // unpublished asset path. Catches a regression even if the markered
    // cards above are renamed or removed.
    test(`${label}: no card-image src points at an unpublished path`, () => {
      const cards = extractCards(readFixture(file));
      const bad = cards
        .filter((c) => c.imageSrc)
        .filter((c) => {
          const s = c.imageSrc!;
          if (s.startsWith("http")) return false; // external, fine
          if (s.startsWith("/")) return false; // published root-relative, fine
          return true; // bare "assets/..." or page-relative → would 404
        });
      expect(
        bad.map((c) => `${c.title} → ${c.imageSrc}`),
        "card-image src(s) that would 404 (not http, not root-relative)",
      ).toEqual([]);
    });
  }
});
