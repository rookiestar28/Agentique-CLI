import { createHash } from "node:crypto";
import { createReadStream, promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const PORTABLE_GENERATOR_VERSION = "0.1.0";
export const PORTABLE_PROFILE_SCHEMA_ID = "https://schemas.agentique.io/portable-profile.schema.json";
export const GENERATED_ADAPTER_MANIFEST_SCHEMA_ID = "https://schemas.agentique.io/generated-adapter-manifest.schema.json";

const supportedGeneratorTargets = new Set(["codex-skill", "claude-code-skill", "gemini-cli", "opencode"]);
const userConfigSegments = new Set([
  ".codex",
  ".claude",
  ".gemini",
  ".opencode",
  ".cursor"
]);
const skippedLedgerDirs = new Set([
  ".git",
  ".next",
  ".cache",
  ".tmp",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "test-results"
]);
const ledgerTextExtensions = new Set([".js", ".json", ".md", ".mjs", ".txt", ".yaml", ".yml"]);
const ledgerCeilingRank = new Map([
  ["low", 1],
  ["medium", 2],
  ["high", 3]
]);
const credentialEnvPattern = /(?:TOKEN|SECRET|PASSWORD|API[_-]?KEY|CREDENTIAL|PRIVATE[_-]?KEY)/i;

export async function generatePortableAdapter({ sourcePath, targetId, outputDir, schemasDir }) {
  const findings = [];
  const source = await readPortableProfile(sourcePath, schemasDir, findings);
  if (!source.profile) {
    return portabilityReport({ ok: false, command: "portable-generate", sourcePath, targetId, findings });
  }

  const target = source.profile.targetHosts.find((entry) => entry.targetId === targetId);
  if (!target || !supportedGeneratorTargets.has(targetId) || ["unsupported", "blocked"].includes(target.support)) {
    findings.push(finding("target-unsupported", "Target is not supported for static adapter generation.", "target"));
  }

  const outputSafety = validateExplicitOutputDir(outputDir);
  findings.push(...outputSafety.findings);

  if (findings.length > 0) {
    return portabilityReport({ ok: false, command: "portable-generate", sourcePath, targetId, findings });
  }

  const resolvedOutputDir = outputSafety.resolvedOutputDir;
  const adapterRelPath = adapterPathForTarget(targetId);
  const adapterContent = renderAdapterDescriptor(source.profile, target);
  const adapterPath = path.join(resolvedOutputDir, ...adapterRelPath.split("/"));
  await fs.mkdir(path.dirname(adapterPath), { recursive: true });
  await fs.writeFile(adapterPath, adapterContent, "utf8");

  const adapterStat = await fs.stat(adapterPath);
  const adapterDigest = `sha256:${await hashFileSha256(adapterPath)}`;
  const generatedAt = new Date().toISOString();
  const manifest = {
    contractVersion: "1.0",
    generator: {
      name: "agentique-portable-adapter-generator",
      version: PORTABLE_GENERATOR_VERSION,
      generatedAt
    },
    source: {
      profileId: source.profile.profileId,
      sourceDigest: source.rawDigest,
      schemaId: PORTABLE_PROFILE_SCHEMA_ID
    },
    target: {
      targetId: target.targetId,
      support: target.support === "static-commands" ? "static-commands" : "instruction-only",
      artifactKind: target.artifactKind,
      noExecution: true
    },
    files: [
      {
        path: adapterRelPath,
        role: target.support === "static-commands" ? "command" : "descriptor",
        bytes: adapterStat.size,
        sha256: adapterDigest
      }
    ],
    commandMappings: source.profile.commands.map((command) => ({
      commandId: command.commandId,
      profileId: command.profileId,
      mode: command.mode,
      path: adapterRelPath,
      invariantPhrases: ["do not install or execute", "descriptor-only"]
    })),
    invariantPhrases: ["do not install or execute", "descriptor-only"],
    safety: {
      noExecution: true,
      installsDependencies: false,
      writesUserConfig: false,
      trustsLifecycleHooks: false,
      networkAccess: false,
      referenceExecution: false
    },
    drift: {
      status: "current",
      checkedAt: generatedAt
    }
  };

  const manifestPath = path.join(resolvedOutputDir, "portable", "generated-adapter-manifest.json");
  await fs.mkdir(path.dirname(manifestPath), { recursive: true });
  await writeJson(manifestPath, manifest);
  const manifestStat = await fs.stat(manifestPath);
  const manifestDigest = `sha256:${await hashFileSha256(manifestPath)}`;

  return {
    ok: true,
    command: "portable-generate",
    source: labelForPath(sourcePath),
    targetId,
    files: [
      manifest.files[0],
      {
        path: "portable/generated-adapter-manifest.json",
        role: "manifest",
        bytes: manifestStat.size,
        sha256: manifestDigest
      }
    ],
    findings: []
  };
}

export async function validatePortableDrift({ sourcePath, manifestPath, outputDir, schemasDir }) {
  const findings = [];
  const source = await readPortableProfile(sourcePath, schemasDir, findings);
  const manifest = await readGeneratedManifest(manifestPath, schemasDir, findings);

  if (!source.profile || !manifest.value) {
    return driftReport({ ok: false, sourcePath, manifestPath, status: "mismatch", findings });
  }

  if (manifest.value.source.profileId !== source.profile.profileId) {
    findings.push(finding("source-profile-mismatch", "Generated manifest source profile does not match the canonical profile.", "source"));
  }
  if (manifest.value.source.sourceDigest !== source.rawDigest) {
    findings.push(finding("source-digest-mismatch", "Generated manifest source digest is stale.", "source"));
  }
  if (manifest.value.generator.version !== PORTABLE_GENERATOR_VERSION) {
    findings.push(finding("generator-version-mismatch", "Generated manifest was produced by a different generator version.", "generator"));
  }

  await inspectManifestFiles({ manifest: manifest.value, outputDir, findings });
  await inspectInvariantPhrases({ manifest: manifest.value, outputDir, findings });
  await inspectCommandMappings({ profile: source.profile, manifest: manifest.value, outputDir, findings });

  return driftReport({
    ok: findings.length === 0,
    sourcePath,
    manifestPath,
    status: findings.length === 0 ? "current" : "stale",
    findings
  });
}

export async function validatePortableParity({ sourcePath, manifestPath, outputDir, schemasDir }) {
  const findings = [];
  const source = await readPortableProfile(sourcePath, schemasDir, findings);
  const manifest = await readGeneratedManifest(manifestPath, schemasDir, findings);

  if (!source.profile || !manifest.value) {
    return parityReport({ ok: false, sourcePath, manifestPath, findings, summary: null });
  }

  const target = source.profile.targetHosts.find((entry) => entry.targetId === manifest.value.target.targetId);
  if (!target) {
    findings.push(finding("target-unsupported", "Generated target is not declared by the portable profile.", "target"));
  } else {
    if (target.noExecution !== true || target.writesUserConfig !== false || target.lifecycleHooksTrusted !== false) {
      findings.push(finding("target-unsafe", "Target host must be no-execution, no user-config write, and no lifecycle-hook trust.", "target"));
    }
    if (target.support === "unsupported" || target.support === "blocked") {
      findings.push(finding("target-unsupported", "Unsupported or blocked target cannot pass parity.", "target"));
    }
  }

  await inspectCommandMappings({ profile: source.profile, manifest: manifest.value, outputDir, findings });

  const sourceCommandIds = new Set(source.profile.commands.map((command) => command.commandId));
  const mappedCommandIds = new Set(manifest.value.commandMappings.map((mapping) => mapping.commandId));
  for (const commandId of sourceCommandIds) {
    if (!mappedCommandIds.has(commandId)) {
      findings.push(finding("command-mapping-missing", "Source command is not mapped in the generated adapter manifest.", commandId));
    }
  }

  const profileIds = new Set(source.profile.profiles.map((profile) => profile.profileId));
  for (const command of source.profile.commands) {
    if (!profileIds.has(command.profileId)) {
      findings.push(finding("profile-alias-mismatch", "Command references a missing profile.", command.commandId));
    }
  }

  return parityReport({
    ok: findings.length === 0,
    sourcePath,
    manifestPath,
    findings,
    summary: {
      sourceCommands: source.profile.commands.length,
      commandMappings: manifest.value.commandMappings.length,
      profiles: source.profile.profiles.length,
      instructionOnlyTargets: target && target.support === "instruction-only" ? 1 : 0
    }
  });
}

export async function collectDeferredRiskLedger({ rootDir }) {
  const resolvedRoot = path.resolve(rootDir);
  const findings = [];
  const markers = [];

  let stat;
  try {
    stat = await fs.stat(resolvedRoot);
  } catch {
    return {
      ok: false,
      command: "debt-ledger",
      root: labelForPath(rootDir),
      summary: { markers: 0, maxCeiling: "none" },
      markers: [],
      findings: [finding("root-read", "Root directory cannot be read.", "root")]
    };
  }

  if (!stat.isDirectory()) {
    return {
      ok: false,
      command: "debt-ledger",
      root: labelForPath(rootDir),
      summary: { markers: 0, maxCeiling: "none" },
      markers: [],
      findings: [finding("root-not-directory", "Root must be a directory.", "root")]
    };
  }

  for await (const filePath of walkLedgerFiles(resolvedRoot)) {
    const rel = toPosix(path.relative(resolvedRoot, filePath));
    const content = await fs.readFile(filePath, "utf8");
    const lines = content.split(/\r?\n/);
    lines.forEach((line, index) => {
      if (!line.includes("AGENTIQUE_DEFERRED_RISK")) {
        return;
      }
      const fields = parseMarkerFields(line);
      const marker = {
        file: rel,
        line: index + 1,
        ceiling: fields.ceiling ?? "unknown",
        upgradeTrigger: fields.trigger ? redactMarkerValue(fields.trigger) : null,
        status: fields.status ? redactMarkerValue(fields.status) : "unknown",
        redacted: true
      };
      markers.push(marker);
      if (!ledgerCeilingRank.has(fields.ceiling ?? "")) {
        findings.push(finding("deferred-risk-ceiling-invalid", "Deferred-risk marker requires a low, medium, or high ceiling.", rel));
      }
      if (!fields.trigger) {
        findings.push(finding("deferred-risk-trigger-missing", "Deferred-risk marker requires an upgrade trigger.", rel));
      }
    });
  }

  return {
    ok: findings.length === 0,
    command: "debt-ledger",
    root: labelForPath(rootDir),
    summary: {
      markers: markers.length,
      maxCeiling: maxCeiling(markers)
    },
    markers,
    findings
  };
}

export async function evaluatePortableProfile({ sourcePath, outputDir, sandbox, schemasDir, env = process.env }) {
  const findings = [];
  const source = await readPortableProfile(sourcePath, schemasDir, findings);

  if (sandbox !== "no-exec-temp") {
    findings.push(finding("sandbox-required", "Evaluation requires explicit no-exec-temp sandbox mode.", "sandbox"));
  }

  if (!outputDir) {
    findings.push(finding("output-required", "Evaluation requires an explicit output directory.", "output"));
  }

  const credentialKeys = Object.keys(env).filter((key) => credentialEnvPattern.test(key) && String(env[key] ?? "").length > 0);
  if (credentialKeys.length > 0) {
    findings.push(finding("credential-env-detected", "Credential-like environment variables are present and were not read.", "environment"));
  }

  if (!source.profile || findings.length > 0) {
    return {
      ok: false,
      command: "portable-eval",
      decision: "no_go",
      source: labelForPath(sourcePath),
      correctnessGate: "not_claimed",
      sandbox: {
        mode: sandbox ?? "missing",
        disposableTempDir: false,
        networkAccess: false,
        referenceExecution: false,
        credentialsPresent: credentialKeys.length > 0
      },
      findings
    };
  }

  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portable-eval-"));
  const report = {
    ok: true,
    command: "portable-eval",
    decision: "measurement_only",
    source: labelForPath(sourcePath),
    correctnessGate: "not_claimed",
    sandbox: {
      mode: sandbox,
      disposableTempDir: true,
      tempDirDisposed: false,
      networkAccess: false,
      ambientFilesystemAuthority: false,
      referenceExecution: false,
      credentialsPresent: false
    },
    measurements: {
      profileCount: source.profile.profiles.length,
      commandCount: source.profile.commands.length,
      targetCount: source.profile.targetHosts.length,
      instructionBytes: Buffer.byteLength(source.profile.commands.map((command) => command.instruction).join("\n"), "utf8")
    },
    findings: []
  };

  const resolvedOutputDir = path.resolve(outputDir);
  await fs.mkdir(resolvedOutputDir, { recursive: true });
  await writeJson(path.join(resolvedOutputDir, "portable-eval-report.json"), report);
  await fs.rm(tempDir, { recursive: true, force: true });
  report.sandbox.tempDirDisposed = true;
  await writeJson(path.join(resolvedOutputDir, "portable-eval-report.json"), report);
  return report;
}

export function formatPortabilityHuman(report) {
  const state = report.ok ? "OK" : "FAILED";
  const label = report.command ?? "portability";
  const target = report.targetId ? ` ${report.targetId}` : "";
  const lines = [`${state} ${label}${target}`];
  if (report.status) {
    lines.push(`- status: ${report.status}`);
  }
  if (report.decision) {
    lines.push(`- decision: ${report.decision}`);
  }
  for (const item of report.findings ?? []) {
    lines.push(`- ${item.code} at ${item.location}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}

async function readPortableProfile(sourcePath, schemasDir, findings) {
  const loaded = await readJsonWithDigest(sourcePath, "source", findings);
  if (!loaded.value) {
    return { profile: null, rawDigest: null };
  }
  const ajv = await loadPortabilityAjv(schemasDir);
  const validate = ajv.getSchema(PORTABLE_PROFILE_SCHEMA_ID);
  if (!validate(loaded.value)) {
    for (const error of validate.errors ?? []) {
      findings.push(finding("portable-profile-schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "source"));
    }
    return { profile: null, rawDigest: loaded.digest };
  }
  return { profile: loaded.value, rawDigest: loaded.digest };
}

async function readGeneratedManifest(manifestPath, schemasDir, findings) {
  const loaded = await readJsonWithDigest(manifestPath, "manifest", findings);
  if (!loaded.value) {
    return { value: null, rawDigest: null };
  }
  const ajv = await loadPortabilityAjv(schemasDir);
  const validate = ajv.getSchema(GENERATED_ADAPTER_MANIFEST_SCHEMA_ID);
  if (!validate(loaded.value)) {
    for (const error of validate.errors ?? []) {
      findings.push(finding("generated-manifest-schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "manifest"));
    }
    return { value: null, rawDigest: loaded.digest };
  }
  return { value: loaded.value, rawDigest: loaded.digest };
}

async function loadPortabilityAjv(schemasDir) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schemaFile of ["portable-profile.schema.json", "generated-adapter-manifest.schema.json"]) {
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
    findings.push(finding("json-read", "JSON file cannot be read.", location));
    return { value: null, digest: null };
  }

  try {
    return {
      value: JSON.parse(raw),
      digest: `sha256:${createHash("sha256").update(raw).digest("hex")}`
    };
  } catch {
    findings.push(finding("json-parse", "JSON file must be valid JSON.", location));
    return { value: null, digest: `sha256:${createHash("sha256").update(raw).digest("hex")}` };
  }
}

function validateExplicitOutputDir(outputDir) {
  const findings = [];
  if (!outputDir || typeof outputDir !== "string") {
    findings.push(finding("output-required", "An explicit output directory is required.", "output"));
    return { findings, resolvedOutputDir: null };
  }

  const resolvedOutputDir = path.resolve(outputDir);
  const segments = resolvedOutputDir.split(/[\\/]+/).map((segment) => segment.toLowerCase());
  if (segments.some((segment) => userConfigSegments.has(segment))) {
    findings.push(finding("output-user-config", "Output directory cannot be a known user agent configuration directory.", "output"));
  }
  return { findings, resolvedOutputDir };
}

function renderAdapterDescriptor(profile, target) {
  const commandSections = profile.commands
    .map((command) =>
      [
        `## Command: ${command.commandId}`,
        `Profile: ${command.profileId}`,
        `Mode: ${command.mode}`,
        `Aliases: ${(command.aliases ?? []).join(", ") || "none"}`,
        "",
        command.summary,
        "",
        command.instruction
      ].join("\n")
    )
    .join("\n\n");

  return [
    "---",
    `name: ${profile.profileId}`,
    `description: ${profile.summary}`,
    "---",
    "",
    `# ${profile.displayName}`,
    "",
    "This is a descriptor-only generated adapter. It does not install or execute resources.",
    "",
    "Boundary:",
    "- descriptor-only",
    "- do not install or execute",
    "- no lifecycle hooks are trusted",
    "- no user agent configuration is written",
    `- target: ${target.targetId}`,
    "",
    commandSections,
    ""
  ].join("\n");
}

function adapterPathForTarget(targetId) {
  if (targetId === "codex-skill") return "codex-skill/SKILL.md";
  if (targetId === "claude-code-skill") return "claude-code-skill/SKILL.md";
  if (targetId === "gemini-cli") return "gemini-cli/GEMINI.md";
  if (targetId === "opencode") return "opencode/commands/portable-profile.md";
  return `${targetId}/README.md`;
}

async function inspectManifestFiles({ manifest, outputDir, findings }) {
  for (const file of manifest.files) {
    const resolved = resolveInside(outputDir, file.path);
    if (!resolved) {
      findings.push(finding("file-path-unsafe", "Generated file path escapes the output directory.", file.path));
      continue;
    }
    let stat;
    try {
      stat = await fs.stat(resolved);
    } catch {
      findings.push(finding("file-missing", "Generated file listed in manifest is missing.", file.path));
      continue;
    }
    const digest = `sha256:${await hashFileSha256(resolved)}`;
    if (digest !== file.sha256) {
      findings.push(finding("file-digest-mismatch", "Generated file digest does not match manifest.", file.path));
    }
    if (stat.size !== file.bytes) {
      findings.push(finding("file-size-mismatch", "Generated file size does not match manifest.", file.path));
    }
  }
}

async function inspectInvariantPhrases({ manifest, outputDir, findings }) {
  const phrases = new Set(manifest.invariantPhrases ?? []);
  for (const mapping of manifest.commandMappings ?? []) {
    for (const phrase of mapping.invariantPhrases ?? []) {
      phrases.add(phrase);
    }
  }

  for (const file of manifest.files) {
    const resolved = resolveInside(outputDir, file.path);
    if (!resolved) {
      continue;
    }
    let content;
    try {
      content = await fs.readFile(resolved, "utf8");
    } catch {
      continue;
    }
    for (const phrase of phrases) {
      if (!content.includes(phrase)) {
        findings.push(finding("invariant-missing", "Generated file is missing a required invariant phrase.", file.path));
      }
    }
  }
}

async function inspectCommandMappings({ profile, manifest, outputDir, findings }) {
  const sourceCommands = new Set(profile.commands.map((command) => command.commandId));
  for (const mapping of manifest.commandMappings) {
    if (!sourceCommands.has(mapping.commandId)) {
      findings.push(finding("command-source-missing", "Generated command mapping does not exist in the source profile.", mapping.commandId));
    }

    const resolved = resolveInside(outputDir, mapping.path);
    if (!resolved) {
      findings.push(finding("command-path-unsafe", "Generated command path escapes the output directory.", mapping.path));
      continue;
    }

    let content;
    try {
      content = await fs.readFile(resolved, "utf8");
    } catch {
      findings.push(finding("command-file-missing", "Generated command file is missing.", mapping.path));
      continue;
    }

    if (!content.includes(mapping.commandId)) {
      findings.push(finding("command-file-mismatch", "Generated command file does not contain the mapped command identifier.", mapping.path));
    }
  }
}

function driftReport({ ok, sourcePath, manifestPath, status, findings }) {
  return {
    ok,
    command: "portable-drift",
    status,
    source: labelForPath(sourcePath),
    manifest: labelForPath(manifestPath),
    findings
  };
}

function parityReport({ ok, sourcePath, manifestPath, findings, summary }) {
  return {
    ok,
    command: "portable-parity",
    source: labelForPath(sourcePath),
    manifest: labelForPath(manifestPath),
    summary: summary ?? {
      sourceCommands: 0,
      commandMappings: 0,
      profiles: 0,
      instructionOnlyTargets: 0
    },
    findings
  };
}

function portabilityReport({ ok, command, sourcePath, targetId, findings }) {
  return {
    ok,
    command,
    source: labelForPath(sourcePath),
    targetId: targetId ?? null,
    files: [],
    findings
  };
}

async function* walkLedgerFiles(directory) {
  const entries = await fs.readdir(directory, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      if (skippedLedgerDirs.has(entry.name.toLowerCase())) {
        continue;
      }
      yield* walkLedgerFiles(fullPath);
      continue;
    }
    if (!entry.isFile() || !ledgerTextExtensions.has(path.extname(entry.name).toLowerCase())) {
      continue;
    }
    const stat = await fs.stat(fullPath);
    if (stat.size > 256 * 1024) {
      continue;
    }
    yield fullPath;
  }
}

