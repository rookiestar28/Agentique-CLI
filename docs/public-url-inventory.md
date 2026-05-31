# Public URL Inventory

This inventory tracks public links that must exist before the companion repository, packages, action, schemas, docs, badges, or platform links are advertised.

Current status: the public repository URL is approved. Downstream package, action, schema, documentation, badge, and platform link advertising remains blocked until final URLs, owner approval, and platform launch evidence are recorded.

## Required URL Classes

- Public repository URL
- Package registry pages
- Action usage reference
- Public schema URL base
- Public documentation URL
- Badge example URL
- `agentique.io` companion landing link
- `agentique.io` read-only public readback endpoint

## Release Rule

Do not advertise an entry until:

- the URL is final and HTTPS
- owner approval is recorded
- the URL passes link validation
- the target content is public-safe
- platform launch evidence required for `agentique.io` links has been accepted

Local validation is preparation only. It does not approve publication or certify safety.

## Starter Source URL Rule

Starter manifests may keep placeholder source URLs only while this inventory keeps public release blocked. Placeholder source URLs include `example.com` hosts and placeholder GitHub owners such as `agentique-examples`.

When public URLs are required or release blocking is removed, release checks must fail until every starter source URL is a final owner-approved HTTPS URL.
