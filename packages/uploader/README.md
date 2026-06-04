# Agentique Uploader

`@agentique.io/uploader` is the planned public CLI package for review-only Agentique submissions.

This package currently exposes the package boundary only. Live upload commands are intentionally disabled until the authenticated upload session flow, completion verification, release evidence, and registry publication gates are complete.

Current boundary:

- The package reserves the `agentique` command name.
- The CLI fails closed with exit code `2`.
- JSON output is available with `--json`.
- No token, browser session, cookie, CSRF state, upload session, storage URL, or network request is read or sent.
- The package does not publish, approve, certify, host, or moderate resources.

Use `@agentique.io/validator` for local no-execution package validation and `@agentique.io/readback` for read-only public status helpers.
