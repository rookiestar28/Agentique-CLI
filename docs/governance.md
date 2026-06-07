# Public Companion Governance

This document defines the public boundary for the Agentique companion monorepo. The platform at `agentique.io` remains the source of truth for upload, review, moderation, publication, distribution state, and readback.

## Companion Monorepo Surfaces

| Surface | Purpose | Boundary |
|---|---|---|
| `docs/` | Public usage, packaging, release, support, and security-reporting documentation. | Documentation only. |
| `schemas/` | Public JSON Schema contracts, parser/variant contracts, public projections, types, and schema fixtures. | Public contract fields only. |
| `starters/` | Benign starter kits and canonical examples for public resource preparation, including parser/variant metadata examples. | De-weaponized examples only. |
| `packages/validator` | Static no-execution local checks for upload preparation, parser/variant metadata, and package inventory review. | Local readiness only. |
| `packages/action` | Least-privilege workflow wrapper around local validation output. | No platform approval claim. |
| `packages/readback` | Read-only clients, parser/variant normalizers, catalog/download metadata normalizers, direct byte-download utility, trust projection normalizers, and badge helpers for public resource status and readback state. | Read-only public status plus explicit-output byte download only; no install, extraction, execution, approval, or safety claim. |
| `packages/uploader` | Published review-only upload planning, import-plan, variant-plan, local draft, local patch, submit, status, catalog read, and direct-download helpers. | Local preparation plus review-only package; authenticated review-session access and final resource publication remain platform-owned and account/token gated. New catalog/download npm availability claims remain release-gated. |
| `scripts/` | Repository release checks, starter validation, workflow posture checks, registry readback, install smoke, package dry-runs, URL inventory checks, and go/no-go checks. | Local/repository evidence only. |

No companion surface may publish, edit, delete, moderate, approve, or certify platform resources. Upload authority and platform review stay on `agentique.io`.

## Public-Safe Content

Allowed content:

- Public documentation.
- Public JSON schemas.
- De-weaponized examples.
- Static validation tooling.
- Review-only uploader tooling.
- Read-only readback clients.
- Parser/variant schema fixtures and source-only starter metadata.
- Local draft and patch/delta preparation output.
- Community health files.

Excluded content:

- Private platform source.
- Private planning and research material.
- Runtime evidence and host operations material.
- Private scanner configuration and findings.
- Credentials and secret-like values.
- Local absolute paths.
- Private user or account data.

## Release Gate

Every companion release must pass:

- Secret scan.
- Public-content scan.
- Manual boundary review.
- Relevant tests.
- Workflow security review when automation exists.
- CODEOWNERS review for docs, schemas, starters, packages, workflows, release scripts, and public readback surfaces.
- Registry readback and clean install smoke for any package page being newly advertised.

Local validation is not platform approval. Local validation is not safety certification. Parser/variant metadata is not hosted execution evidence. Badge state is not a safety guarantee. Direct download does not install, extract, open, execute, approve, or certify content.

Parser/variant package changes are Go for the coordinated `0.2.0` package-release claim. Registry readback shows schemas, validator, action, readback, and uploader at version `0.2.0`. Owner approval to use the manual GitHub Actions publishing workflow for target version `0.2.0` is recorded, and registry install smoke passed.

Catalog/download behavior already published in `0.2.0` remains limited to the evidence recorded for that release. Canonical catalog envelope and ticket-backed byte-transfer fixes are part of the coordinated `0.2.1` patch candidate and are not yet published on npm. Registry readback shows the existing package set at version `0.2.0`, and owner-approved disposable byte-transfer evidence is recorded for a public catalog resource.

## Support Routing

| Topic | Route |
|---|---|
| Docs and tooling issues | Public issues |
| Resource disputes | `agentique.io` support |
| Abuse and moderation reports | `agentique.io` report flow |
| Vulnerabilities | Private security disclosure channel |
