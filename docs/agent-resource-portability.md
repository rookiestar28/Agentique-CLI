# Agent Resource Portability

Agentique portable profiles are static metadata files for reviewing how one canonical instruction source can be projected into descriptor-only target formats.

The portability tools in this repository are local preparation tools. They validate schemas, generate descriptor-only files into explicit output directories, check drift, check command/profile parity, scan deferred-risk markers, and run an opt-in measurement-only evaluation preflight.

They do not install files into agent clients, execute package content, trust lifecycle hooks, start services, call private APIs, publish resources, approve submissions, certify safety, or mutate user configuration.

## Files

- `portable/portable-profile.json` describes the canonical source, profile modes, command surface, target hosts, provenance, license, blocked states, and public redaction boundaries.
- `portable/generated-adapter-manifest.json` records generator version, source digest, target, generated file digests, invariant phrases, command mappings, and no-execution safety flags.
- Descriptor files such as `codex-skill/SKILL.md` are static review artifacts.

## Commands

Generate descriptor-only output into an explicit directory:

```bash
node packages/validator/src/cli.mjs portable-generate starters/portable-profile-review/portable/portable-profile.json --target codex-skill --output .tmp/portable-profile-output --schemas-dir schemas --json
```

Check generated output drift:

```bash
node packages/validator/src/cli.mjs portable-drift starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
```

Check command/profile parity:

```bash
node packages/validator/src/cli.mjs portable-parity starters/portable-profile-review/portable/portable-profile.json --manifest .tmp/portable-profile-output/portable/generated-adapter-manifest.json --output-dir .tmp/portable-profile-output --schemas-dir schemas --json
```

Scan explicit deferred-risk markers:

```bash
node packages/validator/src/cli.mjs debt-ledger starters/portable-profile-review --json
```

Run the opt-in measurement-only evaluation preflight:

```bash
node packages/validator/src/cli.mjs portable-eval starters/portable-profile-review/portable/portable-profile.json --output-dir .tmp/portable-profile-eval --sandbox no-exec-temp --schemas-dir schemas --json
```

The evaluation command returns No-Go unless the sandbox flag is explicit. Its report is measurement-only and does not create correctness, runtime, publication, or safety claims.

## Starter

See [../starters/portable-profile-review](../starters/portable-profile-review) for a static starter that validates a portable profile, generated adapter manifest, and descriptor-only target file.

## Release Status

Portable profile source changes are local preparation surfaces in this source revision and are prepared as part of the coordinated `0.2.2` package candidate. Public package-change advertising, runtime claims, and direct-install claims remain disabled until hosted publication, registry readback, and clean registry install smoke confirm `0.2.2`.
