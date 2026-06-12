# Repository Policy

This repository is the public companion monorepo for Agentique documentation, schemas, starters, local validation tooling, workflow validation, read-only readback helpers, review-only uploader tooling, and release smoke checks.

Source repository, approved npm package registry pages, action usage reference, badge/readback documentation, and `agentique.io` public-link publication are Go because:

- Owner approval exists.
- Public-content review passes.
- Secret scanning passes.
- Support and security routes are reviewed.
- Hosted CI for the latest pushed release candidate passes.
- Branch protection is enabled for long-lived public release maintenance.
- Final repository, package, docs, schema, action usage, badge/readback documentation, and `agentique.io` links are approved.

Package registry pages, badge/readback documentation, and action usage documentation are approved after publication and smoke testing. `@agentique.io/uploader` is published at version `0.2.0` after owner-approved publication, hosted CI evidence, registry readback, and clean install smoke. GitHub Marketplace-style promotion remains a separate future channel.

Parser/variant package changes are Go for the coordinated `0.2.0` package-release claim. Catalog/download behavior already published in `0.2.0` remains limited to the evidence recorded for that release. Canonical catalog envelope fixes, ticket-backed byte-transfer fixes, and agent-native schema/validator/readback/uploader dry-run source changes are part of the coordinated `0.2.1` patch candidate and are not yet published on npm. Registry readback shows the existing package set at version `0.2.0`, and owner-approved disposable byte-transfer evidence is recorded for a public catalog resource.

Public history must remain public-safe. Do not add private planning material, private platform evidence, local workspace paths, generated archives, dependency folders, credentials, or unpublished operational procedures.
