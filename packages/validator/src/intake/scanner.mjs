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
const PAYLOAD_PREFIX_READ_LIMIT_BYTES = 4096;
const SCRIPT_TEXT_READ_LIMIT_BYTES = 32 * 1024;
const ARCHIVE_EXTENSIONS = new Set([".7z", ".gz", ".rar", ".tar", ".tar.gz", ".tgz", ".zip"]);
const EXECUTABLE_EXTENSIONS = new Set([
  ".bat",
  ".cmd",
  ".com",
  ".dll",
  ".dylib",
  ".exe",
  ".jar",
  ".msi",
  ".node",
  ".ps1",
  ".sh",
  ".so",
  ".wasm"
]);
const PACKAGE_LIFECYCLE_SCRIPTS = new Set(["preinstall", "install", "postinstall", "prepare", "prepublish", "prepublishonly", "prepack", "postpack"]);
const EXECUTABLE_SURFACE_EXTENSIONS = new Set([".bash", ".ps1", ".sh", ".zsh"]);

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
      await applyPayloadClassifier({ filePath: absolutePath, rel, findings });
      await applyScriptWorkflowInventory({ filePath: absolutePath, rel, findings });
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

async function applyScriptWorkflowInventory({ filePath, rel, findings }) {
  const lowerPath = rel.toLowerCase();
  const basename = path.posix.basename(lowerPath);

  if (basename === "package.json") {
    await inspectPackageScripts({ filePath, rel, findings });
  }

  if (/^\.github\/workflows\/[^/]+\.ya?ml$/i.test(rel)) {
    await inspectWorkflowFile({ filePath, rel, findings });
  }

  if (basename === "action.yml" || basename === "action.yaml") {
    await inspectCompositeAction({ filePath, rel, findings });
  }

  if (isExecutableSurfacePath(lowerPath)) {
    const content = await readTextPrefix({
      filePath,
      rel,
      maxBytes: SCRIPT_TEXT_READ_LIMIT_BYTES,
      findings,
      purpose: "script-inventory"
    });
    findings.push(
      createFinding({
        code: "script.executable-surface",
        severity: "high",
        message: "Executable file surface is present in external intake.",
        path: rel,
        blocking: true,
        details: {
          surface: executableSurfaceKind(lowerPath),
          snippet: redactSnippet(content)
        }
      })
    );
  }
}

async function inspectPackageScripts({ filePath, rel, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: SCRIPT_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "script-package-json"
  });

  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    findings.push(
      createFinding({
        code: "script.package-json-parse",
        severity: "high",
        message: "Unable to parse package.json for script inventory.",
        path: rel,
        blocking: true
      })
    );
    return;
  }

  if (!manifest || typeof manifest !== "object" || !manifest.scripts || typeof manifest.scripts !== "object") {
    return;
  }

  for (const [name, command] of Object.entries(manifest.scripts).sort(([left], [right]) => left.localeCompare(right))) {
    if (typeof command !== "string") {
      continue;
    }
    const lifecycle = PACKAGE_LIFECYCLE_SCRIPTS.has(name.toLowerCase());
    findings.push(
      createFinding({
        code: lifecycle ? "script.lifecycle" : "script.package-script",
        severity: lifecycle ? "high" : "medium",
        message: lifecycle ? "Package lifecycle script is present in external intake." : "Package script is present in external intake inventory.",
        path: rel,
        blocking: lifecycle,
        details: {
          name,
          snippet: redactSnippet(command)
        }
      })
    );
  }
}

async function inspectWorkflowFile({ filePath, rel, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: SCRIPT_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "script-workflow"
  });
  const runLine = content.split(/\r?\n/).find((line) => /^\s*(?:-\s*)?run\s*:/.test(line));
  if (!runLine) {
    return;
  }

  findings.push(
    createFinding({
      code: "script.workflow-run",
      severity: "high",
      message: "GitHub workflow run step is present in external intake.",
      path: rel,
      blocking: true,
      details: {
        snippet: redactSnippet(runLine)
      }
    })
  );
}

async function inspectCompositeAction({ filePath, rel, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: SCRIPT_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "script-composite-action"
  });
  if (!/runs\s*:[\s\S]*using\s*:\s*['"]?composite['"]?/i.test(content)) {
    return;
  }

  findings.push(
    createFinding({
      code: "script.composite-action",
      severity: "high",
      message: "Composite action entrypoint is present in external intake.",
      path: rel,
      blocking: true,
      details: {
        snippet: redactSnippet(content)
      }
    })
  );
}

