Regression guard for the v0.1.18-beta.1 fragmentation: a `conditional-text`
block (percent form) that wraps an INDENTED fenced code block as a numbered
list-item continuation, rendered through `reuse` (the two-pass rebase→reuse
chain). The fence must render as a real `<pre>` inside the `<li>`, not fragment
the list (orphaned `hextra-code-block` wrapper immediately followed by
`</li>`/`</ol>`). Routing `$isFencedBlock` through RenderString (block) instead
of raw-emit reintroduces the break — built-html-integrity's fragmented-code
check catches it against this page.

1. MARKER_CONDREUSE_FENCE_STEP1. Apply the gated configuration.
   {{% conditional-text include-if="test" %}}
   ```sh
   kubectl apply -f config-test.yaml
   ```{{% /conditional-text %}}{{% conditional-text exclude-if="test" %}}
   ```sh
   kubectl apply -f config-other.yaml
   ```{{% /conditional-text %}}

2. MARKER_CONDREUSE_FENCE_STEP2. Verify the result renders as a continuous list.
