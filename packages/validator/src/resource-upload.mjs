import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const RESOURCE_UPLOAD_COMMANDS = new Set(["upload-candidate", "package-dry-run", "source-no-go"]);

const RESOURCE_UPLOAD_SCHEMA_FILES = Object.freeze([
  "agent-native.schema.json",
  "distribution-mode.schema.json",
  "output-contract.schema.json",
  "package-manifest.schema.json",
  "parser-variant.schema.json",
  "permission-risk.schema.json",
  "registry-trust.schema.json",
  "resource-manifest.schema.json",
  "skill-metadata.schema.json",
  "source-no-go.schema.json",
  "static-package-dry-run.schema.json",
  "surfacing-metadata.schema.json",
  "upload-candidate-gate.schema.json",
  "workflow-metadata.schema.json",
  "skill-source-package.schema.json",
  "role-plugin-pack.schema.json"
]);

const SKILL_SOURCE_SCHEMA_ID = "https://schemas.agentique.io/skill-source-package.schema.json";
const ROLE_PLUGIN_SCHEMA_ID = "https://schemas.agentique.io/role-plugin-pack.schema.json";
const STATIC_PACKAGE_DRY_RUN_SCHEMA_ID = "https://schemas.agentique.io/static-package-dry-run.schema.json";
const SOURCE_NO_GO_SCHEMA_ID = "https://schemas.agentique.io/source-no-go.schema.json";

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

export async function buildStaticPackageDryRun({ sourcePath, outputDir, schemasDir }) {
  const outputSafety = validateExplicitOutputDir(outputDir);
  if (!outputSafety.resolvedOutputDir) {
    return createPackageDryRunReport({
      ok: false,
      decision: "no_go",
      sourcePath,
      outputDir,
      candidate: null,
      uploadReport: null,
      manifest: null,
      files: [],
      findings: outputSafety.findings
    });
  }

  const packageRoot = path.join(outputSafety.resolvedOutputDir, "package");
  const uploadReportPath = path.join(packageRoot, "upload-candidate-report.json");
  const uploadReport = await validateUploadCandidate({
    sourcePath,
    outputPath: uploadReportPath,
    schemasDir
  });
  const reportFile = await summarizeExistingFile(uploadReportPath, "package/upload-candidate-report.json", "upload-candidate-report");
  const uploadFindings = [...(uploadReport.findings ?? [])];

  if (!uploadReport.ok) {
    return createPackageDryRunReport({
      ok: false,
      decision: "no_go",
      sourcePath,
      outputDir,
      candidate: null,
      uploadReport,
      manifest: null,
      files: reportFile ? [reportFile] : [],
      findings: uploadFindings
    });
  }

  const loaded = await readJsonWithDigest(sourcePath, "candidate", uploadFindings);
  const candidate = loaded.value;
  const candidateType = candidateTypeFor(candidate);
  const eligibilityFindings = inspectPackageDryRunEligibility(candidate, candidateType);
  const findings = [...uploadFindings, ...eligibilityFindings];
  if (findings.length > 0) {
    return createPackageDryRunReport({
      ok: false,
      decision: "no_go",
      sourcePath,
      outputDir,
      candidate,
      uploadReport,
      manifest: null,
      files: reportFile ? [reportFile] : [],
      findings
    });
  }

  const descriptorFiles = await writeReviewDescriptors({ candidate, candidateType, packageRoot });
  const resourceManifestPreview = createResourceManifestPreview(candidate, candidateType, descriptorFiles);
  const resourceManifestPath = path.join(packageRoot, "resource-manifest.preview.json");
  await writeJson(resourceManifestPath, resourceManifestPreview);
  const resourceManifestFile = await summarizeExistingFile(
    resourceManifestPath,
    "package/resource-manifest.preview.json",
    "resource-manifest-preview"
  );

  const manifest = createStaticPackageDryRunManifest({
    candidate,
    candidateType,
    sourceDigest: loaded.digest,
    descriptorFiles,
    resourceManifestPreview,
    uploadReportFile: reportFile,
    resourceManifestFile
  });

  const manifestFindings = await validateStaticPackageDryRunManifest({ manifest, schemasDir });
  const manifestPath = path.join(packageRoot, "static-package-dry-run.json");
  await writeJson(manifestPath, manifest);
  const manifestFile = await summarizeExistingFile(manifestPath, "package/static-package-dry-run.json", "dry-run-manifest");
  const files = [reportFile, ...descriptorFiles, resourceManifestFile, manifestFile].filter(Boolean);

  return createPackageDryRunReport({
    ok: manifestFindings.length === 0,
    decision: manifestFindings.length === 0 ? "review_candidate" : "no_go",
    sourcePath,
    outputDir,
    candidate,
    uploadReport,
    manifest,
    files,
    findings: manifestFindings
  });
}

