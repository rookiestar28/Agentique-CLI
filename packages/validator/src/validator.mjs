import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaFiles = [
  "distribution-mode.schema.json",
  "context-bundle.schema.json",
  "output-contract.schema.json",
  "package-manifest.schema.json",
  "parser-variant.schema.json",
  "permission-risk.schema.json",
  "public-readback.schema.json",
  "registry-trust.schema.json",
  "resource-manifest.schema.json",
  "skill-metadata.schema.json",
  "surfacing-metadata.schema.json",
  "tool-listing.schema.json",
  "workflow-metadata.schema.json"
];

const blockedExtensions = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".exe",
  ".msi",
  ".ps1",
  ".sh"
]);

// IMPORTANT: keep these gates before package text/JSON reads; they bound memory use for untrusted package inputs.
const MAX_VALIDATOR_JSON_BYTES = 1024 * 1024;
const MAX_PACKAGE_FILE_BYTES = 1024 * 1024;

const sensitivePathSegments = new Set(["private", ".env", ".git", ".cache", "node_modules"]);

const internalDotDirs = ["planning", "sessions"].map((name) => `\\.${name}`).join("|");
const internalReferenceDocs = ["reference", "docs"].join("\\/");
const internalPathPattern = new RegExp(
  `(?:^|[\\\\/\\s])(?:${internalDotDirs}|${internalReferenceDocs}|REFERENCE)(?:[\\\\/\\s]|$)`,
  "i"
);

const forbiddenTextPatterns = [
  { id: "internal-path", pattern: internalPathPattern },
  { id: "local-absolute-path", pattern: /(?:[A-Za-z]:\\|\/home\/|\/Users\/|\/mnt\/)/ },
  { id: "private-directory", pattern: /(?:^|[\\/\s])private(?:[\\/\s]|$)/i },
  {
    id: "unbounded-context",
    pattern: /\b(?:all[-\s]?catalog|full[-\s]?catalog|entire[-\s]?catalog|default[-\s]?unbounded|include everything|load everything|expose everything)\b/i
  },
  {
    id: "strong-claim",
    pattern: new RegExp(
      [
        "\\b(?:platform[-\\s]?approved|approved by validator|",
        "certified\\s+safe|safety certification|guaranteed safe|guaranteed compatible|guaranteed execution)\\b"
      ].join(""),
      "i"
    )
  }
];

