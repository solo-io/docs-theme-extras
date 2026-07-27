---
title: Authentication
weight: 20
description: Configure API key and OIDC authentication on a route.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). -->

This page covers the two authentication methods you can attach to a route.

## API keys

An API key policy validates a shared secret sent in a request header. Store
the keys in a Kubernetes secret and reference it from the policy:

```yaml
apiVersion: security.solo.io/v1
kind: AuthPolicy
metadata:
  name: apikey
spec:
  apiKey:
    headerName: x-api-key
    secretRef:
      name: httpbin-keys
```

## OAuth and OIDC

For user-facing traffic, delegate authentication to an OIDC provider. The
gateway redirects unauthenticated users to the provider and validates the
returned token:

```yaml
apiVersion: security.solo.io/v1
kind: AuthPolicy
metadata:
  name: oidc
spec:
  oidc:
    issuer: https://accounts.example.com
    clientId: sef-demo
    clientSecretRef:
      name: oidc-secret
```

> [!WARNING]
> Keep client secrets in a secret manager. The inline examples here are for
> illustration only.
