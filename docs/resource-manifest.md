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

## Scan Readback

Scan readback is the public status that `agentique.io` exposes after platform processing. Local validation is not platform approval. Local validation is not safety certification.
