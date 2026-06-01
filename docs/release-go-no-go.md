# Release Go/No-Go

Current downstream release decision: **No-Go**.

The source repository may be opened for review before every downstream release channel is live. Package publishing, badge advertising, marketplace/action publication, and platform links remain blocked until hosted repository evidence, final public URLs, owner approval, and platform launch evidence are recorded.

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

## Blocking Evidence

- Hosted CI run evidence is not recorded.
- Public repository protection evidence is not recorded.
- Final public URLs are not approved.
- Package registry URLs are not approved.
- `agentique.io` public links are not approved.
- Platform launch evidence required for public links is not recorded.
- Owner go/no-go approval is not recorded.

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
