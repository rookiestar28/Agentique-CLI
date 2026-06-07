# Package Release Provenance

Companion packages are released under the `@agentique.io` npm scope after owner review and registry readback.

## Publishable Packages

- `@agentique.io/schemas` at version `0.2.0`
- `@agentique.io/validator` at version `0.2.0`
- `@agentique.io/action` at version `0.2.0`
- `@agentique.io/readback` at version `0.2.0`
- `@agentique.io/uploader` at version `0.1.0`; version `0.2.0` is pending publish recovery

Schemas, validator, action, readback, and uploader are public on npm. The uploader package is review-only; it can plan, produce local draft metadata, and prepare patch/delta output, but it does not publish, approve, certify, host, moderate, install, extract, open, or execute resources.

The coordinated package release target is `0.2.0` for schemas, validator, action, readback, and uploader. The manual GitHub Actions publish run partially completed for schemas, validator, action, and readback; uploader `0.2.0` still requires publish recovery. Current source catalog/download helpers are prepared for that release. Owner approval is recorded to use the manual GitHub Actions package publishing workflow, but these helpers must not be advertised as a new npm package capability or direct-download live availability claim until uploader publication, full registry readback for `0.2.0`, clean install smoke, rollback or unpublish evidence, and owner-approved disposable direct-download evidence are recorded.

## Required Pre-Publish Checks

- Package tests pass.
- Package production dependency audits pass for root/workspace and resolvable package-local scopes. If a package depends on newly published companion versions, package-local registry audit runs after those dependency versions are readable from npm and before publishing the dependent package.
- `npm run pack:dry-run` passes.
- Release manifest and public-content checks pass.
- Release notes are reviewed for private data, local paths, unsupported claims, and package scope accuracy.
- Final public repository and package URLs are approved.
- Public release notes mention surfacing contracts, lane descriptors, uploader source status, local draft and patch/delta preparation, current catalog/download source status, and read-only helper support only as baseline companion metadata.

## Provenance Posture

Provenance helps consumers trace package source and build context. It does not mean a package is risk-free, platform-approved, or safety-certified.

Registry readback and clean install smoke passed for the initial dotted `@agentique.io` package set. The initial uploader publication used an owner-approved maintainer-approved publication path after local and hosted validation; provenance was not generated for that fallback because it was not published from the checked-in OIDC workflow. The current coordinated release uses the checked-in GitHub Actions package publication workflow, but it is only partially complete and must not be advertised until uploader `0.2.0` publication, full registry readback, and clean install smoke pass for `0.2.0`.

Local release candidates should run:

```bash
npm run registry:readback
npm run install:smoke
```

The registry readback script records the current expected state from `docs/release-go-no-go.json`: schemas, validator, action, and readback are published at version `0.2.0`; uploader remains published at version `0.1.0` and uploader `0.2.0` remains pending until publish recovery completes.

Current uploader publication closeout remains Go for existing npm package availability at `0.1.0` after owner approval, hosted CI evidence, registry publish/readback, and clean install smoke. Uploader `0.2.0` is not advertised until publish recovery and registry install smoke complete. The package remains review-only, local draft and patch/delta output remain unsubmitted preparation artifacts, current source catalog/download changes remain unpublished release evidence, direct-download live availability is not advertised, and final resource publication stays on `agentique.io`.

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