export async function createSourceNoGoReport({ sourcePath, outputPath, schemasDir }) {
  const outputSafety = validateExplicitOutputFile(outputPath);
  const findings = [...outputSafety.findings];
  const uploadReport = outputSafety.resolvedOutputFile
    ? await validateUploadCandidate({ sourcePath, outputPath: outputSafety.resolvedOutputFile, schemasDir })
    : null;
  const loaded = await readJsonWithDigest(sourcePath, "candidate", findings);
  const candidate = loaded.value;
  const report = buildSourceNoGoProjection({ candidate, uploadReport, findings });
  const schemaFindings = await validateSourceNoGoProjection({ report, schemasDir });
  const finalReport = {
    ...report,
    ok: report.ok && schemaFindings.length === 0,
    findings: uniqueFindings([...(report.findings ?? []), ...schemaFindings])
  };

  let files = [];
  if (outputSafety.resolvedOutputFile) {
    const reportForFile = { ...finalReport, files: [] };
    await fs.mkdir(path.dirname(outputSafety.resolvedOutputFile), { recursive: true });
    await writeJson(outputSafety.resolvedOutputFile, reportForFile);
    const summary = await summarizeExistingFile(outputSafety.resolvedOutputFile, labelForPath(outputSafety.resolvedOutputFile), "source-no-go-report");
    files = summary ? [summary] : [];
  }

  return {
    ...finalReport,
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

export function formatPackageDryRunHuman(report) {
  const lines = [`${report.ok ? "OK" : "FAILED"} ${report.command}`];
  lines.push(`- decision: ${report.decision}`);
  if (report.summary?.candidateId) {
    lines.push(`- candidate: ${report.summary.candidateId}`);
  }
  lines.push(`- files: ${Array.isArray(report.files) ? report.files.length : 0}`);
  for (const item of report.findings ?? []) {
    lines.push(`- ${item.code} at ${item.location}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}

export function formatSourceNoGoHuman(report) {
  const lines = [`${report.ok ? "OK" : "FAILED"} ${report.command}`];
  lines.push(`- decision: ${report.decision}`);
  lines.push(`- state: ${report.state}`);
  if (report.candidate?.candidateId) {
    lines.push(`- candidate: ${report.candidate.candidateId}`);
  }
  lines.push(`- prerequisites: ${(report.prerequisites ?? []).join(", ") || "none"}`);
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

function inspectPackageDryRunEligibility(candidate, candidateType) {
  const findings = [];
  if (!candidate || typeof candidate !== "object") {
    findings.push(finding("candidate-missing", "Candidate metadata is required for package dry-run.", "candidate"));
    return findings;
  }

  const packageKind = candidate.packagePlan?.packageKind;
  const allowedSkillKinds = new Set(["static-skill-pack", "workflow-skill-pack"]);
  const allowedRoleKinds = new Set(["role-plugin-pack", "connector-metadata-pack"]);
  if (candidateType === "skill-source-package") {
    if (!allowedSkillKinds.has(packageKind)) {
      findings.push(finding("package-kind-blocked", "Only static skill package kinds can produce dry-run descriptors.", "candidate.packagePlan.packageKind"));
    }
    for (const [index, skill] of (candidate.skills ?? []).entries()) {
      if (skill.contentMode !== "static-instructions") {
        findings.push(finding("skill-content-mode-blocked", "Only static instruction skills can produce dry-run descriptors.", `candidate.skills[${index}].contentMode`));
      }
    }
  } else if (candidateType === "role-plugin-pack") {
    if (!allowedRoleKinds.has(packageKind)) {
      findings.push(finding("package-kind-blocked", "Only role/plugin metadata package kinds can produce dry-run descriptors.", "candidate.packagePlan.packageKind"));
    }
  } else {
    findings.push(finding("candidate-type-unsupported", "Candidate contract version is not supported for package dry-run.", "candidate.contractVersion"));
  }

  if (candidate.gate?.disposition !== "static-review-candidate") {
    findings.push(finding("source-disposition-blocked", "Only static review candidates can produce dry-run descriptors.", "candidate.gate.disposition"));
  }
  if (candidate.gate?.licenseProvenance?.policy !== "allowed") {
    findings.push(finding("license-review-required", "Package dry-run requires allowed license provenance.", "candidate.gate.licenseProvenance.policy"));
  }
  if (candidate.gate?.runtimeRisk?.requiresRuntime === true) {
    findings.push(finding("runtime-sandbox-required", "Runtime-backed candidates require a separate sandbox/runtime gate.", "candidate.gate.runtimeRisk"));
  }
  return findings;
}

async function writeReviewDescriptors({ candidate, candidateType, packageRoot }) {
  const descriptorRoot = path.join(packageRoot, "descriptors");
  await fs.mkdir(descriptorRoot, { recursive: true });

  if (candidateType === "skill-source-package") {
    const descriptors = [];
    const skills = [...(candidate.skills ?? [])].sort((left, right) => left.skillId.localeCompare(right.skillId));
    for (const skill of skills) {
      const relPath = `package/descriptors/${skill.skillId}.json`;
      const filePath = path.join(descriptorRoot, `${skill.skillId}.json`);
      const descriptor = {
        contractVersion: "agentique.reviewDescriptor.v1",
        descriptorKind: "skill",
        skillId: safeText(skill.skillId),
        title: safeText(skill.title),
        summary: safeText(skill.summary),
        platform: safeText(skill.platform),
        contentMode: safeText(skill.contentMode),
        sourceFiles: sortedStrings(skill.files),
        licenseExpression: safeText(skill.licenseExpression),
        setupRequirements: sortedStrings(skill.setupRequirements),
        outputKinds: sortedStrings(skill.outputKinds),
        source: {
          sourceId: safeText(candidate.source?.sourceId),
          sourceName: safeText(candidate.source?.sourceName),
          sourceUrl: safeText(candidate.source?.sourceUrl),
          snapshotDigest: safeText(candidate.source?.snapshotDigest)
        },
        safety: descriptorSafety()
      };
      await writeJson(filePath, descriptor);
      descriptors.push(await summarizeExistingFile(filePath, relPath, "skill-descriptor"));
    }
    return descriptors.filter(Boolean);
  }

  const descriptor = {
    contractVersion: "agentique.reviewDescriptor.v1",
    descriptorKind: "role-plugin-pack",
    packId: safeText(candidate.packId),
    title: safeText(candidate.title),
    summary: safeText(candidate.summary),
    role: safeText(candidate.role),
    includedSkills: [...(candidate.includedSkills ?? [])]
      .sort((left, right) => left.skillId.localeCompare(right.skillId))
      .map((skill) => ({
        skillId: safeText(skill.skillId),
        title: safeText(skill.title),
        sourcePath: safeText(skill.sourcePath),
        connectorRequired: skill.connectorRequired === true,
        outputKinds: sortedStrings(skill.outputKinds)
      })),
    connectorRequirements: [...(candidate.connectorRequirements ?? [])]
      .sort((left, right) => left.connectorId.localeCompare(right.connectorId))
      .map((connector) => ({
        connectorId: safeText(connector.connectorId),
        requirementState: safeText(connector.requirementState),
        credentialValuesIncluded: false,
        activationIncluded: false,
        publicSetupNote: safeText(connector.publicSetupNote)
      })),
    pluginManifests: [...(candidate.pluginManifests ?? [])]
      .sort((left, right) => left.path.localeCompare(right.path))
      .map((manifest) => ({
        kind: safeText(manifest.kind),
        path: safeText(manifest.path),
        sanitized: manifest.sanitized === true,
        noCredentialValues: manifest.noCredentialValues === true,
        noRuntimeActivation: manifest.noRuntimeActivation === true
      })),
    safety: descriptorSafety()
  };
  const relPath = "package/descriptors/role-plugin-pack.json";
  const filePath = path.join(descriptorRoot, "role-plugin-pack.json");
  await writeJson(filePath, descriptor);
  return [await summarizeExistingFile(filePath, relPath, "role-pack-descriptor")].filter(Boolean);
}

function createResourceManifestPreview(candidate, candidateType, descriptorFiles) {
  const candidateId = candidateType === "skill-source-package" ? candidate.packageId : candidate.packId;
  const resourceName = resourceNameForCandidate(candidate);
  const sourceUrl = candidateType === "skill-source-package" ? candidate.source?.sourceUrl : candidate.gate?.sourceSnapshot?.sourceUrl;
  return {
    formatVersion: "1.0",
    name: resourceName,
    summary: safeText(candidate.summary, 240),
    source: {
      type: "git",
      url: safeText(sourceUrl)
    },
    distribution: {
      mode: "metadata_view",
      notes: "Descriptor-only local dry-run output for review before any platform action."
    },
    package: {
      formatVersion: "1.0",
      files: descriptorFiles.map((file) => file.path).sort(),
      hashes: Object.fromEntries(descriptorFiles.map((file) => [file.path, file.sha256]).sort(([left], [right]) => left.localeCompare(right)))
    },
    ...(candidateType === "skill-source-package" ? { skillSourcePackage: candidate } : { rolePluginPack: candidate }),
    permissionRisk: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
      externalNetwork: false,
      credentialed: false,
      approvalRequired: false,
      dataSensitivity: "public",
      capabilities: ["read-public-content"],
      reviewNotes: `Descriptor-only review preview for ${candidateId}; it does not execute or install content.`
    }
  };
}

function createStaticPackageDryRunManifest({
  candidate,
  candidateType,
  sourceDigest,
  descriptorFiles,
  resourceManifestPreview,
  uploadReportFile,
  resourceManifestFile
}) {
  const candidateId = candidateType === "skill-source-package" ? candidate.packageId : candidate.packId;
  const files = [uploadReportFile, ...descriptorFiles, resourceManifestFile].filter(Boolean).sort((left, right) => left.path.localeCompare(right.path));
  return {
    contractVersion: "agentique.staticPackageDryRun.v1",
    candidate: {
      candidateId: safeText(candidateId),
      candidateType,
      sourceDigest: safeText(sourceDigest),
      disposition: safeText(candidate.gate?.disposition)
    },
    package: {
      packageId: safeText(candidateId),
      packageKind: safeText(candidate.packagePlan?.packageKind),
      resourceName: resourceNameForCandidate(candidate),
      deterministicDryRunOnly: true,
      descriptorOnly: true
    },
    files,
    sourceInventory: sourceInventoryForCandidate(candidate, candidateType),
    resourceManifestPreview,
    safety: dryRunSafety()
  };
}

async function validateStaticPackageDryRunManifest({ manifest, schemasDir }) {
  const findings = [];
  try {
    const ajv = await loadResourceUploadAjv(schemasDir);
    const validate = ajv.getSchema(STATIC_PACKAGE_DRY_RUN_SCHEMA_ID);
    if (!validate(manifest)) {
      for (const error of validate.errors ?? []) {
        findings.push(finding("static-package-schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "static-package-dry-run"));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema load error";
    findings.push(finding("schema-loader", message, "schema"));
  }
  return findings;
}

function buildSourceNoGoProjection({ candidate, uploadReport, findings }) {
  const candidateType = candidateTypeFor(candidate);
  const gate = candidate?.gate ?? {};
  const licensePolicy = gate.licenseProvenance?.policy ?? "unknown";
  const disposition = gate.disposition ?? "unknown";
  const runtimeClass = gate.runtimeRisk?.runtimeClass ?? "unknown";
  const capabilities = sortedStrings(gate.runtimeRisk?.capabilities);
  const decision = sourceNoGoDecision({ disposition, licensePolicy, staticScanState: gate.securityEvidenceSummary?.staticScanState });
  const state = decision === "runtime_deferred" ? "deferred" : "blocked";
  const prerequisites = sourceNoGoPrerequisites({ gate, capabilities, licensePolicy, runtimeClass });
  const ok = decision !== "not_no_go" && prerequisites.length > 0;
  const projectionFindings = [...findings];

  if (decision === "not_no_go") {
    projectionFindings.push(finding("source-no-go-not-applicable", "Source No-Go report applies only to deferred or blocked candidates.", "candidate.gate.disposition"));
  }

  return {
    contractVersion: "agentique.sourceNoGo.v1",
    command: "source-no-go",
    ok,
    decision,
    state,
    candidate: {
      candidateId: safeText(candidateType === "skill-source-package" ? candidate?.packageId : candidate?.packId) ?? "unknown",
      candidateType,
      sourceId: safeText(gate.sourceSnapshot?.sourceId) ?? "unknown",
      sourceKind: safeText(gate.sourceSnapshot?.sourceKind) ?? "unknown",
      disposition: safeText(disposition) ?? "unknown"
    },
    runtime: {
      runtimeClass: safeText(runtimeClass) ?? "unknown",
      requiresRuntime: gate.runtimeRisk?.requiresRuntime === true,
      capabilities
    },
    prerequisites,
    safety: sourceNoGoSafety(),
    uploadCandidateSummary: {
      ok: uploadReport?.ok === true,
      findingCodes: sortedStrings((uploadReport?.findings ?? []).map((item) => item.code))
    },
    findings: uniqueFindings(projectionFindings)
  };
}

async function validateSourceNoGoProjection({ report, schemasDir }) {
  const findings = [];
  try {
    const ajv = await loadResourceUploadAjv(schemasDir);
    const validate = ajv.getSchema(SOURCE_NO_GO_SCHEMA_ID);
    if (!validate(report)) {
      for (const error of validate.errors ?? []) {
        findings.push(finding("source-no-go-schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "source-no-go"));
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema load error";
    findings.push(finding("schema-loader", message, "schema"));
  }
  return findings;
}

function sourceNoGoDecision({ disposition, licensePolicy, staticScanState }) {
  if (licensePolicy === "noncommercial-blocked" || licensePolicy === "unknown-blocked") return "license_blocked";
  if (disposition === "reference-only-blocked" || disposition === "excluded") return "reference_blocked";
  if (disposition === "runtime-deferred") return "runtime_deferred";
  if (staticScanState && staticScanState !== "passed") return "security_review_required";
  return "not_no_go";
}

function sourceNoGoPrerequisites({ gate, capabilities, licensePolicy, runtimeClass }) {
  const prerequisites = new Set();
  const reasons = sortedStrings(gate.gateState?.reasons);
  const staticScanState = gate.securityEvidenceSummary?.staticScanState;

  if (gate.runtimeRisk?.requiresRuntime === true || gate.sourceSnapshot?.sourceKind === "runtime-source") {
    prerequisites.add("sandbox-runtime-review");
  }
  if (runtimeClass === "security-scanner") {
    prerequisites.add("security-tool-review");
  }
  if (runtimeClass === "memory-store" || capabilities.some((capability) => ["memory-store", "local-db"].includes(capability))) {
    prerequisites.add("memory-privacy-review");
  }
  if (runtimeClass === "internet-capability" || capabilities.includes("external-network")) {
    prerequisites.add("internet-capability-review");
  }
  if (capabilities.includes("browser-state")) {
    prerequisites.add("browser-session-consent");
  }
  if (runtimeClass === "repository-graph" || capabilities.includes("repository-graph")) {
    prerequisites.add("repository-graph-review");
  }
  if (runtimeClass === "connector-required" || capabilities.some((capability) => ["connector-metadata", "mcp-metadata"].includes(capability))) {
    prerequisites.add("connector-review");
  }
  if (licensePolicy === "noncommercial-blocked" || reasons.includes("noncommercial-license")) {
    prerequisites.add("noncommercial-license-review");
  } else if (licensePolicy === "unknown-blocked" || reasons.includes("unknown-license")) {
    prerequisites.add("unknown-license-review");
  } else if (licensePolicy === "needs-review" || reasons.includes("license-needs-review")) {
    prerequisites.add("license-review");
  }
  if (gate.licenseProvenance?.provenanceReviewed !== true || gate.licenseProvenance?.perFileLicenseInventory !== true) {
    prerequisites.add("source-provenance-review");
  }
  if (staticScanState && staticScanState !== "passed") {
    prerequisites.add("scanner-review");
  }
  if (reasons.includes("runtime-sandbox-required")) prerequisites.add("sandbox-runtime-review");
  if (reasons.includes("memory-privacy-review-required")) prerequisites.add("memory-privacy-review");
  if (reasons.includes("security-review-required")) prerequisites.add("scanner-review");
  if (reasons.includes("connector-review-required")) prerequisites.add("connector-review");
  return [...prerequisites].sort();
}

function sourceInventoryForCandidate(candidate, candidateType) {
  if (candidateType === "skill-source-package") {
    return (candidate.skills ?? [])
      .flatMap((skill) =>
        (skill.files ?? []).map((filePath) => ({
          path: safeText(filePath),
          role: "skill-source",
          licenseExpression: safeText(skill.licenseExpression)
        }))
      )
      .sort((left, right) => left.path.localeCompare(right.path));
  }

  const licenseExpression = safeText(candidate.gate?.licenseProvenance?.licenseExpression);
  return [
    ...(candidate.includedSkills ?? []).map((skill) => ({
      path: safeText(skill.sourcePath),
      role: "role-skill-source",
      licenseExpression
    })),
    ...(candidate.pluginManifests ?? []).map((manifest) => ({
      path: safeText(manifest.path),
      role: "plugin-manifest",
      licenseExpression
    }))
  ].sort((left, right) => left.path.localeCompare(right.path));
}

function descriptorSafety() {
  return {
    noExecution: true,
    noInstall: true,
    noNetwork: true,
    noConnectorActivation: true,
    localReviewOnly: true
  };
}

function dryRunSafety() {
  return {
    noExecution: true,
    noInstall: true,
    noNetwork: true,
    noArchiveCreation: true,
    noArchiveExtraction: true,
    noUserConfigMutation: true,
    noConnectorActivation: true,
    noUpload: true,
    noPublication: true,
    localReviewOnly: true
  };
}

function sourceNoGoSafety() {
  return {
    noExecution: true,
    noInstall: true,
    noNetwork: true,
    noBrowserAccess: true,
    noMemoryStoreRead: true,
    noRepositoryGraphRuntime: true,
    noConnectorActivation: true,
    noUpload: true,
    noPublication: true,
    reportOnly: true
  };
}

function sortedStrings(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string").map((entry) => safeText(entry)).sort() : [];
}

function resourceNameForCandidate(candidate) {
  const id = candidate?.packageId ?? candidate?.packId ?? "resource-package";
  return String(id).split(":").at(-1).replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 64) || "resource-package";
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

function createPackageDryRunReport({ ok, decision, sourcePath, outputDir, candidate, uploadReport, manifest, files, findings }) {
  const candidateType = candidateTypeFor(candidate);
  return {
    ok,
    command: "package-dry-run",
    decision,
    source: labelForPath(sourcePath),
    output: outputDir ? labelForPath(outputDir) : null,
    candidateType,
    summary: summarizePackageDryRunCandidate(candidate, uploadReport),
    safety: dryRunSafety(),
    manifest: manifest
      ? {
          contractVersion: manifest.contractVersion,
          packageId: manifest.package.packageId,
          packageKind: manifest.package.packageKind,
          resourceName: manifest.package.resourceName,
          descriptorOnly: manifest.package.descriptorOnly,
          sourceInventoryCount: manifest.sourceInventory.length,
          generatedFileCount: Array.isArray(files) ? files.length : 0
        }
      : null,
    files: Array.isArray(files) ? files : [],
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

function summarizePackageDryRunCandidate(candidate, uploadReport) {
  if (!candidate || typeof candidate !== "object") {
    return {
      candidateId: uploadReport?.summary?.candidateId ?? null,
      packageKind: null,
      disposition: uploadReport?.summary?.disposition ?? null,
      itemCount: 0
    };
  }
  const isSkill = candidate.contractVersion === "agentique.skillSourcePackage.v1";
  return {
    candidateId: safeText(isSkill ? candidate.packageId : candidate.packId),
    packageKind: safeText(candidate.packagePlan?.packageKind),
    disposition: safeText(candidate.gate?.disposition),
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

function validateExplicitOutputDir(outputDir) {
  const findings = [];
  if (!outputDir || typeof outputDir !== "string") {
    findings.push(finding("output-required", "An explicit output directory is required.", "output"));
    return { findings, resolvedOutputDir: null };
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const segments = resolvedOutputDir.split(/[\\/]+/).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => userConfigSegments.has(segment) || blockedOutputSegments.has(segment))) {
    findings.push(finding("output-path-forbidden", "Output directory cannot target agent configuration, dependency, cache, env, or Git directories.", "output"));
  }
  return { findings, resolvedOutputDir: findings.length === 0 ? resolvedOutputDir : null };
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

async function summarizeExistingFile(filePath, relPath, role) {
  try {
    const stat = await fs.stat(filePath);
    return {
      path: relPath,
      role,
      bytes: stat.size,
      sha256: `sha256:${await hashFile(filePath)}`
    };
  } catch {
    return null;
  }
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
