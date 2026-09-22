import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// The glossary tooltip's "Learn more" anchor: where its href comes from, and
// when it opens in a new tab.
//
// WHY THIS EXISTS. Both behaviors were consumer FORKS of `gloss.html` before
// they were features here, and the forks were invisible to this suite because
// the fixture's only linked glossary entry was external — the one shape where
// old and new behavior agree.
//
//   * kagent.dev forked `gloss.html` because the module hardcoded
//     `target="_blank"`. Its glossary holds 22 links and ALL 22 are
//     site-relative, so every cross-reference in its own docset opened a second
//     tab. Nothing was broken enough to fail a build; it was just wrong on
//     every one of them.
//   * the docs hub forked the same file to route the href through a rewrite,
//     because glossary data TRAVELS: it is authored in a product's OSS repo,
//     where links are absolute against the OSS site, and reaches the hub
//     through a data mount. kagent's `/docs/kagent/1.x/…` links are
//     `/kagent/1.0.x/…` there, so all 19 of them 404'd. The OSS repo cannot fix
//     it downstream — `layouts/` do not travel with a content+data mount, only
//     the data does.
//
// Both now live in `layouts/partials/docs/glossary-link.html` (an extension
// slot, defaulting to the rewrite) and `_shortcodes/gloss.html`. This spec is
// what keeps them, and what keeps the rewrite NARROW: the fourth case below —
// a site-absolute link that names no upstream version and must survive
// untouched — is the one a too-eager rewrite fails, and it would otherwise pass
// every other assertion here.
//
// SCOPE LIMIT, stated rather than hidden: all four cases render on ONE page, in
// the v2 tree. Per-tree resolution (the same entry rewriting differently under
// v1, whose `ossVersion` is a different token) is not covered, because the
// fixture's glossary page exists only under v2. What IS covered is that the
// rewrite lands on the page's OWN version rather than any fixed string.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "glossary-term", "index.html");

// The fixture's upstream token (hugo-oss.toml: v2 and v3 both declare
// ossVersion = "v2oss"), and the tree the page under test lives in.
const OSS_TOKEN = "v2oss";
const PAGE_VERSION = "v2";

type Anchor = { href: string; attrs: string };

function anchors(): Anchor[] {
  const html = readFixture(PAGE).replace(
    /<script[^>]*>[\s\S]*?<\/script>/gi,
    "",
  );
  return [...html.matchAll(/<a href="([^"]*)" class="tooltip-link"([^>]*)>/g)].map(
    (m) => ({ href: m[1], attrs: m[2].trim() }),
  );
}

/**
 * The anchor for the glossary entry whose resolved href ends in `suffix`.
 *
 * A term may legitimately appear more than once on a page — "Data Plane" does
 * here, once with custom display text and once without — so this asserts
 * presence rather than uniqueness, and additionally that every occurrence
 * resolved IDENTICALLY. That second check is free and worth having: the href
 * now comes from a partial called per occurrence, so a resolution that depended
 * on anything other than the entry and the page would show up as two anchors
 * for one term that disagree.
 */
function hrefEndingWith(list: Anchor[], suffix: string): Anchor {
  const found = list.filter((a) => a.href.endsWith(suffix));
  expect(found.length, `no tooltip link ending "${suffix}"`).toBeGreaterThan(0);
  expect(
    new Set(found.map((a) => `${a.href}|${a.attrs}`)).size,
    `the same glossary entry rendered ${found.length} anchors that differ`,
  ).toBe(1);
  return found[0];
}

