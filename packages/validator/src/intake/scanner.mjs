import { createHash } from "node:crypto";
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
const DANGEROUS_TEXT_READ_LIMIT_BYTES = 32 * 1024;
const SECRET_TEXT_READ_LIMIT_BYTES = 64 * 1024;
const LICENSE_TEXT_READ_LIMIT_BYTES = 64 * 1024;
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
const DANGEROUS_CAPABILITY_RULES = Object.freeze([
  Object.freeze({
    category: "download-pipe-execute",
    pattern: /\b(?:curl|wget|iwr|invoke-webrequest)\b[\s\S]{0,120}\|\s*(?:bash|sh|zsh|powershell|pwsh|iex|invoke-expression)\b/i
  }),
  Object.freeze({
    category: "destructive-filesystem",
    pattern: /\b(?:rm\s+-rf|rmdir\s+\/s|remove-item\b[\s\S]{0,80}-recurse|del\s+\/[fqsa])\b/i
  }),
  Object.freeze({
    category: "credential-environment-access",
    pattern: /\b(?:process\.env|os\.environ|getenv\(|GITHUB_TOKEN|AWS_SECRET_ACCESS_KEY|npm_token|pypi_token)\b/i
  }),
  Object.freeze({
    category: "dotenv-file-reference",
    pattern: /(?:^|[\s"'=:\/\\])\.env(?:\.[A-Za-z0-9_-]+)?(?:\b|$)/i
  }),
  Object.freeze({
    category: "encoded-payload",
    pattern: /\b(?:base64\s+(?:-d|--decode)|frombase64string|atob\(|Buffer\.from\([^)]{0,80}base64)\b/i
  }),
  Object.freeze({
    category: "process-spawn",
    pattern: /\b(?:child_process|execSync|spawnSync|execFileSync|subprocess\.(?:run|popen|call)|ProcessBuilder)\b/i
  }),
  Object.freeze({
    category: "unpinned-reference",
    pattern: /\b(?:uses\s*:\s*[^@\s]+@(?:main|master|latest)|image\s*:\s*[^:\s]+:latest)\b/i
  }),
  Object.freeze({
    category: "self-hosted-runner",
    pattern: /\bruns-on\s*:\s*\[?[^\n]*self-hosted\b/i
  })
]);
const SECRET_RULES = Object.freeze([
  Object.freeze({ id: "private-key", pattern: /-----BEGIN [A-Z ]*PRIVATE KEY-----/gi }),
  Object.freeze({ id: "openai-key", pattern: /\bsk-[A-Za-z0-9_-]{16,}\b/g }),
  Object.freeze({ id: "github-token", pattern: /\bgh[pousr]_[A-Za-z0-9_]{20,}\b/g }),
  Object.freeze({ id: "aws-access-key", pattern: /\bAKIA[0-9A-Z]{16}\b/g }),
  Object.freeze({ id: "npm-token", pattern: /\bnpm_[A-Za-z0-9]{20,}\b/g }),
  Object.freeze({ id: "pypi-token", pattern: /\bpypi-[A-Za-z0-9_-]{20,}\b/g }),
  Object.freeze({ id: "jwt-token", pattern: /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g }),
  Object.freeze({ id: "bearer-token", pattern: /\bAuthorization\s*:\s*Bearer\s+[A-Za-z0-9._-]{16,}\b/gi }),
  Object.freeze({ id: "database-url", pattern: /\b(?:postgres|postgresql|mysql|mongodb):\/\/[^:\s/]+:[^@\s]+@[^\s]+/gi }),
  Object.freeze({ id: "credential-url", pattern: /\bhttps?:\/\/[^:\s/]+:[^@\s]+@[^\s]+/gi }),
  Object.freeze({ id: "assignment-secret", pattern: /\b(?:api[_-]?key|api[_-]?token|secret|password|token)\s*[:=]\s*["'][^"'\s]{8,}["']/gi })
]);

export async function scanExternalIntake(options) {
  const command = options.command ?? "external-intake";
  const sourceDir = path.resolve(options.sourceDir);
  const policy = normalizePolicy(options);
  const findings = [];
  const inventory = [];
  const licenses = [];

  let stat;
  try {
    stat = await fs.stat(sourceDir);
  } catch (error) {
    throw new Error(`Unable to read source directory: ${safeErrorCode(error)}`);
  }

  if (!stat.isDirectory()) {
    throw new Error("Source must be a directory.");
  }

  await walkDirectory({ root: sourceDir, current: sourceDir, inventory, findings, licenses });
  inventory.sort((left, right) => (left.path < right.path ? -1 : left.path > right.path ? 1 : 0));
  licenses.sort((left, right) => left.path.localeCompare(right.path) || left.source.localeCompare(right.source));
  applyRepositoryLimitGates({ inventory, findings, policy });
  applyLicenseGates({ licenses, findings });

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
    licenses,
    findings
  });
}

async function walkDirectory({ root, current, inventory, findings, licenses }) {
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
      await walkDirectory({ root, current: absolutePath, inventory, findings, licenses });
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
      await applyDangerousCapabilityClassifier({ filePath: absolutePath, rel, findings });
      await applySecretScanner({ filePath: absolutePath, rel, findings });
      await applyLicenseInventory({ filePath: absolutePath, rel, findings, licenses });
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

async function applyLicenseInventory({ filePath, rel, findings, licenses }) {
  const basename = path.posix.basename(rel).toLowerCase();
  if (basename === "package.json") {
    await collectPackageLicense({ filePath, rel, findings, licenses });
  }

  if (!isLicenseFileName(basename)) {
    return;
  }

  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: LICENSE_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "license-inventory"
  });
  const normalized = normalizeLicenseText(content);
  licenses.push(
    Object.freeze({
      path: rel,
      source: "license-file",
      expression: null,
      normalized,
      status: normalized ? "recognized" : "unknown",
      policy: licensePolicyForExpression(normalized)
    })
  );
}

async function collectPackageLicense({ filePath, rel, findings, licenses }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: LICENSE_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "license-package-json"
  });

  let manifest;
  try {
    manifest = JSON.parse(content);
  } catch {
    return;
  }

  const expression = packageLicenseExpression(manifest?.license);
  if (!expression) {
    return;
  }

  const normalized = normalizeLicenseExpression(expression);
  licenses.push(
    Object.freeze({
      path: rel,
      source: "package-json",
      expression,
      normalized,
      status: normalized ? "recognized" : "unknown",
      policy: licensePolicyForExpression(normalized)
    })
  );
}

