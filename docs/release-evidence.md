# Release Evidence

This file records public-safe release evidence for the companion repository. Do not include tokens, cookies, private account data, local filesystem paths, or sensitive repository settings.

## Evidence Snapshot

- Latest local source validation: 2026-06-18
- Environment: Windows PowerShell
- Node.js: v24.13.1
- npm: 11.8.0
- Git: 2.53.0.windows.1
- Latest local validation branch: dev
- Public repository: `https://github.com/rookiestar28/Agentique`
- Commit evidence: hosted CI is tracked through GitHub Actions for the latest pushed public release candidate. Latest recorded public evidence is the successful hosted Release Check for the latest pushed release candidate. Later pushes require a fresh hosted run before downstream release claims.

## Local Checks

| Check | Result | Evidence |
|---|---:|---|
| Dependency install | Pass | `npm ci --ignore-scripts` completed with 0 vulnerabilities. |
| Secret scan | Pass | `python -m detect_secrets scan --all-files --exclude-files '(\\.git/|\\.git\\\\|node_modules/|node_modules\\\\)'` completed with empty `results`. |
| Tests | Pass | `npm test` passed 214 tests across root scripts, validator, action, readback, and uploader. |
| Starter validation | Pass | `npm run validate:starters` passed 10 starter packages. |
| Release allowlist and public-content check | Pass | `npm run release:check` passed. |
| Workflow posture | Pass | `npm run workflow:check` passed. |
| Package dry run | Pass | `npm run pack:dry-run` passed schemas, validator, action, readback, and uploader package checks. |
| Parser/variant, agent-native, catalog/download, portable profile, and graph/block package surface smoke | Pass | `npm run install:smoke` installs locally packed tarballs with lifecycle scripts disabled and checks parser-variant, agent-native, portable-profile, generated-adapter manifest, graph/block, block manifest, execution ledger, workspace artifact, API drift, and generated block fixture schemas; readback parser/variant and agent-native exports; readback catalog/download exports; uploader import/variant/agent-native help; uploader catalog help; uploader direct-download help; validator portable profile help; and validator graph/block help. |
| Registry readback | Pass | `AGENTIQUE_REGISTRY_MODE=published AGENTIQUE_PACKAGE_VERSION=0.2.1 npm run registry:readback` confirms all five companion packages are published at `0.2.1`. |
| URL inventory check | Pass | `npm run urls:check` passed. |
| Go/no-go check | Pass | `npm run release:go-no-go` passed with existing advertised channels as Go, catalog/download plus agent-native patch candidates owner-approved for the coordinated `0.2.1` release workflow, and portable profile plus graph/block package publication claims scoped No-Go pending hosted release and registry evidence. |
| Package publication release gate refresh | Pass | Hosted Release Check passed on `main`, GitHub Actions publication completed in run `27432379534`, registry readback passed for all `0.2.1` packages, and registry install smoke passed. |
| Root production dependency audit | Pass | `npm audit --omit=dev` found 0 vulnerabilities. |
| Validator production dependency audit | Pass | `npm --prefix packages/validator audit --omit=dev` found 0 vulnerabilities. |
| Action production dependency audit | Pass | `npm --prefix packages/action audit --omit=dev` found 0 vulnerabilities. |
| Readback production dependency audit | Pass | `npm --prefix packages/readback audit --omit=dev` found 0 vulnerabilities. |
| Uploader production dependency audit | Pass | Uploader depends on `@agentique.io/readback@^0.2.1` and `@agentique.io/validator@^0.2.1`; the publish workflow verifies those dependency versions from npm, generates a transient lockfile for audit, removes it before publication, and runs `npm --prefix packages/uploader audit --omit=dev`. |

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

Uploader source alignment and npm package checks were refreshed on 2026-06-13.

Current command-line finding:

