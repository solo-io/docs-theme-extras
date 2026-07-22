---
title: Install
weight: 10
description: Install the control plane into a Kubernetes cluster and verify that it is running.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). First
     leaf of the default Documentation tab, so clicking Documentation lands here. -->

This guide installs the control plane into a Kubernetes cluster and confirms
that every component is healthy before you deploy your first route.

## Prerequisites

Before you begin, make sure that you have the following tools and access:

- A Kubernetes cluster running version 1.28 or later.
- The `kubectl` CLI, configured to talk to that cluster.
- Helm 3.14 or later.
- Cluster-admin permissions in the namespace where you install.

## Install the control plane

Add the Helm repository and install the chart into the `sef-system` namespace:

```sh
helm repo add sef https://charts.solo.io
helm repo update
helm install sef sef/enterprise \
  --namespace sef-system \
  --create-namespace \
  --version 3.0.0
```

## Verify the installation

Check that the control-plane pods report a `Running` status:

```sh
kubectl get pods -n sef-system
```

> [!NOTE]
> The first install pulls several container images, so the pods can take a
> minute or two to become ready.

When every pod is ready, continue to the
[Quickstart](/v3/getting-started/quickstart/) to deploy your first route.