function packageLicenseExpression(value) {
  if (typeof value === "string") {
    return value.trim() || null;
  }
  if (value && typeof value === "object" && typeof value.type === "string") {
    return value.type.trim() || null;
  }
  return null;
}

function isLicenseFileName(basename) {
  return basename === "license" || basename === "licence" || basename.startsWith("license.") || basename.startsWith("licence.") || basename === "copying";
}

const LICENSE_ID_NORMALIZATION = new Map([
  ["0BSD", "0BSD"],
  ["AGPL-3.0", "AGPL-3.0-only"],
  ["AGPL-3.0-ONLY", "AGPL-3.0-only"],
  ["AGPL-3.0-OR-LATER", "AGPL-3.0-or-later"],
  ["APACHE-2.0", "Apache-2.0"],
  ["ARTISTIC-2.0", "Artistic-2.0"],
  ["BSD-2-CLAUSE", "BSD-2-Clause"],
  ["BSD-3-CLAUSE", "BSD-3-Clause"],
  ["BSL-1.1", "BSL-1.1"],
  ["CC-BY-4.0", "CC-BY-4.0"],
  ["CC0-1.0", "CC0-1.0"],
  ["GPL-2.0", "GPL-2.0-only"],
  ["GPL-2.0-ONLY", "GPL-2.0-only"],
  ["GPL-2.0-OR-LATER", "GPL-2.0-or-later"],
  ["GPL-3.0", "GPL-3.0-only"],
  ["GPL-3.0-ONLY", "GPL-3.0-only"],
  ["GPL-3.0-OR-LATER", "GPL-3.0-or-later"],
  ["ISC", "ISC"],
  ["LGPL-2.1", "LGPL-2.1-only"],
  ["LGPL-2.1-ONLY", "LGPL-2.1-only"],
  ["LGPL-2.1-OR-LATER", "LGPL-2.1-or-later"],
  ["LGPL-3.0", "LGPL-3.0-only"],
  ["LGPL-3.0-ONLY", "LGPL-3.0-only"],
  ["LGPL-3.0-OR-LATER", "LGPL-3.0-or-later"],
  ["MIT", "MIT"],
  ["MPL-2.0", "MPL-2.0"],
  ["UNLICENSE", "Unlicense"]
]);

