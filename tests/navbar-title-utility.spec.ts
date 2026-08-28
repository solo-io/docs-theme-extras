import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { TEST_PRODUCT_ROOT } from "./helpers/fixture";
import { target } from "./helpers/target";

// The navbar title must be styled with `hx:` utilities that ACTUALLY EXIST.
//
// WHY. Hextra ships a PRECOMPILED stylesheet. The only `hx:` utilities that
// exist are the ones Hextra's own layouts happen to use — this module cannot
// mint new ones by writing them in a class attribute, and Tailwind is not run
// over our templates. navbar-title.html carried `hx:md:inline`, which Hextra
// never uses and which therefore matched NO rule. The neighbouring `hx:hidden`
// then won at every breakpoint and the site title was invisible on every
// consumer that set `navbar.displayTitle = true`.
//
// It failed silently in both directions: a class that resolves to nothing
// produces no build warning, no console error, and no visual clue beyond an
// absent title — and `displayTitle` defaults to true, so a consumer that never
// touched the setting still lost its title.
//
// WHAT THIS PINS. Not "the title is visible" — that needs a browser at a
// specific viewport and would not say WHY it broke. It pins the actual
// invariant: every `hx:` class on that element resolves to a rule in the
// compiled stylesheet. A future edit that invents another utility fails here
// with the class name in the message.
//
// Related, and the reason this is worth a spec of its own: the same
// "Tailwind only emits what Hextra already uses" trap has bitten this module
// before, and the escape hatch is to write the rule in
// assets/css/docs-theme-extras.css rather than to invent an `hx:` class.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

const PARTIAL = path.resolve(
  __dirname,
  "..",
  "layouts",
  "partials",
  "navbar-title.html",
);

/** The compiled Hextra stylesheet emitted into the built site. */
function compiledCss(): string | null {
  const dir = path.join(TEST_PRODUCT_ROOT, "css", "compiled");
  if (!fs.existsSync(dir)) return null;
  const f = fs
    .readdirSync(dir)
    .find((n) => n.startsWith("main.min") && n.endsWith(".css"));
  return f ? fs.readFileSync(path.join(dir, f), "utf8") : null;
}

/**
 * Is there a rule for this utility? In the compiled output a class selector
 * escapes every colon, so `hx:md:inline-block` appears as `.hx\:md\:inline-block`.
 * The trailing boundary matters: without it `hx:md:inline` would match inside
 * `.hx\:md\:inline-block` and the very bug this guards would pass.
 */
function hasRule(css: string, cls: string): boolean {
  const escaped = cls.replace(/[.*+?^${}()|[\]\\]/g, "\\$&").replace(/:/g, "\\\\:");
  return new RegExp(`\\.${escaped}(?![\\w-])`).test(css);
}

test.describe("navbar title utilities", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "reads this module's own layouts/ and built CSS",
  );

  test("every hx: class on the title span resolves in the compiled CSS", () => {
    const src = fs.readFileSync(PARTIAL, "utf8");

    // The span guarded by navbar.displayTitle, identified by its content rather
    // than by class list — the class list is the thing under test.
    const m = src.match(/<span([^>]*)>\{\{-?\s*\.Site\.Title\s*-?\}\}<\/span>/);
    expect(
      m,
      "could not find the site-title <span> in navbar-title.html — if it was " +
        "restructured, update this spec rather than deleting it.",
    ).not.toBeNull();

    const classAttr = /class="([^"]*)"/.exec(m![1]);
    expect(classAttr, "title span carries no class attribute").not.toBeNull();

    const classes = classAttr![1].split(/\s+/).filter((c) => c.startsWith("hx:"));
    expect(
      classes.length,
      "no hx: utilities on the title span — this spec would certify nothing",
    ).toBeGreaterThan(0);

    const css = compiledCss();
    test.skip(css === null, "needs a build (public-oss/) for the compiled CSS");

    const unresolved = classes.filter((c) => !hasRule(css!, c));
    expect(
      unresolved,
      "hx: class(es) on the navbar title with NO rule in Hextra's compiled " +
        "stylesheet. Hextra precompiles its CSS, so only utilities Hextra " +
        "itself uses exist — an invented one silently matches nothing and the " +
        "adjacent hx:hidden wins. Use a utility Hextra already emits (it has " +
        "inline-block and inline-flex, but NOT bare inline), or add a real " +
        "rule to assets/css/docs-theme-extras.css.",
    ).toEqual([]);
  });

  test("the invented bare `hx:md:inline` is absent from the compiled CSS", () => {
    // Non-vacuity check for the test above. If Hextra ever DID start emitting
    // `hx:md:inline`, the assertion above would pass for the wrong reason and
    // nobody would notice the title span had regressed. This states the premise
    // the other test rests on, so it fails loudly if the premise changes.
    const css = compiledCss();
    test.skip(css === null, "needs a build (public-oss/) for the compiled CSS");

    expect(
      hasRule(css!, "hx:md:inline"),
      "Hextra now ships a bare `hx:md:inline` rule. The premise of this file " +
        "has changed — re-check navbar-title.html and update these notes.",
    ).toBe(false);

    // And the class the partial actually uses must be real.
    expect(
      hasRule(css!, "hx:md:inline-block"),
      "`hx:md:inline-block` no longer exists in Hextra's compiled CSS; the " +
        "navbar title needs a different utility or a local rule.",
    ).toBe(true);
  });
});
