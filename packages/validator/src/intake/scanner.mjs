import { promises as fs } from "node:fs";
import path from "node:path";

export const EXTERNAL_INTAKE_SCHEMA_VERSION = "agentique.externalIntake.v1";

const DEFAULT_SKIP_DIRS = new Set([".git", "node_modules"]);
const DEFAULT_INTAKE_POLICY = Object.freeze({
  maxFiles: 10000,
  maxBytes: 100 * 1024 * 1024
});
const GITATTRIBUTES_READ_LIMIT_BYTES = 64 * 1024;
const LFS_POINTER_READ_LIMIT_BYTES = 2048;
const LFS_POINTER_HEADER = "version https://git-lfs.github.com/spec/v1";

export async function scanExternalIntake(options) {
  const command = options.command ?? "external-intake";
  const sourceDir = path.resolve(options.sourceDir);
  const policy = normalizePolicy(options);
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
  applyRepositoryLimitGates({ inventory, findings, policy });

  const blockingFindings = findings.filter((finding) => finding.blocking);
  const bytes = inventory.reduce((total, item) => total + item.bytes, 0);

  return freezeReport({
    schemaVersion: EXTERNAL_INTAKE_SCHEMA_VERSION,
    command,
    source: {
      label: path.basename(sourceDir)
    },
    summary: {
      files: inventory.length,
      bytes,
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
      await applyRepositoryMetadataGates({ filePath: absolutePath, rel, stat, findings });
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

function normalizePolicy(options) {
  return Object.freeze({
    maxFiles: normalizePositiveInteger(options.maxFiles, DEFAULT_INTAKE_POLICY.maxFiles, "maxFiles"),
    maxBytes: normalizePositiveInteger(options.maxBytes, DEFAULT_INTAKE_POLICY.maxBytes, "maxBytes")
  });
}

function normalizePositiveInteger(value, fallback, name) {
  if (value === undefined || value === null) {
    return fallback;
  }

  if (!Number.isSafeInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive safe integer.`);
  }

  return value;
}

async function applyRepositoryMetadataGates({ filePath, rel, stat, findings }) {
  const basename = path.posix.basename(rel);
  if (basename === ".gitmodules") {
    findings.push(
      createFinding({
        code: "repo.submodule-config",
        severity: "high",
        message: "Submodule configuration is not allowed for external intake.",
        path: rel,
        blocking: true
      })
    );
  }

  if (basename === ".gitattributes") {
    await inspectGitAttributes({ filePath, rel, stat, findings });
  }

  await inspectLfsPointer({ filePath, rel, stat, findings });
}

async function inspectGitAttributes({ filePath, rel, stat, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: GITATTRIBUTES_READ_LIMIT_BYTES,
    findings,
    purpose: "gitattributes"
  });

  if (stat.size > GITATTRIBUTES_READ_LIMIT_BYTES) {
    findings.push(
      createFinding({
        code: "repo.metadata-truncated",
        severity: "high",
        message: "Repository metadata file exceeds bounded read limit.",
        path: rel,
        blocking: true,
        details: {
          bytes: stat.size,
          maxBytes: GITATTRIBUTES_READ_LIMIT_BYTES
        }
      })
    );
  }

  if (/\bfilter\s*=\s*lfs\b/i.test(content)) {
    findings.push(
      createFinding({
        code: "repo.lfs-attributes",
        severity: "high",
        message: "Git LFS filter rules are not allowed for external intake.",
        path: rel,
        blocking: true
      })
    );
  }
}

async function inspectLfsPointer({ filePath, rel, stat, findings }) {
  if (stat.size > LFS_POINTER_READ_LIMIT_BYTES) {
    return;
  }

  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: LFS_POINTER_READ_LIMIT_BYTES,
    findings,
    purpose: "lfs-pointer"
  });

  if (content.startsWith(LFS_POINTER_HEADER) && /\noid sha256:[a-f0-9]{64}\b/i.test(content) && /\nsize \d+\b/i.test(content)) {
    findings.push(
      createFinding({
        code: "repo.lfs-pointer",
        severity: "high",
        message: "Git LFS pointer files are not allowed for external intake.",
        path: rel,
        blocking: true
      })
    );
  }
}

async function readTextPrefix({ filePath, rel, maxBytes, findings, purpose }) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead).toString("utf8");
  } catch (error) {
    findings.push(
      createFinding({
        code: "repo.metadata-read",
        severity: "high",
        message: "Unable to read repository metadata.",
        path: rel,
        blocking: true,
        details: {
          purpose,
          reason: safeErrorCode(error)
        }
      })
    );
    return "";
  } finally {
    await handle?.close();
  }
}

function applyRepositoryLimitGates({ inventory, findings, policy }) {
  const bytes = inventory.reduce((total, item) => total + item.bytes, 0);
  if (inventory.length > policy.maxFiles) {
    findings.push(
      createFinding({
        code: "repo.max-files",
        severity: "high",
        message: "Repository file count exceeds external intake policy.",
        blocking: true,
        details: {
          files: inventory.length,
          maxFiles: policy.maxFiles
        }
      })
    );
  }

  if (bytes > policy.maxBytes) {
    findings.push(
      createFinding({
        code: "repo.max-bytes",
        severity: "high",
        message: "Repository byte count exceeds external intake policy.",
        blocking: true,
        details: {
          bytes,
          maxBytes: policy.maxBytes
        }
      })
    );
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
