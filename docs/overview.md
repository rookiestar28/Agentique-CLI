# Agentique Companion Docs Overview

Agentique.io is a platform for preparing, reviewing, publishing, and displaying public AI resource listings. Agentique companion docs describe the public developer kit and creator kit for that platform.

These docs help external creators prepare public resources before entering the `agentique.io` upload flow, validate package structure with public tooling, inspect non-static lane descriptors, review uploader behavior, and display resource status through public readback after platform publication.

The docs explain resource manifests, skill packages, workflow templates, non-static lane examples, distribution mode choices, uploader boundaries, scan readback, and support routing.

agentique.io owns upload, scan, review, consent, moderation, distribution state, and readback. Companion docs and local tools only help prepare content for that platform-owned flow.

Local validation is not platform approval. Local validation is not safety certification. Public readback reflects the platform state that `agentique.io` exposes, and stale or unavailable readback must be shown as stale or unavailable.

## Preparation Flow

1. Draft a resource manifest.
2. Add package metadata and inventory.
3. Choose a distribution mode that matches the content.
4. Run local static checks when available.
5. Enter the platform-owned upload flow on `agentique.io`, or review an uploader session when explicitly configured with platform API access.
6. Wait for platform scan, review, consent, moderation, publication, and readback.

## Public Boundaries

Companion docs and tools do not publish, edit, delete, moderate, approve, or certify resources. The uploader package is review-only; authenticated review-session access and final resource publication remain platform-owned and account/token gated. Public issue threads are for docs and tooling questions, not unsafe reports or private account matters.
