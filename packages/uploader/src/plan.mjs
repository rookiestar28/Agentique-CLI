import { createHash } from "node:crypto";
import { access, readFile as defaultReadFile } from "node:fs/promises";
import path from "node:path";
import { validatePackage } from "@agentique.io/validator/src/validator.mjs";

const PLAN_SCHEMA_VERSION = "agentique.uploader.plan.v1";
const CHECKPOINT_SCHEMA_VERSION = "agentique.uploader.checkpoints.v1";
const IMPORT_PLAN_SCHEMA_VERSION = "agentique.uploader.importPlan.v1";
const VARIANT_PLAN_SCHEMA_VERSION = "agentique.uploader.variantPlan.v1";
const AGENT_NATIVE_PLAN_SCHEMA_VERSION = "agentique.uploader.agentNativePlan.v1";

export const REQUIRED_CREATOR_CHECKPOINTS = Object.freeze([
  "lane-selection",
  "source-upload",
  "manifest-inspection",
  "scan-ownership-evidence",
  "data-flow-disclosure",
  "card-fields",
  "public-draft-preview",
  "review-only-confirmation",
  "readback-acknowledgement"
]);

const REQUIRED_CREATOR_CHECKPOINT_SET = new Set(REQUIRED_CREATOR_CHECKPOINTS);

export async function createUploadPlan({ packageDir, schemasDir = null, cwd = process.cwd(), readFile = defaultReadFile }) {
  try {
    const resolvedPackageDir = path.resolve(cwd, packageDir);
    const resolvedSchemasDir = schemasDir ? path.resolve(cwd, schemasDir) : await resolveSchemasDir(cwd);
    const report = await validatePackage({
      command: "upload-plan",
      packageDir: resolvedPackageDir,
      schemasDir: resolvedSchemasDir
    });

    const registryTrust = await readManifestRegistryTrust(resolvedPackageDir, readFile);
    return createPlanFromReport(report, registryTrust);
  } catch {
    return {
      schemaVersion: PLAN_SCHEMA_VERSION,
      ok: false,
      code: "upload.plan.unavailable",
      command: "upload plan",
      reviewOnly: true,
      noExecution: true,
      package: null,
      registryTrust: null,
      checkpoints: createUnavailableCheckpointSummary(),
      evidence: {
        inventory: [],
        findings: [
          {
            code: "upload-plan-error",
            message: "Unable to build upload plan from local validator evidence.",
            location: "upload-plan"
          }
        ],
        inventoryDigest: null,
        findingCount: 1
      }
    };
  }
}

export async function createImportPlan(options) {
  const uploadPlan = await createUploadPlan(options);
  const parserVariant = isRecord(uploadPlan.parserVariant) ? uploadPlan.parserVariant : null;
  const parserEvidence = isRecord(parserVariant?.parserEvidence) ? parserVariant.parserEvidence : null;
  const resourceGraphSummary = isRecord(parserVariant?.resourceGraphSummary) ? parserVariant.resourceGraphSummary : null;
  const compatibility = isRecord(parserVariant?.compatibility) ? parserVariant.compatibility : null;
  const findings = [...(uploadPlan.evidence?.findings ?? [])];

  if (!parserEvidence) {
    findings.push({
      code: "import-plan-parser-evidence-missing",
      message: "Parser evidence is required before import planning can be ready.",
      location: "manifest.parserVariant.parserEvidence"
    });
  }

  const ok = uploadPlan.ok && parserEvidence !== null && findings.length === 0;

  return {
    schemaVersion: IMPORT_PLAN_SCHEMA_VERSION,
    ok,
    code: ok ? "upload.import_plan.ready" : "upload.import_plan.review_required",
    command: "upload import-plan",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    package: uploadPlan.package,
    detected: parserEvidence
      ? {
          sourceEcosystem: parserEvidence.sourceEcosystem ?? null,
          sourceFormat: parserEvidence.sourceFormat ?? null,
          parseStatus: parserEvidence.parseStatus ?? null,
          parseConfidence: parserEvidence.parseConfidence ?? null,
          noExecution: parserEvidence.noExecution === true,
          outputDigestPresent: parserEvidence.outputDigestPresent === true
        }
      : null,
    graph: resourceGraphSummary
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
          status: compatibility.status ?? null,
          reasonCount: numberOrNull(compatibility.reasonCount) ?? 0
        }
      : null,
    evidence: {
      inventoryDigest: uploadPlan.evidence?.inventoryDigest ?? null,
      findingCount: findings.length,
      findings
    }
  };
}

