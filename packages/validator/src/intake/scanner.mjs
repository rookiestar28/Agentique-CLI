import { promises as fs } from "node:fs";
import path from "node:path";

export const EXTERNAL_INTAKE_SCHEMA_VERSION = "agentique.externalIntake.v1";

const DEFAULT_SKIP_DIRS = new Set([".git", "node_modules"]);

export async function scanExternalIntake(options) {
  const command = options.command ?? "external-intake";
  const sourceDir = path.resolve(options.sourceDir);
  const findings = [];
  const inventory = [];

  let stat;
  try {
    stat = await fs.stat(sourceDir);
  } catch (error) {
    throw new Error(`Unable to read source directory: ${safeErrorCode(error)}`);
  }

  if (!stat.isDirectory()) {
    throw new Error("Source must be a directory.");
  }

  await walkDirectory({ root: sourceDir, current: sourceDir, inventory, findings });
  inventory.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));

  const blockingFindings = findings.filter((finding) => finding.blocking);

  return freezeReport({
    schemaVersion: EXTERNAL_INTAKE_SCHEMA_VERSION,
    command,
    source: {
      label: path.basename(sourceDir)
    },
    summary: {
      files: inventory.length,
      findings: findings.length,
      blockingFindings: blockingFindings.length
    },
    decision: blockingFindings.length > 0 ? "blocked" : "passed",
    inventory,
    findings
  });
}

async function walkDirectory({ root, current, inventory, findings }) {
  let entries;
  try {
    entries = await fs.readdir(current, { withFileTypes: true });
  } catch (error) {
    findings.push(
      createFinding({
        code: "intake.read-directory",
        severity: "high",
        message: "Unable to read directory.",
        path: relativePath(root, current),
        blocking: true,
        details: { reason: safeErrorCode(error) }
      })
    );
    return;
  }

  entries.sort((left, right) => left.name.localeCompare(right.name));

  for (const entry of entries) {
    const absolutePath = path.join(current, entry.name);
    const rel = relativePath(root, absolutePath);

    if (entry.isDirectory()) {
      if (DEFAULT_SKIP_DIRS.has(entry.name)) {
        continue;
      }
      await walkDirectory({ root, current: absolutePath, inventory, findings });
      continue;
    }

    if (!entry.isFile()) {
      findings.push(
        createFinding({
          code: "intake.unsupported-entry",
          severity: "medium",
          message: "Only regular files are supported in external intake inventory.",
          path: rel,
          blocking: true
        })
      );
      continue;
    }

    try {
      const stat = await fs.stat(absolutePath);
      inventory.push({
        path: rel,
        bytes: stat.size
      });
    } catch (error) {
      findings.push(
        createFinding({
          code: "intake.read-file",
          severity: "high",
          message: "Unable to stat file.",
          path: rel,
          blocking: true,
          details: { reason: safeErrorCode(error) }
        })
      );
    }
  }
}

function createFinding({ code, severity, message, path: findingPath = ".", blocking = false, details = {} }) {
  return Object.freeze({
    code,
    severity,
    message,
    path: normalizeReportPath(findingPath),
    blocking,
    details: freezePlainObject(details)
  });
}

function relativePath(root, absolutePath) {
  const rel = path.relative(root, absolutePath) || ".";
  return normalizeReportPath(rel);
}

function normalizeReportPath(value) {
  return String(value).replace(/\\/g, "/");
}

function safeErrorCode(error) {
  return typeof error?.code === "string" ? error.code : "unknown";
}

function freezeReport(report) {
  return Object.freeze({
    ...report,
    source: Object.freeze({ ...report.source }),
    summary: Object.freeze({ ...report.summary }),
    inventory: Object.freeze(report.inventory.map((item) => Object.freeze({ ...item }))),
    findings: Object.freeze(report.findings.map((item) => freezeFinding(item)))
  });
}

function freezeFinding(finding) {
  return Object.freeze({
    ...finding,
    details: freezePlainObject(finding.details ?? {})
  });
}

function freezePlainObject(value) {
  return Object.freeze({ ...value });
}
