#!/usr/bin/env python3
"""Write a change manifest for the change-highlights overlay.

Diffs the working tree (committed, staged, unstaged, and untracked files)
against the merge-base with a base branch, and writes the added text of each
changed Markdown file to a JSON file under the site's static directory. The
overlay script (assets/js/change-highlights.js) fetches that file in
non-production builds and highlights the matching text on the page.

Hugo cannot run git, so this runs beside the build: once before `hugo` for a
preview build, or with --watch next to `hugo server` for live editing. The
manifest goes in static/ rather than data/ on purpose: Hugo copies a changed
static file without re-rendering any page, so a rewrite costs one reload, not
a site rebuild.

Usage:
  scripts/changes_manifest.py --out fixture/static/_extras/changes.json
  scripts/changes_manifest.py --out static/_extras/changes.json --watch
  scripts/changes_manifest.py --base upstream/main --out ...
"""

import argparse
import hashlib
import json
import os
import re
import subprocess
import sys
import time

# Sentinels that mark where the added text sits inside its line while the
# Markdown is stripped, so the context on either side survives the strip.
OPEN, CLOSE = "\u0001", "\u0002"
CONTEXT_CHARS = 40


def git(*args, check=True):
    result = subprocess.run(
        ["git", *args], capture_output=True, text=True, check=False
    )
    if check and result.returncode != 0:
        sys.exit(f"git {' '.join(args)} failed: {result.stderr.strip()}")
    return result.stdout


def resolve_base(base, exact=False):
    if exact:
        sha = git("rev-parse", "--verify", base).strip()
        return base, sha
    candidates = [base] if base else ["upstream/main", "origin/main", "main"]
    for ref in candidates:
        if git("rev-parse", "--verify", "--quiet", ref, check=False).strip():
            return ref, git("merge-base", "HEAD", ref).strip()
    sys.exit(f"no base ref found (tried {', '.join(candidates)}); pass --base")


def strip_markdown(text):
    text = re.sub(r"\{\{[<%][^\x01\x02]*?[>%]\}\}", " ", text)  # shortcodes
    text = re.sub(r"<[^>\x01\x02]+>", " ", text)               # HTML tags
    text = re.sub(r"!\[[^\]]*\]\([^)\x01\x02]*\)", " ", text)  # images
    text = re.sub(r"\[([^\]]*)\]\([^)\x01\x02]*\)", r"\1", text)  # links
    text = re.sub(r"\[([^\]]*)\]\[[^\]\x01\x02]*\]", r"\1", text)  # reference links
    text = re.sub(r"\[!\w+\]", " ", text)                      # alert markers
    text = re.sub(r"\{#[^}]*\}", " ", text)                    # heading anchors
    text = re.sub(r"^[\s\x01\x02]*(?:#{1,6}\s+|[-*+]\s+|\d+\.\s+|>\s*)+",
                  lambda m: re.sub(r"[^\x01\x02]", "", m.group(0)), text)
    text = text.replace("**", "").replace("__", "").replace("`", "")
    text = re.sub(r"(?<!\w)[*_]|[*_](?!\w)", "", text)          # emphasis
    text = text.replace("|", " ")                               # table pipes
    return re.sub(r"\s+", " ", text)


def trim_context(text, from_end):
    text = text.strip()
    if len(text) <= CONTEXT_CHARS:
        return text
    if from_end:
        cut = text[-CONTEXT_CHARS:]
        return cut.split(" ", 1)[1] if " " in cut else cut
    cut = text[:CONTEXT_CHARS]
    return cut.rsplit(" ", 1)[0] if " " in cut else cut


def clean_part(part):
    # The word diff splits a shortcode wherever its whitespace falls, so drop
    # any half of one left dangling at a part's edge.
    return re.sub(r"^.*?[>%]\}\}|\{\{[<%].*$", "", part)


