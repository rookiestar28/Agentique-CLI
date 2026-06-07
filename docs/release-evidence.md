# Release Evidence

This file records public-safe release evidence for the companion repository. Do not include tokens, cookies, private account data, local filesystem paths, or sensitive repository settings.

## Evidence Snapshot

- Date: 2026-06-07
- Environment: Windows PowerShell
- Node.js: v24.13.1
- npm: 11.8.0
- Git: 2.53.0.windows.1
- Branch: feature/parser-variant-sync
- Public repository: `https://github.com/rookiestar28/Agentique`
- Commit evidence: hosted CI is tracked through GitHub Actions for the latest pushed public release candidate. Latest recorded public evidence is the successful hosted Release Check for the latest pushed release candidate. Later pushes require a fresh hosted run before downstream release claims.

## Local Checks

| Check | Result | Evidence |
|---|---:|---|
| Dependency install | Pass | `npm ci --ignore-scripts` completed with 0 vulnerabilities. |
| Secret scan | Pass | `python -m detect_secrets scan --all-files --exclude-files '(\\.git/|\\.git\\\\|node_modules/|node_modules\\\\)'` completed with empty `results`. |
| Tests | Pass | `npm test` passed 175 tests across root scripts, validator, action, readback, and uploader. |
| Starter validation | Pass | `npm run validate:starters` passed all starter packages. |
| Release allowlist and public-content check | Pass | `npm run release:check` passed. |
| Workflow posture | Pass | `npm run workflow:check` passed. |
| Package dry run | Pass | `npm run pack:dry-run` passed schemas, validator, action, readback, and uploader package checks. |
| Parser/variant and catalog/download package surface smoke | Pass | `npm run install:smoke` installs locally packed tarballs with lifecycle scripts disabled and checks parser-variant schema, readback parser/variant export, readback catalog/download exports, uploader import/variant help, uploader catalog help, and uploader direct-download help. |
| Registry readback | Pass | `AGENTIQUE_REGISTRY_MODE=published AGENTIQUE_PACKAGE_VERSION=0.2.0 npm run registry:readback` confirms schemas, validator, action, readback, and uploader at `0.2.0`. |
| URL inventory check | Pass | `npm run urls:check` passed. |
| Go/no-go check | Pass as Go | `npm run release:go-no-go` passed with recorded external evidence. |
| Package publication release gate refresh | Pass | Hosted Release Check passed on `main`, GitHub Actions publication completed, registry readback passed for all `0.2.0` packages, and registry install smoke passed. |
| Root production dependency audit | Pass | `npm audit --omit=dev` found 0 vulnerabilities. |
| Validator production dependency audit | Pass | `npm --prefix packages/validator audit --omit=dev` found 0 vulnerabilities. |
| Action production dependency audit | Pass | `npm --prefix packages/action audit --omit=dev` found 0 vulnerabilities. |
| Readback production dependency audit | Pass | `npm --prefix packages/readback audit --omit=dev` found 0 vulnerabilities. |
| Uploader production dependency audit | Pass | Uploader depends on `@agentique.io/readback@^0.2.0` and `@agentique.io/validator@^0.2.0`; those dependency versions are readable from npm. `npm --prefix packages/uploader ci --ignore-scripts` and `npm --prefix packages/uploader audit --omit=dev` passed with 0 vulnerabilities before uploader publication. |

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
  package dry-run, URL inventory, go/no-go checks, secret scan, root/workspace
  audit, validator audit, action audit, and readback audit passed locally.

Later pushes still require a fresh hosted Release Check before downstream
release claims are updated.

## Uploader Source Alignment Evidence

Uploader source alignment and npm package checks were refreshed on 2026-06-07.

Current command-line finding:

- `@agentique.io/uploader` is implemented in source at version `0.2.0`.
- Uploader CLI source includes redacted auth status, upload-plan evidence, creator checkpoint readiness, local draft output, local patch/delta output, review-only submit/status helpers, bearer/storage separation, bounded transfer retry, and server completion verification checks.
- Current source branch additionally includes GET-only catalog list/detail/download-metadata commands and a direct byte-download command with explicit output path, no auth forwarding, signed URL redaction, no absolute output path in CLI output, redirect controls, max-byte checks, digest checks, and no install/extract/open/execute behavior.
- `@agentique.io/uploader` is included in root tests, package dry-run, publish workflow validation, and root/workspace production dependency audit.
- npm registry readback for `@agentique.io/uploader` returns published version `0.2.0`, so the package page remains approved for advertising.
- Authenticated review-session access and final resource publication remain platform and account/token gated. Package checks do not advertise live publication or platform approval.
- Final uploader publication closeout is Go for npm package availability after owner-approved publication, hosted CI evidence, npm registry readback, and clean install smoke from npm.

