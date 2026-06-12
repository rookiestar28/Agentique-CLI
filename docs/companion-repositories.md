# Companion Monorepo

Agentique's public companion work is consolidated in this repository. The monorepo contains public-facing docs, schemas, starter kits, parser/variant metadata examples, agent-native preparation examples, local validation, workflow validation, readback helpers, review-only uploader tooling, and release smoke checks.

## Monorepo Areas

- `docs/`: public usage, release, governance, support, and safety-boundary documentation.
- `schemas/`: public JSON Schema contracts, parser/variant and agent-native contracts, public projections, and schema fixtures.
- `starters/`: benign starter kits and canonical examples for public resource preparation, including source-only parser/variant metadata and agent-native local-review metadata.
- `packages/validator`: static no-execution local checks for package validation, parser/variant metadata, agent-native metadata, and upload preparation.
- `packages/action`: least-privilege workflow wrapper around local validation.
- `packages/readback`: read-only SDK, catalog/download metadata normalizers, direct byte-download utility, badge helpers, parser/variant and agent-native normalizers, and trust projection normalizers for public status and readback projections.
- `packages/uploader`: published review-only uploader CLI with plan, import-plan, variant-plan, agent-native-plan, local draft, patch/delta preparation, catalog read, and direct-download commands. Authenticated review-session access and final resource publication remain platform-owned and account/token gated. New catalog/download and agent-native npm availability closeout remains pending until the coordinated `0.2.1` publish workflow, registry readback, clean install smoke, rollback evidence, and branch cleanup complete.
- `scripts/`: repository release checks, starter validation, workflow posture checks, registry readback, install smoke, URL inventory checks, package dry-runs, and go/no-go checks.

## Link Readiness

New downstream links are not advertised until:

- Release gates pass.
- Owner approval exists for the exact public target.
- Public URLs are final.
- Registry readback and install smoke pass for any package page being advertised.
- Support and security routing is reviewed.
- Rollback steps are ready.

The platform remains authoritative for upload, scan, review, moderation, publication, distribution state, trust state, parser/variant state, agent-native resolver/readback state, download availability, and public readback. Companion uploader output can describe checkpoint readiness, parser evidence, source-only variant metadata, agent-native local-review metadata, catalog metadata, direct-download byte transfer results, and local preparation state, but it is not a platform decision.

Current approved advertised links include the public repository, approved npm package pages, action usage reference, badge/readback documentation, schema/docs links, and `agentique.io` public links recorded in `docs/public-url-inventory.json`.

Parser/variant package changes are Go for the coordinated `0.2.0` package-release claim. Registry readback shows schemas, validator, action, readback, and uploader at version `0.2.0`. Owner approval to use the manual GitHub Actions publishing workflow for target version `0.2.0` is recorded, and registry install smoke passed.

Catalog/download behavior already published in `0.2.0` remains limited to the evidence recorded for that release. Canonical catalog envelope fixes, ticket-backed byte-transfer fixes, and agent-native schema/validator/readback/uploader dry-run surfaces are separate source-revision changes in the owner-approved coordinated `0.2.1` patch candidate and are not yet published on npm at this source checkpoint. Registry readback shows the existing package set at version `0.2.0`, and pending-state registry readback verifies the `0.2.1` package set is not published. Owner-approved disposable byte-transfer evidence is recorded for a public catalog resource.