function parseMarkerFields(line) {
  const fields = {};
  const markerIndex = line.indexOf("AGENTIQUE_DEFERRED_RISK");
  const tail = markerIndex >= 0 ? line.slice(markerIndex + "AGENTIQUE_DEFERRED_RISK".length) : line;
  for (const match of tail.matchAll(/([A-Za-z][A-Za-z0-9_-]*)=([^\s;]+)/g)) {
    fields[match[1].toLowerCase()] = match[2];
  }
  return fields;
}

function redactMarkerValue(value) {
  if (!/^[a-z0-9][a-z0-9._-]{1,80}$/i.test(value)) {
    return "[redacted]";
  }
  if (/(?:token|secret|password|key|[A-Za-z]:\\|\/home\/|\/Users\/|\/mnt\/)/i.test(value)) {
    return "[redacted]";
  }
  return value;
}

function maxCeiling(markers) {
  let max = 0;
  let label = "none";
  for (const marker of markers) {
    const rank = ledgerCeilingRank.get(marker.ceiling) ?? 0;
    if (rank > max) {
      max = rank;
      label = marker.ceiling;
    }
  }
  return label;
}

function resolveInside(root, rel) {
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, rel);
  const rootWithSep = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolved === resolvedRoot || resolved.startsWith(rootWithSep) ? resolved : null;
}

async function hashFileSha256(filePath) {
  const hash = createHash("sha256");
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath);
    stream.on("data", (chunk) => hash.update(chunk));
    stream.on("error", reject);
    stream.on("end", resolve);
  });
  return hash.digest("hex");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function labelForPath(filePath) {
  return path.basename(String(filePath ?? "unavailable"));
}

function toPosix(value) {
  return value.split(path.sep).join("/");
}

function finding(code, message, location) {
  return { code, message, location };
}
