#!/usr/bin/env node
// gen-docs — generate the docs site's shortcode reference from the comment
// headers in layouts/_shortcodes/, and the themeExtras params reference from
// the config keys actually read across layouts/ and assets/.
//
// The contract this parses is specified in MAINTAINING.md, "The shortcode
// header contract". If the two disagree, that document is right.
//
// Relationship to scan-docs.ts: scan-docs uses a deliberately GENEROUS matcher
// (a param counts as documented if its name appears anywhere in the block),
// which was correct for sizing the backfill and is useless as a contract. This
// file has the STRICT parser. Both exist on purpose — scan-docs answers "how
// much work is left", gen-docs answers "is this file conformant".
//
// Usage (from the repo root):
//   npm run gen:docs              # write the tree
//   npm run gen:docs -- --check   # exit non-zero if regenerating would change
//   npm run gen:docs -- --json    # machine-readable parse results
//
// This module is import-only; the CLI entry point lives in scripts/, outside
// playwright's testDir — same reasoning as scan-overrides.ts, which see.

import fs from "node:fs";
import path from "node:path";
import { leadingComment, scanConfigParams } from "./scan-docs.ts";

const ROOT = process.cwd();
const SHORTCODE_DIR = "layouts/_shortcodes";
const OUT_SHORTCODES = "docs/content/authoring/shortcodes";
const OUT_PARAMS = "docs/content/configuration/params.md";

/* Closed sets. A new value is an edit to MAINTAINING.md, not a local decision —
   the whole point of a closed set is that the generator can group and order by
   it without a per-file surprise. */
export const GROUPS = [
  "ui-components",
  "gating",
  "reuse-versioning",
  "external-content",
  "links",
  "deprecated",
] as const;

/** Section headings and menu order on the site, keyed by Group. */
const GROUP_META: Record<string, { title: string; blurb: string; weight: number }> = {
  "ui-components": {
    title: "UI components",
    blurb: "Render a visual component on the page.",
    weight: 10,
  },
  gating: {
    title: "Gating",
    blurb: "Decide whether content appears at all.",
    weight: 20,
  },
  "reuse-versioning": {
    title: "Reuse and versioning",
    blurb: "Pull in shared content, or vary it by version.",
    weight: 30,
  },
  "external-content": {
    title: "External content",
    blurb: "Pull content from outside the page's own source.",
    weight: 40,
  },
  links: {
    title: "Links",
    blurb: "Resolve or emit a URL.",
    weight: 50,
  },
  deprecated: {
    title: "Deprecated",
    blurb: "Superseded, kept for existing content.",
    weight: 90,
  },
};

/**
 * What each `themeExtras.*` key does.
 *
 * The KEYS are discovered by scanning layouts/ and assets/, never from this
 * map, so a key added to a template always appears on the generated page. This
 * only supplies prose. A key with no entry here is rendered as
 * "**Undocumented.**" rather than being dropped or silently blank — the whole
 * failure this project started from was five config params that were read in
 * templates and written down nowhere, and a map that quietly omits a key would
 * reproduce it one layer up.
 */
const PARAM_DOCS: Record<string, string> = {
  brand:
    "Selects the brand CSS layer loaded on top of the component baseline: " +
    "`oss` loads `brand-oss.css`, `enterprise` loads `brand-enterprise.css`. " +
    "Omit it entirely to get the neutral defaults with no brand layer. This is " +
    "the only key most consumers set.",
  alertTypes:
    "Custom GitHub-style alert types, beyond the built-in set plus this " +
    "module's own `[!SOLO]` and `[!SUCCESS]`. An unknown type still warns and " +
    "falls back to the default style, so a typo is visible rather than silent.",
  logo:
    "Logo used in the schema.org `Organization` block. Falls back to the " +
    "navbar logo, and is left empty when neither is set. This is metadata only " +
    "— it does not affect what renders in the navbar.",
  outputs:
    "**A table, not a scalar.** Its `markdown` key gates half of the llms.txt " +
    "directive, so the directive never advertises a URL that would 404. Set " +
    "`outputs.markdown = false` when the site does not publish the Markdown " +
    "output format.",
  prodHost:
    "Production host used when rewriting links for the Copy-as-Markdown " +
    "output. Resolution order is this key, then the host from `baseURL`, then " +
    "empty — so a site whose `baseURL` already carries a scheme and host does " +
    "not need to set it.",
  schemaOrgName:
    "Organization name in the schema.org JSON-LD block. Defaults to " +
    "`site.Title`, which is usually right; set it when the legal or brand name " +
    "differs from the site title.",
  twitterSite:
    "Value for the `twitter:site` meta tag, for example `@soloio_inc`. " +
    "Omitted from the page entirely when unset.",
  warnMissingDescription:
    "Set to `false` to silence the per-page warning for a page with no " +
    "front-matter `description`. Leave it on: without a description, the " +
    "description meta tag, OpenGraph, Twitter card and JSON-LD all fall back " +
    "to the raw page summary. Treat any opt-out as temporary, held only while " +
    "a backlog of missing descriptions is worked through.",
};

