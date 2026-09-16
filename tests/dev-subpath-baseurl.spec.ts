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
// the assembly can re-supply it. The else branch re-supplies it. The local
// branch did not, so the path vanished.
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
// Fixture: hugo-oss-devpath.toml, a static build at the dev-server baseURL
// shape. Reuses the marker page that link-hextra-shapes.spec.ts asserts against,
// so the shapes stay pinned in one place and this spec only pins the PREFIX.
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

const BUILT = path.join(
  __dirname,
  "..",
  "public-oss-devpath",
  "test",
  "v2",
  "link-hextra-shapes",
  "index.html",
);

// The version-less builds, both of which carry a subpath baseURL:
//   public-flat          baseURL "/docs"                    → production branch
//   public-flat-devpath  baseURL "http://localhost:1313/docs/" → local branch
// One page, one `link` call (fixture/content-flat/en/alpha/first.md). Listing
// both is the point: the bug took the local branch, the doubling it exposed
// took the production one, and a fix to either alone leaves the other wrong.
const FLAT_BUILDS = [
  { name: "public-flat (production branch)", dir: "public-flat" },
  { name: "public-flat-devpath (local branch)", dir: "public-flat-devpath" },
];

function flatPage(dir: string): string {
  return path.join(__dirname, "..", dir, "alpha", "first", "index.html");
}

// Shapes that resolve to a real page. SHAPE_NO_LEADING is deliberately omitted:
// link-hextra-shapes.spec.ts pins it as broken, and a broken shape says nothing
// about the prefix.
const MARKERS = [
  "SHAPE_CANONICAL",
  "SHAPE_NO_TRAILING",
  "SHAPE_NESTED",
  "SHAPE_FRAGMENT",
  "SHAPE_FRAGMENT_BARE",
  "SHAPE_EXPLICIT_V1",
  "SHAPE_DOUBLE_SLASH",
];

function hrefFor(html: string, marker: string): string | null {
  const m = html.match(
    new RegExp(`href=["']?([^"' >]+)["']?[^>]*>${marker}\\b`),
  );
  return m ? m[1] : null;
}

const built = fs.existsSync(BUILT);

test.describe("dev-server baseURL keeps its path", () => {
  test.skip(
    !built,
    "public-oss-devpath not built — run `make build-oss-devpath` first",
  );

  test("every link shortcode href carries the baseURL path", () => {
    const html = fs.readFileSync(BUILT, "utf8");
    const offenders: string[] = [];

    for (const marker of MARKERS) {
      const href = hrefFor(html, marker);
      expect(href, `${marker} emitted no href`).not.toBeNull();
      // Root-relative and under /test/ is the whole assertion. An absolute URL
      // would also work in a browser, so accept either origin-ful or bare, and
      // pin only that the path segment survived.
      const p = href!.replace(/^https?:\/\/[^/]*/, "");
      if (!p.startsWith("/test/")) offenders.push(`${marker} -> ${href}`);
    }

    expect(
      offenders,
      "These hrefs lost the baseURL path. resolve-link.html's local branch must\n" +
        "prepend the path component of .Site.BaseURL, not drop .Site.BaseURL whole.\n" +
        offenders.join("\n"),
    ).toEqual([]);
  });

  test("the version segment still follows the baseURL path", () => {
    const html = fs.readFileSync(BUILT, "utf8");
    // Guards the obvious wrong fix: prepending the path twice, or prepending it
    // to a $versionRoot that never had it stripped, yields /test/test/v2/.
    const href = hrefFor(html, "SHAPE_CANONICAL");
    expect(href).not.toBeNull();
    expect(href!.replace(/^https?:\/\/[^/]*/, "")).toBe("/test/v2/everything/");
  });
});

test.describe("version-less site: the baseURL path appears once, not twice", () => {
  for (const b of FLAT_BUILDS) {
    test(`${b.name}`, () => {
      const file = flatPage(b.dir);
      test.skip(
        !fs.existsSync(file),
        `${b.dir} not built — run \`make build-flat build-oss-devpath\` first`,
      );

      const href = hrefFor(fs.readFileSync(file, "utf8"), "PROBE_FLAT_LINK");
      expect(href, "PROBE_FLAT_LINK emitted no href").not.toBeNull();
      const p = href!.replace(/^https?:\/\/[^/]*/, "");

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