- `@agentique.io/uploader` is published at version `0.2.1`.
- Uploader CLI source includes redacted auth status, upload-plan evidence, creator checkpoint readiness, local draft output, local patch/delta output, review-only submit/status helpers, bearer/storage separation, bounded transfer retry, and server completion verification checks.
- This source revision additionally includes GET-only catalog list/detail/download-metadata commands and a direct byte-download command with explicit output path, no auth forwarding, signed URL redaction, no absolute output path in CLI output, redirect controls, max-byte checks, digest checks, and no install/extract/open/execute behavior.
- `@agentique.io/uploader` is included in root tests, package dry-run, publish workflow validation, and root/workspace production dependency audit.
- npm registry readback for `@agentique.io/uploader` returns published version `0.2.1`, so the package page remains approved for advertising.
- Authenticated review-session access and final resource publication remain platform and account/token gated. Package checks do not advertise live publication or platform approval.
- Final uploader publication closeout is Go for npm package availability after owner-approved publication, hosted CI evidence, npm registry readback, and clean install smoke from npm.

Current documentation now describes registry trust metadata, creator checkpoints, trust readback, local draft output, patch/delta output, and the coordinated `0.2.1` package boundary. Local release gates pass for this source revision. Owner approval to use the manual GitHub Actions package publishing workflow is recorded, and all companion packages are published at `0.2.1`.

## Parser And Variant Branch-Local Evidence

This source revision includes public parser/variant schemas, schema fixtures, validator summaries, readback projection helpers, uploader import-plan and variant-plan dry-runs, and a synthetic source-only starter package. These package surfaces are included in the coordinated package releases after hosted release checks, GitHub Actions publication, and registry readback, and remain present in the `0.2.1` package set.

Parser/variant evidence remains limited to static metadata, local dry-runs, and read-only public projection helpers. It does not advertise platform-managed validation, hosted execution, platform download availability, runtime compatibility, approval, publication, or safety outcomes.

## Agent-Native Branch-Local Evidence

This source revision includes public agent-native schema fixtures, validator summaries, readback projection helpers, uploader agent-native-plan dry-runs, and a synthetic local-review starter package. All companion packages are published at `0.2.1`.

Agent-native evidence remains limited to public namespace, non-certifying provenance labels, source-only or guidance-only install guidance, public boundary labels, local resolver intent, local dry-runs, and read-only public projection helpers. It does not advertise live resolver availability, direct install support, credential handling, runtime compatibility, approval, publication, or safety outcomes.

## Parser/Variant And Agent-Native Package Surface Evidence

Current release tooling packs schemas, validator, action, readback, and uploader packages, then installs the local tarballs with lifecycle scripts disabled. The install smoke checks that parser/variant and agent-native package surfaces survive packaging: `parser-variant.schema.json` and `agent-native.schema.json` are present in the schemas package, `normalizeParserVariantReadback()` and `normalizeAgentNativeReadback()` are exported from readback, and uploader help exposes `upload import-plan`, `upload variant-plan`, and `upload agent-native-plan`.

Registry readback proves schemas, validator, action, readback, and uploader at `0.2.1`. Parser/variant source changes are published in the coordinated package releases after owner-approved GitHub Actions publication, hosted Release Check, full registry readback, registry install smoke, and documented rollback/unpublish procedure evidence.

Parser/variant package publication is currently Go for the coordinated package-release claim.

## Catalog And Download Patch-Candidate Evidence

This source revision includes readback catalog list/detail/download-metadata helpers, catalog metadata normalizers, a safe direct-download utility, uploader catalog read commands, uploader direct download, and package-surface smoke coverage for installed tarballs.

This source revision additionally includes canonical-host live envelope compatibility and an unauthenticated POST ticket byte-transfer path. These changes are published in the coordinated `0.2.1` patch package set.

Catalog/download evidence includes local source behavior, local tests, installed-tarball smoke, registry install smoke for `0.2.1`, the live metadata checks below, and owner-approved disposable byte-transfer smoke. It does not approve resources, certify safety, install or execute downloaded content, or replace platform review.

