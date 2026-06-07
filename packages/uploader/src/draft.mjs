import { readFile as defaultReadFile } from "node:fs/promises";
import path from "node:path";
import { createUploadPlan } from "./plan.mjs";

const GENERATED_DRAFT_SCHEMA_VERSION = "agentique.uploader.generated-draft.v1";
const PATCH_DELTA_SCHEMA_VERSION = "agentique.uploader.patch-delta.v1";
const DRAFT_KINDS = new Set(["card", "manifest"]);
const PATCH_MODES = new Set(["patch", "delta"]);
const PATCH_OPS = new Set(["add", "replace", "remove"]);
const FULL_SNAPSHOT_PATHS = new Set(["/", "/manifest", "/resource", "/package", "/registryTrust"]);
const INTERNAL_MARKERS = Object.freeze(["." + "planning", "reference" + "/docs", "reference" + "\\docs"]);

const UNSAFE_TEXT_PATTERNS = Object.freeze([
  { code: "draft-overclaim-approval", pattern: /\bapproved\b/i },
  { code: "draft-overclaim-certification", pattern: /\bcertifi(?:ed|cation)\b/i },
  { code: "draft-overclaim-malware", pattern: /\bmalware[- ]?free\b/i },
  { code: "draft-overclaim-hosted-execution", pattern: /\bhosted[- ]execution\b/i },
  { code: "draft-overclaim-scan-pass", pattern: /\bscan(?:ned)?[- ]pass(?:ed)?\b/i },
  { code: "draft-overclaim-publication", pattern: /\b(?:published|listed)\b/i },
  { code: "draft-secret-like-text", pattern: /\b(?:api[_-]?key|token|password|secret|private[_-]?key)\b/i },
  { code: "draft-presigned-url-label", pattern: /\b(?:x-amz-signature|x-amz-credential|awsaccesskeyid|signature=|sig=)\b/i },
  { code: "draft-local-path", pattern: /(?:[A-Za-z]:\\|\/(?:home|users|mnt)\/)/i },
  { code: "draft-storage-key", pattern: /\b(?:storage[_-]?key|object[_-]?key)\b/i }
]);

export async function createGeneratedDraftOutput({
  packageDir,
  schemasDir = null,
  cwd = process.cwd(),
  kind = null,
  readFile = defaultReadFile
}) {
  const plan = await createUploadPlan({ packageDir, schemasDir, cwd, readFile });
  if (!plan.ok) {
    return draftFailure("upload.draft.plan_failed", "Upload plan has validation findings.", { plan });
  }

  const manifest = await readManifest({ packageDir, cwd, readFile });
  if (!manifest) {
    return draftFailure("upload.draft.manifest_unavailable", "Unable to read package manifest.", { plan });
  }

  const registryTrust = isRecord(manifest.registryTrust) ? manifest.registryTrust : {};
  const generatedDraft = isRecord(registryTrust.generatedDraft) ? registryTrust.generatedDraft : {};
  const draftKind = normalizeDraftKind(kind ?? generatedDraft.kind ?? "manifest");
  if (!draftKind) {
    return draftFailure("upload.draft.invalid_kind", "Generated draft kind must be card or manifest.", { plan });
  }

  if (generatedDraft.draftOnly !== undefined && generatedDraft.draftOnly !== true) {
    return draftFailure("upload.draft.not_draft_only", "Generated draft metadata must be draft-only.", { plan });
  }

  const draft = Object.freeze({
    kind: draftKind,
    draftOnly: true,
    submitted: false,
    generatedAt: stringOrNull(generatedDraft.generatedAt),
    schemaVersion: stringOrNull(generatedDraft.schemaVersion) ?? "agentique.local-draft.v1",
    summary: stringOrNull(generatedDraft.summary) ?? stringOrNull(manifest.summary) ?? "Draft-only local package summary for review."
  });
  const issues = collectUnsafeTextIssues([["draft.summary", draft.summary]]);
  if (issues.length > 0) {
    return draftFailure("upload.draft.unsafe_content", "Generated draft content did not pass public-language checks.", {
      plan,
      issues
    });
  }

  return Object.freeze({
    schemaVersion: GENERATED_DRAFT_SCHEMA_VERSION,
    ok: true,
    code: "upload.draft.ready",
    command: "upload draft",
    reviewOnly: true,
    draftOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    draft,
    plan: safePlanSummary(plan)
  });
}

