# Public URL Inventory

This inventory tracks public links that must exist before the companion repository, packages, action, schemas, docs, badges, or platform links are advertised.

Current status: source repository, schema, documentation, package registry pages, action usage reference, badge/readback documentation, and `agentique.io` public links are approved for advertising after publication and smoke testing.

## Required URL Classes

- Public repository URL
- Public repository URL: approved.
- Public schema URL base: approved.
- Public documentation URL: approved.
- `agentique.io` companion landing link: approved.
- `agentique.io` read-only public readback endpoint: approved.
- Package registry pages: approved.
- Action usage reference: approved.
- Badge example URL: approved.

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

When downstream package, action, or badge URLs are advertised, release checks must fail until every advertised URL is a final owner-approved HTTPS URL.
