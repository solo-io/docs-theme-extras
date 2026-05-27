# Release checklist

Run through this list before tagging a new module version. The goal:
catch consumer-breaking changes in the module repo, not in production
docs sites.

---

## 1. Module self-test passes

```sh
make build-fixture
make self-test
```

All three fixture builds (bare, oss, enterprise) green:

```sh
hugo160 --config hugo.toml          # bare baseline
hugo160 --config hugo-oss.toml      # oss brand
hugo160 --config hugo-enterprise.toml # enterprise brand
```

Check that the build log contains no new unallowlisted Hugo warnings.

If you added or removed a shortcode since the last release, verify that `everything` fixture has been updated to call it. The `everything` page should exercise every current shortcode.

Run cross-browser tests:

```sh
make test-cross-browser
```

## 2. Consumer integration check (local replace)

For **each** consumer repo, point its `go.mod` at the local module
checkout via `replace`, then build:

```sh
# In consumer repo:
go mod edit -replace github.com/solo-io/docs-theme-extras=../docs-theme-extras
make build
```

The build must complete without Hugo errors or warnings. Revert the
`replace` directive once verified — never ship a `replace` to main.

Also run the consumer's framework tests against its built output to confirm
Playwright specs pass:

```sh
make framework-test-static
```

## 3. Visual smoke (light + dark, both consumers)

**Module fixture first.** Start the dev server for each brand and open
`/test/v1/everything/` in a browser:

```sh
make server-oss         # http://localhost:1313/test/v1/everything/
make server-enterprise  # http://localhost:1313/test/v1/everything/
```

Confirm the `everything` page renders correctly for
both brand variants before moving on to consumer sites:
— No raw shortcode delimiters
- No broken layout
- Components look right under both light and dark mode

**Then open these pages in each consumer's built site and verify:**

- `gloo-mesh/latest/ambient/setup/sample-apps/ecs-integration/`

Look for these issues:

- Header / sidebar / footer render in the consumer's brand.
- Light/dark toggle swaps correctly.
- Cards grid is 1 / 2 / 3 columns responsive.
- Code blocks have syntax highlighting and copy button.
- Mermaid diagrams render to SVG.
- Version dropdown opens and lists versions.
- Refresh on a deep-linked URL (e.g. `…/everything/#cards`) lands at
  the anchor cleanly — no flash of top content, no late jump.
- OpenAPI rendered region loads (if the consumer ships one).
- Versioned and conditional sections rendering correctly.

**Mobile — each navigation level above the version.**

Use browser DevTools device emulation (375 px width, or a real device) and
repeat all of the checks above at every navigation level that sits above the
version segment. Test at least these levels before descending to a deep content page:

- Site root / docs landing page
- Product root
- Version landing

At each level, apply every item on the browser checklist above, plus confirm
these mobile-specific behaviors:

- Hamburger trigger opens the top-level nav and all items are reachable by
  touch.
- Mobile sidebar opens and closes without layout shift or scroll-position
  jump.
- Light/dark toggle is reachable from the mobile nav (not hidden behind
  desktop-only controls).
- No horizontal scroll at 375 px — no element bleeds past the viewport edge.
- Version dropdown is tappable and dismisses correctly on outside tap.

## 4. Re-diff shadows on Hextra bumps

If this release bumps the Hextra pin (`go.mod`), walk every file
listed in [SHADOWS.md](./SHADOWS.md) and confirm our local additions
are still present and well-positioned in the new upstream context.
Don't skip this — a silently-dropped insertion is the most common
hextra-upgrade regression and the hardest to debug after the fact.

## 5. Update CHANGELOG

Add an entry to [CHANGELOG.md](./CHANGELOG.md) under a new version
heading. Categorize changes as Added / Changed / Fixed / Removed.
Patch/minor/major rules in CHANGELOG.md's preamble.

If the release requires consumer-side migration (renamed shortcode,
changed shortcode args, removed param), call it out explicitly with
before/after examples — that's what consumer-repo PR authors will read.

## 6. Tag and push

```sh
git tag vX.Y.Z
git push origin vX.Y.Z
```

GitHub Actions builds and tests the tag; the tag becomes the canonical
ref for consumer `go.mod` pins.

## 7. Consumer-side bump PRs

For each consumer, in a separate PR:

```sh
hugo mod get github.com/solo-io/docs-theme-extras@vX.Y.Z
hugo mod tidy
```

The PR diff should show only `go.mod` / `go.sum` changes (unless the
release requires consumer content migration, in which case the PR
also includes those changes).

Hold the consumer PRs until the module tag is green; merge them in
whatever order makes sense for the rollout.

After the bump, verify the `go.mod` entry for `docs-theme-extras` shows the expected tag pseudo-version or SHA, not a stale commit from a previous `@main` resolution.