def strip_parts(before, mid, after):
    """Strip Markdown from one line while keeping track of which stripped text
    came from `mid`. Returns (pre, mid, post) as rendered-ish text."""
    marked = strip_markdown(before + OPEN + mid + CLOSE + after)
    if marked.count(OPEN) == 1 and marked.count(CLOSE) == 1:
        pre, rest = marked.split(OPEN)
        mid_s, post = rest.split(CLOSE)
    else:
        # A strip regex swallowed a sentinel (a link split by the edit, for
        # example). Fall back to stripping each part on its own.
        pre, mid_s, post = strip_markdown(before), strip_markdown(mid), strip_markdown(after)
    return tuple(clean_part(x) for x in (pre, mid_s, post))


def new_text(tokens):
    return "".join(t for op, t in tokens if op != "-")


def is_deleted_line(tokens):
    return bool(tokens) and all(op == "-" for op, _ in tokens)


def neighbor_text(lines, i, step):
    """Stripped text of the nearest line in the new file that has visible text."""
    j = i + step
    while 0 <= j < len(lines):
        tokens = lines[j]
        if not is_deleted_line(tokens):
            text = clean_part(strip_markdown(new_text(tokens))).strip()
            if text:
                return text
        j += step
    return ""


def entry(before, text, after, **extra):
    out = {
        "before": trim_context(before, from_end=True),
        "text": text,
        "after": trim_context(after, from_end=False),
    }
    out.update({k: v for k, v in extra.items() if v})
    return out


def analyze_hunk(lines):
    """lines: one list of (op, text) tokens per line of a word-diff hunk.

    Returns (added, removed). An added fragment is new visible text; when it
    replaced old text, the old text rides along as `was`. A removed entry is a
    pure deletion with nothing added in its place, anchored between `before`
    and `after` so the overlay can put a marker where the text used to be.
    Context comes from the same line, or from the neighboring line when the
    change starts or ends the line, so a short change still has something
    specific to match against.
    """
    added, removed = [], []
    i = 0
    while i < len(lines):
        tokens = lines[i]

        if is_deleted_line(tokens):
            # Merge a run of fully deleted lines into one marker.
            j = i
            gone = []
            while j < len(lines) and (is_deleted_line(lines[j]) or not lines[j]):
                if lines[j]:
                    gone.append(clean_part(strip_markdown("".join(t for _, t in lines[j]))).strip())
                j += 1
            text = " / ".join(g for g in gone if g)
            if text:
                removed.append(entry(neighbor_text(lines, i, -1), text,
                                     neighbor_text(lines, j - 1, 1)))
            i = j
            continue

        prev_line = neighbor_text(lines, i, -1)
        next_line = neighbor_text(lines, i, 1)
        k = 0
        while k < len(tokens):
            op, text = tokens[k]
            if op == " ":
                k += 1
                continue
            # Gather a run of changed tokens: removals and additions together.
            run_start = k
            while k < len(tokens) and tokens[k][0] != " ":
                k += 1
            run = tokens[run_start:k]
            plus = "".join(t for o, t in run if o == "+")
            minus = "".join(t for o, t in run if o == "-")
            before = new_text(tokens[:run_start])
            after = new_text(tokens[k:])
            pre, mid, post = strip_parts(before, plus, after)
            pre, mid, post = pre.strip(), mid.strip(), post.strip()
            if not pre:
                pre = prev_line
            if not post:
                post = next_line
            was = clean_part(strip_markdown(minus)).strip()
            if mid:
                added.append(entry(pre, mid, post, was=was))
            elif was:
                removed.append(entry(pre, was, post))
            # A change that only touched Markdown syntax (bold added around
            # existing words, for example) leaves nothing visible to mark.
        i += 1
    return added, removed


