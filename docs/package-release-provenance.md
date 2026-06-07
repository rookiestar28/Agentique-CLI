# Package Release Provenance

Companion packages are released under the `@agentique.io` npm scope after owner review and registry readback.

## Publishable Packages

- `@agentique.io/schemas` at version `0.2.0`
- `@agentique.io/validator` at version `0.2.0`
- `@agentique.io/action` at version `0.2.0`
- `@agentique.io/readback` at version `0.2.0`
- `@agentique.io/uploader` at version `0.2.0`

Schemas, validator, action, readback, and uploader are public on npm. The uploader package is review-only; it can plan, produce local draft metadata, and prepare patch/delta output, but it does not publish, approve, certify, host, moderate, install, extract, open, or execute resources.

The coordinated package release `0.2.0` is published for schemas, validator, action, readback, and uploader. Current source catalog/download helpers are included in that package release. Owner approval is recorded to use the manual GitHub Actions package publishing workflow. Owner-approved disposable byte-transfer evidence is recorded for a metadata-only public resource; this evidence does not certify content safety or approve arbitrary resources.

## Required Pre-Publish Checks

- Package tests pass.
- Package production dependency audits pass for root/workspace and resolvable package-local scopes. If a package depends on newly published companion versions, package-local registry audit runs after those dependency versions are readable from npm and before publishing the dependent package.
- `npm run pack:dry-run` passes.
- Release manifest and public-content checks pass.
- Release notes are reviewed for private data, local paths, unsupported claims, and package scope accuracy.
- Final public repository and package URLs are approved.
- Public release notes mention surfacing contracts, lane descriptors, uploader source status, local draft and patch/delta preparation, current catalog/download source status, and read-only helper support only as baseline companion metadata.

## Provenance Posture

Use registry trusted publishing where available. Trusted publishing uses CI identity instead of long-lived package tokens and can publish provenance attestations for packages.

The checked-in package publishing workflow is manual-only, uses GitHub OIDC with `id-token: write`, does not reference repository secrets, and passes `--provenance` explicitly to each `npm publish` command. The npm organization/package owner must still configure the matching Trusted Publisher entry in npm before the workflow can publish without a token.

Provenance helps consumers trace package source and build context. It does not mean a package is risk-free, platform-approved, or safety-certified.

The first public package publication used an owner-approved short-lived granular token fallback after local and hosted validation passed. Owner approval is recorded to use the checked-in manual GitHub Actions package publishing workflow for the coordinated package release target, `0.2.0`, subject to npm Trusted Publisher readiness. Token fallback is a contingency for owner-approved manual recovery only; it is not part of the normal trusted-publishing workflow and must not be added to workflow YAML.

Registry readback and clean install smoke passed for the initial dotted `@agentique.io` package set. The initial uploader publication used an owner-approved one-time granular token fallback after local and hosted validation; provenance was not generated for that fallback because it was not published from the checked-in OIDC workflow. The current coordinated release used the checked-in GitHub Actions trusted-publishing workflow and passed full registry readback plus clean install smoke for `0.2.0`.

Local release candidates should run:

```bash
npm run registry:readback
npm run install:smoke
```

The registry readback script records the current expected state from `docs/release-go-no-go.json`: schemas, validator, action, readback, and uploader are published at version `0.2.0`.

Current uploader publication closeout is Go for npm package availability at `0.2.0` after owner approval, hosted CI evidence, registry publish/readback, and clean install smoke. The package remains review-only, local draft and patch/delta output remain unsubmitted preparation artifacts, bounded disposable byte-transfer evidence is recorded, and final resource publication stays on `agentique.io`.

Public package provenance must not include platform scoring, quarantine criteria, internal review procedures, moderation disposition logic, or operational playbooks.

## Version And Tag Discipline

- Use semver for package versions.
- Keep package versions aligned for coordinated companion releases unless a package has an independent patch.
- Use release tags only after owner approval.
- Do not create public tags for dry-runs.
- Review release notes before publication.

## Publish Step Isolation

The checked-in workflow publishes each package in its own step with an explicit `working-directory`. This makes package-level failure evidence visible in GitHub Actions and avoids hiding partial-publish state inside one shell block.

After any publish failure, compare registry readback for all publish-target packages before advertising, tagging, or changing public URL inventory. If one package version is live while another failed, stop promotion and either publish the missing package version, deprecate the affected version, or publish a coordinated replacement version according to owner review.

## Rollback

If a package release contains incorrect files or wording, stop additional publishing, deprecate or replace the affected package version according to registry policy, and update release notes with a public-safe correction.
