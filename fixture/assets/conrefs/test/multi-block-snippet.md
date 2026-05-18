MARKER_MULTIBLOCK_LEAD. A snippet whose body spans multiple block-level elements
(a paragraph, a fenced code block, and a tabs block). When this conref is
reused inside a numbered list item, the expansion's first line lands at the
list-item content column but continuation lines land at column 0. Goldmark's
list-continuation rule then closes the parent list early, hoisting the tabs
and any subsequent steps out into an `<ol start="N">` fragment. This snippet
exercises the exact shape that broke gloo-mesh's ambient multicluster install
pages.

```sh
# MARKER_MULTIBLOCK_FENCE_BEFORE
echo "first command group"
echo "second command group"
```

{{< tabs >}}
{{% tab name="Option A" %}}
MARKER_MULTIBLOCK_TAB_A. Option A tab body.

```sh
echo "option-a"
```
{{% /tab %}}
{{% tab name="Option B" %}}
MARKER_MULTIBLOCK_TAB_B. Option B tab body.

```sh
echo "option-b"
```
{{% /tab %}}
{{< /tabs >}}

MARKER_MULTIBLOCK_TRAIL. Trailing paragraph after the tabs block.
