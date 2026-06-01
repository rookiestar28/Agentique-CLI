# Release Checklist

Use this checklist before any public release, package publish, or repository link.

## Required Checks

- Public-content scan passed.
- Secret scan passed.
- Relevant tests passed.
- Production dependency audit passed when the repository has runtime dependencies.
- Release manifest allowlist check passed.
- Generated artifacts were reviewed against the release manifest.
- Release notes were reviewed for private project language, local paths, credentials, and unsupported launch claims.
- Security reporting route still points to private disclosure channels for vulnerabilities.
- No workflow uses privileged pull request triggers.
- No workflow references repository secrets for validation-only checks.
- External-intake smoke check passed against the safe local fixture.
- Public docs describe external-intake output as advisory review evidence only.

## Package Evidence

Packages must not use long-lived credentials when OIDC registry provenance is available. Prefer staged publishing with maintainer review before public availability.

Provenance and attestations help consumers trace where an artifact came from. They do not prove that the artifact is risk-free.

## Launch Boundary

Passing this checklist means the repository is ready for owner review. It does not publish, advertise, or link the repository.

External-intake output does not approve a candidate, certify safety, replace platform moderation, or provide legal clearance.
