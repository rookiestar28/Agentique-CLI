import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const schemaFiles = [
  "distribution-mode.schema.json",
  "package-manifest.schema.json",
  "public-readback.schema.json",
  "resource-manifest.schema.json",
  "skill-metadata.schema.json",
  "surfacing-metadata.schema.json",
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
  { id: "private-directory", pattern: /(?:^|[\\/\s])private(?:[\\/\s]|$)/i }
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
    await inspectPackageFile({ packageDir, rel, expectedHash: packageHashes[rel], findings });
  }

  scanJsonValue(manifest, "manifest", findings);

  const inventory = [];
  for (const rel of packageFiles) {
    const filePath = resolveInside(packageDir, rel);
    if (!filePath) continue;
    try {
      const bytes = await fs.readFile(filePath);
      inventory.push({
        path: rel,
        sha256: createHash("sha256").update(bytes).digest("hex"),
        bytes: bytes.length
      });
    } catch {
      // Missing files are already reported by inspectPackageFile.
    }
  }

  return createReport({
    ok: findings.length === 0,
    command,
    packageDir,
    manifest: manifest
      ? {
          name: typeof manifest.name === "string" ? manifest.name : null,
          formatVersion: typeof manifest.formatVersion === "string" ? manifest.formatVersion : null
        }
      : null,
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
  try {
    const raw = await fs.readFile(filePath, "utf8");
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

async function inspectPackageFile({ packageDir, rel, expectedHash, findings }) {
  const filePath = resolveInside(packageDir, rel);
  if (!filePath) {
    findings.push(finding("unsafe-path", "Resolved file path escaped the package directory.", rel));
    return;
  }

  let bytes;
  try {
    bytes = await fs.readFile(filePath);
  } catch {
    findings.push(finding("missing-file", "Package file listed in manifest is missing.", rel));
    return;
  }

  const actualHash = `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
  if (expectedHash && expectedHash !== actualHash) {
    findings.push(finding("hash-mismatch", "Package file hash does not match manifest.", rel));
  }

  const text = bytes.toString("utf8");
  scanText(text, rel, findings);
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
    if (rule.pattern.test(text)) {
      findings.push(finding(rule.id, "Secret-like value detected and redacted.", location));
    }
  }
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
