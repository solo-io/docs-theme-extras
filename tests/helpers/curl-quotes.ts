// Detects curl commands inside fenced code blocks that contain an http(s)://
// URL not wrapped in quotes. Unquoted URLs break when readers click the
// code-block copy button and paste into a terminal — `&`, `?`, `#`, `*`, and
// spaces inside the URL get interpreted by the shell.

export type CurlQuoteViolation = {
  filePath: string;
  // 1-based line number of the curl command's first line in the source file.
  startLine: number;
  url: string;
  command: string;
};

// Walks the markdown source and returns every fenced code block as
// { content, startLine }. startLine is the 1-based line number of the first
// line *inside* the fence (the line after the opening ``` or ~~~).
export function extractFencedBlocks(
  source: string,
): { content: string; startLine: number }[] {
  const lines = source.split("\n");
  const blocks: { content: string; startLine: number }[] = [];
  let inFence = false;
  let fenceMarker = "";
  let buffer: string[] = [];
  let bufferStart = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trimStart();
    const fenceMatch = trimmed.match(/^(```+|~~~+)/);

    if (!inFence) {
      if (fenceMatch) {
        inFence = true;
        fenceMarker = fenceMatch[1];
        buffer = [];
        bufferStart = i + 2;
      }
      continue;
    }

    // We're inside a fence; close on a marker that starts with the same char
    // and is at least as long as the opener.
    const opener = fenceMarker[0];
    const closeMatch = trimmed.match(new RegExp(`^(\\${opener}{${fenceMarker.length},})\\s*$`));
    if (closeMatch) {
      blocks.push({ content: buffer.join("\n"), startLine: bufferStart });
      inFence = false;
      fenceMarker = "";
      buffer = [];
      continue;
    }
    buffer.push(line);
  }

  return blocks;
}

// Joins lines that end with a `\` line-continuation into one logical line.
// Returns [{ text, startLine }] where startLine is 1-based offset within the
// original block.
function logicalLines(blockContent: string): { text: string; startLine: number }[] {
  const lines = blockContent.split("\n");
  const out: { text: string; startLine: number }[] = [];
  let buffer = "";
  let bufferStart = -1;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (buffer === "") bufferStart = i + 1;
    if (/\\\s*$/.test(line)) {
      buffer += line.replace(/\\\s*$/, "") + " ";
    } else {
      buffer += line;
      out.push({ text: buffer, startLine: bufferStart });
      buffer = "";
    }
  }
  if (buffer !== "") out.push({ text: buffer, startLine: bufferStart });
  return out;
}

const URL_RE = /https?:\/\/[^\s'"`<>]+/g;
const CURL_RE = /\bcurl\b/;

export function findUnquotedUrlsInBlock(
  blockContent: string,
  blockStartLine: number,
  filePath = "",
): CurlQuoteViolation[] {
  const violations: CurlQuoteViolation[] = [];
  for (const { text, startLine } of logicalLines(blockContent)) {
    const trimmedStart = text.trimStart();
    // Skip pure shell comments. A `#` after non-whitespace can still be inside
    // a string, so this only skips lines whose first non-space char is `#`.
    if (trimmedStart.startsWith("#")) continue;
    if (!CURL_RE.test(text)) continue;

    URL_RE.lastIndex = 0;
    let m: RegExpExecArray | null;
    while ((m = URL_RE.exec(text)) !== null) {
      const url = m[0];
      const before = m.index === 0 ? "" : text[m.index - 1];
      const after = text[m.index + url.length] ?? "";
      const doubleQuoted = before === '"' && after === '"';
      const singleQuoted = before === "'" && after === "'";
      // Also accept the URL being inside a longer quoted span; check for
      // matching quotes anywhere on the same logical line that bracket the
      // URL position.
      const wrappedInQuotes = doubleQuoted || singleQuoted ||
        isInsideQuotes(text, m.index, m.index + url.length);
      if (!wrappedInQuotes) {
        violations.push({
          filePath,
          startLine: blockStartLine + startLine - 1,
          url,
          command: text.trim(),
        });
      }
    }
  }
  return violations;
}

// Walks the line tracking quote state and returns true if [start, end) sits
// entirely inside a single- or double-quoted span.
function isInsideQuotes(line: string, start: number, end: number): boolean {
  let inSingle = false;
  let inDouble = false;
  let i = 0;
  for (; i < start; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) { i++; continue; }
    if (c === "'" && !inDouble) inSingle = !inSingle;
    else if (c === '"' && !inSingle) inDouble = !inDouble;
  }
  if (!inSingle && !inDouble) return false;
  // The URL is inside quotes; verify the quote stays open until at least `end`.
  for (; i < end; i++) {
    const c = line[i];
    if (c === "\\" && i + 1 < line.length) { i++; continue; }
    if (c === "'" && inSingle) return false;
    if (c === '"' && inDouble) return false;
  }
  return true;
}

export function findUnquotedUrls(
  source: string,
  filePath = "",
): CurlQuoteViolation[] {
  const blocks = extractFencedBlocks(source);
  const violations: CurlQuoteViolation[] = [];
  for (const block of blocks) {
    violations.push(...findUnquotedUrlsInBlock(block.content, block.startLine, filePath));
  }
  return violations;
}
