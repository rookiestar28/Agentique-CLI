# Agentique Action

GitHub Action wrapper around Agentique local validation.

The action runs validator checks with least-privilege defaults and does not require secrets for pull request validation.

Action output is local readiness information only. It is not platform approval and is not safety certification. `agentique.io` remains the source of truth for upload, scan, review, moderation, publication, distribution state, and readback.

## Usage

```yaml
permissions:
  contents: read

steps:
  - uses: actions/checkout@v6
  - uses: ./packages/action
    with:
      package-dir: ./starters/agent-assistant
      schemas-dir: ./schemas
      validator-script: ./packages/validator/src/cli.mjs
```

The action writes a JSON report to `agentique-validation.json` by default.

## Status

Published in this repository for direct workflow usage and on npm at `0.2.1`. GitHub Marketplace-style promotion remains a separate future channel.
