import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const RESOURCE_UPLOAD_COMMANDS = new Set(["upload-candidate"]);

const RESOURCE_UPLOAD_SCHEMA_FILES = Object.freeze([
  "upload-candidate-gate.schema.json",
  "skill-source-package.schema.json",
  "role-plugin-pack.schema.json"
]);

const SKILL_SOURCE_SCHEMA_ID = "https://schemas.agentique.io/skill-source-package.schema.json";
const ROLE_PLUGIN_SCHEMA_ID = "https://schemas.agentique.io/role-plugin-pack.schema.json";

const contractSchemaIds = new Map([
  ["agentique.skillSourcePackage.v1", SKILL_SOURCE_SCHEMA_ID],
  ["agentique.rolePluginPack.v1", ROLE_PLUGIN_SCHEMA_ID]
]);

const userConfigSegments = new Set([".codex", ".claude", ".gemini", ".opencode", ".cursor"]);
const blockedOutputSegments = new Set([".git", ".env", ".cache", "node_modules"]);
const privatePlanningSegment = `.${"plan"}${"ning"}`;
const privateResearchSegment = `${"ref"}${"erence"}`;
const localPathPattern = new RegExp(
  `(?:[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|\\/mnt\\/|(?:^|[\\\\/])(?:${escapeRegExp(privatePlanningSegment)}|${escapeRegExp(privateResearchSegment)}|${escapeRegExp(privateResearchSegment.toUpperCase())})(?:[\\\\/]|$))`,
  "i"
);
const secretLikePattern =
  /(?:token\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|-----BEGIN|signature=|x-amz-|credential=)/i;
const overclaimPattern =
  /\b(?:approved|certified|guaranteed|publication ready|published automatically|ready to run|runtime available|executes?|installs?|launches?|uploads?|deploys?)\b/i;
const digestPattern = /^sha256:[a-f0-9]{64}$/;

export async function validateUploadCandidate({ sourcePath, outputPath, schemasDir }) {
  const findings = [];
  const outputSafety = validateExplicitOutputFile(outputPath);
  findings.push(...outputSafety.findings);

  const loaded = await readJsonWithDigest(sourcePath, "candidate", findings);
  let candidateType = "unknown";

  if (loaded.value) {
    candidateType = candidateTypeFor(loaded.value);
    await validateCandidateSchema({ candidate: loaded.value, schemasDir, candidateType, findings });
    inspectCandidateSemantics(loaded.value, candidateType, findings);
  }

  const report = createUploadCandidateReport({
    ok: findings.length === 0,
    sourcePath,
    outputPath,
    candidate: loaded.value,
    candidateType,
    sourceDigest: loaded.digest,
    findings
  });

  let files = [];
  if (outputSafety.resolvedOutputFile) {
    const reportForFile = { ...report, files: [] };
    await fs.mkdir(path.dirname(outputSafety.resolvedOutputFile), { recursive: true });
    await writeJson(outputSafety.resolvedOutputFile, reportForFile);
    const stat = await fs.stat(outputSafety.resolvedOutputFile);
    files = [
      {
        path: labelForPath(outputSafety.resolvedOutputFile),
        role: "upload-candidate-report",
        bytes: stat.size,
        sha256: `sha256:${await hashFile(outputSafety.resolvedOutputFile)}`
      }
    ];
  }

  return {
    ...report,
    files
  };
}

