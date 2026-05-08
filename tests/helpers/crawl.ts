// Walks `target.builtRoot` and yields every *.html file with its computed URL.
// The result is cached per process so multiple specs share the same scan.

import fs from "node:fs";
import path from "node:path";
import { target } from "./target";

export type CrawledPage = {
  filePath: string; // absolute
  url: string; // includes baseURL prefix
  version: string | null; // result of target.versionOf(url)
};

let cache: CrawledPage[] | null = null;

export function crawlBuiltRoot(): CrawledPage[] {
  if (cache) return cache;

  const root = target.builtRoot;
  if (!fs.existsSync(root)) {
    throw new Error(
      `target.builtRoot does not exist: ${root}. Run the consumer's Hugo build first.`,
    );
  }

  const out: CrawledPage[] = [];
  const stack: string[] = [root];
  while (stack.length) {
    const dir = stack.pop()!;
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true });
    } catch {
      continue;
    }
    for (const e of entries) {
      const p = path.join(dir, e.name);
      if (e.isDirectory()) {
        stack.push(p);
      } else if (e.isFile() && e.name.endsWith(".html")) {
        const url = target.urlForFile(p);
        out.push({ filePath: p, url, version: target.versionOf(url) });
      }
    }
  }

  out.sort((a, b) => a.url.localeCompare(b.url));
  cache = out;
  return cache;
}

// Reset between test runs in unit tests; not used in normal Playwright flow.
export function _resetCrawlCache(): void {
  cache = null;
}

// Return only the explicitly listed pages from CONFIG, falling back to the
// crawl when no [[pages]] entries are declared. Specs that test specific
// behaviors against representative pages (contrast, viewport, browser specs)
// use this; specs that scan everything (smoke, static) call `crawlBuiltRoot`.
export function selectedPages(): CrawledPage[] {
  if (target.pages.length > 0) {
    return target.pages.map((p) => ({
      filePath: target.fileForUrl(p.url),
      url: p.url,
      version: target.versionOf(p.url),
    }));
  }
  return crawlBuiltRoot();
}
