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
- Public docs describe registry trust metadata, creator checkpoints, trust readback, generated drafts, and patch/delta output as preparation/readback contracts only.
- Public docs describe parser/variant and agent-native schemas, fixtures, starters, readback helpers, and uploader import/variant/agent-native dry-runs as static local preparation or read-only projection contracts only.
- Parser/variant docs do not claim platform download availability, hosted execution, runtime compatibility, publication, approval, or safety outcomes.
- Public docs describe already-published catalog/download behavior as `0.2.0` release evidence and canonical catalog envelope, ticket-backed byte-transfer fixes, and agent-native source changes as owner-approved coordinated `0.2.1` patch-candidate changes, with schemas, validator, action, and readback published at `0.2.1` and uploader `0.2.1` pending for the publish retry.
- Catalog/download docs do not claim hosted execution, package installation, archive extraction, runtime compatibility, publication, approval, safety outcomes, or universal direct-download availability for every public resource.
- Uploader package status, local draft/patch output, and review-only submit are documented separately from platform publication and live resource availability.
- Any pending package pages are marked non-advertised in the URL inventory.
- Registry readback passed with expected published package states.
- Package install smoke passed from locally packed tarballs with lifecycle scripts disabled.
- Parser/variant, agent-native, and catalog/download package surface smoke passed from locally packed tarballs: parser-variant schema file, agent-native schema file, readback parser/variant and agent-native exports, readback catalog/download exports, uploader import-plan / variant-plan / agent-native-plan help, uploader catalog help, and uploader direct-download help are present.

## Package Publishing

Packages must not use long-lived package tokens when OIDC trusted publishing is available. Prefer staged publishing with maintainer review before public availability.

Provenance and attestations help consumers trace where an artifact came from. They do not prove that the artifact is risk-free.

The first public npm release used an owner-approved short-lived granular token fallback after local and hosted validation passed. The coordinated `0.2.0` package release used the checked-in manual GitHub Actions trusted-publishing workflow and passed registry readback plus clean install smoke for the full package set.

Before advertising any newly published package, run `npm run registry:readback`, run `npm run install:smoke`, and record version, dist-tag, tarball contents, clean install smoke, package CLI/import smoke, parser/variant package surface evidence, agent-native package surface evidence, and catalog/download package surface evidence for the exact version being advertised.

## Launch Boundary

Passing this checklist means the release candidate is ready for owner review. It does not itself publish, advertise, or link a new public target.

External-intake output does not approve a candidate, certify safety, replace platform moderation, or provide legal clearance.

Surfacing contract fixtures and readback helper output are release-review inputs only. They do not replace `agentique.io` review, moderation, publication state, distribution state, or public readback.

Parser/variant and agent-native helper output is local preparation output only. It does not prove runtime compatibility, create a platform download, publish a converted artifact, provide resolver availability, or replace platform parser/readback decisions.

Generated draft and patch/delta helper output is local preparation output only. It remains unsubmitted until the user confirms the change and the platform validates it through the review flow.

Catalog/download helper output is local preparation and readback output only. Direct download writes bytes to the explicit output path and does not install, extract, open, execute, approve, certify, publish, host, moderate, or guarantee live byte-transfer availability for every public resource.
