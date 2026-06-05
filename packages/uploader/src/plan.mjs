import { createHash } from "node:crypto";
import { access } from "node:fs/promises";
import path from "node:path";
import { validatePackage } from "@agentique.io/validator/src/validator.mjs";

const PLAN_SCHEMA_VERSION = "agentique.uploader.plan.v1";

export async function createUploadPlan({ packageDir, schemasDir = null, cwd = process.cwd() }) {
  try {
    const resolvedSchemasDir = schemasDir ? path.resolve(cwd, schemasDir) : await resolveSchemasDir(cwd);
    const report = await validatePackage({
      command: "upload-plan",
      packageDir: path.resolve(cwd, packageDir),
      schemasDir: resolvedSchemasDir
    });

    return createPlanFromReport(report);
  } catch {
    return {
      schemaVersion: PLAN_SCHEMA_VERSION,
      ok: false,
      code: "upload.plan.unavailable",
      command: "upload plan",
      reviewOnly: true,
      noExecution: true,
      package: null,
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

function createPlanFromReport(report) {
  const inventory = Array.isArray(report.inventory) ? report.inventory : [];
  const findings = Array.isArray(report.findings) ? report.findings : [];
  const inventoryDigest = digestInventory(inventory);

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
      directory: report.manifest?.name ? report.packageDir ?? null : null
    },
    evidence: {
      inventory,
      findings,
      inventoryDigest,
      findingCount: findings.length
    }
  };
}

function digestInventory(inventory) {
  const normalized = inventory
    .map((entry) => `${entry.path}\0${entry.sha256}\0${entry.bytes}`)
    .sort()
    .join("\n");
  return `sha256:${createHash("sha256").update(normalized).digest("hex")}`;
}
