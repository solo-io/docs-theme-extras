// Loads and validates the CONFIG TOML for a docs target.
//
// Each consumer repo has its own `.docs-test.toml` describing where its built
// HTML lives, which checks to run, and any allowlists. The harness reads the
// path from `process.env.DOCS_TEST_CONFIG` (set by the Makefile or CI).
//
// Relative paths in the TOML are resolved against the TOML file's own
// directory so the harness can be invoked from any working directory.

import fs from "node:fs";
import path from "node:path";
import { parse as parseToml } from "smol-toml";

export type Page = {
  url: string;
};

export type Versioning = {
  versionFromPath: string;
  versions: string[];
};

export type Checks = {
  markdownLeaks: boolean;
  copyAsMarkdown: boolean;
  hugoWarnings: boolean;
  curlQuotes: boolean;
  contrast: boolean;
  viewport: boolean;
  // Code-block integrity through the render pipeline: built-html-integrity's
  // "<p> inside <pre>" and "fragmented code block" checks. These catch the
  // double-markdown-render corruption that the rebase/reuse/{{% tab %}} chain
  // causes when a fenced block (or a fence containing `*`/blank lines, e.g.
  // curl -v output) is rendered more than once. Kept as its own check so a
  // consumer with a known architectural backlog of these can disable just
  // these two while keeping the (docs-fixable) markdown-leak check fatal.
  codeBlockIntegrity: boolean;
  // Fails a built page whose <head> has an inline <script> (no `src`) whose
  // body contains `<` immediately followed by an ASCII letter. Spec-compliant
  // browsers parse `<x` inside a <script> harmlessly, but naive HTML parsers —
  // notably the docs link checker's (lychee/html5ever) — mis-read it as a
  // start-tag and drop every link after it. In <head> that loses the ENTIRE
  // page body, so the link checker silently stops finding broken links.
  // Externalize such scripts to a .js file (never parsed as HTML), or HTML-
  // escape `<` in data blocks. Scoped to <head> because a body script only
  // affects links after it and site JS usually sits at the end of <body>.
  inlineScriptSafety: boolean;
  shortcodeArgs: boolean;
  // Source scan for a Hugo shortcode used in a markdown heading with no
  // explicit `{#id}`. Hugo builds the heading anchor from the raw text before
  // substituting shortcodes, so the anchor leaks a "hahahugoshortcode…"
  // placeholder (also caught downstream by markdown-leaks). See
  // helpers/heading-shortcode-id.ts.
  headingShortcodeId: boolean;
  // Source scan for pre-0.12 Hextra tab styling (`tabName=`, `items=`,
  // `tabTotal=`, nameless tabs) that renders labels as "Tab 0", "Tab 1", ….
  tabSyntax: boolean;
  includeForm: boolean;
  cascadeType: boolean;
  // Browser-level crawl: open every built page in Chromium and fail on
  // uncaught JS exceptions, console.error calls, or HTTP 4xx on JS/CSS assets.
  consoleErrors: boolean;
  // Built-HTML scan for image references (<img src>, <img>/<source> srcset)
  // that resolve to a same-origin file the build never published — a broken
  // image for the reader and a 404 for the link checker. Catches typos and
  // missing per-version reuse-image overrides at the tag that broke. Kept as
  // its own toggle so a consumer with a known backlog can disable it without
  // losing the other content scans.
  missingImages: boolean;
};

export type Allowlists = {
  hugoWarnings: string[];
  curlQuotes: string[];
  // Regex patterns (strings) matched against each console error / pageerror
  // message. Anything that matches is silently dropped — not a test failure.
  // Useful for suppressing known third-party noise (analytics, CDN assets).
  consoleErrors: string[];
  // Regex patterns matched against each markdown-leak substring detected
  // by markdown-leaks.spec.ts. A match silently drops the offender — for
  // intentional uses of pipe-delimited prose or markdown-shaped strings
  // that shouldn't fail the scan.
  markdownLeaks: string[];
  // Regex patterns matched against each missing-image src detected by
  // missing-images.spec.ts. A match silently drops the offender — for
  // references intentionally supplied by a downstream build.
  missingImages: string[];
  // Regex patterns matched against each shortcode-in-heading found by
  // heading-shortcode-id.spec.ts (matched against the raw heading text). A
  // match silently drops the offender — for a genuine exception where the
  // auto-generated anchor is acceptable.
  headingShortcodeId: string[];
};

