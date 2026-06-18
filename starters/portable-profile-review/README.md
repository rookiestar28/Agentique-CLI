# Portable Profile Review Starter

This starter shows a static portable profile plus a generated descriptor-only adapter manifest for local review.

The portable profile describes a canonical instruction source, profile and mode aliases, command metadata, target host support, provenance, license metadata, blocked states, and public redaction boundaries. The generated adapter output is descriptor-only. It does not install files into an agent client, run package content, execute lifecycle hooks, call network services, or change user configuration.

Validate this starter from the repository root:

```bash
node packages/validator/src/cli.mjs validate starters/portable-profile-review --schemas-dir schemas --json
```

Regenerate the descriptor-only adapter into an explicit output directory:

```bash
node packages/validator/src/cli.mjs portable-generate starters/portable-profile-review/portable/portable-profile.json --target codex-skill --output .tmp/portable-profile-output --schemas-dir schemas --json
```

Use drift and parity checks on generated outputs before copying descriptor text into another review workflow. Local checks are preparation evidence only.
