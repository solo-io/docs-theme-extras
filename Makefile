# Hugo theme module + bundled HTML test harness. Two brand variants
# (OSS / enterprise) layer differently against the same fixture content;
# `make test-all` exercises both. `make test CONFIG=...` points the
# harness at an arbitrary consumer's pre-built `public/`.

HUGO    ?= hugo160
CONFIG  ?=

.PHONY: install \
        clear-cache \
        server-oss server-enterprise \
        build-oss build-enterprise build-flat \
        test-oss test-enterprise test-all \
        test clean help

install:
	npm ci || npm install

# ── Local dev servers ────────────────────────────────────────────────────
# baseURL "/" so the home page mounts at http://localhost:1313/. Path-only
# baseURLs ("/test") confuse Hugo's dev server into a malformed URL.
#
# When switching between brands, Hugo's resource cache (resources/_gen/)
# can serve stale compiled CSS bundles from the previous brand. The
# `clear-cache` prerequisite wipes that dir, and `--ignoreCache` tells
# Hugo not to consult any cache it does find. After server start, also
# hard-reload the browser (Cmd+Shift+R) to flush its CSS cache — Hugo
# re-emits CSS at the same URL paths, so a soft reload reuses the old.

clear-cache:
	@rm -rf resources

server-oss: clear-cache
	@echo "→ open http://localhost:1313/  (brand=oss; uses hugo-oss-local.toml)"
	@echo "  if it still looks like the previous brand: hard-reload browser (Cmd+Shift+R)"
	$(HUGO) server -D --ignoreCache --config hugo-oss-local.toml --gc 2> .build-oss-local.log

server-enterprise: clear-cache
	@echo "→ open http://localhost:1313/  (brand=enterprise; uses hugo-enterprise-local.toml)"
	@echo "  if it still looks like the previous brand: hard-reload browser (Cmd+Shift+R)"
	$(HUGO) server -D --ignoreCache --config hugo-enterprise-local.toml --gc 2> .build-enterprise-local.log

# ── Static brand builds ──────────────────────────────────────────────────
# Production-shaped baseURL ("/test") so paths match what consumer repos
# emit. Each brand has its own publishDir so they don't clobber each other.

# Hugo's publishDir ("public-<brand>/test") only ever emits under the "/test"
# baseURL path, so a literal root-absolute reference in content (e.g.
# "/images/logo.svg", meant to resolve at true domain root regardless of the
# docs subpath) has nowhere to land. The harness's builtRoot ("public-<brand>",
# see fixture/.docs-test-*.toml) is the parent of that "test" dir precisely to
# give such assets a place to live — mirror fixture/static there too so
# card-image.spec.ts's ROOTED case has a real file to resolve against.
# The `rm -rf` before each cp is load-bearing on a REBUILD. Hugo only owns
# "public-<brand>/test" (its publishDir), so "public-<brand>/images" survives a
# rebuild, and `cp -r src dst` copies INTO dst when dst already exists — giving
# "public-<brand>/images/images/…" on the second run and every run after. That
# silently adds files to the tree, which breaks byte-diffing one build against
# another; it is the technique used to prove a theme change altered nothing, so
# a stale nested copy shows up as phantom "only in" entries.
build-oss:
	$(HUGO) --config hugo-oss.toml --gc 2> .build-oss.log
	rm -rf public-oss/images && cp -r fixture/static/images public-oss/images

build-enterprise:
	$(HUGO) --config hugo-enterprise.toml --gc 2> .build-enterprise.log
	rm -rf public-enterprise/images && cp -r fixture/static/images public-enterprise/images

