# Hosted CI And Repository Protection

Public release requires both local workflow posture checks and hosted repository evidence.

## Workflow Requirements

- Validation workflows must use `pull_request`, `push`, or manual dispatch only.
- Validation workflows must not use `pull_request_target`.
- Validation workflows must not reference repository secrets.
- Validation workflows must not publish packages, create releases, or write repository contents.
- Package publishing workflows must be manual-only, use least-privilege permissions, and pass release validation before publishing.
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

- Public `main` branch protection is enabled.
- Required checks are `release-check (20)`, `release-check (22)`, and `release-check (24)`.
- Pull request review and CODEOWNERS review are required.
- Force pushes and branch deletion are disabled.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate.
- A fresh hosted CI run is required after each later release-candidate push.
- Branch protection should remain aligned with the active Release Check workflow matrix.
