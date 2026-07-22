---
title: Resources
weight: 10
description: Reference for the core Route and Gateway resources.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). First
     leaf of the API Reference tab, so clicking that tab lands here. -->

This page documents the core resources you use to configure traffic.

## The Route resource

A `Route` matches incoming requests and forwards them to one or more backends.

| Field         | Type     | Description                                   |
| ------------- | -------- | --------------------------------------------- |
| `hostnames`   | `[]string` | Host headers this route matches.            |
| `rules`       | `[]Rule`   | Ordered match-and-forward rules.            |
| `backendRefs` | `[]Ref`    | Backends that receive the matched traffic.  |

```yaml
apiVersion: gateway.solo.io/v1
kind: Route
metadata:
  name: httpbin
spec:
  hostnames:
    - www.example.com
  rules:
    - backendRefs:
        - name: httpbin
          port: 8000
```

## The Gateway resource

A `Gateway` binds listeners to ports and protocols and selects the routes that
attach to each listener.

| Field       | Type         | Description                              |
| ----------- | ------------ | ---------------------------------------- |
| `listeners` | `[]Listener` | Ports and protocols the gateway serves.  |
| `addresses` | `[]Address`  | Optional static addresses to bind.       |

> [!NOTE]
> Field names in this reference are illustrative and exist only to make the
> demo look complete.
