# Release Go/No-Go

Source repository, published package registry pages, action usage, badge/readback documentation, and platform-link publication decision: **Go** for advertised channels.

This source revision has completed hosted checks and package publishing workflow evidence on `main`. Future source changes require fresh hosted checks before downstream release claims.

The source repository is public. The public repository URL, package registry pages, action usage reference, badge/readback documentation, public documentation URL, schema URL base, `agentique.io` public URL, hosted CI evidence, branch protection evidence, and owner go/no-go approval are recorded.

Package registry pages, badge/readback documentation, and action usage documentation are approved after publication and smoke testing. GitHub Marketplace-style promotion remains a separate future channel.

`@agentique.io/uploader` is published on npm at version `0.2.1` after owner-approved publication, hosted Release Check evidence, registry readback, and clean install smoke. The package remains review-only; it does not publish, approve, certify, host, or moderate resources.

The coordinated `0.2.1` package publish is complete. Registry readback shows schemas, validator, action, readback, and uploader at `0.2.1`.

## Uploader Publication Decision

Current uploader publication decision: **Go** for npm package availability.

Reason: uploader source checks, package dry-run, owner-approved npm publication, hosted Release Check evidence, registry publish/readback, and clean install smoke from npm are complete.

Current blockers:

- None for npm package availability.

The uploader package page is approved for advertising. Authenticated review-session access and final resource publication remain platform-owned and account/token gated.

## Parser And Variant Package Release Decision

Current parser/variant package release decision: **Go** for the coordinated package-release claim.

Reason: parser/variant source changes are published in the coordinated package releases, and owner approval to use the manual GitHub Actions package publishing workflow is recorded. Hosted Release Check passed on `main`, GitHub Actions publication completed, registry readback confirms all companion packages at `0.2.1`, registry install smoke passed, and the public rollback/unpublish procedure is documented.

Current blockers:

- None for the package-release claim.

Parser/variant schemas, validator findings, readback helpers, uploader dry-runs, examples, and release smoke coverage are package and local-preparation evidence. They do not create platform downloads, prove runtime compatibility, approve resources, or replace platform review.

## Catalog And Download Package Release Decision

Current catalog/download package release decision: **Go** for the coordinated `0.2.1` patch package release.

Existing catalog/download surfaces that were already published in the coordinated `0.2.0` package set remain advertised only within the evidence recorded for that release. The canonical-host live envelope compatibility and unauthenticated POST ticket byte-transfer path are published in the coordinated `0.2.1` patch package set.

Reason: local source validation, installed-tarball smoke, live metadata checks, owner-approved disposable byte-transfer evidence, hosted Release Check, GitHub Actions registry provenance, registry readback, clean install smoke, rollback/unpublish evidence, and branch cleanup passed for the coordinated `0.2.1` patch package release.

Current blockers:

- None for the `0.2.1` package-release claim.

Catalog list/detail/download-metadata commands, download command behavior, readback catalog normalizers, ticket-flow byte transfer, live metadata smoke, disposable byte-transfer smoke, and release smoke coverage are package and local-preparation evidence for the patch candidate. They do not approve resources, certify safety, install or execute downloaded content, guarantee every public resource is downloadable, or replace platform review.

Closeout evidence for the patch candidate: source validation, installed-tarball smoke, live metadata checks, owner-approved disposable byte-transfer smoke, owner approval to publish, registry readback for the full `0.2.1` set, clean install smoke for `0.2.1`, rollback/unpublish evidence, and branch cleanup are recorded.

## Agent-Native Package Release Decision

Current agent-native package release decision: **Go** for the coordinated `0.2.1` patch package release.

Agent-native schema, validator, readback, badge, uploader dry-run, and starter surfaces are published in the coordinated `0.2.1` patch package set.

Reason: local source validation, installed-tarball smoke, package-surface smoke, hosted Release Check, GitHub Actions registry provenance, registry readback, clean install smoke, rollback/unpublish evidence, and branch cleanup passed for the coordinated `0.2.1` patch package release.

Current blockers:

- None for the `0.2.1` package-release claim.

Agent-native schemas, validator findings, readback projection helpers, badge states, uploader dry-runs, starter metadata, and release smoke coverage are package and local-preparation evidence for the patch candidate. They do not approve resources, certify safety, provide resolver availability, install or execute downloaded content, prove runtime compatibility, provide credential handling, create direct-install support, or replace platform review.

Closeout evidence for the agent-native patch candidate: source validation, installed-tarball smoke, release smoke coverage, owner approval to publish, registry readback for the full `0.2.1` set, clean install smoke for `0.2.1`, rollback/unpublish evidence, and branch cleanup are recorded.

## Portable Profile Package Release Decision

Current portable profile package release decision: **No-Go** for package publication claims.

Portable profile schemas, generated adapter manifests, descriptor-only generator output, drift checks, parity checks, deferred-risk ledger reports, sandbox-gated measurement preflights, and starter metadata are source-checkout local preparation surfaces in this revision.

Current blockers:

- Hosted release evidence for these source changes is not recorded.
- Package publication and registry readback for a version containing these source changes are not recorded.
- Registry install smoke for a version containing these source changes is not recorded.

These local surfaces do not install files into agent clients, execute generated content, trust lifecycle hooks, provide runtime compatibility, approve resources, certify safety, or replace platform review.

## Graph Block Package Release Decision

Current graph/block package release decision: **No-Go** for package publication and runtime claims.

Graph/block schemas, bundle validation, import/export plan output, generated block fixture manifests, diagnostic ledger inspection, replay diagnostics, workspace artifact metadata scans, API drift checks, and starter metadata are source-checkout local preparation surfaces in this revision.

Current blockers:

- Hosted release evidence for these source changes is not recorded.
- Package publication and registry readback for a version containing these source changes are not recorded.
- Registry install smoke for a version containing these source changes is not recorded.

These local surfaces do not install packages, execute graph nodes, load block runtimes, fetch artifact bytes, start services, mutate user agent configuration, provide runtime compatibility, approve resources, certify safety, or replace platform review.

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
- Current release gate refresh passed package tests, starter validation, release checks, workflow posture, package dry-run, URL inventory, registry readback, install smoke, go/no-go, content scan, diff check, and production dependency audits.
- Parser/variant package surface smoke passes from locally packed tarballs, and registry readback plus registry install smoke verify the same surfaces are included in package version `0.2.1`.
- Catalog/download package surface smoke passes from locally packed tarballs, live metadata checks passed for public list/detail/download-metadata endpoints, registry install smoke passed for `0.2.1` packages, and owner-approved disposable byte-transfer evidence is recorded.
- Agent-native package surface smoke passes from locally packed tarballs, registry readback verifies the published `0.2.1` package set, and release go/no-go records the agent-native package release as Go while preserving resolver, direct-install, runtime, approval, and safety-claim No-Go boundaries.
- Portable profile source tests, starter validation, and package-surface smoke are required before any future package publication claim; current scoped decision is No-Go until hosted release and registry evidence exist.
- Graph/block source tests, starter validation, and package-surface smoke are required before any future package publication claim; current scoped decision is No-Go until hosted release and registry evidence exist.
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
