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

Hosted repository evidence is partially recorded from command-line checks on 2026-06-02.

Current command-line finding:

- Public repository URL is approved: `https://github.com/rookiestar28/Agentique`.
- Public repository visibility is `PUBLIC`.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate.
- Each later push requires a fresh hosted run before downstream release claims.
- Hosted Release Check matrix jobs passed for Node 20, Node 22, and Node 24.
- Public `main` branch protection is currently not enabled.
- Repository rulesets are not configured.
- Repository Actions are enabled. The release workflow itself declares `permissions: contents: read`.

Required follow-up before downstream release channels are advertised:

1. Keep the latest pushed release candidate's hosted CI run passing.
2. Record the latest hosted CI run status before changing downstream release status.
3. If branch protection is re-enabled, keep required status-check names aligned with the active workflow matrix.

## Package Registry Evidence

Command-line package registry checks were run on 2026-06-02.

Current command-line finding:

- npm registry connectivity passed.
- `@agentique/schemas` is not currently published.
- `@agentique/validator` is not currently published.
- `@agentique/action` is not currently published.
- `@agentique/readback` is not currently published.
- Package manifests include public access and provenance publish configuration.
- Package dry-run passed for schemas, validator, action, and readback packages.

Required follow-up before package URLs are advertised:

1. Owner npm login, package scope ownership, registry provenance, and publish permission must be verified.
2. Owner go/no-go must be recorded before publication.
3. Published package pages must be added to the public URL inventory only after publication and smoke testing.

## Public Link Smoke Evidence

Command-line public link smoke checks were run on 2026-06-02.

| URL | Result |
|---|---|
| `https://github.com/rookiestar28/Agentique` | HTTP 200 |
| `https://www.agentique.io/developers/companion` | HTTP 200 |
| `https://www.agentique.io/api/public/v1/resources?limit=1` | HTTP 200 JSON with `pageInfo.page = 1`, `pageInfo.pageSize = 1`, `pageInfo.total = 60`, and `pageInfo.hasNextPage = true` |

These smoke checks do not approve advertising. The public URL inventory remains blocked until owner-approved package, schema, docs, badge, action, and platform entries are recorded.

## Current Decision

The source repository is public. Downstream package publishing, badge advertising, marketplace/action publication, and platform links remain No-Go until final public URLs, package registry URLs, platform link evidence, platform launch evidence, owner approval, and any required branch-protection disposition are recorded.
