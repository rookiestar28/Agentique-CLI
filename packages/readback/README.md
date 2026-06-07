# Agentique Readback

Read-only public readback helpers for Agentique resources.

This package helps integrators consume public Agentique resource status from `agentique.io` when the platform exposes versioned public endpoints. It exposes status, list, detail, download metadata, readback projection, context bundle, selection readback, catalog normalization, and safe byte-download helpers only.

`agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback. This package does not publish, edit, delete, moderate, approve, certify, install, extract, open, or execute resources.

Catalog and direct-download helpers are included in the 0.2.0 package source. The helpers remain read-only or explicit-output only, and they do not make a live direct-download availability claim unless owner-approved disposable byte-transfer evidence is recorded.

## Install

```bash
npm install @agentique.io/readback
```

## Usage

```js
import {
  createBadgeState,
  createReadbackClient,
  downloadResourceArtifact,
  normalizeDownloadMetadata,
  normalizeParserVariantReadback,
  normalizeResourceList,
  normalizeTrustReadback
} from "@agentique.io/readback";

const client = createReadbackClient();
const catalog = normalizeResourceList(await client.listResources({ limit: 10 }));
const metadata = normalizeDownloadMetadata(await client.getDownloadMetadata("resource-id"));
const readback = await client.getReadback("resource-id");
const trust = normalizeTrustReadback(readback);
const parserVariant = normalizeParserVariantReadback(readback);
const badge = createBadgeState(readback);

console.log(badge.label);
console.log(trust.trustPanel?.state ?? trust.platformState);
console.log(parserVariant.parserEvidence?.parseStatus ?? "unavailable");
console.log(`${catalog.items.length} catalog entries`);
console.log(metadata.availability);
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

`normalizeTrustReadback()` projects public desired-state, scanner-policy, trust-panel, review-eligibility, report-action, and version-history fields into a stable readback summary when those fields are present.

`normalizeResourceList()` projects public catalog list payloads into stable item and page-info fields. `normalizeDownloadMetadata()` projects public download metadata into availability, filename, media type, size, digest, and expiry fields while filtering private projection fields.

`normalizeParserVariantReadback()` projects public parser evidence and platform variant fields into a bounded summary when those fields are present. It reports digest presence instead of raw digests and keeps parser/variant state descriptive. Source-only variant metadata remains preparation evidence and is not treated as platform download readiness.

`downloadResourceArtifact()` can write available artifact bytes to an explicit output path. It enforces HTTPS outside loopback development, manual redirect handling, no-overwrite by default, safe filename/path checks, temp-file cleanup, size limits, and digest verification. It does not install, extract, open, execute, approve, certify, publish, host, or moderate downloaded content. Treat downloaded bytes as untrusted until separately reviewed.

## Badge States

Badge helpers return explicit states:

- `published`
- `parsed`
- `partial`
- `unsupported`
- `variant-available`
- `review-required`
- `rescan-required`
- `blocked`
- `stale`
- `unavailable`
- `rate-limited`

Parser and variant badge states are public readback summaries. They do not prove runtime compatibility, create platform downloads, or replace platform review.

Badge output is a public readback summary, not a safety guarantee.

## Status

Published as `@agentique.io/readback`. Badge output is a public readback summary, not a platform approval or safety guarantee.
