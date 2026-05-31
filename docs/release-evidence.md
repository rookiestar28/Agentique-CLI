# Release Evidence

This file records public-safe release evidence for the companion repository. Do not include tokens, cookies, private account data, local filesystem paths, or sensitive repository settings.

## Evidence Snapshot

- Date: 2026-05-31
- Environment: Windows PowerShell
- Node.js: v24.13.1
- npm: 11.8.0
- Git: 2.53.0.windows.1
- GitHub CLI: 2.89.0
- Branch: main
- Commit evidence: use the latest pushed `main` commit and matching GitHub Actions run for the current release candidate.

## Local Checks

| Check | Result | Evidence |
|---|---:|---|
| Dependency install | Pass | `npm ci --ignore-scripts` completed with 0 vulnerabilities. |
| Secret scan | Pass | `python -m detect_secrets scan --all-files --exclude-files '(\\.git/|\\.git\\\\|node_modules/|node_modules\\\\)'` completed with empty `results`. |
| Tests | Pass | `npm test` passed root scripts, validator, action, and readback tests. |
| Starter validation | Pass | `npm run validate:starters` passed all starter packages. |
| Release allowlist and public-content check | Pass | `npm run release:check` passed. |
| Workflow posture | Pass | `npm run workflow:check` passed. |
| Package dry run | Pass | `npm run pack:dry-run` passed schemas, validator, action, and readback package checks. |
| URL inventory check | Pass with advertising blocked | `npm run urls:check` passed while public advertising remains blocked. |
| Go/no-go check | Pass as No-Go | `npm run release:go-no-go` passed with explicit blockers. |
| Root production dependency audit | Pass | `npm audit --omit=dev` found 0 vulnerabilities. |
| Validator production dependency audit | Pass | `npm --prefix packages/validator audit --omit=dev` found 0 vulnerabilities. |
| Action production dependency audit | Pass | `npm --prefix packages/action audit --omit=dev` found 0 vulnerabilities. |
| Readback production dependency audit | Pass | `npm --prefix packages/readback audit --omit=dev` found 0 vulnerabilities. |

## Release-Ready URL Mode

The stricter public URL mode was intentionally blocked:

```powershell
$env:AGENTIQUE_REQUIRE_PUBLIC_URLS = "1"
npm run urls:check
npm run release:check
```

Observed blockers:

- URL inventory still has `releaseBlocked: true`.
- Package registry pages are not approved and advertised.
- Action usage reference is not approved and advertised.
- Public schema URL base is not approved and advertised.
- Public documentation URL is not approved and advertised.
- Badge example URL is not approved and advertised.
- Agentique.io companion link is not approved and advertised.
- Agentique.io public readback endpoint is not approved and advertised.
- Starter source URLs still use placeholder source URLs while release blocking remains enabled.

## Hosted Repository Evidence

Hosted repository evidence is partially recorded from the command line.

Current command-line finding:

- GitHub CLI is installed and an active account is available.
- Public repository URL is approved: `https://github.com/rookiestar28/Agentique`.
- Hosted CI runs can be queried after each push.
- Branch protection is not enabled on `main` yet.
- Repository rulesets are not configured yet.

Required follow-up before downstream release channels are advertised:

1. Record the latest hosted CI run URL and final passed status.
2. Enable and record the release branch protection or ruleset summary.
3. Record required status-check names.
4. Record review and code-owner review settings.
5. Record force-push and branch deletion protections.

## Current Decision

Source publication can proceed independently from downstream release channels. Downstream package publishing, badge advertising, marketplace/action publication, and platform links remain No-Go until the missing repository protection, final URL, package registry, platform link, platform launch, and owner approval evidence is recorded.
