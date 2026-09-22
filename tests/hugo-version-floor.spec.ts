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

// The one file allowed to touch the accessor, relative to layouts/.
const CANONICAL = "_partials/utils/default-lang.html";

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

test.describe("hugo.Sites is centralised behind a version guard", () => {
  test("no layout calls hugo.Sites outside utils/default-lang.html", () => {
    const files = walkHtml(LAYOUTS_DIR);
    // Guard against a vacuous pass if layouts/ ever moves.
    expect(files.length).toBeGreaterThan(0);

    const offenders: string[] = [];
    for (const file of files) {
      const rel = path.relative(LAYOUTS_DIR, file);
      if (rel === CANONICAL) continue;
      const src = blankHugoComments(fs.readFileSync(file, "utf8"));
      if (/\bhugo\.Sites\b/.test(src)) offenders.push(rel);
    }

    expect(
      offenders,
      `hugo.Sites needs Hugo >= 0.156.0 and must go through ` +
        `partial "utils/default-lang.html". Direct call sites found in:\n  ` +
        offenders.join("\n  "),
    ).toEqual([]);
  });

  test("the canonical partial still guards the call", () => {
    const file = path.join(LAYOUTS_DIR, CANONICAL);
    expect(fs.existsSync(file)).toBe(true);
    const src = blankHugoComments(fs.readFileSync(file, "utf8"));

    // Non-vacuous: the accessor is actually here, so the scan above is
    // excluding a real call rather than passing because nothing matches.
    expect(src).toMatch(/\bhugo\.Sites\b/);
    // The version guard, and the pre-0.156 fallback it guards.
    expect(src).toMatch(/ge\s+hugo\.Version\s+"0\.156\.0"/);
    expect(src).toMatch(/\bsite\.Sites\b/);
  });

  test("the comment blanker does not hide a real call", () => {
    const commented = `{{- /* hugo.Sites is the accessor */ -}}\n<p>ok</p>`;
    expect(/\bhugo\.Sites\b/.test(blankHugoComments(commented))) .toBe(false);

    const real = `{{- /* prose */ -}}\n{{ (index hugo.Sites 0).Language.Lang }}`;
    expect(/\bhugo\.Sites\b/.test(blankHugoComments(real))).toBe(true);
  });
});
