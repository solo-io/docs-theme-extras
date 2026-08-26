# Release checklist

Run through this list before tagging a new module version. The goal:
catch consumer-breaking changes in the module repo, not in production
docs sites.

---

## 1. Module self-test passes

Build both brand variants and run the full harness against the bundled
fixture:

```sh
make test-all
```

`test-all` runs `test-oss` and `test-enterprise`; each builds its brand
(`build-oss` / `build-enterprise`) and runs `npx playwright test` with no
`--project` filter, so this covers every project — including the
`cross-browser-*` suites and the `browser-crawl` console/4xx crawl.

Also confirm the bare baseline (no brand layer) builds clean:

```sh
hugo160 --config hugo.toml   # bare baseline
```

Check that the build log contains no new unallowlisted Hugo warnings.

**If you added, removed or changed a shortcode since the last release**, two
things have to be true, and `make test-all` only proves one of them for you:

- The `everything` fixture calls it. The `everything` page should exercise every
  current shortcode, and nothing checks that automatically — this is the manual
  half.
- Its source comment header is conformant and current. `docs-coverage.spec.ts`
  runs inside `test-all` and fails if a header is missing a field, omits a
  parameter the template reads, or no longer matches the generated page. That is
  the automatic half, so a green `test-all` means the docs are already right.

The contract for the header is in
[MAINTAINING.md](./MAINTAINING.md#the-shortcode-header-contract).

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
Playwright specs pass. Run **both** projects: `static` (theme/fixture
behavior) and `content` (the consumer's own built HTML + markdown source,
where the leak and content-break scans live). Exact target names vary per
consumer (`framework-test-*`); if the consumer only wires a static target,
invoke the harness directly:

```sh
DOCS_TEST_CONFIG=<abspath>/.docs-test.toml npx playwright test \
  --project=static --project=content
```

Multi-product hubs run `content` per product with `CONTENT_DIR=<product>`.

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
listed in the [shadows tables in MAINTAINING.md](./MAINTAINING.md#maintaining-the-shadows)
and confirm our local additions
are still present and well-positioned in the new upstream context.
Don't skip this — a silently-dropped insertion is the most common
hextra-upgrade regression and the hardest to debug after the fact.

## 5. Update CHANGELOG and docs

### CHANGELOG

Add an entry to [CHANGELOG.md](./CHANGELOG.md) under a new version
heading. Categorize changes as Added / Changed / Fixed / Removed.
Patch/minor/major rules in CHANGELOG.md's preamble.

If the release requires consumer-side migration (renamed shortcode,
changed shortcode args, removed param), call it out explicitly with
before/after examples — that's what consumer-repo PR authors will read.

### Docs

The shortcode reference and the `themeExtras` parameter reference are
GENERATED from the source files, and the generated tree is committed. Regenerate
it and confirm the site still builds:

```sh
npm run gen:docs            # rewrite docs/content from the sources
npm run gen:docs -- --check # must exit 0
make build-docs             # must be green
```

`--check` is also enforced by `docs-coverage.spec.ts` inside `make test-all`, so
a clean step 1 means this is already done. Run it anyway if you have touched
`layouts/` since — regenerating is cheap and a stale committed tree publishes a
wrong parameter table.

Do NOT hand-edit anything under `docs/content/authoring/shortcodes/` or
`docs/content/configuration/params.md`. Edit the source comment header, or
`PARAM_DOCS` in `tests/helpers/gen-docs.ts`, and regenerate.

The docs site itself deploys from `main` on its own workflow
(`.github/workflows/pages.yml`), NOT from the tag, so it needs no action here.
It also means the published site describes `main` and can be ahead of the tag
you are cutting.

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
```

> [!WARNING]
> Do **not** run `hugo mod tidy` to move a pin. It deletes the `require` block
> outright rather than rewriting it, so the bump silently reverts to whatever
> the module graph resolves on its own. `hugo mod get` with an explicit version
> is the only safe form.

The PR diff should show only `go.mod` / `go.sum` changes (unless the
release requires consumer content migration, in which case the PR
also includes those changes).

Hold the consumer PRs until the module tag is green; merge them in
whatever order makes sense for the rollout.

After the bump, verify the `go.mod` entry for `docs-theme-extras` shows the expected tag pseudo-version or SHA, not a stale commit from a previous `@main` resolution.
