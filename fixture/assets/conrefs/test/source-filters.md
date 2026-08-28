MARKER_SF_ALWAYS. Ungated lead sentence, present on every render path.

{{% upstream %}}
## Upstream-only section {#sf-upstream}

MARKER_SF_UPSTREAM_ONLY. Rendered only where this file is read directly.

1. A numbered step, so the gated body has to re-flow through Markdown rather
   than survive as literal text.

   ```sh
   echo sf-upstream
   ```
{{% /upstream %}}

{{% downstream %}}
## Downstream-only section {#sf-downstream}

MARKER_SF_DOWNSTREAM_ONLY. Rendered only where this file is pulled downstream.

1. A numbered step here too, for the same reason.

   ```sh
   echo sf-downstream
   ```
{{% /downstream %}}

MARKER_SF_INLINE_LEAD. Inline percent form: {{% upstream %}}MARKER_SF_INLINE_UP.{{% /upstream %}}{{% downstream %}}MARKER_SF_INLINE_DOWN.{{% /downstream %}}

MARKER_SF_ANGLE_LEAD. Inline angle form, which the reuse filter must also match even though percent is the documented form for block bodies: {{< upstream >}}MARKER_SF_ANGLE_UP.{{< /upstream >}}{{< downstream >}}MARKER_SF_ANGLE_DOWN.{{< /downstream >}}

MARKER_SF_TAIL. Ungated trailing sentence. A strip regex that runs past its own
closing tag would eat this, so its presence is part of the assertion.
