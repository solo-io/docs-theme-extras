// Domain helper that wraps the loaded CONFIG and exposes the operations
// specs actually need: the built-output root, the page list, version
// extraction, check toggles, and URL <-> file path conversion.
//
// Specs should import from here, not from `config.ts` directly.

import path from "node:path";
import {
  type Brand,
  type Checks,
  loadConfig,
  type Page,
  type Config,
  type Smoke,
} from "./config";

class Target {
  private _config: Config | null = null;

  private cfg(): Config {
    if (!this._config) this._config = loadConfig();
    return this._config;
  }

  get name(): string {
    return this.cfg().name;
  }

  get brand(): Brand {
    return this.cfg().brand;
  }

  get builtRoot(): string {
    return this.cfg().builtRoot;
  }

  get baseURL(): string {
    return this.cfg().baseURL;
  }

  get buildLog(): string | null {
    return this.cfg().buildLog;
  }

  get pages(): Page[] {
    return this.cfg().pages;
  }

  get scanRoots(): string[] {
    return this.cfg().scanRoots;
  }

  // Directory containing the CONFIG file, treated as the consumer repo root
  // for relative-path reporting in source-scanning specs.
  get configDir(): string {
    return path.dirname(this.cfg().configPath);
  }

  get versions(): string[] {
    return this.cfg().versioning?.versions ?? [];
  }

  get hugoWarningsAllowlist(): RegExp[] {
    return this.cfg().allowlists.hugoWarnings.map((p) => new RegExp(p));
  }

  get curlQuotesAllowlist(): string[] {
    return this.cfg().allowlists.curlQuotes;
  }

  get shortcodeAllowlist(): string[] {
    return this.cfg().allowlists.shortcodes;
  }

  // Per-consumer regex patterns for console-errors.spec.ts. Strings from
  // [allowlists].consoleErrors in the TOML are compiled to RegExp here so
  // specs never have to know about the raw string form.
  get markdownLeaksAllowlist(): RegExp[] {
    return this.cfg().allowlists.markdownLeaks.map((p) => new RegExp(p));
  }

  get consoleErrorsAllowlist(): RegExp[] {
    return this.cfg().allowlists.consoleErrors.map((p) => new RegExp(p));
  }

  shouldRun(check: keyof Checks): boolean {
    return this.cfg().checks[check];
  }

  get smoke(): Smoke {
    return this.cfg().smoke;
  }

  // Extract the version string from a URL using the configured regex.
  // The URL is normalized by stripping the baseURL prefix before matching,
  // so `versionFromPath` can be a stable, baseURL-agnostic pattern.
  // Returns null if no [versioning] block is set or no match.
  versionOf(url: string): string | null {
    const v = this.cfg().versioning;
    if (!v) return null;
    const stripped = stripBaseURL(url, this.cfg().baseURL);
    const normalized = stripped.startsWith("/") ? stripped : "/" + stripped;
    const m = normalized.match(new RegExp(v.versionFromPath));
    return m?.groups?.version ?? null;
  }

  // Map a URL (e.g. "/test/v2/everything/") to its index.html on disk.
  // URLs are absolute (rooted at builtRoot, baseURL included). The harness
  // serves builtRoot via `npx serve`, so URL "/test/v2/everything/" maps to
  // <builtRoot>/test/v2/everything/index.html.
  fileForUrl(url: string): string {
    const trimmed = url.replace(/^\/+|\/+$/g, "");
    if (trimmed === "") return path.join(this.cfg().builtRoot, "index.html");
    return path.join(this.cfg().builtRoot, trimmed, "index.html");
  }

  // Map an absolute file path under builtRoot to a URL.
  urlForFile(filePath: string): string {
    const rel = path.relative(this.cfg().builtRoot, filePath);
    const noIndex = rel.replace(/\/?index\.html$/, "/");
    return "/" + noIndex.replace(/^\/+/, "");
  }

  // The product-scoped subtree under builtRoot. Useful for back-compat with
  // older specs that joined paths against TEST_PRODUCT_ROOT, and for specs
  // that want to scan only the current product (not siblings under
  // builtRoot like other docs products).
  get productRoot(): string {
    const base = this.cfg().baseURL.replace(/^\/+|\/+$/g, "");
    if (base === "") return this.cfg().builtRoot;
    return path.join(this.cfg().builtRoot, base);
  }
}

function stripBaseURL(url: string, baseURL: string): string {
  const base = baseURL.replace(/\/$/, "");
  if (base && url.startsWith(base)) return url.slice(base.length);
  return url;
}

export const target = new Target();