const CALL_FORMS = ["both", "percent", "angle"];
const TYPES = ["string", "bool", "int", "path", "url"];

export type Param = {
  name: string;
  positional: boolean;
  type: string;
  required: boolean;
  default: string;
  description: string;
};

export type StrictHeader = {
  name: string;
  file: string;
  summary: string;
  group: string;
  callForm: string;
  overrides: string;
  params: Param[];
  /** null when no Example, "" when `Example: code-only`. */
  example: string | null;
  exampleCodeOnly: boolean;
  notes: string;
};

export type ParseResult =
  | { ok: true; header: StrictHeader }
  | { ok: false; name: string; file: string; errors: string[] };

/* ── parsing ──────────────────────────────────────────────────────────────── */

/** Strip the common leading indent so top-level fields sit at column 0. */
function dedent(text: string): string[] {
  const lines = text.replace(/\t/g, "  ").split("\n");
  const indents = lines
    .filter((l) => l.trim())
    .map((l) => l.match(/^ */)![0].length);
  const min = indents.length ? Math.min(...indents) : 0;
  return lines.map((l) => l.slice(min));
}

const FIELD_RE = /^(Shortcode|Summary|Group|CallForm|Overrides|Parameters|Example|Notes):[ \t]*(.*)$/;

/**
 * One `Parameters:` row -> Param, or an error string.
 *
 * Exactly five pipe-delimited fields. There is no escape for a pipe inside a
 * description, by design: adding one means every consumer of this format needs
 * the same unescaping, and a description that wants a pipe can be reworded. A
 * stray pipe therefore shows up as a wrong field count rather than as silently
 * truncated prose, which is the failure mode worth having.
 */
function parseParamRow(row: string): Param | string {
  const cells = row.split("|").map((c) => c.trim());
  if (cells.length !== 5) {
    return `parameter row has ${cells.length} pipe-delimited fields, expected 5 ` +
      `(a pipe inside the description is not escapable — reword): "${row}"`;
  }
  const [name, type, required, dflt, description] = cells;
  const positional = /^\d+$/.test(name);
  if (!positional && !/^[A-Za-z][A-Za-z0-9_-]*$/.test(name)) {
    return `parameter name ${JSON.stringify(name)} is neither an identifier nor an integer position`;
  }
  if (!TYPES.includes(type)) {
    return `parameter ${name}: type ${JSON.stringify(type)} is not one of ${TYPES.join(", ")}`;
  }
  if (required !== "yes" && required !== "no") {
    return `parameter ${name}: required must be yes or no, got ${JSON.stringify(required)}`;
  }
  if (!description) return `parameter ${name}: description is empty`;
  return {
    name,
    positional,
    type,
    required: required === "yes",
    default: dflt,
    description,
  };
}

