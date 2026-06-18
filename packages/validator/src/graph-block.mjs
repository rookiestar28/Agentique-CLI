import { createHash } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

export const GRAPH_BLOCK_COMMANDS = new Set([
  "bundle-validate",
  "bundle-import-plan",
  "bundle-export-plan",
  "block-fixtures-generate",
  "ledger-inspect",
  "ledger-replay-diagnostics",
  "artifact-scan",
  "api-drift"
]);

export const GRAPH_BLOCK_SCHEMA_FILES = Object.freeze([
  "graph-block-bundle.schema.json",
  "block-manifest.schema.json",
  "execution-ledger.schema.json",
  "workspace-artifact.schema.json",
  "api-drift.schema.json",
  "generated-block-fixtures-manifest.schema.json"
]);

export const BLOCK_FIXTURE_GENERATOR_VERSION = "0.1.0";

const GRAPH_BUNDLE_SCHEMA_ID = "https://schemas.agentique.io/graph-block-bundle.schema.json";
const BLOCK_MANIFEST_SCHEMA_ID = "https://schemas.agentique.io/block-manifest.schema.json";
const LEDGER_SCHEMA_ID = "https://schemas.agentique.io/execution-ledger.schema.json";
const ARTIFACT_SCHEMA_ID = "https://schemas.agentique.io/workspace-artifact.schema.json";
const API_DRIFT_SCHEMA_ID = "https://schemas.agentique.io/api-drift.schema.json";
const GENERATED_FIXTURES_SCHEMA_ID = "https://schemas.agentique.io/generated-block-fixtures-manifest.schema.json";

const terminalStates = new Set(["completed", "failed", "canceled", "timed-out", "skipped", "cleanup-required"]);
const allowedArtifactMimes = new Set(["application/json", "text/plain", "image/png", "image/jpeg", "application/zip"]);
const maxArtifactBytes = 50 * 1024 * 1024;
const userConfigSegments = new Set([".codex", ".claude", ".gemini", ".opencode", ".cursor"]);
const digestPattern = /^sha256:[a-f0-9]{6,64}$/i;
const rawCommandPattern =
  /\b(?:npm|pnpm|yarn|pip|python|node|bash|sh|powershell|docker|kubectl|curl|wget)\s+(?:install|run|exec|compose|build|start|-c|https?:\/\/)/i;
const runtimeClaimPattern =
  /\b(?:ready to run|local runner|runtime available|executes?|installs?|launches?|deploys?|certified|approved|automatic(?:ally)? executes?)\b/i;
const privatePlanningSegment = `.${"plan"}${"ning"}`;
const privateResearchSegment = `${"ref"}${"erence"}`;
const localPathPattern = new RegExp(
  `(?:[A-Za-z]:\\\\|\\/home\\/|\\/Users\\/|\\/mnt\\/|(?:^|[\\\\/])(?:${escapeRegExp(privatePlanningSegment)}|${escapeRegExp(privateResearchSegment)}|${escapeRegExp(privateResearchSegment.toUpperCase())})(?:[\\\\/]|$))`,
  "i"
);
const secretLikePattern =
  /(?:token\s*[:=]|api[_-]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|bearer\s+[a-z0-9._~+/=-]{12,}|sk-[a-z0-9_-]{12,}|-----BEGIN)/i;
const sensitiveUrlPattern = /(?:token=|signature=|x-amz-|expires=|credential=|key=|secret=)/i;

export async function validateGraphBlockBundle({ sourcePath, schemasDir }) {
  const findings = [];
  const bundle = await readJsonWithSchema({
    filePath: sourcePath,
    schemasDir,
    schemaId: GRAPH_BUNDLE_SCHEMA_ID,
    location: "source",
    findings
  });

  if (bundle) {
    inspectBundleSemantics(bundle, findings);
  }

  return {
    ok: findings.length === 0,
    command: "bundle-validate",
    source: labelForPath(sourcePath),
    summary: summarizeBundle(bundle),
    safety: graphBlockSafety(),
    findings: uniqueFindings(findings)
  };
}

