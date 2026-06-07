# Companion Monorepo

Agentique's public companion work is consolidated in this repository. The monorepo contains public-facing docs, schemas, starter kits, parser/variant metadata examples, local validation, workflow validation, readback helpers, review-only uploader tooling, and release smoke checks.

## Monorepo Areas

- `docs/`: public usage, release, governance, support, and safety-boundary documentation.
- `schemas/`: public JSON Schema contracts, parser/variant contracts, public projections, and schema fixtures.
- `starters/`: benign starter kits and canonical examples for public resource preparation, including source-only parser/variant metadata.
- `packages/validator`: static no-execution local checks for package validation, parser/variant metadata, and upload preparation.
- `packages/action`: least-privilege workflow wrapper around local validation.
- `packages/readback`: read-only SDK, badge helpers, trust projection normalizers, and parser/variant projection normalizers for public status and readback projections.
- `packages/uploader`: published review-only uploader CLI with plan, local import-plan, local variant-plan, local draft, and patch/delta preparation commands; authenticated review-session access and final resource publication remain platform-owned and account/token gated.
- `scripts/`: repository release checks, starter validation, workflow posture checks, registry readback, install smoke, URL inventory checks, and package dry-runs.

## Link Readiness

New downstream links are not advertised until:

- Release gates pass.
- Owner approval exists for the exact public target.
- Public URLs are final.
- Registry readback and install smoke pass for any package page being advertised.
- Support and security routing is reviewed.
- Rollback steps are ready.

The platform remains authoritative for upload, scan, review, moderation, publication, distribution state, trust state, parser/variant state, and public readback. Companion uploader output can describe checkpoint readiness, parser evidence, source-only variant metadata, and local preparation state, but it is not a platform decision.

Current approved advertised links include the public repository, approved npm package pages, action usage reference, badge/readback documentation, schema/docs links, and `agentique.io` public links recorded in `docs/public-url-inventory.json`.