def parse_word_diff(diff):
    files = {}
    path = None
    hunk = []      # finished lines of the current hunk
    line = []      # tokens of the line being read

    def end_hunk():
        nonlocal hunk, line
        if line:
            hunk.append(line)
        if path and hunk:
            added, removed = analyze_hunk(hunk)
            files[path]["added"].extend(added)
            files[path]["removed"].extend(removed)
        hunk, line = [], []

    for raw in diff.splitlines():
        if raw.startswith("diff --git "):
            end_hunk()
            path = None
        elif raw.startswith("+++ "):
            target = raw[4:]
            path = target[2:] if target.startswith("b/") else None
            if path:
                files.setdefault(path, {"new": False, "added": [], "removed": []})
        elif raw.startswith(("--- ", "@@", "index ", "new file", "deleted file",
                             "similarity", "rename ", "old mode", "new mode")):
            end_hunk()
        elif path is None:
            continue
        elif raw == "~":
            hunk.append(line)
            line = []
        elif raw[:1] in "+- ":
            line.append((raw[0], raw[1:]))
    end_hunk()
    return files


def build_manifest(base_arg, paths, exts, exact=False):
    base_ref, base_sha = resolve_base(base_arg, exact)
    pathspec = ["--", *paths] if paths else []
    keep = lambda p: p.endswith(tuple(exts))

    # Three lines of context, not one: Markdown separates paragraphs with a
    # blank line, so one line of context around a deleted paragraph is just
    # that blank line, and the removal marker would have nothing to anchor to.
    diff = git("diff", "--no-color", "--no-ext-diff", "--no-renames",
               "--word-diff=porcelain", "-U3", base_sha, *pathspec)
    files = {p: v for p, v in parse_word_diff(diff).items() if keep(p)}

    status = git("diff", "--name-status", "--no-renames", base_sha, *pathspec)
    new_paths = [l.split("\t", 1)[1] for l in status.splitlines() if l.startswith("A\t")]
    new_paths += git("ls-files", "--others", "--exclude-standard", *pathspec).splitlines()
    for p in new_paths:
        if keep(p):
            files[p] = {"new": True, "added": [], "removed": []}

    digest = hashlib.sha1(json.dumps(files, sort_keys=True).encode()).hexdigest()
    return {"base": base_ref, "baseSha": base_sha, "hash": digest, "files": files}


def write_if_changed(out, manifest):
    try:
        with open(out) as f:
            if json.load(f).get("hash") == manifest["hash"]:
                return False
    except (OSError, ValueError):
        pass
    out_dir = os.path.dirname(out) or "."
    os.makedirs(out_dir, exist_ok=True)
    # Keep the manifest out of git without asking every consumer to edit its
    # own .gitignore: the folder ignores itself.
    ignore = os.path.join(out_dir, ".gitignore")
    if not os.path.exists(ignore):
        with open(ignore, "w") as f:
            f.write("# Written by changes_manifest.py; local and preview builds only.\n*\n")
    tmp = out + ".tmp"
    with open(tmp, "w") as f:
        json.dump(manifest, f, indent=1)
    os.replace(tmp, out)
    return True


def main():
    ap = argparse.ArgumentParser(description=__doc__.split("\n\n")[0])
    ap.add_argument("--out", required=True, help="manifest path, under a static dir")
    ap.add_argument("--base", help="base ref (default: upstream/main, origin/main, or main)")
    ap.add_argument("--exact-base", action="store_true",
                    help="diff against --base itself, not its merge-base with HEAD "
                         "(--base can then be any commit or tree)")
    ap.add_argument("--path", action="append", default=[], help="limit to these paths")
    ap.add_argument("--ext", action="append", default=None, help="file extensions (default .md)")
    ap.add_argument("--watch", action="store_true", help="rewrite on change until interrupted")
    ap.add_argument("--interval", type=float, default=1.0)
    args = ap.parse_args()
    exts = args.ext or [".md"]

    while True:
        manifest = build_manifest(args.base, args.path, exts, args.exact_base)
        if write_if_changed(args.out, manifest):
            n = len(manifest["files"])
            print(f"changes_manifest: {n} changed file(s) vs {manifest['base']} -> {args.out}",
                  flush=True)
        if not args.watch:
            return
        time.sleep(args.interval)


if __name__ == "__main__":
    try:
        main()
    except KeyboardInterrupt:
        pass