Registry readback proves schemas, validator, action, readback, and uploader at published version `0.2.1`. Catalog/download patch publication completed through the manual GitHub Actions registry provenance workflow; registry readback, clean install smoke for the full patch set, rollback/unpublish evidence, and branch cleanup are recorded.

## Catalog And Download Live Metadata Evidence

GET-only unauthenticated live metadata smoke was refreshed on 2026-06-07.

| Endpoint class | Result |
|---|---|
| Non-canonical public resource list URL | HTTP 308 redirect to the canonical `www.agentique.io` URL. |
| Canonical public resource list URL | HTTP 200 JSON with a read-only list response and page metadata. |
| First listed public resource detail URL | HTTP 200 JSON with read-only resource detail metadata. |
| First listed public resource download-metadata URL | HTTP 200 JSON with available download metadata. |
| Direct byte-transfer smoke | Pass | Owner-approved disposable smoke on 2026-06-07 selected a public catalog resource, read public metadata without auth, used the declared unauthenticated POST ticket path, did not print or record the server-provided byte URL, completed byte transfer, verified byte count and local SHA-256, deleted the local artifact, and did not open, extract, or execute the artifact. |

This evidence supports catalog, download-metadata, and bounded disposable byte-transfer availability inputs for the release decision. It does not certify content safety, approve resources, install or execute downloaded content, or guarantee every public resource is downloadable.

## Catalog And Download Closeout Evidence

Source closeout evidence is complete for local preparation only:

- Readback SDK catalog and download-metadata helpers are covered by package tests.
- The safe direct-download utility is covered by package tests with path, overwrite, redirect, size, digest, cleanup, and token-forwarding boundaries.
- Uploader catalog and direct-download commands are covered by package tests.
- Installed-tarball smoke covers readback catalog/download exports and uploader catalog/direct-download help surfaces.
- Registry readback proves schemas, validator, action, readback, and uploader at published version `0.2.1`.
- Owner-approved disposable byte-transfer smoke passed for a public catalog resource; size matched CLI byte count, local SHA-256 was computed, no auth was used, the server-provided byte URL was not logged, and the artifact was not opened, extracted, or executed.
- Live metadata smoke proves the public list/detail/download-metadata endpoints for the sampled public resource.

Current closeout evidence includes local tests, installed-tarball smoke, registry readback for the published `0.2.1` package set, owner-approved disposable byte-transfer smoke, owner approval to publish, GitHub Actions registry provenance evidence, clean install smoke for the full patch set, rollback/unpublish evidence, and branch cleanup.

## Agent-Native Patch-Candidate Closeout Evidence

Source closeout evidence is complete for local preparation only:

- Agent-native schema contracts are included in the schemas package dry-run.
- Validator tests cover agent-native metadata summaries and finding families.
- Readback package tests cover agent-native projection helpers and badge states.
- Uploader package tests cover the local `agent-native-plan` dry-run command.
- Installed-tarball smoke covers `agent-native.schema.json`, `normalizeAgentNativeReadback()`, and uploader `agent-native-plan` help.
- Registry readback proves schemas, validator, action, readback, and uploader at published version `0.2.1`.
- Release go/no-go records agent-native patch publication as owner-approved for the coordinated `0.2.1` release workflow while preserving resolver, direct-install, runtime, approval, and safety-claim No-Go boundaries.

Current closeout evidence includes local tests, starter validation, release checks, installed-tarball smoke, package dry-run, URL inventory, registry readback for the published `0.2.1` package set, owner approval to publish, GitHub Actions registry provenance evidence, clean install smoke for the full patch set, rollback evidence, and branch cleanup.

## Portable Profile Source Evidence

This source revision includes public portable profile schemas, generated adapter manifest schemas, validator CLI commands for descriptor-only generation, drift validation, command/profile parity, deferred-risk ledger reporting, and sandbox-gated measurement preflight, plus a static starter package.

Portable profile evidence remains limited to local preparation and package-surface smoke. It does not advertise package publication for these changes, runtime compatibility, direct install support, resource approval, safety certification, lifecycle-hook trust, or platform review replacement.