const LICENSE_POLICY = new Map([
  ["0BSD", "allowed"],
  ["AGPL-3.0-only", "blocked"],
  ["AGPL-3.0-or-later", "blocked"],
  ["Apache-2.0", "allowed"],
  ["Artistic-2.0", "needs-review"],
  ["BSD-2-Clause", "allowed"],
  ["BSD-3-Clause", "allowed"],
  ["BSL-1.1", "allowed"],
  ["CC-BY-4.0", "needs-review"],
  ["CC0-1.0", "allowed"],
  ["GPL-2.0-only", "needs-review"],
  ["GPL-2.0-or-later", "needs-review"],
  ["GPL-3.0-only", "needs-review"],
  ["GPL-3.0-or-later", "needs-review"],
  ["ISC", "allowed"],
  ["LGPL-2.1-only", "needs-review"],
  ["LGPL-2.1-or-later", "needs-review"],
  ["LGPL-3.0-only", "needs-review"],
  ["LGPL-3.0-or-later", "needs-review"],
  ["MIT", "allowed"],
  ["MPL-2.0", "allowed"],
  ["Unlicense", "allowed"]
]);

function normalizeLicenseExpression(expression) {
  const trimmed = expression.trim();
  if (!trimmed) {
    return null;
  }

  const single = normalizeLicenseIdentifier(trimmed);
  if (single) {
    return single;
  }

  const tokens = trimmed.replace(/[()]/g, " ").trim().split(/\s+(AND|OR)\s+/i);
  if (tokens.length < 3 || tokens.length % 2 === 0) {
    return null;
  }

  const normalizedTokens = [];
  for (const [index, token] of tokens.entries()) {
    const value = token.trim();
    if (!value) {
      return null;
    }

    if (index % 2 === 1) {
      const operator = value.toUpperCase();
      if (operator !== "AND" && operator !== "OR") {
        return null;
      }
      normalizedTokens.push(operator);
      continue;
    }

    const normalized = normalizeLicenseIdentifier(value);
    if (!normalized) {
      return null;
    }
    normalizedTokens.push(normalized);
  }

  return normalizedTokens.join(" ");
}

function normalizeLicenseIdentifier(value) {
  return LICENSE_ID_NORMALIZATION.get(value.trim().toUpperCase()) ?? null;
}

