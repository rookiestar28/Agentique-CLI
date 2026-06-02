# Launch And Rollback

Use this procedure before and after any public companion repository release, package release, or public link expansion.

## Launch Gate

Public launch requires:

- Owner approval for the exact repository and release.
- Release checklist completed.
- Release manifest check passed.
- Public-content scan passed.
- Secret scan passed.
- Relevant tests and production dependency audit passed.
- Support and security routing reviewed.
- Final public URLs reviewed before links are added.

Do not publish new package versions, badges, action references, or documentation links until these checks pass.

## Link Rules

- Link only to reviewed public repositories, releases, or package pages.
- Do not link to local workspaces, private repositories, drafts, or temporary artifacts.
- Link canonical examples to platform resource pages only after the resources are actually published.
- Keep platform pages authoritative for upload, scan, review, moderation, publication, distribution state, and readback.

## Support And Security Routing

- Documentation and tooling questions can use public issues.
- Vulnerabilities use the private security disclosure route.
- Resource disputes, abuse reports, moderation matters, and account problems use platform-owned support or report flows.
- Do not ask users to post secrets, exploit details, private account data, personal data, moderation material, or unsafe resource contents in public issues.

## Rollback

If a release or link is wrong:

1. Remove or disable the public link.
2. Deprecate or withdraw affected package versions when the registry allows it.
3. Publish a corrected release when the content is safe to keep public.
4. Disable affected badge or action references in docs.
5. Open a private security report if sensitive material may have been exposed.
6. Rotate any exposed credential immediately.
7. Recreate clean public history if private material entered a repository before launch.

Rollback should prefer a small corrective change when no sensitive material was exposed. Delete and recreate only when sensitive or private project material entered public history.