Current source evidence:

- `npm --prefix packages/validator test` passes 62 tests including portable schema, generator, drift, parity, debt ledger, and sandbox preflight coverage.
- `npm run validate:starters` passes 10 starter packages including `portable-profile-review`.
- `npm run install:smoke` packs schemas and validator tarballs with lifecycle scripts disabled, then confirms `portable-profile.schema.json`, `generated-adapter-manifest.schema.json`, and validator portable profile help survive packaging.
- `npm run release:go-no-go` records portable profile package publication as scoped No-Go until hosted release, package publication, registry readback, and registry install smoke evidence exist.

## Graph Block Source Evidence

This source revision includes public graph/block schemas, block manifest schemas, execution ledger schemas, workspace artifact metadata schemas, API drift schemas, generated block fixture manifest schemas, validator CLI commands, and a static starter package.

Graph/block evidence remains limited to local preparation and package-surface smoke. It does not advertise package publication for these changes, graph execution, block runtime loading, artifact byte transfer, service startup, user agent configuration mutation, resource approval, safety certification, runtime compatibility, or platform review replacement.

Current source evidence:

- `npm --prefix packages/validator test` passes 68 tests including graph/block schema validation, bundle validate/import/export commands, fixture generation, diagnostic ledger inspection, replay diagnostics, artifact metadata scanning, and API drift checks.
- `npm run validate:starters` passes 10 starter packages including `graph-block-review`.
- `npm run install:smoke` packs schemas and validator tarballs with lifecycle scripts disabled, then confirms graph/block schemas and validator graph/block help survive packaging.
- `npm run release:go-no-go` records graph/block package publication and runtime claims as scoped No-Go until hosted release, package publication, registry readback, and registry install smoke evidence exist.

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
- `@agentique.io/schemas` is published at version `0.2.1`.
- `@agentique.io/validator` is published at version `0.2.1`.
- `@agentique.io/action` is published at version `0.2.1`.
- `@agentique.io/readback` is published at version `0.2.1`.
- `@agentique.io/uploader` is published at version `0.2.1`.
- Package manifests include public access and provenance publish configuration.
- Package dry-run passed for schemas, validator, action, readback, and uploader packages.
- npm `11.14.1` registry readback and install smoke passed for the dotted `@agentique.io` scope.
- npm registry readback on 2026-06-13 confirmed schemas, validator, action, readback, and uploader at target version `0.2.1`.
- Clean install smoke from the npm registry package set passed for `@agentique.io/*@0.2.1`.
- Clean install smoke passed with `--ignore-scripts`.
- Readback import smoke passed.
- Validator bin smoke passed against the public `agent-assistant` starter with installed schemas.

Publication note:

- The first package release used an owner-approved maintainer-approved publication path after validation.
- Owner approval is recorded to use the checked-in manual GitHub Actions package publishing workflow for the coordinated package release target, `0.2.1`. Publish run `27431818806` partially published schemas, validator, action, and readback before failing at uploader dependency audit. Retry run `27432379534` ran on `main`, published uploader, verified full registry readback for `0.2.1`, and passed clean install smoke.

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

The source repository, published npm packages, action usage reference,
badge/readback documentation, and `agentique.io` public links remain Go for
existing advertised channels. The published package set includes
`@agentique.io/uploader` at `0.2.1`.

Parser/variant source changes are Go for the coordinated package-release claim.
Catalog/download behavior already published in `0.2.0` remains limited to that
release evidence. The canonical-host live envelope, POST-ticket byte-transfer
compatibility, and agent-native local-review/readback-helper surfaces in this
source revision are published in the coordinated `0.2.1` package set.
Portable profile and graph/block source changes remain scoped No-Go for package
publication and runtime claims until fresh hosted release and registry evidence
exist.
Authenticated review-session access and final resource publication remain
platform-owned and account/token gated. GitHub Marketplace-style promotion
remains separate from this source/package release.
