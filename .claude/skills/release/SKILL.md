---
name: release
description: Release workflow for docs-theme-extras — the consumer repos that pin the module and get bumped on every release, how beta tags are cut and pushed (the one push Claude may do itself), and the CHANGELOG section ordering. Use when cutting a beta tag, releasing a version, bumping the extras pin in consumer repos, or writing a changelog entry.
---

# docs-theme-extras release workflow

This skill documents the recurring release chores for `docs-theme-extras`: cutting
beta tags, bumping the module pin across the consumer repos, and ordering the
CHANGELOG. All repos below are sibling clones under `~/Documents/GitHub`.

## Consumer repos that pin the module

These repos import `github.com/solo-io/docs-theme-extras` and get their pin bumped
on essentially every release. Update **all six** together unless told otherwise.

| Nickname | 
|----------|
| agw oss |
| agr oss |
| ambientmesh | 
| docs (Solo.io hub) |
| kgw oss |
| kagent oss (note the `docs-site/` subdir, not repo root) |

The pin appears as `require github.com/solo-io/docs-theme-extras vX.Y.Z // indirect`.
Consumer bumps are deliberate, one version at a time — never a floating ref.

### Bumping the pin

Run from inside each consumer repo, using the version-pinned Hugo binary
(`hugo160`, not bare `hugo`):

```bash
hugo160 mod get github.com/solo-io/docs-theme-extras@vX.Y.Z
```

This updates both `go.mod` and `go.sum` with the correct hash. Then verify:

```bash
grep "docs-theme-extras vX.Y.Z " go.mod
grep "docs-theme-extras vX.Y.Z h1:" go.sum   # hash should match across all repos
```

Notes:
- `hugo mod get` leaves the **old version's lines in `go.sum`**. They're harmless
  (go.sum keeps historical hashes) and the build resolves fine. If a clean go.sum
  matters, remove the two stale `vX.Y.(Z-1)` lines **by hand** — do NOT reach for
  `tidy`.
- **Never run `hugo160 mod tidy` (or `go mod tidy`) to prune the pin.** In the
  `docs` hub these modules (`docs-theme-extras`, `kgateway.dev`, `ambientmesh.io`)
  are declared as **Hugo module imports in the hugo config, not Go source
  imports**, so the Go tooling treats them as unused and `tidy` **deletes the
  entire `require` block** — not just churn, it drops all three pins and breaks the
  build. Same trap applies to any consumer whose extras pin is `// indirect`. If
  you run it by reflex, `git checkout go.mod go.sum` and redo with `hugo mod get`
  only.
- Leave the changes local. Do **not** commit or push consumer-repo changes
  automatically — that's a user action (see the push rule below).

## Beta tags (and the one push Claude may do itself)

Tag convention: `vX.Y.Z-beta.N`. Betas increment `N` (`-beta.1`, `-beta.2`, …);
the final release drops the suffix (`vX.Y.Z`). Both beta and final tags are cut
the same way, from the current release branch (e.g. `release-next`).

**Pushing a tag is the ONLY push Claude is allowed to do on its own.** Everything
else (branch commits, `git push` of branches, opening PRs) waits for an explicit
user instruction — see `feedback_no_auto_push`.

Steps:

```bash
# 1. Confirm the working tree is clean and the branch is in sync with origin
git status -sb          # want a clean tree, no ahead/behind on the branch

# 2. Pick the next tag by looking at existing tags
git tag --sort=-creatordate | head

# 3. Create an annotated tag on HEAD and push just that tag
git tag -a vX.Y.Z-beta.N -m "vX.Y.Z-beta.N"
git push origin vX.Y.Z-beta.N
```

There is no `make` release target; tagging is manual. After the tag lands on
GitHub, the Go module proxy can fetch it, and the consumer-repo bump above will
resolve.

## CHANGELOG ordering and entry rules

`CHANGELOG.md` lists **newest version first** (`## [vX.Y.Z] — YYYY-MM-DD`).

### Section order within a version

Order the `###` sections by type, most disruptive first:

1. **Breaking** — anything that requires content edits in consumer repos
2. **Add** / **Feature** — new shortcode, partial, or capability
3. **Fix** — non-breaking fix
4. **Test harness** / chore — last

(Recent versions drifted into author/commit order — e.g. v0.1.22 lists Fixes
before its Add. Re-sort to the order above when editing; don't copy the drift.)

### Writing an entry

The rules are also stated at the top of `CHANGELOG.md` — follow them:

- **Lead with *why*** — the bug, missing behavior, or failure mode — not just
  what changed, so a reader gets the motivation without the diff.
- **Link a production page** that shows the bug or the fix. For additive features
  with no single defect page, link a representative page where the new behavior is
  observable and say how to verify it (view-source, a validator, etc.).
  This link is required on every entry (see `feedback_changelog_production_link`).
- **State how it was verified** — the local build, the Playwright spec added, the
  fixture exercised.
- Note that the change takes effect **when a consumer bumps its extras pin** (or,
  for the `docs` hub where a local override shadows a module file, that a pin bump
  alone won't change hub output).

## Typical end-to-end flow

1. Land the change on the release branch; write the CHANGELOG entry (correct
   section order + production link + verification).
2. Cut a beta tag (`vX.Y.Z-beta.N`) and push it — allowed.
3. Bump the beta pin in the six consumer repos to smoke-test.
4. When ready, cut the final `vX.Y.Z` tag and push it — allowed.
5. Bump the six consumer repos to the final `vX.Y.Z`. Leave those edits local for
   the user to commit/PR.