function licensePolicyForExpression(normalized) {
  if (!normalized) {
    return "unknown";
  }

  const identifiers = normalized.split(/\s+(?:AND|OR)\s+/).map((value) => value.trim()).filter(Boolean);
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

function normalizeLicenseText(content) {
  if (/MIT License/i.test(content)) {
    return "MIT";
  }
  if (/Apache License[\s\S]{0,400}Version 2\.0/i.test(content)) {
    return "Apache-2.0";
  }
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/i.test(content)) {
    return "GPL-3.0-only";
  }
  if (/GNU GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 2/i.test(content)) {
    return "GPL-2.0-only";
  }
  if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/i.test(content)) {
    return "LGPL-3.0-only";
  }
  if (/GNU LESSER GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 2\.1/i.test(content)) {
    return "LGPL-2.1-only";
  }
  if (/GNU AFFERO GENERAL PUBLIC LICENSE[\s\S]{0,800}Version 3/i.test(content)) {
    return "AGPL-3.0-only";
  }
  if (/Redistribution and use in source and binary forms/i.test(content) && /Neither the name/i.test(content)) {
    return "BSD-3-Clause";
  }
  if (/Redistribution and use in source and binary forms/i.test(content)) {
    return "BSD-2-Clause";
  }
  if (/ISC License/i.test(content)) {
    return "ISC";
  }
  if (/Mozilla Public License Version 2\.0/i.test(content)) {
    return "MPL-2.0";
  }
  if (/This is free and unencumbered software released into the public domain/i.test(content)) {
    return "Unlicense";
  }
  if (/Creative Commons CC0 1\.0 Universal/i.test(content)) {
    return "CC0-1.0";
  }
  if (/Boost Software License[\s\S]{0,200}Version 1\.1/i.test(content)) {
    return "BSL-1.1";
  }
  return null;
}

function applyLicenseGates({ licenses, findings }) {
  if (licenses.length === 0) {
    findings.push(
      createFinding({
        code: "license.missing",
        severity: "high",
        message: "No license signal was found in external intake.",
        blocking: true
      })
    );
    return;
  }

  for (const item of licenses) {
    const policy = item.policy ?? "unknown";
    const known = item.status === "recognized" && policy !== "unknown";
    findings.push(
      createFinding({
        code: known ? `license.${policy}` : "license.unknown",
        severity: policy === "allowed" ? "low" : "high",
        message: known
          ? policy === "allowed"
            ? "License signal is recognized and allowed by public intake policy."
            : policy === "needs-review"
              ? "License signal is recognized but requires review by public intake policy."
              : "License signal is recognized but blocked by public intake policy."
          : "Unknown license signal requires manual review.",
        path: item.path,
        blocking: policy !== "allowed",
        details: {
          source: item.source,
          expression: item.expression ?? undefined,
          normalized: item.normalized ?? undefined,
          policy
        }
      })
    );
  }

  const normalizedLicenses = [...new Set(licenses.map((item) => item.normalized).filter(Boolean))].sort();
  if (normalizedLicenses.length > 1) {
    findings.push(
      createFinding({
        code: "license.conflict",
        severity: "high",
        message: "Conflicting license signals require manual review.",
        blocking: true,
        details: {
          normalized: normalizedLicenses
        }
      })
    );
  }
}

async function applySecretScanner({ filePath, rel, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: SECRET_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "secret-scan"
  });
  if (!content) {
    return;
  }

  const seen = new Set();
  for (const rule of SECRET_RULES) {
    rule.pattern.lastIndex = 0;
    for (const match of content.matchAll(rule.pattern)) {
      const matchText = match[0];
      const index = match.index ?? 0;
      const line = lineNumberAt(content, index);
      const dedupeKey = `${rule.id}\0${line}\0${index}`;
      if (seen.has(dedupeKey)) {
        continue;
      }
      seen.add(dedupeKey);
      findings.push(
        createFinding({
          code: "secret.detected",
          severity: "critical",
          message: "Potential secret is present in external intake.",
          path: rel,
          blocking: true,
          details: {
            rule: rule.id,
            line,
            redacted: `[redacted:${rule.id}]`,
            fingerprint: fingerprintSecret({ rel, ruleId: rule.id, line, matchText })
          }
        })
      );
    }
  }
}

function lineNumberAt(content, index) {
  let line = 1;
  for (let offset = 0; offset < index; offset += 1) {
    if (content.charCodeAt(offset) === 10) {
      line += 1;
    }
  }
  return line;
}

