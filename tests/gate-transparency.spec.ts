import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { sectionsByHeading } from "./helpers/ancestor-path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// THE ASSERTION NO OTHER SPEC MAKES:
//
//   a gated block renders byte-identically to the same content with the gate
//   tags deleted.
//
// Everything else in this suite checks that the RIGHT content was included or
// excluded. None of it checks that including content leaves it UNCHANGED — and
// every defect in solo-io/docs#3280 is of that second kind. The content was
// correctly selected and then damaged on the way out: a paragraph double-wrapped,
// a list severed, a heading ejected, a link broken at the `](` boundary.
//
// `fixture/content/en/test/v2/gate-transparency.md` pairs each shape: once
// wrapped in a gate whose condition is TRUE here, once with the tags removed.
// Transparency means the pair is identical.
//
// EXPECTED FAILURES ARE THE POINT. Shapes listed in KNOWN_BROKEN are real
// defects found by this spec, marked `test.fail()` so they are pinned rather
// than tolerated: if one starts passing, Playwright fails the run and the entry
// must be removed.
//
// Shape 07 is the one entry NOT expected to flip. Its HTML difference is
// structural and permanent, and it costs a reader nothing — the two lists render
// at identical height, which tests/loose-list-spacing.spec.ts measures and pins.
// See its KNOWN_BROKEN note.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");
const PAGE = path.join(TEST_PRODUCT_ROOT, "v2", "gate-transparency", "index.html");

// Shape -> why it fails today. Both entries here were found by this spec on
// its first run; shape 12 has since been FIXED by the gate refactor and removed
// (the typographer no longer sees the body, because the gate stopped calling
// RenderString on it at all).
const KNOWN_BROKEN: Record<string, string> = {
  "07":
    "a gate around a MIDDLE list item makes the whole list loose — " +
    "`<li><p>step one</p></li>` instead of `<li>step one</li>`. Goldmark sees " +
    "the gate's blank-line-separated body as a loose-list signal, and every " +
    "item in the list picks up a <p> wrapper. " +
    "NOT VISIBLE TO A READER, measured: both lists render at exactly 114px. " +
    "Tailwind's preflight zeroes element margins and this theme never restores " +
    "a typography margin on <p> inside <li>, so the wrapper costs nothing. " +
    "tests/loose-list-spacing.spec.ts holds that, and will go red if a <p> " +
    "margin ever comes back. An earlier note here claimed the spacing WAS " +
    "visible; that came from measuring over file://, where the stylesheet 404s " +
    "and the browser applies its own 1em <p> margins. It was never true of a " +
    "real build. This entry stays because the HTML difference is real and this " +
    "spec is an HTML comparison — do not weaken it to a visual check.",
};

function pairs(): { id: string; gated: string; baseline: string }[] {
  const sections = sectionsByHeading(readFixture(PAGE));
  const ids = [
    ...new Set(
      [...sections.keys()]
        .map((k) => k.match(/^Shape (\d+)/)?.[1])
        .filter((x): x is string => Boolean(x)),
    ),
  ].sort();
  return ids.map((id) => ({
    id,
    gated: sections.get(`Shape ${id} gated`) ?? "",
    baseline: sections.get(`Shape ${id} baseline`) ?? "",
  }));
}

// Whitespace-only differences are not defects: Hugo's shortcode substitution
// leaves different newline placement around a gate boundary, and HTML collapses
// runs of whitespace between block elements identically either way.
//
// Generated IDENTIFIER VALUES are likewise not defects, and normalizing them is
// forced by the paired-fixture design rather than a convenience. Each shape
// appears twice on ONE page, so any construct that mints a per-page unique id
// necessarily differs between the pair:
//   - Hextra's tab groups number themselves (`tabs-00-0` vs `tabs-13-0`);
//   - Hugo deduplicates repeated heading anchors (`#h` vs `#h-1`).
// Shape 13's two renderings are otherwise byte-identical, 2254 characters each.
//
// The attribute NAME is kept, only the value is blanked — so a gate that drops
// an anchor or a `aria-controls` wiring entirely still fails, which is the case
// worth catching. Everything else — tags, attribute names, other attribute
// values, text, entities — must match exactly.
const ID_ATTRS = /\b(id|aria-controls|aria-labelledby|for)="[^"]*"/g;
const norm = (s: string) =>
  s
    .replace(ID_ATTRS, '$1="X"')
    .replace(/href="#[^"]*"/g, 'href="#X"')
    .replace(/\s+/g, " ")
    .trim();

test.describe("gate transparency: a gate must not change what it wraps", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only page");

  const all = IS_FIXTURE_TARGET && fs.existsSync(PAGE) ? pairs() : [];

  test("the fixture actually produced pairs", () => {
    // Without this, a renamed heading or an unbuilt page silently yields zero
    // pairs and every per-shape test below vanishes rather than failing.
    expect(
      all.length,
      `no "Shape NN gated"/"Shape NN baseline" pairs found in ${PAGE}`,
    ).toBeGreaterThanOrEqual(12);
    for (const { id, gated, baseline } of all) {
      expect(gated, `Shape ${id} has no gated section`).not.toBe("");
      expect(baseline, `Shape ${id} has no baseline section`).not.toBe("");
    }
  });

  for (const { id, gated, baseline } of all) {
    const reason = KNOWN_BROKEN[id];
    test(`shape ${id} renders identically gated and ungated`, () => {
      if (reason) test.fail(true, reason);
      expect(norm(gated), `gate changed the rendering of shape ${id}`).toBe(
        norm(baseline),
      );
    });
  }
});
