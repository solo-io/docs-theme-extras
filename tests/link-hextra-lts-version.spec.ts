import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for version inference — the "which version tree is this
// page in" step that link-hextra, the sidebar, the navbar, the docs-tabs band
// and the version banner all now share.
//
// Three things have to hold, and all three have broken before:
//
//  1. FULLY QUALIFIED (LTS) VERSIONS MUST INFER. The pattern originally accepted
//     only `X.Y.x` (2.3.x), `latest` and `main`. When a product shipped an LTS
//     tree (`/agentgateway/2026.7.1/…`) inference fell through to the "latest"
//     fallback: every reuse-nested link on those pages pointed at `/latest/…`
//     and the build emitted a `link-hextra called with no version` WARN for each
//     (which hugo-warnings.spec.ts fails on). It regressed a SECOND time when
//     inference moved into version-root.html, whose own copy of the pattern was
//     the narrow `^[0-9]+\.[0-9]+\.x$` — caught only by this file.
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
//     kgateway.dev, 913 on agentgateway.dev. That is why both repos forked
//     link-hextra.
//
//  3. THE PATTERN MUST BE SINGLE-SOURCED. It is used by both URL-shape branches
//     in version-root.html. It was written out twice, and the copies diverged.
//
// Why SOURCE checks, not rendered-output checks: the bundled fixture has no LTS
// tree and no `/docs/<flavor>/` prefix, and adding either shifts the page URLs
// the rest of the suite asserts on. So this extracts the version pattern from
// the shipped resolver and exercises it, plus mirrors the resolver's candidate
// walk to pin the derived (version, root) for each real-world URL shape.
// Self-skips when the file isn't at the module-relative path (a consumer build,
// where the module lives under hugo_cache rather than ../layouts).

const RESOLVER = path.resolve(
  __dirname,
  "../layouts/_partials/utils/version-root.html",
);

