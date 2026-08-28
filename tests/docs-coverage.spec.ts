import { test, expect } from "@playwright/test";
import { scan as scanDocs } from "./helpers/scan-docs";
import {
  check as genCheck,
  generate,
  formatSkipped,
  isOrphanPage,
} from "./helpers/gen-docs";
import { target } from "./helpers/target";

// Guard for a failure mode this repo had for its entire life until the docs
// site was built: a shortcode's comment header claiming to be the source of
// truth while the template underneath it had moved on.
//
// USAGE.md stated the contract — "each file under layouts/_shortcodes/ opens
// with a comment block describing its parameters and behavior" — and nothing
// checked it. When it was first measured, 6 of 29 shortcodes had no header at
// all, 21 parameters across 6 more were read by a template and named nowhere,
// and 5 themeExtras config keys were read in layouts/ and documented in no
// file anywhere. Every test was green throughout.
//
// The contract these specs enforce is in MAINTAINING.md, "The shortcode header
// contract". The generated reference pages under docs/content/authoring/
// shortcodes/ are built from those headers, so a stale header is not merely
// untidy — it publishes a wrong parameter table to the docs site.
//
// SCOPE. Everything here reads THIS repo's layouts/ and docs/ trees, not the
// target site's built HTML, so it is meaningless against a consumer's build and
// skips there. It lives in the "static" project because it is layout-shaped: a
// layouts/ change is exactly what invalidates it.
//
// WHY NOT A "PR touching layouts/ must also touch docs/ or CHANGELOG.md" CHECK.
// The docs-site plan proposed one. It inspects the DIFF rather than the tree,
// so it needs git state a Playwright spec does not have, and it is redundant:
// `gen:docs --check` below already fails any layouts/ change that alters a
// header without regenerating. A diff-shaped rule would also fire on a
// one-character CSS fix, which trains people to skip it.

const IS_FIXTURE_TARGET = target.name.startsWith("docs-theme-extras-fixture");