export function parseStrict(src: string, fileName: string): ParseResult {
  const name = fileName.replace(/\.html$/, "");
  const file = `${SHORTCODE_DIR}/${fileName}`;
  const errors: string[] = [];
  const raw = leadingComment(src);
  if (raw === null) {
    return { ok: false, name, file, errors: ["no leading comment block"] };
  }

  const lines = dedent(raw);
  const scalars: Record<string, string> = {};
  const blocks: Record<string, string[]> = {};
  const seen = new Set<string>();
  let current: string | null = null;

  for (const line of lines) {
    const m = line.match(FIELD_RE);
    if (m) {
      const [, key, inline] = m;
      if (seen.has(key)) errors.push(`duplicate field ${key}:`);
      seen.add(key);
      scalars[key] = inline.trim();
      blocks[key] = [];
      current = key;
      continue;
    }
    // A non-blank line at column 0 that is not a field ends the current block.
    // Without this a stray unindented sentence after Notes: would be swallowed
    // into whichever field came last, silently.
    if (line.trim() && !/^\s/.test(line)) {
      current = null;
      continue;
    }
    if (current) blocks[current].push(line);
  }

  const req = (k: string): string => {
    const v = scalars[k];
    if (v === undefined) errors.push(`missing required field ${k}:`);
    else if (!v && k !== "Parameters") errors.push(`${k}: is empty`);
    return v ?? "";
  };

  const shortcode = req("Shortcode");
  const summary = req("Summary");
  const group = req("Group");
  const callForm = req("CallForm");
  const overrides = req("Overrides");

  if (shortcode && shortcode !== name) {
    errors.push(`Shortcode: says ${JSON.stringify(shortcode)} but the file is ${fileName}`);
  }
  if (group && !GROUPS.includes(group as (typeof GROUPS)[number])) {
    errors.push(`Group: ${JSON.stringify(group)} is not one of ${GROUPS.join(", ")}`);
  }
  if (callForm && !CALL_FORMS.includes(callForm)) {
    errors.push(`CallForm: ${JSON.stringify(callForm)} is not one of ${CALL_FORMS.join(", ")}`);
  }

  // Parameters
  const params: Param[] = [];
  if (scalars.Parameters === undefined) {
    errors.push("missing required field Parameters:");
  } else if (scalars.Parameters === "none") {
    // explicit and fine
  } else if (scalars.Parameters) {
    errors.push(
      `Parameters: takes either the literal "none" or an indented list, got ${JSON.stringify(scalars.Parameters)}`,
    );
  } else {
    const rows = (blocks.Parameters ?? [])
      .map((l) => l.trim())
      .filter((l) => l.startsWith("- "))
      .map((l) => l.slice(2));
    if (!rows.length) {
      errors.push('Parameters: block is empty — use "Parameters: none" if there are none');
    }
    for (const row of rows) {
      const p = parseParamRow(row);
      if (typeof p === "string") errors.push(p);
      else params.push(p);
    }
  }

  /* Example. Three accepted shapes, `code-only` plus two that carry content:
     an inline one-liner (`Example: {{< card title="…" >}}`) and an indented
     block. The inline form is supported because that is how several existing
     headers already write a single-call example, and rejecting it would have
     meant reformatting them for the parser's convenience rather than the
     reader's. Supplying both at once is an error rather than a silent
     precedence rule — there is no obvious winner and guessing wrong drops
     content the author wrote. */
  const exampleCodeOnly = scalars.Example === "code-only";
  let example: string | null = null;
  if (scalars.Example !== undefined && !exampleCodeOnly) {
    const block = dedent((blocks.Example ?? []).join("\n")).join("\n").trim();
    const inline = scalars.Example;
    if (inline && block) {
      errors.push("Example: has both an inline value and an indented block — use one");
    } else if (inline) {
      example = inline;
    } else if (block) {
      example = block;
    } else {
      errors.push("Example: is empty");
    }
  }

  const notes = dedent((blocks.Notes ?? []).join("\n")).join("\n").trim();

  if (errors.length) return { ok: false, name, file, errors };
  return {
    ok: true,
    header: {
      name,
      file,
      summary,
      group,
      callForm,
      overrides,
      params,
      example,
      exampleCodeOnly,
      notes,
    },
  };
}

/* ── rendering ────────────────────────────────────────────────────────────── */

