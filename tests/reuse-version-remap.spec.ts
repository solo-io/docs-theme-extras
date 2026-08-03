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
//
// keepVersion guard: the conref ALSO carries a `keepVersion="true"` row gated on
// the same `v2oss` token. keepVersion means "these are already the enterprise
// tokens — do NOT remap them", so that row's `include-if` must stay `v2oss` and,
// since no page version equals `v2oss`, it renders on NO page. Without the
// keepVersion protection in reuse.html the (broadened, both-forms) remap rewrites
// its `v2oss → v2` too — exactly like the plain gated row — and the row wrongly
// appears on v2. The KEEP assertions below fail in that case. This is the shape
// that regressed kgateway's github-branch.md httpbin URLs (keepVersion
// enterprise tokens shifted by the remap).

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const V2_PAGE = path.join(TEST_PRODUCT_ROOT, "v2/version-remap/index.html");
const V1_PAGE = path.join(TEST_PRODUCT_ROOT, "v1/version-remap/index.html");
const V3_PAGE = path.join(TEST_PRODUCT_ROOT, "v3/version-remap/index.html");

const ALWAYS = "MARKER_REMAP_ALWAYS_KEY";
const GATED = "MARKER_REMAP_GATED_KEY";
const KEEP = "MARKER_REMAP_KEEP_KEY";
// The collision pair. The v1 entry sets ossVersion = "v3", so the remap
// rewrites the token `v3` to `v1`. Both rows below carry that same token and
// differ ONLY in keepVersion, so together they isolate the guard: the plain row
// must move to v1, the keepVersion row must stay on v3.
const COLLIDE_PLAIN = "MARKER_REMAP_COLLIDE_PLAIN";
const COLLIDE_KEEP = "MARKER_REMAP_COLLIDE_KEEP";

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

    // header + ungated + gated = 3 rows. The keepVersion row must NOT be here:
    // keepVersion prevents the remap, so its token stays `v2oss` and it renders
    // on no page. If it leaked in (remap ignored keepVersion) this would be 4.
    expect(rows.length, "expected header + 2 data rows on v2 (keepVersion row excluded)").toBe(3);
    expect(
      body,
      "keepVersion row leaked onto v2 — the OSS→enterprise remap wrongly rewrote its v2oss token to v2 instead of honoring keepVersion",
    ).not.toContain(KEEP);
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

    // Neither collision row belongs on v2: the plain one remaps v3 to v1, the
    // keepVersion one stays v3.
    expect(body, `${COLLIDE_PLAIN} leaked onto v2`).not.toContain(COLLIDE_PLAIN);
    expect(body, `${COLLIDE_KEEP} leaked onto v2`).not.toContain(COLLIDE_KEEP);
  });

  test("v1: the same row stays excluded (filtering still works after the remap)", () => {
    const body = bodyHtml(V1_PAGE);
    expect(body).toContain(ALWAYS);
    expect(
      body,
      "gated row leaked onto v1 — the remapped include-if should not match v1",
    ).not.toContain(GATED);
    expect(
      body,
      "keepVersion row leaked onto v1 — its v2oss token should match no page",
    ).not.toContain(KEEP);
    // The plain collision row DOES belong here: its `v3` token is v1's
    // ossVersion, so the remap rewrites it to v1. This is the control that
    // proves the collision mapping is actually live — without it, the
    // keepVersion assertion on v3 could pass vacuously.
    expect(
      body,
      `${COLLIDE_PLAIN} missing on v1 — the v3→v1 ossVersion remap did not fire, so the collision probe is inert`,
    ).toContain(COLLIDE_PLAIN);
    // …and the keepVersion row carrying the SAME token must not have followed
    // it. This is the exact production shape from kgateway's github-branch.md.
    expect(
      body,
      `${COLLIDE_KEEP} leaked onto v1 — reuse.html remapped a keepVersion token (v3→v1) instead of protecting it`,
    ).not.toContain(COLLIDE_KEEP);
    expect(tableRows(body).length, "expected header + 1 data row on v1").toBe(2);
  });

  test("v3: the keepVersion row survives the colliding remap and renders on its own version", () => {
    // The POSITIVE half. A negative-only assertion ("this row appears nowhere")
    // is satisfied by the row being dropped for any reason at all — including
    // the guard corrupting the block so version.html can no longer read its
    // condition. This asserts the row lands where keepVersion says it should.
    const body = bodyHtml(V3_PAGE);
    expect(body).toContain(ALWAYS);
    expect(
      body,
      `${COLLIDE_KEEP} missing on v3 — its keepVersion token was remapped away (or the guard's attribute rename was not restored)`,
    ).toContain(COLLIDE_KEEP);
    // It must be rendered prose, not a leaked shortcode tag or a raw token.
    expect(body, "collision keepVersion block leaked its shortcode tag").not.toMatch(
      /\{\{[<%]\s*\/?\s*version/,
    );
    expect(body).toMatch(
      new RegExp(`<p>[^<]*${COLLIDE_KEEP}`),
    );
    // The plain block with the same token was remapped to v1, so not here.
    expect(body, `${COLLIDE_PLAIN} leaked onto v3`).not.toContain(COLLIDE_PLAIN);
    expect(body, "v2oss-gated rows should not reach v3").not.toContain(GATED);
    expect(body, "v2oss keepVersion row should not reach v3").not.toContain(KEEP);
    expect(tableRows(body).length, "expected header + 1 data row on v3").toBe(2);
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