export async function createVariantPlan(options) {
  const uploadPlan = await createUploadPlan(options);
  const parserVariant = isRecord(uploadPlan.parserVariant) ? uploadPlan.parserVariant : null;
  const platformVariants = Array.isArray(parserVariant?.platformVariants) ? parserVariant.platformVariants.filter(isRecord) : [];
  const findings = [...(uploadPlan.evidence?.findings ?? [])];

  if (platformVariants.length === 0) {
    findings.push({
      code: "variant-plan-variants-missing",
      message: "Platform variant metadata is required before variant planning can be ready.",
      location: "manifest.parserVariant.platformVariants"
    });
  }

  const variantSummaries = platformVariants.map((variant) => ({
    platformId: variant.platformId ?? null,
    artifactKind: variant.artifactKind ?? null,
    state: variant.state ?? null,
    validationState: variant.validationState ?? null,
    downloadAvailability: variant.downloadAvailability ?? null,
    reasons: stringArrayOrEmpty(variant.reasons),
    reasonCount: numberOrNull(variant.reasonCount) ?? 0,
    readyForDownload: uploadPlan.ok && variant.state === "available" && variant.downloadAvailability === "available"
  }));

  const ok = uploadPlan.ok && platformVariants.length > 0 && findings.length === 0;

  return {
    schemaVersion: VARIANT_PLAN_SCHEMA_VERSION,
    ok,
    code: ok ? "upload.variant_plan.ready" : "upload.variant_plan.review_required",
    command: "upload variant-plan",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    package: uploadPlan.package,
    compatibility: isRecord(parserVariant?.compatibility)
      ? {
          status: parserVariant.compatibility.status ?? null,
          reasonCount: numberOrNull(parserVariant.compatibility.reasonCount) ?? 0
        }
      : null,
    variants: variantSummaries,
    evidence: {
      inventoryDigest: uploadPlan.evidence?.inventoryDigest ?? null,
      findingCount: findings.length,
      findings
    }
  };
}

export async function createAgentNativePlan(options) {
  const uploadPlan = await createUploadPlan(options);
  const agentNative = isRecord(uploadPlan.agentNative) ? uploadPlan.agentNative : null;
  const namespace = isRecord(agentNative?.namespace) ? agentNative.namespace : null;
  const provenanceTrust = isRecord(agentNative?.provenanceTrust) ? agentNative.provenanceTrust : null;
  const installGuidance = Array.isArray(agentNative?.installGuidance) ? agentNative.installGuidance.filter(isRecord) : [];
  const privateMcpBoundary = isRecord(agentNative?.privateMcpBoundary) ? agentNative.privateMcpBoundary : null;
  const resolverIntent = isRecord(agentNative?.resolverIntent) ? agentNative.resolverIntent : null;
  const findings = [...(uploadPlan.evidence?.findings ?? [])];

  if (!agentNative) {
    findings.push({
      code: "agent-native-plan-metadata-missing",
      message: "Agent-native metadata is required before agent-native dry-run planning can be ready.",
      location: "manifest.agentNative"
    });
  } else {
    if (!namespace) {
      findings.push({
        code: "agent-native-plan-namespace-missing",
        message: "Agent-native namespace metadata is required before dry-run planning can be ready.",
        location: "manifest.agentNative.namespace"
      });
    }
    if (installGuidance.length === 0) {
      findings.push({
        code: "agent-native-plan-install-guidance-missing",
        message: "Agent-native install guidance is required before dry-run planning can be ready.",
        location: "manifest.agentNative.installGuidance"
      });
    }
    if (!resolverIntent) {
      findings.push({
        code: "agent-native-plan-resolver-intent-missing",
        message: "Agent-native resolver intent is required before dry-run planning can be ready.",
        location: "manifest.agentNative.resolverIntent"
      });
    }
  }

  const ok = uploadPlan.ok && agentNative !== null && namespace !== null && installGuidance.length > 0 && resolverIntent !== null && findings.length === 0;

  return {
    schemaVersion: AGENT_NATIVE_PLAN_SCHEMA_VERSION,
    ok,
    code: ok ? "upload.agent_native_plan.ready" : "upload.agent_native_plan.review_required",
    command: "upload agent-native-plan",
    reviewOnly: true,
    dryRunOnly: true,
    noExecution: true,
    package: uploadPlan.package,
    namespace: namespace
      ? {
          namespaceId: namespace.namespaceId ?? null,
          namespaceSlug: namespace.namespaceSlug ?? null,
          resourceCoordinate: namespace.resourceCoordinate ?? null,
          version: namespace.version ?? null,
          latestPointerPresent: namespace.latestPointerPresent === true
        }
      : null,
    provenanceTrust: provenanceTrust
      ? {
          evidenceTier: provenanceTrust.evidenceTier ?? null,
          evidenceState: provenanceTrust.evidenceState ?? null,
          sourceKindCount: numberOrNull(provenanceTrust.sourceKindCount) ?? 0,
          digestPresent: provenanceTrust.digestPresent === true,
          nonCertifying: provenanceTrust.nonCertifying === true,
          reasonCount: numberOrNull(provenanceTrust.reasonCount) ?? 0
        }
      : null,
    installGuidance: installGuidance.map((target) => ({
      targetId: target.targetId ?? null,
      state: target.state ?? null,
      artifactKind: target.artifactKind ?? null,
      noExecution: target.noExecution === true,
      requiresManualReview: target.requiresManualReview === true,
      reasonCount: numberOrNull(target.reasonCount) ?? 0,
      readyForLocalReview:
        target.noExecution === true && ["source-only", "guidance-only"].includes(target.state) && target.requiresManualReview === true
    })),
    privateMcpBoundary: privateMcpBoundary
      ? {
          visibility: privateMcpBoundary.visibility ?? null,
          credentialHandling: privateMcpBoundary.credentialHandling ?? null,
          toolResponseIsolation: privateMcpBoundary.toolResponseIsolation === true,
          reasonCount: numberOrNull(privateMcpBoundary.reasonCount) ?? 0
        }
      : null,
    resolverIntent: resolverIntent
      ? {
          intentKindCount: numberOrNull(resolverIntent.intentKindCount) ?? 0,
          ambiguityHandling: resolverIntent.ambiguityHandling ?? null,
          failClosed: resolverIntent.ambiguityHandling === "fail-closed"
        }
      : null,
    evidence: {
      inventoryDigest: uploadPlan.evidence?.inventoryDigest ?? null,
      findingCount: findings.length,
      findings
    }
  };
}

