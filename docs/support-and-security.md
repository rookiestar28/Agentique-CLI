# Support And Security

Public companion repositories should keep support channels narrow and safe.

## Support Routing

Docs and tooling questions can use public issues.

Parser/variant metadata questions can use public issues when examples are synthetic or already public and do not include raw imported content, parser inputs, parser outputs, account data, credentials, or resource contents that should not be public.

Uploader CLI questions about local validation, command usage, dry-run import or variant output, or source behavior can use public issues when they do not include tokens, upload session URLs, transfer URLs, account identifiers, raw imported content, parser evidence copied from private sources, or resource contents that should not be public.

Resource disputes go to agentique.io support.

Abuse and moderation reports use the agentique.io report flow.

Vulnerabilities use the private security disclosure channel.

## Reporting Guidance

Do not post secrets, exploit details, private account data, personal data, moderation evidence, uploader tokens, upload session URLs, transfer URLs, raw parser inputs, raw parser outputs, raw imported content, or unsafe resource contents in public issues. Use the private or platform-owned route for sensitive reports.

## Review Routing

Repository changes follow `CODEOWNERS` and the review routing guide:

- Docs and governance changes require public-safe wording review.
- Schema and starter changes require contract, parser/variant state, source-only wording, and package-integrity review.
- Validator, action, workflow, release, package, and readback changes require owner review before public release.
- Uploader source and publication changes require review of auth redaction, parser/variant dry-run wording, review-only wording, registry state, and live upload availability claims.
- Security-sensitive reports stay outside public issues.

## Claims Boundary

Local validation is not platform approval. Local validation is not safety certification. Parser/variant dry-runs are local preparation evidence only. Public scan, trust, parser, and variant readback are platform-owned states from `agentique.io`, not independent guarantees from a companion repository.
