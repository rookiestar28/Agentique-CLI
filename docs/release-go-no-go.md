# Release Go/No-Go

Current source repository, published package registry pages, action usage, badge/readback documentation, and platform-link publication decision: **Go** for advertised channels.

Current source changes have local release-gate evidence only until they are pushed, hosted checks run, and the package publishing workflow completes on `main`. They do not publish a new package version by themselves.

The source repository is public. The public repository URL, package registry pages, action usage reference, badge/readback documentation, public documentation URL, schema URL base, `agentique.io` public URL, hosted CI evidence, branch protection evidence, and owner go/no-go approval are recorded.

Package registry pages, badge/readback documentation, and action usage documentation are approved after publication and smoke testing. GitHub Marketplace-style promotion remains a separate future channel.

`@agentique.io/uploader` is published on npm at version `0.2.0` after owner-approved publication, hosted Release Check evidence, registry readback, and clean install smoke. The package remains review-only; it does not publish, approve, certify, host, or moderate resources.

The coordinated `0.2.0` package publish is complete. Registry readback shows schemas, validator, action, readback, and uploader at `0.2.0`.

## Uploader Publication Decision

Current uploader publication decision: **Go** for npm package availability.

Reason: uploader source checks, package dry-run, owner-approved npm publication, hosted Release Check evidence, registry publish/readback, and clean install smoke from npm are complete.

Current blockers:

- None for npm package availability.

The uploader package page is approved for advertising. Authenticated review-session access and final resource publication remain platform-owned and account/token gated.

## Parser And Variant Package Release Decision

Current parser/variant package release decision: **Go** for the coordinated `0.2.0` package-release claim.

Reason: parser/variant source changes are published in the coordinated package release `0.2.0`, and owner approval to use the manual GitHub Actions package publishing workflow is recorded. Hosted Release Check passed on `main`, GitHub Actions publication completed, registry readback confirms all companion packages at `0.2.0`, registry install smoke passed, and the public rollback/unpublish procedure is documented.

Current blockers:

- None for the `0.2.0` package-release claim.

Parser/variant schemas, validator findings, readback helpers, uploader dry-runs, examples, and release smoke coverage are package and local-preparation evidence. They do not create platform downloads, prove runtime compatibility, approve resources, or replace platform review.

## Catalog And Download Package Release Decision

Current catalog/download package release decision: **Go** for the coordinated `0.2.0` package-release claim. Owner-approved disposable direct byte-transfer smoke passed for a metadata-only public resource.

Reason: catalog/download CLI and SDK package changes are published in the coordinated package release `0.2.0`, and owner approval to use the manual GitHub Actions package publishing workflow is recorded. Hosted Release Check passed on `main`, GitHub Actions publication completed, registry readback confirms all companion packages at `0.2.0`, registry install smoke passed, and the public rollback/unpublish procedure is documented. A GET-only live metadata smoke on 2026-06-07 reached the canonical public list, first resource detail, and first resource download-metadata endpoints with 200 JSON responses. Owner-approved disposable direct byte-transfer smoke passed on 2026-06-07 for a metadata-only public resource without auth, signed URL output, opening, extraction, or execution.

Current blockers:

- None for the `0.2.0` package-release claim.
- None for the bounded disposable direct byte-transfer smoke. This evidence is not a safety certification, content approval, or guarantee that every public resource is downloadable.

Catalog list/detail/download-metadata commands, direct download command, readback catalog normalizers, direct download utility, live metadata smoke, disposable byte-transfer smoke, and release smoke coverage are package and local-preparation evidence. They do not approve resources, certify safety, install or execute downloaded content, or replace platform review.

Closeout evidence: source validation, installed-tarball smoke, hosted CI on `main`, GitHub Actions publication, registry readback for all companion packages at `0.2.0`, registry install smoke, live metadata smoke, disposable byte-transfer smoke, and owner approval to use the manual GitHub Actions publishing workflow are recorded.

Current public-safe evidence is recorded in [release-evidence.md](release-evidence.md).

## Local Evidence

- Clean public baseline exists.
- Governance and review routing exist.
- Workflow posture check exists.
- Package dry-run check exists.
- Package registry publication and post-publish smoke evidence are recorded for `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, `@agentique.io/readback`, and `@agentique.io/uploader`.
- Public URL inventory exists and now records approved advertised entries.
- Package tests, starter validation, release check, and dependency audits pass locally.
- Surfacing contract fixture matrix is covered by release checks.
- Readback helper docs describe context bundle and selection projections as read-only public projections.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate; later branch changes require a fresh hosted run before downstream release claims.
- Current source release gate refresh passed package tests, starter validation, release checks, workflow posture, package dry-run, URL inventory, registry readback, install smoke, go/no-go, content scan, diff check, and production dependency audits.
- Parser/variant package surface smoke passes from locally packed tarballs, and registry readback plus registry install smoke verify the same surfaces are included in package version `0.2.0`.
- Catalog/download package surface smoke passes from locally packed tarballs, live metadata smoke passed for public list/detail/download-metadata endpoints, registry install smoke passed for `0.2.0`, and owner-approved disposable byte-transfer evidence is recorded.
- Public `main` branch protection is enabled.
- Final public URLs are approved.
- `agentique.io` public links are approved.
- Platform launch evidence required for public links is recorded.
- Owner go/no-go approval is recorded.

## Downstream Evidence

- Package registry URLs are advertised after publish and smoke testing.
- The uploader package URL is approved after registry readback and install smoke.
- Badge/readback documentation is advertised after readback package install/import smoke testing.
- Action usage documentation is advertised after repository workflow and package publication evidence.
- GitHub Marketplace-style promotion remains separate from this source/package release.

## Rollback And Unpublish Procedure

If a blocking issue is found after public release:

1. Stop additional publication.
2. Remove or disable affected public links.
3. Deprecate or replace affected package versions according to registry policy.
4. Disable affected badge or action examples.
5. Publish a public-safe correction note.
6. Keep sensitive details in the private disclosure or platform-owned support route.
7. Re-run release checks before restoring links.

Local validation does not approve publication or certify safety.

Public companion fixtures, uploader source output, and helper outputs do not make final resource decisions. They are baseline local evidence for owner review; `agentique.io` remains authoritative.
