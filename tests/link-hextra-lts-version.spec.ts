import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for link-hextra's version inference.
//
// link-hextra works out which version tree a link belongs to by reading the
// current page's permalink. Two things have to hold, and both have broken
// before:
//
//  1. FULLY QUALIFIED (LTS) VERSIONS MUST INFER. The pattern originally accepted
//     only `X.Y.x` (2.3.x), `latest` and `main`. When a product shipped an LTS
//     tree (`/agentgateway/2026.7.1/…`) inference fell through to the "latest"
//     fallback: every reuse-nested link on those pages pointed at `/latest/…`
//     and the build emitted a `link-hextra called with no version` WARN for each
//     (which hugo-warnings.spec.ts fails on).
//
//  2. THE VERSION ROOT MUST SURVIVE. Inference used to be two regexes, one
//     anchored to a known product name (`kgateway|agentgateway|gateway|envoy`)
//     and one anchored to the start of the URL. Between them they recognized
//     only the docs hub's URL shape. An OSS site serves
//     `/docs/standalone/latest/…` and `/docs/envoy/2.1.x/…`, where no segment is
//     a product name and the version is not first — so agentgateway.dev could
//     not infer a version at all, and kgateway.dev inferred the version but lost
//     the `/docs/envoy` prefix, emitting `/2.1.x/quickstart/` for a page that
//     lives at `/docs/envoy/2.1.x/quickstart/`. Measured: 637 pages of 404s on
//     kgateway.dev, 913 on agentgateway.dev. That is why both repos forked this
//     file. Inference is now a segment walk that also records everything before
//     the version segment as the version root.
//
// Why a SOURCE check, not a rendered-output check: the bundled fixture has no
// LTS tree and no `/docs/<flavor>/` prefix, and adding either shifts the page
// URLs the rest of the suite asserts on. So this extracts the version pattern
// from the shipped shortcode and exercises it, plus mirrors the segment walk to
// pin the derived (version, root) for each real-world URL shape. Self-skips when
// the file isn't at the module-relative path (a consumer build, where the module
// lives under hugo_cache rather than ../layouts).

const SHORTCODE = path.resolve(
  __dirname,
  "../layouts/_shortcodes/link-hextra.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so the assertions match
// ACTIVE code, not the explanatory comments (which also spell out version
// patterns and example URLs).
function activeSrc(): string {
  return fs
    .readFileSync(SHORTCODE, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

/** The per-segment version pattern, as written in the template. */
function versionPattern(src: string): RegExp {
  const m = src.match(/findRE\s+`(\^\(\?:[^`]*)`/);
  expect(
    m,
    "per-segment version `findRE` not found — the shortcode changed shape; " +
      "re-check that version inference still exists.",
  ).not.toBeNull();
  // Go's regexp is RE2, but this pattern uses only constructs JS shares.
  return new RegExp(m![1]);
}

/**
 * Mirror of the template's segment walk: find the first path segment that looks
 * like a version, and return it plus everything before it.
 *
 * Kept in step with `layouts/_shortcodes/link-hextra.html` by construction — the
 * regex is read out of that file rather than duplicated here, so the two cannot
 * drift on the part that actually decides what counts as a version.
 */
function derive(relURL: string, re: RegExp): { ver: string; root: string } {
  const segs = relURL.replace(/^\//, "").split("/");
  const i = segs.findIndex((s) => re.test(s));
  if (i < 0) return { ver: "", root: "" };
  return { ver: segs[i], root: i > 0 ? "/" + segs.slice(0, i).join("/") : "" };
}

test.describe("link-hextra version inference", () => {
  test.skip(
    !fs.existsSync(SHORTCODE),
    "link-hextra.html not at the module-relative path (consumer build)",
  );

  test("the version pattern accepts X.Y.Z as well as X.Y.x", () => {
    const re = versionPattern(activeSrc());
    for (const v of ["2026.7.1", "2.3.x", "1.1.x", "latest", "main"]) {
      expect(
        re.test(v),
        `\`${v}\` is not recognized as a version — links on that tree fall ` +
          "back to `latest` and the build WARNs.",
      ).toBe(true);
    }
  });

  // Without anchoring, `docs` or `kubernetes` could be mistaken for a version
  // and the walk would stop at the wrong segment, taking the version root with
  // it. `mainline` is the specific trap: it starts with `main`.
  test("the version pattern rejects ordinary path segments", () => {
    const re = versionPattern(activeSrc());
    for (const s of ["docs", "envoy", "standalone", "kubernetes", "reference", "mainline", "latest-news"]) {
      expect(re.test(s), `\`${s}\` was mistaken for a version segment`).toBe(false);
    }
  });

  test("derives the version and root for every real URL shape", () => {
    const re = versionPattern(activeSrc());
    const CASES: Array<[string, string, string, string]> = [
      // permalink (after baseURL + language strip), version, root, who
      ["/2.1.x/quickstart/", "2.1.x", "", "docs hub, product in baseURL"],
      ["/kgateway/2.1.x/quickstart/", "2.1.x", "/kgateway", "docs hub, full build"],
      ["/2026.7.1/security/waf/overview/", "2026.7.1", "", "docs hub, LTS tree"],
      ["/docs/envoy/2.1.x/quickstart/", "2.1.x", "/docs/envoy", "kgateway.dev"],
      ["/docs/standalone/latest/operations/debug/", "latest", "/docs/standalone", "agentgateway.dev"],
      ["/docs/kubernetes/1.1.x/llm/streaming/", "1.1.x", "/docs/kubernetes", "agentgateway.dev"],
      ["/kgateway/main/security/waf/overview/", "main", "/kgateway", "docs hub, main"],
    ];
    for (const [url, ver, root, who] of CASES) {
      expect(derive(url, re), `${who}: ${url}`).toEqual({ ver, root });
    }
  });

  // The hub is the case that must NOT change: its baseURL carries the product
  // and the shortcode strips that prefix before inference, so the root comes out
  // empty and the emitted URL is what it always was. If this ever produces a
  // non-empty root, every hub link gains a duplicated product segment.
  test("the docs hub derives an EMPTY root, so its URLs are unchanged", () => {
    const re = versionPattern(activeSrc());
    for (const url of ["/2.1.x/foo/", "/latest/foo/", "/main/foo/", "/2026.7.1/foo/"]) {
      expect(derive(url, re).root, `${url} must yield no version root`).toBe("");
    }
  });

  test("a permalink with no version segment infers nothing, so the fallback WARNs", () => {
    const re = versionPattern(activeSrc());
    expect(derive("/docs/envoy/", re)).toEqual({ ver: "", root: "" });
  });

  test("the version alternation is not narrowed back to X.Y.x only", () => {
    const src = activeSrc();
    const narrowed = src.match(/findRE\s+`[^`]*\\d\+\\\.\\d\+\\\.x[|)]/g) ?? [];
    expect(
      narrowed,
      "the version pattern still accepts only `\\d+\\.\\d+\\.x` — fully " +
        "qualified LTS versions (e.g. 2026.7.1) will not infer.",
    ).toEqual([]);
  });
});
