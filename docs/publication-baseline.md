# Publication Baseline

This repository is intended to be published from a clean reviewed initial state.

The public repository does not need to preserve local staging history. The first public push should contain only reviewed public files that pass the release manifest, content, secret, dependency, and test gates.

## Baseline Rules

- Start public history from reviewed public-safe content.
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

## Rollback Before Public Push

If review finds private material or incorrect release contents before public push, discard the local Git history and create a new clean baseline from reviewed files.
