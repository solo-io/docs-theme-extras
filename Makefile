# Hugo theme module + bundled HTML test harness. Two brand variants
# (OSS / enterprise) layer differently against the same fixture content;
# `make test-all` exercises both. `make test CONFIG=...` points the
# harness at an arbitrary consumer's pre-built `public/`.

HUGO    ?= hugo160
CONFIG  ?=

.PHONY: install \
        clear-cache \
        server-oss server-enterprise \
        build-oss build-enterprise \
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

build-oss:
	$(HUGO) --config hugo-oss.toml --gc 2> .build-oss.log

build-enterprise:
	$(HUGO) --config hugo-enterprise.toml --gc 2> .build-enterprise.log

# ── Tests against the bundled fixture ────────────────────────────────────

test-oss: build-oss
	DOCS_TEST_CONFIG=$(abspath ./fixture/.docs-test-oss.toml) npx playwright test

test-enterprise: build-enterprise
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
	       resources test-results playwright-report \
	       .build-oss.log .build-enterprise.log \
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
	@echo ""
	@echo "  test-oss             - build-oss + run harness against the OSS fixture"
	@echo "  test-enterprise      - build-enterprise + run harness against the enterprise fixture"
	@echo "  test-all             - both brand variants (CI default)"
	@echo ""
	@echo "  test CONFIG=x        - run harness against an external pre-built site"
	@echo "  clean                - remove build outputs and test reports"
