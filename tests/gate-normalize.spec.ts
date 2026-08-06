import { test, expect } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { normalizeGateForm } from "./helpers/gate-normalize";

// Guards `layouts/_partials/utils/gate-normalize-form.html`, which converts only
// TOP-LEVEL angle-form gates to percent form. That partial is the whole reason
// the gate refactor can raw-emit `.Inner`: percent is the correct form at depth
// 0 and angle is the correct form when nested, so getting the depth wrong
// silently mangles content in one direction or the other.
//
// Three layers, each catching something the others cannot:
//
//   1. unit — the port's decisions on hand-written shapes;
//   2. fixture round-trip — the REAL Go template's output for the same case
//      files, so the port cannot drift away from what actually ships;
//
// Layer 3, the corpus-agreement scan, lives in `gate-normalize-corpus.spec.ts`
// instead: it reads SOURCE rather than built HTML, so it belongs in the
// `content` project, and a spec can only be in one project.

const CASE_DIR = path.resolve(__dirname, "../fixture/assets/conrefs/test/gatenorm");

test.describe("gate-normalize port", () => {
  test("converts a top-level angle gate to percent", () => {
    const { content, decisions } = normalizeGateForm(
      `{{< version include-if="v2" >}}\n| a | b |\n{{< /version >}}`,
    );
    expect(content).toBe(`{{% version include-if="v2" %}}\n| a | b |\n{{% /version %}}`);
    expect(decisions).toEqual([
      { offset: 0, name: "version", depth: 0, form: "<", converted: true },
    ]);
  });

  test("leaves a top-level percent gate alone", () => {
    const src = `{{% version include-if="v2" %}}\nx\n{{% /version %}}`;
    expect(normalizeGateForm(src).content).toBe(src);
  });

  // The load-bearing case. At depth >= 1 percent form hands the shortcode
  // PRE-RENDERED HTML, so converting a nested gate turns its raw-markdown body
  // into a finished fragment — a bullet becomes a standalone <ul> instead of
  // merging into the parent list.
  test("leaves a gate nested in another paired shortcode as angle", () => {
    const src = [
      `{{< tabs >}}`, `{{< tab title="One" >}}`,
      `{{< version include-if="v2" >}}`, `- one`, `- two`, `{{< /version >}}`,
      `{{< /tab >}}`, `{{< /tabs >}}`,
    ].join("\n");
    const { content, decisions } = normalizeGateForm(src);
    expect(content).toBe(src);
    expect(decisions.map((d) => [d.depth, d.converted])).toEqual([[2, false]]);
  });

  // The other direction, and the one that repairs real content: a nested
  // PERCENT gate is handed pre-rendered HTML, so raw-emitting it injects a
  // finished fragment where markdown was expected. On a real
  // gloo-mesh-enterprise build this direction fixed 50 pages, including
  // copy-pasteable commands that had lost a character (`-context` for
  // `--context`).
  test("converts a nested percent gate back to angle", () => {
    const src = [
      `{{< tabs >}}`, `{{% tab name="One" %}}`,
      `{{% version include-if="v2" %}}`, `- one`, `{{% /version %}}`,
      `{{% /tab %}}`, `{{< /tabs >}}`,
    ].join("\n");
    const { content, decisions } = normalizeGateForm(src);
    expect(content).toContain(`{{< version include-if="v2" >}}`);
    expect(content).toContain(`{{< /version >}}`);
    expect(content).not.toContain(`{{% version`);
    expect(decisions.map((d) => [d.depth, d.converted])).toEqual([[2, true]]);
  });

  // Openers and closers must move together. The decision is recorded on the
  // stack frame rather than recomputed at the closer, so a malformed nesting
  // can never leave a `{{% version %}}` paired with a `{{< /version >}}`.
  test("never leaves an opener and closer in different forms", () => {
    for (const src of [
      `{{< version include-if="v2" >}}x{{< /version >}}`,
      `{{< tabs >}}{{% tab name="a" %}}{{% version include-if="v2" %}}x{{% /version %}}{{% /tab %}}{{< /tabs >}}`,
    ]) {
      const out = normalizeGateForm(src).content;
      const opens = (out.match(/\{\{([<%])\s*version\b/g) ?? []).map((m) => m[2]);
      const closes = (out.match(/\{\{([<%])\s*\/version\b/g) ?? []).map((m) => m[2]);
      expect(closes, src).toEqual(opens);
    }
  });

  test("a self-closing shortcode does not create a nesting level", () => {
    const { decisions } = normalizeGateForm(
      `{{< reuse "x.md" >}}\n{{< version include-if="v2" >}}\n## H\n{{< /version >}}`,
    );
    expect(decisions.map((d) => [d.depth, d.converted])).toEqual([[0, true]]);
  });

  test("does not touch version-cards", () => {
    const src = `{{< version-cards >}}`;
    expect(normalizeGateForm(src).content).toBe(src);
    expect(normalizeGateForm(src).decisions).toEqual([]);
  });

  test("does not touch the escaped display form", () => {
    const src = `{{</* version include-if="v2" */>}}`;
    expect(normalizeGateForm(src).content).toBe(src);
  });

  // `${VAR}` written flush against a shortcode puts three braces in a row.
  // Splitting on `{{` takes the leftmost pair, so the chunk starts with a stray
  // brace and the tag goes unrecognized unless the head regex allows it. One
  // real occurrence in the corpus, and it silently corrupted every depth after
  // it in that file.
  test("survives a shell expansion abutting the tag", () => {
    const { content, decisions } = normalizeGateForm(
      `\${{{< version include-if="v2" >}}FOO{{< /version >}}}`,
    );
    expect(content).toBe(`\${{{% version include-if="v2" %}}FOO{{% /version %}}}`);
    expect(decisions.map((d) => [d.depth, d.converted])).toEqual([[0, true]]);
  });

  // Hugo accepts the slash before the space. Verified on a fixture page against
  // hugo v0.160.1: the body renders and the build is clean.
  test("recognizes the slash-before-space closer spelling", () => {
    const { decisions } = normalizeGateForm(
      `{{% version include-if="v2" %}}\nx\n{{%/ version %}}\n` +
        `{{< version include-if="v2" >}}\ny\n{{< /version >}}`,
    );
    expect(decisions.map((d) => d.depth)).toEqual([0, 0]);
  });

  // Hugo expands shortcodes before Goldmark, so a gate inside a fence really
  // does run. Treating fences as inert is what made the first version of
  // gate-scan.ts report 41 gates at the wrong depth.
  test("treats a gate inside a code fence as a real invocation", () => {
    const { decisions } = normalizeGateForm(
      "```yaml\nkey: {{< version include-if=\"v2\" >}}v{{< /version >}}\n```",
    );
    expect(decisions.map((d) => [d.depth, d.converted])).toEqual([[0, true]]);
  });
});

// Layer 2. The fixture page renders each case through the REAL Go template via
// fixture/layouts/_shortcodes/gate-normalize-probe.html; this compares that
// output to the port's. If someone edits one implementation and not the other,
// this is the test that goes red.
test.describe("Go template and port agree", () => {
  test.skip(
    !fs.existsSync(CASE_DIR),
    "fixture case files not present (running against a consumer build)",
  );

  test("every probe case matches the port", async ({ page }) => {
    const res = await page.goto("/test/v2/gate-normalize/");
    test.skip(res?.status() === 404, "fixture page not in this build");

    const rendered = new Map<string, string>();
    for (const el of await page.locator("pre[data-gatenorm]").all()) {
      rendered.set((await el.getAttribute("data-gatenorm"))!, await el.innerText());
    }

    const cases = fs.readdirSync(CASE_DIR).filter((f) => f.endsWith(".md")).sort();
    expect(cases.length, "no gatenorm case files found").toBeGreaterThan(10);
    expect(
      [...rendered.keys()].sort(),
      "a case file exists that the fixture page does not render — add a " +
        "{{< gate-normalize-probe >}} call to fixture/content/en/test/v2/gate-normalize.md",
    ).toEqual(cases.map((f) => f.replace(/\.md$/, "")));

    for (const file of cases) {
      const name = file.replace(/\.md$/, "");
      const src = fs.readFileSync(path.join(CASE_DIR, file), "utf8");
      // innerText collapses the trailing newline the source file carries.
      expect(rendered.get(name)!.trimEnd(), `case ${name}`)
        .toBe(normalizeGateForm(src).content.trimEnd());
    }
  });
});
