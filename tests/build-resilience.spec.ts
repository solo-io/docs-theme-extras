import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  blankHugoComments,
  getRemoteCalls,
  findUncappedGetRemote,
  findUndefaultedTimeoutVar,
  findUnguardedDocContent,
} from "./helpers/remote-fetch";

// Source-level guards for the v0.1.20 build-resilience changes:
//   1. every build-time resources.GetRemote is capped with a timeout
//   2. rebase.html no longer dereferences $doc.Content unguarded
//
// These are theme-source invariants (they scan this module's own layouts/,
// resolved relative to this spec), not fixture-build assertions — so they run
// wherever the theme source is present and skip otherwise. Rationale for a
// source scan over a runtime test: the failure mode is a build HANG on an
// unreachable remote, which would need a black-holed network to reproduce and
// would trip the hugo-warnings gate; pinning the invariant at the source is
// deterministic, fast, and catches the exact regression (a new/edited fetch
// that forgets the cap).

const LAYOUTS_DIR = path.resolve(__dirname, "..", "layouts");

// Files known to fetch a remote at build time. Asserting each still carries a
// capped call guards against a fetch silently losing its cap AND against the
// scanner silently matching nothing (a path/refactor that makes the scan a
// vacuous pass).
const KNOWN_FETCHERS = [
  "_partials/scripts/mermaid.html",
  "_partials/scripts/search.html",
  "_shortcodes/github.html",
  "_shortcodes/github-table.html",
  "_shortcodes/openapi.html",
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

// ── Pure-unit tests for the scanner (no build needed) ───────────────

test.describe("GetRemote timeout scanner", () => {
  test("flags an uncapped call", () => {
    const src = `{{ $r := resources.GetRemote $url }}`;
    const v = findUncappedGetRemote(src, "x.html");
    expect(v).toHaveLength(1);
    expect(v[0].line).toBe(1);
  });

  test("passes a call capped with a timeout dict", () => {
    const src = `{{ $r := resources.GetRemote $url (dict "timeout" "15s") }}`;
    expect(findUncappedGetRemote(src, "x.html")).toEqual([]);
  });

  test("passes a call capped across multiple lines", () => {
    const src = `{{ with try (resources.GetRemote $url\n    (dict "timeout" "15s")) }}\n{{ end }}`;
    expect(findUncappedGetRemote(src, "x.html")).toEqual([]);
  });

  test("still flags an uncapped call wrapped in try/with", () => {
    const src = `{{ with try (resources.GetRemote $url) }}{{ end }}`;
    expect(findUncappedGetRemote(src, "x.html")).toHaveLength(1);
  });

  test("does NOT count a GetRemote named in a Hugo comment", () => {
    const src = `{{/* the resources.GetRemote below has no timeout in this prose */}}\n{{ resources.GetRemote $url (dict "timeout" "15s") }}`;
    // one real capped call, comment ignored
    expect(getRemoteCalls(src, "x.html")).toHaveLength(1);
    expect(findUncappedGetRemote(src, "x.html")).toEqual([]);
  });

  test("finds every call when multiple sit in one file", () => {
    const src = `{{ resources.GetRemote $a (dict "timeout" "15s") }}\n{{ resources.GetRemote $b }}`;
    expect(getRemoteCalls(src, "x.html")).toHaveLength(2);
    expect(findUncappedGetRemote(src, "x.html")).toHaveLength(1);
  });

  test("blankHugoComments preserves line numbers", () => {
    const src = `line1\n{{/* two\nline comment */}}\nline4`;
    expect(blankHugoComments(src).split("\n")).toHaveLength(4);
  });
});

test.describe("variable-timeout scanner", () => {
  test("passes a literal timeout (nothing to check)", () => {
    const src = `{{ resources.GetRemote $url (dict "timeout" "15s") }}`;
    expect(findUndefaultedTimeoutVar(src, "x.html")).toEqual([]);
  });

  test("passes a variable timeout that is assigned through default", () => {
    const src = `{{ $t := default "15s" (.Get "timeout") }}\n{{ resources.GetRemote $url (dict "timeout" $t) }}`;
    expect(findUndefaultedTimeoutVar(src, "x.html")).toEqual([]);
  });

  test("flags a variable timeout taken straight from .Get", () => {
    const src = `{{ $t := .Get "timeout" }}\n{{ resources.GetRemote $url (dict "timeout" $t) }}`;
    expect(findUndefaultedTimeoutVar(src, "x.html")).toHaveLength(1);
  });

  test("flags a variable timeout that is never assigned at all", () => {
    const src = `{{ resources.GetRemote $url (dict "timeout" $t) }}`;
    expect(findUndefaultedTimeoutVar(src, "x.html")).toHaveLength(1);
  });

  test("does not confuse a similarly named variable for the real one", () => {
    const src = `{{ $timeoutLabel := default "15s" "x" }}\n{{ resources.GetRemote $url (dict "timeout" $timeout) }}`;
    expect(findUndefaultedTimeoutVar(src, "x.html")).toHaveLength(1);
  });
});

test.describe("rebase $doc.Content guard scanner", () => {
  test("flags an unguarded $doc.Content deref", () => {
    expect(findUnguardedDocContent(`{{ $c := $doc.Content }}`)).toEqual([1]);
  });

  test("does not flag .Content read inside a with $doc block", () => {
    const src = `{{ with $doc }}{{ $c = .Content }}{{ else }}{{ errorf "x" }}{{ end }}`;
    expect(findUnguardedDocContent(src)).toEqual([]);
  });
});

// ── Real-source scan of the module's own layouts/ ───────────────────

test.describe("theme templates: no uncapped build-time remote fetch", () => {
  test.skip(!fs.existsSync(LAYOUTS_DIR), "theme layouts/ not present (consumer target)");

  const files = walkHtml(LAYOUTS_DIR);
  const allCalls = files.flatMap((f) =>
    getRemoteCalls(fs.readFileSync(f, "utf8"), path.relative(LAYOUTS_DIR, f)),
  );

  test("every resources.GetRemote passes a timeout", () => {
    const uncapped = allCalls.filter((c) => !c.capped);
    expect(
      uncapped,
      `uncapped GetRemote(s): ${uncapped.map((c) => `${c.file}:${c.line}`).join(", ")}`,
    ).toEqual([]);
  });

  test("every variable timeout has a literal default", () => {
    const offenders = files.flatMap((f) =>
      findUndefaultedTimeoutVar(
        fs.readFileSync(f, "utf8"),
        path.relative(LAYOUTS_DIR, f),
      ),
    );
    expect(offenders, offenders.join("\n")).toEqual([]);
  });

  test("the scan actually found the known build-time fetches", () => {
    // Guards a vacuous pass: if the scanner matched nothing (wrong path,
    // renamed API), the timeout assertion above would pass for the wrong
    // reason. All current call sites total 8.
    expect(allCalls.length).toBeGreaterThanOrEqual(8);
  });

  for (const rel of KNOWN_FETCHERS) {
    test(`${rel} still carries a capped remote fetch`, () => {
      const abs = path.join(LAYOUTS_DIR, rel);
      expect(fs.existsSync(abs), `${rel} missing`).toBe(true);
      const calls = getRemoteCalls(fs.readFileSync(abs, "utf8"), rel);
      expect(calls.length, `${rel} has no GetRemote`).toBeGreaterThanOrEqual(1);
      expect(calls.every((c) => c.capped), `${rel} has an uncapped fetch`).toBe(
        true,
      );
    });
  }
});

test.describe("search.html: a transient CDN fetch failure falls back to a runtime <script>, not a fatal errorf", () => {
  // Companion to the timeout cap above. The cap makes a slow/unreachable CDN
  // fail FAST; this guards what happens on that failure: search.html must NOT
  // `errorf` (which fails the whole build on a network blip we don't control —
  // e.g. "connection reset by peer") but `warnf` and emit a runtime CDN
  // `<script src>` so the build stays green and search still works. Same
  // source-scan rationale as the timeout guard: reproducing a real fetch
  // failure needs a black-holed network, so the invariant is pinned at source.
  const SEARCH = path.join(LAYOUTS_DIR, "_partials/scripts/search.html");
  test.skip(!fs.existsSync(SEARCH), "search.html not present (consumer target)");

  const src = fs.existsSync(SEARCH) ? fs.readFileSync(SEARCH, "utf8") : "";
  // Isolate the remote-fetch error branch only: from the capped GetRemote of
  // the FlexSearch bundle to the `else with .Value` that begins the success
  // path. The `errorf`s further down (local/misconfigured base) are a
  // different, non-transient failure and are intentionally left fatal.
  const fetchIdx = src.indexOf("resources.GetRemote $flexSearchJsUrl");
  const errStart = src.indexOf("with .Err", fetchIdx);
  const errEnd = src.indexOf("else with .Value", errStart);
  const errBranch =
    errStart >= 0 && errEnd > errStart ? src.slice(errStart, errEnd) : "";

  test("the capped remote fetch and its .Err branch were located", () => {
    expect(
      fetchIdx,
      "no capped GetRemote for the FlexSearch bundle — scan would vacuously pass",
    ).toBeGreaterThanOrEqual(0);
    expect(
      errBranch.length,
      "could not isolate the GetRemote .Err branch",
    ).toBeGreaterThan(0);
  });

  test("does not errorf (fail the build) on a transient fetch failure", () => {
    expect(
      errBranch.includes("errorf"),
      "the remote-fetch failure branch still calls errorf — a transient CDN error will fail the whole build",
    ).toBe(false);
  });

  test("warns and emits a runtime CDN <script> fallback pointing at the same pinned URL", () => {
    expect(errBranch, "no warnf on the fetch-failure branch").toMatch(/warnf/);
    expect(
      errBranch,
      "no runtime <script src> fallback on the fetch-failure branch",
    ).toMatch(/<script[^>]*\bsrc=/);
    expect(
      errBranch.includes("$flexSearchJsUrl"),
      "fallback does not point at the pinned CDN URL",
    ).toBe(true);
  });
});

test.describe("theme templates: rebase reads resource content guarded", () => {
  const REBASE = path.join(LAYOUTS_DIR, "_shortcodes/rebase.html");
  test.skip(!fs.existsSync(REBASE), "rebase.html not present (consumer target)");

  test("rebase.html has no unguarded $doc.Content deref", () => {
    const hits = findUnguardedDocContent(fs.readFileSync(REBASE, "utf8"));
    expect(
      hits,
      `unguarded $doc.Content at line(s) ${hits.join(", ")} — read .Content inside {{ with $doc }} instead`,
    ).toEqual([]);
  });
});
