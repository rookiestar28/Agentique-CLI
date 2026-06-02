# Package Release Provenance

The companion packages are published for reviewed public release under the `@agentique.io` npm scope.

## Publishable Packages

- `@agentique.io/schemas` at version `0.1.0`
- `@agentique.io/validator` at version `0.1.0`
- `@agentique.io/action` at version `0.1.0`
- `@agentique.io/readback` at version `0.1.0`

All four packages are public on npm.

## Required Pre-Publish Checks

- Package tests pass.
- Package production dependency audits pass.
- `npm run pack:dry-run` passes.
- Release manifest and public-content checks pass.
- Release notes are reviewed for private data, local paths, unsupported claims, and package scope accuracy.
- Final public repository and package URLs are approved.
- Public release notes mention surfacing contracts only as baseline companion metadata and read-only helper support.

## Provenance Posture

Provenance helps consumers trace package source and build context. It does not mean a package is risk-free, platform-approved, or safety-certified.

Registry readback and clean install smoke passed with npm 11.14.1 for the dotted `@agentique.io` scope.

Public package provenance must not include platform scoring, quarantine criteria, internal review procedures, moderation disposition logic, or operational playbooks.

## Version And Tag Discipline

- Use semver for package versions.
- Keep package versions aligned for coordinated companion releases unless a package has an independent patch.
- Use release tags only after owner approval.
- Do not create public tags for dry-runs.
- Review release notes before publication.

## Rollback

If a package release contains incorrect files or wording, stop additional publishing, deprecate or replace the affected package version according to registry policy, and update release notes with a public-safe correction.
