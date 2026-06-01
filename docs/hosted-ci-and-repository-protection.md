# Hosted CI And Repository Protection

Public release requires both local workflow posture checks and hosted repository evidence.

## Workflow Requirements

- Validation workflows must use `pull_request`, `push`, or manual dispatch only.
- Validation workflows must not use `pull_request_target`.
- Validation workflows must not reference repository secrets.
- Validation workflows must not publish packages, create releases, or write repository contents.
- `GITHUB_TOKEN` permissions should be read-only for validation.

## Repository Protection Requirements

Before public release, the public repository should record evidence for:

- default branch protection or ruleset enabled for the release branch
- required status check for the release check workflow
- review required before merge
- code owner review required before merge
- force pushes disabled on the release branch
- deletion disabled on the release branch

## Evidence To Record

Record public-safe evidence only:

- hosted CI run URL and pass/fail status
- branch protection or ruleset summary
- required status-check name
- review and code-owner review settings
- date and reviewer

Do not record tokens, cookies, private account data, or sensitive repository settings.

## Release Boundary

Local workflow checks are necessary but not sufficient. Hosted CI must pass for the latest pushed release candidate before downstream release claims.

## Current Public Evidence State

- Public `main` branch protection is currently not enabled.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate.
- A fresh hosted CI run is required after each later release-candidate push.
- If branch protection is re-enabled, it should require the Release Check status checks, pull request review, code-owner review, and disabled force pushes/deletion.
