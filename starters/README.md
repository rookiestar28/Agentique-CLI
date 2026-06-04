# Agentique Starters

This directory contains static examples for preparing public Agentique resource packages.

Each starter includes a `manifest.json` plus Markdown or JSON files that can be inspected before upload. The manifest describes the public projection of the resource and the files that belong to the package.

Upload, platform scan, moderation, publication, distribution state, and readback are handled by `agentique.io`. Local starter validation only checks package shape and does not approve a resource for publication.

Newer starters include contract examples for surfacing hints, permission and risk declarations, output shape boundaries, and bounded context bundles. These fields are descriptive package metadata so reviewers and integrators can see why a resource should be selected, what it can access, and how much context it is expected to consume.

## Starters

- `agent-assistant` - agent profile and operating notes.
- `skill-source-summarizer` - reusable skill description.
- `workflow-evidence-review` - workflow template for reviewing public sources.
- `tool-mcp-listing` - public listing metadata for a tool or MCP-style endpoint.
- `resource-bundle-curation` - bundled guide and manifest example.
- `non-static-lane-descriptors` - static descriptors for agent cards, external endpoints, downloadable packages, tool-enabled packages, static skills/workflows, and hosted-deferred records.

Keep starter files static and inspectable. Do not add restricted auth material, personal data, local machine paths, generated archives, or executable payloads.

## Non-Static Lane Descriptors

The `non-static-lane-descriptors` starter provides static JSON examples for the lane types described in [../docs/non-static-lane-examples.md](../docs/non-static-lane-examples.md). These descriptors are local preparation examples only. They do not route live endpoint work, run package content, provide hosting, publish resources, approve submissions, provide safety guarantees, or decide moderation outcomes.

## Source URL Policy

Starter `source.url` values may use placeholder hosts such as `example.com` or placeholder GitHub owners such as `agentique-examples` only while public release remains blocked. Before release is unblocked, every starter source URL must be replaced with a final owner-approved HTTPS URL.

Release checks fail release-ready runs when unresolved placeholder source URLs remain. Local starter validation can still pass during blocked-release preparation because it validates package shape, not final URL ownership.
