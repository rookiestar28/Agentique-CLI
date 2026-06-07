# Agentique Companion Docs Overview

Agentique.io is a platform for preparing, reviewing, publishing, and displaying public AI resource listings. Agentique companion docs describe the public developer kit and creator kit for that platform.

These docs help external creators prepare public resources before entering the `agentique.io` upload flow, validate package structure with public tooling, inspect non-static lane descriptors, review parser/variant metadata, review uploader behavior, prepare local draft or patch output, and display resource status through public readback after platform publication.

The docs explain resource manifests, registry trust metadata, parser/variant metadata, skill packages, workflow templates, non-static lane examples, distribution mode choices, uploader boundaries, trust and parser/variant readback, generated draft and patch/delta preparation, and support routing.

agentique.io owns upload, scan, review, consent, moderation, distribution state, and readback. Companion docs and local tools only help prepare content for that platform-owned flow.

Local validation is not platform approval. Local validation is not safety certification. Public readback reflects the platform state that `agentique.io` exposes, and stale or unavailable readback must be shown as stale or unavailable.

## Preparation Flow

1. Draft a resource manifest.
2. Add package metadata and inventory.
3. Choose a distribution mode that matches the content.
4. Run local static checks when available.
5. Add parser/variant metadata only when it is static, source-only, and backed by no-execution evidence.
6. Use uploader plan, draft, or patch commands for local review-only preparation when useful; use source import-plan and variant-plan dry-runs only as unpublished parser/variant package-release evidence until a new version is published and verified.
7. Enter the platform-owned upload flow on `agentique.io`, or review an uploader session when explicitly configured with platform API access and checkpoint-ready package metadata.
8. Wait for platform scan, review, consent, moderation, publication, and readback.

## Public Boundaries

Companion docs and tools do not publish, edit, delete, moderate, approve, certify, host, or execute resources. Parser/variant metadata and uploader dry-runs are local preparation evidence only. Parser/variant package changes target `0.2.0` and are No-Go for a new package-release claim until the recovery workflow runs on `main`, uploader `0.2.0` is published, full registry readback, install-smoke, and rollback evidence are recorded. The uploader package is review-only; authenticated review-session access and final resource publication remain platform-owned and account/token gated. Public issue threads are for docs and tooling questions, not unsafe reports, raw imported content, credentials, or private account matters.
