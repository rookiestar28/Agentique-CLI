# Agentique Readback

Read-only public readback helpers for Agentique resources.

This package helps integrators consume public Agentique resource status from `agentique.io` when the platform exposes versioned public endpoints. It exposes status, list, detail, download metadata, readback projection, context bundle, and selection readback helpers only.

`agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback. This package does not publish, edit, delete, moderate, or approve resources.

## Install

```bash
npm install @agentique.io/readback
```

## Usage

```js
import { createBadgeState, createReadbackClient } from "@agentique.io/readback";

const client = createReadbackClient();
const readback = await client.getReadback("resource-id");
const badge = createBadgeState(readback);

console.log(badge.label);
```

## Read-Only Client

The client exposes:

- `getStatus(resourceId)`
- `listResources(params)`
- `getResource(resourceId)`
- `getDownloadMetadata(resourceId)`
- `getReadback(resourceId)`
- `getContextBundle(resourceId, params)`
- `getSelectionReadback(resourceId, params)`

No mutation methods are included. Platform pages remain canonical for user decisions.

The client targets versioned public resource paths under `/api/public/v1/resources`. Callers must handle unavailable, stale, rate-limited, and blocked states because endpoint availability and publication state are controlled by `agentique.io`.

Context bundle and selection readback helpers use narrow query allowlists for public selection hints such as `intent`, `audience`, `limit`, and `cursor`. They do not expose production platform scoring, risk thresholds, quarantine criteria, human-review procedures, moderation disposition logic, or operator response workflows.

Returned payloads are normalized with a defense-in-depth projection pass that removes explicitly private fields while preserving public schema fields such as `internalId`, `storageUsage`, `deploymentDate`, `tokenCount`, `objectType`, and `storageMode`. The platform API remains responsible for the authoritative public projection; client-side normalization is not a privacy boundary.

## Badge States

Badge helpers return explicit states:

- `published`
- `review-required`
- `blocked`
- `stale`
- `unavailable`
- `rate-limited`

Badge output is a public readback summary, not a safety guarantee.

## Status

Local implementation exists for review. The package has not been published yet.