Current documentation now describes registry trust metadata, creator checkpoints, trust readback, local draft output, and patch/delta output. Current local release gates pass for this source branch, owner approval to use the manual GitHub Actions package publishing workflow is recorded, the coordinated `0.2.0` package publication completed, and registry install smoke passed.

## Parser And Variant Branch-Local Evidence

Current source now includes public parser/variant schemas, schema fixtures, validator summaries, readback projection helpers, uploader import-plan and variant-plan dry-runs, and a synthetic source-only starter package. These package surfaces are included in the coordinated `0.2.0` release after hosted release checks, GitHub Actions publication, and registry readback.

Parser/variant evidence remains limited to static metadata, local dry-runs, and read-only public projection helpers. It does not advertise platform-managed validation, hosted execution, platform download availability, runtime compatibility, approval, publication, or safety outcomes.

## Parser And Variant Package Release Gate Evidence

Current release tooling packs schemas, validator, action, readback, and uploader packages, then installs the local tarballs with lifecycle scripts disabled. The install smoke checks that parser/variant package surfaces survive packaging: `parser-variant.schema.json` is present in the schemas package, `normalizeParserVariantReadback()` is exported from readback, and uploader help exposes `upload import-plan` and `upload variant-plan`.

Registry readback proves schemas, validator, action, readback, and uploader at `0.2.0`. Parser/variant source changes are published in package version `0.2.0` after owner-approved GitHub Actions publication, hosted Release Check, full registry readback, registry install smoke, and documented rollback/unpublish procedure evidence.

Parser/variant package publication is currently Go for the coordinated `0.2.0` package-release claim.

## Catalog And Download Branch-Local Evidence

Current source now includes readback catalog list/detail/download-metadata helpers, catalog metadata normalizers, a safe direct-download utility, uploader catalog read commands, uploader direct download, and package-surface smoke coverage for installed tarballs.

Catalog/download evidence includes local source behavior, local tests, installed-tarball smoke, registry install smoke for `0.2.0`, the bounded live metadata smoke below, and owner-approved disposable byte-transfer smoke. It does not approve resources, certify safety, install or execute downloaded content, or replace platform review.

Registry readback proves schemas, validator, action, readback, and uploader at `0.2.0`. Catalog/download package changes are published in package version `0.2.0` after owner-approved GitHub Actions publication, hosted Release Check, full registry readback, registry install smoke, and documented rollback/unpublish procedure evidence.

Catalog/download package publication is currently Go for the coordinated `0.2.0` package-release claim. Owner-approved disposable direct byte-transfer smoke passed for a metadata-only public resource.

## Catalog And Download Live Metadata Evidence

GET-only unauthenticated live metadata smoke was refreshed on 2026-06-07.

| Endpoint class | Result |
|---|---|
| Non-canonical public resource list URL | HTTP 308 redirect to the canonical `www.agentique.io` URL. |
| Canonical public resource list URL | HTTP 200 JSON with a read-only list response and page metadata. |
| First listed public resource detail URL | HTTP 200 JSON with read-only resource detail metadata. |
| First listed public resource download-metadata URL | HTTP 200 JSON with available download metadata. |
| Direct byte-transfer smoke | Pass | Owner-approved disposable smoke on 2026-06-07 selected metadata-only resource `cmpu0alp200m0lt0ax39rcb9o` (`post-dev-recap.zip`, 1377 bytes). Public metadata was read without auth, the unauthenticated byte ticket endpoint returned a server-provided URL that was not printed or recorded, byte transfer completed, size matched, SHA256 matched, and the artifact was not opened, extracted, or executed. |

This evidence supports catalog, download-metadata, and bounded disposable byte-transfer availability inputs for the release decision. It does not certify content safety, approve resources, install or execute downloaded content, or guarantee every public resource is downloadable.

## Catalog And Download Closeout Evidence

Current source closeout evidence is complete for local preparation only:

- Readback SDK catalog and download-metadata helpers are covered by package tests.
- The safe direct-download utility is covered by package tests with path, overwrite, redirect, size, digest, cleanup, and token-forwarding boundaries.
- Uploader catalog and direct-download commands are covered by package tests.
- Installed-tarball smoke covers readback catalog/download exports and uploader catalog/direct-download help surfaces.
- Registry readback proves schemas, validator, action, readback, and uploader at `0.2.0`.
- Owner-approved disposable byte-transfer smoke passed for metadata-only resource `cmpu0alp200m0lt0ax39rcb9o`; size and SHA256 matched, no auth was used, and the artifact was not opened, extracted, or executed.
- Live metadata smoke proves the public list/detail/download-metadata endpoints for the sampled public resource.

Current closeout evidence includes hosted CI on `main`, GitHub Actions publication, full registry readback for `0.2.0`, registry install smoke, owner-approved disposable byte-transfer smoke, and documented rollback/unpublish procedure evidence.

## All-Channel Public URL Mode

Approved advertised URL checks pass for source, published packages, action usage, badge/readback documentation, schema, docs, and platform links:

```powershell
npm run urls:check
npm run release:check
```

Observed result: all advertised inventory entries are approved, including the uploader package page.

## Hosted Repository Evidence

Hosted repository evidence is recorded from GitHub Actions checks refreshed on 2026-06-06.

Current command-line finding:

- Public repository URL is approved: `https://github.com/rookiestar28/Agentique`.
- Public repository visibility is `PUBLIC`.
- Hosted Release Check evidence is recorded for the latest pushed public release candidate; run `27047071695` passed on `main` at commit `bf6b508e563f69f74acad57510861c8b28865e7a`.
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

Command-line package registry checks were refreshed on 2026-06-07.

Current command-line finding:

- npm registry connectivity passed.
- `@agentique.io/schemas` is published at version `0.2.0`.
- `@agentique.io/validator` is published at version `0.2.0`.
- `@agentique.io/action` is published at version `0.2.0`.
- `@agentique.io/readback` is published at version `0.2.0`.
- `@agentique.io/uploader` is published at version `0.2.0`.
- Package manifests include public access and provenance publish configuration.
- Package dry-run passed for schemas, validator, action, readback, and uploader packages.
- npm `11.14.1` registry readback and install smoke passed for the dotted `@agentique.io` scope.
- npm registry readback on 2026-06-07 confirmed schemas, validator, action, readback, and uploader at target version `0.2.0`.
- Clean install smoke from the npm registry package set passed for `@agentique.io/*@0.2.0`; the installed uploader CLI returned `0.2.0`.
- Clean install smoke passed with `--ignore-scripts`.
- Readback import smoke passed.
- Validator bin smoke passed against the public `agent-assistant` starter with installed schemas.

Publication note:

- The first package release used an owner-approved short-lived granular token fallback after validation.
- Owner approval is recorded to use the checked-in manual GitHub Actions package publishing workflow for the coordinated package release target, `0.2.0`. The workflow ran on `main`, published the remaining uploader package, verified full registry readback for `0.2.0`, and passed clean install smoke.

## Public Link Smoke Evidence

Command-line public link smoke checks were run on 2026-06-02, and package registry page status for uploader was refreshed through npm registry readback on 2026-06-06.

| URL | Result |
|---|---|
| `https://github.com/rookiestar28/Agentique` | HTTP 200 |
| `https://www.npmjs.com/package/@agentique.io/schemas` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/validator` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/action` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/readback` | Approved package page |
| `https://www.npmjs.com/package/@agentique.io/uploader` | Approved package page |
| `https://github.com/rookiestar28/Agentique/tree/main/packages/action#usage` | Approved action usage reference |
| `https://github.com/rookiestar28/Agentique/tree/main/packages/readback#badge-states` | Approved badge/readback documentation |
| `https://www.agentique.io/` | HTTP 200 |
| `https://www.agentique.io/api/public/v1/resources?limit=1` | Current HTTP 200 JSON metadata smoke for the existing readback endpoint inventory. Bounded disposable byte-transfer evidence is recorded separately above. |

These smoke checks approve source repository, published package registry, action usage, badge/readback documentation, schema, documentation, and `agentique.io` public links for advertising. GitHub Marketplace-style promotion remains a separate future channel.

## Current Decision

The source repository, published npm packages including `@agentique.io/uploader`, action usage reference, badge/readback documentation, and `agentique.io` public links remain Go for existing advertised channels. Parser/variant source changes are Go for the coordinated `0.2.0` package-release claim. Catalog/download source changes are Go for the coordinated `0.2.0` package-release claim, and owner-approved disposable byte-transfer smoke is recorded. Authenticated review-session access and final resource publication remain platform-owned and account/token gated. GitHub Marketplace-style promotion remains separate from this source/package release.
