import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the SHAPE of the root llms.txt: an index that points at
// per-version files, not a dump of every page.
//
//   1. No build timestamp. "Generated on …" changed every llms.txt on every
//      build, so two builds of identical content were never byte-identical.
//   2. Versions are links, in params.versions order, with `main` (in
//      development) LAST so an agent that takes the first version link reads
//      released docs. Hidden versions are left out.
//   3. Nothing from inside a version tree is inlined. The root links to the
//      version's own file (llms.txt, or index.md when the site does not publish
//      section llms.txt, as the fixture does not); it never lists the
//      version's pages.
//   4. No empty headings. A section with no listable pages used to render as a
//      bare heading (agentgateway.dev's "Model and Provider Cookbook").
//   5. No callout title leaks. A page summary that started with a NOTE callout
//      put a stray "Note" line into the file.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("root llms.txt is an index, not a dump", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: asserts the fixture's version trees");

  const read = () => readFixture(path.join(TEST_PRODUCT_ROOT, "llms.txt"));

  test("carries no build timestamp", () => {
    expect(read()).not.toMatch(/Generated on/);
  });

  test("lists main (dev) after every released version", () => {
    const links = [...read().matchAll(/^- \[([^\]]+)\]\(([^)]+)\)/gm)].map((m) => ({ title: m[1], url: m[2] }));
    const versionLinks = links.filter((l) => /\/test\/(v\d[^/]*|main)\/(llms\.txt|index\.md)$/.test(l.url));
    expect(versionLinks.length, "expected top-level version links in the root llms.txt").toBeGreaterThan(1);
    const mainIdx = versionLinks.findIndex((l) => l.url.includes("/test/main/"));
    expect(mainIdx, "main (dev) version link missing").toBeGreaterThanOrEqual(0);
    expect(mainIdx, `main is not last: ${versionLinks.map((l) => l.title).join(", ")}`).toBe(versionLinks.length - 1);
  });

  // hugo-oss.toml lists v2, v1, main, v3, v4-link, then v8-link with a
  // whitespace `dropdown` (hidden). Version `_index.md` weights would give a
  // different order, so this proves the config order is the one used.
  test("follows params.versions order and leaves out hidden versions", () => {
    const urls = [...read().matchAll(/^- \[[^\]]+\]\(([^)]+)\)/gm)].map((m) => m[1]);
    const top = urls
      .map((u) => u.match(/^\/test\/([^/]+)\/(?:llms\.txt|index\.md)$/)?.[1])
      .filter((s): s is string => !!s && /^(v\d[^/]*|main)$/.test(s));
    expect(top).toEqual(["v2", "v1", "v3", "v4-link", "main"]);
    expect(top, "hidden version (whitespace dropdown) should not be listed").not.toContain("v8-link");
  });

  // Many hub version roots share one title (every Istio version root is
  // "Solo Enterprise for Istio"), so the version has to be in the link text or
  // the links read as duplicates. nested/v1's title, "Nested guide", leaves the
  // version out; v1 has no dropdown label, so its directory name is appended.
  // nested/v2's title "v2 (current)" already names its version and stays as is.
  test("names the version in each version link", () => {
    const text = read();
    expect(text).toMatch(/^- \[Nested guide v1\]\(\/test\/nested\/v1\/(?:llms\.txt|index\.md)\)/m);
    expect(text).toMatch(/^- \[v2 \(current\)\]\(\/test\/nested\/v2\/(?:llms\.txt|index\.md)\)/m);
    // The match ignores case. v4-link is titled "V4 (linkVersion probe)" and its
    // dropdown label starts with "v4". A case-sensitive check appended the label
    // again, the way agentgateway's "Main (in dev)" became "Main (in dev) main".
    expect(text).toMatch(/^- \[V4 \(linkVersion probe\)\]\(\/test\/v4-link\/(?:llms\.txt|index\.md)\)/m);
  });

  test("links to version files instead of inlining version pages", () => {
    const urls = [...read().matchAll(/\]\(([^)]+)\)/g)].map((m) => m[1]);
    const inlined = urls.filter((u) => /\/test\/(v\d[^/]*|main)\/.+/.test(u) && !/\/(llms\.txt|index\.md)$/.test(u));
    expect(inlined, "version-tree pages inlined into the root index").toEqual([]);
  });

  test("has no empty headings", () => {
    const lines = read().split("\n");
    const empty: string[] = [];
    lines.forEach((line, i) => {
      const level = line.match(/^(#{2,}) /)?.[1].length;
      if (!level) return;
      const next = lines.slice(i + 1).find((l) => l.trim() !== "");
      // A deeper heading next is a subsection, which is fine. A heading at the
      // same or a higher level (or end of file) means nothing sat under it.
      const nextLevel = next?.match(/^(#+) /)?.[1].length;
      if (next === undefined || (nextLevel !== undefined && nextLevel <= level)) empty.push(line);
    });
    expect(empty, "headings with nothing under them").toEqual([]);
  });

  // An unversioned section with its own pages AND a subsection (agentregistry's
  // /docs/mcp/local/) used to list only the subsection, so its own pages were
  // in no llms.txt at all.
  test("lists a section's own pages next to its subsections", () => {
    const text = read();
    expect(text).toMatch(/^- \[Flat mixed own page\]\(\/test\/flatmixed\/own-page[^)]*\)/m);
    expect(text).toMatch(/^- \[Flat mixed sub page\]\(\/test\/flatmixed\/sub\/sub-page[^)]*\)/m);
  });

  test("has no stray callout-title lines", () => {
    expect(read()).not.toMatch(/^(Note|Tip|Warning|Caution|Important)\s*$/m);
  });
});
