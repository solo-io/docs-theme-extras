import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for correct link-hextra version inference on a
// non-default-language page, and for the prefix translation that inference now
// depends on.
//
// THE REQUIREMENT (unchanged): on a localized page the permalink carries a
// language segment (`/<product>/ja/<version>/...`). If that segment isn't
// accounted for, version inference falls through to "latest" and every
// cross-doc link points at the wrong version tree.
//
// THE MECHANISM (changed): inference used to live in resolve-link.html, which
// stripped `.Site.LanguagePrefix` out of a local `$relURL` copy BEFORE running
// its own segment walk. That walk is gone — resolve-link.html now delegates to
// utils/version-root.html, the one resolver the sidebar, navbar, docs-tabs and
// version banner also use. So the language handling splits in two, and this
// file guards both halves:
//
//   1. version-root.html must recognize the language-shifted shape, i.e. try
//      the version at segment 3 (`/<product>/<lang>/<version>/`) and not only
//      at 2 (`/<product>/<version>/`).
//
//   2. resolve-link.html must strip BOTH the baseURL path and the language
//      prefix off the version root it gets back. version-root.html returns a
//      PUBLISHED-URL prefix (product and language included); the URL assembly
//      in resolve-link.html re-prepends `.Site.BaseURL`, which already carries
//      both. Skipping either strip emits `/kgateway/kgateway/2.1.x/…` on the
//      hub, or leaves a stale `/ja` in every link on a localized page.
//
// Why SOURCE checks, not rendered-output checks: the bundled fixture is
// single-language (see language-switch.spec.ts), so `.Site.LanguagePrefix` is
// empty and this whole path is a no-op in the fixture build — there is nothing
// to assert in the HTML. A rendered guard would need a second language added to
// the fixture, which shifts every page URL the rest of the suite asserts on
// (deliberately deferred, same as language-switch). Self-skips when the files
// aren't at the module-relative path (a consumer build, where the module lives
// under hugo_cache rather than ../layouts).

const RESOLVE_LINK = path.resolve(
  __dirname,
  "../layouts/_partials/utils/resolve-link.html",
);
const VERSION_ROOT = path.resolve(
  __dirname,
  "../layouts/_partials/utils/version-root.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so the assertions match
// ACTIVE code, not the explanatory comments (which also mention
// `.Site.LanguagePrefix` and the example URLs).
function activeSrc(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("localized-page version inference", () => {
  test.skip(
    !fs.existsSync(RESOLVE_LINK) || !fs.existsSync(VERSION_ROOT),
    "partials not at the module-relative path (consumer build)",
  );

  test("version-root.html tries the language-shifted version position", () => {
    const src = activeSrc(VERSION_ROOT);

    // The candidate-position list is what makes the shape tolerant: 2 for
    // `/<product>/<version>/`, 3 for `/<product>/<lang>/<version>/`, 1 for
    // local dev. Dropping 3 breaks every localized page's inference.
    expect(
      /\$candidatePositions\s*=\s*\$candidatePositions\s*\|\s*append\s+3\b/.test(
        src,
      ),
      "version-root.html no longer tries segment 3 as a version candidate — " +
        "localized permalinks (/<product>/<lang>/<version>/) can't infer a " +
        "version, so their links fall back to `latest`.",
    ).toBe(true);
  });

  test("resolve-link.html strips the baseURL path and language prefix off the version root", () => {
    const src = activeSrc(RESOLVE_LINK);

    // It must delegate rather than re-derive. If a second segment walk ever
    // reappears here, the two implementations drift — which is the bug class
    // this consolidation removed.
    const rootCallIdx = src.search(
      /partial\s+"utils\/version-root\.html"/,
    );
    expect(
      rootCallIdx,
      "resolve-link.html no longer calls utils/version-root.html — version " +
        "inference has been re-forked, so it can drift from the sidebar/navbar.",
    ).toBeGreaterThan(-1);

    // The language prefix must be removed from the returned root …
    expect(
      /\{\{-?\s*with\s+\.Site\.LanguagePrefix/.test(src),
      "`.Site.LanguagePrefix` is not read under a `with` guard — the default " +
        "language (empty prefix) must be a no-op.",
    ).toBe(true);
    const langIdx = src.search(/\.Site\.LanguagePrefix/);
    expect(
      langIdx,
      "no `.Site.LanguagePrefix` handling — a localized page keeps its `/ja` " +
        "in the version root and every emitted link doubles it.",
    ).toBeGreaterThan(-1);

    // … and so must the baseURL path, or the hub doubles its product segment.
    expect(
      /replaceRE\s+`\^https\?:\/\/\[\^\/\]\*`\s+""\s+\.Site\.BaseURL/.test(src),
      "the baseURL path is no longer derived from `.Site.BaseURL` — " +
        "version-root.html returns a published-URL prefix that already " +
        "contains the product, and the assembly step re-prepends baseURL, so " +
        "hub links come out as /kgateway/kgateway/2.1.x/….",
    ).toBe(true);

    // Both strips operate on the resolver's OUTPUT, so they must come after it.
    expect(
      langIdx,
      "the language strip runs before the version-root call — it has nothing " +
        "to strip yet.",
    ).toBeGreaterThan(rootCallIdx);

    // And they must actually strip from $versionRoot, not merely be mentioned.
    expect(
      /strings\.TrimPrefix\s+\.\s+\$versionRoot/.test(src),
      "no `strings.TrimPrefix . $versionRoot` — the prefixes are computed but " +
        "never removed from the version root.",
    ).toBe(true);
  });
});
