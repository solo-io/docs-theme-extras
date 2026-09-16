import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// A link shortcode must keep the baseURL PATH in dev, not just in production.
//
// WHY THIS EXISTS. utils/resolve-link.html assembles the final URL in two
// branches:
//
//   {{ if or (eq .Site.BaseURL "/") (in .Site.BaseURL "localhost") }}
//
// The local branch emits a root-relative URL, which is right. What it used to
// emit was $versionRoot ALONE — and $versionRoot arrives baseURL-relative,
// because the strip further up removes the baseURL path from it precisely so
// the assembly can re-supply it. The else branch re-supplied it, by prepending
// .Site.BaseURL whole. The local branch prepended nothing, so the path vanished.
//
// Both branches now share ONE assembled path ($rel) and differ only in whether
// an origin is prefixed, so that particular divergence can no longer be
// written. This spec is what holds that: it is the only build in the matrix
// where the two branches would produce different paths if they ever came apart
// again.
//
// That is invisible to every other config in this repo: they are all path-only
// ("/test", "/"), where the path component is either the whole baseURL or
// empty and the two branches agree. It is NOT invisible to consumers. kagent.dev
// sets baseURL = "https://kagent.dev/docs/"; under `hugo server` Hugo rewrites
// the origin and keeps the path, .Site.BaseURL becomes
// http://localhost:1313/docs/, this branch fires, and every link shortcode
// rendered /kagent/1.x/… instead of /docs/kagent/1.x/… — 8 dead links on one
// page, every one of them correct in the production build. Authors saw 404s in
// preview on links that were fine, which invites "fixing" correct content.
//
// A link checker cannot cover this gap either: remaps resolve both the correct
// and the truncated form to the same file on disk, so the truncated one reads
// as valid.
//
// Fixtures: hugo-{oss,flat}-devpath.toml and hugo-{oss,flat}-protorel.toml,
// static builds at the two baseURL shapes a dev server produces (see
// VERSIONED_BUILDS below for why there are two). The versioned ones reuse the
// marker page that link-hextra-shapes.spec.ts asserts against, so the shapes
// stay pinned in one place and this spec only pins the PREFIX.
//
// BOTH HALVES OF THE SPLIT. resolve-link.html derives $versionRoot two ways —
// version-root.html on a versioned site, .Page.FirstSection.RelPermalink on a
// version-less one — and the assembly re-supplies the baseURL path to whatever
// it gets. Only the versioned derivation used to strip that path first, so the
// flat one doubled it: /docs/docs/<section>/…, in production as well as in dev,
// on any flat site whose baseURL carries a subpath (kagent's shape, and the
// shape hugo-flat.toml deliberately mirrors). The versioned fixture cannot see
// that — different branch, different source — so the flat builds below are the
// other half of this spec, not a nice-to-have.

// TWO DEV-SERVER SHAPES, NOT ONE. `hugo server` does not rewrite every baseURL
// the same way, and the difference is not cosmetic:
//
//   baseURL "https://kagent.dev/docs/"  →  http://localhost:1313/docs/
//   baseURL "/test"                     →  //localhost:1313///test/
//
// It rewrites an origin when there is one and manufactures a PROTOCOL-RELATIVE
// base when there is not. Both take the local branch of the assembly, and both
// have to survive the origin cut that yields $baseURLPath — but the second one
// leaves "///test" where $versionRoot carries Hugo's normalized "/test", so the
// TrimPrefix misses, the assembly re-supplies the path anyway, and every link
// comes out /test/test/v2/…. resolve-link.html collapses the repeated slashes
// for exactly this reason; these builds are what says so.
//
// The protocol-relative shape is the one this repo's OWN hugo-oss.toml has
// (baseURL = "/test"), which is worth sitting with: `make server-oss` misses it
// only because hugo-oss-local.toml overrides baseURL to "/", and a static build
// of a path-only baseURL cannot reach it either (no origin to cut, so the path
// is the whole value and the cut is a no-op). It is reachable only from a dev
// server, which is why it needs a config that spells it out literally.
const VERSIONED_BUILDS = [
  { name: "public-oss-devpath (full base + path)", dir: "public-oss-devpath" },
  {
    name: "public-oss-protorel (protocol-relative base)",
    dir: "public-oss-protorel",
  },
];

function versionedPage(dir: string): string {
  return path.join(
    __dirname,
    "..",
    dir,
    "test",
    "v2",
    "link-hextra-shapes",
    "index.html",
  );
}

// The version-less builds, all of which carry a subpath baseURL:
//   public-flat           baseURL "/docs"                      → production branch
//   public-flat-devpath   baseURL "http://localhost:1313/docs/" → local branch
//   public-flat-protorel  baseURL "//localhost:1313///docs/"    → local branch, protocol-relative
// One page, one `link` call (fixture/content-flat/en/alpha/first.md). Listing
// all three is the point: the bug took the local branch, the doubling it
// exposed took the production one, the doubling the origin cut caused took the
// local one again by a different route, and a fix to any one alone leaves the
// others wrong.
const FLAT_BUILDS = [
  { name: "public-flat (production branch)", dir: "public-flat" },
  { name: "public-flat-devpath (local branch)", dir: "public-flat-devpath" },
  {
    name: "public-flat-protorel (protocol-relative base)",
    dir: "public-flat-protorel",
  },
];

