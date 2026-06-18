# npm Package Publishing Guide

This guide defines the public, repeatable publishing process for the Agentique companion packages under the `@agentique.io` npm scope.

It is intentionally operational. It covers the release path, package-level npm settings, fallback rules, failure diagnosis, and post-publish evidence required before advertising a newly published package set.

## Package Set

Coordinated companion releases publish these packages together unless a package has an explicitly independent patch:

- `@agentique.io/schemas`
- `@agentique.io/validator`
- `@agentique.io/action`
- `@agentique.io/readback`
- `@agentique.io/uploader`

Keep package versions aligned for coordinated releases. Publish `uploader` last when it depends on newly published companion package versions.

## Default Release Path

The preferred release path is the checked-in manual GitHub Actions publishing workflow:

1. Prepare the coordinated version in package manifests and lockfiles.
2. Update release state in `docs/release-go-no-go.json`.
3. Run local release gates.
4. Merge the release candidate to `main` through a pull request.
5. Confirm the hosted Release Check matrix passes on `main`.
6. Run the manual `Publish Packages` workflow with `confirm=publish`.
7. Verify post-publish registry readback and registry install smoke.
8. Update release evidence and public docs after publication.

Trusted Publishing should be used where possible because it avoids long-lived npm tokens and can produce package provenance.

## Required Local Gates

Run these before publishing or opening a release PR:

```bash
npm test
npm run workflow:check
npm run validate:starters
npm run release:check
npm run pack:dry-run
npm run registry:readback
npm run install:smoke
npm run urls:check
npm run release:go-no-go
npm audit --omit=dev
npm --prefix packages/validator audit --omit=dev
npm --prefix packages/action audit --omit=dev
npm --prefix packages/readback audit --omit=dev
python -m detect_secrets scan --all-files --exclude-files '(\.git/|\.git\\|node_modules/|node_modules\\)'
git diff --check
```

For pre-publish package versions, `npm run registry:readback` should report pending packages as not found. After publication, the same command should report published versions.

## npm Package Settings

Each published package must be public:

```powershell
npm access get status "@agentique.io/schemas" --json
```

PowerShell treats unquoted `@scope` values as splatting syntax, so quote scoped package names.

For token-based fallback publishing, each package must also allow automation-token publication:

```powershell
npm access set mfa=automation "@agentique.io/schemas"
npm access set mfa=automation "@agentique.io/validator"
npm access set mfa=automation "@agentique.io/action"
npm access set mfa=automation "@agentique.io/readback"
npm access set mfa=automation "@agentique.io/uploader"
```

This package-level setting is distinct from token metadata. A granular token can have `bypass_2fa=true` and still fail to publish when the package MFA policy has not been applied as `mfa=automation`.

## Token Fallback Rules

Token fallback is a recovery path, not the default workflow.

Use fallback only when:

- hosted validation has already passed,
- the package contents and versions have been reviewed,
- the npm package settings are confirmed,
- the token is granular, short-lived when possible, read/write, and has 2FA bypass enabled,
- the release evidence records that provenance was not generated from the GitHub OIDC workflow.

Never commit tokens, print tokens in logs, add token fallback to workflow YAML, or store long-lived package tokens in repository secrets for this release path.

Validate the local npm identity without exposing the token:

```powershell
npm whoami --registry=https://registry.npmjs.org/
npm token list --json --registry=https://registry.npmjs.org/
```

## Publishing Order

Publish packages in this order:

1. `schemas`
2. `validator`
3. `action`
4. `readback`
5. `uploader`

The uploader package is last because it can depend on newly published validator and readback versions.

Fallback publish commands:

```powershell
npm publish --access public --provenance=false
```

Run the command from each package directory. Use `--provenance=false` for local token fallback because provenance is only expected from the GitHub OIDC workflow.

## Failure Diagnosis

### `Two-factor authentication is required ... but an automation token was specified`

This usually means the package-level MFA policy is not allowing automation-token publishing, even if the token itself has bypass 2FA enabled.

Fix:

```powershell
npm access set mfa=automation "@agentique.io/schemas"
```

Repeat for every package in the coordinated release set.

### `404 Not Found - PUT ... could not be found or you do not have permission`

In the GitHub Actions Trusted Publishing path, this usually means npm Trusted Publisher settings do not authorize the repository, workflow file, package, or package path.

Check that the npm Trusted Publisher configuration matches:

- repository: `rookiestar28/Agentique-CLI`
- workflow: `.github/workflows/publish-packages.yml`
- package: the exact `@agentique.io/*` package being published

Do not advertise or tag the release until registry readback verifies the intended version.

### `npm access list packages` Returns E403

`npm whoami` only proves the credential can identify an account. It does not prove the credential can manage organization/package access settings.

Use package-specific commands instead:

```powershell
npm access get status "@agentique.io/schemas" --json
```

Use browser settings or an account session with sufficient npm permissions for package access management.

## Post-Publish Verification

After all packages are published, run:

```powershell
$env:AGENTIQUE_REGISTRY_MODE='published'
$env:AGENTIQUE_PACKAGE_VERSION='<version>'
npm run registry:readback
```

Then run registry install smoke:

```powershell
$env:AGENTIQUE_INSTALL_SMOKE_MODE='registry'
npm run install:smoke
```

Both must pass before package changes are advertised.

## Closeout

After publication and verification:

1. Move the package version from `pendingPackages` to `publishedPackages` in `docs/release-go-no-go.json`.
2. Keep scoped release decisions as Go only for the claims actually supported by evidence.
3. Update `docs/release-go-no-go.md`, `docs/release-evidence.md`, `docs/package-release-provenance.md`, `docs/release-checklist.md`, and public package README files.
4. Record whether publication used Trusted Publishing or local token fallback.
5. Record registry readback and registry install smoke results.
6. Re-run release checks and content checks.
7. Merge closeout documentation through a protected-branch pull request.

Do not create public tags or release notes before the closeout evidence is accurate and public-safe.
