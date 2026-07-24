import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for the link-hextra language-prefix fix.
//
// link-hextra infers the target version by regex-matching the page's permalink
// (e.g. `.../kgateway/2.3.x/...`). On a non-default-language page the permalink
// carries a language segment (`/<product>/ja/<version>/...`), which the version
// regex doesn't expect — so version inference fell through to "latest" and the
// cross-doc link pointed at the wrong version tree. The fix strips
// `.Site.LanguagePrefix` from the permalink before matching (a no-op on the
// default language, whose prefix is empty).
//
// Why a SOURCE check, not a rendered-output check: the bundled fixture is
// single-language (see language-switch.spec.ts), so `.Site.LanguagePrefix` is
// empty and this branch is a no-op in the fixture build — there is nothing to
// assert in the HTML. A rendered guard would need a second language added to
// the fixture, which shifts every page URL the rest of the suite asserts on
// (deliberately deferred, same as language-switch). This reads the shipped
// shortcode and fails if the language-prefix strip is dropped or reordered
// after the version regex. Self-skips when the file isn't at the
// module-relative path (a consumer build, where the module lives under
// hugo_cache rather than ../layouts).

const SHORTCODE = path.resolve(
  __dirname,
  "../layouts/_shortcodes/link-hextra.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so the assertions match
// ACTIVE code, not the explanatory comment (which also mentions
// `.Site.LanguagePrefix`).
function activeSrc(): string {
  return fs
    .readFileSync(SHORTCODE, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("link-hextra strips the language prefix before version inference", () => {
  test.skip(
    !fs.existsSync(SHORTCODE),
    "link-hextra.html not at the module-relative path (consumer build)",
  );

  test("`.Site.LanguagePrefix` is stripped from the permalink before the version regex", () => {
    const src = activeSrc();

    // The version-inference regex (matches product/version in the URL). Its
    // position is the boundary the language strip must precede.
    const verMatchIdx = src.search(/findRE\s+`\(\?:kgateway/);
    expect(
      verMatchIdx,
      "version-inference `findRE` not found — the shortcode changed shape; " +
        "re-check that the language-prefix strip still precedes it.",
    ).toBeGreaterThan(-1);

    // The language-prefix handling must be present …
    const langIdx = src.search(/\.Site\.LanguagePrefix/);
    expect(
      langIdx,
      "no `.Site.LanguagePrefix` handling — the localized-page version " +
        "inference fix was dropped, so JA/localized links fall back to `latest`.",
    ).toBeGreaterThan(-1);

    // … and it must run BEFORE the version regex, so the language segment is
    // gone by the time the version is matched.
    expect(
      langIdx,
      "`.Site.LanguagePrefix` is referenced but not before the version regex — " +
        "the strip must run first or the language segment breaks inference.",
    ).toBeLessThan(verMatchIdx);

    // And it must actually STRIP the prefix from the URL var, not merely read
    // it: a `with .Site.LanguagePrefix` block that `replace`s it out of $relURL.
    expect(
      /\{\{-?\s*with\s+\.Site\.LanguagePrefix/.test(src),
      "`.Site.LanguagePrefix` is read without a `with` guard — the default " +
        "language (empty prefix) must be a no-op.",
    ).toBe(true);
    expect(
      /replace\s+\$relURL\b/.test(src),
      "no `replace $relURL …` — the language prefix is never removed from the " +
        "permalink before version inference.",
    ).toBe(true);
  });
});