export function evaluateUploadCheckpointEvidence(registryTrust) {
  const checkpointEntries = isRecord(registryTrust) && Array.isArray(registryTrust.creatorCheckpoints)
    ? registryTrust.creatorCheckpoints
    : [];
  const acknowledged = [];

  for (const checkpoint of checkpointEntries) {
    if (!isRecord(checkpoint) || checkpoint.acknowledged !== true || typeof checkpoint.kind !== "string") {
      continue;
    }
    if (REQUIRED_CREATOR_CHECKPOINT_SET.has(checkpoint.kind) && !acknowledged.includes(checkpoint.kind)) {
      acknowledged.push(checkpoint.kind);
    }
  }

  const missing = REQUIRED_CREATOR_CHECKPOINTS.filter((kind) => !acknowledged.includes(kind));
  const packageContext = isRecord(registryTrust?.packageContext) ? registryTrust.packageContext : null;
  const packageContextReady = Boolean(
    packageContext &&
      typeof packageContext.packageDigest === "string" &&
      typeof packageContext.ownershipEvidenceVersion === "string"
  );
  const reasons = [];
  if (missing.length > 0) {
    reasons.push("creator-checkpoints-missing");
  }
  if (!packageContextReady) {
    reasons.push("package-context-evidence-missing");
  }

  const readyForReviewSubmit = missing.length === 0 && packageContextReady;

  return Object.freeze({
    schemaVersion: CHECKPOINT_SCHEMA_VERSION,
    ok: readyForReviewSubmit,
    code: readyForReviewSubmit ? "upload.checkpoints.ready" : "upload.checkpoints.required",
    readyForReviewSubmit,
    required: REQUIRED_CREATOR_CHECKPOINTS,
    acknowledged: Object.freeze(acknowledged),
    missing: Object.freeze(missing),
    packageContextReady,
    reasons: Object.freeze(reasons)
  });
}

export async function resolveSchemasDir(cwd = process.cwd()) {
  const candidates = [
    path.resolve(cwd, "schemas"),
    path.resolve(cwd, "node_modules", "@agentique.io", "schemas")
  ];

  for (const candidate of candidates) {
    try {
      await access(path.join(candidate, "resource-manifest.schema.json"));
      return candidate;
    } catch {
      // Try the next public schema location.
    }
  }

  return candidates[0];
}

function createPlanFromReport(report, registryTrust) {
  const inventory = Array.isArray(report.inventory) ? report.inventory : [];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const inventoryDigest = digestInventory(inventory);
  const registryTrustSummary = isRecord(report.manifest?.registryTrust) ? report.manifest.registryTrust : null;
  const parserVariantSummary = isRecord(report.manifest?.parserVariant) ? report.manifest.parserVariant : null;
  const agentNativeSummary = isRecord(report.manifest?.agentNative) ? report.manifest.agentNative : null;

  return {
    schemaVersion: PLAN_SCHEMA_VERSION,
    ok: report.ok,
    code: report.ok ? "upload.plan.ready" : "upload.plan.validation_failed",
    command: "upload plan",
    reviewOnly: true,
    noExecution: true,
    package: {
      name: report.manifest?.name ?? null,
      formatVersion: report.manifest?.formatVersion ?? null,
      directory: report.manifest?.name ?? null
    },
    registryTrust: registryTrustSummary,
    parserVariant: parserVariantSummary,
    agentNative: agentNativeSummary,
    checkpoints: evaluateUploadCheckpointEvidence(registryTrust),
    evidence: {
      inventory,
      findings,
      inventoryDigest,
      findingCount: findings.length
    }
  };
}

async function readManifestRegistryTrust(packageDir, readFile) {
  try {
    const parsed = JSON.parse(await readFile(path.join(packageDir, "manifest.json"), "utf8"));
    return isRecord(parsed?.registryTrust) ? parsed.registryTrust : null;
  } catch {
    return null;
  }
}

function createUnavailableCheckpointSummary() {
  return evaluateUploadCheckpointEvidence(null);
}

function digestInventory(inventory) {
  const normalized = inventory
    .map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`)
    .sort()
    .join("\n");
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function stringArrayOrEmpty(value) {
  return Array.isArray(value) ? value.filter((entry) => typeof entry === "string") : [];
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