function isExecutableSurfacePath(lowerPath) {
  const basename = path.posix.basename(lowerPath);
  if (basename === "dockerfile" || lowerPath.endsWith(".dockerfile")) {
    return true;
  }
  if (basename === "makefile" || basename === "gnumakefile") {
    return true;
  }
  for (const extension of EXECUTABLE_SURFACE_EXTENSIONS) {
    if (lowerPath.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function executableSurfaceKind(lowerPath) {
  const basename = path.posix.basename(lowerPath);
  if (basename === "dockerfile" || lowerPath.endsWith(".dockerfile")) {
    return "dockerfile";
  }
  if (basename === "makefile" || basename === "gnumakefile") {
    return "makefile";
  }
  if (lowerPath.endsWith(".ps1")) {
    return "powershell";
  }
  return "shell";
}

function redactSnippet(value) {
  return String(value)
    .replace(/(bearer\s+)[A-Za-z0-9._-]{8,}/gi, "$1[redacted-token]")
    .replace(/\b(sk-[A-Za-z0-9_-]{8,}|gh[pousr]_[A-Za-z0-9_]{8,}|AKIA[0-9A-Z]{12,})\b/g, "[redacted-token]")
    .replace(/\b(token|secret|password|api[_-]?key)\s*[:=]\s*["']?[^"',\s]+/gi, "$1=[redacted]")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 160);
}

async function applyPayloadClassifier({ filePath, rel, findings }) {
  const lowerPath = rel.toLowerCase();
  const extensionSignals = [];
  if (hasCompoundExtension(lowerPath, ARCHIVE_EXTENSIONS)) {
    extensionSignals.push("archive-extension");
  }
  if (hasCompoundExtension(lowerPath, EXECUTABLE_EXTENSIONS)) {
    extensionSignals.push("executable-extension");
  }

  const prefix = await readBufferPrefix({
    filePath,
    rel,
    maxBytes: PAYLOAD_PREFIX_READ_LIMIT_BYTES,
    findings,
    purpose: "payload-classifier"
  });
  if (!prefix) {
    return;
  }

  const magicSignals = detectMagicSignals(prefix);
  const signals = [...extensionSignals, ...magicSignals];
  if (isBinaryLike(prefix) && !signals.includes("binary-heuristic")) {
    signals.push("binary-heuristic");
  }

  const category = classifyPayloadSignals(signals);
  if (!category) {
    return;
  }

  findings.push(
    createFinding({
      code: `payload.${category}`,
      severity: "high",
      message: `External intake does not allow ${category} payloads.`,
      path: rel,
      blocking: true,
      details: {
        category,
        signals: stableUnique(signals)
      }
    })
  );
}

function hasCompoundExtension(lowerPath, extensionSet) {
  for (const extension of extensionSet) {
    if (lowerPath.endsWith(extension)) {
      return true;
    }
  }
  return false;
}

function detectMagicSignals(buffer) {
  const signals = [];
  if (hasBytes(buffer, [0x50, 0x4b, 0x03, 0x04]) || hasBytes(buffer, [0x50, 0x4b, 0x05, 0x06]) || hasBytes(buffer, [0x50, 0x4b, 0x07, 0x08])) {
    signals.push("zip-magic");
  }
  if (hasBytes(buffer, [0x1f, 0x8b])) {
    signals.push("gzip-magic");
  }
  if (hasBytes(buffer, [0x4d, 0x5a])) {
    signals.push("pe-magic");
  }
  if (hasBytes(buffer, [0x7f, 0x45, 0x4c, 0x46])) {
    signals.push("elf-magic");
  }
  if (
    hasBytes(buffer, [0xfe, 0xed, 0xfa, 0xce]) ||
    hasBytes(buffer, [0xfe, 0xed, 0xfa, 0xcf]) ||
    hasBytes(buffer, [0xce, 0xfa, 0xed, 0xfe]) ||
    hasBytes(buffer, [0xcf, 0xfa, 0xed, 0xfe]) ||
    hasBytes(buffer, [0xca, 0xfe, 0xba, 0xbe])
  ) {
    signals.push("macho-magic");
  }
  if (hasBytes(buffer, [0x25, 0x50, 0x44, 0x46, 0x2d])) {
    signals.push("pdf-magic");
  }
  if (buffer.subarray(0, 16).toString("ascii") === "SQLite format 3\0") {
    signals.push("sqlite-magic");
  }
  return signals;
}

function hasBytes(buffer, bytes) {
  if (buffer.length < bytes.length) {
    return false;
  }
  return bytes.every((byte, index) => buffer[index] === byte);
}

function isBinaryLike(buffer) {
  if (buffer.length === 0) {
    return false;
  }

  let controlBytes = 0;
  for (const byte of buffer) {
    if (byte === 0) {
      return true;
    }
    if ((byte < 0x09 || (byte > 0x0d && byte < 0x20)) && byte !== 0x1b) {
      controlBytes += 1;
    }
  }

  return controlBytes / buffer.length > 0.1;
}

function classifyPayloadSignals(signals) {
  if (signals.some((signal) => signal === "archive-extension" || signal === "zip-magic" || signal === "gzip-magic")) {
    return "archive";
  }
  if (signals.some((signal) => signal === "executable-extension" || signal === "pe-magic" || signal === "elf-magic" || signal === "macho-magic")) {
    return "executable";
  }
  if (signals.some((signal) => signal === "binary-heuristic" || signal === "pdf-magic" || signal === "sqlite-magic")) {
    return "binary";
  }
  return null;
}

function stableUnique(values) {
  return [...new Set(values)].sort();
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
  const buffer = await readBufferPrefix({ filePath, rel, maxBytes, findings, purpose });
  return buffer ? buffer.toString("utf8") : "";
}

async function readBufferPrefix({ filePath, rel, maxBytes, findings, purpose }) {
  let handle;
  try {
    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch (error) {
    const isPayloadRead = purpose === "payload-classifier";
    const isScriptRead = purpose.startsWith("script-");
    findings.push(
      createFinding({
        code: isPayloadRead ? "payload.read-file" : isScriptRead ? "script.read-file" : "repo.metadata-read",
        severity: "high",
        message: isPayloadRead
          ? "Unable to read file prefix for payload classification."
          : isScriptRead
            ? "Unable to read file prefix for script inventory."
            : "Unable to read repository metadata.",
        path: rel,
        blocking: true,
        details: {
          purpose,
          reason: safeErrorCode(error)
        }
      })
    );
    return null;
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