/**
 * Neutralize shortcode calls so a fenced block SHOWS them instead of RUNNING
 * them.
 *
 * Hugo expands shortcodes before Goldmark ever sees the page, so a fenced code
 * block is NOT a safe container: `{{< callout >}}` inside triple backticks
 * still executes. The escape forms are the only thing that stops it, and they
 * are also what makes the rendered output show the original text.
 *
 * Order matters. Percent form is rewritten first because the two closing
 * delimiters are not interchangeable, so rewriting angle form first leaves a
 * mismatched close on any percent call whose body had already been touched.
 *
 * Note the negative lookarounds: they make the rewrite idempotent, so an
 * example that was already written in escape form is left alone instead of
 * being double-escaped into nonsense.
 */
export function escapeShortcodes(src: string): string {
  return src
    .replace(/\{\{%(?!\/\*)/g, "{{%/*")
    .replace(/(?<!\*\/)%\}\}/g, "*/%}}")
    .replace(/\{\{<(?!\/\*)/g, "{{</*")
    .replace(/(?<!\*\/)>\}\}/g, "*/>}}");
}

/** Escape a cell so a literal pipe or backtick cannot break the table. */
function cell(s: string): string {
  return s.replace(/\|/g, "\\|");
}

/**
 * The do-not-edit banner, emitted as YAML comments INSIDE the front matter.
 *
 * Two reasons it cannot be an HTML comment above the front matter, and both
 * are silent failures:
 *
 *   1. Hugo requires front matter to be the very first thing in the file.
 *      Anything above it — including a comment — means the `---` block is
 *      parsed as body content, so the page loses its title, description and
 *      weight and renders a horizontal rule instead.
 *   2. A blank line inside an HTML comment leaks the comment into the rendered
 *      page and swallows the headings after it. That is a documented hazard in
 *      this repo, and a multi-line banner is exactly the shape that trips it.
 *
 * YAML comments avoid both: they sit inside the front matter where an editor
 * sees them immediately, and they never reach the renderer.
 */
const GENERATED_BANNER = (source: string) =>
  [
    "# GENERATED FILE — DO NOT EDIT.",
    "#",
    `# Written by scripts/gen-docs.mjs from ${source}.`,
    "# Edit that instead and re-run `npm run gen:docs`; CI runs",
    "# `npm run gen:docs -- --check` and fails on any diff.",
  ].join("\n");

