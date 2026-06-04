# Non-Static Lane Examples

Agentique resource packages can describe more than one public resource shape. This repository keeps those examples static so creators can inspect and validate them before using the platform-owned upload flow.

The starter at `starters/non-static-lane-descriptors` contains descriptor examples for the lanes below.

| Lane | Example file | Distribution mode | Local validation covers | Important boundary |
| --- | --- | --- | --- | --- |
| Agent card or descriptor | `lanes/agent-card-descriptor.json` | `metadata_view` | Manifest shape, package inventory, hashes, paths, and secret-like content. | A descriptor is not a hosted agent runtime. |
| External endpoint registration | `lanes/external-endpoint-registration.json` | `external_project` | Static endpoint metadata and package safety checks. | The local package does not proxy requests or verify endpoint behavior. |
| Downloadable package | `lanes/downloadable-package.json` | `package_download` | File inventory, hashes, paths, and package content boundaries. | Download availability is a platform publication state. |
| Tool-enabled package | `lanes/tool-enabled-package.json` | `metadata_view` | Static capability metadata and package safety checks. | Local validation does not execute tool calls. |
| Static skill or workflow | `lanes/static-skill-workflow.json` | `package_download` | Static package files plus optional skill/workflow metadata contracts. | Local validation is not approval or a safety guarantee. |
| Hosted-deferred record | `lanes/hosted-deferred-record.json` | `readback_only` | Static readback descriptor shape and package safety checks. | Hosted state is authoritative only when exposed by platform readback. |

## Validate The Examples

```bash
npm run validate:starters
```

Validate only this starter:

```bash
node packages/validator/src/cli.mjs validate starters/non-static-lane-descriptors --schemas-dir schemas --json
```

## What These Examples Do Not Do

These examples do not publish resources, approve resources, provide safety guarantees, provide hosting, run package content, route external endpoint work, moderate submissions, or prove live endpoint behavior.

Platform upload, scan, review, moderation, publication state, distribution state, and public readback remain owned by `agentique.io`.
