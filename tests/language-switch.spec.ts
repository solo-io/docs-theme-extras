import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for the centralized language-switch.html override.
//
// Hextra's language-switch.html gates the switcher only on
// `hugo.IsMultilingual`, which is true site-wide as soon as a consumer
// defines more than one language — so the switcher appears on every page,
// including untranslated ones, where it dead-ends. The extras override adds
// a per-page `($page.IsTranslated)` guard so it renders only when the current
// page actually has a translation.
//
// Why this is a SOURCE check, not a rendered-output check: the bundled
// fixture is single-language (`content/en` only, no `[languages]` block), so
// `hugo.IsMultilingual` is false and the switcher never renders in the
// fixture build — there is nothing to assert in the HTML. The real-world
// regression is a Hextra bump that re-syncs this partial and silently drops
// the guard (the file header explicitly says "re-sync on a Hextra bump and
// keep the $page.IsTranslated condition"). This test reads the shipped
// override and fails if the guard is gone. It self-skips when the file isn't
// present at the expected module-relative path (e.g. a consumer build, where
// the module lives under hugo_cache rather than ../layouts).
//
// FOLLOW-UP: a true rendered guard would need a second language + a
// translated/untranslated page pair added to the fixture (deferred — adding a
// language risks shifting every page URL the rest of the suite asserts on).

const OVERRIDE = path.resolve(
  __dirname,
  "../layouts/_partials/language-switch.html",
);

test.describe("language-switch override keeps the IsTranslated guard", () => {
  test.skip(
    !fs.existsSync(OVERRIDE),
    "language-switch.html not at the module-relative path (consumer build)",
  );

  test("the switcher is gated on both IsMultilingual AND IsTranslated", () => {
    const src = fs.readFileSync(OVERRIDE, "utf8");

    // Find the gating conditional(s): `{{- if and ... -}}` lines.
    const ifAndLines = src
      .split("\n")
      .filter((l) => /\{\{-?\s*if\s+and\b/.test(l));
    expect(
      ifAndLines.length,
      "no `{{ if and ... }}` gating condition found — the override no longer " +
        "guards the switcher (likely re-synced from Hextra, which gates on " +
        "hugo.IsMultilingual alone).",
    ).toBeGreaterThan(0);

    const gate = ifAndLines.find(
      (l) => l.includes("hugo.IsMultilingual") && l.includes(".IsTranslated"),
    );
    expect(
      gate,
      "the switcher's gating `if and` does not combine hugo.IsMultilingual " +
        "with .IsTranslated — the per-page translation guard was dropped, so " +
        "the switcher will render on untranslated pages and dead-end. " +
        `Gating lines seen: ${JSON.stringify(ifAndLines.map((l) => l.trim()))}`,
    ).toBeTruthy();
  });
});
