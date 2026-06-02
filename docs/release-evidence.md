# Release Evidence

This file records public-safe release evidence for the companion repository. Do not include tokens, cookies, private account data, local filesystem paths, or sensitive repository settings.

## Evidence Snapshot

- Date: 2026-06-02
- Environment: Windows PowerShell
- Node.js: v24.13.1
- npm: 11.8.0 local baseline; npm 11.14.1 for final dotted-scope registry readback/install smoke
- Git: 2.53.0.windows.1
- Branch: main
- Public repository: `https://github.com/rookiestar28/Agentique`
- Commit evidence: hosted CI is tracked through GitHub Actions for the latest pushed public release candidate. Latest recorded public evidence is the successful hosted Release Check for the latest pushed release candidate. Later pushes require a fresh hosted run before downstream release claims.

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

## Post-Publication Hardening Evidence

Local companion hardening and known-issues reconciliation checks were refreshed
on 2026-06-03.

Current command-line finding:

- Validator tests include package file-size bounds, external intake truncation
  blockers, precise package JSON schema dispatch, documentation placeholder
  governance, path-aware `.env` detection, and license recognition/policy
  classification.
- `KNOWN_ISSUES.md` is reconciled with repository-side hardening status.
- Public-content scans found no concrete internal item codes, local workspace
  paths, private planning paths, or stale known-issues open status text.
- `npm test`, release checks, workflow posture checks, starter validation,
  package dry-run, URL inventory, go/no-go checks, secret scan, and production
  dependency audits passed locally.

Later pushes still require a fresh hosted Release Check before downstream
release claims are updated.

## All-Channel Public URL Mode

The stricter all-channel public URL mode now passes for source, package, action usage, badge/readback documentation, schema, docs, and platform links:

```powershell
$env:AGENTIQUE_REQUIRE_PUBLIC_URLS = "1"
npm run urls:check
npm run release:check
```

Observed result: all inventory entries are approved and advertised.

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
- `@agentique.io/schemas` is published at version `0.1.0`.
- `@agentique.io/validator` is published at version `0.1.0`.
- `@agentique.io/action` is published at version `0.1.0`.
- `@agentique.io/readback` is published at version `0.1.0`.
- Package manifests include public access and provenance publish configuration.
- Package dry-run passed for schemas, validator, action, and readback packages.
- npm `11.14.1` registry readback and install smoke passed for the dotted `@agentique.io` scope.
- npm `11.8.0` returned `E404` for dotted-scope `npm view`; use current npm 11.14+ for registry readback/install validation.
- Clean install smoke passed with `--ignore-scripts`.
- Readback import smoke passed.
- Validator bin smoke passed against the public `agent-assistant` starter with installed schemas.

Publication note:

- The first package release used an owner-approved maintainer-approved publication path after validation.

## Public Link Smoke Evidence

Command-line public link smoke checks were run on 2026-06-02.

| URL | Result |
|---|---|
| `https://github.com/rookiestar28/Agentique` | HTTP 200 |
| `https://www.npmjs.com/package/@agentique.io/schemas` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/validator` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/action` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/readback` | Approved package page |
| `https://github.com/rookiestar28/Agentique/tree/main/packages/action#usage` | Approved action usage reference |
| `https://github.com/rookiestar28/Agentique/tree/main/packages/readback#badge-states` | Approved badge/readback documentation |
| `https://www.agentique.io/` | HTTP 200 |
| `https://www.agentique.io/api/public/v1/resources?limit=1` | HTTP 200 JSON with `pageInfo.page = 1`, `pageInfo.pageSize = 1`, `pageInfo.total = 60`, and `pageInfo.hasNextPage = true` |

These smoke checks approve source repository, package registry, action usage, badge/readback documentation, schema, documentation, and `agentique.io` public links for advertising. GitHub Marketplace-style promotion remains a separate future channel.

## Current Decision

The source repository, npm packages, action usage reference, badge/readback documentation, and `agentique.io` public links are Go. GitHub Marketplace-style promotion remains separate from this source/package release.