// Per-spec knobs that don't fit the boolean [checks] table.
export type Crawl = {
  // Max HTML files the browser crawl (console-errors.spec.ts, the
  // "browser-crawl" project) opens in Chromium. Default 50 keeps the crawl
  // fast on large corpora; set to 0 for unlimited (open every built page).
  // Only the browser crawl is capped — the cheap file-read scans always walk
  // every page.
  maxFiles: number;
};

export type Brand = "oss" | "enterprise" | "";

export type Config = {
  version: string;
  name: string;
  configPath: string; // absolute path of the TOML file (for resolving relatives)
  // Which brand layer the build under test was produced with. Empty string
  // means no brand layer (bare component baseline). brand.spec.ts uses this
  // to assert the right CSS / font / logo loaded for the build.
  brand: Brand;
  builtRoot: string; // absolute
  baseURL: string;
  buildLog: string | null; // absolute, or null if unset
  // Source-tree roots scanned by author-side lints (curl-quotes). Absolute
  // paths. Empty for consumers that don't run source-scanning specs.
  scanRoots: string[];
  pages: Page[];
  versioning: Versioning | null;
  checks: Checks;
  allowlists: Allowlists;
  crawl: Crawl;
};

const DEFAULT_CHECKS: Checks = {
  markdownLeaks: true,
  copyAsMarkdown: true,
  hugoWarnings: true,
  curlQuotes: true,
  contrast: true,
  viewport: true,
  codeBlockIntegrity: true,
  inlineScriptSafety: true,
  shortcodeArgs: true,
  headingShortcodeId: true,
  tabSyntax: true,
  includeForm: true,
  cascadeType: true,
  consoleErrors: true,
  missingImages: true,
};

const DEFAULT_ALLOWLISTS: Allowlists = {
  hugoWarnings: [],
  curlQuotes: [],
  consoleErrors: [],
  markdownLeaks: [],
  missingImages: [],
  headingShortcodeId: [],
};

const DEFAULT_CRAWL: Crawl = {
  maxFiles: 50,
};

let cached: Config | null = null;

export function loadConfig(): Config {
  if (cached) return cached;

  const configPath = process.env.DOCS_TEST_CONFIG;
  if (!configPath) {
    throw new Error(
      "DOCS_TEST_CONFIG env var is required (absolute path to a .docs-test.toml).",
    );
  }
  if (!path.isAbsolute(configPath)) {
    throw new Error(
      `DOCS_TEST_CONFIG must be an absolute path; got ${configPath}`,
    );
  }
  if (!fs.existsSync(configPath)) {
    throw new Error(`DOCS_TEST_CONFIG file not found: ${configPath}`);
  }

  const raw = fs.readFileSync(configPath, "utf8");
  const data = parseToml(raw) as Record<string, unknown>;
  const configDir = path.dirname(configPath);

  cached = validate(data, configPath, configDir);
  return cached;
}

function validate(
  data: Record<string, unknown>,
  configPath: string,
  configDir: string,
): Config {
  const version = stringField(data, "version");
  if (version !== "1") {
    throw new Error(
      `Unsupported config version ${JSON.stringify(version)} in ${configPath}; expected "1".`,
    );
  }
  const name = stringField(data, "name");
  const brand = parseBrand(data.brand, configPath);
  const builtRootRel = stringField(data, "builtRoot");
  const baseURL = stringField(data, "baseURL");
  const buildLogRel = optionalStringField(data, "buildLog");

  const scanRootsRaw = data.scanRoots;
  const scanRoots: string[] = [];
  if (scanRootsRaw !== undefined) {
    if (!Array.isArray(scanRootsRaw)) {
      throw new Error(`scanRoots must be an array of strings in ${configPath}`);
    }
    for (const [i, p] of scanRootsRaw.entries()) {
      if (typeof p !== "string") {
        throw new Error(`scanRoots[${i}] must be a string in ${configPath}`);
      }
      scanRoots.push(path.resolve(configDir, p));
    }
  }

  const pagesData = data.pages as Array<Record<string, unknown>> | undefined;
  const pages: Page[] = (pagesData ?? []).map((p, i) => {
    const url = p.url;
    if (typeof url !== "string") {
      throw new Error(`pages[${i}].url must be a string in ${configPath}`);
    }
    return { url };
  });

  let versioning: Versioning | null = null;
  if (data.versioning && typeof data.versioning === "object") {
    const v = data.versioning as Record<string, unknown>;
    const versionFromPath = stringField(v, "versionFromPath", "[versioning]");
    const versionsRaw = v.versions;
    if (!Array.isArray(versionsRaw)) {
      throw new Error(`[versioning].versions must be an array in ${configPath}`);
    }
    const versions = versionsRaw.map((s, i) => {
      if (typeof s !== "string") {
        throw new Error(
          `[versioning].versions[${i}] must be a string in ${configPath}`,
        );
      }
      return s;
    });
    versioning = { versionFromPath, versions };
  }

  // A [smoke] block is a pre-0.1.18 leftover: the block was renamed to [crawl]
  // (and the `smoke` check removed). Silently dropping it would revert a
  // consumer who set `[smoke].maxFiles = 0` (unlimited crawl) back to the
  // default cap with no signal, so warn instead of ignoring it quietly.
  if (data.smoke && typeof data.smoke === "object") {
    console.warn(
      `[docs-test] [smoke] was renamed to [crawl] in docs-theme-extras 0.1.18; the [smoke] block in ${configPath} is ignored. Move maxFiles to [crawl].`,
    );
  }

  const checks = mergeChecks(data.checks, configPath);
  const allowlists = mergeAllowlists(data.allowlists, configPath);
  const crawl = mergeCrawl(data.crawl, configPath);

  return {
    version,
    name,
    configPath,
    brand,
    builtRoot: path.resolve(configDir, builtRootRel),
    baseURL,
    buildLog: buildLogRel ? path.resolve(configDir, buildLogRel) : null,
    scanRoots,
    pages,
    versioning,
    checks,
    allowlists,
    crawl,
  };
}

