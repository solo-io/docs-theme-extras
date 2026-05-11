import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { target } from "./helpers/target";

// Smoke pass over a built product's HTML. Two invocation modes:
//
//   1. SMOKE_PRODUCT env var set → scans <target.builtRoot>/<SMOKE_PRODUCT>/.
//      Used by `make test-smoke PRODUCT=<name>` to spot-check any product
//      that builds alongside the test fixture under target.builtRoot.
//
//   2. SMOKE_PRODUCT not set → scans target.builtRoot directly.
//      For consumer repos whose CONFIG points at a single-product build.
//
// Asserts:
//   - the directory exists
//   - no shortcode delimiter leaks in any sampled HTML
//   - at least one rendered page emits the copy-as-md script tag

const PRODUCT = process.env.SMOKE_PRODUCT;
const SCAN_ROOT = PRODUCT ? path.join(target.builtRoot, PRODUCT) : target.builtRoot;
const LABEL = PRODUCT ?? target.name;
const ENABLED = target.shouldRun("smoke");
// 0 means unlimited — walks every HTML file under SCAN_ROOT.
const MAX_FILES = target.smoke.maxFiles;
const SAMPLE_LABEL = MAX_FILES === 0 ? "all pages" : `sample of ${MAX_FILES}`;

test.describe(`smoke: ${LABEL}`, () => {
  test.skip(!ENABLED, "smoke check disabled in CONFIG");

  test("product directory exists in build output", () => {
    expect(fs.existsSync(SCAN_ROOT), `${SCAN_ROOT} not found`).toBe(true);
  });

  test(`no shortcode delimiter leaks across html pages (${SAMPLE_LABEL})`, () => {
    if (!target.shouldRun("shortcodeLeaks")) {
      test.skip(true, "shortcodeLeaks check disabled in CONFIG");
    }
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    expect(htmlFiles.length, "no html pages found").toBeGreaterThan(0);
    const offenders: string[] = [];
    for (const f of htmlFiles) {
      const html = fs.readFileSync(f, "utf8");
      const visible = html
        .replace(
          /<script[^>]*type=["']text\/markdown["'][^>]*>[\s\S]*?<\/script>/gi,
          "",
        )
        .replace(/<pre[\s\S]*?<\/pre>/gi, "")
        .replace(/<code[\s\S]*?<\/code>/gi, "");
      if (/\{\{\s*[%<]/.test(visible) || /[%>]\s*\}\}/.test(visible)) {
        offenders.push(path.relative(SCAN_ROOT, f));
      }
    }
    expect(offenders, `shortcode leaks in ${LABEL}`).toEqual([]);
  });

  test("at least one page emits a copy-as-md script tag", () => {
    if (!target.shouldRun("copyAsMarkdown")) {
      test.skip(true, "copyAsMarkdown check disabled in CONFIG");
    }
    const htmlFiles = collectHtml(SCAN_ROOT, MAX_FILES);
    const hasCopyMd = htmlFiles.some((f) => {
      const html = fs.readFileSync(f, "utf8");
      return /<script[^>]*type=["']text\/markdown["']/i.test(html);
    });
    expect(hasCopyMd, `no copy-as-md found in any sampled page`).toBe(true);
  });
});

// Walk `root` depth-first, collecting `*.html` files. `max === 0` means
// unlimited — walk every file. Otherwise stop once `max` files are gathered.
function collectHtml(root: string, max: number): string[] {
  const unlimited = max === 0;
  const out: string[] = [];
  const stack = [root];
  while (stack.length && (unlimited || out.length < max)) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      if (!unlimited && out.length >= max) break;
      const p = path.join(dir, e.name);
      if (e.isDirectory()) stack.push(p);
      else if (e.isFile() && e.name.endsWith(".html")) out.push(p);
    }
  }
  return out;
}