// Strip Go/Hugo template comments (`{{- /* … */ -}}`) so the assertions match
// ACTIVE code, not the explanatory comments (which also spell out version
// patterns and example URLs).
function activeSrc(): string {
  return fs
    .readFileSync(RESOLVER, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

/**
 * The version-shape pattern, read out of the single variable the resolver
 * declares it in. Reading it (rather than restating it here) is what keeps this
 * file honest: the assertions below exercise the pattern that actually ships.
 */
function versionPattern(src: string): RegExp {
  const m = src.match(/\$versionShapeRE\s*:=\s*`([^`]*)`/);
  expect(
    m,
    "`$versionShapeRE` not found in version-root.html — the resolver changed " +
      "shape; re-check that a single-sourced version pattern still exists.",
  ).not.toBeNull();
  // Go's regexp is RE2, but this pattern uses only constructs JS shares.
  return new RegExp(m![1]);
}

/**
 * Mirror of version-root.html's candidate walk.
 *
 * NOT a generic "first segment that looks like a version" scan — the resolver is
 * positional, and the distinction matters. It branches on whether segment 1 is
 * `docs`:
 *
 *   OSS shape        /docs/<section>/<version>/…   version at 3 ONLY
 *   Enterprise shape /<product>/<version>/…        version at 2, then 3
 *                                                  (language-shifted), then 1
 *                                                  (local dev, baseURL=/)
 *
 * The root is every segment before the matched one. Kept in step with the
 * template by construction on the part that decides what counts as a version:
 * the regex is read out of the file rather than duplicated.
 */
function derive(relURL: string, re: RegExp): { ver: string; root: string } {
  const segs = relURL.split("/"); // leading "" preserved, as in the template
  const at = (i: number) => (i < segs.length ? segs[i] : "");
  const found = (i: number) => ({
    ver: at(i),
    root: segs.slice(0, i).join("/"),
  });

  if (segs.length >= 4 && at(1) === "docs") {
    return re.test(at(3)) ? found(3) : { ver: "", root: "" };
  }
  if (segs.length >= 2 && at(1) !== "") {
    const candidates = [
      ...(segs.length >= 3 ? [2] : []),
      ...(segs.length >= 4 ? [3] : []),
      1,
    ];
    for (const i of candidates) {
      if (re.test(at(i))) return found(i);
    }
  }
  return { ver: "", root: "" };
}

test.describe("version inference", () => {
  test.skip(
    !fs.existsSync(RESOLVER),
    "version-root.html not at the module-relative path (consumer build)",
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
    for (const s of [
      "docs",
      "envoy",
      "standalone",
      "kubernetes",
      "reference",
      "mainline",
      "latest-news",
    ]) {
      expect(re.test(s), `\`${s}\` was mistaken for a version segment`).toBe(
        false,
      );
    }
  });

  test("derives the version and root for every real URL shape", () => {
    const re = versionPattern(activeSrc());
    const CASES: Array<[string, string, string, string]> = [
      // permalink, version, root, who
      ["/2.1.x/quickstart/", "2.1.x", "", "docs hub local dev, baseURL=/"],
      ["/kgateway/2.1.x/quickstart/", "2.1.x", "/kgateway", "docs hub"],
      ["/2026.7.1/security/waf/overview/", "2026.7.1", "", "docs hub, LTS tree"],
      [
        "/agentgateway/2026.7.1/security/waf/",
        "2026.7.1",
        "/agentgateway",
        "docs hub, LTS tree, product segment",
      ],
      [
        "/kgateway/ja/2.1.x/quickstart/",
        "2.1.x",
        "/kgateway/ja",
        "docs hub, localized",
      ],
      ["/docs/envoy/2.1.x/quickstart/", "2.1.x", "/docs/envoy", "kgateway.dev"],
      [
        "/docs/standalone/latest/operations/debug/",
        "latest",
        "/docs/standalone",
        "agentgateway.dev",
      ],
      [
        "/docs/kubernetes/1.1.x/llm/streaming/",
        "1.1.x",
        "/docs/kubernetes",
        "agentgateway.dev",
      ],
      ["/kgateway/main/security/waf/overview/", "main", "/kgateway", "docs hub, main"],
    ];
    for (const [url, ver, root, who] of CASES) {
      expect(derive(url, re), `${who}: ${url}`).toEqual({ ver, root });
    }
  });

  // The hub in LOCAL DEV is the case that must not gain a root: baseURL is `/`,
  // so the version is the first segment and there is nothing before it. (In a
  // production hub build the root comes out as `/<product>`, which
  // resolve-link.html then strips back off — see link-hextra-lang-prefix.spec.ts.
  // If that strip is dropped, every hub link gains a duplicated product
  // segment.)
  test("a version-first permalink derives an EMPTY root", () => {
    const re = versionPattern(activeSrc());
    for (const url of [
      "/2.1.x/foo/",
      "/latest/foo/",
      "/main/foo/",
      "/2026.7.1/foo/",
    ]) {
      expect(derive(url, re).root, `${url} must yield no version root`).toBe("");
    }
  });

  test("a permalink with no version segment infers nothing, so the fallback WARNs", () => {
    const re = versionPattern(activeSrc());
    expect(derive("/docs/envoy/", re)).toEqual({ ver: "", root: "" });
  });

  test("the version alternation is not narrowed back to X.Y.x only", () => {
    const re = versionPattern(activeSrc());
    expect(
      re.test("2026.7.1"),
      "the version pattern accepts only `X.Y.x` — fully qualified LTS " +
        "versions (e.g. 2026.7.1) will not infer.",
    ).toBe(true);
  });

  test("the version pattern is declared once, not per URL-shape branch", () => {
    const src = activeSrc();
    // Each branch must USE the shared variable …
    const uses = src.match(/findRE\s+\$versionShapeRE\b/g) ?? [];
    expect(
      uses.length,
      "expected both URL-shape branches to call `findRE $versionShapeRE`",
    ).toBeGreaterThanOrEqual(2);
    // … and no branch may inline its own literal pattern alongside it.
    const inlined = src.match(/findRE\s+`[^`]*`/g) ?? [];
    expect(
      inlined,
      "an inline version pattern reappeared next to the shared " +
        "`$versionShapeRE` — the two copies diverged last time (one kept the " +
        "narrow X.Y.x form and broke LTS inference).",
    ).toEqual([]);
  });
});
