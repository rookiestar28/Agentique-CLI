# Review Routing

This repository uses public review rules to keep companion content narrow, safe, and aligned with `agentique.io`.

## Review Areas

| Area | Examples | Required review focus |
|---|---|---|
| Public docs | `README.md`, `docs/`, package docs | Public-safe wording, no private data, no approval or certification claims |
| Schemas | `schemas/` | Public projection only, no credential fields, compatibility of schema changes |
| Starters | `starters/` | De-weaponized examples, matching hashes, no executable payloads unless explicitly part of a blocked fixture |
| Validator | `packages/validator/` | Static no-execution behavior, redacted findings, stable exit codes |
| Action | `packages/action/`, `.github/workflows/` | Least privilege, no untrusted secret exposure, no publish behavior in validation workflows |
| Readback | `packages/readback/` | Read-only methods only, stale/unavailable states, no safety guarantee wording |
| Uploader | `packages/uploader/` | Review-only wording, auth redaction, token handling, registry state, no platform publication or approval claims |
| Release | `release-manifest.json`, `scripts/`, release checklist | Allowlist coverage, content scan behavior, registry readback, install smoke, package dry-run evidence |

## Public Issue Boundary

Use public issues only for documentation and tooling problems that can be discussed safely.

Do not include credentials, vulnerability details, exploit steps, private account data, personal data, moderation material, unsafe resource contents, or platform-owned investigation details in public issues.

## Pull Request Boundary

Pull requests must pass the release check, package tests, starter validation, and dependency audits before release review. Changes that advertise package pages must also record registry readback and install smoke. Changes that touch workflows, packages, schemas, or release scripts require owner review before public release.

Local validation output means local readiness only. It does not approve publication, certify safety, or replace platform review.