# VERSION-LESS fixture (hugo-flat.toml): parallel doc sets registered under
# params.sections with NO params.versions — the shape kagent ships. It is a
# separate BUILD rather than a separate harness TARGET: tests/section-
# versionless.spec.ts reads public-flat/ directly, so this needs no
# .docs-test TOML, no extra playwright project and no extra CI leg. See that
# spec's header for why.
# Two builds, one per half of the positional test in utils/section-segment.html:
# hugo-flat.toml puts the docs root in the baseURL (kagent's real shape, the
# PRIMARY rule), hugo-flat-root.toml puts it in a content directory named docs/
# (the `docs`-ALTERNATIVE rule). The spec asserts against both.
build-flat:
	$(HUGO) --config hugo-flat.toml --gc 2> .build-flat.log
	$(HUGO) --config hugo-flat-root.toml --gc 2> .build-flat-root.log

# SECTION SELECTOR WITH A CONFIGURED BUTTON TITLE, on a VERSIONED site — the
# docs-hub agentgateway shape. An overlay on hugo-oss.toml (comma-joined, later
# file wins) rather than a fixture of its own, so it inherits that build's
# content and versions and differs only in publishDir and the one param. Read
# directly by tests/section-dropdown-title.spec.ts; see hugo-section-title.toml
# for why the key cannot just be set on an existing branded fixture.
build-section-title:
	$(HUGO) --config hugo-oss.toml,hugo-section-title.toml --gc 2> .build-section-title.log

# ── Tests against the bundled fixture ────────────────────────────────────

# build-flat runs alongside each brand build so section-versionless.spec.ts has
# something to read. It is brand-independent (the version-less code paths do not
# touch the brand layer), so both brand runs assert against the same output —
# cheap, and it keeps `make test-oss` self-contained.
test-oss: build-oss build-flat build-section-title
	DOCS_TEST_CONFIG=$(abspath ./fixture/.docs-test-oss.toml) npx playwright test

test-enterprise: build-enterprise build-flat build-section-title
	DOCS_TEST_CONFIG=$(abspath ./fixture/.docs-test-enterprise.toml) npx playwright test

# Run both brand variants. CI default — surfaces brand-specific regressions
# before consumers see them.
test-all: test-oss test-enterprise

# ── Generic harness against an external consumer ─────────────────────────

test:
	@if [ -z "$(CONFIG)" ]; then \
		echo "CONFIG=path/to/x.toml is required" >&2; \
		echo "Example: make test CONFIG=/path/to/consumer-repo/.docs-test.toml" >&2; \
		exit 1; \
	fi
	DOCS_TEST_CONFIG=$(abspath $(CONFIG)) npx playwright test

clean:
	rm -rf public-oss public-enterprise public-oss-local public-enterprise-local \
	       public-flat public-flat-root public-section-title \
	       resources test-results playwright-report \
	       .build-oss.log .build-enterprise.log \
	       .build-flat.log .build-flat-root.log \
	       .build-oss-local.log .build-enterprise-local.log

help:
	@echo "Targets:"
	@echo "  install              - npm install / ci"
	@echo "  clear-cache          - rm -rf resources/ (hugo resource pipeline cache)"
	@echo ""
	@echo "  server-oss           - hugo dev server, brand=oss, baseURL=/ (auto-clears cache)"
	@echo "  server-enterprise    - hugo dev server, brand=enterprise, baseURL=/ (auto-clears cache)"
	@echo ""
	@echo "  build-oss            - static build, brand=oss        → public-oss/"
	@echo "  build-enterprise     - static build, brand=enterprise → public-enterprise/"
	@echo "  build-flat           - static builds, VERSION-LESS sections   → public-flat/ + public-flat-root/"
	@echo "  build-section-title  - static build, configured selector title → public-section-title/"
	@echo ""
	@echo "  test-oss             - build-oss + run harness against the OSS fixture"
	@echo "  test-enterprise      - build-enterprise + run harness against the enterprise fixture"
	@echo "  test-all             - both brand variants (CI default)"
	@echo ""
	@echo "  test CONFIG=x        - run harness against an external pre-built site"
	@echo "  clean                - remove build outputs and test reports"
