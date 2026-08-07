import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";

// What `path` may contain, and what each shape emits.
//
// WHY THIS EXISTS. link-hextra had 16 tests across three files and not one of
// them covered its INPUT CONTRACT. The existing specs pin path REWRITING
// (`reference/api` routed to enterprise subpages, cel subpages collapsed) and
// version inference — both of which assume you already know what a valid `path`
// looks like. Nothing said whether a leading slash is required, what an anchor
// does, or what happens if you pass the wrong argument name. USAGE.md had one
// sentence about the shortcode and no parameter list.
//
// The cost of that gap, measured: two agentgateway.dev pages called
// `{{< link-hextra link="https://…" >}}`. `link` is not a parameter on any copy
// of this shortcode, so `path` was empty and the emitted href was the bare
// version root — a real page, so nothing 404'd and nobody noticed the link went
// somewhere else for months.
//
// So this spec is deliberately about SHAPES rather than routing rules, and it
// pins the broken shapes as well as the working ones. A test that only shows the
// happy path is what left the contract undiscoverable in the first place.
//
// Fixture: fixture/content/en/test/v2/link-hextra-shapes.md. Every call passes
// `version="v2"` explicitly, because the fixture's URL pattern (`/test/v2/`) has
// no segment that looks like a version, so inference would warn and
// hugo-warnings.spec.ts would fail. Inference is covered separately in
// link-hextra-lts-version.spec.ts.

const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "link-hextra-shapes", "index.html");
// Fixture-only page, deliberately not in CONFIG [[pages]].
const IS_FIXTURE_TARGET = fs.existsSync(PAGE);

/** href for a given SHAPE_* marker on the fixture page. */
function hrefFor(html: string, marker: string): string | null {
  const re = new RegExp(
    `href=["']?([^"' >]+)["']?[^>]*>${marker}\\b`,
  );
  return html.match(re)?.[1] ?? null;
}

test.describe("link-hextra path shapes", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");

  const html = () => readFixture(PAGE);

  test("the fixture page rendered and carries every marker", () => {
    const h = html();
    for (const m of [
      "SHAPE_CANONICAL", "SHAPE_NO_TRAILING", "SHAPE_NESTED",
      "SHAPE_FRAGMENT", "SHAPE_FRAGMENT_BARE", "SHAPE_EXPLICIT_V1",
      "SHAPE_NO_LEADING", "SHAPE_DOUBLE_SLASH",
    ]) {
      expect(hrefFor(h, m), `${m} produced no href — the page or the marker moved`).not.toBeNull();
    }
  });

  test("an absolute path with both slashes is emitted unchanged", () => {
    expect(hrefFor(html(), "SHAPE_CANONICAL")).toBe("/test/v2/everything/");
  });

  // A trailing slash is appended so the link does not eat a 301.
  test("a missing trailing slash is added", () => {
    expect(hrefFor(html(), "SHAPE_NO_TRAILING")).toBe("/test/v2/everything/");
  });

  test("a nested path keeps its structure", () => {
    expect(hrefFor(html(), "SHAPE_NESTED")).toBe(
      "/test/v2/reference/api-kubespec/policies/",
    );
  });

  // No trailing slash is appended after a fragment — `/page/#a/` would not
  // resolve to the anchor.
  test("a fragment suppresses the trailing slash", () => {
    expect(hrefFor(html(), "SHAPE_FRAGMENT")).toBe("/test/v2/everything/#a-heading");
  });

  // Documents a real sharp edge: the slash-append is skipped for ANY path
  // containing "#", so a fragment on a slashless path stays slashless and the
  // browser takes a redirect before it can scroll. Authors should write the
  // trailing slash themselves before the "#".
  test("a fragment on a slashless path stays slashless (takes a redirect)", () => {
    expect(hrefFor(html(), "SHAPE_FRAGMENT_BARE")).toBe("/test/v2/everything#a-heading");
  });

  // This is the mechanism `rebase` uses to retarget a link into another version
  // tree; if it stopped working, cross-version links would silently follow the
  // page they are on.
  test("an explicit version overrides inference", () => {
    expect(hrefFor(html(), "SHAPE_EXPLICIT_V1")).toBe("/test/v1/everything/");
  });

  // PINNED AS BROKEN, not as desired behavior. `path` must start with a slash:
  // without one the version segment and the path fuse into `/test/v2everything/`.
  // Nothing warns. If someone makes this emit a valid URL, delete this test —
  // but do it deliberately, because the fix changes every call site that
  // currently compensates.
  test("a path with no leading slash fuses with the version and breaks", () => {
    expect(
      hrefFor(html(), "SHAPE_NO_LEADING"),
      "if this now resolves, `path` no longer requires a leading slash — " +
        "update USAGE.md and remove this test",
    ).toBe("/test/v2everything/");
  });

  test("a doubled slash is collapsed", () => {
    expect(hrefFor(html(), "SHAPE_DOUBLE_SLASH")).toBe("/test/v2/everything/");
  });
});

// The input contract itself, read off the shipped template. These are cheap and
// catch the "wrong argument name" class of bug that motivated the whole spec.
test.describe("link-hextra parameter contract", () => {
  test("takes exactly path, version and product — no link/url/href", () => {
    const file = path.resolve(__dirname, "../layouts/_shortcodes/link-hextra.html");
    test.skip(!fs.existsSync(file), "module-relative path only");
    const src = fs
      .readFileSync(file, "utf8")
      .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");

    const params = [...src.matchAll(/\.Get\s+"([a-zA-Z]+)"/g)].map((m) => m[1]);
    expect([...new Set(params)].sort()).toEqual(["path", "product", "version"]);

    // An external URL is not a supported input: there is no parameter to pass
    // one through, and there would be nothing to resolve if there were. Use a
    // plain markdown link. This assertion is what makes that discoverable.
    for (const bogus of ["link", "url", "href", "to"]) {
      expect(
        params,
        `\`${bogus}=\` looks like it would work but is not read — if it is ` +
          "being added, document it in USAGE.md at the same time",
      ).not.toContain(bogus);
    }
  });

  test("an empty path warns instead of silently emitting the version root", () => {
    const file = path.resolve(__dirname, "../layouts/_shortcodes/link-hextra.html");
    test.skip(!fs.existsSync(file), "module-relative path only");
    const src = fs.readFileSync(file, "utf8");
    expect(
      /if not \$path[\s\S]{0,400}?warnf/.test(src),
      "the empty-path warning is gone — a misspelled argument name silently " +
        "emits the version root, which is usually a real page, so the wrong " +
        "link ships unnoticed",
    ).toBe(true);
  });
});
