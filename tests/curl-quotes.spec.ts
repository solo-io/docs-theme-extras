import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import {
  findUnquotedUrls,
  findUnquotedUrlsInBlock,
  extractFencedBlocks,
  explainTrigger,
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
  test("flags an unquoted URL whose query string contains '&'", () => {
    // `&` is the canonical bug: shell backgrounds curl with only ?a=1, then
    // tries to run `b=2` as a new command.
    const v = findUnquotedUrlsInBlock(
      `curl https://example.com/path?a=1&b=2\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://example.com/path?a=1&b=2");
    expect(v[0].triggers).toContain("&");
  });

  test("flags an unquoted URL containing a fragment '#'", () => {
    const v = findUnquotedUrlsInBlock(
      `curl https://example.com/page#section\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].triggers).toContain("#");
  });

  test("does NOT flag a safe path-only URL", () => {
    // No shell-special chars in the URL; quoting is purely stylistic.
    const v = findUnquotedUrlsInBlock(
      `curl https://example.com/path/to/page/\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("does NOT flag a URL with only `?` (single query param, no `&`)", () => {
    // `?` is a glob metachar in theory, but only misbehaves if a one-char-
    // shorter filename happens to exist in cwd. Not flagged by itself.
    const v = findUnquotedUrlsInBlock(
      `curl https://example.com/path?id=1\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("does NOT flag URL whose trailing ')' closes $(...) substitution", () => {
    // Real-world false positive: `code=$(curl ... URL)` — the trailing `)`
    // closes the command substitution, it is NOT part of the URL.
    const v = findUnquotedUrlsInBlock(
      `code=$(curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/protected)\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("does NOT flag URL whose trailing ')' closes prose parens", () => {
    const v = findUnquotedUrlsInBlock(
      `# (run curl http://example.com/path/page/)\ncurl "https://api.example.com"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("DOES flag URL with balanced parens in its own path", () => {
    // Wikipedia-style disambiguation: the URL genuinely contains `(animal)`.
    // Unquoted, the shell would treat `(animal)` as a subshell, so this is
    // a real bug and must still fire.
    const v = findUnquotedUrlsInBlock(
      `curl https://en.wikipedia.org/wiki/Cat_(animal)\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].triggers).toEqual(expect.arrayContaining(["(", ")"]));
  });

  test("does NOT flag a URL containing $VAR (intentional expansion)", () => {
    // Author intentionally interpolates a shell variable. Quoting with '...'
    // would BREAK this; quoting with "..." or leaving unquoted both work.
    const v = findUnquotedUrlsInBlock(
      `curl -i http://$INGRESS_GW_ADDRESS:80/headers\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("accepts a double-quoted dangerous URL", () => {
    const v = findUnquotedUrlsInBlock(
      `curl "https://example.com/path?a=1&b=2"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("accepts a single-quoted dangerous URL", () => {
    const v = findUnquotedUrlsInBlock(
      `curl 'https://example.com/path?a=1&b=2'\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("accepts a dangerous URL inside a longer quoted span", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -H "Referer: https://example.com/?a=1&b=2" https://api.example.com/?x=1&y=2\n`,
      1,
    );
    // The first URL is inside the Referer header value (quoted span); the
    // second is unquoted and contains `&`, so only it is flagged.
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://api.example.com/?x=1&y=2");
  });

  test("flags dangerous URL on continuation line of a multi-line curl", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -X POST \\\n  https://api.example.com/v1/things?a=1&b=2\n`,
      1,
    );
    expect(v).toHaveLength(1);
    expect(v[0].triggers).toContain("&");
  });

  test("accepts quoted dangerous URL on continuation line", () => {
    const v = findUnquotedUrlsInBlock(
      `curl -X POST \\\n  "https://api.example.com/v1/things?a=1&b=2"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("ignores URLs in pure shell comment lines", () => {
    const v = findUnquotedUrlsInBlock(
      `# see https://example.com/?a=1&b=2 for more\ncurl "https://api.example.com"\n`,
      1,
    );
    expect(v).toEqual([]);
  });

  test("ignores lines that don't contain curl", () => {
    const v = findUnquotedUrlsInBlock(
      `wget https://example.com/?a=1&b=2\n`,
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
      "curl https://bad.example/?a=1&b=2",
      "```",
      "",
      "```sh",
      "curl 'https://good.example/?a=1&b=2'",
      "```",
      "",
      "```sh",
      "curl https://safe.example/path/no-shell-chars/",
      "```",
      "",
    ].join("\n");
    const v = findUnquotedUrls(md, "test.md");
    // Only the first block is flagged: second is quoted, third has no
    // dangerous chars even though unquoted.
    expect(v).toHaveLength(1);
    expect(v[0].url).toBe("https://bad.example/?a=1&b=2");
    expect(v[0].triggers).toContain("&");
  });

  test("explainTrigger returns a human-readable reason per char", () => {
    expect(explainTrigger("&")).toMatch(/backgrounds/);
    expect(explainTrigger("#")).toMatch(/comment/);
    expect(explainTrigger("|")).toMatch(/pipe/);
  });
});

test.describe("source has no unquoted curl URLs", () => {
  test.skip(!ENABLED, "curlQuotes check disabled in CONFIG");
  test.skip(SCAN_ROOTS.length === 0, "no scanRoots configured in CONFIG");

  test("scan configured source roots for violations", () => {
    const allViolations: {
      file: string;
      line: number;
      url: string;
      command: string;
      triggers: string[];
    }[] = [];
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
            triggers: violation.triggers,
          });
        }
      }
    }
    if (allViolations.length > 0) {
      const summary = allViolations
        .slice(0, 50)
        .map((v) => {
          const reasons = v.triggers
            .map((c) => `'${c}' ${explainTrigger(c)}`)
            .join("; ");
          return `  ${v.file}:${v.line}  ${v.url}\n    triggers: ${reasons}\n    ${v.command}`;
        })
        .join("\n");
      const overflow =
        allViolations.length > 50
          ? `\n  ... and ${allViolations.length - 50} more.`
          : "";
      expect(
        allViolations,
        `Found ${allViolations.length} curl command(s) whose URL contains a shell ` +
          `metacharacter and is not quoted. Wrap the URL in "..." or '...' so the ` +
          `code-block copy button produces a paste-safe command.\n${summary}${overflow}`,
      ).toEqual([]);
    }
  });
});
