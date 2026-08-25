import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for correct link/card URL construction on a
// non-default-language page.
//
// THE REQUIREMENT (unchanged): on a localized page the permalink carries a
// language segment (`/<product>/ja/<version>/...`, and for a product with
// parallel documentation sections `/<product>/ja/<section>/<version>/...`).
// Every URL the theme BUILDS — rather than reads off the page — has to carry
// that segment, or a Japanese page links its reader into the English tree.
//
// ── WHY THIS FILE WAS REWRITTEN ─────────────────────────────────────────────
//
// It previously asserted the OPPOSITE of the requirement: that
// resolve-link.html strips `.Site.LanguagePrefix` off the version root. The
// stated reason was that "the URL assembly re-prepends `.Site.BaseURL`, which
// already carries both" the product and the language. That is true of the
// product and FALSE of the language: `.Site.BaseURL` is the CONFIGURED base
// (`https://host/<product>/`), and Hugo does not fold the language segment into
// it. The local/localhost branch of the same assembly drops `.Site.BaseURL`
// altogether, so there the language had no route back at all.
//
// So the strip silently emitted English URLs from every translated page. As
// measured on docs.solo.io before the fix: 339 such links on agentregistry ja,
// 1011 on agentgateway ja.
//
// The test could never have caught it, and the comment below said so out loud:
// the bundled fixture is single-language, so `.Site.LanguagePrefix` is empty and
// the whole path is a no-op in the fixture build. A source-SHAPE assertion was
// standing in for a BEHAVIORAL one, and it pinned the defect in place — every
// run went green while production shipped the wrong URLs.
//
// ── KNOWN GAP, deliberately not closed here ─────────────────────────────────
//
// These are still source checks, so they still cannot observe a rendered URL.
// The real guard is a multilingual fixture variant (a second language + its own
// build target, publishDir, and testMatch entry, in the shape of
// content-flat/build-flat) asserting the emitted hrefs directly. That is the
// only thing that would have caught this class of bug, and it is the follow-up
// this rewrite should be paired with. Until then, treat every assertion in this
// file as "the code still has the shape we reasoned about", not "the URLs are
// right".
//
// Self-skips when the files aren't at the module-relative path (a consumer
// build, where the module lives under hugo_cache rather than ../layouts).

const RESOLVE_LINK = path.resolve(
  __dirname,
  "../layouts/_partials/utils/resolve-link.html",
);
const VERSION_ROOT = path.resolve(
  __dirname,
  "../layouts/_partials/utils/version-root.html",
);
const PAGE_CONTEXT = path.resolve(
  __dirname,
  "../layouts/_partials/utils/page-context.html",
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
    !fs.existsSync(RESOLVE_LINK) ||
      !fs.existsSync(VERSION_ROOT) ||
      !fs.existsSync(PAGE_CONTEXT),
    "partials not at the module-relative path (consumer build)",
  );

  test("version-root.html tries every language-shifted version position", () => {
    const src = activeSrc(VERSION_ROOT);

    // The candidate-position list is what makes the shape tolerant:
    //   2  /<product>/<version>/
    //   3  /<product>/<lang>/<version>/          or  /<product>/<section>/<version>/
    //   4  /<product>/<lang>/<section>/<version>/
    //   1  local dev
    // Dropping 3 breaks localized pages; dropping 4 breaks localized pages of a
    // product that also uses sections, which is how agentgateway ja produced
    // 831 "could not infer a version" warnings in a single build.
    for (const pos of [3, 4]) {
      expect(
        new RegExp(
          `\\$candidatePositions\\s*=\\s*\\$candidatePositions\\s*\\|\\s*append\\s+${pos}\\b`,
        ).test(src),
        `version-root.html no longer tries segment ${pos} as a version ` +
          `candidate — permalinks of that shape can't infer a version, so ` +
          `their links fall back to \`latest\` and lose the language.`,
      ).toBe(true);
    }
  });

  test("resolve-link.html strips the baseURL path but KEEPS the language prefix", () => {
    const src = activeSrc(RESOLVE_LINK);

    // It must delegate rather than re-derive. If a second segment walk ever
    // reappears here, the two implementations drift — which is the bug class
    // this consolidation removed.
    const rootCallIdx = src.search(/partial\s+"utils\/version-root\.html"/);
    expect(
      rootCallIdx,
      "resolve-link.html no longer calls utils/version-root.html — version " +
        "inference has been re-forked, so it can drift from the sidebar/navbar.",
    ).toBeGreaterThan(-1);

    // The baseURL path MUST be stripped, or the hub doubles its product segment.
    expect(
      /replaceRE\s+`\^https\?:\/\/\[\^\/\]\*`\s+""\s+\.Site\.BaseURL/.test(src),
      "the baseURL path is no longer derived from `.Site.BaseURL` — " +
        "version-root.html returns a published-URL prefix that already " +
        "contains the product, and the assembly step re-prepends baseURL, so " +
        "hub links come out as /kgateway/kgateway/2.1.x/….",
    ).toBe(true);

    // The language prefix must NOT be. `.Site.BaseURL` does not carry it, and
    // the local/localhost assembly branch drops baseURL entirely, so anything
    // stripped here is gone for good and the link resolves into the default
    // language. This is the assertion that was inverted; see the header.
    expect(
      /strings\.TrimPrefix\s+\.\s+\$versionRoot/.test(
        src.slice(src.search(/\.Site\.LanguagePrefix/)),
      ) && src.search(/\.Site\.LanguagePrefix/) > -1,
      "resolve-link.html strips `.Site.LanguagePrefix` off the version root. " +
        "`.Site.BaseURL` is the configured base and does NOT carry the " +
        "language, and the local/localhost branch drops baseURL entirely, so " +
        "the segment never comes back: every link on a translated page points " +
        "into the default-language tree.",
    ).toBe(false);
  });

  test("page-context.html carries the language into the prefix it rebuilds", () => {
    const src = activeSrc(PAGE_CONTEXT);

    // `prefix` feeds {{< card >}}. Unlike a permalink it is REBUILT from
    // params (folder + section + version), so the language has to be spliced
    // back in explicitly or every card on a translated page links to English.
    expect(
      /\.Site\.LanguagePrefix/.test(src),
      "page-context.html no longer reads `.Site.LanguagePrefix` — the prefix " +
        "it rebuilds from folder/section/version drops the language segment, " +
        "so every {{< card >}} on a translated page links to the English copy.",
    ).toBe(true);

    // It must reach $prefix, not merely be assigned to a dead variable.
    expect(
      /\$prefix\s*=\s*printf\s+"\/%s%s/.test(src),
      "`$prefix` is no longer built with the language segment interpolated " +
        "directly after the folder — the value is computed but never used.",
    ).toBe(true);
  });
});
