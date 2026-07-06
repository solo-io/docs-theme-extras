import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { target } from "./helpers/target";

// Guards that the module's own docs templates (docs/single.html and
// docs/list.html) render the `components/page-feedback.html` widget when
// `site.Params.feedback.enable` is set. Added in v0.1.14 so a consumer using
// the module's docs templates (e.g. agentregistry) gets the feedback buttons
// from config alone — this locks in the partial call so a future template
// refactor can't silently drop it.
//
// The bundled fixture enables feedback (hugo-oss/enterprise.toml
// [params.feedback]); a consumer that leaves feedback unset renders nothing
// (the partial self-gates), and a consumer that overrides the docs templates
// wholesale (agw/kgw) supplies its own call — so this is gated to the fixture.
// Server-rendered markup, read statically (no browser).

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("docs templates render the page-feedback widget", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "fixture-only: the fixture enables feedback; consumers opt in via their own config",
  );

  // A versioned content page renders through docs/single.html.
  const single = target.pages.find((p) => target.versionOf(p.url) !== null);
  // The docs landing renders through docs/list.html.
  const list = target.pages.find((p) => target.versionOf(p.url) === null);

  for (const [label, page] of [["single", single], ["list", list]] as const) {
    test(`${label}-layout page renders the feedback widget`, () => {
      test.skip(!page, `no ${label}-layout page configured`);
      const html = fs.readFileSync(target.fileForUrl(page!.url), "utf8");
      expect(html, `page-feedback container missing on ${page!.url}`).toContain(
        'id="page-feedback"',
      );
      expect(html, `feedback prompt missing on ${page!.url}`).toContain(
        "Was this page helpful?",
      );
      expect(html, `submitPageFeedback handler missing on ${page!.url}`).toContain(
        "submitPageFeedback",
      );
    });
  }
});
