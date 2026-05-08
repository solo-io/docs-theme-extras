import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  findUnquotedUrls,
  findUnquotedUrlsInBlock,
  extractFencedBlocks,
} from "./helpers/curl-quotes";
import { target } from "./helpers/target";

// Source-tree roots from CONFIG. Each consumer decides what to scan; the
// rule applies in principle to all markdown but corpora typically have
// pre-existing violations that warrant phasing the rollout.
const SCAN_ROOTS = target.scanRoots;
const ENABLED = target.shouldRun("curlQuotes");

function walkMarkdown(root: string): string[] {
  if (!fs.existsSync(root)) return [];
  const out: string[] = [];
  const stack = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) stack.push(full);
      else if (entry.isFile() && entry.name.endsWith(".md")) out.push(full);
    }
  }
  return out;
}

test.describe("curl-quotes lint helper", () => {
  test("flags an unquoted URL after curl", () => {
    const v = findUnquotedUrlsInBlock(
      `curl https://example.com/path?id=1\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://example.com/path?id=1");
  });

  test("accepts a double-quoted URL", () => {
    const v = findUnquotedUrlsInBlock(
      `curl "https://example.com/path?id=1"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("accepts a single-quoted URL", () => {
    const v = findUnquotedUrlsInBlock(
      `curl 'https://example.com/path?id=1'\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("accepts a URL inside a longer quoted span", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -H "Referer: https://example.com" https://api.example.com\n`,
      1,
    );
    // The first URL is wrapped (in the Referer header value); the second is
    // not. Only the second should be flagged.
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://api.example.com");
  });

  test("flags URL on continuation line of a multi-line curl", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -X POST \\\n  https://api.example.com/v1/things\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://api.example.com/v1/things");
  });

  test("accepts quoted URL on continuation line", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -X POST \\\n  "https://api.example.com/v1/things"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("ignores URLs in pure shell comment lines", () => {
    const v = findUnquotedUrlsInBlock(
      `# see https://example.com for more\ncurl "https://api.example.com"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("ignores lines that don't contain curl", () => {
    const v = findUnquotedUrlsInBlock(
      `wget https://example.com/file.tar.gz\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("extractFencedBlocks finds tilde and backtick fences", () => {
    const md =
      "prose\n```sh\ncurl https://a.example/\n```\nmore\n~~~bash\ncurl 'https://b.example/'\n~~~\n";
    const blocks = extractFencedBlocks(md);
    expect(blocks).toHaveLength(2);
    expect(blocks[0].content).toContain("a.example");
    expect(blocks[1].content).toContain("b.example");
  });

  test("end-to-end: full source with mixed blocks", () => {
    const md = [
      "Some prose.",
      "",
      "```sh",
      "curl https://bad.example/",
      "```",
      "",
      "```sh",
      "curl 'https://good.example/'",
      "```",
      "",
    ].join("\n");
    const v = findUnquotedUrls(md, "test.md");
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://bad.example/");
  });
});

test.describe("source has no unquoted curl URLs", () => {
  test.skip(!ENABLED, "curlQuotes check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const allViolations: { file: string; line: number; url: string; command: string }[] = [];
    // Report paths relative to the config file's directory (the consumer
    // repo root) so output is readable across consumers.
    const reportRoot = target.configDir;
    for (const root of SCAN_ROOTS) {
      const files = walkMarkdown(root);
      for (const file of files) {
        const source = fs.readFileSync(file, "utf8");
        const v = findUnquotedUrls(source, path.relative(reportRoot, file));
        for (const violation of v) {
          allViolations.push({
            file: violation.filePath,
            line: violation.startLine,
            url: violation.url,
            command: violation.command,
          });
        }
      }
    }
    if (allViolations.length > 0) {
      const summary = allViolations
        .slice(0, 50)
        .map((v) => `  ${v.file}:${v.line}  ${v.url}\n    ${v.command}`)
        .join("\n");
      const overflow =
        allViolations.length > 50
          ? `\n  ... and ${allViolations.length - 50} more.`
          : "";
      expect(
        allViolations,
        `Found ${allViolations.length} curl command(s) with unquoted http(s) URLs. ` +
          `Wrap the URL in "..." or '...' so the code-block copy button produces a paste-safe command.\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
