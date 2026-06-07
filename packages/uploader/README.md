# Agentique Uploader

`@agentique.io/uploader` is the public CLI package for review-only Agentique submissions.

This package exposes a review-only upload lane plus public readback/download helpers in the current source. It can validate a package locally, create an authenticated review session, transfer local evidence to the server-provided upload URL, complete the session, read back review status, query public catalog metadata, and download available artifact bytes to an explicit local output path. It does not publish, approve, certify, host, moderate, install, extract, open, or execute resources.

The package remains review-only; authenticated review-session access and final resource publication stay on `agentique.io`.

Catalog and direct-download commands are included in the 0.2.0 package source. The commands remain read-only or explicit-output only. Owner-approved disposable byte-transfer evidence is recorded for a metadata-only public resource, but this evidence does not certify content safety, approve arbitrary resources, or guarantee every public resource is downloadable.

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
- Catalog list, get, and download-metadata commands are GET-only public readback requests and do not require uploader auth.
- Direct download resolves public metadata, writes bytes only to the explicit output path, verifies SDK size/digest checks, and never installs, extracts, opens, or executes content.
- Direct download success and error output omit raw signed URLs and absolute local output paths.
- JSON output is available with `--json`.
- Browser sessions, cookies, CSRF state, storage URLs, and bearer tokens are not printed in CLI output.
- Bearer auth is sent only to Agentique API endpoints, never to the server-provided storage URL.
- The package does not publish, approve, certify, host, moderate, install, extract, open, or execute resources.

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
agentique catalog list --api-url https://www.agentique.io --json
agentique catalog get resource-id --api-url https://www.agentique.io --json
agentique catalog download-metadata resource-id --api-url https://www.agentique.io --json
agentique download resource-id --output ./downloads/ --api-url https://www.agentique.io --json
```

Use `@agentique.io/validator` for local no-execution package validation and `@agentique.io/readback` for read-only public status, catalog metadata, trust projection, and safe byte-download helpers.
