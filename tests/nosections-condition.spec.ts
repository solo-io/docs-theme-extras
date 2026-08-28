import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// CONDITIONAL-TEXT ON A SITE THAT REGISTERS NO SECTIONS.
//
// `utils/page-context.html`'s `url` branch assigns a condition only where the
// path carries a section AND a version. With no `[params.sections]` registered
// the section test can never match, so before 0.3.5 the condition was "" for
// every page on such a site and `conditional-text` was not merely limited — it
// was INERT. The outer guard dropped both directions, so `exclude-if="nothing"`,
// which should be a no-op that emits its body, emitted nothing and said nothing
// about it.
//
// That is the shape agentregistry.dev and ambientmesh.io ship, and the trap is
// asymmetric: the docs hub renders the same conrefs under a real buildCondition
// (`agentregistry`, or `gm` for ambientmesh content mounted into istio), so a
// gate can look correct downstream and be blank upstream. Verified against
// agentregistry.dev before the fix — a probe include-if AND a probe exclude-if
// both rendered empty.
//
// TWO BUILDS, because the two halves cannot coexist in one config:
//
//   public-nosections/       buildCondition set   -> gates resolve (the fallback)
//   public-nosections-bare/  nothing set          -> gates inert, must WARN
//
// Neither half is meaningful alone. The first proves the fallback works; the
// second proves the state it does not cover is loud rather than silent. A build
// where the bare half quietly rendered nothing and logged nothing would be the
// original bug wearing a passing test.
//
// WHY THIS SPEC READS ITS OWN BUILDS. Same reason as
// tests/section-versionless.spec.ts: the harness target (DOCS_TEST_CONFIG) is
// the versioned fixture and has to stay that way. `make build-nosections` emits
// both trees alongside the brand builds.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

type Build = {
  name: string;
  dir: string;
  log: string;
  /** Does this build resolve a build condition at all? */
  gated: boolean;
};

const WITH_CONDITION: Build = {
  name: "buildCondition set",
  dir: "public-nosections",
  log: ".build-nosections.log",
  gated: true,
};
const BARE: Build = {
  name: "nothing set",
  dir: "public-nosections-bare",
  log: ".build-nosections-bare.log",
  gated: false,
};

const INCLUDE = "COND_NOSEC_INCLUDE";
const EXCLUDE = "COND_NOSEC_EXCLUDE";

const root = (b: Build) => path.resolve(__dirname, "..", b.dir);
const hasBuild = (b: Build) => fs.existsSync(root(b));

// Strip the copy-as-markdown <script>: it embeds the raw shortcode source, so
// the marker of a gate that did NOT render is still in the file.
const MD_SCRIPT =
  /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi;

function probePage(b: Build): string {
  const p = path.join(root(b), "beta", "first", "index.html");
  return fs.readFileSync(p, "utf8").replace(MD_SCRIPT, "");
}

function buildLog(b: Build): string {
  const p = path.resolve(__dirname, "..", b.log);
  return fs.existsSync(p) ? fs.readFileSync(p, "utf8") : "";
}

for (const b of [WITH_CONDITION, BARE]) {
  test.describe(`no sections registered: config health (${b.name})`, () => {
    test.skip(
      !IS_FIXTURE_TARGET || !hasBuild(b),
      `needs \`make build-nosections\` (${b.dir}/)`,
    );

    test("the config registers no sections", () => {
      // Guard the guard. One [params.sections.x] table moves this build onto
      // the covered code path and every assertion below stops meaning anything.
      const toml = fs.readFileSync(
        path.resolve(
          __dirname,
          "..",
          b.gated ? "hugo-nosections.toml" : "hugo-nosections-bare.toml",
        ),
        "utf8",
      );
      expect(toml).not.toMatch(/^\s*\[params\.sections\./m);
    });

    test("the build log exists", () => {
      // An earlier version of the sibling spec read "" for a missing log and
      // passed vacuously while the build dir existed.
      expect(
        fs.existsSync(path.resolve(__dirname, "..", b.log)),
        `expected ${b.log} from make build-nosections`,
      ).toBe(true);
    });
  });
}

test.describe("no sections registered: buildCondition fallback", () => {
  test.skip(
    !IS_FIXTURE_TARGET || !hasBuild(WITH_CONDITION),
    "needs `make build-nosections` (public-nosections/)",
  );

  test("include-if naming the buildCondition renders", () => {
    expect(
      probePage(WITH_CONDITION),
      `include-if="agentregistry" did not render on a site with no sections but ` +
        `with params.buildCondition set. The url-mode fallback in ` +
        `utils/page-context.html is not reaching the shortcode, so a ` +
        `single-doc-set site still cannot gate at all.`,
    ).toContain(INCLUDE);
  });

  test("exclude-if naming an unused token renders", () => {
    // The direction that was silently deleting content. This body must appear:
    // nothing excludes it.
    expect(
      probePage(WITH_CONDITION),
      `exclude-if="no-such-token" rendered nothing. An exclude naming a token ` +
        `nobody uses is a no-op and must emit its body — a build that drops it ` +
        `is deleting content, not gating it.`,
    ).toContain(EXCLUDE);
  });

  test("no inert-gate warning is emitted when the fallback resolves", () => {
    expect(
      buildLog(WITH_CONDITION),
      `the inert-gate warning fired on a build that DOES resolve a condition. ` +
        `Consumers fail CI on non-allowlisted WARNs, so a false positive here ` +
        `breaks every single-doc-set site that adopts the fallback.`,
    ).not.toContain("cannot fire");
  });
});

test.describe("no sections registered: the inert case is loud", () => {
  test.skip(
    !IS_FIXTURE_TARGET || !hasBuild(BARE),
    "needs `make build-nosections` (public-nosections-bare/)",
  );

  test("gates still emit nothing", () => {
    // Not a regression — the theme cannot invent a condition. The point is that
    // it no longer happens quietly; see the warning assertion below.
    const html = probePage(BARE);
    expect(html).not.toContain(INCLUDE);
    expect(html).not.toContain(EXCLUDE);
  });

  test("and the build WARNS about it", () => {
    const log = buildLog(BARE);
    expect(
      log,
      `no warning for a gate that cannot fire. This is the whole point: with ` +
        `no sections and no buildCondition every gate on the site is dropped ` +
        `in both directions, and the original bug was that it happened in ` +
        `silence. Consumers fail CI on non-allowlisted WARNs, so this is what ` +
        `surfaces it the first time somebody writes such a gate.`,
    ).toContain("cannot fire");
  });

  test("the warning names the source position and the fix", () => {
    const log = buildLog(BARE);
    // A warning that says only "something is wrong" costs more than it saves.
    expect(log, "warning does not cite the offending file").toMatch(
      /beta\/first\.md/,
    );
    expect(log, "warning does not name the remedy").toContain("buildCondition");
  });
});
