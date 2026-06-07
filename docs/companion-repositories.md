# Companion Monorepo

Agentique's public companion work is consolidated in this repository. The monorepo contains public-facing docs, schemas, starter kits, parser/variant metadata examples, local validation, workflow validation, readback helpers, review-only uploader tooling, and release smoke checks.

## Monorepo Areas

- `docs/`: public usage, release, governance, support, and safety-boundary documentation.
- `schemas/`: public JSON Schema contracts, parser/variant contracts, public projections, and schema fixtures.
- `starters/`: benign starter kits and canonical examples for public resource preparation, including source-only parser/variant metadata.
- `packages/validator`: static no-execution local checks for package validation, parser/variant metadata, and upload preparation.
- `packages/action`: least-privilege workflow wrapper around local validation.
- `packages/readback`: read-only SDK, catalog/download metadata normalizers, direct byte-download utility, badge helpers, and trust projection normalizers for public status and readback projections; parser/variant and catalog/download surfaces in the current source remain unpublished package-release evidence until a new version is published and verified.
- `packages/uploader`: published review-only uploader CLI with plan, local draft, patch/delta preparation, catalog read, and direct-download commands; current import-plan, variant-plan, catalog, and direct-download commands remain unpublished package-release evidence until a new version is published and verified. Authenticated review-session access, final resource publication, and live catalog/download availability remain platform-owned and account/token gated.
- `scripts/`: repository release checks, starter validation, workflow posture checks, registry readback, install smoke, URL inventory checks, and package dry-runs.

## Link Readiness

New downstream links are not advertised until:

- Release gates pass.
- Owner approval exists for the exact public target.
- Public URLs are final.
- Registry readback and install smoke pass for any package page being advertised.
- Support and security routing is reviewed.
- Rollback steps are ready.

The platform remains authoritative for upload, scan, review, moderation, publication, distribution state, trust state, parser/variant state, download availability, and public readback. Companion uploader output can describe checkpoint readiness, parser evidence, source-only variant metadata, catalog metadata, direct-download byte transfer results, and local preparation state, but it is not a platform decision.

Current approved advertised links include the public repository, approved npm package pages, action usage reference, badge/readback documentation, schema/docs links, and `agentique.io` public links recorded in `docs/public-url-inventory.json`.

Parser/variant package changes are currently No-Go for a new package-release claim. Registry readback shows schemas, validator, action, and readback at version `0.2.0`; uploader remains published at version `0.1.0` and uploader `0.2.0` is pending publish recovery. Owner approval to use the manual GitHub Actions publishing workflow for target version `0.2.0` is recorded. A new parser/variant package claim requires the recovery workflow on `main`, uploader `0.2.0` publication, full registry readback for `0.2.0`, clean install smoke, and rollback or unpublish evidence.

Catalog/download package changes are currently No-Go for a new package-release or direct-download live availability claim. Registry readback shows schemas, validator, action, and readback at version `0.2.0`; uploader remains published at version `0.1.0` and uploader `0.2.0` is pending publish recovery. Owner approval to use the manual GitHub Actions publishing workflow for target version `0.2.0` is recorded. A new catalog/download package claim requires the recovery workflow on `main`, uploader `0.2.0` publication, full registry readback for `0.2.0`, clean install smoke, and rollback or unpublish evidence. A direct-download live availability claim also requires owner-approved disposable direct-download evidence.