test.describe("docs coverage", () => {
  test.skip(
    !IS_FIXTURE_TARGET,
    "reads this module's own layouts/ and docs/ trees; meaningless against a consumer build",
  );

  // ── 1. Every header parses against the contract ────────────────────────────
  test("every shortcode header parses against the contract", () => {
    const { skipped, parsed } = generate();

    // ASSERT THE SCANNER FOUND SOMETHING. A glob that silently matches zero
    // files would report "0 non-conformant" and pass while certifying nothing
    // — the exact shape tests/HAZARDS.md catalogues. 20 is a floor well below
    // the real count, so it survives a deliberate deletion without needing an
    // edit, and still fails loudly if the directory moves.
    expect(
      parsed.length + skipped.length,
      "scan-docs matched almost no shortcodes — has layouts/_shortcodes/ moved? " +
        "A zero-match scan reports a clean result while measuring nothing.",
    ).toBeGreaterThan(20);

    expect(
      skipped.map((s) => (s as { name: string }).name),
      `Non-conformant shortcode header(s). The contract is in MAINTAINING.md, ` +
        `"The shortcode header contract"; layouts/_shortcodes/table.html is the ` +
        `reference implementation.\n\n${formatSkipped(skipped)}\n`,
    ).toEqual([]);
  });

  // ── 2. Every parameter the template reads is documented ────────────────────
  //
  // THIS IS THE CHECK WITH TEETH. The other four prove a document exists; this
  // one proves it is current. A header can satisfy every structural rule above
  // with a one-line Summary that says nothing, but it cannot satisfy this one
  // without naming each parameter the template actually reads.
  test("every parameter a template reads is documented in its header", () => {
    const { shortcodes } = scanDocs();

    const gaps = shortcodes
      .filter(
        (s) =>
          s.undocumented.length ||
          s.undocumentedViaPartial.length ||
          s.positionalUndocumented,
      )
      .map((s) => {
        const bits: string[] = [];
        if (s.undocumented.length) bits.push(`reads ${s.undocumented.join(", ")}`);
        // Delegated params matter MORE than direct ones, not less: the
        // shortcode reads nothing itself, so a presence-only check passes it
        // while it documents nothing. include-if and exclude-if reach
        // conditional-text this way and are among the most-used params here.
        if (s.undocumentedViaPartial.length)
          bits.push(`reads ${s.undocumentedViaPartial.join(", ")} via a partial`);
        if (s.positionalUndocumented)
          bits.push(`reads positional ${s.reads.positional.join(", ")} with no matching row`);
        return `${s.name}: ${bits.join("; ")}`;
      });

    expect(
      gaps,
      "Parameter(s) read by a template and not documented in its header. Add a " +
        "Parameters: row for each — a positional argument gets its own row with " +
        "the integer as its name. Run `npm run scan:docs` for the full report.",
    ).toEqual([]);
  });

  // ── 3. Every themeExtras key is described, not merely listed ───────────────
  //
  // The keys are DISCOVERED by scanning, so they always reach the generated
  // page. What can go missing is the prose, and a page that lists a key with no
  // explanation only relocates the original gap rather than closing it.
  test("every themeExtras config key has a description", () => {
    const { configParams } = scanDocs();

    expect(
      configParams.length,
      "no themeExtras.* keys found — has the scan root moved?",
    ).toBeGreaterThan(3);

    const page = generate().files.get("docs/content/configuration/params.md") ?? "";
    const undescribed = configParams
      .map((p) => p.key)
      .filter((k) => page.includes(`## \`themeExtras.${k}\`\n\n**Undocumented.**`));

    expect(
      undescribed,
      "themeExtras key(s) read by a template with no description. Add one to " +
        "PARAM_DOCS in tests/helpers/gen-docs.ts.",
    ).toEqual([]);
  });

  // ── 3b. A broken header must not DELETE the page it failed to generate ─────
  //
  // `write()` removes pages under docs/content/authoring/shortcodes/ that
  // generate() did not produce. A shortcode whose header stops parsing is
  // `skipped`, so it produces no page — and the first version of that cleanup
  // therefore deleted the documentation for any shortcode with a typo in its
  // header. Measured: renaming `Summary:` to `Summry:` in table.html made
  // `npm run gen:docs` unlink table.md and report it as "removed: 1
  // (orphaned)", which reads as intentional cleanup, inside a 22-file diff that
  // named the real cause nowhere.
  //
  // Pure-function tests on purpose: the alternative is a spec that deletes real
  // documentation to prove deletion works.
  test("a page is orphaned only when its SOURCE shortcode is gone", () => {
    const generated = new Set(["docs/content/authoring/shortcodes/table.md"]);
    const exists = (html: string) => html === "table.html" || html === "card.html";

    // Generated this run → keep.
    expect(isOrphanPage("table.md", generated, exists)).toBe(false);

    // THE REGRESSION: not generated (header broke) but the source is still
    // there → keep. If this ever returns true again, a typo silently deletes a
    // documentation page.
    expect(
      isOrphanPage("card.md", generated, exists),
      "a shortcode whose header failed to parse must KEEP its page — deleting " +
        "it turns a typo into data loss and blames 'orphaned' for it",
    ).toBe(false);

    // Genuinely deleted or renamed shortcode → remove. The cleanup must still
    // work, or stale pages accumulate and stay reachable.
    expect(
      isOrphanPage("removed-shortcode.md", generated, exists),
      "a page whose source shortcode no longer exists must still be cleaned up",
    ).toBe(true);

    // The index is written by generate() itself and is never a shortcode page.
    expect(isOrphanPage("_index.md", generated, exists)).toBe(false);
  });

  // ── 4. The committed generated tree matches its sources ────────────────────
  test("the generated docs tree is up to date", () => {
    const { changed } = genCheck();
    expect(
      changed,
      "The committed docs tree no longer matches what the sources generate. " +
        "Run `npm run gen:docs` and commit the result. An entry marked " +
        "(orphaned) is a page whose shortcode was renamed or deleted.",
    ).toEqual([]);
  });
});
