# Agentique Validator

Static local upload-preparation validator for Agentique resource packages.

`agentique-validator` is a no-execution checker that validates public manifests, package inventory, path safety, registry trust metadata, parser/variant metadata, portable profile metadata, graph/block metadata, and upload-prep metadata without uploading, publishing, installing dependencies, mutating user agent configuration, or executing submitted code.

Local validation is not platform approval and is not safety certification. `agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback.

## Usage

```powershell
node packages\validator\src\cli.mjs validate <package-dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs upload-prep <package-dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs external-intake <repo-or-dir> --json
node packages\validator\src\cli.mjs portable-generate <portable-profile.json> --target codex-skill --output <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs portable-drift <portable-profile.json> --manifest <dir>\portable\generated-adapter-manifest.json --output-dir <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs portable-parity <portable-profile.json> --manifest <dir>\portable\generated-adapter-manifest.json --output-dir <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs debt-ledger <root-dir> --json
node packages\validator\src\cli.mjs portable-eval <portable-profile.json> --output-dir <dir> --sandbox no-exec-temp --schemas-dir schemas --json
node packages\validator\src\cli.mjs bundle-validate <graph-block-bundle.json> --schemas-dir schemas --json
node packages\validator\src\cli.mjs bundle-import-plan <graph-block-bundle.json> --output-dir <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs bundle-export-plan <graph-block-bundle.json> --output-dir <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs block-fixtures-generate <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs ledger-inspect <execution-ledger.json> --schemas-dir schemas --json
node packages\validator\src\cli.mjs ledger-replay-diagnostics <execution-ledger.json> --output-dir <dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs artifact-scan <workspace-artifact.json> --schemas-dir schemas --json
node packages\validator\src\cli.mjs api-drift <api-drift.json> --schemas-dir schemas --json
```

Exit codes:

- `0` - package is locally valid.
- `1` - package has validation findings.
- `2` - CLI usage or configuration error.

## Checks

- Manifest validation against local public schemas.
- Package file inventory and SHA-256 verification.
- Unsafe path rejection.
- Blocked executable extension rejection.
- Secret-like value detection with redacted findings.
- Forbidden public-content path and term checks.
- Registry trust checks for creator-safe package context, creator checkpoints, generated draft boundaries, and explicit patch/delta metadata.
- Parser/variant checks for static parser evidence, sanitized resource graph summaries, compatibility reasons, and source-only variant states.
- Portable profile checks for canonical source metadata, generated adapter manifest provenance, descriptor drift, command/profile parity, deferred-risk markers, and sandbox-gated measurement preflights.
- Graph/block checks for descriptor-only graph topology, static block manifests, diagnostic-only ledgers, redacted workspace artifact metadata, API drift snapshots, generated fixture manifests, and no-execution boundaries.

## External Intake

Use `external-intake` before adapting a raw candidate directory into an Agentique package.

```powershell
node packages\validator\src\cli.mjs external-intake <repo-or-dir> --json --max-files 10000 --max-bytes 104857600
```

The scan is static and local. It does not install dependencies, run lifecycle hooks, execute scripts, fetch submodules, download Git LFS content, or extract archives.

The report includes:

- Repository file and byte gates.
- Submodule and Git LFS policy findings.
- Archive, executable, and binary payload classification.
- Package script, workflow, action, Dockerfile, Makefile, shell, and PowerShell execution-surface inventory.
- Dangerous capability categories with redacted snippets.
- Secret findings with redacted previews and stable fingerprints.
- License inventory with missing, unknown, and conflict findings.

External intake output is advisory review evidence. Registry trust, parser/variant, portable profile, and graph/block findings are local preparation findings. Neither output is publication approval, safety assurance, moderation status, runtime compatibility proof, platform download availability, or legal review.

## Status

Published on npm as `@agentique.io/validator` at `0.2.1`. Local validation output is not platform approval and is not safety certification.
