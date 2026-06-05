# Agentique Uploader

`@agentique.io/uploader` is the planned public CLI package for review-only Agentique submissions.

This package exposes a review-only upload lane. It can validate a package locally, create an authenticated review session, transfer local evidence to the server-provided upload URL, complete the session, and read back review status. It does not publish, approve, certify, host, or moderate resources.

Registry publication is pending. The source package is included in local validation and package dry-run checks, but `@agentique.io/uploader` should not be advertised as installable from npm until registry readback and install smoke evidence are recorded.

Current boundary:

- The package reserves the `agentique` command name.
- The CLI exposes help, version, auth, upload plan, upload submit, and upload status commands.
- Auth status can read a one-command `--token`, `AGENTIQUE_TOKEN`, or an `AGENTIQUE_CONFIG` JSON file and reports only redacted metadata.
- Upload plan validates local packages with `@agentique.io/validator` without executing package code.
- Upload submit requires token auth, validates the package first, creates a review-only session, uploads evidence, and requires server completion verification.
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
agentique upload submit ./my-package --schemas-dir ./schemas --token <token> --api-url https://www.agentique.io --json
agentique upload status submission-id --token <token> --api-url https://www.agentique.io --json
```

Use `@agentique.io/validator` for local no-execution package validation and `@agentique.io/readback` for read-only public status helpers.
