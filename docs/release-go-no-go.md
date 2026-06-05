# Release Go/No-Go

Current source repository, published package registry pages, action usage, badge/readback documentation, and platform-link publication decision: **Go** for advertised channels.

The source repository is public. The public repository URL, package registry pages, action usage reference, badge/readback documentation, public documentation URL, schema URL base, `agentique.io` public URL, hosted CI evidence, branch protection evidence, and owner go/no-go approval are recorded.

Package registry pages, badge/readback documentation, and action usage documentation are approved after publication and smoke testing. GitHub Marketplace-style promotion remains a separate future channel.

`@agentique.io/uploader` is implemented in source and included in local validation, but npm registry readback currently reports it as not found. Its package page and live upload availability are not advertised until a separate owner-approved publish/readback closeout records a Go decision.

## Uploader Publication Decision

Current uploader publication decision: **No-Go**.

Reason: uploader source, tarball smoke, and pending registry readback are complete, but owner-approved npm publication, hosted CI evidence for this branch, registry publish/readback, and install smoke from npm are not complete.

Current blockers:

- Owner-approved uploader publish Go is not recorded.
- Hosted CI evidence for the final public release candidate is not recorded.
- npm registry readback for `@agentique.io/uploader` is not published.
- Clean install smoke from the npm registry package is not recorded.

The uploader package page remains pending and non-advertised. Existing approved advertised channels remain Go.

Current public-safe evidence is recorded in [release-evidence.md](release-evidence.md).

## Local Evidence

- Clean public baseline exists.
- Governance and review routing exist.
- Workflow posture check exists.
- Package dry-run check exists.
- Package registry publication and post-publish smoke evidence are recorded for `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, and `@agentique.io/readback`.
- `@agentique.io/uploader` source checks are recorded, but npm publication remains pending and non-advertised.
- Public URL inventory exists and now records approved advertised entries.
- Package tests, starter validation, release check, and dependency audits pass locally.
- Surfacing contract fixture matrix is covered by release checks.
- Readback helper docs describe context bundle and selection projections as read-only public projections.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate; later branch changes require a fresh hosted run before downstream release claims.
- Public `main` branch protection is enabled.
- Final public URLs are approved.
- `agentique.io` public links are approved.
- Platform launch evidence required for public links is recorded.
- Owner go/no-go approval is recorded.

## Downstream Evidence

- Package registry URLs are advertised after publish and smoke testing.
- The uploader package URL remains a pending, non-advertised channel until registry readback and install smoke pass.
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