function paramsTable(params: Param[]): string {
  if (!params.length) return "This shortcode takes no parameters.\n";
  const named = params.filter((p) => !p.positional);
  const positional = params.filter((p) => p.positional);
  const out: string[] = [];
  const table = (rows: Param[], label: string) => {
    if (!rows.length) return;
    if (label) out.push(`### ${label}\n`);
    out.push("| Name | Type | Required | Default | Description |");
    out.push("| --- | --- | --- | --- | --- |");
    for (const p of rows) {
      out.push(
        `| \`${cell(p.name)}\` | ${p.type} | ${p.required ? "yes" : "no"} | ` +
          `${p.default === "—" ? "—" : `\`${cell(p.default)}\``} | ${cell(p.description)} |`,
      );
    }
    out.push("");
  };
  // Positional args get their own table rather than a merged one: they are
  // addressed by position, so sorting them alphabetically among named params
  // would put them in an order that means nothing.
  table(named, positional.length ? "Named" : "");
  table(positional, "Positional");
  return out.join("\n");
}

const CALL_FORM_NOTE: Record<string, string> = {
  both: "Either call form works, and both produce identical HTML.",
  percent:
    "**Percent form only** (`{{%/* … */%}}`). The angle form would put the raw output on the page.",
  angle:
    "**Angle-bracket form only** (`{{</* … */>}}`). The percent form would re-render the output as Markdown.",
};

export function renderShortcodePage(h: StrictHeader, weight: number): string {
  const out: string[] = [];
  out.push("---");
  out.push(GENERATED_BANNER(h.file));
  out.push(`title: ${h.name}`);
  out.push(`description: ${JSON.stringify(h.summary)}`);
  out.push(`weight: ${weight}`);
  out.push("---");
  out.push("");
  /* No summary paragraph in the body. The theme already renders
     front-matter `description` above the content via page-description.html, so
     emitting it again put the same sentence on the page twice, once without a
     full stop and once with. */
  out.push(CALL_FORM_NOTE[h.callForm]);
  out.push("");

  if (h.overrides !== "none") {
    out.push(
      `> [!NOTE]\n> This shortcode shadows Hextra's \`${h.overrides}\`, so its behavior ` +
        `differs from the upstream one of the same name. See the [Hextra shortcodes ` +
        `guide](https://imfing.github.io/hextra/docs/guide/shortcodes/) for the baseline.`,
    );
    out.push("");
  }

  out.push("## Parameters");
  out.push("");
  out.push(paramsTable(h.params));

  if (h.example) {
    out.push("## Example");
    out.push("");
    out.push("```markdown");
    out.push(escapeShortcodes(h.example));
    out.push("```");
    out.push("");
    // The payoff of building the site with the module it documents: this is the
    // real shortcode running, not a pasted copy of last year's output.
    out.push('{{< details title="Rendered output" >}}');
    out.push("");
    out.push(h.example);
    out.push("");
    out.push("{{< /details >}}");
    out.push("");
  } else if (h.exampleCodeOnly) {
    out.push("## Example");
    out.push("");
    /* Deliberately does NOT state the reason. `code-only` is used for at least
       four different ones — needs an asset tree and version context, would hit
       the network on every build, is deprecated, or acts on the page that
       contains it — and a single generated sentence asserting one of them is
       wrong on most pages. Each header explains its own case under Notes. */
    out.push(
      "> [!NOTE]\n> There is no live example on this page: this shortcode cannot be " +
        "rendered safely in isolation. See [Notes](#notes) for why.",
    );
    out.push("");
  }

  if (h.notes) {
    out.push("## Notes");
    out.push("");
    /* Notes is escaped for the same reason Example is. Hugo expands shortcodes
       before Goldmark, so a call written in a Note executes on the generated
       page even inside an indented code block — a Note that says "write it like
       {{< link-hextra path=… >}}" would silently render a URL instead of
       showing the syntax.
       Escaping here rather than asking authors to escape in the header is not a
       convenience: the escape form contains a `*` followed by `/`, which
       terminates the Go template comment the header lives in, so the escaped
       form CANNOT be written in a header at all. Authors write the plain call;
       the generator makes it inert. */
    out.push(escapeShortcodes(h.notes));
    out.push("");
  }

  out.push("---");
  out.push("");
  out.push(
    `Source: [\`${h.file}\`](https://github.com/solo-io/docs-theme-extras/blob/main/${h.file})`,
  );
  out.push("");
  return out.join("\n");
}

export function renderIndex(headers: StrictHeader[], skipped: ParseResult[]): string {
  const out: string[] = [];
  out.push("---");
  out.push(GENERATED_BANNER(`${SHORTCODE_DIR}/*.html`));
  out.push("title: Shortcodes");
  out.push(
    'description: "Every shortcode this module adds, grouped by what it does."',
  );
  out.push("weight: 20");
  out.push("---");
  out.push("");
  out.push(
    "Every shortcode `docs-theme-extras` adds on top of Hextra, grouped by what it does. " +
      "Each page is generated from the comment header of its source file, so the parameter " +
      "tables cannot drift from the template that reads them.",
  );
  out.push("");

  const groups = [...GROUPS].filter((g) => headers.some((h) => h.group === g));
  for (const g of groups) {
    const meta = GROUP_META[g];
    out.push(`## ${meta.title}`);
    out.push("");
    out.push(meta.blurb);
    out.push("");
    out.push("| Shortcode | Summary |");
    out.push("| --- | --- |");
    for (const h of headers.filter((x) => x.group === g).sort((a, b) => a.name.localeCompare(b.name))) {
      out.push(`| [\`${h.name}\`](${h.name}/) | ${cell(h.summary)} |`);
    }
    out.push("");
  }

  /* NO SILENT CAPS. A shortcode whose header is not yet conformant is absent
     from every table above, and an index that lists 6 of 29 while looking
     complete is worse than one that admits the gap. This block is what makes
     the backfill's remaining size visible to a reader, not just to whoever
     runs the scanner. It disappears on its own when the last header lands. */
  if (skipped.length) {
    out.push("## Not yet documented");
    out.push("");
    out.push(
      `${skipped.length} of ${headers.length + skipped.length} shortcodes do not yet have a ` +
        "conformant source header, so they have no page here. They still work; they are " +
        "just undocumented. Their parameters are listed in " +
        "[`USAGE.md`](https://github.com/solo-io/docs-theme-extras/blob/main/USAGE.md) " +
        "until the backfill reaches them.",
    );
    out.push("");
    out.push(
      skipped
        .map((s) => `\`${(s as { name: string }).name}\``)
        .sort()
        .join(", "),
    );
    out.push("");
  }
  return out.join("\n");
}