function fingerprintSecret({ rel, ruleId, line, matchText }) {
  return `sha256:${createHash("sha256").update(`${rel}\0${ruleId}\0${line}\0${matchText}`).digest("hex")}`;
}

async function applyDangerousCapabilityClassifier({ filePath, rel, findings }) {
  const content = await readTextPrefix({
    filePath,
    rel,
    maxBytes: DANGEROUS_TEXT_READ_LIMIT_BYTES,
    findings,
    purpose: "dangerous-capability"
  });
  if (!content) {
    return;
  }

  const seenCategories = new Set();
  for (const rule of DANGEROUS_CAPABILITY_RULES) {
    if (seenCategories.has(rule.category)) {
      continue;
    }
    const match = content.match(rule.pattern);
    if (!match) {
      continue;
    }
    seenCategories.add(rule.category);
    findings.push(
      createFinding({
        code: "dangerous.capability",
        severity: "high",
        message: "Dangerous capability pattern is present in external intake.",
        path: rel,
        blocking: true,
        details: {
          category: rule.category,
          snippet: redactSnippet(extractSnippet(content, match.index ?? 0, match[0].length))
        }
      })
    );
  }
}

function extractSnippet(content, index, length) {
  const start = Math.max(0, index - 40);
  const end = Math.min(content.length, index + length + 40);
  return content.slice(start, end);
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

function truncationFindingForPurpose(purpose) {
  if (purpose === "secret-scan") {
    return {
      code: "secret.truncated",
      severity: "critical",
      message: "Secret scan input exceeded inspected prefix."
    };
  }
  if (purpose === "dangerous-capability") {
    return {
      code: "dangerous.truncated",
      severity: "high",
      message: "Dangerous capability input exceeded inspected prefix."
    };
  }
  if (purpose.startsWith("script-")) {
    return {
      code: "script.truncated",
      severity: "high",
      message: "Script or workflow input exceeded inspected prefix."
    };
  }
  return null;
}

async function readBufferPrefix({ filePath, rel, maxBytes, findings, purpose }) {
  let handle;
  try {
    const stat = await fs.stat(filePath);
    const truncationFinding = truncationFindingForPurpose(purpose);
    // IMPORTANT: high-risk external intake reads must fail closed when bounded prefix inspection is incomplete.
    if (truncationFinding && stat.size > maxBytes) {
      findings.push(
        createFinding({
          code: truncationFinding.code,
          severity: truncationFinding.severity,
          message: truncationFinding.message,
          path: rel,
          blocking: true,
          details: {
            purpose,
            bytes: stat.size,
            maxBytes
          }
        })
      );
    }

    handle = await fs.open(filePath, "r");
    const buffer = Buffer.alloc(maxBytes);
    const result = await handle.read(buffer, 0, maxBytes, 0);
    return buffer.subarray(0, result.bytesRead);
  } catch (error) {
    const isPayloadRead = purpose === "payload-classifier";
    const isScriptRead = purpose.startsWith("script-");
    const isDangerousRead = purpose === "dangerous-capability";
    const isSecretRead = purpose === "secret-scan";
    const isLicenseRead = purpose.startsWith("license-");
    findings.push(
      createFinding({
        code: isPayloadRead
          ? "payload.read-file"
          : isScriptRead
            ? "script.read-file"
            : isDangerousRead
              ? "dangerous.read-file"
              : isSecretRead
                ? "secret.read-file"
                : isLicenseRead
                  ? "license.read-file"
                  : "repo.metadata-read",
        severity: "high",
        message: isPayloadRead
          ? "Unable to read file prefix for payload classification."
          : isScriptRead
            ? "Unable to read file prefix for script inventory."
            : isDangerousRead
              ? "Unable to read file prefix for dangerous capability classification."
              : isSecretRead
                ? "Unable to read file prefix for secret scanning."
                : isLicenseRead
                  ? "Unable to read file prefix for license inventory."
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
    licenses: Object.freeze((report.licenses ?? []).map((item) => Object.freeze({ ...item }))),
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
