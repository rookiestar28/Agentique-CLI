# Public URL Inventory

This inventory tracks public links that must exist before the companion repository, packages, action, schemas, docs, badges, or platform links are advertised.

Current status: source repository, schema, documentation, approved package registry pages, action usage reference, badge/readback documentation, and `agentique.io` public links are approved for advertising after publication and smoke testing. The uploader package page is tracked as pending and must not be advertised yet.

## Approved URL Classes

- Public repository URL: approved.
- Public schema URL base: approved.
- Public documentation URL: approved.
- `agentique.io` companion landing link: approved.
- `agentique.io` read-only public readback endpoint: approved.
- Package registry pages for `@agentique.io/schemas`, `@agentique.io/validator`, `@agentique.io/action`, and `@agentique.io/readback`: approved.
- Package registry page for `@agentique.io/uploader`: pending and non-advertised.
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

## Starter And Example URL Rule

Starter manifest `source.url` values must use final owner-approved HTTPS URLs while this inventory is unblocked. Placeholder source URLs include `example.com` hosts and placeholder GitHub owners such as `agentique-examples`.

Example content files may still show obviously non-production example URLs when the field is part of a sample payload, but those URLs must not be advertised as working public endpoints.

When package, action, badge, or platform URLs are advertised, release checks must fail until every advertised URL is a final owner-approved HTTPS URL.

The stricter all-public-url mode applies only after all pending channels are approved for advertising. Until uploader publication is closed, normal URL inventory checks allow the pending uploader package page with `advertise: false`.