export function renderParamsPage(
  configParams: ReturnType<typeof scanConfigParams>,
): string {
  const out: string[] = [];
  out.push("---");
  out.push(GENERATED_BANNER("reads of themeExtras.* across layouts/ and assets/"));
  out.push("title: themeExtras parameters");
  out.push('description: "Every themeExtras config key the module reads."');
  out.push("weight: 50");
  out.push("---");
  out.push("");
  out.push(
    "Every `themeExtras.*` key this module reads, discovered by scanning `layouts/` and " +
      "`assets/` rather than from a hand-kept list, so a key added to a template shows up " +
      "here whether or not anyone remembered to document it.",
  );
  out.push("");
  out.push("```toml");
  out.push("[params.themeExtras]");
  out.push('  brand = "oss"   # or "enterprise"');
  out.push("```");
  out.push("");
  const undocumented = configParams.filter((p) => !PARAM_DOCS[p.key]);
  if (undocumented.length) {
    out.push(
      "> [!WARNING]\n> " +
        `${undocumented.length} key(s) below have no description yet: ` +
        undocumented.map((p) => `\`${p.key}\``).join(", ") +
        ". They are read by a template in this module but nobody has written " +
        "down what they do.",
    );
    out.push("");
  }

  for (const p of configParams) {
    out.push(`## \`themeExtras.${p.key}\``);
    out.push("");
    out.push(PARAM_DOCS[p.key] ?? "**Undocumented.** See the files below.");
    out.push("");
    out.push(
      "Read in " +
        p.readIn
          .map(
            (f) =>
              `[\`${f}\`](https://github.com/solo-io/docs-theme-extras/blob/main/${f})`,
          )
          .join(", ") +
        ".",
    );
    out.push("");
  }
  return out.join("\n");
}

/* ── generate ─────────────────────────────────────────────────────────────── */

export function generate(): {
  files: Map<string, string>;
  parsed: StrictHeader[];
  skipped: ParseResult[];
} {
  const dir = path.join(ROOT, SHORTCODE_DIR);
  const results = fs
    .readdirSync(dir)
    .filter((f) => f.endsWith(".html"))
    .sort()
    .map((f) => parseStrict(fs.readFileSync(path.join(dir, f), "utf8"), f));

  const parsed = results.filter((r): r is { ok: true; header: StrictHeader } => r.ok).map((r) => r.header);
  const skipped = results.filter((r) => !r.ok);

  const files = new Map<string, string>();
  // Weight by group first, then alphabetically inside it, so the left nav reads
  // in the same order as the index page rather than in filename order.
  const ordered = [...parsed].sort(
    (a, b) =>
      GROUP_META[a.group].weight - GROUP_META[b.group].weight ||
      a.name.localeCompare(b.name),
  );
  ordered.forEach((h, i) => {
    files.set(`${OUT_SHORTCODES}/${h.name}.md`, renderShortcodePage(h, (i + 1) * 10));
  });
  files.set(`${OUT_SHORTCODES}/_index.md`, renderIndex(parsed, skipped));
  files.set(OUT_PARAMS, renderParamsPage(scanConfigParams()));
  return { files, parsed, skipped };
}

