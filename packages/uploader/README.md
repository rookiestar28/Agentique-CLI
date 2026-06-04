# Agentique Uploader

`@agentique.io/uploader` is the planned public CLI package for review-only Agentique submissions.

This package currently exposes the package boundary only. Live upload commands are intentionally disabled until the authenticated upload session flow, completion verification, release evidence, and registry publication gates are complete.

Current boundary:

- The package reserves the `agentique` command name.
- The CLI exposes help, version, auth, and upload command skeletons.
- Auth status can read a one-command `--token`, `AGENTIQUE_TOKEN`, or an `AGENTIQUE_CONFIG` JSON file and reports only redacted metadata.
- Upload commands fail closed until the later upload-plan and upload-session contracts are enabled.
- JSON output is available with `--json`.
- No browser session, cookie, CSRF state, upload session, storage URL, or network request is read or sent.
- The package does not publish, approve, certify, host, or moderate resources.

Examples:

```bash
agentique --help
agentique --version
agentique auth status --token <token> --json
agentique upload plan ./my-package --schemas-dir ./schemas --json
agentique upload submit ./my-package --json
agentique upload status submission-id --json
```

Use `@agentique.io/validator` for local no-execution package validation and `@agentique.io/readback` for read-only public status helpers.
