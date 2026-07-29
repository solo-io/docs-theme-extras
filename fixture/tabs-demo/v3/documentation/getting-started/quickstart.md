---
title: Quickstart
weight: 20
description: Deploy a sample app, expose it through a route, and send your first request.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). -->

This quickstart deploys a sample workload, exposes it through a route, and
sends a request so that you can see traffic flow end to end.

## Deploy a sample app

Apply the sample deployment and service:

```sh
kubectl apply -f https://example.solo.io/samples/httpbin.yaml
kubectl rollout status deploy/httpbin
```

## Create a route

Define a route that forwards requests for `/get` to the sample service:

```yaml
apiVersion: gateway.solo.io/v1
kind: Route
metadata:
  name: httpbin
spec:
  hostnames:
    - www.example.com
  rules:
    - matches:
        - path:
            type: PathPrefix
            value: /get
      backendRefs:
        - name: httpbin
          port: 8000
```

Save the file and apply it:

```sh
kubectl apply -f httpbin-route.yaml
```

## Send a request

Port-forward the gateway and call the route:

```sh
kubectl port-forward svc/sef-gateway 8080:80 &
curl -H "Host: www.example.com" http://localhost:8080/get
```

> [!TIP]
> A `200 OK` response with a JSON body confirms that the route is live. If you
> get a `404`, double-check that the `Host` header matches the `hostnames`
> field in the route.
