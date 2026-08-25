import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// utils/match-version-entry.html — which site.Params.versions entry wins when a
// URL version segment matches more than one.
//
// WHY THIS EXISTS. A version dropdown may list OTHER products' versions, so one
// `linkVersion` can appear twice in a single list. hugo-gateway.toml has four
// such collisions right now: Gloo Gateway 1.22.x–1.19.x and Gloo Edge
// 1.22.x–1.19.x, same slugs, different `product`. hugo-kgateway.toml carries
// both of those groups as well.
//
// A bare `range site.Params.versions` + `if eq .linkVersion $candidate` is
// therefore ORDER-DEPENDENT, and it is wrong in one direction or the other
// whichever way it is written:
//
//   last-match-wins  → picks Edge on /gateway/1.21.x/ (Edge is listed second)
//   first-match-wins → picks the wrong entry the moment the cross-product group
//                      is listed first, which hugo-gateway.toml already does
//                      (it opens with three cross-product kgateway entries)
//
// The consequence is not cosmetic. version-banner.html reads its text off the
// matched entry, and the Edge entries set no `banner`, so matching Edge removes
// the version banner from every Gloo Gateway version page. Production renders
// that banner today ("If you are interested in trying out Gloo Gateway with the
// Kubernetes Gateway API…"), verified live against docs.solo.io/gateway/1.21.x/,
// so any resolver matching on linkVersion alone is a regression.
//
// No fixture reproduces this: every fixture entry is same-product, by design —
// a duplicate linkVersion WITHIN one product is a config error
// (see utils/resolve-section-versions.html). The collision only arises from
// cross-product entries, which the fixture has none of. Hence a source-level
// guard plus a mirrored-rule test.

const PARTIALS = path.resolve(__dirname, "../layouts/_partials/utils");
const MATCHER = path.join(PARTIALS, "match-version-entry.html");
const RESOLVER = path.join(PARTIALS, "version-root.html");

// Strip Go/Hugo template comments so assertions match ACTIVE code — the
// comments in both files quote the very expressions being asserted against.
function activeSrc(file: string): string {
  return fs
    .readFileSync(file, "utf8")
    .replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, "");
}

test.describe("version-entry matching prefers the current product", () => {
  test("version-root.html delegates both URL shapes to the matcher", () => {
    test.skip(!fs.existsSync(RESOLVER), "module-relative path only");
    const src = activeSrc(RESOLVER);
    const delegations = [
      ...src.matchAll(/partial\s+"utils\/match-version-entry\.html"/g),
    ];
    expect(
      delegations.length,
      "version-root.html must resolve the version entry through " +
        "utils/match-version-entry.html in BOTH branches — the OSS shape " +
        "(/docs/<section>/<version>/) and the enterprise shape " +
        "(/<product>/<version>/). Found " +
        delegations.length +
        " call(s).",
    ).toBe(2);
  });

  test("version-root.html does not match on linkVersion alone", () => {
    test.skip(!fs.existsSync(RESOLVER), "module-relative path only");
    const src = activeSrc(RESOLVER);
    // The exact shape that regressed the Gloo Gateway banner: iterate the list
    // and accept any entry whose linkVersion equals the candidate.
    expect(
      /range\s+site\.Params\.versions[\s\S]{0,200}?if\s+eq\s+\.linkVersion/.test(
        src,
      ),
      "version-root.html matches a version entry by linkVersion alone again. " +
        "That is order-dependent, and hugo-gateway.toml has four duplicate " +
        "linkVersions across products — it silently drops the version banner " +
        "from every /gateway/1.2x.x/ page.",
    ).toBe(false);
  });

  test("the matcher falls back to any match when no currentProduct is set", () => {
    test.skip(!fs.existsSync(MATCHER), "module-relative path only");
    const src = activeSrc(MATCHER);
    // agentgateway-oss-website and kgateway-oss set no currentProduct at all,
    // so `not $currentProduct` has to make every entry count as same-product.
    // Without it those two sites would resolve no version entry whatsoever.
    expect(
      /not\s+\$currentProduct/.test(src),
      "the matcher must treat an unset site.Params.currentProduct as " +
        "'every entry is same-product'. agentgateway-oss-website and " +
        "kgateway-oss set none.",
    ).toBe(true);
    expect(
      /return\s+\(or\s+\$sameProductMatch\s+\$anyMatch\)/.test(src),
      "the matcher must prefer a same-product match and fall back to any " +
        "match, so a version segment that only a cross-product entry names " +
        "still resolves.",
    ).toBe(true);
  });
});

