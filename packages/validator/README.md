# Agentique Validator

Static local upload-preparation validator for Agentique resource packages.

`agentique-validator` is a no-execution checker that validates public manifests, package inventory, path safety, and upload-prep metadata without uploading, publishing, installing dependencies, or executing submitted code.

Local validation is not platform approval and is not safety certification. `agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback.

## Usage

```powershell
node packages\validator\src\cli.mjs validate <package-dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs upload-prep <package-dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs external-intake <repo-or-dir> --json
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

External intake output is advisory review evidence. It is not publication approval, safety assurance, moderation status, or legal review.

## Status

Local monorepo implementation exists for review. Package publishing remains blocked until release review passes.