export async function createPatchDeltaOutput({
  packageDir,
  schemasDir = null,
  cwd = process.cwd(),
  readFile = defaultReadFile
}) {
  const plan = await createUploadPlan({ packageDir, schemasDir, cwd, readFile });
  if (!plan.ok) {
    return patchFailure("upload.patch_delta.plan_failed", "Upload plan has validation findings.", { plan });
  }

  const manifest = await readManifest({ packageDir, cwd, readFile });
  if (!manifest) {
    return patchFailure("upload.patch_delta.manifest_unavailable", "Unable to read package manifest.", { plan });
  }

  const patchDelta = isRecord(manifest.registryTrust?.patchDelta) ? manifest.registryTrust.patchDelta : null;
  if (!patchDelta) {
    return patchFailure("upload.patch_delta.required", "Patch or delta metadata is required.", { plan });
  }

  const issues = [];
  const mode = typeof patchDelta.mode === "string" && PATCH_MODES.has(patchDelta.mode) ? patchDelta.mode : null;
  if (!mode) {
    issues.push(issue("patch-delta-mode-invalid", "patchDelta.mode"));
  }

  const operations = Array.isArray(patchDelta.operations) ? patchDelta.operations : [];
  if (operations.length === 0) {
    issues.push(issue("patch-delta-operations-required", "patchDelta.operations"));
  }

  const safeOperations = operations.map((operation, index) => {
    const location = `patchDelta.operations.${index}`;
    if (!isRecord(operation)) {
      issues.push(issue("patch-delta-operation-invalid", location));
      return null;
    }

    const op = typeof operation.op === "string" && PATCH_OPS.has(operation.op) ? operation.op : null;
    const operationPath = typeof operation.path === "string" ? operation.path : null;
    if (!op) {
      issues.push(issue("patch-delta-op-invalid", `${location}.op`));
    }
    if (!operationPath || !/^\/[A-Za-z0-9_/-]+$/.test(operationPath)) {
      issues.push(issue("patch-delta-path-invalid", `${location}.path`));
    } else if (FULL_SNAPSHOT_PATHS.has(operationPath)) {
      issues.push(issue("patch-delta-full-snapshot-forbidden", `${location}.path`));
    }

    const valueSummary = stringOrNull(operation.valueSummary);
    issues.push(...collectUnsafeTextIssues(valueSummary ? [[`${location}.valueSummary`, valueSummary]] : []));

    if (!op || !operationPath) {
      return null;
    }
    return Object.freeze({
      op,
      path: operationPath,
      ...(valueSummary ? { valueSummary } : {})
    });
  }).filter(Boolean);

  if (issues.length > 0) {
    const hasFullSnapshotIssue = issues.some((entry) => entry.code === "patch-delta-full-snapshot-forbidden");
    return patchFailure(
      hasFullSnapshotIssue ? "upload.patch_delta.full_snapshot_forbidden" : "upload.patch_delta.invalid",
      hasFullSnapshotIssue ? "Patch and delta metadata cannot replace a full snapshot." : "Patch or delta metadata is invalid.",
      { plan, issues }
    );
  }

  return Object.freeze({
    schemaVersion: PATCH_DELTA_SCHEMA_VERSION,
    ok: true,
    code: "upload.patch_delta.ready",
    command: "upload patch",
    reviewOnly: true,
    partialUpdateOnly: true,
    submitted: false,
    requiresUserConfirmation: true,
    requiresServerValidationBeforeSubmit: true,
    patchDelta: Object.freeze({
      mode,
      operationCount: safeOperations.length,
      operations: Object.freeze(safeOperations)
    }),
    plan: safePlanSummary(plan)
  });
}

async function readManifest({ packageDir, cwd, readFile }) {
  try {
    const content = await readFile(path.resolve(cwd, packageDir, "manifest.json"), "utf8");
    const parsed = JSON.parse(content);
    return isRecord(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

function draftFailure(code, message, { plan = null, issues = [] } = {}) {
  return Object.freeze({
    schemaVersion: GENERATED_DRAFT_SCHEMA_VERSION,
    ok: false,
    code,
    command: "upload draft",
    message,
    error: publicSafeError(code, message),
    reviewOnly: true,
    draftOnly: true,
    submitted: false,
    ...(plan ? { plan: safePlanSummary(plan) } : {}),
    ...(issues.length > 0 ? { issues: Object.freeze(issues) } : {})
  });
}

function patchFailure(code, message, { plan = null, issues = [] } = {}) {
  return Object.freeze({
    schemaVersion: PATCH_DELTA_SCHEMA_VERSION,
    ok: false,
    code,
    command: "upload patch",
    message,
    error: publicSafeError(code, message),
    reviewOnly: true,
    partialUpdateOnly: true,
    submitted: false,
    ...(plan ? { plan: safePlanSummary(plan) } : {}),
    ...(issues.length > 0 ? { issues: Object.freeze(issues) } : {})
  });
}

function collectUnsafeTextIssues(entries) {
  const issues = [];
  for (const [location, value] of entries) {
    if (typeof value !== "string") {
      continue;
    }
    for (const marker of INTERNAL_MARKERS) {
      if (value.toLowerCase().includes(marker.toLowerCase())) {
        issues.push(issue("draft-internal-marker", location));
      }
    }
    for (const { code, pattern } of UNSAFE_TEXT_PATTERNS) {
      if (pattern.test(value)) {
        issues.push(issue(code, location));
      }
    }
  }
  return issues;
}

function publicSafeError(code, message) {
  return Object.freeze({
    schemaVersion: "agentique.uploader.error.v1",
    code,
    message,
    redacted: true
  });
}

function safePlanSummary(plan) {
  return Object.freeze({
    ok: plan.ok,
    code: plan.code,
    package: plan.package,
    inventoryDigest: plan.evidence?.inventoryDigest ?? null,
    findingCount: plan.evidence?.findingCount ?? 0,
    noExecution: plan.noExecution === true,
    checkpoints: plan.checkpoints
      ? Object.freeze({
          readyForReviewSubmit: plan.checkpoints.readyForReviewSubmit === true,
          missing: plan.checkpoints.missing ?? [],
          packageContextReady: plan.checkpoints.packageContextReady === true,
          reasons: plan.checkpoints.reasons ?? []
        })
      : null
  });
}

function normalizeDraftKind(value) {
  return typeof value === "string" && DRAFT_KINDS.has(value) ? value : null;
}

function issue(code, location) {
  return Object.freeze({ code, location });
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
