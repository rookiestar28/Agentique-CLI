# Graph Block Review

Graph/block review files are static metadata for reviewing graph topology, block contracts, diagnostic ledger state, workspace artifact metadata, API drift metadata, and generated block fixture manifests.

The graph/block tools in this repository are local preparation tools. They validate schemas, check no-execution boundaries, write descriptor-only import/export plans into explicit output directories, generate static block fixtures, inspect diagnostic ledgers, write replay diagnostics, scan artifact metadata, and compare API drift metadata.

They do not install packages, execute graph nodes, load block runtimes, fetch artifact bytes, start services, generate unreviewed code, call private APIs, publish resources, approve submissions, certify safety, prove runtime compatibility, or mutate user configuration.

## Files

- `graph/graph-block-bundle.json` describes descriptor-only graph topology, blocks, nodes, edges, schema refs, manifests, and no-execution safety flags.
- `blocks/block-manifest.json` describes static block metadata, input/output schema refs, compatibility, fixtures, and lifecycle state.
- `ledger/execution-ledger.json` records diagnostic-only event state, replay-safe flags, bounded redacted logs, artifact refs, and terminal state.
- `artifacts/workspace-artifact.json` records public artifact metadata such as virtual URI shape, MIME, size, checksum, scan state, retention, and signed-download metadata.
- `api/api-drift.json` records approved snapshot digests, generated metadata digests, mock coverage, public projection posture, and no-service-start/no-code-generation flags.
- `fixtures/generated-block-fixtures-manifest.json` records generated fixture files, digests, generator metadata, and no-execution safety flags.

## Commands

Validate a graph/block bundle:

```bash
node packages/validator/src/cli.mjs bundle-validate starters/graph-block-review/graph/graph-block-bundle.json --schemas-dir schemas --json
```

Write descriptor-only import and export plans:

```bash
node packages/validator/src/cli.mjs bundle-import-plan starters/graph-block-review/graph/graph-block-bundle.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
node packages/validator/src/cli.mjs bundle-export-plan starters/graph-block-review/graph/graph-block-bundle.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
```

Generate static block fixtures:

```bash
node packages/validator/src/cli.mjs block-fixtures-generate .tmp/graph-block-fixtures --schemas-dir schemas --json
```

Inspect diagnostic ledger metadata and write replay diagnostics:

```bash
node packages/validator/src/cli.mjs ledger-inspect starters/graph-block-review/ledger/execution-ledger.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs ledger-replay-diagnostics starters/graph-block-review/ledger/execution-ledger.json --output-dir .tmp/graph-block-output --schemas-dir schemas --json
```

Scan artifact metadata and API drift metadata:

```bash
node packages/validator/src/cli.mjs artifact-scan starters/graph-block-review/artifacts/workspace-artifact.json --schemas-dir schemas --json
node packages/validator/src/cli.mjs api-drift starters/graph-block-review/api/api-drift.json --schemas-dir schemas --json
```

## Starter

See [../starters/graph-block-review](../starters/graph-block-review) for a static starter that validates graph/block bundle metadata, block manifests, diagnostic ledgers, workspace artifact metadata, API drift metadata, and generated fixture manifests.

## Release Status

Graph/block source changes are local preparation surfaces in this source revision and are prepared as part of the coordinated `0.2.2` package candidate. Public package-change advertising, runtime claims, and direct-install claims remain disabled until hosted publication, registry readback, and clean registry install smoke confirm `0.2.2`.
