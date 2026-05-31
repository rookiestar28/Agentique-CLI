# Public Companion Governance

This document defines the public boundary for Agentique companion repositories. The platform at `agentique.io` remains the source of truth for upload, review, moderation, publication, distribution state, and readback.

## Companion Repositories

| Repository | Purpose | Boundary |
|---|---|---|
| `agentique-docs` | Public usage, packaging, support, and security-reporting documentation. | Documentation only. |
| `agentique-schemas` | Public JSON Schema contracts, public projections, types, and schema fixtures. | Public contract fields only. |
| `agentique-starters` | Benign starter kits and canonical examples for public resource preparation. | De-weaponized examples only. |
| `agentique-validator` | Static no-execution local checks for upload preparation and package inventory review. | Local readiness only. |
| `agentique-action` | Least-privilege workflow wrapper around local validation output. | No platform approval claim. |
| `agentique-readback` | Read-only clients and badge helpers for public resource status and readback state. | Read-only public status only. |

No companion repository may publish, edit, delete, moderate, approve, or certify platform resources. Manual upload and platform review stay on `agentique.io`.

## Public-Safe Content

Allowed content:

- Public documentation.
- Public JSON schemas.
- De-weaponized examples.
- Static validation tooling.
- Read-only readback clients.
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

Local validation is not platform approval. Local validation is not safety certification. Badge state is not a safety guarantee.

## Support Routing

| Topic | Route |
|---|---|
| Docs and tooling issues | Public issues |
| Resource disputes | `agentique.io` support |
| Abuse and moderation reports | `agentique.io` report flow |
| Vulnerabilities | Private security disclosure channel |
