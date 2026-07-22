import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  findMissingImages,
  extractImageRefs,
  isLocalImage,
  resolveImagePath,
  srcsetUrls,
  __test,
} from "./helpers/missing-images";
import { target } from "./helpers/target";

// Framework-level scanner for image references that point at a file the build
// never published. Catches the class of bug where an <img>/<source> resolves
// — through a typo, a missing per-version reuse-image override, or a bad card
// `image=` — to a same-origin path that 404s, so the reader gets a broken
// image and the link checker (if run) flags it later. See ./helpers/
// missing-images.ts for the extraction/resolution rules.
//
// Two layers, mirroring markdown-leaks.spec.ts:
//   1. Unit tests on the pure helpers (deterministic synthetic input, an
//      injected `exists` so no real filesystem is touched).
//   2. A scan over every built HTML page under target.builtScanRoot,
//      resolving each local reference against target.builtRoot and failing on
//      any that isn't on disk.
//
// Allowlist via [allowlists].missingImages in the CONFIG TOML (regex strings
// matched against the offending src) for the rare intentionally-unpublished
// reference (e.g. an asset a downstream build injects).

const ENABLED = target.shouldRun("missingImages");

// ── Unit tests on the helpers ───────────────────────────────────────

test.describe("missing-images helpers", () => {
  test("isLocalImage skips remote, protocol-relative, data, and fragment refs", () => {
    expect(isLocalImage("/img/x.svg")).toBe(true);
    expect(isLocalImage("img/x.svg")).toBe(true);
    expect(isLocalImage("../img/x.svg")).toBe(true);
    expect(isLocalImage("https://cdn.example.com/x.png")).toBe(false);
    expect(isLocalImage("http://example.com/x.png")).toBe(false);
    expect(isLocalImage("//cdn.example.com/x.png")).toBe(false);
    expect(isLocalImage("data:image/svg+xml;base64,AAAA")).toBe(false);
    expect(isLocalImage("#anchor")).toBe(false);
    expect(isLocalImage("   ")).toBe(false);
  });

  test("extractImageRefs pulls local <img src> and skips remote ones", () => {
    const html = `
      <p><img src="/img/local.svg" alt="a"></p>
      <img src='img/relative.png' alt="b"/>
      <img src="https://cdn.example.com/remote.png" alt="c">
      <img src="data:image/png;base64,AAAA" alt="d">
    `;
    const refs = extractImageRefs(html);
    const srcs = refs.filter((r) => r.attr === "src").map((r) => r.src);
    expect(srcs).toEqual(["/img/local.svg", "img/relative.png"]);
  });

  test("extractImageRefs pulls each local URL out of a <source>/<img> srcset", () => {
    // The light/dark <picture> variants the theme emits.
    const html = `
      <picture>
        <source srcset="/img/dark.svg 1x, /img/dark@2x.svg 2x" media="(prefers-color-scheme: dark)">
        <img src="/img/light.svg" srcset="https://cdn.example.com/x.png 2x" alt="e">
      </picture>
    `;
    const refs = extractImageRefs(html);
    const setSrcs = refs.filter((r) => r.attr === "srcset").map((r) => r.src);
    // Both local srcset URLs, remote one dropped.
    expect(setSrcs).toEqual(["/img/dark.svg", "/img/dark@2x.svg"]);
    expect(refs.some((r) => r.attr === "src" && r.src === "/img/light.svg")).toBe(
      true,
    );
  });

  test("srcsetUrls takes the URL token from each candidate", () => {
    expect(srcsetUrls("a.png 1x, b.png 2x")).toEqual(["a.png", "b.png"]);
    expect(srcsetUrls("a.png 480w,  b.png 800w")).toEqual(["a.png", "b.png"]);
    expect(srcsetUrls("solo.png")).toEqual(["solo.png"]);
  });

  test("does NOT extract <img> inside <script>, <style>, or HTML comments", () => {
    const html = `
      <script type="text/markdown"><img src="/img/embedded-source.svg"></script>
      <style>.x { background: url(/img/in-css.svg); }</style>
      <!-- <img src="/img/commented-out.svg"> -->
      <img src="/img/real.svg" alt="real">
    `;
    const srcs = extractImageRefs(html).map((r) => r.src);
    expect(srcs).toEqual(["/img/real.svg"]);
  });

  test("resolveImagePath resolves absolute refs against builtRoot", () => {
    const p = resolveImagePath(
      "/img/x.svg",
      "/build/test/main/everything/index.html",
      "/build",
      path,
    );
    expect(p).toBe(path.join("/build", "img/x.svg"));
  });

  test("resolveImagePath resolves relative refs against the page directory", () => {
    const p = resolveImagePath(
      "../shared/x.svg",
      "/build/test/main/everything/index.html",
      "/build",
      path,
    );
    expect(p).toBe(path.resolve("/build/test/main/everything", "../shared/x.svg"));
  });

  test("resolveImagePath strips query string and fragment, decodes percent-encoding", () => {
    expect(resolveImagePath("/img/x.svg?v=2", "/b/p/index.html", "/b", path)).toBe(
      path.join("/b", "img/x.svg"),
    );
    expect(resolveImagePath("/img/x.svg#icon", "/b/p/index.html", "/b", path)).toBe(
      path.join("/b", "img/x.svg"),
    );
    expect(
      resolveImagePath("/img/my%20image.svg", "/b/p/index.html", "/b", path),
    ).toBe(path.join("/b", "img/my image.svg"));
  });

  test("findMissingImages flags only references absent from disk", () => {
    const present = new Set([
      path.join("/build", "img/present.svg"),
      path.join("/build", "test/main/everything/rel-present.svg"),
    ]);
    const html = `
      <img src="/img/present.svg" alt="ok absolute">
      <img src="rel-present.svg" alt="ok relative">
      <img src="/img/GONE.svg" alt="missing absolute">
      <img src="missing-rel.svg" alt="missing relative">
      <img src="https://cdn.example.com/x.png" alt="remote skipped">
    `;
    const missing = findMissingImages(html, {
      pageFile: "/build/test/main/everything/index.html",
      builtRoot: "/build",
      exists: (p) => present.has(p),
      pathMod: path,
    });
    expect(missing.map((m) => m.src).sort()).toEqual([
      "/img/GONE.svg",
      "missing-rel.svg",
    ]);
  });

  test("findMissingImages respects the allowlist", () => {
    const html = `
      <img src="/img/injected-later.svg" alt="a">
      <img src="/img/typo.svg" alt="b">
    `;
    const missing = findMissingImages(html, {
      pageFile: "/build/p/index.html",
      builtRoot: "/build",
      exists: () => false,
      allowlist: [/injected-later/],
      pathMod: path,
    });
    expect(missing.map((m) => m.src)).toEqual(["/img/typo.svg"]);
  });

  test("stripUnscanned preserves length so tag offsets stay aligned", () => {
    const html = `<p>before</p><script>var x = "<img src='/y.svg'>";</script><p>after</p>`;
    const stripped = __test.stripUnscanned(html);
    expect(stripped.length).toBe(html.length);
  });
});

