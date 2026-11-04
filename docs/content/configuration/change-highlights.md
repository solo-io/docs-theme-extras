---
title: Change highlights
description: >-
  Mark the text a branch adds or removes on the rendered page, in local and PR
  preview builds.
weight: 38
---

Change highlights mark what a branch changed directly on the rendered page, so
a reviewer does not have to read the diff and then hunt for the same words. It
runs in local builds and in PR previews that opt in. Production builds never
include it.

## What a reviewer sees

| Change | Mark |
| ------ | ---- |
| Added text | A yellow highlight with an underline. The underline keeps it visible on yellow and red callouts. |
| Replaced text | The new text is highlighted. Hover it to see the old wording ("Was: …"). |
| Removed text | A small red ⊖ where the text used to be. Hover it to see the removed words. |
| A new page | A "New page" label and a bar down the left edge, instead of highlighting every sentence. |
| A changed snippet | Marked on every page that reuses it, and on every copy within a page. |

A panel in the bottom-left corner counts the changes and has a **Hide** toggle.
The choice is stored in the browser. If a change cannot be placed, the panel
says "not shown"; click the counts to list it.

Highlights are painted with the browser's CSS Custom Highlight API, so the page
itself is not edited: tabs, copy buttons, and code blocks work as usual, and a
code block's copy text never includes a marker. Firefox supports this API from
version 140. Older browsers show the panel without highlights.

## How it works

Hugo cannot run git, so a script does the diff:

1. `scripts/changes_manifest.py` diffs the working tree, including uncommitted
   and new files that are not in git yet, against the point where the branch
   left main. It checks `upstream/main`, `origin/main`, and `main`, and uses
   whichever branched off most recently, so a stale remote cannot add other
   people's merges to the diff. It writes the added and removed text of each
   changed Markdown file to `static/_extras/changes.json`. That folder ignores
   itself in git, so you do not need to edit your `.gitignore`. With `--watch`,
   the script deletes the manifest when it stops.
2. When the overlay is on, every page lists the files it was built from: its
   own Markdown file, relative to the project, plus every snippet that the
   `reuse` shortcode pulled in. A versioned snippet is listed under the path it
   resolved to and the path the author wrote. The overlay matches the resolved
   path first.
3. In the browser, `assets/js/change-highlights.js` loads the manifest, keeps
   the entries for this page's files, and paints them. Under `hugo server`, it
   checks the manifest again every two seconds, so the marks follow your edits
   without a reload. It stops checking if there is no manifest, and a built
   preview fetches it once.

## Turn it on

The `themeExtras.changeHighlights` parameter decides whether pages load the
overlay:

| Value | Result |
| ----- | ------ |
| Not set | On under `hugo server` only. Off in every built site, including non-production environments such as a translation or staging build. |
| `true` | On in any environment. Use this for PR previews only. |
| `false` | Off everywhere. |

Any other value fails the build.

Without a manifest, a page that loads the overlay looks exactly like a normal
page.

### Locally

Run the script with `--watch` next to `hugo server`:

```sh
python3 <path-to-docs-theme-extras>/scripts/changes_manifest.py \
  --out static/_extras/changes.json --watch
```

Point `--out` at a folder Hugo serves as static files. The script rewrites the
manifest only when the diff changes. Each save causes two quick reloads: one
for the page and one for the manifest.

To compare against a different branch, pass `--base <ref>`. In this repository,
`make server-oss-changes` starts the fixture site with the watcher.

### In a PR preview

A preview build is a built site, so it needs to opt in. A GitHub Actions
preview workflow does it in three steps:

1. Check out with `fetch-depth: 2`. A `pull_request` run checks out the pull request's
   merge commit, and its first parent is the base branch.
2. Before the Hugo build, run the script from the module at the pinned version,
   against that parent:

   ```yaml
   - name: Write change-highlights manifest
     continue-on-error: true
     run: |
       extras_dir="$(go mod download -json github.com/solo-io/docs-theme-extras | jq -r .Dir)"
       python3 "$extras_dir/scripts/changes_manifest.py" \
         --base HEAD^1 --exact-base --out static/_extras/changes.json
   ```

3. Set `HUGO_PARAMS_THEMEEXTRAS_CHANGEHIGHLIGHTS: "true"` on the Hugo build
   step.

Set the variable in the workflow, not in a config file. A config file can also
be read by a production build, and production pages must never load the
overlay. Leave the production deploy workflow unchanged.

A site that builds previews with a Makefile target instead, such as a
Cloudflare Pages project, does the same three things in that target: fetch the
base branch if the clone does not have it, run the script, and set the
variable on the Hugo command for preview branches only.

### Keep the manifest out of production

Hugo copies every static file into every build, production included, and the
overlay switch cannot stop that. A manifest left in `static/_extras/` by a
local watcher would publish the branch's unreleased text. The watcher deletes
it when it stops, but a crash or a deploy run while the watcher is still
running would not. Make each production build target delete the folder first:

```make
build:
	rm -rf static/_extras
	hugo --gc --minify
```

Keep the folder in a preview build target, which writes the manifest just
before it builds.

## Limits

- **Changes are marked by whole word.** Changing `3000` to `3001` inside a URL
  highlights the whole URL token.
- **Only Markdown files are diffed.** A change to a layout, a data file, or a
  config file is not marked.
- **Content mounted from another repository is not in the diff.** On the docs
  hub, pages mounted from an OSS repository show no marks for changes made in
  that repository.
- **A new snippet in an existing page is not marked.** The manifest stores no
  text for new files, so a brand-new snippet that an existing page reuses shows
  nothing. A new page is marked as a whole.
- **A renamed page shows as new.** The script does not follow renames, so a
  moved page gets the "New page" label.
- **An edit to a shared snippet can mark a page that uses a per-version copy.**
  When only the shared copy changed, the overlay cannot tell a real per-version
  copy from a mount of the shared file, so it may mark text the two copies
  share.
- **A change that only touches formatting is not marked.** Making existing
  words bold changes no visible text.
