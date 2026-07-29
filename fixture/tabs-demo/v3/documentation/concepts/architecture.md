---
title: Architecture
weight: 10
description: The main components of the platform and how a request moves through them.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). -->

This page describes the main components of the platform and how a request
moves through them.

## Components

The platform splits into a control plane and a data plane:

- **Control plane.** This component watches Kubernetes resources, validates
  configuration, and translates it into the data-plane format.
- **Data plane.** This component is the set of proxies that terminate client
  connections and forward traffic to backends.
- **Config store.** This component holds the desired state that the control
  plane reconciles against.

## Request lifecycle

A typical request flows through the following stages:

1. The client opens a connection to a data-plane proxy.
2. The proxy matches the request against a route.
3. Any attached policies, such as authentication or rate limiting, run.
4. The proxy forwards the request to the selected backend.

> [!NOTE]
> Policies run in a fixed order regardless of the order in which you attach
> them, so the outcome stays predictable.
