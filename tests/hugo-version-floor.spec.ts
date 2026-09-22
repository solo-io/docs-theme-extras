import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// Source-level guard for the `hugo.Sites` compatibility shim.
//
// `hugo.Sites` does not exist before Hugo 0.156.0. On an older Hugo the
// template engine cannot resolve the field and the build dies with
//
//     can't evaluate field Sites in type interface {}
//
// deep inside a partial chain, with nothing in the message naming a version.
// Because utils/resolve-sections.html runs from navbar.html on EVERY page, one
// unguarded reference takes down every page of a consumer's build.
//
// That is not hypothetical. ambientmesh.io's Cloudflare Pages build image was
// pinned to Hugo 0.154.5 through a dashboard environment variable — invisible
// from the repo, and unrelated to the 0.160.1 its GitHub Actions CI pinned — so
// CI stayed green while every deploy failed with the message above.
//
// The accessor is therefore centralised in utils/default-lang.html, which
// version-guards it and falls back to the pre-0.156 `site.Sites`. This spec
// pins that centralisation: a new or edited layout that reaches for
// `hugo.Sites` directly fails here instead of in a consumer's deploy.
//
// A source scan rather than a build assertion, for the same reason
// build-resilience.spec.ts scans: reproducing the failure needs a second Hugo
// binary at a version CI does not install, whereas the invariant — exactly one
// call site — is deterministic and cheap to check.
//
// This is NOT a claim that the theme supports pre-0.156 Hugo. CI pins 0.160.1
// and consumers should match it. The shim only keeps an older consumer's build
// working rather than failing unreadably.

const LAYOUTS_DIR = path.resolve(__dirname, "..", "layouts");

// Version-gated accessors, and the one file each is allowed to live in.
//
// A TABLE RATHER THAN A CONSTANT, because the failure class is "a template
// reaches for something the consumer's Hugo does not have", not "a template
// says hugo.Sites". The identifier that caused the incident is one instance;
// the next one will be a different name with the same shape, and a spec that
// can only see this one will not be there for it.
//
// TO ADD AN ENTRY: name the accessor, the Hugo version that introduced it, and
// the partial that version-guards it. The guard partial must assign and return
// once at top level — on pre-0.156 Hugo a `return` nested inside an `if` is
// parsed as an ordinary function call and fails with `wrong number of args for
// return: want 0 got 1`, which would defeat the point of the guard.
//
// WHAT DOES NOT BELONG HERE: anything introduced at or below the floor this
// module is known to build on (0.154.5 — see README.md, "Hugo version"). The
// accessors the newer code in this release uses were all checked against it:
// `try` (0.141.0), `.Page.Store` (0.128.0), `reflect.IsMap`,
// `transform.Unmarshal` and `os.ReadFile` all predate it, so none is gated.
const GUARDED = [
  {
    // Does not exist before Hugo 0.156.0. utils/resolve-sections.html runs from
    // navbar.html on EVERY page, so one unguarded reference takes down every
    // page of a consumer's build.
    identifier: "hugo.Sites",
    since: "0.156.0",
    canonical: "_partials/utils/default-lang.html",
    // The fallback the guard selects below `since`. Asserted to still be there:
    // it is deprecated on current Hugo, and the day it is REMOVED this spec
    // should be what notices, not a consumer's deploy.
    fallback: "site.Sites",
  },
];

function walkHtml(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
    }
  }
  return out;
}

// Hugo comments ({{/* … */}}) and the `{{- /* … */ -}}` form carry prose that
// legitimately names the accessor — every call site's rationale block does.
// Blank them before scanning so documentation does not read as a call.
function blankHugoComments(src: string): string {
  return src.replace(/\{\{-?\s*\/\*[\s\S]*?\*\/\s*-?\}\}/g, (m) =>
    m.replace(/[^\n]/g, " "),
  );
}

// `hugo.Sites` -> /\bhugo\.Sites\b/, with the dot escaped.
function identifierRe(identifier: string): RegExp {
  return new RegExp(`\\b${identifier.replace(/\./g, "\\.")}\\b`);
}

test.describe("version-gated accessors are centralised behind a guard", () => {
  // Non-vacuous: an empty table would make every test below pass by iterating
  // nothing, which is the shape HAZARDS.md catalogues.
  test("the guarded-accessor table is populated", () => {
    expect(GUARDED.length).toBeGreaterThan(0);
  });

  for (const { identifier, since, canonical, fallback } of GUARDED) {
    test(`no layout calls ${identifier} outside ${canonical}`, () => {
      const files = walkHtml(LAYOUTS_DIR);
      // Guard against a vacuous pass if layouts/ ever moves.
      expect(files.length).toBeGreaterThan(0);

      const re = identifierRe(identifier);
      const offenders: string[] = [];
      for (const file of files) {
        const rel = path.relative(LAYOUTS_DIR, file);
        if (rel === canonical) continue;
        const src = blankHugoComments(fs.readFileSync(file, "utf8"));
        if (re.test(src)) offenders.push(rel);
      }

      expect(
        offenders,
        `${identifier} needs Hugo >= ${since} and must go through ` +
          `${canonical}. Direct call sites found in:\n  ` +
          offenders.join("\n  "),
      ).toEqual([]);
    });

    test(`${canonical} still guards ${identifier}`, () => {
      const file = path.join(LAYOUTS_DIR, canonical);
      expect(fs.existsSync(file)).toBe(true);
      const src = blankHugoComments(fs.readFileSync(file, "utf8"));

      // Non-vacuous: the accessor is actually here, so the scan above is
      // excluding a real call rather than passing because nothing matches.
      expect(src).toMatch(identifierRe(identifier));
      // The version guard itself, pinned to the version in the table so the
      // two cannot drift apart.
      expect(src).toMatch(
        new RegExp(`ge\\s+hugo\\.Version\\s+"${since.replace(/\./g, "\\.")}"`),
      );
      // The fallback the guard selects below `since`. If a future Hugo removes
      // it, this is where that should surface.
      expect(src).toMatch(identifierRe(fallback));
    });
  }

  test("the comment blanker does not hide a real call", () => {
    const commented = `{{- /* hugo.Sites is the accessor */ -}}\n<p>ok</p>`;
    expect(/\bhugo\.Sites\b/.test(blankHugoComments(commented))) .toBe(false);

    const real = `{{- /* prose */ -}}\n{{ (index hugo.Sites 0).Language.Lang }}`;
    expect(/\bhugo\.Sites\b/.test(blankHugoComments(real))).toBe(true);
  });
});
