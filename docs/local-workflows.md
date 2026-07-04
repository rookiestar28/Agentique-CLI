# Local Workflows And Commands

This guide collects source-checkout commands that were previously embedded in the main README. These commands are local preparation and readback tools. They do not publish, approve, certify, moderate, install, extract, open, or execute resources.

## Requirements

- Node.js 20 or newer.
- npm 10 or newer.

Install source-checkout dependencies without lifecycle scripts:

```bash
npm ci --ignore-scripts
```

Run the standard source-checkout checks:

```bash
npm test
npm run validate:starters
```

## Validate Packages

Validate one starter package:

```bash
node packages/validator/src/cli.mjs validate starters/agent-assistant --schemas-dir schemas --json
```

Prepare upload-readiness output for one package:

```bash
node packages/validator/src/cli.mjs upload-prep starters/agent-assistant --schemas-dir schemas --json
```

Run a no-execution external intake preflight on a raw candidate directory:

```bash
node packages/validator/src/cli.mjs external-intake <repo-or-dir> --json
```

External intake inventories and classifies local files. It does not install dependencies, run lifecycle scripts, fetch submodules, download Git LFS objects, extract archives, or approve a candidate for publication.

## Portable Profile Review

Use these commands to generate descriptor-only target output and compare it against a portable profile:

```bash
node packages/validator/src/cli.mjs portable-generate starters/portable-profile-review/portable/portable-profile.json --target codex-skill --output .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-drift starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs portable-parity starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs debt-ledger starters/portable-profile-review --json
node packages/validator/src/cli.mjs portable-eval starters/portable-profile-review/portable/portable-profile.json --output-dir .tmp/portable-profile-eval --sandbox no-exec-temp --schemas-dir schemas --json
```

Portable profile outputs are local preparation artifacts. They do not install files into agent clients, execute generated content, trust lifecycle hooks, call private APIs, approve resources, certify safety, or change user configuration.

## Graph And Block Review

Use these commands to validate descriptor-only graph/block metadata and generate review plans:

```bash
node packages/validator/src/cli.mjs bundle-validate starters/graph-block-review/graph/graph-block-bundle.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-import-plan starters/graph-block-review/graph/graph-block-bundle.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-export-plan starters/graph-block-review/graph/graph-block-bundle.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs block-fixtures-generate .tmp/graph-block-fixtures --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-inspect starters/graph-block-review/ledger/execution-ledger.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-replay-diagnostics starters/graph-block-review/ledger/execution-ledger.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs artifact-scan starters/graph-block-review/artifacts/workspace-artifact.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs api-drift starters/graph-block-review/api/api-drift.json --schemas-dir schemas --json
```

Graph/block outputs are diagnostic metadata. They do not execute graph nodes, load block runtimes, fetch artifact bytes, start services, approve resources, certify safety, or change user configuration.

## Skill-Source And Role/Plugin Review

Use these commands when reviewing skill-source or role/plugin candidates from explicit metadata:

```bash
node packages/validator/src/cli.mjs upload-candidate <candidate.json> --output .tmp/upload-candidate-report.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs package-dry-run <candidate.json> --output-dir .tmp/static-package-preview --schemas-dir schemas --json
node packages/validator/src/cli.mjs source-no-go <candidate.json> --output .tmp/source-no-go-report.json --schemas-dir schemas --json
```

`upload-candidate` checks license, provenance, scanner summaries, source inventory, runtime-risk labels, redaction, and public wording. `package-dry-run` writes descriptor previews for eligible static candidates. `source-no-go` explains why a source is deferred or blocked.

These commands do not install source projects, run package managers, execute code, call browsers or external services, activate connectors, upload files, publish resources, approve submissions, certify safety, or replace the website review flow.

## Uploader Review Commands

The uploader CLI can create local review plans, draft output, patch output, public catalog reads, direct downloads, and authenticated review-only sessions when explicitly configured.

```bash
node packages/uploader/src/cli.mjs auth status --json
node packages/uploader/src/cli.mjs upload plan starters/agent-assistant --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload import-plan starters/parser-variant-import-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload variant-plan starters/parser-variant-import-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload agent-native-plan starters/agent-native-review --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload draft starters/agent-assistant --schemas-dir schemas --draft-kind manifest --json
node packages/uploader/src/cli.mjs upload patch starters/agent-assistant --schemas-dir schemas --json
node packages/uploader/src/cli.mjs upload submit starters/agent-assistant --schemas-dir schemas --token <token> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs upload status <submission-id> --token <token> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog list --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog get <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs catalog download-metadata <resource-id> --api-url https://www.agentique.io --json
node packages/uploader/src/cli.mjs download <resource-id> --output ./downloads/ --api-url https://www.agentique.io --json
```

`upload submit` requires scoped token auth, an Agentique API origin, checkpoint-ready package metadata, local validation, review-only session creation, evidence transfer, and server completion verification. It does not publish or approve resources.

`catalog list`, `catalog get`, and `catalog download-metadata` are GET-only public readback commands and do not require uploader auth. `download` resolves public metadata through the canonical source-package gate before writing bytes to the explicit output path.

## Release Readiness Checks

Run these checks before advertising source or package changes:

```bash
npm run release:check
npm run workflow:check
npm run pack:dry-run
npm run registry:readback
npm run install:smoke
npm run urls:check
npm run release:go-no-go
```

Release state, registry evidence, public URL approval, and rollback posture are documented in:

- [release-go-no-go.md](release-go-no-go.md)
- [release-evidence.md](release-evidence.md)
- [package-release-provenance.md](package-release-provenance.md)
- [public-url-inventory.md](public-url-inventory.md)

## Package Documentation

Package-specific command behavior is documented in:

- [../packages/validator/README.md](../packages/validator/README.md)
- [../packages/readback/README.md](../packages/readback/README.md)
- [../packages/uploader/README.md](../packages/uploader/README.md)
- [../packages/action/README.md](../packages/action/README.md)
