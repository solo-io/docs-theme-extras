import { test, expect } from "@playwright/test";
import path from "node:path";
import { TEST_PRODUCT_ROOT, readFixture } from "./helpers/fixture";
import { target } from "./helpers/target";

// Regression guard for reuse.html's two-pass OSS→enterprise version remap on a
// PERCENT-form `{{% version %}}` block — the shape that regressed in kgateway's
// templating-language.md get_cookie rows (rendered on kgateway.dev OSS but
// dropped on docs.solo.io/kgateway/2.3.x).
//
// reuse.html remaps an OSS version number in an `include-if` to the enterprise
// version so a block authored against OSS releases still resolves on the hub.
// Its Pass-1 regex was anchored on angle form (`{{<`) only, so percent-form
// blocks kept their OSS version and got excluded on the enterprise build.
// (rebase.html bulk-converts percent→angle before remapping, so it never hit
// this — reuse.html does not.) The fix broadens the anchor to `{{[<%]`.
//
// Fixture wiring: content/en/test/{v2,v1}/version-remap.md reuse
// assets/conrefs/test/version-remap.md with an explicit version (the 3-arg form
// that turns on the remap branch). The snippet's gated row is authored against
// the OSS string `v2oss`; both hugo configs give the v2 entry
// `ossVersion = "v2oss"`, so the remap rewrites `v2oss → v2`. The row must then
// render on v2 and stay excluded on v1 (proving version filtering survives the
// remap). Not brand-specific: the remap is driven by the version param's
// ossVersion, not the oss/enterprise flag, so this runs on both builds.
//
// A revert to the angle-only regex leaves the percent block gated on `v2oss`;
// since no page version equals `v2oss`, the gated row disappears from v2 and
// this spec fails.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const V2_PAGE = path.join(TEST_PRODUCT_ROOT, "v2/version-remap/index.html");
const V1_PAGE = path.join(TEST_PRODUCT_ROOT, "v1/version-remap/index.html");

const ALWAYS = "MARKER_REMAP_ALWAYS_KEY";
const GATED = "MARKER_REMAP_GATED_KEY";

// The rendered article body only, minus the copy-as-markdown <script> embed
// (raw markdown that would false-positive on the leak/token checks).
function bodyHtml(page: string): string {
  const doc = readFixture(page);
  const start = doc.indexOf('<main id="content"');
  const end = doc.indexOf("</main>", start);
  return doc
    .slice(start === -1 ? 0 : start, end === -1 ? doc.length : end)
    .replace(/<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi, "");
}

// The single data table's <tr> rows (header included).
function tableRows(html: string): string[] {
  const tbl = html.match(/<table[\s\S]*?<\/table>/);
  return tbl ? tbl[0].match(/<tr>[\s\S]*?<\/tr>/g) ?? [] : [];
}

test.describe("reuse.html OSS→enterprise version remap (percent-form block)", () => {
  test.skip(!IS_FIXTURE_TARGET, "fixture-only: version-remap pages exist only in the extras fixture build");

  test("v2: the OSS-gated percent-form row is remapped in and renders as a real table row", () => {
    const body = bodyHtml(V2_PAGE);
    const rows = tableRows(body);

    // header + ungated + gated = 3 rows.
    expect(rows.length, "expected header + 2 data rows on v2").toBe(3);
    expect(body).toContain(ALWAYS);
    expect(
      body,
      "gated percent-form row missing on v2 — the OSS→enterprise remap did not reach the percent block",
    ).toContain(GATED);

    // The gated content must be inside a real <td> cell, not a leaked/mangled
    // pipe string dumped outside the table.
    const gatedRow = rows.find((r) => r.includes(GATED)) ?? "";
    expect(gatedRow, "gated marker is not inside a <tr>").not.toBe("");
    // Real key cell: `<td ...><code>MARKER_REMAP_GATED_KEY</code></td>`. Allow
    // attributes on <td> (the first column carries a white-space style) and be
    // quote-agnostic in case a consumer build is minified.
    expect(gatedRow).toMatch(/<td\b[^>]*>\s*<code>MARKER_REMAP_GATED_KEY<\/code>\s*<\/td>/);
  });

  test("v1: the same row stays excluded (filtering still works after the remap)", () => {
    const body = bodyHtml(V1_PAGE);
    expect(body).toContain(ALWAYS);
    expect(
      body,
      "gated row leaked onto v1 — the remapped include-if should not match v1",
    ).not.toContain(GATED);
    expect(tableRows(body).length, "expected header + 1 data row on v1").toBe(2);
  });

  test("no raw version shortcode or placeholder token leaks into the rendered body", () => {
    for (const page of [V2_PAGE, V1_PAGE]) {
      const body = bodyHtml(page);
      // The remap must fully resolve: no unrendered shortcode tags, no leftover
      // include-if attribute, no un-swapped `__V<n>__` Pass-1 placeholder, and
      // no OSS version string surviving inside an include-if.
      expect(body, `unrendered version shortcode on ${page}`).not.toMatch(/\{\{[<%]\s*\/?\s*version\b/);
      expect(body, `leftover include-if attr on ${page}`).not.toContain("include-if=");
      expect(body, `un-swapped remap placeholder on ${page}`).not.toMatch(/__V\d+__/);
    }
  });
});
