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
  smoke: boolean;
  shortcodeLeaks: boolean;
  markdownLeaks: boolean;
  copyAsMarkdown: boolean;
  imageAltText: boolean;
  hugoWarnings: boolean;
  curlQuotes: boolean;
  contrast: boolean;
  viewport: boolean;
  versioning: boolean;
  shortcodeStructure: boolean;
  shortcodeArgs: boolean;
  includeForm: boolean;
  crossBrowser: boolean;
};

export type Allowlists = {
  hugoWarnings: string[];
  curlQuotes: string[];
  shortcodes: string[];
};

// Per-spec knobs that don't fit the boolean [checks] table.
export type Smoke = {
  // Max HTML files smoke.spec.ts scans for shortcode-leak / copy-as-md checks.
  // Default 50 keeps `make framework-test-smoke PRODUCT=<x>` fast on large
  // corpora. Set to 0 for unlimited (walk every HTML file) — useful when
  // smoke is the only coverage you have against that product's build.
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
  smoke: Smoke;
};

const DEFAULT_CHECKS: Checks = {
  smoke: true,
  shortcodeLeaks: true,
  markdownLeaks: true,
  copyAsMarkdown: true,
  imageAltText: true,
  hugoWarnings: true,
  curlQuotes: true,
  contrast: true,
  viewport: true,
  versioning: true,
  shortcodeStructure: true,
  shortcodeArgs: true,
  includeForm: true,
  crossBrowser: false,
};

const DEFAULT_ALLOWLISTS: Allowlists = {
  hugoWarnings: [],
  curlQuotes: [],
  shortcodes: [],
};

const DEFAULT_SMOKE: Smoke = {
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

  const checks = mergeChecks(data.checks);
  const allowlists = mergeAllowlists(data.allowlists);
  const smoke = mergeSmoke(data.smoke, configPath);

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
    smoke,
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

function mergeChecks(raw: unknown): Checks {
  const out = { ...DEFAULT_CHECKS };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof Checks)[]) {
    const v = obj[key];
    if (typeof v === "boolean") out[key] = v;
  }
  return out;
}

function mergeSmoke(raw: unknown, configPath: string): Smoke {
  const out = { ...DEFAULT_SMOKE };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  const v = obj.maxFiles;
  if (v === undefined) return out;
  if (typeof v !== "number" || !Number.isInteger(v) || v < 0) {
    throw new Error(
      `[smoke].maxFiles must be a non-negative integer in ${configPath}; got ${JSON.stringify(v)}`,
    );
  }
  out.maxFiles = v;
  return out;
}

function mergeAllowlists(raw: unknown): Allowlists {
  const out = {
    hugoWarnings: [...DEFAULT_ALLOWLISTS.hugoWarnings],
    curlQuotes: [...DEFAULT_ALLOWLISTS.curlQuotes],
    shortcodes: [...DEFAULT_ALLOWLISTS.shortcodes],
  };
  if (!raw || typeof raw !== "object") return out;
  const obj = raw as Record<string, unknown>;
  for (const key of Object.keys(out) as (keyof Allowlists)[]) {
    const v = obj[key];
    if (Array.isArray(v) && v.every((s) => typeof s === "string")) {
      out[key] = v as string[];
    }
  }
  return out;
}
