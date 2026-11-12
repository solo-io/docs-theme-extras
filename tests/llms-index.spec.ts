import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for the SHAPE of the root llms.txt: an index that points at
// per-version files, not a dump of every page.
//
//   1. No build timestamp. "Generated on …" changed every llms.txt on every
//      build, so two builds of identical content were never byte-identical.
//   2. Versions are links, listed with `main` (in development) LAST, so an
//      agent that takes the first version link reads released docs.
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

  test("has no stray callout-title lines", () => {
    expect(read()).not.toMatch(/^(Note|Tip|Warning|Caution|Important)\s*$/m);
  });
});