export function formatResourceUploadHuman(report) {
  const lines = [`${report.ok ? "OK" : "FAILED"} ${report.command}`];
  lines.push(`- decision: ${report.decision}`);
  if (report.summary?.candidateId) {
    lines.push(`- candidate: ${report.summary.candidateId}`);
  }
  for (const item of report.findings ?? []) {
    lines.push(`- ${item.code} at ${item.location}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}

async function validateCandidateSchema({ candidate, schemasDir, candidateType, findings }) {
  const schemaId = contractSchemaIds.get(candidate?.contractVersion);
  if (!schemaId) {
    findings.push(finding("candidate-type-unsupported", "Candidate contract version is not supported.", "candidate.contractVersion"));
    return;
  }

  let ajv;
  try {
    ajv = await loadResourceUploadAjv(schemasDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema load error";
    findings.push(finding("schema-loader", message, "schema"));
    return;
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate(candidate)) {
    for (const error of validate.errors ?? []) {
      findings.push(finding("schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, candidateType));
    }
  }
}

async function loadResourceUploadAjv(schemasDir) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schemaFile of RESOURCE_UPLOAD_SCHEMA_FILES) {
    const schema = JSON.parse(await fs.readFile(path.join(schemasDir, schemaFile), "utf8"));
    ajv.addSchema(schema);
  }
  return ajv;
}

async function readJsonWithDigest(filePath, location, findings) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    findings.push(finding("json-read", "Candidate JSON file cannot be read.", location));
    return { value: null, digest: null };
  }

  const digest = `sha256:${createHash("sha256").update(raw).digest("hex")}`;
  try {
    return { value: JSON.parse(raw), digest };
  } catch {
    findings.push(finding("json-parse", "Candidate JSON file must contain valid JSON.", location));
    return { value: null, digest };
  }
}

function inspectCandidateSemantics(candidate, candidateType, findings) {
  const gate = candidate?.gate ?? {};
  inspectTextSafety(candidate, findings);
  inspectGatePolicy(gate, findings);
  inspectCandidateInventory(candidate, candidateType, findings);
}

function inspectGatePolicy(gate, findings) {
  if (!gate || typeof gate !== "object") {
    findings.push(finding("gate-missing", "Upload candidate gate metadata is required.", "candidate.gate"));
    return;
  }

  if (gate.disposition !== "static-review-candidate") {
    findings.push(
      finding(
        gate.disposition === "runtime-deferred" ? "runtime-deferred" : "source-disposition-blocked",
        "Only static review candidates can pass local upload-candidate validation.",
        "candidate.gate.disposition"
      )
    );
  }

  const license = gate.licenseProvenance ?? {};
  if (license.policy !== "allowed") {
    findings.push(
      finding(
        license.policy === "noncommercial-blocked" ? "license-noncommercial" : "license-review-required",
        "License and provenance policy is not allowed for package preparation.",
        "candidate.gate.licenseProvenance"
      )
    );
  }
  if (license.provenanceReviewed !== true || license.perFileLicenseInventory !== true) {
    findings.push(finding("provenance-incomplete", "License provenance and per-file inventory must be reviewed.", "candidate.gate.licenseProvenance"));
  }

  const security = gate.securityEvidenceSummary ?? {};
  if (security.staticScanState !== "passed") {
    findings.push(finding("scanner-review-required", "Static scanner summary must pass before package preparation.", "candidate.gate.securityEvidenceSummary"));
  }
  if (security.noSecretsDetected !== true || security.noInternalMarkers !== true) {
    findings.push(finding("scanner-redaction-required", "Scanner summary must prove secret and internal-marker absence.", "candidate.gate.securityEvidenceSummary"));
  }
  if (security.summaryDigest && !digestPattern.test(security.summaryDigest)) {
    findings.push(finding("summary-digest-invalid", "Scanner summary digest must be a sha256 digest.", "candidate.gate.securityEvidenceSummary"));
  }

  const runtime = gate.runtimeRisk ?? {};
  if (runtime.noExecution !== true || runtime.noRuntimeClaim !== true) {
    findings.push(finding("runtime-claim-forbidden", "Runtime metadata must remain no-execution and no-runtime-claim.", "candidate.gate.runtimeRisk"));
  }
  if (runtime.requiresRuntime === true) {
    findings.push(finding("runtime-sandbox-required", "Runtime-backed candidates require a separate sandbox/runtime gate.", "candidate.gate.runtimeRisk"));
  }
  if (Array.isArray(runtime.capabilities) && runtime.capabilities.some((capability) => ["package-lifecycle", "shell-command", "filesystem-write"].includes(capability))) {
    findings.push(finding("dangerous-capability", "Candidate declares a capability that cannot pass upload-candidate preparation.", "candidate.gate.runtimeRisk.capabilities"));
  }

  const projection = gate.publicProjection ?? {};
  if (
    projection.nonCertifying !== true ||
    projection.noApprovalClaim !== true ||
    projection.noRuntimeClaim !== true ||
    projection.noPublicationClaim !== true
  ) {
    findings.push(finding("public-projection-overclaim", "Public projection must remain non-certifying with no approval, runtime, or publication claim.", "candidate.gate.publicProjection"));
  }
  if (projection.redaction && Object.values(projection.redaction).some((value) => value !== true)) {
    findings.push(finding("public-redaction-incomplete", "Public projection redaction flags must all be enabled.", "candidate.gate.publicProjection.redaction"));
  }
}

function inspectCandidateInventory(candidate, candidateType, findings) {
  if (candidateType === "skill-source-package") {
    const gateDigest = candidate.gate?.sourceSnapshot?.snapshotDigest;
    if (candidate.source?.snapshotDigest && gateDigest && candidate.source.snapshotDigest !== gateDigest) {
      findings.push(finding("source-digest-mismatch", "Candidate source digest does not match gate source snapshot.", "candidate.source.snapshotDigest"));
    }
    for (const [index, skill] of (candidate.skills ?? []).entries()) {
      for (const file of skill.files ?? []) {
        inspectRelativePath(file, `candidate.skills[${index}].files`);
      }
      if (skill.contentMode !== "static-instructions") {
        findings.push(finding("skill-content-mode-blocked", "Only static instruction skills can pass upload-candidate preparation.", `candidate.skills[${index}].contentMode`));
      }
    }
    inspectPackagePlan(candidate.packagePlan, "candidate.packagePlan", findings);
  } else if (candidateType === "role-plugin-pack") {
    for (const [index, skill] of (candidate.includedSkills ?? []).entries()) {
      inspectRelativePath(skill.sourcePath, `candidate.includedSkills[${index}].sourcePath`);
    }
    for (const [index, manifest] of (candidate.pluginManifests ?? []).entries()) {
      inspectRelativePath(manifest.path, `candidate.pluginManifests[${index}].path`);
      if (manifest.sanitized !== true || manifest.noCredentialValues !== true || manifest.noRuntimeActivation !== true) {
        findings.push(finding("plugin-manifest-unsafe", "Plugin manifests must be sanitized and contain no credential values or runtime activation.", `candidate.pluginManifests[${index}]`));
      }
    }
    for (const [index, connector] of (candidate.connectorRequirements ?? []).entries()) {
      if (connector.credentialValuesIncluded !== false || connector.activationIncluded !== false) {
        findings.push(finding("connector-activation-forbidden", "Connector metadata must not include credentials or activation.", `candidate.connectorRequirements[${index}]`));
      }
    }
    inspectPackagePlan(candidate.packagePlan, "candidate.packagePlan", findings);
  }

  function inspectRelativePath(value, location) {
    if (typeof value !== "string" || value.includes("..") || path.isAbsolute(value) || /^[A-Za-z]:/.test(value) || value.includes("\\")) {
      findings.push(finding("unsafe-path", "Candidate inventory paths must be relative public package paths.", location));
    }
  }
}

function inspectPackagePlan(plan, location, findings) {
  if (!plan || typeof plan !== "object") {
    findings.push(finding("package-plan-missing", "Package plan metadata is required.", location));
    return;
  }
  if (plan.deterministicDryRunOnly !== true) {
    findings.push(finding("dry-run-required", "Package preparation must remain deterministic dry-run only.", location));
  }
  const forbiddenTrueKeys = [
    "includesRuntimeCode",
    "installsDependencies",
    "executesCandidateCode",
    "directInstallAvailable",
    "connectorActivationIncluded",
    "executesPackContent"
  ];
  for (const key of forbiddenTrueKeys) {
    if (plan[key] === true) {
      findings.push(finding("package-plan-overclaim", "Package plan includes behavior outside local review preparation.", `${location}.${key}`));
    }
  }
}

function inspectTextSafety(value, findings) {
  const strings = collectStrings(value);
  if (strings.some((text) => localPathPattern.test(text))) {
    findings.push(finding("internal-path-forbidden", "Candidate metadata contains a local or internal path.", "candidate"));
  }
  if (strings.some((text) => secretLikePattern.test(text))) {
    findings.push(finding("secret-value-forbidden", "Candidate metadata contains secret-like material.", "candidate"));
  }
  if (strings.some((text) => overclaimPattern.test(text))) {
    findings.push(finding("overclaim-forbidden", "Candidate metadata contains approval, runtime, upload, publication, or certification language.", "candidate"));
  }
}

function createUploadCandidateReport({ ok, sourcePath, outputPath, candidate, candidateType, sourceDigest, findings }) {
  return {
    ok,
    command: "upload-candidate",
    decision: ok ? "review_candidate" : "no_go",
    source: labelForPath(sourcePath),
    output: outputPath ? labelForPath(outputPath) : null,
    candidateType,
    summary: summarizeCandidate(candidate, sourceDigest),
    safety: {
      noExecution: true,
      noInstall: true,
      noNetwork: true,
      noArchiveExtraction: true,
      noUserConfigMutation: true,
      noUpload: true,
      noPublication: true,
      reportOnly: true
    },
    findings: uniqueFindings(findings)
  };
}

function summarizeCandidate(candidate, sourceDigest) {
  if (!candidate || typeof candidate !== "object") {
    return {
      candidateId: null,
      sourceDigestPresent: Boolean(sourceDigest),
      disposition: null,
      licensePolicy: null,
      runtimeClass: null,
      itemCount: 0
    };
  }

  const isSkill = candidate.contractVersion === "agentique.skillSourcePackage.v1";
  return {
    candidateId: safeText(isSkill ? candidate.packageId : candidate.packId),
    sourceDigestPresent: Boolean(sourceDigest),
    disposition: safeText(candidate.gate?.disposition),
    licensePolicy: safeText(candidate.gate?.licenseProvenance?.policy),
    runtimeClass: safeText(candidate.gate?.runtimeRisk?.runtimeClass),
    itemCount: isSkill
      ? Array.isArray(candidate.skills)
        ? candidate.skills.length
        : 0
      : Array.isArray(candidate.includedSkills)
        ? candidate.includedSkills.length
        : 0
  };
}

function candidateTypeFor(candidate) {
  if (candidate?.contractVersion === "agentique.skillSourcePackage.v1") return "skill-source-package";
  if (candidate?.contractVersion === "agentique.rolePluginPack.v1") return "role-plugin-pack";
  return "unknown";
}

function validateExplicitOutputFile(outputPath) {
  const findings = [];
  if (!outputPath || typeof outputPath !== "string") {
    findings.push(finding("output-required", "An explicit output file is required.", "output"));
    return { findings, resolvedOutputFile: null };
  }

  const resolvedOutputFile = path.resolve(outputPath);
  const segments = resolvedOutputFile.split(/[\\/]+/).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => userConfigSegments.has(segment) || blockedOutputSegments.has(segment))) {
    findings.push(finding("output-path-forbidden", "Output file cannot target agent configuration, dependency, cache, env, or Git directories.", "output"));
  }
  if (!path.extname(resolvedOutputFile)) {
    findings.push(finding("output-file-required", "Output must be an explicit report file path.", "output"));
  }
  return { findings, resolvedOutputFile: findings.length === 0 ? resolvedOutputFile : null };
}

function collectStrings(value, result = []) {
  if (typeof value === "string") {
    result.push(value);
    return result;
  }
  if (Array.isArray(value)) {
    value.forEach((item) => collectStrings(item, result));
    return result;
  }
  if (value && typeof value === "object") {
    for (const [key, entry] of Object.entries(value)) {
      result.push(key);
      collectStrings(entry, result);
    }
  }
  return result;
}

function safeText(value, maxLength = 120) {
  if (typeof value !== "string") return null;
  return value.replace(localPathPattern, "[redacted:path]").replace(secretLikePattern, "[redacted:secret]").slice(0, maxLength);
}

function uniqueFindings(findings) {
  const seen = new Set();
  return findings.filter((item) => {
    const key = `${item.code}:${item.location}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function hashFile(filePath) {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function labelForPath(filePath) {
  return path.basename(String(filePath ?? "unavailable"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function finding(code, message, location) {
  return { code, message, location };
}
