# Agentique Uploader

`@agentique.io/uploader` is the public CLI package for review-only Agentique submissions.

This package exposes a review-only upload lane. It can validate a package locally, create an authenticated review session, transfer local evidence to the server-provided upload URL, complete the session, and read back review status. It does not publish, approve, certify, host, or moderate resources.

The package is published on npm at version `0.1.0` after owner-approved publication, registry readback, and clean install smoke. It remains review-only; authenticated review-session access and final resource publication stay on `agentique.io`.

Current boundary:

- The package reserves the `agentique` command name.
- The CLI exposes help, version, auth, upload plan, local import-plan, local variant-plan, local draft, local patch, upload submit, and upload status commands.
- Auth status can read a one-command `--token`, `AGENTIQUE_TOKEN`, or an `AGENTIQUE_CONFIG` JSON file and reports only redacted metadata.
- Upload plan validates local packages with `@agentique.io/validator` without executing package code.
- Upload import-plan and variant-plan reuse local validator evidence for dry-run parser and variant review; they do not execute source code, workflows, notebooks, package managers, Docker, MCP servers, or framework loaders.
- Source-only variant output is preparation evidence and is not platform download readiness.
- Upload draft emits local draft-only card or manifest output for review; it does not submit generated content.
- Upload patch emits local patch or delta operation summaries when package metadata provides them; it does not submit partial updates.
- Upload submit requires token auth, an Agentique API origin, checkpoint-ready package metadata, local validation, review-only session creation, evidence transfer, and server completion verification.
- Upload status requires token auth and reads a review-only submission status.
- JSON output is available with `--json`.
- Browser sessions, cookies, CSRF state, storage URLs, and bearer tokens are not printed in CLI output.
- Bearer auth is sent only to Agentique API endpoints, never to the server-provided storage URL.
- The package does not publish, approve, certify, host, or moderate resources.

Examples:

```bash
agentique --help
agentique --version
agentique auth status --token <token> --json
agentique upload plan ./my-package --schemas-dir ./schemas --json
agentique upload import-plan ./my-package --schemas-dir ./schemas --json
agentique upload variant-plan ./my-package --schemas-dir ./schemas --json
agentique upload draft ./my-package --schemas-dir ./schemas --draft-kind manifest --json
agentique upload patch ./my-package --schemas-dir ./schemas --json
agentique upload submit ./my-package --schemas-dir ./schemas --token <token> --api-url https://www.agentique.io --json
agentique upload status submission-id --token <token> --api-url https://www.agentique.io --json
```

Use `@agentique.io/validator` for local no-execution package validation and `@agentique.io/readback` for read-only public status and trust projection helpers.