test.describe("glossary Learn more links", () => {
  test.skip(!IS_FIXTURE_TARGET, "reads this module's own fixture glossary");

  test("the page renders the tooltip anchors this spec measures", () => {
    // HAZARDS.md rule. Every assertion below filters this list, so an empty
    // list would make each one pass while measuring nothing — and an empty list
    // is exactly what a broken `{{ if $entry.link }}` produces.
    const all = anchors();
    expect(all.length, "tooltip links on the glossary fixture page").toBe(4);
  });

  test("an external link opens in a new tab, safely", () => {
    const a = hrefEndingWith(anchors(), "example.com/data-plane");
    expect(a.attrs, "external link lost target=_blank").toContain(
      'target="_blank"',
    );
    // Never one without the other: `target="_blank"` with no `rel` hands the
    // opened page a live `window.opener` reference back to this one.
    expect(a.attrs, "target=_blank without rel=noopener").toContain(
      'rel="noopener"',
    );
  });

  test("an upstream-absolute link is rewritten onto the page's own tree", () => {
    const a = hrefEndingWith(anchors(), "about/control-plane/#overview");

    // The authored value is `/docs/fixture/v2oss/about/control-plane/#overview`.
    // Two halves to the assertion, and both matter: the upstream token must be
    // GONE (otherwise the link 404s here) and the replacement must be the
    // version this page is served from (otherwise it 404s somewhere else).
    expect(
      a.href,
      `the upstream token "${OSS_TOKEN}" survived into the href — the rewrite ` +
        `did not fire, and this link points at a tree that does not exist here`,
    ).not.toContain(OSS_TOKEN);
    expect(a.href).toBe(
      `${target.baseURL.replace(/\/$/, "")}/${PAGE_VERSION}/about/control-plane/#overview`,
    );

    // Rewritten to a site-relative path, so it must NOT have been treated as
    // external on the way out.
    expect(a.attrs, "a rewritten internal link opens in a new tab").toBe("");
  });

  test("a site-absolute link that names no upstream version is untouched", () => {
    const authored = `${target.baseURL.replace(/\/$/, "")}/${PAGE_VERSION}/about/sidecar/`;
    const a = hrefEndingWith(anchors(), "about/sidecar/");

    // Byte-for-byte. This is the narrowness check: a slot that rewrote every
    // site-absolute link would still pass the test above, because that link's
    // expected output happens to start with the same prefix.
    expect(
      a.href,
      "a glossary link holding a native path was rewritten — the slot's " +
        "rewrite is firing on links it should pass through",
    ).toBe(authored);
    expect(a.attrs).toBe("");
  });

  test("no site-relative link anywhere on the page opens in a new tab", () => {
    // The blanket form of the kagent defect, so a future link shape that none
    // of the cases above names still cannot regress it.
    //
    // FILTER FIRST, THEN ASSERT THE FILTER FOUND SOMETHING. Looping and
    // `continue`-ing past every external link would report success having
    // checked nothing the moment the fixture glossary holds only external
    // links — which is not hypothetical, it is precisely the state this
    // fixture was in before this change added the two site-relative entries,
    // and the one state where old and new behavior agree. The targeted tests
    // above would catch that particular drift through `hrefEndingWith`, but a
    // blanket scan that depends on a neighbour to notice it is dead is the
    // pattern tests/HAZARDS.md exists to break.
    const siteRelative = anchors().filter((a) => !/^https?:\/\//.test(a.href));
    expect(
      siteRelative.length,
      "no site-relative tooltip links on the page — this scan certified nothing",
    ).toBeGreaterThan(0);

    for (const a of siteRelative) {
      expect(
        a.attrs,
        `site-relative link ${a.href} carries ${a.attrs} — an ordinary ` +
          `cross-reference must not strand the reader in a second tab`,
      ).toBe("");
    }
  });

  test("the tooltip payload is still stripped from the markdown outputs", () => {
    // The strip regexes in `utils/md-strip-glossary.html` absorb the anchor as
    // `<a[^>]*>`, so the attributes added here are safe — but that is an
    // assumption about a regex in another file, and this is the page that
    // proves it. copy-md-fidelity's `glossary-tooltip-inlined` scan covers the
    // same ground for every page; this is the targeted version, on the one page
    // whose anchors now carry conditional attributes.
    const html = readFixture(PAGE);
    const payload = html.match(
      /<script[^>]*class=["']copy-md-source["'][^>]*>([\s\S]*?)<\/script>/i,
    );
    expect(payload, "no copy-as-markdown payload").not.toBeNull();

    expect(payload![1]).not.toContain("tooltip-link");
    expect(payload![1]).not.toContain("MARKER_GLOSS_DEF_THREE");
    expect(payload![1]).not.toContain("MARKER_GLOSS_DEF_FOUR");
  });
});