/**
 * Pages under OUT_SHORTCODES that no longer have a source shortcode.
 *
 * ONLY a page whose `layouts/_shortcodes/<name>.html` is GONE counts. A page is
 * NOT orphaned merely because it is absent from `files` — a shortcode whose
 * header fails to parse is `skipped`, so it contributes no page, and treating
 * that as an orphan meant a ONE-CHARACTER TYPO in a header deleted that
 * shortcode's entire documentation page.
 *
 * Measured, not hypothesised: renaming `Summary:` to `Summry:` in table.html
 * made `npm run gen:docs` report `removed: 1 (orphaned)` and unlink
 * `docs/content/authoring/shortcodes/table.md`, while rewriting 21 other pages
 * because the index and every subsequent weight shifted. The word "orphaned"
 * reads as deliberate cleanup, so the deletion was easy to wave through in a
 * 22-file diff — and the actual cause, a typo, was named nowhere in it.
 *
 * Keying on the source file separates the two cases: a genuinely deleted or
 * renamed shortcode still gets its page removed, and a broken header now leaves
 * the page untouched while `formatSkipped` and the docs-coverage spec report the
 * header itself.
 */
/**
 * The decision, as a pure function so it can be tested without a filesystem
 * and without a spec that deletes real documentation to prove a point.
 *
 * @param pageFile      basename under OUT_SHORTCODES, e.g. "table.md"
 * @param generatedRels the rel paths generate() produced this run
 * @param sourceExists  does layouts/_shortcodes/<basename> exist?
 */
export function isOrphanPage(
  pageFile: string,
  generatedRels: Set<string>,
  sourceExists: (htmlBasename: string) => boolean,
): boolean {
  if (pageFile === "_index.md") return false;
  if (generatedRels.has(`${OUT_SHORTCODES}/${pageFile}`)) return false;
  // The source still exists → stale-but-owned (a broken header), not orphaned.
  return !sourceExists(pageFile.replace(/\.md$/, ".html"));
}

function orphanedPages(files: Map<string, string>): string[] {
  const outDir = path.join(ROOT, OUT_SHORTCODES);
  if (!fs.existsSync(outDir)) return [];
  const rels = new Set(files.keys());
  return fs
    .readdirSync(outDir)
    .filter((x) => x.endsWith(".md"))
    .filter((f) =>
      isOrphanPage(f, rels, (html) =>
        fs.existsSync(path.join(ROOT, SHORTCODE_DIR, html)),
      ),
    )
    .map((f) => `${OUT_SHORTCODES}/${f}`);
}

/** Paths whose on-disk content differs from what generate() would write. */
export function check(): { changed: string[]; skipped: ParseResult[] } {
  const { files, skipped } = generate();
  const changed: string[] = [];
  for (const [rel, content] of files) {
    const abs = path.join(ROOT, rel);
    if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== content) changed.push(rel);
  }
  // A page left behind by a shortcode that was deleted or renamed is a stale
  // file the reader can still reach, so removal counts as a diff too.
  for (const rel of orphanedPages(files)) changed.push(`${rel} (orphaned — delete)`);
  return { changed: changed.sort(), skipped };
}

export function write(): { written: string[]; removed: string[]; skipped: ParseResult[] } {
  const { files, skipped } = generate();
  const written: string[] = [];
  for (const [rel, content] of files) {
    const abs = path.join(ROOT, rel);
    fs.mkdirSync(path.dirname(abs), { recursive: true });
    if (!fs.existsSync(abs) || fs.readFileSync(abs, "utf8") !== content) {
      fs.writeFileSync(abs, content);
      written.push(rel);
    }
  }
  // Deletes ONLY pages whose source shortcode is gone — see orphanedPages.
  const removed: string[] = [];
  for (const rel of orphanedPages(files)) {
    fs.unlinkSync(path.join(ROOT, rel));
    removed.push(rel);
  }
  return { written, removed, skipped };
}

export function formatSkipped(skipped: ParseResult[]): string {
  if (!skipped.length) return "  (none — every header is conformant)";
  return skipped
    .map((s) => {
      const r = s as { name: string; errors: string[] };
      return `  ${r.name}\n${r.errors.map((e) => `     - ${e}`).join("\n")}`;
    })
    .join("\n");
}
