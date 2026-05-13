<!-- Shared conref body for the trailing-step regression. Lives in its own
     file (not bundled into everything.md) so the everything-vs-rebased
     equivalence test in versioning.spec.ts stays clean — the percent-
     form bug only manifests on the reuse path, so the two pipelines
     would render this section with different structural-HTML counts. -->

## Numbered list with percent-form version block in the middle

Regression guard for the trailing-content bug fixed in the solo-io/docs#2480 follow-up. The pattern below mirrors the docs-hub `sidecar-manual-upgrade.md` conref: numbered steps wrap a percent-form version shortcode that contains its own numbered step and a fenced code block. Without the raw-emit fix in `version.html` (emitting `.Inner` directly so the body flows back into the page's markdown stream), the trailing top-level step that followed the version closer rendered as raw markdown text instead of an `<li>`, because `Page.RenderString` with `display: inline` collapsed the version body into a self-contained block and broke the parent `<ol>`'s continuity.

1. First top-level step before the version block.
   ```sh
   # MARKER_VERSION_TRAILING_PRE_FENCE
   echo "fenced code in step 1, outside the version block"
   ```
{{% version include-if="v2" %}}
2. MARKER_VERSION_INNER_STEP. Step inside the version block.
   ```sh
   # MARKER_VERSION_TRAILING_FENCE
   echo "fenced code inside a percent-form version block"
   ```
{{% /version %}}
3. MARKER_VERSION_TRAILING_STEP. This top-level step follows the version block and must render as an `<li>` continuing the parent `<ol>`, not as raw markdown text.
