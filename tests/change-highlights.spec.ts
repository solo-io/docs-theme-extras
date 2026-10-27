import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";

// The change-highlights overlay is decided at BUILD time, by
// utils/change-highlights-enabled.html, and this spec pins that decision in
// the built HTML. The overlay's behavior in a browser is
// change-highlights-overlay.spec.ts.
//
// WHY THIS EXISTS. The switch has three states and two consumers of it, and
// each wrong answer is quiet:
//
//   - On in production would ship a review tool, plus every page's absolute
//     source path, to readers. Nothing renders visibly without a manifest, so
//     nobody would notice.
//   - Off in a PR preview that opted in is the opposite: the preview shows no
//     highlights and looks exactly like "this PR changed nothing visible".
//   - `reuse` records snippets only when the overlay is on, through the same
//     partial. If the two ever disagreed, production pages would carry the
//     Store bookkeeping, or previews would mark page text but miss snippets.
//
// The builds (see `make build-changes`):
//   public-oss              production, switch unset   → off
//   public-oss-changes      production, env var `true` → on
//   public-oss-changes-off  development, switch unset  → off
// The `true` build opts in through HUGO_PARAMS_THEMEEXTRAS_CHANGEHIGHLIGHTS on
// purpose: that environment variable is how a consumer's PR preview turns it
// on, so it is the path worth pinning. The development build pins that the
// default is on under `hugo server` ONLY, not in every non-production
// environment: a named environment (a translation or staging build) is a
// machine build that someone may deploy.

const ROOT = path.join(__dirname, "..");
const PAGE = path.join("test", "v2", "change-highlights", "index.html");

function read(dir: string, rel = PAGE): string | null {
  const file = path.join(ROOT, dir, rel);
  return fs.existsSync(file) ? fs.readFileSync(file, "utf8") : null;
}

function allHtml(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      if (e.isDirectory()) walk(p);
      else if (e.name.endsWith(".html")) out.push(p);
    }
  };
  walk(path.join(ROOT, dir));
  return out;
}

type Sources = { page: string; snippets: { resolved: string; written: string }[] };

function sources(html: string): Sources {
  const m = html.match(
    /<script type="?application\/json"? id="?extras-change-sources"?>([^<]*)<\/script>/,
  );
  expect(m, "the page should carry the extras-change-sources list").not.toBeNull();
  return JSON.parse(m![1]);
}

test.describe("change highlights: the build-time switch", () => {
  for (const dir of ["public-oss", "public-oss-changes-off"]) {
    test(`${dir}: no page carries the overlay`, () => {
      test.skip(!read(dir), `${dir} not built (make build-oss build-changes)`);
      const leaking = allHtml(dir).filter((f) => {
        const html = fs.readFileSync(f, "utf8");
        return (
          html.includes("extras-change-sources") ||
          html.includes("change-highlights.js") ||
          html.includes("change-highlights.css")
        );
      });
      expect(
        leaking.map((f) => path.relative(ROOT, f)),
        "the overlay is off in this build, so no page may load it",
      ).toEqual([]);
    });
  }

  test("public-oss-changes: a production build that opts in loads the overlay", () => {
    const html = read("public-oss-changes");
    test.skip(!html, "public-oss-changes not built (make build-changes)");
    expect(html).toMatch(/<link[^>]+href="?\/test\/css\/change-highlights\.css/);
    // The manifest URL goes through relURL, so it carries the baseURL path.
    // Without it, every consumer served under a subpath (the docs hub serves
    // each product under /<product>/) would fetch a manifest that 404s.
    expect(html).toMatch(
      /<script defer src="?\/test\/js\/change-highlights\.js"? data-manifest="?\/test\/_extras\/changes\.json/,
    );
    // A built preview's manifest never changes, so it must not poll. Only
    // `hugo server` sets data-poll.
    expect(html).not.toContain("data-poll");
  });
});

test.describe("change highlights: the source list the overlay matches against", () => {
  test("the page lists its own file and each snippet's resolved and written path", () => {
    const html = read("public-oss-changes");
    test.skip(!html, "public-oss-changes not built (make build-changes)");
    const list = sources(html!);

    // Relative to the project root, the same form as a git diff path. Never
    // the build machine's absolute path, which a public preview would expose.
    expect(list.page).toBe("fixture/content/en/test/v2/change-highlights.md");

    // A snippet reused twice is listed once. The overlay marks every copy on
    // the page from that one entry. Its resolved and written paths are equal.
    expect(list.snippets).toContainEqual({
      resolved: "conrefs/test/change-highlights-snippet.md",
      written: "conrefs/test/change-highlights-snippet.md",
    });
    expect(list.snippets.filter((s) => s.written === "conrefs/test/change-highlights-snippet.md")).toHaveLength(1);

    // The versioned snippet is listed as {resolved, written}. The overlay
    // matches the resolved path first, and the written one only as a
    // fallback, for a site that MOUNTS the written file at the resolved path
    // (so only the written path is in its git diff).
    expect(list.snippets).toContainEqual({
      resolved: "test/v2/conrefs/test/change-highlights-versioned.md",
      written: "conrefs/test/change-highlights-versioned.md",
    });
    expect(JSON.stringify(list)).not.toMatch(/"\/(Users|home)\//);
  });

  test("a page with no reuse lists only its own file", () => {
    const html = read("public-oss-changes", path.join("test", "v2", "change-highlights-new", "index.html"));
    test.skip(!html, "public-oss-changes not built (make build-changes)");
    expect(sources(html!)).toEqual({
      page: "fixture/content/en/test/v2/change-highlights-new.md",
      snippets: [],
    });
  });

  test("turning the overlay on changes nothing else on the page", () => {
    // The overlay adds markup to <head> and nothing else: the page body must
    // be byte-identical to the production build, so a preview shows exactly
    // what will ship. (Highlights are painted later, in the browser, without
    // touching the DOM text.)
    const on = read("public-oss-changes");
    const off = read("public-oss");
    test.skip(!on || !off, "public-oss and public-oss-changes both needed");
    const body = (h: string) => h.slice(h.indexOf("<body"));
    expect(body(on!)).toBe(body(off!));
  });
});
