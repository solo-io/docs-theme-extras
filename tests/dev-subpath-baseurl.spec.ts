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

const BUILT = path.join(
  __dirname,
  "..",
  "public-oss-devpath",
  "test",
  "v2",
  "link-hextra-shapes",
  "index.html",
);

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
