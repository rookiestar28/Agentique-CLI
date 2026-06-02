# Release Evidence

This file records public-safe release evidence for the companion repository. Do not include tokens, cookies, private account data, local filesystem paths, or sensitive repository settings.

## Evidence Snapshot

- Date: 2026-06-02
- Environment: Windows PowerShell
- Node.js: v24.13.1
- npm: 11.8.0
- Git: 2.53.0.windows.1
- Branch: main
- Public repository: `https://github.com/rookiestar28/Agentique`
- Commit evidence: hosted CI is tracked through GitHub Actions for the latest pushed public release candidate. Later pushes require a fresh hosted run before downstream release claims.

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
| URL inventory check | Pass | `npm run urls:check` passed. |
| Go/no-go check | Pass as Go | `npm run release:go-no-go` passed with recorded external evidence. |
| Root production dependency audit | Pass | `npm audit --omit=dev` found 0 vulnerabilities. |
| Validator production dependency audit | Pass | `npm --prefix packages/validator audit --omit=dev` found 0 vulnerabilities. |
| Action production dependency audit | Pass | `npm --prefix packages/action audit --omit=dev` found 0 vulnerabilities. |
| Readback production dependency audit | Pass | `npm --prefix packages/readback audit --omit=dev` found 0 vulnerabilities. |

## Deferred Downstream URL Mode

The stricter all-channel public URL mode remains deferred for package, action, and badge channels:

```powershell
$env:AGENTIQUE_REQUIRE_PUBLIC_URLS = "1"
npm run urls:check
npm run release:check
```

Observed deferred entries:

- Package registry pages are not advertised because packages are not published yet.
- Action usage reference is not advertised until action publication is complete.
- Badge example URL is not advertised until a public badge target is published.

## Hosted Repository Evidence

Hosted repository evidence is recorded from command-line checks on 2026-06-02.

Current command-line finding:

- Public repository URL is approved: `https://github.com/rookiestar28/Agentique`.
- Public repository visibility is `PUBLIC`.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate.
- Each later push requires a fresh hosted run before downstream release claims.
- Hosted Release Check matrix jobs passed for Node 20, Node 22, and Node 24.
- Public `main` branch protection is enabled.
- Required checks are `release-check (20)`, `release-check (22)`, and `release-check (24)`.
- Pull request review and CODEOWNERS review are required.
- Force pushes and branch deletion are disabled.
- Repository rulesets are not configured; branch protection is the active protection mechanism.
- Repository Actions are enabled. The release workflow itself declares `permissions: contents: read`.

Required follow-up for later pushes:

1. Keep the latest pushed release candidate's hosted CI run passing.
2. Record the latest hosted CI run status before changing downstream release status.
3. Keep required status-check names aligned with the active workflow matrix.

## Package Registry Evidence

Command-line package registry checks were run on 2026-06-02.

Current command-line finding:

- npm registry connectivity passed.
- `@agentique.io/schemas` is not currently published.
- `@agentique.io/validator` is not currently published.
- `@agentique.io/action` is not currently published.
- `@agentique.io/readback` is not currently published.
- Package manifests include public access and provenance publish configuration.
- Package dry-run passed for schemas, validator, action, and readback packages.

Required follow-up before package URLs are advertised:

1. Owner npm login, package scope ownership, trusted publishing, and publish permission must be verified.
2. Owner go/no-go must be recorded before publication.
3. Published package pages must be added to the public URL inventory only after publication and smoke testing.

## Public Link Smoke Evidence

Command-line public link smoke checks were run on 2026-06-02.

| URL | Result |
|---|---|
| `https://github.com/rookiestar28/Agentique` | HTTP 200 |
| `https://www.agentique.io/` | HTTP 200 |
| `https://www.agentique.io/api/public/v1/resources?limit=1` | HTTP 200 JSON with `pageInfo.page = 1`, `pageInfo.pageSize = 1`, `pageInfo.total = 60`, and `pageInfo.hasNextPage = true` |

These smoke checks approve source repository, schema, documentation, and `agentique.io` public links for advertising. Package registry, badge, and marketplace/action channels remain deferred until those downstream targets are published and smoke tested.

## Current Decision

The source repository and `agentique.io` public links are Go. Package publishing, badge advertising, and marketplace/action publication remain deferred until those downstream channels are published and smoke tested.
