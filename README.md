<p align="center">
  <img src="assets/agentique.png" alt="Agentique: Discover AI agent resources" width="760">
</p>

<img src="assets/logo_full.png" alt="Agentique logo" width="72" align="left">

# Agentique

[Agentique.io](https://agentique.io) is a platform for preparing, reviewing, publishing, and displaying public AI resource listings. It owns upload, scan, review, moderation, publication state, distribution state, and public readback.

This repository is the public companion developer kit for Agentique creators and integrators. It helps prepare resource packages, validate package structure, and read public publication status from `agentique.io`.

<br clear="left">

This repository is for creators and integrators before and after platform submission:

- Prepare static resource packages with public manifests.
- Validate package shape, hashes, paths, bounded file reads, contract-bearing JSON files, and secret-like content locally.
- Run the same validation in GitHub Actions with read-only permissions.
- Use the review-only uploader CLI for upload plans, parser import dry-runs, variant dry-runs, agent-native dry-runs, creator checkpoint readiness, local draft output, local patch/delta output, and authenticated review-session checks before a platform-owned submission.
- From a source checkout, review portable profile metadata and graph/block metadata with no-execution local preparation commands.
- Consume public readback status, trust projection summaries, parser/variant summaries, agent-native summaries, and badge states for resources that are already published by `agentique.io`.
- From a source checkout, exercise public catalog list/detail/download-metadata reads and direct artifact byte downloads when an approved public readback endpoint and resource id are available.
- Use public tools to prepare, validate, and display resource status before entering the Agentique website upload flow.

Local tools in this repository do not publish, approve, certify, edit, delete, moderate, install, extract, open, or execute resources.

## Table Of Contents

- [Quick Start With Packages](#quick-start-with-packages)
- [Quick Start From Source](#quick-start-from-source)
- [Current Release Status](#current-release-status)
- [Repository Contents](#repository-contents)
- [Resource Package Workflow](#resource-package-workflow)
- [Starters](#starters)
- [Non-Static Lane Examples](#non-static-lane-examples)
- [Parser Variant Examples](#parser-variant-examples)
- [Agent-Native Examples](#agent-native-examples)
- [Portable Profile Tools](#portable-profile-tools)
- [Graph Block Tools](#graph-block-tools)
- [Validator CLI](#validator-cli)
- [Uploader CLI](#uploader-cli)
- [GitHub Action](#github-action)
- [Readback SDK And Badges](#readback-sdk-and-badges)
- [Schemas](#schemas)
- [Contract Evaluation Fixtures](#contract-evaluation-fixtures)
- [Release And Publication Gates](#release-and-publication-gates)
- [Support And Security](#support-and-security)
- [License](#license)

## Quick Start With Packages

The published companion packages are available on npm under the `@agentique.io` scope:

```bash
npm install @agentique.io/schemas @agentique.io/validator @agentique.io/readback @agentique.io/uploader
```

Published package pages currently include `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, `@agentique.io/readback`, and `@agentique.io/uploader`. Registry readback currently shows all five companion packages at `0.2.1`.

Parser/variant package surfaces were included in the coordinated npm package release `0.2.0` and are carried forward in the published `0.2.1` package set; the scoped release decision in [docs/release-go-no-go.md](docs/release-go-no-go.md) records hosted CI, GitHub Actions publication, registry readback, clean install smoke, and rollback/unpublish procedure evidence.

Catalog/download CLI and SDK surfaces are included in the coordinated npm package releases. The `0.2.1` package set is published for canonical public catalog envelopes and ticket-backed byte transfer. Owner-approved disposable byte-transfer evidence is recorded for a public catalog resource; this is a bounded live transfer smoke, not a safety certification or platform approval of downloaded content.

Agent-native schema, validator, readback, badge, uploader dry-run, and starter changes are published in the `0.2.1` package set. These changes do not provide a public resolver, direct-install path, managed runtime access, or trust certification.

Portable profile and graph/block schema, validator, starter, and package-surface smoke changes are prepared as the coordinated `0.2.2` package candidate in this source tree. The currently published npm package set remains `0.2.1` until the manual publishing workflow completes and registry readback plus clean install smoke confirm `0.2.2`.

Use the validator package for local static checks:

```bash
npx agentique-validator validate <package-dir> --schemas-dir node_modules/@agentique.io/schemas --json
```

Use readback helpers for public resource state exposed by `agentique.io`:

```js
import {
  createBadgeState,
  createReadbackClient,
  normalizeAgentNativeReadback,
  normalizeTrustReadback
} from "@agentique.io/readback";

const client = createReadbackClient();
const readback = await client.getReadback("resource-id");
const trust = normalizeTrustReadback(readback);
const agentNative = normalizeAgentNativeReadback(readback);
const badge = createBadgeState(readback);

console.log(`${badge.label}: ${badge.message}`);
console.log(trust.platformState);
console.log(agentNative.resolverResult?.state ?? "unavailable");
```

## Quick Start From Source

Use this flow when developing from a local checkout or reviewing repository changes:

Requirements:

- Node.js 20 or newer.
- npm 10 or newer, as bundled with supported Node.js releases.

From a local checkout of this repository:

```bash
cd <agentique-companion-repo>
npm ci --ignore-scripts
npm test
npm run validate:starters
```

Validate one starter package:

```bash
node packages/validator/src/cli.mjs validate starters/agent-assistant --schemas-dir schemas --json
```

Prepare upload-readiness output for one package:

```bash
node packages/validator/src/cli.mjs upload-prep starters/agent-assistant --schemas-dir schemas --json
```

Review a raw external candidate directory before adapting it into a package:

```bash
node packages/validator/src/cli.mjs external-intake <repo-or-dir> --json
```

The external intake scan is a local advisory preflight. It does not install dependencies, run lifecycle scripts, fetch submodules, download Git LFS objects, extract archives, or approve the candidate for publication.

Review portable profile behavior locally:

```bash
node packages/validator/src/cli.mjs portable-generate starters/portable-profile-review/portable/portable-profile.json --target codex-skill --output .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-drift starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-parity starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs debt-ledger starters/portable-profile-review --json
node packages/validator/src/cli.mjs portable-eval starters/portable-profile-review/portable/portable-profile.json --output-dir .tmp/portable-profile-eval --sandbox no-exec-temp --schemas-dir schemas --json
```

Portable profile commands are local preparation tools. They generate descriptor-only files into explicit output directories, validate drift and parity, scan explicit deferred-risk markers, and run measurement-only sandbox preflights. They do not install adapters into agent clients, execute generated content, trust lifecycle hooks, call private APIs, approve resources, certify safety, or change user configuration.

Review graph/block behavior locally:

```bash
node packages/validator/src/cli.mjs bundle-validate starters/graph-block-review/graph/graph-block-bundle.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-import-plan starters/graph-block-review/graph/graph-block-bundle.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-inspect starters/graph-block-review/ledger/execution-ledger.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs artifact-scan starters/graph-block-review/artifacts/workspace-artifact.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs api-drift starters/graph-block-review/api/api-drift.json --schemas-dir schemas --json
```

Graph/block commands are local preparation tools. They validate descriptor-only topology and metadata, generate explicit-output plans or diagnostic reports, and check artifact/API metadata without executing graph nodes, loading block runtimes, fetching artifact bytes, starting services, approving resources, certifying safety, or changing user configuration.

Review uploader source behavior locally:

```bash
node packages/uploader/src/cli.mjs auth status --json
node packages/uploader/src/cli.mjs upload plan starters/agent-assistant --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload import-plan starters/parser-variant-import-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload variant-plan starters/parser-variant-import-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload agent-native-plan starters/agent-native-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload draft starters/agent-assistant --schemas-dir schemas --draft-kind manifest --json
node packages/uploader/src/cli.mjs upload patch starters/agent-assistant --schemas-dir schemas --json
node packages/uploader/src/cli.mjs catalog list --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog get <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog download-metadata <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs download <resource-id> --output ./downloads/ --api-url https://www.agentique.io --json
```

The uploader can create review-only upload sessions when configured with platform API access and checkpoint-ready package metadata. Import-plan, variant-plan, and agent-native-plan commands are local dry-runs from validator evidence. Local draft and patch commands are unsubmitted helper outputs. Catalog commands are read-only public readback requests. Direct download writes bytes only to the explicit output path and does not install, extract, open, or execute content. The uploader does not publish, approve, certify, host, or moderate resources.

Run release-readiness checks locally:

```bash
npm run release:check
npm run workflow:check
npm run pack:dry-run
npm run registry:readback
npm run install:smoke
npm run urls:check
npm run release:go-no-go
```

The source repository, npm packages, action usage reference, badge/readback documentation, and `agentique.io` public links are **Go** after publication and smoke testing. GitHub Marketplace-style promotion remains a separate future channel.

## Current Release Status

Source repository, package registry, action usage, badge/readback documentation, and platform-link publication decision for existing advertised channels: **Go**.

Parser/variant package changes already included in `0.2.0` remain **Go** and are carried forward in the coordinated `0.2.1` npm package set. Owner approval to use the manual GitHub Actions package publishing workflow is recorded, hosted Release Check passed on `main`, GitHub Actions publication completed, registry readback confirms all companion packages at `0.2.1`, and registry install smoke passed.

Catalog/download behavior is **Go** for the coordinated `0.2.1` package-release claim. Hosted Release Check passed on `main`, GitHub Actions registry provenance completed, registry readback confirms all companion packages at `0.2.1`, registry install smoke passed, and rollback/unpublish procedure evidence is recorded. Owner-approved disposable byte-transfer smoke passed for a public catalog resource without auth, signed URL output, opening, extraction, or execution.

Agent-native source changes are **Go** for the coordinated `0.2.1` package-release claim. Registry readback, clean install smoke, rollback evidence, and branch cleanup are recorded. The source changes are local preparation and public readback helper surfaces only.

Portable profile and graph/block source changes are **Go** for the coordinated `0.2.2` package-candidate workflow, but public advertising of those package changes remains disabled until hosted publishing, registry readback, and clean registry install smoke confirm the `0.2.2` package set. Runtime and direct-install claims remain disabled.

Public-safe evidence currently recorded:

- The public repository is available at [github.com/rookiestar28/Agentique](https://github.com/rookiestar28/Agentique).
- The published companion npm packages are `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, `@agentique.io/readback`, and `@agentique.io/uploader`.
- `@agentique.io/uploader` is a published review-only CLI package at `0.2.1`.
- The source package version is `0.2.2` for the coordinated package candidate; npm registry advertising remains tied to the recorded published `0.2.1` set until post-publish evidence exists.
- Local package tests, starter validation, release checks, workflow posture checks, registry readback, install smoke, and package dry-runs pass for this source revision; dependency audit and secret scan evidence is recorded in [docs/release-evidence.md](docs/release-evidence.md).
- Hosted Release Check evidence is recorded for the latest pushed public release candidate; later branch changes require a fresh hosted run before downstream release claims.
- Public `main` branch protection is enabled.
- Final public repository, package, docs, schema, action usage, badge/readback documentation, and platform URLs are approved.
- Existing `agentique.io` public links remain approved through the recorded URL inventory; catalog/download metadata evidence and owner-approved disposable byte-transfer evidence are recorded for this patch candidate.
- Owner go/no-go approval is recorded.

Approved and separate channels:

- Package registry URLs are approved after publication and install smoke testing.
- Badge/readback documentation is approved through the published readback package.
- Public action usage documentation is approved as a repository usage reference.
- Repository-side known-issues hardening is reconciled in `KNOWN_ISSUES.md`; GitHub Actions registry provenance succeeded for the coordinated `0.2.1` release, and future publisher, workflow, package, or environment changes still require owner-side confirmation.
- GitHub Marketplace-style promotion remains separate from this source/package release.
- Platform API access and final resource publication remain platform-owned and account/token gated.

Release evidence and approved public channels are tracked in [docs/release-evidence.md](docs/release-evidence.md), [docs/release-go-no-go.md](docs/release-go-no-go.md), and [docs/public-url-inventory.json](docs/public-url-inventory.json).

## Repository Contents

| Path | Purpose |
|---|---|
| `docs/` | Public concepts, manifests, governance, support, release, URL, and go/no-go guidance. |
| `schemas/` | JSON Schema contracts for public resource manifests, package manifests, distribution modes, readback projections, portable profiles, and graph/block review metadata. |
| `starters/` | Static example packages for agents, skills, workflows, tool listings, bundles, parser/variant metadata, agent-native metadata, portable profile metadata, and graph/block metadata. |
| `packages/validator` | No-execution CLI and library for local package validation, portable profile checks, graph/block checks, and upload preparation. |
| `packages/action` | Least-privilege GitHub Action wrapper around local validation. |
| `packages/readback` | Read-only client and badge helpers for public resource status. |
| `packages/uploader` | Published review-only uploader CLI package; platform publication decisions remain on `agentique.io`. |
| `scripts/` | Repository validation, starter validation, workflow posture, registry readback, install smoke, package dry-run, URL inventory, and go/no-go checks. |

## Resource Package Workflow

1. Start from a static starter in `starters/`.
2. Edit `manifest.json` with public metadata.
3. Add inspectable Markdown or JSON content files.
4. Keep secrets, credentials, private paths, generated archives, dependency folders, executable payloads, and personal data out of the package.
5. Add optional `registryTrust` metadata only for public-safe creator checkpoints, package context, generated draft metadata, or patch/delta metadata.
6. Add optional `parserVariant` metadata only for static parser evidence, sanitized graph summaries, compatibility reasons, and source-only platform variant descriptions.
7. Add optional `agentNative` metadata only for namespace, non-certifying provenance labels, source-only or guidance-only install guidance, public boundary labels, and resolver intent.
8. Validate locally with the validator CLI.
9. Use uploader plan, import-plan, variant-plan, agent-native-plan, draft, or patch commands for local review-only preparation when useful.
10. Submit through the platform-owned upload flow or an authenticated review-only uploader session when configured.
11. Use readback helpers only after `agentique.io` exposes public resource status.

Package concepts are documented in [docs/resource-manifest.md](docs/resource-manifest.md).

## Starters

Available examples:

- `starters/agent-assistant` - agent profile and operating notes.
- `starters/skill-source-summarizer` - reusable skill description.
- `starters/workflow-evidence-review` - workflow template for reviewing public sources.
- `starters/tool-mcp-listing` - public listing metadata for a tool or MCP-style endpoint.
- `starters/resource-bundle-curation` - bundled guide and manifest example.
- `starters/non-static-lane-descriptors` - static descriptors for agent cards, external endpoints, downloadable packages, tool-enabled packages, static skill/workflow resources, and hosted-deferred readback records.
- `starters/parser-variant-import-review` - static parser evidence and source-only variant metadata for local review.
- `starters/agent-native-review` - static namespace, provenance, install-guidance, public boundary, and resolver-intent metadata for local review.
- `starters/portable-profile-review` - static portable profile, generated adapter manifest, and descriptor-only target output for local review.
- `starters/graph-block-review` - static graph, block manifest, diagnostic ledger, workspace artifact, API drift, and generated fixture metadata for local review.

Validate every starter:

```bash
npm run validate:starters
```

See [starters/README.md](starters/README.md) for starter-specific guidance.

## Non-Static Lane Examples

The public examples in [docs/non-static-lane-examples.md](docs/non-static-lane-examples.md) show how to describe non-static resource lanes with static, inspectable package metadata. The examples cover agent cards/descriptors, external endpoint registrations, downloadable packages, tool-enabled packages, static skills/workflows, and hosted-deferred records.

These examples validate package shape and metadata only. They do not route live endpoint work, run package content, provide hosting, publish resources, approve submissions, provide safety guarantees, or decide moderation outcomes.

## Parser Variant Examples

The parser/variant starter in [starters/parser-variant-import-review](starters/parser-variant-import-review) shows synthetic parser evidence, sanitized graph counts, compatibility reasons, and source-only variant metadata. Blocked, unsupported, stale, and public readback parser/variant cases are covered in `schemas/fixtures/schema-fixtures.json` and checked by repository tests.

## Agent-Native Examples

The agent-native starter in [starters/agent-native-review](starters/agent-native-review) shows synthetic namespace coordinates, non-certifying provenance labels, source-only or guidance-only install guidance, public boundary labels, and fail-closed resolver intent. Review-required and resolver-ambiguous cases are covered in `schemas/fixtures/schema-fixtures.json` and package tests.

Agent-native examples are metadata for local review. They do not execute package content, resolve live resources, prove runtime compatibility, create platform downloads, publish resources, approve submissions, certify safety, or replace platform review.

Parser/variant examples are metadata for local review. They do not execute imported content, prove runtime compatibility, create platform downloads, publish resources, approve submissions, or replace platform review.

## Portable Profile Tools

The portable profile starter in [starters/portable-profile-review](starters/portable-profile-review) shows a canonical instruction source, profile/mode aliases, command mappings, target host support, blocked states, provenance, license metadata, and public redaction boundaries.

The validator package includes source-checkout commands for descriptor-only adapter generation, drift validation, command/profile parity, deferred-risk ledger scanning, and opt-in measurement-only evaluation preflight. See [docs/agent-resource-portability.md](docs/agent-resource-portability.md).

Portable profile outputs are local preparation artifacts. They do not install files into agent clients, execute generated content, trust lifecycle hooks, approve resources, certify safety, provide runtime compatibility, or replace platform review.

## Graph Block Tools

The graph/block starter in [starters/graph-block-review](starters/graph-block-review) shows descriptor-only graph topology, block manifests, diagnostic ledger events, workspace artifact metadata, API drift metadata, and generated block fixture manifests.

The validator package includes source-checkout commands for graph bundle validation, import/export plan generation, fixture manifest generation, diagnostic ledger inspection, replay diagnostics, workspace artifact metadata scanning, and API drift checks. See [docs/graph-block-review.md](docs/graph-block-review.md).

Graph/block outputs are local preparation artifacts. They do not install packages, execute graph nodes, load block runtimes, fetch artifact bytes, start services, mutate user agent configuration, approve resources, certify safety, provide runtime compatibility, or replace platform review.

## Validator CLI

The validator is a static checker. It does not install package dependencies, execute package code, upload files, or call private platform APIs.

Validate package shape:

```bash
node packages/validator/src/cli.mjs validate <package-dir> --schemas-dir schemas --json
```

Generate upload-preparation output:

```bash
node packages/validator/src/cli.mjs upload-prep <package-dir> --schemas-dir schemas --json
```

Run no-execution external intake preflight on a raw candidate directory:

```bash
node packages/validator/src/cli.mjs external-intake <repo-or-dir> --json
```

Run portable profile local preparation commands:

```bash
node packages/validator/src/cli.mjs portable-generate <portable-profile.json> --target codex-skill --output <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-drift <portable-profile.json> --manifest <dir>/portable/generated-adapter-manifest.json --output-dir <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-parity <portable-profile.json> --manifest <dir>/portable/generated-adapter-manifest.json --output-dir <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs debt-ledger <root-dir> --json
node packages/validator/src/cli.mjs portable-eval <portable-profile.json> --output-dir <dir> --sandbox no-exec-temp --schemas-dir schemas --json
```

Run graph/block local preparation commands:

```bash
node packages/validator/src/cli.mjs bundle-validate <graph-block-bundle.json> --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-import-plan <graph-block-bundle.json> --output-dir <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-export-plan <graph-block-bundle.json> --output-dir <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs block-fixtures-generate <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-inspect <execution-ledger.json> --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-replay-diagnostics <execution-ledger.json> --output-dir <dir> --schemas-dir schemas --json
node packages/validator/src/cli.mjs artifact-scan <workspace-artifact.json> --schemas-dir schemas --json
node packages/validator/src/cli.mjs api-drift <api-drift.json> --schemas-dir schemas --json
```

Exit codes:

- `0` - package is locally valid.
- `1` - package has validation findings.
- `2` - CLI usage or configuration error.

Checks include:

- Manifest validation against local public schemas.
- Package inventory and SHA-256 verification.
- Unsafe path rejection.
- Blocked executable extension rejection.
- Secret-like value detection with redacted findings.
- Forbidden public-content path and term checks.
- External intake preflight for raw candidate directories, including repository metadata gates, payload classification, execution-surface inventory, dangerous capability patterns, high-risk truncation blockers, redacted secret fingerprints, and license recognition plus intake-policy signals.
- Graph/block checks for descriptor-only topology, static block manifests, diagnostic ledgers, redacted artifact metadata, API drift snapshots, generated fixture manifests, and no-execution boundaries.

External intake findings are review inputs only. Passing this local preflight does not publish, approve, certify, moderate, or legally clear a candidate.

License findings distinguish recognized signals from intake policy outcomes such as allowed, needs-review, blocked, and unknown. These labels are conservative local review signals, not legal advice or platform approval.

See [packages/validator/README.md](packages/validator/README.md).

## Uploader CLI

The uploader package is a published review-only CLI implementation. It is useful for local integration review because it can report redacted auth status, generate validator-backed upload plans, and exercise review-session submit/status flows when configured with platform API access.

This repository revision also includes parser import dry-runs, variant dry-runs, agent-native dry-runs, portable profile checks, graph/block checks, public catalog reads, download-metadata reads, and direct artifact byte download for local review. The full companion package set is published at `0.2.1` after hosted CI, GitHub Actions registry provenance, registry readback, and registry install smoke. This source tree prepares a coordinated `0.2.2` package candidate; it is not advertised as the published npm set until post-publish registry evidence exists. Owner-approved disposable byte-transfer smoke passed for a public catalog resource.

Install from npm:

```bash
npm install @agentique.io/uploader
```

Source commands:

```bash
node packages/uploader/src/cli.mjs auth status --json
node packages/uploader/src/cli.mjs upload plan <package-dir> --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload import-plan <package-dir> --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload variant-plan <package-dir> --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload agent-native-plan <package-dir> --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload draft <package-dir> --schemas-dir schemas --draft-kind manifest --json
node packages/uploader/src/cli.mjs upload patch <package-dir> --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload submit <package-dir> --schemas-dir schemas --token <token> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs upload status <submission-id> --token <token> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog list --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog get <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog download-metadata <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs download <resource-id> --output ./downloads/ --api-url https://www.agentique.io --json
```

`upload plan` reports validator-backed package evidence and creator checkpoint readiness. From the source checkout, `upload import-plan` reports parser evidence, graph counts, and compatibility for local review, `upload variant-plan` reports source-only variant states and review reasons for local review, and `upload agent-native-plan` reports namespace, provenance, install-guidance, public-boundary, and resolver-intent labels for local review. `upload draft` and `upload patch` are local-only and unsubmitted. `upload submit` requires scoped token auth, an Agentique API origin, checkpoint-ready package metadata, and server completion verification.

`catalog list`, `catalog get`, and `catalog download-metadata` are GET-only public readback commands and do not require uploader auth. `download` resolves public metadata, writes bytes to the explicit `--output` path, verifies SDK size/digest checks, and redacts signed URLs and absolute local paths from CLI output. It does not install, extract, open, execute, approve, certify, publish, host, or moderate content. Uploader package installation is available from npm at the recorded published version; this source tree is prepared as `0.2.2` pending publication evidence. Owner-approved disposable byte-transfer evidence is recorded for a public catalog resource.

See [packages/uploader/README.md](packages/uploader/README.md), [docs/release-go-no-go.md](docs/release-go-no-go.md), and [docs/package-release-provenance.md](docs/package-release-provenance.md).

## GitHub Action

Use the action to run validation in a repository workflow with read-only permissions. For local monorepo use:

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v6
  - uses: ./packages/action
    with:
      package-dir: ./starters/agent-assistant
      schemas-dir: ./schemas
      validator-script: ./packages/validator/src/cli.mjs
```

The action writes `agentique-validation.json` by default.

Recommended workflow posture:

- Use `pull_request`, not privileged pull request triggers, for untrusted contributions.
- Do not require secrets for validation.
- Keep default permissions read-only.
- Treat action output as local readiness information only.

Check local workflow posture:

```bash
npm run workflow:check
```

See [packages/action/README.md](packages/action/README.md) and [docs/hosted-ci-and-repository-protection.md](docs/hosted-ci-and-repository-protection.md).

## Readback SDK And Badges

The readback package is read-only. It targets versioned public resource paths under `/api/public/v1/resources` for public status, public resource lists, resource detail, download metadata, readback projections, context bundles, and selection readback projections when those `agentique.io` endpoints are available.

Example:

```js
import {
  createBadgeState,
  createReadbackClient,
  downloadResourceArtifact,
  normalizeAgentNativeReadback,
  normalizeDownloadMetadata,
  normalizeResourceList,
  normalizeTrustReadback
} from "@agentique.io/readback";

const client = createReadbackClient();
const catalog = normalizeResourceList(await client.listResources({ limit: 10 }));
const metadata = normalizeDownloadMetadata(await client.getDownloadMetadata("resource-id"));
const readback = await client.getReadback("resource-id");
const trust = normalizeTrustReadback(readback);
const agentNative = normalizeAgentNativeReadback(readback);
const badge = createBadgeState(readback);

console.log(`${badge.label}: ${badge.message}`);
console.log(trust.trustPanel?.state ?? trust.platformState);
console.log(agentNative.resolverResult?.state ?? "unavailable");
console.log(`${catalog.items.length} catalog entries`);
console.log(metadata.availability);
```

Read-only methods:

- `getStatus(resourceId)`
- `listResources(params)`
- `getResource(resourceId)`
- `getDownloadMetadata(resourceId)`
- `getReadback(resourceId)`
- `getContextBundle(resourceId, params)`
- `getSelectionReadback(resourceId, params)`

`downloadResourceArtifact()` can write available artifact bytes to an explicit output path with HTTPS or loopback URL validation, manual redirect handling, no-overwrite default, temp-file cleanup, size checks, and digest checks. It does not install, extract, open, execute, approve, certify, publish, host, or moderate content. Callers should treat downloaded bytes as untrusted until they perform their own review.

Badge states:

- `published`
- `parsed`
- `partial`
- `unsupported`
- `variant-available`
- `agent-native-ready`
- `agent-native-review-required`
- `agent-native-private-denied`
- `agent-native-ambiguous`
- `review-required`
- `rescan-required`
- `blocked`
- `stale`
- `unavailable`
- `rate-limited`

Trust normalization projects public desired-state, scanner-policy, trust-panel, review-eligibility, report-action, and version-history fields when the platform exposes them. Parser/variant normalization, agent-native normalization, badge states, canonical catalog envelope fixes, and ticket-backed byte-transfer readback helpers are published in readback `0.2.1`; the source tree is prepared as a coordinated `0.2.2` package candidate for the latest portable profile and graph/block surfaces. The direct download utility remains bounded to explicit-output byte transfer with size/digest checks and no install, extraction, opening, execution, approval, certification, hosting, or moderation behavior. Badge output is a public readback summary, not a safety guarantee. See [packages/readback/README.md](packages/readback/README.md).

## Schemas

Schemas are stored in `schemas/` and can be used by local tooling or external validation pipelines:

- `resource-manifest.schema.json`
- `package-manifest.schema.json`
- `skill-metadata.schema.json`
- `workflow-metadata.schema.json`
- `distribution-mode.schema.json`
- `agent-native.schema.json`
- `parser-variant.schema.json`
- `public-readback.schema.json`
- `registry-trust.schema.json`
- `surfacing-metadata.schema.json`
- `permission-risk.schema.json`
- `output-contract.schema.json`
- `tool-listing.schema.json`
- `context-bundle.schema.json`
- `portable-profile.schema.json`
- `generated-adapter-manifest.schema.json`
- `graph-block-bundle.schema.json`
- `block-manifest.schema.json`
- `execution-ledger.schema.json`
- `workspace-artifact.schema.json`
- `api-drift.schema.json`
- `generated-block-fixtures-manifest.schema.json`

The validator CLI uses these schemas through `--schemas-dir schemas`.

`parser-variant.schema.json` defines public parser evidence, sanitized resource graph summaries, compatibility reasons, and platform variant states. Creator manifests may describe source-only variant metadata, but they must not claim platform-managed validation, platform download availability, publication, approval, or runtime compatibility. This schema is included in the coordinated package releases through the recorded published package set and remains in the `0.2.2` package candidate.

`agent-native.schema.json` defines public preparation metadata and readback projection shapes for namespace coordinates, non-certifying provenance evidence labels, install-target guidance, public-boundary summaries, and resolver-result summaries. Creator manifests may declare preparation hints, but platform-managed latest pointers, resolver results, access availability, and download-backed install states remain public readback fields owned by `agentique.io`.

`portable-profile.schema.json` and `generated-adapter-manifest.schema.json` define static portability metadata for canonical sources, profile modes, command surfaces, target host support, generated descriptor provenance, drift state, and no-execution safety flags. They are local preparation contracts and do not create runtime or publication claims.

Graph/block schemas define descriptor-only graph topology, static block manifests, diagnostic-only ledgers, workspace artifact metadata, API drift metadata, and generated fixture manifests. They are local preparation contracts and do not execute graphs, load block runtimes, fetch artifact bytes, start services, approve resources, certify safety, or create package-publication claims.

## Contract Evaluation Fixtures

Release checks include a synthetic public fixture matrix for surfacing contracts:

```bash
scripts/fixtures/surfacing-contract-matrix/matrix.json
```

The matrix covers overlapping tools or resources, relevant candidates with declared risk, stale or off-topic resources, invalid outputs, and context budget overflow. It is baseline release evidence for companion docs, schemas, validators, and readback helpers. It is not a production review rule set and does not expose platform scoring, quarantine criteria, internal review procedures, moderation disposition logic, or operational playbooks.

Parser/variant fixture coverage includes supported parsed/source-only metadata, blocked parser sources, unsupported and stale platform variant states, and public readback parserVariant projection. Agent-native fixture coverage includes creator metadata, stale or missing provenance labels, unsupported/guidance-only install states, public-boundary states, resolver ambiguity, and public readback agentNative projection. Portable profile and graph/block fixture coverage includes descriptor-only generated adapter metadata, static graph/block metadata, diagnostic ledgers, artifact metadata, API drift metadata, and generated fixture manifests. These fixtures are local contract evidence only.

See [docs/contract-evaluation-fixtures.md](docs/contract-evaluation-fixtures.md).

## Release And Publication Gates

Before publishing a new version, advertising a new public channel, or changing platform links, the repository must pass local and hosted gates:

```bash
npm test
npm run validate:starters
npm run release:check
npm run workflow:check
npm run pack:dry-run
npm run registry:readback
npm run install:smoke
npm run urls:check
npm run release:go-no-go
npm audit --omit=dev
```

Package-level audits:

```bash
npm --prefix packages/validator audit --omit=dev
npm --prefix packages/action audit --omit=dev
npm --prefix packages/readback audit --omit=dev
```

When `@agentique.io/uploader` depends on newly published companion package versions, package-local uploader dependency verification runs after companion registry readback and before publishing uploader. The publish workflow then runs full registry readback plus registry install smoke after the full package set is published.

Release status and follow-up boundaries are documented in [docs/release-go-no-go.md](docs/release-go-no-go.md). Package release expectations are documented in [docs/package-release-provenance.md](docs/package-release-provenance.md).

## Support And Security

- Documentation and tooling questions can use public issues.
- Resource disputes, abuse reports, moderation matters, and account problems use platform-owned support or report flows.
- Vulnerabilities use the private security disclosure route described in [SECURITY.md](SECURITY.md).
- Do not post secrets, exploit details, private account data, personal data, moderation material, or unsafe resource contents in public issues.

## License

Apache License 2.0. See [LICENSE](LICENSE).
