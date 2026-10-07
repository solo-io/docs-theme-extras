// Walks a built site and reports every file over a byte limit. Unlike
// crawl.ts, this walks EVERY file, not just *.html: the host limit this guards
// applies per file regardless of type, and the files that grow past it are as
// often a search index or a generated JSON as a page.

import fs from "node:fs";
import path from "node:path";

const MIB = 1024 * 1024;

export function mibToBytes(mib: number): number {
  return Math.floor(mib * MIB);
}

// Warn, without failing, once a file passes this fraction of the limit.
// Generated reference pages grow a little with every release, so the useful
// signal is "this is getting close", not only "this already broke the deploy".
export const WARN_RATIO = 0.8;

export type SizedFile = {
  rel: string; // path relative to the scanned root, forward slashes
  bytes: number;
};

// Every regular file under `root` strictly larger than `minBytes`, largest
// first. Symlinks are skipped: the host uploads the target, which the walk
// reaches on its own if it is inside `root`.
export function filesOver(root: string, minBytes: number): SizedFile[] {
  const out: SizedFile[] = [];
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
      } else if (e.isFile()) {
        const bytes = fs.statSync(p).size;
        if (bytes > minBytes) {
          out.push({ rel: path.relative(root, p).split(path.sep).join("/"), bytes });
        }
      }
    }
  }
  out.sort((a, b) => b.bytes - a.bytes || a.rel.localeCompare(b.rel));
  return out;
}

export function formatMiB(bytes: number): string {
  return `${(bytes / MIB).toFixed(1)} MiB`;
}
