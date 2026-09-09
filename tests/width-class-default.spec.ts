import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// docs/width-class.html's DEFAULT, isolated from any consumer override.
//
// The module default used to hardcode `hextra-max-page-width` unconditionally,
// silently ignoring `page.width` even for a consumer who set it. The fix makes
// the default itself config-aware: honor `.Params.width` (per-page) or
// `site.Params.page.width` (site-wide) when either is set, otherwise keep the
// historic full-bleed fallback. See CHANGELOG.md [0.3.9], second width-related
// Fix entry.
//
// WHY THIS SPEC READS ITS OWN BUILDS, NOT THE HARNESS TARGET. Every brand
// fixture (hugo-oss.toml, hugo-enterprise.toml, and everything layered on top
// of them) sets `page.width: wide`, so the DOCS_TEST_CONFIG target can only
// ever exercise the "honored" branch. The fallback branch — what a consumer
// who never touches page.width gets (kagent.dev, ambientmesh.io) — has no
// coverage there at all. hugo-nosections.toml and hugo-nosections-bare.toml
// are the only bundled configs with no `[params.page]` block, so this spec
// reads their builds directly instead, same pattern as
// tests/nosections-condition.spec.ts.
//
// ONE PAGE CARRIES A PER-PAGE OVERRIDE. `fixture/content-flat/en/gamma/first.md`
// sets `width: full` in front matter — the only fixture page that does — so a
// single build proves both branches at once: gamma/first (per-page override,
// no site-wide setting) must resolve through utils/page-width, while a sibling
// page with neither gets the untouched historic default.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const BUILDS = [
  { name: "buildCondition set", dir: "public-nosections" },
  { name: "nothing set", dir: "public-nosections-bare" },
];

const root = (dir: string) => path.resolve(__dirname, "..", dir);
const hasBuild = (dir: string) => fs.existsSync(root(dir));

function wrapperClass(dir: string, page: string): string | null {
  const html = fs.readFileSync(path.join(root(dir), page, "index.html"), "utf8");
  const m = html.match(/<div class='hx:mx-auto hx:flex ([^']*)'/);
  return m ? m[1] : null;
}

for (const b of BUILDS) {
  test.describe(`docs/width-class.html default (${b.name})`, () => {
    test.skip(!IS_FIXTURE_TARGET || !hasBuild(b.dir), `needs \`make build-nosections\` (${b.dir}/)`);

    test("neither page.width nor a per-page override set: falls back to hextra-max-page-width", () => {
      // delta/first carries no front-matter width and this config has no
      // [params.page], so this is the untouched historic default — the case
      // a consumer who never adopts page.width must see unchanged.
      expect(
        wrapperClass(b.dir, "delta/first"),
        "a consumer who never sets page.width must keep the original full-bleed " +
          "default; if this changed, the default stopped falling back correctly",
      ).toBe("hextra-max-page-width");
    });

    test("a per-page `width` front-matter param is honored even with no site-wide page.width", () => {
      // gamma/first sets `width: full`. site.Params.page.width is unset in
      // this config, so this only passes if width-class.html's `.Params.width`
      // check (not just the site-wide one) is what triggers the delegation to
      // utils/page-width.
      expect(
        wrapperClass(b.dir, "gamma/first"),
        "a page-level `width` front-matter override did not reach the docs " +
          "wrapper — width-class.html's default must check .Params.width, not " +
          "only site.Params.page.width",
      ).toBe("max-w-full");
    });
  });
}
