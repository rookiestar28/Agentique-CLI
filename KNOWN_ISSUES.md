# Known Issues

Last reviewed: 2026-06-02

This document catalogues all known defects, edge cases, and potential risks
identified through static analysis, code review, and test-suite evaluation of
the Agentique companion repository. Each entry includes the affected module,
root cause, severity assessment, and a recommended remediation path.

---

## Table Of Contents

- [KI-001: Trusted publishing owner-side setup still requires confirmation](#ki-001-trusted-publishing-owner-side-setup-still-requires-confirmation)
- [KI-002: External intake scanner prefix truncation bypass](#ki-002-external-intake-scanner-prefix-truncation-bypass)
- [KI-003: Fuzzy path matching in package contract schema resolver](#ki-003-fuzzy-path-matching-in-package-contract-schema-resolver)
- [KI-004: Word boundary anchor unreliable for dotfile patterns](#ki-004-word-boundary-anchor-unreliable-for-dotfile-patterns)
- [KI-005: Validator reads entire files into memory without size cap](#ki-005-validator-reads-entire-files-into-memory-without-size-cap)
- [KI-006: Secret-like pattern false positives on documentation examples](#ki-006-secret-like-pattern-false-positives-on-documentation-examples)
- [KI-007: License recognizer limited to seven identifiers](#ki-007-license-recognizer-limited-to-seven-identifiers)
- [KI-008: Sequential publish step lacks error isolation](#ki-008-sequential-publish-step-lacks-error-isolation)

---

## KI-001: Trusted publishing owner-side setup still requires confirmation

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | CI / CD |
| **File** | `.github/workflows/publish-packages.yml`; `docs/package-release-provenance.md`; `scripts/lib/workflow-posture.mjs` |
| **Status** | Partially addressed — workflow posture is ready; npm owner-side Trusted Publisher setup must still be confirmed before token-free publication |

### Description

The `Publish packages with trusted publishing` workflow is intended to use npm
Trusted Publishers through GitHub OIDC instead of a long-lived package token.
The repository-side posture now requires a manual workflow, `contents: read`,
`id-token: write`, no repository secret references, and explicit `--provenance`
on every `npm publish` command.

The remaining risk is external to the repository: the npm organization/package
owner must configure each package's Trusted Publisher entry on npmjs.org. If
that owner-side setup is absent or mismatched, a token-free trusted publish can
still fail with an HTTP 401 or 403 error.

### Current Repository Guard

```yaml
- name: Publish packages with trusted publishing
  run: |
    cd schemas
    npm publish --access public --provenance
    cd ../packages/validator
    npm publish --access public --provenance
    cd ../packages/action
    npm publish --access public --provenance
    cd ../packages/readback
    npm publish --access public --provenance
```

### Remaining Confirmation

1. Each package is linked to the GitHub repository on npmjs.org under
   Settings -> Trusted publishing.
2. The trusted publisher entry matches this repository, workflow file, package,
   and environment expectations.
3. Any token fallback is owner-approved, short-lived, and performed outside the
   checked-in trusted-publishing workflow.

---

## KI-002: External intake scanner prefix truncation bypass

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | `@agentique.io/validator` — External Intake Scanner |
| **File** | `packages/validator/src/intake/scanner.mjs` (lines 16–18, 364–405, 421–457) |
| **Status** | Open — known design trade-off |

### Description

`readTextPrefix` reads a bounded prefix of each file for secret scanning
(64 KB), dangerous capability detection (32 KB), and script inventory (32 KB).
Content placed beyond these thresholds is never inspected.

An adversary who is aware of these limits can place secrets or dangerous
commands after the 64 KB mark and evade detection entirely.

### Recommended Fix

For secret scanning, switch to a streaming read approach that processes
the file in fixed-size chunks:

```javascript
async function scanSecretsStreaming(filePath, rel, findings) {
  const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 });
  let chunkIndex = 0;
  let lineOffset = 0;

  for await (const chunk of stream) {
    // Apply SECRET_RULES against each chunk.
    // Track line offsets across chunk boundaries.
    scanChunkForSecrets(chunk, rel, findings, lineOffset);
    lineOffset += countNewlines(chunk);
    chunkIndex += 1;
  }
}
```

For dangerous capability detection, the 32 KB prefix is generally acceptable
because CI configuration, shell scripts, and package manifests are almost
always under that limit. Document this assumption explicitly in a code comment.

---

## KI-003: Fuzzy path matching in package contract schema resolver

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs` (lines 299–308) |
| **Status** | Open |

### Description

`schemaIdForPackageJson` uses `normalizedRel.includes("context-bundle")` to
decide whether a JSON file should be validated against the context-bundle
schema. This substring match is overly broad: any file whose path accidentally
contains `context-bundle` — such as `docs/no-context-bundle-here.json` or
`notes/context-bundle-alternatives.json` — will be incorrectly subjected to
context-bundle schema validation, producing spurious findings.

### Recommended Fix

Replace the substring check with a directory-prefix or filename-convention
match:

```javascript
function schemaIdForPackageJson(normalizedRel) {
  if (!normalizedRel.endsWith(".json")) return null;
  if (normalizedRel.startsWith("tools/")) {
    return "https://schemas.agentique.io/tool-listing.schema.json";
  }
  // Match files inside a bundle/ directory or files named *context-bundle*.json
  // at the package root level only.
  const basename = normalizedRel.split("/").pop();
  if (normalizedRel.startsWith("bundle/") || basename.startsWith("context-bundle")) {
    return "https://schemas.agentique.io/context-bundle.schema.json";
  }
  return null;
}
```

Alternatively, introduce a `"$schema"` or `"contractType"` field inside the
JSON files themselves and use that as the dispatch key instead of relying on
filesystem path conventions.

---

## KI-004: Word boundary anchor unreliable for dotfile patterns

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` — External Intake Scanner |
| **File** | `packages/validator/src/intake/scanner.mjs` (lines 48–50) |
| **Status** | Open |

### Description

The `credential-environment-access` dangerous capability rule includes `.env`
as a match target:

```javascript
pattern: /\b(?:process\.env|os\.environ|getenv\(|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|npm_token|pypi_token|\.env)\b/i
```

The `\b` (word boundary) anchor is placed before the `.` character. Since `.`
is not a word character (`\w`), `\b` at that position matches the boundary
between a word character and `.`, but does **not** match `.env` at the
beginning of a line or after whitespace (where there is no preceding word
character). This makes the detection of standalone `.env` file references
inconsistent:

- `"some/.env"` — matches (boundary between `/` and `.` is not a `\b`, but
  the `\b` before `e` inside `env` can match in some engines).
- `" .env"` — may not match depending on the regex engine's treatment of
  `\b` before a non-word character.

### Recommended Fix

Use a lookbehind or a non-word-boundary anchor for the `.env` alternative:

```javascript
pattern: /(?:\b(?:process\.env|os\.environ|getenv\(|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|npm_token|pypi_token)|(?:^|[\s/\\])\.env)\b/i
```

Or split `.env` into a separate rule with its own anchoring:

```javascript
{ category: "dotenv-file", pattern: /(?:^|[\s/\\])\.env(?:\b|$)/i }
```

---

## KI-005: Validator reads entire files into memory without size cap

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs` (lines 111–131, 208–231) |
| **Status** | Open — known design trade-off |

### Description

In the package validation flow (`validatePackage`), both `inspectPackageFile`
and the inventory hash computation call `fs.readFile` to load the entire file
contents into memory. There is no upper size gate before the read.

If a starter package or user-supplied package contains a very large file
(hundreds of megabytes), the Node.js process will exhaust its heap memory and
crash with an out-of-memory error.

Note: this does **not** affect the External Intake Scanner, which already uses
bounded `readBufferPrefix` reads for all inspection passes and enforces a
`maxBytes` repository-level gate.

### Recommended Fix

Add an explicit per-file size check before reading:

```javascript
const MAX_PACKAGE_FILE_BYTES = 10 * 1024 * 1024; // 10 MB

async function inspectPackageFile({ packageDir, rel, expectedHash, findings, ajv }) {
  const filePath = resolveInside(packageDir, rel);
  if (!filePath) {
    findings.push(finding("unsafe-path", "Resolved file path escaped the package directory.", rel));
    return;
  }

  const stat = await fs.stat(filePath);
  if (stat.size > MAX_PACKAGE_FILE_BYTES) {
    findings.push(finding("file-too-large", "Package file exceeds maximum allowed size.", rel));
    return;
  }

  // ... existing read and hash logic
}
```

For hash computation on large files, switch to streaming:

```javascript
import { createReadStream } from "node:fs";

function hashFileStream(filePath) {
  return new Promise((resolve, reject) => {
    const hash = createHash("sha256");
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("end", () => resolve(hash.digest("hex")));
    stream.on("error", reject);
  });
}
```

---

## KI-006: Secret-like pattern false positives on documentation examples

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs` (lines 60–72) |
| **Status** | Open — acceptable friction |

### Description

The `secretLikePatterns` array in the package validator uses broad regular
expressions for `database-url` and `credential-url` detection:

```javascript
{ id: "database-url", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/i },
{ id: "credential-url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>:]+:[^@\s"'<>]+@[^\s"'<>]+/i }
```

If a starter README or a manifest description contains a fully-formed
placeholder credential URL for educational purposes (e.g.,
`postgres://<user>:<password>@localhost/db`), the validator will flag it as a
secret-like value, causing validation failure.

### Recommended Fix

Add an allowlist for well-known documentation placeholder patterns:

```javascript
const SAFE_EXAMPLE_PATTERNS = [
  /postgres:\/\/<user>:<password>@localhost/i,
  /mysql:\/\/root:password@localhost/i,
  /mongodb:\/\/user:pass@localhost/i,
  /redis:\/\/default:password@localhost/i
];

function isSafeExample(text, match) {
  return SAFE_EXAMPLE_PATTERNS.some((safe) => safe.test(match));
}
```

Alternatively, allow creators to annotate code blocks with a
`<!-- agentique:ignore-secrets -->` directive that suppresses secret scanning
for the annotated region, similar to `eslint-disable` comments.

---

## KI-007: License recognizer limited to seven identifiers

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` — External Intake Scanner |
| **File** | `packages/validator/src/intake/scanner.mjs` (lines 277–316) |
| **Status** | Open — acceptable for initial release |

### Description

Both `normalizeLicenseExpression` (SPDX string normalization) and
`normalizeLicenseText` (license file content heuristic) only recognize seven
license families: MIT, Apache-2.0, GPL-2.0, GPL-3.0, BSD-3-Clause, ISC, and
MPL-2.0.

Legitimate but less common licenses — including LGPL-2.1, LGPL-3.0, AGPL-3.0,
Unlicense, CC0-1.0, CC-BY-4.0, BSL-1.1, 0BSD, and Artistic-2.0 — are
classified as `unknown`, which triggers a blocking `license.unknown` finding
and prevents external intake from passing.

### Recommended Fix

Expand the recognizer in two stages:

**Stage 1 — Expand the SPDX expression map:**

```javascript
const map = new Map([
  ["MIT", "MIT"],
  ["APACHE-2.0", "Apache-2.0"],
  ["GPL-2.0", "GPL-2.0"],
  ["GPL-2.0-ONLY", "GPL-2.0"],
  ["GPL-3.0", "GPL-3.0"],
  ["GPL-3.0-ONLY", "GPL-3.0"],
  ["LGPL-2.1", "LGPL-2.1"],
  ["LGPL-2.1-ONLY", "LGPL-2.1"],
  ["LGPL-3.0", "LGPL-3.0"],
  ["LGPL-3.0-ONLY", "LGPL-3.0"],
  ["AGPL-3.0", "AGPL-3.0"],
  ["AGPL-3.0-ONLY", "AGPL-3.0"],
  ["BSD-2-CLAUSE", "BSD-2-Clause"],
  ["BSD-3-CLAUSE", "BSD-3-Clause"],
  ["ISC", "ISC"],
  ["MPL-2.0", "MPL-2.0"],
  ["UNLICENSE", "Unlicense"],
  ["CC0-1.0", "CC0-1.0"],
  ["0BSD", "0BSD"],
  ["BSL-1.1", "BSL-1.1"]
]);
```

**Stage 2 — Add text heuristics for the new families:**

```javascript
if (/GNU LESSER GENERAL PUBLIC LICENSE/i.test(content)) {
  if (/Version 3/i.test(content)) return "LGPL-3.0";
  if (/Version 2\.1/i.test(content)) return "LGPL-2.1";
}
if (/GNU AFFERO GENERAL PUBLIC LICENSE/i.test(content)) return "AGPL-3.0";
if (/this is free and unencumbered software/i.test(content)) return "Unlicense";
```

---

## KI-008: Sequential publish step lacks error isolation

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | CI / CD |
| **File** | `.github/workflows/publish-packages.yml`; `scripts/lib/workflow-posture.mjs`; `docs/package-release-provenance.md` |
| **Status** | Addressed — publish commands are isolated by package; real registry failures still require owner review and registry readback |

### Description

The original publish step used sequential `cd` and `npm publish` commands in a
single shell block. If any intermediate publish failed (e.g., `schemas`
succeeded but `validator` failed due to a transient registry error), subsequent
packages (`action`, `readback`) would not be published, and the workflow would
exit with the error from the failed command.

Because earlier packages may already be live at a new version while later
packages remain at the old version, this creates a partial-publish state that
requires manual correction.

### Repository Guard

Each package now publishes in its own workflow step with an explicit working
directory:

```yaml
- name: Publish schemas
  working-directory: schemas
  run: npm publish --access public --provenance

- name: Publish validator
  working-directory: packages/validator
  run: npm publish --access public --provenance

- name: Publish action
  working-directory: packages/action
  run: npm publish --access public --provenance

- name: Publish readback
  working-directory: packages/readback
  run: npm publish --access public --provenance
```

This ensures that each step has independent success/failure reporting in the
GitHub Actions UI. Workflow posture checks reject publish workflows that use a
directory-changing shell chain or omit one of the approved package directories.

### Remaining Manual Recovery

Actual registry writes are not atomic across packages. After any failed publish
run, compare registry readback for all four packages before advertising,
tagging, or changing public URL inventory. If one package version is live while
another failed, stop promotion and either publish the missing package version,
deprecate the affected version, or publish a coordinated replacement version
according to owner review.
