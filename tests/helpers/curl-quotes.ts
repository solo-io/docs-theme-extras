// Detects curl commands inside fenced code blocks where the URL is unquoted
// AND contains a character the shell will interpret in a way that breaks the
// command. Specifically, when the URL contains any of:
//
//   &   backgrounds the command, runs the rest as a new statement
//       (so `?a=1&b=2` query strings fail without quotes)
//   #   starts a shell comment; everything after is dropped
//       (so URL fragments are silently lost)
//   ;   command separator
//   |   pipe
//   (   subshell open
//   )   subshell close
//   *   filename glob (expands if a matching file exists in cwd)
//   [   character-class glob open
//   ]   character-class glob close
//
// URLs containing only safe chars (letters, digits, `-_./:?=,+~%`) are
// intentionally NOT flagged: quoting them is purely stylistic since the shell
// passes them through unchanged. URLs containing `$VAR` are also not flagged
// because the unquoted-or-double-quoted form is normally what authors want
// (intentional variable expansion); single-quoting would break the example.
//
// Note on `?`: a literal `?` in a URL only triggers glob expansion if a
// matching one-character-shorter filename exists in cwd. That's vanishingly
// rare in practice, so we don't flag `?` on its own — only when accompanied
// by another truly-dangerous char from the list above.

export type CurlQuoteViolation = {
  filePath: string;
  // 1-based line number of the curl command's first line in the source file.
  startLine: number;
  url: string;
  command: string;
  // The specific shell metacharacter(s) found in the URL that make quoting
  // required — surfaced in the failure message so authors know *why* a given
  // URL was flagged.
  triggers: string[];
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
// Shell metacharacters whose presence in an unquoted URL produces wrong
// behavior when the code block is pasted. See file header for rationale.
const DANGEROUS_RE = /[&#;|()*\[\]]/;
const DANGEROUS_CHARS = ["&", "#", ";", "|", "(", ")", "*", "[", "]"];

const TRIGGER_REASONS: Record<string, string> = {
  "&": "backgrounds the command and treats the rest as a new statement",
  "#": "starts a shell comment, dropping the rest of the URL",
  ";": "is a command separator",
  "|": "is a pipe",
  "(": "opens a subshell",
  ")": "closes a subshell",
  "*": "is a filename glob",
  "[": "opens a character-class glob",
  "]": "closes a character-class glob",
};

// Returns the unique dangerous chars present in the URL, in the order they
// appear. Used to build the per-violation explanation.
function collectTriggers(url: string): string[] {
  const seen = new Set<string>();
  for (const c of url) {
    if (DANGEROUS_CHARS.includes(c)) seen.add(c);
  }
  return [...seen];
}

// Strip trailing `)` and `]` that close a wrapper *outside* the URL rather
// than belonging to the URL itself. Handles:
//
//   code=$(curl ... http://example.com/path)    → strip the `)` closing $(
//   (see curl ... http://example.com/path)      → strip the `)` closing prose
//   [link text](https://example.com/path)       → strip the `)` closing md link
//
// We strip a trailing `)` only when the URL contains more `)` than `(` —
// i.e., the closer is unbalanced relative to the URL contents. Same logic
// for `]`. URLs with their own balanced parens (e.g. Wikipedia disambigs
// like `/wiki/Cat_(animal)`) keep them and still trigger `(`/`)`, which is
// correct: unquoted, the shell would interpret them.
function stripWrapperEnd(url: string): string {
  let s = url;
  while (s.length > 0) {
    const last = s[s.length - 1];
    if (last !== ")" && last !== "]") break;
    const openRe = last === ")" ? /\(/g : /\[/g;
    const closeRe = last === ")" ? /\)/g : /\]/g;
    const opens = (s.match(openRe) || []).length;
    const closes = (s.match(closeRe) || []).length;
    if (closes <= opens) break;
    s = s.slice(0, -1);
  }
  return s;
}

export function explainTrigger(c: string): string {
  return TRIGGER_REASONS[c] ?? "is a shell metacharacter";
}

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
      const rawUrl = m[0];
      // Drop wrapper punctuation like the `)` that closes `$(curl ... URL)`
      // — those aren't part of the URL and shouldn't fire the lint.
      const url = stripWrapperEnd(rawUrl);
      if (!url) continue;
      const before = m.index === 0 ? "" : text[m.index - 1];
      const after = text[m.index + url.length] ?? "";
      const doubleQuoted = before === '"' && after === '"';
      const singleQuoted = before === "'" && after === "'";
      // Also accept the URL being inside a longer quoted span; check for
      // matching quotes anywhere on the same logical line that bracket the
      // URL position.
      const wrappedInQuotes = doubleQuoted || singleQuoted ||
        isInsideQuotes(text, m.index, m.index + url.length);
      if (wrappedInQuotes) continue;
      const triggers = collectTriggers(url);
      if (triggers.length > 0) {
        violations.push({
          filePath,
          startLine: blockStartLine + startLine - 1,
          url,
          command: text.trim(),
          triggers,
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
