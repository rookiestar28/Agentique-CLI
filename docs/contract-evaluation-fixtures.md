# Contract Evaluation Fixtures

The companion repository includes a synthetic public fixture matrix for surfacing contract coverage:

```text
scripts/fixtures/surfacing-contract-matrix/matrix.json
```

The matrix is release-check input for baseline companion behavior. It covers:

- overlapping public tools or resources;
- semantically relevant candidates with declared risk;
- stale public resources;
- valid but off-topic resources;
- invalid structured outputs;
- context bundle budget overflow.

These fixtures are not production review rules. They are public examples for local validation and release review. `agentique.io` remains authoritative for upload, scan, review, moderation, publication state, distribution state, and public readback.

The fixture matrix must stay synthetic and public-safe. Do not include credentials, account data, local paths, moderation material, internal review procedures, production scoring logic, quarantine criteria, or operational playbooks.
