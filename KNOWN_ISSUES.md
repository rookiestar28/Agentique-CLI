# Known Issues

Last reviewed: 2026-06-05

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
- [KI-009: Uploader package registry publication is pending](#ki-009-uploader-package-registry-publication-is-pending)

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
| **File** | `packages/validator/src/intake/scanner.mjs` |
| **Status** | Addressed — high-risk truncated prefix reads now fail closed |

### Description

`readTextPrefix` reads a bounded prefix of each file for secret scanning
(64 KB), dangerous capability detection (32 KB), and script inventory (32 KB).
Content placed beyond these thresholds cannot be inspected by the prefix-based
rules.

An adversary who is aware of these limits can place secrets or dangerous
commands after the 64 KB mark and attempt to evade prefix-only detection.

### Repository Guard

High-risk scanner purposes now check file size before bounded prefix reads. If
the file is larger than the inspection limit, the report emits a blocking
finding and still reads the visible prefix for any additional findings:

```javascript
if (truncationFinding && stat.size > maxBytes) {
  findings.push(
    createFinding({
      code: truncationFinding.code,
      severity: truncationFinding.severity,
      message: truncationFinding.message,
      path: rel,
      blocking: true,
      details: { purpose, bytes: stat.size, maxBytes }
    })
  );
}
```

The guard emits `secret.truncated`, `dangerous.truncated`, or
`script.truncated` depending on the high-risk read purpose. This is a
fail-closed policy, not a full streaming classifier. A future enhancement can
replace the blocking uncertainty finding with streaming classification if the
false-positive cost for large benign text files becomes unacceptable.

---

## KI-003: Fuzzy path matching in package contract schema resolver

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs` |
| **Status** | Addressed — context bundle dispatch now uses explicit path conventions |

### Description

`schemaIdForPackageJson` previously used `normalizedRel.includes("context-bundle")`
to decide whether a JSON file should be validated against the context-bundle
schema. That substring match was overly broad: any file whose path accidentally
contained `context-bundle` — such as `docs/no-context-bundle-here.json` or
`notes/context-bundle-alternatives.json` — could be incorrectly subjected to
context-bundle schema validation, producing spurious findings.

### Repository Guard

Package JSON contract dispatch now uses explicit conventions:

```javascript
function schemaIdForPackageJson(normalizedRel) {
  if (!normalizedRel.endsWith(".json")) return null;
  if (normalizedRel.startsWith("tools/")) {
    return "https://schemas.agentique.io/tool-listing.schema.json";
  }
  if (isContextBundlePackageJson(normalizedRel)) {
    return "https://schemas.agentique.io/context-bundle.schema.json";
  }
  return null;
}

function isContextBundlePackageJson(normalizedRel) {
  const parts = normalizedRel.split("/");
  const basename = parts.at(-1) ?? "";
  return normalizedRel.startsWith("bundle/") || (parts.length === 1 && basename.startsWith("context-bundle"));
}
```

Unrelated nested paths that merely contain `context-bundle` no longer dispatch
as context bundle contracts. Existing `tools/*.json`, `bundle/*.json`, and
root-level `context-bundle*.json` conventions remain covered by validator
tests.

---

## KI-004: Word boundary anchor unreliable for dotfile patterns

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` — External Intake Scanner |
| **File** | `packages/validator/src/intake/scanner.mjs` |
| **Status** | Addressed — `.env` detection now uses a dedicated path-aware rule |

### Description

The `credential-environment-access` dangerous capability rule previously
included `.env` as a match target:

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

### Repository Guard

`.env` detection is now split into a dedicated path-aware dangerous capability
rule:

```javascript
{
  category: "dotenv-file-reference",
  pattern: /(?:^|[\s"'=:\/\\])\.env(?:\.[A-Za-z0-9_-]+)?(?:\b|$)/i
}
```

The rule matches standalone `.env`, nested `.env`, and suffixes such as
`.env.local` after path-like separators or whitespace. It avoids unrelated
suffixes such as `foo.env` and leaves conceptual environment-variable prose
unblocked.

---

## KI-005: Validator reads entire files into memory without size cap

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs`; `packages/validator/tests/validator.test.mjs` |
| **Status** | Addressed — package validation has file-size gates and external intake high-risk truncation now fails closed |

### Description

In the original package validation flow (`validatePackage`), both
`inspectPackageFile` and the inventory hash computation called `fs.readFile` to
load the entire file contents into memory. There was no upper size gate before
the read.

If a starter package or user-supplied package contained a very large file
(hundreds of megabytes), the Node.js process could exhaust its heap memory and
crash with an out-of-memory error.

### Repository Guard

Package validation now applies explicit byte limits before reading manifest or
package file contents. Oversized inputs produce relative-path findings and make
the package invalid. Package file hashes are computed through a read stream for
inventory and hash comparison.

The relevant pattern is:

```javascript
const MAX_PACKAGE_FILE_BYTES = 1024 * 1024;

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

  // Existing text/schema inspection only runs after this gate.
}
```

Hash computation uses streaming:

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

External intake uses bounded prefix inspection for high-risk text checks and now
fails closed with explicit truncation findings when the inspected prefix is
incomplete.

---

## KI-006: Secret-like pattern false positives on documentation examples

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` |
| **File** | `packages/validator/src/validator.mjs` |
| **Status** | Addressed — narrow documentation placeholder allowlist added |

### Description

The `secretLikePatterns` array in the package validator uses broad regular
expressions for `database-url` and `credential-url` detection:

```javascript
{ id: "database-url", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/i },
{ id: "credential-url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>:]+:[^@\s"'<>]+@[^\s"'<>]+/i }
```

If a starter README or a manifest description contains a fully formed
placeholder credential URL for educational purposes, the validator can otherwise
flag it as a secret-like value, causing validation failure.

### Repository Guard

The validator now checks secret-like matches at match level and skips only
narrow, known-safe documentation placeholders:

```javascript
const safeSecretExamplePatterns = [
  {
    id: "database-url",
    pattern: /^(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/(?:<user>|user|root|default):(?:<password>|password)@(?:localhost|127\.0\.0\.1)(?::\d+)?(?:\/[A-Za-z0-9._/-]*)?$/i
  },
  {
    id: "credential-url",
    pattern: /^https?:\/\/(?:<user>|user):(?:<password>|password)@example\.(?:com|org|net)(?:\/[^\s"'<>]*)?$/i
  }
];
```

Generic `credential-url` matching reuses the database placeholder check so a
safe database example is not re-flagged by the broader URL rule. Real
credential URLs, database URLs, assignment secrets, provider tokens, and private
keys continue to fail with redacted findings.

---

## KI-007: License recognizer limited to seven identifiers

| Field | Value |
|---|---|
| **Severity** | Low |
| **Module** | `@agentique.io/validator` — External Intake Scanner |
| **File** | `packages/validator/src/intake/scanner.mjs` |
| **Status** | Addressed — recognition expanded and separated from intake policy |

### Description

Earlier versions of `normalizeLicenseExpression` (SPDX string normalization)
and `normalizeLicenseText` (license file content heuristic) recognized only a
small set of license families: MIT, Apache-2.0, GPL-2.0, GPL-3.0,
BSD-3-Clause, ISC, and MPL-2.0.

Legitimate but less common licenses — including LGPL-2.1, LGPL-3.0, AGPL-3.0,
Unlicense, CC0-1.0, CC-BY-4.0, BSL-1.1, 0BSD, and Artistic-2.0 — could be
classified as `unknown`, which triggered a blocking `license.unknown` finding
and prevented external intake from passing.

### Repository Guard

License handling now separates recognition from policy:

- `status` reports whether the license signal is recognized.
- `policy` reports public intake handling: `allowed`, `needs-review`,
  `blocked`, or `unknown`.
- Findings use `license.allowed`, `license.needs-review`, `license.blocked`,
  or `license.unknown`.

```javascript
const LICENSE_ID_NORMALIZATION = new Map([
  ["MIT", "MIT"],
  ["APACHE-2.0", "Apache-2.0"],
  ["LGPL-3.0-ONLY", "LGPL-3.0-only"],
  ["AGPL-3.0-ONLY", "AGPL-3.0-only"],
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

Simple SPDX `AND`/`OR` expressions are recognized when every identifier is
known. Unsupported or custom expressions fail closed as `license.unknown`.
Text heuristics were expanded for common recognized license files, including
LGPL, AGPL, Unlicense, CC0, BSD-2-Clause, and BSL-1.1.

```javascript
function licensePolicyForExpression(normalized) {
  if (!normalized) return "unknown";
  const identifiers = normalized.split(/\s+(?:AND|OR)\s+/);
  if (identifiers.some((identifier) => LICENSE_POLICY.get(identifier) === "blocked")) {
    return "blocked";
  }
  if (identifiers.some((identifier) => LICENSE_POLICY.get(identifier) === "needs-review")) {
    return "needs-review";
  }
  if (identifiers.every((identifier) => LICENSE_POLICY.get(identifier) === "allowed")) {
    return "allowed";
  }
  return "unknown";
}
```

Recognition is not legal approval. Review-required and blocked policies remain
blocking in external intake reports.

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
run, compare registry readback for all publish-target packages before advertising,
tagging, or changing public URL inventory. If one package version is live while
another failed, stop promotion and either publish the missing package version,
deprecate the affected version, or publish a coordinated replacement version
according to owner review.

---

## KI-009: Uploader package registry publication is pending

| Field | Value |
|---|---|
| **Severity** | Medium |
| **Module** | `@agentique.io/uploader` — Release and Registry State |
| **File** | `packages/uploader`; `docs/package-release-provenance.md`; `docs/public-url-inventory.json`; `docs/release-go-no-go.json` |
| **Status** | Open — source implementation and local tarball smoke exist, but uploader `0.2.0` npm registry publication remains No-Go until publish-recovery evidence, registry readback, and install smoke from npm are recorded |

### Description

The uploader package is implemented in source and included in local tests,
package dry-run, workflow posture checks, and production dependency audit.
npm registry readback currently reports `@agentique.io/uploader` as published
at `0.1.0`, while uploader `0.2.0` remains pending publish recovery. Users
should not expect the `0.2.0` uploader package surface to be available from npm
until registry publication and install smoke evidence are recorded.

The public URL inventory tracks the existing uploader package page as approved
for the already published package. Existing published package pages for schemas,
validator, action, and readback remain approved advertised channels and now
read back at `0.2.0`. The current uploader `0.2.0` publication closeout is
No-Go.

### Required Closeout

Before advertising uploader `0.2.0` package capabilities:

1. Publish the exact reviewed package version through the approved package
   publishing route.
2. Verify registry readback for version, dist-tag, package metadata, and
   tarball contents.
3. Run a clean install smoke without lifecycle scripts.
4. Run a CLI smoke that proves help/version and auth-gated review-only behavior.
5. Update the public URL inventory and release evidence only after those checks
   pass.