function stringField(
  obj: Record<string, unknown>,
  key: string,
  scope: string = "(top level)",
): string {
  const v = obj[key];
  if (typeof v !== "string" || v.length === 0) {
    throw new Error(
      `${scope}.${key} is required and must be a non-empty string`,
    );
  }
  return v;
}

function parseBrand(v: unknown, configPath: string): Brand {
  if (v === undefined || v === null || v === "") return "";
  if (v === "oss" || v === "enterprise") return v;
  throw new Error(
    `brand must be "oss", "enterprise", or unset; got ${JSON.stringify(v)} in ${configPath}`,
  );
}

function optionalStringField(
  obj: Record<string, unknown>,
  key: string,
): string | null {
  const v = obj[key];
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") {
    throw new Error(`${key} must be a string if set`);
  }
  return v;
}

// Warn (don't throw) for keys the harness no longer reads: a check that was
// removed or renamed between versions is silently ignored otherwise, so a
// consumer's stale toggle — or a typo in a live one — passes unnoticed. Warning
// surfaces both without failing a consumer whose config predates the rename.
function warnUnknownKeys(
  obj: Record<string, unknown>,
  known: readonly string[],
  scope: string,
  configPath: string,
): void {
  for (const key of Object.keys(obj)) {
    if (!known.includes(key)) {
      console.warn(
        `[docs-test] ignoring unknown ${scope} key "${key}" in ${configPath}`,
      );
    }
  }
}

function mergeChecks(raw: unknown, configPath: string): Checks {
  const out = { ...DEFAULT_CHECKS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys(obj, Object.keys(out), "[checks]", configPath);
  for (const key of Object.keys(out) as (keyof Checks)[]) {
    const v = obj[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

function mergeCrawl(raw: unknown, configPath: string): Crawl {
  const out = { ...DEFAULT_CRAWL };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys(obj, ["maxFiles"], "[crawl]", configPath);
  const v = obj.maxFiles;
  if (v === undefined) return out;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new Error(
      `[crawl].maxFiles must be a non-negative integer in ${configPath}; got ${JSON.stringify(v)}`,
    );
  }
  out.maxFiles = v;
  return out;
}

function mergeAllowlists(raw: unknown, configPath: string): Allowlists {
  const out: Allowlists = {
    hugoWarnings: [...DEFAULT_ALLOWLISTS.hugoWarnings],
    curlQuotes: [...DEFAULT_ALLOWLISTS.curlQuotes],
    consoleErrors: [...DEFAULT_ALLOWLISTS.consoleErrors],
    markdownLeaks: [...DEFAULT_ALLOWLISTS.markdownLeaks],
    missingImages: [...DEFAULT_ALLOWLISTS.missingImages],
    headingShortcodeId: [...DEFAULT_ALLOWLISTS.headingShortcodeId],
  };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  warnUnknownKeys(obj, Object.keys(out), "[allowlists]", configPath);
  for (const key of Object.keys(out) as (keyof Allowlists)[]) {
    const v = obj[key];
    if (Array.isArray(v) && v.every((s) => typeof s === "string")) {
      out[key] = v as string[];
    }
  }
  return out;
}
