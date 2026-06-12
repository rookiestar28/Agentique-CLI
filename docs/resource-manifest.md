# Resource Manifest And Package Concepts

A resource manifest describes public metadata for content that a creator wants to prepare for Agentique. The manifest should be portable, explicit, and free of credentials or private machine paths.

## Resource Manifest

A resource manifest should describe:

- Name, summary, and public description.
- Creator or publisher display metadata.
- Content type and intended use.
- Package inventory and content hashes when available.
- Distribution mode preference.
- Public support and source links when applicable.

## Skill Package

A skill package should describe skill metadata, expected inputs, public examples, and limitations. It must not require secret values, connected accounts, browser cookies, private keys, or local-only files.

## Workflow Template

A workflow template should describe steps, public parameters, and expected outputs. Credentials, connected-account settings, and private endpoint values should be represented as placeholders or omitted.

## Distribution Mode

A distribution mode explains how users can inspect or obtain a resource after `agentique.io` accepts it. Examples include public metadata view, package download, external project link, or read-only readback. The platform decides the final publication and distribution state.

## Non-Static Lane Descriptors

Static packages can describe non-static resource lanes without executing or hosting them. The examples in `starters/non-static-lane-descriptors` cover agent card descriptors, external endpoint registrations, downloadable packages, tool-enabled packages, static skills or workflows, and hosted-deferred readback records.

These descriptors are public metadata for preparation and review. They do not route endpoint traffic, run tools, publish packages, approve resources, or prove live behavior.

## Surfacing Metadata

Resource manifests may include optional `surfacing` metadata. These fields are public creator or integrator hints that help describe intended task use, audience, rough priority, review recency, compatibility, and context budget preferences.

Example:

```json
{
  "surfacing": {
    "taskIntents": ["source-review", "public-summary"],
    "audience": ["agent", "developer"],
    "priority": 0.6,
    "recency": {
      "lastReviewedAt": "2026-06-01T00:00:00.000Z",
      "reviewCadenceDays": 90
    },
    "compatibility": {
      "runtimeFamilies": ["node", "browser"],
      "protocols": ["https"]
    },
    "contextBudget": {
      "maxTokens": 4000,
      "maxBytes": 65536,
      "preferredSummaryBytes": 4096
    },
    "notes": "Public creator-provided hints for resource selection."
  }
}
```

Surfacing metadata is not a ranking promise, review outcome, platform approval, or safety guarantee. The platform remains authoritative for upload review, scanning, moderation, publication state, and final public readback.

## Permission And Risk Declarations

Resource manifests may include optional `permissionRisk` metadata. These declarations describe expected behavior from the creator or integrator's perspective.

Example:

```json
{
  "permissionRisk": {
    "readOnly": true,
    "destructive": false,
    "idempotent": true,
    "openWorld": false,
    "externalNetwork": false,
    "credentialed": false,
    "approvalRequired": false,
    "dataSensitivity": "public",
    "capabilities": ["read-public-content"],
    "reviewNotes": "Reads public package content without credential access."
  }
}
```

For resources that can mutate state, use credentials, touch sensitive data, or operate in an open-world environment, set `approvalRequired` to `true`. These declarations are not trusted by default and may be overridden by platform review.

## Output Contracts

Skill, workflow, and tool-listing metadata can use output contracts to describe expected input shape, output shape, maximum output size, timeout hints, error behavior, and redaction expectations.

Output contracts are for static review and local validation. They do not execute a tool, prove runtime behavior, approve publication, or certify safety.

## Minimal Context Bundles

A minimal context bundle is a public projection for selected resource context. It should contain only bounded summaries, selected examples, public links, selected contract metadata, and deeper-fetch URLs for clients that need more public detail.

Context bundles should not embed private manifests, all-catalog payloads, account data, moderation notes, or unbounded resource content. Treat bundle content as advisory public context; `agentique.io` remains authoritative for final readback state and public resource availability.

## Registry Trust Metadata

Resource manifests may include optional `registryTrust` metadata for public-safe preparation signals:

- `creatorMetadata` records who declared the package metadata and when.
- `packageContext` records public package identity, source URL, ownership evidence version, and digest presence.
- `creatorCheckpoints` records acknowledged preparation steps such as lane selection, source upload, manifest inspection, scan or ownership evidence, data-flow disclosure, card fields, public draft preview, review-only confirmation, and readback acknowledgement.
- `generatedDraft` marks local card or manifest suggestions as draft-only.
- `patchDelta` describes explicit patch or delta operations without representing a full snapshot.

These fields are creator-supplied preparation metadata. They do not set platform scan state, publication state, review state, verified badges, latest-version state, or platform trust scores. The uploader can use them to report checkpoint readiness and local draft or patch output, but `agentique.io` remains authoritative for review submission, validation, moderation, publication, distribution state, and public readback.

## Parser And Variant Metadata

Resource manifests may include optional `parserVariant` metadata for public-safe parser and variant preparation signals:

- `parserEvidence` records source ecosystem, source format, parser id/version, parse status, confidence, sanitizer status, digest presence, and the no-execution proof.
- `resourceGraphSummary` records sanitized node, edge, capability, source-file, and entrypoint counts without raw source content.
- `compatibility` records bounded reason codes such as static metadata compatibility or manual review requirements.
- `platformVariants` records platform id, artifact kind, source-only availability, validation state, and reason codes.

Parser and variant metadata is descriptive local preparation metadata. It does not execute imported content, install packages, run workflows, open notebooks, build containers, start MCP servers, or import agent frameworks. Creator manifests may describe source-only variant metadata, but they must not claim platform-managed validation, platform download availability, publication, approval, hosted execution, or runtime compatibility.

Blocked, unsupported, stale, and review-required states should remain visible as states instead of being hidden. Public readback remains authoritative when `agentique.io` exposes parser/variant projection data.

## Agent-Native Metadata

Resource manifests may include optional `agentNative` metadata for public-safe agent-native preparation signals:

- `namespace` records creator-declared namespace id, slug, coordinate, version, and declaration timestamp.
- `provenanceTrust` records non-certifying source/referrer/signature/SBOM/attestation labels, evidence state, digest presence, and reason codes.
- `installGuidance` records source-only or guidance-only target hints such as Codex or Claude Code, artifact kind, no-execution posture, manual-review expectations, and reason codes.
- `privateMcpBoundary` records public metadata boundary labels such as public metadata only, omitted credential handling, and tool-response isolation.
- `resolverIntent` records creator-supplied intent kinds and fail-closed or manual-review handling for ambiguous matches.

Agent-native metadata is descriptive local preparation metadata. It does not resolve live resources, install packages, start MCP servers, run tools, provide credential handling, publish resources, approve submissions, certify safety, or prove runtime compatibility. Creator manifests may declare preparation hints, but platform-managed latest pointers, resolver results, access availability, download-backed install states, and badge states remain public readback fields owned by `agentique.io`.

Blocked, unsupported, stale, private-denied, and resolver-ambiguous states should remain visible as states in fixtures and readback instead of being hidden. The uploader's agent-native plan command uses validator evidence for local review only.

## Scan Readback

Scan, trust, parser, variant, and agent-native readback are public statuses that `agentique.io` exposes after platform processing. Public readback can include desired-state, scanner-policy, trust-panel, review-eligibility, report-action, version-history, parser evidence, compatibility, platform variant fields, namespace/latest-pointer labels, provenance labels, install guidance, public-boundary labels, and resolver-result summaries. Local validation is not platform approval. Local validation is not safety certification.
