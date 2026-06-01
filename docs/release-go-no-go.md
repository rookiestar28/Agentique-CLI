# Release Go/No-Go

Current source repository and platform-link publication decision: **Go**.

The source repository is public. The public repository URL, public documentation URL, schema URL base, `agentique.io` public URL, hosted CI evidence, branch protection evidence, and owner go/no-go approval are recorded.

Package publishing, badge advertising, and marketplace/action publication remain deferred until those downstream channels are published and smoke tested.

Current public-safe evidence is recorded in [release-evidence.md](release-evidence.md).

## Local Evidence

- Clean public baseline exists.
- Governance and review routing exist.
- Workflow posture check exists.
- Package dry-run check exists.
- Public URL inventory exists and is blocked by default.
- Package tests, starter validation, release check, and dependency audits pass locally.
- Surfacing contract fixture matrix is covered by release checks.
- Readback helper docs describe context bundle and selection projections as read-only public projections.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate.
- Public `main` branch protection is enabled.
- Final public URLs are approved.
- `agentique.io` public links are approved.
- Platform launch evidence required for public links is recorded.
- Owner go/no-go approval is recorded.

## Deferred Downstream Evidence

- Package registry URLs are not advertised because the npm packages are not published yet.
- Badge examples are not advertised until a public package or badge target is published.
- Marketplace/action publication is deferred until the action channel is published and smoke tested.

## Rollback And Unpublish Procedure

If a public release is later made and a blocking issue is found:

1. Stop additional publication.
2. Remove or disable affected public links.
3. Deprecate or replace affected package versions according to registry policy.
4. Disable affected badge or action examples.
5. Publish a public-safe correction note.
6. Keep sensitive details in the private disclosure or platform-owned support route.
7. Re-run release checks before restoring links.

Local validation does not approve publication or certify safety.

Public companion fixtures and helper outputs do not make final resource decisions. They are baseline local evidence for owner review; `agentique.io` remains authoritative.
