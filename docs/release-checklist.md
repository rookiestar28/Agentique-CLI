# Release Checklist

Use this checklist before any public release, package publish, repository link change, or newly advertised public channel.

## Required Checks

- Public-content scan passed.
- Secret scan passed.
- Relevant tests passed.
- Production dependency audit passed when the repository has runtime dependencies.
- Release manifest allowlist check passed.
- Generated artifacts were reviewed against the release manifest.
- Release notes were reviewed for private project language, local paths, credentials, and unsupported launch claims.
- Known issues status was reconciled so public docs do not contain stale open defect claims for repository-side fixes.
- Security reporting route still points to private disclosure channels for vulnerabilities.
- No workflow uses privileged pull request triggers.
- No workflow references repository secrets for validation-only checks.
- External-intake smoke check passed against the safe local fixture.
- Public docs describe external-intake output as advisory review evidence only.
- Surfacing contract fixture matrix exists and covers overlapping, risky, stale, off-topic, invalid-output, and budget-overflow cases.
- Public docs describe context bundle and selection readback helpers as read-only baseline projections.
- Uploader source status is documented separately from npm publication and live upload availability.
- Pending package pages are marked non-advertised in the URL inventory.
- Registry readback passed with expected published and pending package states.
- Package install smoke passed from locally packed tarballs with lifecycle scripts disabled.

## Package Evidence

Packages must not use long-lived credentials when OIDC registry provenance is available. Prefer staged publishing with maintainer review before public availability.

Provenance and attestations help consumers trace where an artifact came from. They do not prove that the artifact is risk-free.

Before advertising `@agentique.io/uploader`, run `AGENTIQUE_UPLOADER_EXPECT_PUBLISHED=1 npm run registry:readback`, run `npm run install:smoke`, and record version, dist-tag, tarball contents, clean install smoke, and uploader CLI smoke evidence for the exact version being advertised.

## Launch Boundary

Passing this checklist means the release candidate is ready for owner review. It does not itself publish, advertise, or link a new public target.

External-intake output does not approve a candidate, certify safety, replace platform moderation, or provide legal clearance.

Surfacing contract fixtures and readback helper output are release-review inputs only. They do not replace `agentique.io` review, moderation, publication state, distribution state, or public readback.
