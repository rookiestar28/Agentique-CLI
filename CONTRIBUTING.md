# Contributing

Contributions should improve public documentation for Agentique resource preparation.

Do not submit credentials, private user data, local machine paths, non-public operating details, non-public project records, or unpublished platform evidence. Contributions that include unsafe disclosure material should be rejected or moved to the private security route.

Local documentation and examples must not describe validation as platform approval or safety certification.

## Review Expectations

- Documentation changes should stay public-safe and avoid platform-owned investigation details.
- Schema changes should describe public projections only.
- Starter changes must keep package hashes current and must pass starter validation.
- Validator, action, readback, workflow, release, and package metadata changes require owner review before public release.
- Public pull requests must not include secrets, exploit details, private data, unsafe resource contents, or unpublished platform evidence.

Run the local checks before requesting review:

```bash
npm test
npm run validate:starters
npm run release:check
npm audit --omit=dev
```
