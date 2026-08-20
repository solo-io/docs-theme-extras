import { test, expect } from "@playwright/test";
import fs from "node:fs";
import { normalizeGateForm } from "./helpers/gate-normalize";
import { scanFile, walkMarkdown } from "./helpers/gate-scan";
import { target } from "./helpers/target";

// Layer 3 of the gate-normalize guard (layers 1 and 2 are in
// gate-normalize.spec.ts). Split out because this one reads the consumer's
// markdown SOURCE, which puts it in the `content` project — the fixture-only
// layers belong in `static`, and a spec cannot be in both.
//
// This is what turns the fragile part of the design into a checked part. The
// walk in `utils/gate-normalize-form.html` is a cheap parse (split on `{{`)
// because RE2 cannot count nesting, and the only honest way to know a cheap
// parse is right is to run it against a proper tokenizer over real content.

test.describe("corpus agreement with the tokenizer", () => {
  // Deliberately NOT filtered by existsSync. A configured root that is not on
  // disk must reach the `files > 0` assertion below and fail loudly — silently
  // skipping it is exactly how the docs hub's scanRoots came to point at two
  // directories that have never existed, leaving six source lints passing
  // vacuously over 11,025 unread files.
  const roots = target.scanRoots;
  test.skip(roots.length === 0, "no scanRoots configured in CONFIG");

  test("walk and tokenizer agree on every gate's depth", () => {
    const bad: string[] = [];
    let files = 0;
    let gates = 0;

    for (const root of roots) {
      for (const file of walkMarkdown(root)) {
        files++;
        const src = fs.readFileSync(file, "utf8");
        const tok = scanFile(file);
        const walk = normalizeGateForm(src).decisions;
        gates += tok.length;

        if (tok.length !== walk.length) {
          bad.push(`${file}: found ${tok.length} gates, walk found ${walk.length}`);
          continue;
        }
        for (let i = 0; i < tok.length; i++) {
          const walkLine = src.slice(0, walk[i].offset).split("\n").length;
          if (tok[i].line !== walkLine) {
            bad.push(`${file}: gate #${i} at line ${tok[i].line}, walk says ${walkLine}`);
          } else if ((tok[i].depth === 0) !== (walk[i].depth === 0)) {
            bad.push(
              `${file}:${tok[i].line} depth ${tok[i].depth} (${tok[i].parents || "top"}) ` +
                `but walk says ${walk[i].depth}`,
            );
          }
        }
      }
    }

    // A scan that walks nothing passes vacuously and reads as coverage. This is
    // how the docs hub's scanRoots turned out to point at directories that do
    // not exist.
    expect(files, `walked 0 markdown files under ${JSON.stringify(roots)}`).toBeGreaterThan(0);
    expect(
      bad,
      `${bad.length} gate(s) where utils/gate-normalize-form.html would compute the ` +
        `wrong nesting depth, and therefore pick the wrong shortcode form:\n` +
        bad.slice(0, 30).join("\n"),
    ).toEqual([]);
    console.log(`gate-normalize: ${gates} gates across ${files} files, 0 depth disagreements`);
  });
});