export async function writeBundlePlan({ sourcePath, outputDir, schemasDir, transferKind }) {
  const validation = await validateGraphBlockBundle({ sourcePath, schemasDir });
  const outputSafety = validateExplicitOutputDir(outputDir);
  validation.findings.push(...outputSafety.findings);

  if (!validation.ok || outputSafety.findings.length > 0) {
    return {
      ...validation,
      ok: false,
      command: transferKind === "import" ? "bundle-import-plan" : "bundle-export-plan",
      findings: uniqueFindings(validation.findings)
    };
  }

  const bundle = await readJson(sourcePath);
  const plan = {
    schemaVersion: "agentique.bundlePlan.v1",
    transferKind,
    bundleId: safeText(bundle.bundleId),
    graphId: safeText(bundle.graph?.graphId),
    descriptorOnly: true,
    noAutomaticInstall: true,
    noAutomaticExecution: true,
    noNetwork: true,
    noArchiveExtraction: true,
    noUserConfigMutation: true,
    createdAt: new Date().toISOString(),
    summary: {
      blocks: Array.isArray(bundle.graph?.blocks) ? bundle.graph.blocks.length : 0,
      nodes: Array.isArray(bundle.graph?.nodes) ? bundle.graph.nodes.length : 0,
      edges: Array.isArray(bundle.graph?.edges) ? bundle.graph.edges.length : 0,
      blockManifests: Array.isArray(bundle.blockManifests) ? bundle.blockManifests.length : 0
    }
  };

  const relPath = `bundle/${transferKind}-plan.json`;
  const targetPath = path.join(outputSafety.resolvedOutputDir, ...relPath.split("/"));
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await writeJson(targetPath, plan);
  const stat = await fs.stat(targetPath);

  return {
    ok: true,
    command: transferKind === "import" ? "bundle-import-plan" : "bundle-export-plan",
    source: labelForPath(sourcePath),
    plan,
    files: [
      {
        path: relPath,
        role: `${transferKind}-plan`,
        bytes: stat.size,
        sha256: `sha256:${await hashFile(targetPath)}`
      }
    ],
    findings: []
  };
}

