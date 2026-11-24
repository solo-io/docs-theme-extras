import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// layouts/list.rss.xml (slim RSS). The fixture's current version is v2, marked
// with `latest = true` in hugo-oss.toml / hugo-enterprise.toml, so:
//   - v2 pages carry full rendered content in <description>,
//   - v1 and main pages carry only their front-matter description,
//   - pages in no version (flatguide, flatmixed) also keep full content,
//   - the site root feed lists current pages, latest and unversioned, never an
//     old version (Hextra's own rule listed `blog` pages, which left it empty
//     on a site with no blog; a site WITH a blog keeps that rule),
//   - a version root feed lists pages from its whole tree (Hextra's own rule
//     matched Type against the section name, which docs pages never satisfy),
//   - no item is dated year 0001 (Hextra used .Date, which is zero on pages
//     with no `date`; the fixture has no git info, so pubDate is left out).

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

// Fixture versions that are not latest (hugo-oss.toml / hugo-enterprise.toml).
const OLD_VERSIONS = ["v1", "main", "v3", "v4-link", "v8-link"];

type Item = { link: string; description: string; pubDate: string | null };

function items(rel: string): Item[] {
  const xml = readFixture(path.join(TEST_PRODUCT_ROOT, rel));
  return [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)].map(([, body]) => ({
    link: body.match(/<link>([^<]*)<\/link>/)?.[1] ?? "",
    description: body.match(/<description>([\s\S]*?)<\/description>/)?.[1] ?? "",
    pubDate: body.match(/<pubDate>([^<]*)<\/pubDate>/)?.[1] ?? null,
  }));
}

// Full content is escaped HTML; a front-matter description is plain text.
const isFullContent = (d: string) => /&lt;(p|h[1-6]|ul|pre|div)\b/.test(d);
const segments = (link: string) => link.split("/");

test.describe("slim RSS feed", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: relies on the extras fixture's versions");

  test("site root lists current pages (latest and unversioned) with full content", () => {
    const root = items("index.xml");
    expect(root.length, "root feed is empty (Hextra's blog-only rule is back?)").toBeGreaterThan(0);
    expect(root.length).toBeLessThanOrEqual(50);
    for (const it of root) {
      const segs = segments(it.link);
      for (const old of OLD_VERSIONS) {
        expect(segs, `${it.link} is in old version ${old}`).not.toContain(old);
      }
      expect(segs, `${it.link}: reference pages stay out of the root feed`).not.toContain("reference");
      expect(isFullContent(it.description), `${it.link} lost its full content`).toBe(true);
    }
    expect(root.some((it) => segments(it.link).includes("v2")), "no latest-version page").toBe(true);
    // Pages in no version (a blog, an unversioned section) are current too.
    expect(
      root.some((it) => !segments(it.link).some((s) => /^(v\d|main)/.test(s))),
      "no unversioned page in the root feed",
    ).toBe(true);
  });

  test("version root lists its tree; latest has full content", () => {
    const v2 = items("v2/index.xml");
    expect(v2.length, "v2 version-root feed is empty").toBeGreaterThan(0);
    expect(v2.some((it) => isFullContent(it.description))).toBe(true);
  });

  for (const version of ["v1", "main"]) {
    test(`${version} items carry the description only`, () => {
      const feed = items(`${version}/index.xml`);
      expect(feed.length, `${version} version-root feed is empty`).toBeGreaterThan(0);
      for (const it of feed) {
        expect(isFullContent(it.description), `${it.link} carries full content`).toBe(false);
      }
    });
  }

  test("no item is dated year 0001", () => {
    for (const rel of ["index.xml", "v2/index.xml", "v1/index.xml", "main/index.xml"]) {
      for (const it of items(rel)) {
        if (it.pubDate !== null) {
          expect(it.pubDate, `${rel}: ${it.link}`).not.toMatch(/\b0001\b/);
        }
      }
    }
  });
});