const secretLikePatterns = [
  { id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/ },
  { id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{20,}\b/ },
  { id: "github-token", pattern: /\b(?:ghp|github_pat)_[A-Za-z0-9_]{20,}\b/ },
  { id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/ },
  { id: "bearer-token", pattern: /\bBearer\s+[A-Za-z0-9._~+/=-]{20,}\b/i },
  {
    id: "assignment-secret",
    pattern: /\b(?:api[_-]?(?:key|token)|secret|password|token)\b\s*[:=]\s*["'][^"']+["']/i
  },
  { id: "database-url", pattern: /\b(?:postgres(?:ql)?|mysql|mongodb(?:\+srv)?|redis):\/\/[^\s"'<>]+/i },
  { id: "credential-url", pattern: /\b[a-z][a-z0-9+.-]*:\/\/[^/\s"'<>:]+:[^@\s"'<>]+@[^\s"'<>]+/i }
];

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

const platformManagedCreatorKeys = new Set([
  "approved",
  "listed",
  "latestVersion",
  "platformManaged",
  "platformProjection",
  "platformTrustScore",
  "publishedAt",
  "publicationState",
  "scanPassed",
  "verifiedBadge"
]);

export async function validatePackage(options) {
  const command = options.command ?? "validate";
  const packageDir = path.resolve(options.packageDir);
  const schemasDir = path.resolve(options.schemasDir);
  const findings = [];

  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = await readJsonFile(manifestPath, findings, "manifest");
  if (!manifest) {
    return createReport({ ok: false, command, packageDir, manifest: null, inventory: [], findings });
  }

  const ajv = await createAjv(schemasDir);
  const validateManifest = ajv.getSchema("https://schemas.agentique.io/resource-manifest.schema.json");
  if (!validateManifest) {
    findings.push(finding("schema-loader", "Resource manifest schema was not loaded.", "schema"));
  } else if (!validateManifest(manifest)) {
    for (const error of validateManifest.errors ?? []) {
      findings.push(finding("schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "manifest"));
    }
  }
  validateManifestContracts(manifest, findings);

  const packageFiles = Array.isArray(manifest?.package?.files) ? manifest.package.files : [];
  const packageHashes = isRecord(manifest?.package?.hashes) ? manifest.package.hashes : {};

  for (const rel of packageFiles) {
    validatePackagePath(rel, findings);
  }

  for (const rel of Object.keys(packageHashes)) {
    validatePackagePath(rel, findings);
    if (!packageFiles.includes(rel)) {
      findings.push(finding("hash-without-file", "Hash entry does not have a matching package file.", rel));
    }
  }

  for (const rel of packageFiles) {
    await inspectPackageFile({ packageDir, rel, expectedHash: packageHashes[rel], findings, ajv });
  }

  scanJsonValue(manifest, "manifest", findings);

  const inventory = [];
  for (const rel of packageFiles) {
    const filePath = resolveInside(packageDir, rel);
    if (!filePath) continue;
    try {
      const stat = await fs.stat(filePath);
      const digest = await hashFileSha256(filePath);
      inventory.push({
        path: rel,
        sha256: digest,
        bytes: stat.size
      });
    } catch {
      // Missing files are already reported by inspectPackageFile.
    }
  }

  return createReport({
    ok: findings.length === 0,
    command,
    packageDir,
    manifest: summarizeManifest(manifest),
    inventory,
    findings
  });
}

export async function defaultSchemasDir(fromDir = process.cwd()) {
  const candidate = path.resolve(fromDir, "..", "agentique-schemas", "schemas");
  try {
    const stat = await fs.stat(candidate);
    if (stat.isDirectory()) return candidate;
  } catch {
    // Caller will report a clearer CLI error if no explicit schemas dir exists.
  }
  return candidate;
}

async function createAjv(schemasDir) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const file of schemaFiles) {
    let schema;
    try {
      schema = await readRequiredJson(path.join(schemasDir, file));
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown error";
      throw new Error(`Unable to load schema ${file} from ${schemasDir}: ${message}`);
    }
    ajv.addSchema(schema);
  }
  return ajv;
}

async function readRequiredJson(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  return JSON.parse(raw);
}

async function readJsonFile(filePath, findings, location) {
  const raw = await readTextFileWithinLimit({
    filePath,
    findings,
    location,
    maxBytes: MAX_VALIDATOR_JSON_BYTES,
    oversizedCode: "json-too-large",
    readErrorCode: "json-read"
  });
  if (raw === null) {
    return null;
  }

  try {
    return JSON.parse(raw);
  } catch (error) {
    findings.push(finding("json-read", `Unable to read valid JSON: ${error.code ?? "parse_error"}`, location));
    return null;
  }
}

function validatePackagePath(rel, findings) {
  if (typeof rel !== "string" || rel.trim() !== rel || rel.length === 0) {
    findings.push(finding("invalid-path", "Package path must be a non-empty normalized string.", "package.files"));
    return;
  }
  if (path.isAbsolute(rel) || /^[A-Za-z]:/.test(rel) || rel.includes("\\") || rel.split("/").includes("..")) {
    findings.push(finding("unsafe-path", "Package path must stay relative and cannot traverse directories.", rel));
  }
  const segments = rel.split("/");
  const sensitiveSegment = segments.find((segment) => sensitivePathSegments.has(segment));
  if (sensitiveSegment) {
    findings.push(finding("sensitive-path", `Package path cannot target ${sensitiveSegment} content.`, rel));
  }
  if (blockedExtensions.has(path.extname(rel).toLowerCase())) {
    findings.push(finding("blocked-extension", "Executable payload extensions are not allowed in starter packages.", rel));
  }
}

async function inspectPackageFile({ packageDir, rel, expectedHash, findings, ajv }) {
  const filePath = resolveInside(packageDir, rel);
  if (!filePath) {
    findings.push(finding("unsafe-path", "Resolved file path escaped the package directory.", rel));
    return;
  }

  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch {
    findings.push(finding("missing-file", "Package file listed in manifest is missing.", rel));
    return;
  }

  if (stat.size > MAX_PACKAGE_FILE_BYTES) {
    findings.push(finding("file-too-large", `Package file exceeds ${MAX_PACKAGE_FILE_BYTES} byte limit.`, rel));
    return;
  }

  let actualHash;
  try {
    actualHash = `sha256:${await hashFileSha256(filePath)}`;
  } catch {
    findings.push(finding("hash-read", "Unable to hash package file.", rel));
    return;
  }

  if (expectedHash && expectedHash !== actualHash) {
    findings.push(finding("hash-mismatch", "Package file hash does not match manifest.", rel));
  }

  const text = await fs.readFile(filePath, "utf8");
  scanText(text, rel, findings);
  inspectStructuredPackageFile({ rel, text, findings, ajv });
}

async function readTextFileWithinLimit({ filePath, findings, location, maxBytes, oversizedCode, readErrorCode }) {
  let stat;
  try {
    stat = await fs.stat(filePath);
  } catch (error) {
    findings.push(finding(readErrorCode, `Unable to read valid JSON: ${error.code ?? "read_error"}`, location));
    return null;
  }

  if (stat.size > maxBytes) {
    findings.push(finding(oversizedCode, `File exceeds ${maxBytes} byte limit.`, location));
    return null;
  }

  try {
    return await fs.readFile(filePath, "utf8");
  } catch (error) {
    findings.push(finding(readErrorCode, `Unable to read valid JSON: ${error.code ?? "read_error"}`, location));
    return null;
  }
}

async function hashFileSha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

function validateManifestContracts(manifest, findings) {
  if (!isRecord(manifest)) return;

  if (!isRecord(manifest.permissionRisk)) {
    findings.push(
      finding(
        "permission-risk-missing",
        "Resource manifests must declare permission and risk metadata for agent-facing selection.",
        "manifest.permissionRisk"
      )
    );
  }

  if (isRecord(manifest.skill) && !isRecord(manifest.skill.outputContract)) {
    findings.push(
      finding(
        "output-contract-missing",
        "Skill metadata must declare an output contract for bounded agent-facing use.",
        "manifest.skill.outputContract"
      )
    );
  }

  if (isRecord(manifest.workflow) && !isRecord(manifest.workflow.outputContract)) {
    findings.push(
      finding(
        "output-contract-missing",
        "Workflow metadata must declare an output contract for bounded agent-facing use.",
        "manifest.workflow.outputContract"
      )
    );
  }

  validateRegistryTrustContracts(manifest.registryTrust, findings);
  validateParserVariantContracts(manifest.parserVariant, findings);
}

function validateRegistryTrustContracts(registryTrust, findings) {
  if (!isRecord(registryTrust)) return;

  collectPlatformManagedCreatorKeys(registryTrust, "manifest.registryTrust", findings);

  const packageContext = registryTrust.packageContext;
  if (isRecord(packageContext)) {
    const version = typeof packageContext.version === "string" ? packageContext.version : "";
    const sourceUrl = typeof packageContext.sourceUrl === "string" ? packageContext.sourceUrl : "";

    if (/[\s<>=*xX]/.test(version) || version.startsWith("^") || version.startsWith("~") || !sourceUrl.startsWith("https://")) {
      findings.push(
        finding(
          "package-context-unsafe",
          "Package context must use an exact public version and HTTPS source URL.",
          "manifest.registryTrust.packageContext"
        )
      );
    }

    if (typeof packageContext.packageDigest !== "string") {
      findings.push(
        finding(
          "desired-state-fingerprint-missing",
          "Registry trust package context must include a public package digest for desired-state comparison.",
          "manifest.registryTrust.packageContext.packageDigest"
        )
      );
    }

    if (typeof packageContext.ownershipEvidenceVersion !== "string") {
      findings.push(
        finding(
          "scanner-policy-missing",
          "Registry trust package context must include an ownership evidence version for policy freshness comparison.",
          "manifest.registryTrust.packageContext.ownershipEvidenceVersion"
        )
      );
    }
  }

  if (isRecord(registryTrust.generatedDraft) && registryTrust.generatedDraft.draftOnly !== true) {
    findings.push(
      finding(
        "generated-draft-boundary",
        "Generated draft metadata must remain draft-only.",
        "manifest.registryTrust.generatedDraft"
      )
    );
  }

  if (isRecord(registryTrust.patchDelta)) {
    const operations = Array.isArray(registryTrust.patchDelta.operations) ? registryTrust.patchDelta.operations : [];
    const ambiguousOperation = operations.find(
      (operation) =>
        !isRecord(operation) ||
        operation.path === "/" ||
        (["add", "replace"].includes(operation.op) && typeof operation.valueSummary !== "string")
    );
    if (ambiguousOperation || operations.length === 0) {
      findings.push(
        finding(
          "patch-delta-ambiguous",
          "Patch and delta metadata must describe explicit partial-update operations.",
          "manifest.registryTrust.patchDelta"
        )
      );
    }
  }
}

function validateParserVariantContracts(parserVariant, findings) {
  if (!isRecord(parserVariant)) return;

  const parserEvidence = parserVariant.parserEvidence;
  if (isRecord(parserEvidence)) {
    const parseStatus = typeof parserEvidence.parseStatus === "string" ? parserEvidence.parseStatus : "";
    const parseConfidence = typeof parserEvidence.parseConfidence === "string" ? parserEvidence.parseConfidence : "";

    if (parserEvidence.noExecution !== true) {
      findings.push(
        finding(
          "parser-evidence-review-required",
          "Parser evidence must include a no-execution proof before public use.",
          "manifest.parserVariant.parserEvidence"
        )
      );
    }

    if (
      ["partial", "unsupported", "blocked", "failed"].includes(parseStatus) ||
      ["low", "unknown"].includes(parseConfidence)
    ) {
      findings.push(
        finding(
          "parser-evidence-review-required",
          "Parser evidence requires review before parser or variant availability claims.",
          "manifest.parserVariant.parserEvidence"
        )
      );
    }
  }

  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants : [];
  platformVariants.forEach((variant, index) => {
    if (!isRecord(variant)) return;
    const location = `manifest.parserVariant.platformVariants[${index}]`;
    const download = isRecord(variant.download) ? variant.download : {};

    if (variant.managedBy === "platform" || download.availability === "available") {
      findings.push(
        finding(
          "platform-variant-overclaim",
          "Creator manifests cannot claim platform-managed variant state or platform download availability.",
          location
        )
      );
    }

    if (variant.state === "unsupported") {
      findings.push(
        finding(
          "variant-unsupported",
          "Variant metadata declares an unsupported platform target.",
          location
        )
      );
    }

    if (variant.state === "stale" || variant.validationState === "stale") {
      findings.push(
        finding(
          "variant-stale",
          "Variant metadata declares stale parser or platform evidence.",
          location
        )
      );
    }
  });
}

function collectPlatformManagedCreatorKeys(value, location, findings) {
  if (Array.isArray(value)) {
    value.forEach((item, index) => collectPlatformManagedCreatorKeys(item, `${location}[${index}]`, findings));
    return;
  }
  if (!isRecord(value)) return;

  for (const [key, nested] of Object.entries(value)) {
    if (platformManagedCreatorKeys.has(key)) {
      findings.push(
        finding(
          "platform-managed-overclaim",
          "Creator manifests cannot set platform-managed trust, scan, publication, or badge state.",
          location
        )
      );
    }
    collectPlatformManagedCreatorKeys(nested, `${location}.${key}`, findings);
  }
}

function summarizeManifest(manifest) {
  if (!isRecord(manifest)) return null;

  return {
    name: typeof manifest.name === "string" ? manifest.name : null,
    formatVersion: typeof manifest.formatVersion === "string" ? manifest.formatVersion : null,
    ...(isRecord(manifest.parserVariant) ? { parserVariant: summarizeParserVariant(manifest.parserVariant) } : {}),
    ...(isRecord(manifest.registryTrust) ? { registryTrust: summarizeRegistryTrust(manifest.registryTrust) } : {})
  };
}

function summarizeParserVariant(parserVariant) {
  const parserEvidence = isRecord(parserVariant.parserEvidence) ? parserVariant.parserEvidence : null;
  const resourceGraphSummary = isRecord(parserVariant.resourceGraphSummary) ? parserVariant.resourceGraphSummary : null;
  const compatibility = isRecord(parserVariant.compatibility) ? parserVariant.compatibility : null;
  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants : [];

  return {
    parserEvidence: parserEvidence
      ? {
          sourceEcosystem: typeof parserEvidence.sourceEcosystem === "string" ? parserEvidence.sourceEcosystem : null,
          sourceFormat: typeof parserEvidence.sourceFormat === "string" ? parserEvidence.sourceFormat : null,
          parseStatus: typeof parserEvidence.parseStatus === "string" ? parserEvidence.parseStatus : null,
          parseConfidence: typeof parserEvidence.parseConfidence === "string" ? parserEvidence.parseConfidence : null,
          sanitizerStatus: typeof parserEvidence.sanitizerStatus === "string" ? parserEvidence.sanitizerStatus : null,
          noExecution: parserEvidence.noExecution === true,
          outputDigestPresent: typeof parserEvidence.outputDigest === "string"
        }
      : null,
    resourceGraphSummary: resourceGraphSummary
      ? {
          sanitized: resourceGraphSummary.sanitized === true,
          nodeCount: numberOrNull(resourceGraphSummary.nodeCount),
          edgeCount: numberOrNull(resourceGraphSummary.edgeCount),
          capabilityCount: numberOrNull(resourceGraphSummary.capabilityCount),
          sourceFileCount: numberOrNull(resourceGraphSummary.sourceFileCount)
        }
      : null,
    compatibility: compatibility
      ? {
          status: typeof compatibility.status === "string" ? compatibility.status : null,
          reasons: stringArrayOrEmpty(compatibility.reasons),
          reasonCount: Array.isArray(compatibility.reasons) ? compatibility.reasons.length : 0
        }
      : null,
    platformVariants: platformVariants.filter(isRecord).map((variant) => {
      const download = isRecord(variant.download) ? variant.download : {};
      return {
        platformId: typeof variant.platformId === "string" ? variant.platformId : null,
        artifactKind: typeof variant.artifactKind === "string" ? variant.artifactKind : null,
        state: typeof variant.state === "string" ? variant.state : null,
        validationState: typeof variant.validationState === "string" ? variant.validationState : null,
        downloadAvailability: typeof download.availability === "string" ? download.availability : null,
        reasons: stringArrayOrEmpty(variant.reasons),
        reasonCount: Array.isArray(variant.reasons) ? variant.reasons.length : 0
      };
    })
  };
}

function summarizeRegistryTrust(registryTrust) {
  const packageContext = isRecord(registryTrust.packageContext) ? registryTrust.packageContext : null;
  const generatedDraft = isRecord(registryTrust.generatedDraft) ? registryTrust.generatedDraft : null;
  const patchDelta = isRecord(registryTrust.patchDelta) ? registryTrust.patchDelta : null;
  const creatorCheckpoints = Array.isArray(registryTrust.creatorCheckpoints) ? registryTrust.creatorCheckpoints : [];

  return {
    packageContext: packageContext
      ? {
          packageName: typeof packageContext.packageName === "string" ? packageContext.packageName : null,
          version: typeof packageContext.version === "string" ? packageContext.version : null,
          sourceUrl: typeof packageContext.sourceUrl === "string" ? packageContext.sourceUrl : null,
          packageDigestPresent: typeof packageContext.packageDigest === "string"
        }
      : null,
    desiredStateFingerprintPresent: packageContext ? typeof packageContext.packageDigest === "string" : false,
    scannerPolicyVersionExpectation: "platform-managed-readback",
    creatorCheckpointCount: creatorCheckpoints.length,
    generatedDraft: generatedDraft
      ? {
          draftOnly: generatedDraft.draftOnly === true,
          kind: typeof generatedDraft.kind === "string" ? generatedDraft.kind : null
        }
      : null,
    patchDelta: patchDelta
      ? {
          mode: typeof patchDelta.mode === "string" ? patchDelta.mode : null,
          operationCount: Array.isArray(patchDelta.operations) ? patchDelta.operations.length : 0
        }
      : null
  };
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function inspectStructuredPackageFile({ rel, text, findings, ajv }) {
  const normalized = rel.replaceAll("\\", "/").toLowerCase();
  const schemaId = schemaIdForPackageJson(normalized);
  if (!schemaId) return;

  let value;
  try {
    value = JSON.parse(text);
  } catch {
    findings.push(finding("json-contract-read", "Package JSON contract file must contain valid JSON.", rel));
    return;
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate) {
    findings.push(finding("schema-loader", `Required package contract schema was not loaded: ${path.basename(schemaId)}`, rel));
    return;
  }

  if (!validate(value)) {
    for (const error of validate.errors ?? []) {
      findings.push(
        finding(
          "contract-schema",
          `${error.instancePath || "/"} ${error.message ?? "is invalid"}`,
          rel
        )
      );
    }
  }
}

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

function resolveInside(root, rel) {
  const resolved = path.resolve(root, rel);
  const rootWithSep = root.endsWith(path.sep) ? root : `${root}${path.sep}`;
  return resolved === root || resolved.startsWith(rootWithSep) ? resolved : null;
}

function scanJsonValue(value, location, findings) {
  if (typeof value === "string") {
    scanText(value, location, findings);
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => scanJsonValue(item, `${location}[${index}]`, findings));
    return;
  }
  if (isRecord(value)) {
    for (const [key, entry] of Object.entries(value)) {
      scanText(key, `${location}.${key}`, findings);
      scanJsonValue(entry, `${location}.${key}`, findings);
    }
  }
}

function scanText(text, location, findings) {
  for (const rule of forbiddenTextPatterns) {
    if (rule.pattern.test(text)) {
      findings.push(finding(rule.id, "Forbidden public-content term or path detected.", location));
    }
  }
  for (const rule of secretLikePatterns) {
    const unsafeMatch = [...matchPattern(text, rule.pattern)].find((match) => !isSafeSecretExample(rule.id, match[0]));
    if (unsafeMatch) {
      findings.push(finding(rule.id, "Secret-like value detected and redacted.", location));
    }
  }
}

function* matchPattern(text, pattern) {
  const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
  const globalPattern = new RegExp(pattern.source, flags);
  yield* text.matchAll(globalPattern);
}

function isSafeSecretExample(ruleId, matchText) {
  return safeSecretExamplePatterns.some(
    (safe) => (safe.id === ruleId || (ruleId === "credential-url" && safe.id === "database-url")) && safe.pattern.test(matchText)
  );
}

function createReport({ ok, command, packageDir, manifest, inventory, findings }) {
  return {
    ok,
    command,
    packageDir: path.basename(packageDir),
    manifest,
    inventory,
    findings
  };
}

function finding(code, message, location) {
  return { code, message, location };
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
