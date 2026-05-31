# Agentique Validator

Static local upload-preparation validator for Agentique resource packages.

`agentique-validator` is a no-execution checker that validates public manifests, package inventory, path safety, and upload-prep metadata without uploading, publishing, installing dependencies, or executing submitted code.

Local validation is not platform approval and is not safety certification. `agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback.

## Usage

```powershell
node packages\validator\src\cli.mjs validate <package-dir> --schemas-dir schemas --json
node packages\validator\src\cli.mjs upload-prep <package-dir> --schemas-dir schemas --json
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

## Status

Local monorepo implementation exists for review. Package publishing remains blocked until release review passes.
