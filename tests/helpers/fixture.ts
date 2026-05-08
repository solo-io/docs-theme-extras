// Back-compat shim. Original fixture.ts hard-coded PUBLIC_ROOT and
// TEST_PAGES; specs imported those directly. The new canonical helper is
// `target` (which reads CONFIG TOML). This file synthesizes the old API
// from `target` so specs can be migrated incrementally.
//
// Once every spec has been refactored to import from `./target` and
// `./crawl` directly, this file can be deleted.

import fs from "node:fs";
import { target } from "./target";

// Today's tests use PUBLIC_ROOT to locate sibling product directories
// (e.g. for smoke.spec.ts pointing at /public/<product>). With the new
// model, builtRoot IS the served public dir.
export const PUBLIC_ROOT = target.builtRoot;

// The product-scoped root that today's specs use as the base for filePath
// joins (e.g. path.join(TEST_PRODUCT_ROOT, "v2/everything/index.html")).
// With the new model, productRoot is <builtRoot>/<baseURL stripped>.
export const TEST_PRODUCT_ROOT = target.productRoot;

export type TestPage = {
  name: string;
  version: "v1" | "v2" | "main" | null;
  urlPath: string;
  filePath: string;
};

// Synthesize TEST_PAGES from CONFIG's [[pages]] list, matching today's
// shape. The `name` is derived from the URL (the stripped path joined
// with "/"), and `version` is target.versionOf(url).
export const TEST_PAGES: TestPage[] = target.pages.map((p) => ({
  name: nameForUrl(p.url, target.baseURL),
  version: target.versionOf(p.url) as TestPage["version"],
  urlPath: p.url,
  filePath: target.fileForUrl(p.url),
}));

export function readFixture(p: string): string {
  return fs.readFileSync(p, "utf8");
}

function nameForUrl(url: string, baseURL: string): string {
  const base = baseURL.replace(/\/$/, "");
  let stripped = url;
  if (base && stripped.startsWith(base)) stripped = stripped.slice(base.length);
  stripped = stripped.replace(/^\/+|\/+$/g, "");
  return stripped === "" ? "landing" : stripped;
}