// The rule itself, mirrored in TypeScript and exercised against the real
// production collision. The mirror is kept honest by the source assertions
// above: they fail if the shipped partial stops implementing this rule.
test.describe("matcher rule, against the real hugo-gateway.toml collision", () => {
  type Entry = { product: string; linkVersion: string; banner?: string };

  function match(
    versions: Entry[],
    candidate: string,
    currentProduct: string,
  ): Entry | null {
    let same: Entry | null = null;
    let any: Entry | null = null;
    for (const v of versions) {
      if (v.linkVersion !== candidate) continue;
      if (!any) any = v;
      if (!same && (!currentProduct || (v.product ?? "") === currentProduct)) {
        same = v;
      }
    }
    return same ?? any;
  }

  // hugo-gateway.toml, in its real order: three cross-product kgateway entries,
  // then four same-product gateway entries (the only ones with a banner), then
  // four cross-product edge entries whose slugs collide with the gateway ones.
  const GATEWAY: Entry[] = [
    { product: "kgateway", linkVersion: "2.3.x" },
    { product: "kgateway", linkVersion: "2.2.x" },
    { product: "kgateway", linkVersion: "2.1.x" },
    { product: "gateway", linkVersion: "1.22.x", banner: "gloo gateway 1.22" },
    { product: "gateway", linkVersion: "1.21.x", banner: "gloo gateway 1.21" },
    { product: "gateway", linkVersion: "1.20.x", banner: "gloo gateway 1.20" },
    { product: "gateway", linkVersion: "1.19.x", banner: "gloo gateway 1.19" },
    { product: "edge", linkVersion: "1.22.x" },
    { product: "edge", linkVersion: "1.21.x" },
    { product: "edge", linkVersion: "1.20.x" },
    { product: "edge", linkVersion: "1.19.x" },
  ];

  for (const v of ["1.22.x", "1.21.x", "1.20.x", "1.19.x"]) {
    test(`/gateway/${v}/ resolves the gateway entry, not Gloo Edge's`, () => {
      const m = match(GATEWAY, v, "gateway");
      expect(m?.product).toBe("gateway");
      expect(
        m?.banner,
        `matching Edge's ${v} entry removes the version banner from every ` +
          `/gateway/${v}/ page — the exact regression this guards`,
      ).toBe(`gloo gateway ${v.replace(".x", "")}`);
    });
  }

  test("order does not matter: cross-product entries listed first", () => {
    // hugo-kgateway.toml groups differently, so the rule must not depend on
    // where the current product's entries sit in the list.
    const reordered = [...GATEWAY].reverse();
    const m = match(reordered, "1.21.x", "gateway");
    expect(m?.product).toBe("gateway");
    expect(m?.banner).toBe("gloo gateway 1.21");
  });

  test("a cross-product-only version still resolves", () => {
    // /gateway/ has no 2.3.x of its own; only the kgateway entry names it. It
    // must still resolve, or the fallback that keeps sites without a
    // currentProduct working would be dead.
    const m = match(GATEWAY, "2.3.x", "gateway");
    expect(m?.product).toBe("kgateway");
  });

  test("no currentProduct set: first match wins, as before", () => {
    // agentgateway-oss-website / kgateway-oss shape.
    const m = match(GATEWAY, "1.21.x", "");
    expect(m?.product).toBe("gateway");
  });

  test("no match at all yields null", () => {
    expect(match(GATEWAY, "9.9.x", "gateway")).toBeNull();
  });
});
