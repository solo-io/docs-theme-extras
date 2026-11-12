---
title: OpenAPI with Scalar
weight: 382
description: Regression page for the openapi shortcode with the Scalar renderer.
# Kept out of sidebar/section-card listings (like tabs-sync.md) so it doesn't
# change auto-cards.spec.ts's expected child count; render:always keeps the
# page built so openapi-scalar.spec.ts can load it by direct path.
build:
  list: never
  render: always
---

Two Scalar viewers on one page. The bundle must load once, and each mount must hold one viewer.

{{< openapi src="test/openapi/sample.yaml" renderer="scalar" tryItOut="false" serverUrl="https://api.example.com" >}}

{{< openapi src="test/openapi/sample.yaml" renderer="scalar" tryItOut="false" hideInfo="true" >}}