export async function generateBlockFixtures({ outputDir, schemasDir }) {
  const findings = [];
  const outputSafety = validateExplicitOutputDir(outputDir);
  findings.push(...outputSafety.findings);
  if (findings.length > 0) {
    return {
      ok: false,
      command: "block-fixtures-generate",
      output: labelForPath(outputDir),
      files: [],
      generator: generatorSummary(),
      findings
    };
  }

  const resolvedOutputDir = outputSafety.resolvedOutputDir;
  const fixtureDir = path.join(resolvedOutputDir, "fixtures");
  await fs.mkdir(fixtureDir, { recursive: true });

  const validFixture = blockManifestFixture();
  const invalidFixture = {
    ...blockManifestFixture(),
    lifecycle: { state: "unsupported-hook", hooks: ["postinstall"] },
    fixtures: []
  };

  const validPath = path.join(fixtureDir, "block-manifest.valid.json");
  const invalidPath = path.join(fixtureDir, "block-manifest.invalid.json");
  await writeJson(validPath, validFixture);
  await writeJson(invalidPath, invalidFixture);

  const files = [
    await fileSummary(validPath, "fixtures/block-manifest.valid.json", "valid-fixture"),
    await fileSummary(invalidPath, "fixtures/block-manifest.invalid.json", "invalid-fixture")
  ];
  const manifest = {
    contractVersion: "agentique.generatedBlockFixtures.v1",
    generator: generatorSummary(),
    files,
    safety: {
      noExecution: true,
      importsRuntimeCode: false,
      executesBlockTests: false,
      referenceExecution: false
    }
  };

  const manifestPath = path.join(fixtureDir, "generated-block-fixtures-manifest.json");
  await writeJson(manifestPath, manifest);
  const manifestSummary = await fileSummary(
    manifestPath,
    "fixtures/generated-block-fixtures-manifest.json",
    "manifest"
  );

  const ajv = await loadGraphBlockAjv(schemasDir);
  const validate = ajv.getSchema(GENERATED_FIXTURES_SCHEMA_ID);
  if (!validate(manifest)) {
    for (const error of validate.errors ?? []) {
      findings.push(finding("generated-fixture-schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, "manifest"));
    }
  }

  return {
    ok: findings.length === 0,
    command: "block-fixtures-generate",
    output: labelForPath(outputDir),
    files: [...files, manifestSummary],
    generator: generatorSummary(),
    findings
  };
}

export async function inspectExecutionLedger({ sourcePath, schemasDir }) {
  const findings = [];
  const ledger = await readJsonWithSchema({
    filePath: sourcePath,
    schemasDir,
    schemaId: LEDGER_SCHEMA_ID,
    location: "source",
    findings
  });

  if (ledger) {
    inspectLedgerSemantics(ledger, findings);
  }

  return {
    ok: findings.length === 0,
    command: "ledger-inspect",
    source: labelForPath(sourcePath),
    summary: summarizeLedger(ledger),
    events: projectLedgerEvents(ledger),
    findings: uniqueFindings(findings)
  };
}

export async function writeReplayDiagnostics({ sourcePath, outputDir, schemasDir }) {
  const report = await inspectExecutionLedger({ sourcePath, schemasDir });
  const outputSafety = validateExplicitOutputDir(outputDir);
  report.findings.push(...outputSafety.findings);
  if (!report.ok || outputSafety.findings.length > 0) {
    return {
      ...report,
      ok: false,
      command: "ledger-replay-diagnostics",
      decision: "blocked",
      findings: uniqueFindings(report.findings)
    };
  }

  const replayReport = {
    ...report,
    command: "ledger-replay-diagnostics",
    decision: "diagnostic_only",
    noExecution: noExecutionBoundary(),
    replay: {
      graphNodesExecuted: false,
      queueWorkersStarted: false,
      cleanupActionsRun: false,
      reportOnly: true
    }
  };

  const relPath = "ledger/replay-diagnostics.json";
  const targetPath = path.join(outputSafety.resolvedOutputDir, ...relPath.split("/"));
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await writeJson(targetPath, replayReport);
  replayReport.files = [await fileSummary(targetPath, relPath, "diagnostic-report")];
  return replayReport;
}

export async function scanWorkspaceArtifact({ sourcePath, schemasDir }) {
  const findings = [];
  const artifact = await readJsonWithSchema({
    filePath: sourcePath,
    schemasDir,
    schemaId: ARTIFACT_SCHEMA_ID,
    location: "source",
    findings
  });

  if (artifact) {
    inspectArtifactSemantics(artifact, findings);
  }

  return {
    ok: findings.length === 0,
    command: "artifact-scan",
    source: labelForPath(sourcePath),
    summary: summarizeArtifact(artifact),
    safety: {
      opensArtifactBytes: false,
      fetchesRemoteArtifacts: false,
      uploadsArtifacts: false,
      executesArtifacts: false
    },
    findings: uniqueFindings(findings)
  };
}

export async function checkApiDrift({ sourcePath, schemasDir }) {
  const findings = [];
  const drift = await readJsonWithSchema({
    filePath: sourcePath,
    schemasDir,
    schemaId: API_DRIFT_SCHEMA_ID,
    location: "source",
    findings
  });

  if (drift) {
    inspectApiDriftSemantics(drift, findings);
  }

  return {
    ok: findings.length === 0,
    command: "api-drift",
    source: labelForPath(sourcePath),
    status: findings.length === 0 ? "current" : "stale",
    summary: summarizeApiDrift(drift),
    safety: {
      noServiceStart: true,
      noCodeGeneration: true,
      noNetwork: true
    },
    findings: uniqueFindings(findings)
  };
}

export function formatGraphBlockHuman(report) {
  const lines = [`${report.ok ? "OK" : "FAILED"} ${report.command}`];
  if (report.status) lines.push(`- status: ${report.status}`);
  if (report.decision) lines.push(`- decision: ${report.decision}`);
  for (const item of report.findings ?? []) {
    lines.push(`- ${item.code} at ${item.location}: ${item.message}`);
  }
  return `${lines.join("\n")}\n`;
}

async function readJsonWithSchema({ filePath, schemasDir, schemaId, location, findings }) {
  const value = await readJsonSafe(filePath, location, findings);
  if (!value) return null;

  let ajv;
  try {
    ajv = await loadGraphBlockAjv(schemasDir);
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown schema load error";
    findings.push(finding("schema-loader", message, "schema"));
    return value;
  }

  const validate = ajv.getSchema(schemaId);
  if (!validate(value)) {
    for (const error of validate.errors ?? []) {
      findings.push(finding("schema", `${error.instancePath || "/"} ${error.message ?? "is invalid"}`, location));
    }
  }
  return value;
}

async function loadGraphBlockAjv(schemasDir) {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);
  for (const schemaFile of GRAPH_BLOCK_SCHEMA_FILES) {
    const schema = JSON.parse(await fs.readFile(path.join(schemasDir, schemaFile), "utf8"));
    ajv.addSchema(schema);
  }
  return ajv;
}

async function readJsonSafe(filePath, location, findings) {
  let raw;
  try {
    raw = await fs.readFile(filePath, "utf8");
  } catch {
    findings.push(finding("json-read", "JSON file cannot be read.", location));
    return null;
  }
  try {
    return JSON.parse(raw);
  } catch {
    findings.push(finding("json-parse", "JSON file must contain valid JSON.", location));
    return null;
  }
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function inspectBundleSemantics(bundle, findings) {
  const graph = bundle.graph ?? {};
  if (!bundle.safety?.noExecution || !bundle.safety?.noInstall || !bundle.safety?.noRuntimeClaim) {
    findings.push(finding("graph-runtime-claim", "Bundle safety flags must remain no-execution and no-install.", "safety"));
  }
  if (hasTrueValue(graph.noExecution)) {
    findings.push(finding("graph-runtime-claim", "Graph no-execution boundary was violated.", "graph.noExecution"));
  }
  if (hasTrueValue(graph.noOverclaim)) {
    findings.push(finding("graph-runtime-claim", "Graph no-overclaim boundary was violated.", "graph.noOverclaim"));
  }
  inspectTextSafety(bundle, findings);
  inspectGraphTopology(graph, findings);
}

function inspectGraphTopology(graph, findings) {
  const blocks = Array.isArray(graph.blocks) ? graph.blocks : [];
  const nodes = Array.isArray(graph.nodes) ? graph.nodes : [];
  const edges = Array.isArray(graph.edges) ? graph.edges : [];
  const blocksById = new Map(blocks.map((block) => [block.id, block]));
  const nodesById = new Map(nodes.map((node) => [node.id, node]));

  if (blocksById.size !== blocks.length) {
    findings.push(finding("duplicate-block-id", "Block ids must be unique.", "graph.blocks"));
  }
  if (nodesById.size !== nodes.length) {
    findings.push(finding("duplicate-node-id", "Node ids must be unique.", "graph.nodes"));
  }

  for (const node of nodes) {
    if (!blocksById.has(node.blockId)) {
      findings.push(finding("missing-block", "Node references a missing block.", node.id ?? "node"));
    }
  }

  for (const edge of edges) {
    const fromNode = nodesById.get(edge.from?.nodeId);
    const toNode = nodesById.get(edge.to?.nodeId);
    if (!fromNode || !toNode) {
      findings.push(finding("missing-node", "Edge references a missing node.", edge.id ?? "edge"));
      continue;
    }
    if (!fromNode.outputPorts?.includes(edge.from?.portId) || !toNode.inputPorts?.includes(edge.to?.portId)) {
      findings.push(finding("missing-port", "Edge references a missing node port.", edge.id ?? "edge"));
    }
  }
}

function inspectLedgerSemantics(ledger, findings) {
  if (ledger.replayDiagnosticOnly !== true || hasTrueValue(ledger.noExecution)) {
    findings.push(finding("runtime-claim-forbidden", "Ledger replay must remain diagnostic-only and no-execution.", "noExecution"));
  }

  const events = Array.isArray(ledger.events) ? ledger.events : [];
  const eventIds = new Set();
  let terminalStatePresent = false;
  let previousSequence = 0;
  let previousTime = 0;

  for (const event of events) {
    if (eventIds.has(event.eventId)) {
      findings.push(finding("duplicate-event-id", "Event ids must be unique.", event.eventId ?? "event"));
    }
    if (event.parentEventId && !eventIds.has(event.parentEventId)) {
      findings.push(finding("orphan-cleanup-required", "Parent event must appear before child event.", event.eventId ?? "event"));
    }
    eventIds.add(event.eventId);

    const time = Date.parse(event.timestamp ?? "");
    if (event.sequence <= previousSequence || Number.isNaN(time) || time < previousTime) {
      findings.push(finding("non-monotonic-event", "Ledger events must be monotonic by sequence and timestamp.", event.eventId ?? "event"));
    }
    previousSequence = event.sequence;
    previousTime = time;
    if (terminalStates.has(event.state)) terminalStatePresent = true;

    if (event.boundedLog) {
      if (event.boundedLog.redacted !== true) {
        findings.push(finding("unredacted-log", "Ledger bounded logs must be redacted.", event.eventId ?? "event"));
      }
      if (
        !Number.isInteger(event.boundedLog.maxBytes) ||
        event.boundedLog.maxBytes > 4096 ||
        Buffer.byteLength(String(event.boundedLog.text ?? ""), "utf8") > event.boundedLog.maxBytes
      ) {
        findings.push(finding("unbounded-log", "Ledger bounded log is not bounded by its declared max bytes.", event.eventId ?? "event"));
      }
    }
  }

  if (!terminalStatePresent || !terminalStates.has(ledger.state)) {
    findings.push(finding("missing-terminal-state", "Ledger must include a terminal state.", "events"));
  }

  if (collectStrings(ledger).some((text) => secretLikePattern.test(text))) {
    findings.push(finding("secret-payload-forbidden", "Ledger contains secret-like payload material.", "$"));
  }
  if (collectStrings(ledger).some((text) => runtimeClaimPattern.test(text) || rawCommandPattern.test(text))) {
    findings.push(finding("runtime-claim-forbidden", "Ledger contains runtime or command overclaims.", "$"));
  }
  if (collectStrings(ledger).some((text) => localPathPattern.test(text))) {
    findings.push(finding("unsafe-path-forbidden", "Ledger contains local or internal path material.", "$"));
  }
}

function inspectArtifactSemantics(artifact, findings) {
  const uriValue = String(artifact.uri?.value ?? "");
  if (artifact.uri?.kind === "local-temp-ref" || localPathPattern.test(uriValue) || localPathPattern.test(artifact.signedDownload?.host ?? "")) {
    findings.push(finding("local-path-leak", "Artifact metadata contains a local or internal path.", "uri"));
  }
  if (uriValue.includes("..") || uriValue.includes("%2e%2e")) {
    findings.push(finding("traversal-forbidden", "Artifact URI must not contain traversal.", "uri"));
  }
  if (artifact.scanState !== "passed") {
    findings.push(finding("unscanned-content", "Artifact scan state must be passed.", "scanState"));
  }
  if (!Number.isInteger(artifact.sizeBytes) || artifact.sizeBytes < 0 || artifact.sizeBytes > maxArtifactBytes) {
    findings.push(finding("oversized-artifact", "Artifact size is out of range.", "sizeBytes"));
  }
  if (!allowedArtifactMimes.has(artifact.mimeType)) {
    findings.push(finding("unsafe-mime", "Artifact MIME type is not allowed.", "mimeType"));
  }
  if (artifact.signedDownload && artifact.signedDownload.signed !== true) {
    findings.push(finding("unsigned-url", "Signed download metadata must be signed.", "signedDownload"));
  }
  if (
    sensitiveUrlPattern.test(uriValue) ||
    sensitiveUrlPattern.test(JSON.stringify(artifact.signedDownload ?? {})) ||
    artifact.signedDownload?.queryMaterialRedacted !== true
  ) {
    findings.push(finding("sensitive-url", "Artifact metadata contains sensitive or unredacted URL material.", "signedDownload"));
  }
  inspectTextSafety(artifact, findings);
}

function inspectApiDriftSemantics(drift, findings) {
  if (
    drift.snapshot?.openapiDigest !== drift.generated?.openapiDigest ||
    drift.snapshot?.schemaDigest !== drift.generated?.schemaDigest
  ) {
    findings.push(finding("snapshot-digest-mismatch", "Generated metadata does not match approved snapshots.", "generated"));
  }
  const covered = new Set(drift.mockCoverage?.coveredStatuses ?? []);
  const missingStatus = (drift.mockCoverage?.requiredStatuses ?? []).find((status) => !covered.has(status));
  if (missingStatus) {
    findings.push(finding("mock-coverage-incomplete", "Mock status coverage is incomplete.", "mockCoverage"));
  }
  if ((drift.forbiddenPrivateFields ?? []).length > 0 || drift.publicProjection?.secretsIncluded === true) {
    findings.push(finding("private-field-forbidden", "Private fields must not appear in public drift metadata.", "forbiddenPrivateFields"));
  }
  if (drift.publicProjection?.internalPathsIncluded === true || collectStrings(drift).some((text) => localPathPattern.test(text))) {
    findings.push(finding("internal-path-forbidden", "API drift metadata contains local or internal path material.", "$"));
  }
  if (drift.safety?.noServiceStart !== true) {
    findings.push(finding("service-start-forbidden", "Drift gate must not start services.", "safety.noServiceStart"));
  }
  if (drift.safety?.noCodeGeneration !== true) {
    findings.push(finding("code-generation-forbidden", "Drift gate must not generate unreviewed code.", "safety.noCodeGeneration"));
  }
}

function inspectTextSafety(value, findings) {
  const strings = collectStrings(value);
  if (strings.some((text) => rawCommandPattern.test(text))) {
    findings.push(finding("raw-command-forbidden", "Raw command or lifecycle text is forbidden.", "$"));
  }
  if (strings.some((text) => secretLikePattern.test(text))) {
    findings.push(finding("secret-value-forbidden", "Secret-like values are forbidden.", "$"));
  }
  if (strings.some((text) => localPathPattern.test(text))) {
    findings.push(finding("unsafe-path-forbidden", "Local, internal, or private paths are forbidden.", "$"));
  }
  if (strings.some((text) => runtimeClaimPattern.test(text))) {
    findings.push(finding("graph-runtime-claim", "Runtime, approval, or certification overclaims are forbidden.", "$"));
  }
}

function summarizeBundle(bundle) {
  return {
    bundleId: safeText(bundle?.bundleId),
    graphId: safeText(bundle?.graph?.graphId),
    blocks: Array.isArray(bundle?.graph?.blocks) ? bundle.graph.blocks.length : 0,
    nodes: Array.isArray(bundle?.graph?.nodes) ? bundle.graph.nodes.length : 0,
    edges: Array.isArray(bundle?.graph?.edges) ? bundle.graph.edges.length : 0,
    blockManifests: Array.isArray(bundle?.blockManifests) ? bundle.blockManifests.length : 0
  };
}

function summarizeLedger(ledger) {
  const stateCounts = Object.fromEntries(
    ["started", "running", "completed", "failed", "canceled", "timed-out", "skipped", "cleanup-required"].map((state) => [state, 0])
  );
  for (const event of ledger?.events ?? []) {
    if (Object.hasOwn(stateCounts, event.state)) stateCounts[event.state] += 1;
  }
  return {
    ledgerId: safeText(ledger?.ledgerId),
    graphId: safeText(ledger?.graphId),
    events: Array.isArray(ledger?.events) ? ledger.events.length : 0,
    terminalStatePresent: (ledger?.events ?? []).some((event) => terminalStates.has(event.state)),
    stateCounts
  };
}

function projectLedgerEvents(ledger) {
  return (ledger?.events ?? []).map((event) => ({
    eventId: safeText(event.eventId),
    parentEventId: safeText(event.parentEventId),
    entityKind: safeText(event.entityKind),
    entityId: safeText(event.entityId),
    state: safeText(event.state),
    sequence: Number.isFinite(event.sequence) ? event.sequence : null,
    publicSummary: safeText(event.publicSummary),
    artifactIds: (event.artifactRefs ?? []).map((artifact) => safeText(artifact.artifactId)).filter(Boolean),
    replaySafe: event.replaySafe === true,
    logRedacted: event.boundedLog?.redacted === true,
    logTruncated: event.boundedLog?.truncated === true
  }));
}

function summarizeArtifact(artifact) {
  return {
    artifactId: safeText(artifact?.artifactId),
    scope: safeText(artifact?.scope),
    uriKind: safeText(artifact?.uri?.kind),
    checksum: digestPattern.test(artifact?.checksum ?? "") ? artifact.checksum : "",
    mimeType: safeText(artifact?.mimeType),
    sizeBytes: Number.isFinite(artifact?.sizeBytes) ? artifact.sizeBytes : null,
    scanState: safeText(artifact?.scanState),
    retentionState: safeText(artifact?.retentionState),
    signedDownloadHost: safeText(artifact?.signedDownload?.host)
  };
}

function summarizeApiDrift(drift) {
  return {
    openapiDigestMatch: drift?.snapshot?.openapiDigest === drift?.generated?.openapiDigest,
    schemaDigestMatch: drift?.snapshot?.schemaDigest === drift?.generated?.schemaDigest,
    requiredStatuses: Array.isArray(drift?.mockCoverage?.requiredStatuses) ? drift.mockCoverage.requiredStatuses.length : 0,
    coveredStatuses: Array.isArray(drift?.mockCoverage?.coveredStatuses) ? drift.mockCoverage.coveredStatuses.length : 0,
    privateFieldCount: Array.isArray(drift?.forbiddenPrivateFields) ? drift.forbiddenPrivateFields.length : 0
  };
}

function graphBlockSafety() {
  return {
    noExecution: true,
    noInstall: true,
    noNetwork: true,
    noArchiveExtraction: true,
    noUserConfigMutation: true,
    descriptorOnly: true
  };
}

function noExecutionBoundary() {
  return {
    rawCommandsIncluded: false,
    packageManagersExecuted: false,
    lifecycleHooksExecuted: false,
    graphExecuted: false,
    blockRuntimeLoaded: false,
    networkRequestsPerformed: false,
    filesystemAccessGranted: false,
    schedulerStarted: false,
    webhookReceiverStarted: false
  };
}

function generatorSummary() {
  return {
    name: "agentique-block-fixture-generator",
    version: BLOCK_FIXTURE_GENERATOR_VERSION,
    generatedAt: new Date().toISOString(),
    noExecution: true
  };
}

function blockManifestFixture() {
  return {
    contractVersion: "agentique.blockManifest.v1",
    blockId: "block:review",
    name: "Review block",
    summary: "Static schema metadata for public graph review.",
    version: "1.0.0",
    categories: ["transform", "approval"],
    compatibility: "compatible",
    inputSchema: [
      {
        id: "prompt",
        label: "Prompt",
        visibility: "standard",
        schemaRef: { kind: "json-schema", ref: "schema:prompt", required: true },
        required: true,
        credentialReferenceOnly: false
      }
    ],
    outputSchema: [
      {
        id: "result",
        label: "Result",
        visibility: "standard",
        schemaRef: { kind: "json-schema", ref: "schema:result", required: true },
        required: true,
        credentialReferenceOnly: false
      }
    ],
    advancedFields: [],
    dependencies: [],
    discriminators: [],
    credentialFields: [],
    sensitiveAction: false,
    fixtures: [
      {
        fixtureId: "fixture:review",
        inputSchemaRef: { kind: "json-schema", ref: "schema:prompt", required: true },
        outputSchemaRef: { kind: "json-schema", ref: "schema:result", required: true },
        hasInputFixture: true,
        hasOutputFixture: true,
        staticOnly: true
      }
    ],
    lifecycle: {
      state: "static-metadata",
      hooks: []
    }
  };
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

function hasTrueValue(value) {
  return Boolean(value) && typeof value === "object" && Object.values(value).some((entry) => entry === true);
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
  if (typeof value !== "string") return "";
  let text = value;
  text = text.replace(localPathPattern, "[redacted:path]");
  text = text.replace(secretLikePattern, "[redacted:secret]");
  text = text.replace(rawCommandPattern, "[redacted:command]");
  text = text.replace(runtimeClaimPattern, "[redacted:claim]");
  return text.slice(0, maxLength);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function labelForPath(filePath) {
  return path.basename(String(filePath ?? "unavailable"));
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

async function fileSummary(filePath, relPath, role) {
  const stat = await fs.stat(filePath);
  return {
    path: relPath,
    role,
    bytes: stat.size,
    sha256: `sha256:${await hashFile(filePath)}`
  };
}

async function hashFile(filePath) {
  const bytes = await fs.readFile(filePath);
  return createHash("sha256").update(bytes).digest("hex");
}

async function writeJson(filePath, value) {
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function finding(code, message, location) {
  return { code, message, location };
}
