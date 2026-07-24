import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for two warn-missing-description fixes:
//   (a) static-HTML content pages (a `.html` source file, e.g. a standalone
//       Redoc/Swagger viewer that ships its own <head>) are skipped — the theme
//       never emits a <meta name=description> for them, so a front-matter
//       description would be inert and warning about it is noise; and
//   (b) the opt-out reads case-INSENSITIVELY. The earlier
//       `isset . "warnMissingDescription"` matched Hugo's lowercased param key
//       case-sensitively and so never fired, so `warnMissingDescription = false`
//       never silenced the lint. The fix uses `eq .warnMissingDescription false`.
//
// Why a SOURCE check, not a build-warning check: asserting the ABSENCE of a
// warning for a static-HTML page would need a `.html` fixture page wired into
// the build plus build-log capture; and the opt-out only fires when the whole
// site sets the param false, which the bundled fixture doesn't. A source scan
// pins both guards against a regression — e.g. a refactor that reintroduces the
// case-sensitive `isset`, or drops the static-HTML skip. Self-skips on a
// consumer build where the file isn't at the module-relative path.

const PARTIAL = path.resolve(
  __dirname,
  "../layouts/partials/utils/warn-missing-description.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so assertions match the
// ACTIVE code, not the explanatory comments — this partial's comments quote the
// old buggy `isset . "warnMissingDescription"` form on purpose.
function activeSrc(): string {
  return fs
    .readFileSync(PARTIAL, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("warn-missing-description: static-HTML skip + case-insensitive opt-out", () => {
  test.skip(
    !fs.existsSync(PARTIAL),
    "warn-missing-description.html not at the module-relative path (consumer build)",
  );

  test("opt-out is read case-insensitively (`eq .warnMissingDescription false`), not via case-sensitive `isset`", () => {
    const s = activeSrc();
    expect(
      /eq\s+\.warnMissingDescription\s+false/.test(s),
      "opt-out no longer uses `eq .warnMissingDescription false` — a refactor " +
        "may have reintroduced a guard that doesn't disable on an explicit false.",
    ).toBe(true);
    expect(
      /isset\s+\.\s+"warnMissingDescription"/.test(s),
      'the case-SENSITIVE `isset . "warnMissingDescription"` guard is back — it ' +
        "matches Hugo's lowercased param key case-sensitively and never fires, so " +
        "warnMissingDescription=false silently does nothing.",
    ).toBe(false);
  });

  test("static-HTML content pages are excluded from the lint", () => {
    const s = activeSrc();
    // The skip keys off the source file extension being `html`.
    expect(
      /\.Ext\b/.test(s) && /"html"/.test(s),
      'no `.Ext` / "html" static-HTML guard — a `.html` content page (e.g. a ' +
        "Redoc/Swagger viewer that ships its own <head>) would be wrongly linted.",
    ).toBe(true);
    // …and that flag must actually gate the warn (`not $isStaticHTML` in the
    // condition), not just be computed and ignored.
    expect(
      /not\s+\$isStaticHTML/.test(s),
      "the static-HTML flag is computed but not applied in the warn condition " +
        "(`not $isStaticHTML` missing) — static-HTML pages would still be linted.",
    ).toBe(true);
  });
});
