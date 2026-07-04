<p align="center">
  <img src="assets/agentique.png" alt="Agentique: Discover AI agent resources" width="760">
</p>

<img src="assets/logo_full.png" alt="Agentique logo" width="72" align="left">

# Agentique

[Agentique.io](https://agentique.io) is a platform for preparing, reviewing, publishing, and displaying public AI resource listings. The platform owns upload, scan, review, moderation, publication state, distribution state, and public readback.

This repository is the public companion developer kit for Agentique creators and integrators. It provides public schemas, starter packages, local no-execution validation, read-only readback helpers, a least-privilege validation action, and a review-only uploader CLI.

Local tools in this repository do not publish, approve, certify, moderate, install, extract, open, or execute resources.

<br clear="left">

## Quick Start

Install the published companion packages:

```bash
npm install @agentique.io/schemas @agentique.io/validator @agentique.io/readback @agentique.io/uploader
```

Validate a package locally:

```bash
npx agentique-validator validate <package-dir> --schemas-dir node_modules/@agentique.io/schemas --json
```

Read public resource status:

```js
import {
  createBadgeState,
  createReadbackClient,
  normalizeTrustReadback
} from "@agentique.io/readback";

const client = createReadbackClient();
const readback = await client.getReadback("resource-id");
const trust = normalizeTrustReadback(readback);
const badge = createBadgeState(readback);

console.log(`${badge.label}: ${badge.message}`);
console.log(trust.platformState);
```

Work from source:

```bash
npm ci --ignore-scripts
npm test
npm run validate:starters
```

Detailed local workflows and command examples are in [docs/local-workflows.md](docs/local-workflows.md).

## What Is Included

| Path | Purpose |
|---|---|
| `docs/` | Public usage, release, governance, support, package, and safety-boundary documentation. |
| `schemas/` | Public JSON Schema contracts for resource manifests, readback projections, packages, portable profiles, graph/block review, and upload-preparation metadata. |
| `starters/` | Static example packages for agents, skills, workflows, tools, bundles, parser/variant metadata, agent-native metadata, portable profiles, graph/block review, and upload-preparation boundaries. |
| `packages/validator` | No-execution CLI and library for local package validation, external intake, portable profile checks, graph/block checks, and upload-preparation reports. |
| `packages/action` | Least-privilege GitHub Action wrapper around local validation. |
| `packages/readback` | Read-only public API client, normalizers, badge helpers, and explicit-output download helper. |
| `packages/uploader` | Review-only CLI for upload plans, local drafts, patch output, public catalog reads, download metadata, direct byte download, and authenticated review-session checks. |
| `scripts/` | Repository tests, starter validation, release checks, workflow posture checks, registry readback, install smoke, URL inventory, package dry-runs, and go/no-go checks. |

## Main Capabilities

- Prepare static resource packages with public manifests.
- Validate manifests, package paths, hashes, bounded file reads, contract JSON, and secret-like content locally.
- Run local validation through a read-only GitHub Action.
- Review external candidate directories without installing dependencies, executing code, fetching submodules, downloading Git LFS objects, or extracting archives.
- Prepare descriptor-only portable profile and graph/block review metadata.
- Generate local review reports for skill-source and role/plugin candidates.
- Query public Agentique catalog, detail, readback, trust, parser/variant, agent-native, and download metadata.
- Download public artifact bytes only when canonical public metadata, POST ticket flow, safe filename, byte size, and SHA-256 digest checks pass.

## Public Boundaries

The companion tools are preparation and readback helpers. They do not replace platform review.

- Local validation is not platform approval or safety certification.
- Parser/variant, agent-native, portable profile, and graph/block metadata are descriptor-only local preparation evidence.
- The uploader package is review-only; final resource publication remains platform-owned and account/token gated.
- Direct download writes bytes only to an explicit output path and does not install, extract, open, execute, approve, certify, host, or moderate content.
- Public readback reflects the state exposed by `agentique.io`; stale or unavailable readback should be shown as stale or unavailable.

## Documentation

- [Local workflows and commands](docs/local-workflows.md)
- [Repository overview](docs/overview.md)
- [Resource manifests and package concepts](docs/resource-manifest.md)
- [Agent resource portability](docs/agent-resource-portability.md)
- [Graph/block review](docs/graph-block-review.md)
- [Non-static lane examples](docs/non-static-lane-examples.md)
- [Contract evaluation fixtures](docs/contract-evaluation-fixtures.md)
- [Companion repositories](docs/companion-repositories.md)
- [Governance](docs/governance.md)
- [Review routing](docs/review-routing.md)
- [Support and security](docs/support-and-security.md)
- [Release evidence](docs/release-evidence.md)
- [Release go/no-go](docs/release-go-no-go.md)
- [Package release provenance](docs/package-release-provenance.md)
- [Public URL inventory](docs/public-url-inventory.md)

Package-specific documentation:

- [Validator](packages/validator/README.md)
- [Readback](packages/readback/README.md)
- [Uploader](packages/uploader/README.md)
- [Action](packages/action/README.md)
- [Starters](starters/README.md)

## Release Status

The coordinated companion package set is published at `0.2.2` for `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, `@agentique.io/readback`, and `@agentique.io/uploader`. See [docs/release-go-no-go.md](docs/release-go-no-go.md), [docs/release-evidence.md](docs/release-evidence.md), and [docs/package-release-provenance.md](docs/package-release-provenance.md) for the current release decision, evidence, and rollback posture.

## License

Apache-2.0. See [LICENSE](LICENSE).
