MARKER_REMAP_INTRO. A reused table whose gated row is authored against the OSS
version string and remapped to the enterprise version. See
tests/reuse-version-remap.spec.ts for the full rationale.

| Function | Description |
| ------- | ----------- |
| `MARKER_REMAP_ALWAYS_KEY` | MARKER_REMAP_ALWAYS_DESC. Ungated row; renders on every version. |
{{% version include-if="v2oss" %}}| `MARKER_REMAP_GATED_KEY` | MARKER_REMAP_GATED_DESC. Percent-form row gated to OSS version v2oss, remapped to v2 on the enterprise config. |{{% /version %}}