function flatPage(dir: string): string {
  return path.join(__dirname, "..", dir, "alpha", "first", "index.html");
}

// Every shape the fixture page emits. All of them resolve to a real page —
// including SHAPE_NO_LEADING, which link-hextra-shapes.spec.ts pins at the same
// /test/v2/everything/ as the canonical form because resolve-link.html
// normalizes a missing leading slash before assembly. The prefix has to survive
// on every shape, not just the well-formed ones: the normalizations upstream
// (leading slash, doubled slash, explicit version, bare fragment) all rewrite
// $path, and a rewrite that ran after the prefix was applied would show up here
// and nowhere else.
const MARKERS = [
  "SHAPE_CANONICAL",
  "SHAPE_NO_TRAILING",
  "SHAPE_NESTED",
  "SHAPE_FRAGMENT",
  "SHAPE_FRAGMENT_BARE",
  "SHAPE_EXPLICIT_V1",
  "SHAPE_NO_LEADING",
  "SHAPE_DOUBLE_SLASH",
];

function hrefFor(html: string, marker: string): string | null {
  const m = html.match(
    new RegExp(`href=["']?([^"' >]+)["']?[^>]*>${marker}\\b`),
  );
  return m ? m[1] : null;
}

test.describe("dev-server baseURL keeps its path", () => {
  for (const b of VERSIONED_BUILDS) {
    test(`${b.name}: every link shortcode href carries the baseURL path`, () => {
      const file = versionedPage(b.dir);
      test.skip(
        !fs.existsSync(file),
        `${b.dir} not built — run \`make build-devpath\` first`,
      );

      const html = fs.readFileSync(file, "utf8");
      const offenders: string[] = [];

      for (const marker of MARKERS) {
        const href = hrefFor(html, marker);
        expect(href, `${marker} emitted no href`).not.toBeNull();
        // Root-relative and under /test/ is the whole assertion. An absolute URL
        // would also work in a browser, so accept either origin-ful or bare, and
        // pin only that the path segment survived. The origin strip here also
        // takes a protocol-relative one (//host), which is what the protorel
        // build would emit if the assembly ever prefixed $origin on it.
        const p = href!.replace(/^(https?:)?\/\/[^/]*/, "");
        if (!p.startsWith("/test/")) offenders.push(`${marker} -> ${href}`);
      }

      expect(
        offenders,
        `${b.dir}: these hrefs lost the baseURL path. resolve-link.html assembles\n` +
          "$rel ONCE, from $baseURLPath + $versionRoot + version + path, and both\n" +
          "branches emit it — the else branch only adds an origin. If this fails,\n" +
          "either the two branches have come apart again or $baseURLPath is being\n" +
          "stripped from $versionRoot without being re-supplied here.\n" +
          offenders.join("\n"),
      ).toEqual([]);
    });

    test(`${b.name}: the version segment still follows the baseURL path`, () => {
      const file = versionedPage(b.dir);
      test.skip(
        !fs.existsSync(file),
        `${b.dir} not built — run \`make build-devpath\` first`,
      );

      // Guards the obvious wrong fix: prepending the path twice, or prepending it
      // to a $versionRoot that never had it stripped, yields /test/test/v2/.
      // That is exactly what the protocol-relative build produced while
      // $baseURLPath could come back as "///test" — the strip missed and the
      // assembly re-supplied anyway — so this case is not a duplicate of the
      // devpath one above, it is the reason the slash collapse exists.
      const href = hrefFor(fs.readFileSync(file, "utf8"), "SHAPE_CANONICAL");
      expect(href).not.toBeNull();
      expect(href!.replace(/^(https?:)?\/\/[^/]*/, "")).toBe(
        "/test/v2/everything/",
      );
    });
  }
});

test.describe("version-less site: the baseURL path appears once, not twice", () => {
  for (const b of FLAT_BUILDS) {
    test(`${b.name}`, () => {
      const file = flatPage(b.dir);
      test.skip(
        !fs.existsSync(file),
        `${b.dir} not built — run \`make build-flat build-devpath\` first`,
      );

      const href = hrefFor(fs.readFileSync(file, "utf8"), "PROBE_FLAT_LINK");
      expect(href, "PROBE_FLAT_LINK emitted no href").not.toBeNull();
      const p = href!.replace(/^(https?:)?\/\/[^/]*/, "");

      // Two assertions, because each one alone passes on a different bug. The
      // first fails when the path is dropped (what the versioned half of this
      // spec catches); the second fails when it is applied twice, which is what
      // happens if the assembly re-supplies a path that $versionRoot never had
      // stripped. Only the prefix is pinned — see the header.
      expect(p, `${b.dir}: baseURL path missing from ${href}`).toMatch(
        /^\/docs\//,
      );
      expect(
        p.startsWith("/docs/docs/"),
        `${b.dir}: baseURL path applied twice — ${href}. The version-less\n` +
          "branch of resolve-link.html must strip $baseURLPath from\n" +
          ".Page.FirstSection.RelPermalink, the same way the versioned branch\n" +
          "strips it from version-root.html's versionBase.",
      ).toBe(false);
    });
  }
});
