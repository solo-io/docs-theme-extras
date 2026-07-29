---
title: Networking
weight: 20
description: How listeners, routes, and load balancing shape traffic through the gateway.
---

<!-- Demo content for the tab-navigation prototype (solo-io/docs#3164). -->

This page explains how listeners, routes, and load balancing shape traffic as
it passes through the gateway.

## Listeners and routes

A listener binds a port and protocol on the gateway. Each listener owns a set
of routes, and each route matches requests by host, path, header, or method:

- A **listener** accepts connections on a given port, such as `443` for HTTPS.
- A **route** matches requests and points them at one or more backends.
- A **backend** is the upstream service that ultimately handles the request.

## Load balancing

When a route targets several backend endpoints, the gateway spreads requests
across them. Several algorithms are available:

| Algorithm      | Best for                                   |
| -------------- | ------------------------------------------ |
| Round robin    | Evenly sized backends with similar latency |
| Least request  | Backends with uneven request cost          |
| Ring hash      | Sticky sessions keyed on a header          |

> [!TIP]
> Round robin is a sensible default. Switch to least request only when you can
> measure uneven load across endpoints.