// ── Full-build scan ─────────────────────────────────────────────────

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

test.describe("missing-images: rendered HTML scan", () => {
  test.skip(!ENABLED, "missingImages check disabled in CONFIG");

  test("every local image reference resolves to a published file", () => {
    const scanRoot = target.builtScanRoot;
    const files = walkHtml(scanRoot);
    expect(files.length, `no html under ${scanRoot}`).toBeGreaterThan(0);

    const allowlist = target.missingImagesAllowlist;
    // Cache existsSync — the same asset (logos, shared diagrams) is referenced
    // from hundreds of pages, so memoizing avoids a stat storm on large builds.
    const existsCache = new Map<string, boolean>();
    const exists = (p: string): boolean => {
      const hit = existsCache.get(p);
      if (hit !== undefined) return hit;
      const v = fs.existsSync(p);
      existsCache.set(p, v);
      return v;
    };

    type Offender = { file: string; src: string; context: string };
    const offenders: Offender[] = [];

    for (const f of files) {
      const html = fs.readFileSync(f, "utf8");
      const missing = findMissingImages(html, {
        pageFile: f,
        builtRoot: target.builtRoot,
        exists,
        pathMod: path,
        allowlist,
      });
      for (const m of missing) {
        offenders.push({
          file: path.relative(scanRoot, f),
          src: m.src,
          context: m.context,
        });
      }
    }

    if (offenders.length > 0) {
      // Group by src so a single missing shared asset referenced from many
      // pages reports once with a page count, not N noisy lines.
      const bySrc = new Map<string, Offender[]>();
      for (const o of offenders) {
        const arr = bySrc.get(o.src) ?? [];
        arr.push(o);
        bySrc.set(o.src, arr);
      }
      const lines: string[] = [];
      for (const [src, group] of bySrc) {
        lines.push(`\n${src} (${group.length} page(s)):`);
        for (const o of group.slice(0, 5)) {
          lines.push(`  ${o.file}`);
          lines.push(`    context: ${o.context}`);
        }
        if (group.length > 5) lines.push(`  ... and ${group.length - 5} more page(s).`);
      }
      expect(
        offenders,
        `Found ${offenders.length} missing image reference(s) in built HTML:${lines.join("\n")}\n\n` +
          `Each src resolved to a file that was not published under ${target.builtRoot}. ` +
          `Fix the source path (or the missing per-version reuse-image override), or — ` +
          `if the reference is intentionally supplied by a downstream build — add a regex ` +
          `to [allowlists].missingImages in your CONFIG TOML.`,
      ).toEqual([]);
    }
  });
});
