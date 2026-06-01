# Publication Baseline

This repository is public and should continue from a reviewed public-safe baseline.

The public repository must not import private platform history, temporary staging history, local evidence folders, or generated artifacts. Every release candidate should contain only reviewed public files that pass the release manifest, content, secret, dependency, and test gates.

## Baseline Rules

- Continue public history from reviewed public-safe content.
- Do not import history from private platform repositories or temporary staging workspaces.
- Do not include local caches, package archives, validation output, coverage, environment files, credentials, or generated dependency folders.
- Keep platform upload, scan, review, moderation, consent, publication, distribution state, and readback authority on `agentique.io`.
- Treat local validation as preparation only. It is not platform approval or safety certification.

## Required Baseline Evidence

- Release manifest allowlist passes.
- Public-content scan passes.
- Secret scan passes.
- Package tests pass.
- Production dependency audits pass.
- Starter validation passes for every starter package.
- Manual review confirms that the public tree contains no private project material.

## Rollback

If review finds private material or incorrect release contents before publication, stop the release and remove the unsafe content before pushing.

If private material reaches the public repository, use the private security disclosure route, rotate any affected credentials, and follow the repository hosting provider's sensitive-data removal guidance. Prefer a small corrective commit only when no sensitive or private material was exposed.
