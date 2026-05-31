## Summary

Describe the public documentation change.

## Safety checklist

- [ ] No credentials, private user data, or local machine paths.
- [ ] No non-public project, operating, deployment, or scanning-rule details.
- [ ] No claim that local checks approve publication or certify safety.
- [ ] Security-sensitive details are routed privately, not discussed here.
- [ ] Starter hashes were updated when starter file content changed.
- [ ] Workflow, package, schema, release, or SDK changes are ready for owner review.

## Validation checklist

- [ ] `npm test`
- [ ] `npm run validate:starters`
- [ ] `npm run release:check`
- [ ] Production dependency audit for affected packages
