import { test, expect } from "@playwright/test";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { filesOver, formatMiB, mibToBytes, WARN_RATIO } from "./helpers/file-size";
import { target } from "./helpers/target";

// Per-file size guard for the built site.
//
// Cloudflare Pages rejects any single file over 25 MiB, and the whole deploy
// fails rather than skipping the file. Nothing in a PR build notices: Hugo
// builds the page, every other spec passes, and the failure shows up only at
// deploy time, after merge. The file most likely to cross the line is a
// generated reference page — agentgateway's standalone configuration schema
// page was already 16 MiB on the OSS site and 18 MiB on the docs hub when this
// spec was added — so it grows a little with each release until one release
// tips it over.
//
// The limit is [limits].maxFileMiB, default 25 for Cloudflare Pages. A
// consumer on another host sets that host's limit: the docs hub, on Firebase
// Hosting, sets 2048 (2 GB).
//
// Two tiers:
//   - over the limit: fail, naming every offender.
//   - over WARN_RATIO of the limit: pass, but attach a warning annotation to
//     the test and print it, so the report says which files are getting close.
//
// Walks the whole target.builtRoot, every file type, not target.builtScanRoot:
// the host uploads everything under the publish dir.

const ENABLED = target.shouldRun("fileSize");

// ── Unit tests on the helper ────────────────────────────────────────

test.describe("file-size helper", () => {
  let dir: string;

  test.beforeAll(() => {
    dir = fs.mkdtempSync(path.join(os.tmpdir(), "file-size-"));
    fs.mkdirSync(path.join(dir, "a", "b"), { recursive: true });
    fs.writeFileSync(path.join(dir, "small.html"), "x".repeat(10));
    fs.writeFileSync(path.join(dir, "a", "exact.json"), "x".repeat(100));
    fs.writeFileSync(path.join(dir, "a", "b", "big page.html"), "x".repeat(101));
    fs.writeFileSync(path.join(dir, "a", "bigger.png"), "x".repeat(500));
    fs.symlinkSync(path.join(dir, "a", "bigger.png"), path.join(dir, "link.png"));
  });

  test.afterAll(() => {
    fs.rmSync(dir, { recursive: true, force: true });
  });

  test("reports files strictly over the limit, every type, largest first", () => {
    expect(filesOver(dir, 100)).toEqual([
      { rel: "a/bigger.png", bytes: 500 },
      { rel: "a/b/big page.html", bytes: 101 },
    ]);
  });

  test("a file exactly at the limit passes", () => {
    expect(filesOver(dir, 100).map((f) => f.rel)).not.toContain("a/exact.json");
  });

  test("symlinks are not counted twice", () => {
    expect(filesOver(dir, 0).map((f) => f.rel)).not.toContain("link.png");
  });

  test("a missing root yields nothing rather than throwing", () => {
    expect(filesOver(path.join(dir, "nope"), 0)).toEqual([]);
  });

  test("MiB converts to bytes the way Cloudflare counts its 25 MiB limit", () => {
    expect(mibToBytes(25)).toBe(26_214_400);
    expect(mibToBytes(2048)).toBe(2_147_483_648);
  });
});

// ── Scan the built site ─────────────────────────────────────────────

test.describe("built file sizes", () => {
  test.skip(!ENABLED, "fileSize check disabled in CONFIG");

  const root = target.builtRoot;
  test.skip(!fs.existsSync(root), "builtRoot not built yet — run the Hugo build first");

  const limitMiB = target.limits.maxFileMiB;
  const limit = mibToBytes(limitMiB);
  const warnAt = mibToBytes(limitMiB * WARN_RATIO);

  test(`no built file exceeds the ${formatMiB(limit)} per-file limit`, () => {
    const near = filesOver(root, warnAt);
    const over = near.filter((f) => f.bytes > limit);

    for (const f of near.filter((f) => f.bytes <= limit)) {
      const msg = `${f.rel} is ${formatMiB(f.bytes)}, within ${formatMiB(limit - f.bytes)} of the ${formatMiB(limit)} per-file limit`;
      test.info().annotations.push({ type: "warning", description: msg });
      console.warn(`[file-size] ${msg}`);
    }

    const list = over.map((f) => `${formatMiB(f.bytes).padStart(10)}  ${f.rel}`).join("\n  ");
    expect(
      over.length,
      `${over.length} built file(s) exceed ${formatMiB(limit)}, the per-file limit set by ` +
        `[limits].maxFileMiB (default 25, the Cloudflare Pages limit). The host rejects ` +
        `a file over its limit and fails the whole deploy. Split the page, trim what ` +
        `generates it, or exclude the file from the publish dir. If your host allows ` +
        `larger files, set [limits].maxFileMiB to its limit instead.\n  ${list}`,
    ).toBe(0);
  });
});
