# Package Release Provenance

The companion packages are prepared for reviewed public release, but package publishing remains blocked until owner approval.

## Publishable Packages

- `@agentique.io/schemas`
- `@agentique.io/validator`
- `@agentique.io/action`
- `@agentique.io/readback`

## Required Pre-Publish Checks

- Package tests pass.
- Package production dependency audits pass.
- `npm run pack:dry-run` passes.
- Release manifest and public-content checks pass.
- Release notes are reviewed for private data, local paths, unsupported claims, and package scope accuracy.
- Final public repository and package URLs are approved.
- Public release notes mention surfacing contracts only as baseline companion metadata and read-only helper support.

## Provenance Posture

Use registry trusted publishing where available. Trusted publishing uses CI identity instead of long-lived package tokens and can publish provenance attestations for packages.

Provenance helps consumers trace package source and build context. It does not mean a package is risk-free, platform-approved, or safety-certified.

Public package provenance must not include platform scoring, quarantine criteria, internal review procedures, moderation disposition logic, or operational playbooks.

## Version And Tag Discipline

- Use semver for package versions.
- Keep package versions aligned for coordinated companion releases unless a package has an independent patch.
- Use release tags only after owner approval.
- Do not create public tags for dry-runs.
- Review release notes before publication.

## Rollback

If a package release contains incorrect files or wording, stop additional publishing, deprecate or replace the affected package version according to registry policy, and update release notes with a public-safe correction.
