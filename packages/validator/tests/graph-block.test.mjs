import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";

const execFileAsync = promisify(execFile);
const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.resolve(repoDir, "..", "..");
const schemasDir = path.join(packageDir, "schemas");
const cliPath = path.join(repoDir, "src", "cli.mjs");
const graphBlockSchemaFiles = [
  "graph-block-bundle.schema.json",
  "block-manifest.schema.json",
  "execution-ledger.schema.json",
  "workspace-artifact.schema.json",
  "api-drift.schema.json",
  "generated-block-fixtures-manifest.schema.json"
];

test("graph block schemas accept public-safe fixtures and reject runtime overclaims", async () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const schemaFile of graphBlockSchemaFiles) {
    ajv.addSchema(JSON.parse(await fs.readFile(path.join(schemasDir, schemaFile), "utf8")));
  }

  assertSchemaPasses(ajv, "graph-block-bundle.schema.json", graphBundleFixture());
  assertSchemaPasses(ajv, "block-manifest.schema.json", blockManifestFixture());
  assertSchemaPasses(ajv, "execution-ledger.schema.json", ledgerFixture());
  assertSchemaPasses(ajv, "workspace-artifact.schema.json", artifactFixture());
  assertSchemaPasses(ajv, "api-drift.schema.json", apiDriftFixture());
  assertSchemaPasses(ajv, "generated-block-fixtures-manifest.schema.json", generatedFixtureManifestFixture());

  assertSchemaFails(ajv, "graph-block-bundle.schema.json", {
    ...graphBundleFixture(),
    safety: {
      ...graphBundleFixture().safety,
      noExecution: false,
      noInstall: false
    },
    graph: {
      ...graphBundleFixture().graph,
      title: "ready to run graph",
      noExecution: {
        ...noExecution(),
        graphExecuted: true
      }
    }
  });
  assertSchemaFails(ajv, "block-manifest.schema.json", {
    ...blockManifestFixture(),
    lifecycle: { state: "unsupported-hook", hooks: ["postinstall"] },
    fixtures: []
  });
});

test("bundle commands validate and write descriptor-only import export plans", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-graph-bundle-"));
  const bundlePath = path.join(tempDir, "graph-block-bundle.json");
  const outputDir = path.join(tempDir, "plans");
  await writeJson(bundlePath, graphBundleFixture());

  const { stdout } = await runValidator(["bundle-validate", bundlePath, "--schemas-dir", schemasDir, "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.nodes, 2);
  assert.equal(report.summary.blocks, 2);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  const importResult = await runValidator([
    "bundle-import-plan",
    bundlePath,
    "--output-dir",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const importReport = JSON.parse(importResult.stdout);
  assert.equal(importReport.ok, true);
  assert.equal(importReport.plan.transferKind, "import");
  assert.equal(importReport.plan.noAutomaticInstall, true);
  assert.equal(importReport.plan.noAutomaticExecution, true);
  assert.equal(JSON.stringify(importReport).includes(tempDir), false);
  assert.equal((await readJson(path.join(outputDir, "bundle", "import-plan.json"))).transferKind, "import");

  const exportResult = await runValidator([
    "bundle-export-plan",
    bundlePath,
    "--output-dir",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const exportReport = JSON.parse(exportResult.stdout);
  assert.equal(exportReport.ok, true);
  assert.equal(exportReport.plan.transferKind, "export");
  assert.equal((await readJson(path.join(outputDir, "bundle", "export-plan.json"))).transferKind, "export");

  await writeJson(bundlePath, unsafeGraphBundleFixture());
  await assert.rejects(
    () => runValidator(["bundle-validate", bundlePath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assertFindings(failedReport, [
        "graph-runtime-claim",
        "raw-command-forbidden",
        "secret-value-forbidden",
        "unsafe-path-forbidden"
      ]);
      assert.equal(JSON.stringify(failedReport).includes(tempDir), false);
      return true;
    }
  );
});

test("block fixture generator writes static fixtures and digest manifest", async () => {
  const outputDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-block-fixtures-"));

  const { stdout } = await runValidator(["block-fixtures-generate", outputDir, "--schemas-dir", schemasDir, "--json"]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.files.some((item) => item.path === "fixtures/block-manifest.valid.json"), true);
  assert.equal(report.files.some((item) => item.path === "fixtures/block-manifest.invalid.json"), true);
  assert.equal(report.files.some((item) => item.path === "fixtures/generated-block-fixtures-manifest.json"), true);
  assert.equal(report.generator.noExecution, true);
  assert.equal(JSON.stringify(report).includes(outputDir), false);

  const manifest = await readJson(path.join(outputDir, "fixtures", "generated-block-fixtures-manifest.json"));
  assert.equal(manifest.generator.name, "agentique-block-fixture-generator");
  assert.equal(manifest.safety.noExecution, true);
  assert.equal(manifest.safety.importsRuntimeCode, false);
  assert.equal(manifest.files.length, 2);
});

test("ledger commands inspect events and keep replay diagnostic-only", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-ledger-"));
  const ledgerPath = path.join(tempDir, "execution-ledger.json");
  const outputDir = path.join(tempDir, "reports");
  await writeJson(ledgerPath, ledgerFixture());

  const { stdout } = await runValidator(["ledger-inspect", ledgerPath, "--schemas-dir", schemasDir, "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.terminalStatePresent, true);
  assert.equal(report.summary.stateCounts.completed, 2);
  assert.equal(JSON.stringify(report).includes("redacted node state"), false);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  const replay = JSON.parse(
    (
      await runValidator([
        "ledger-replay-diagnostics",
        ledgerPath,
        "--output-dir",
        outputDir,
        "--schemas-dir",
        schemasDir,
        "--json"
      ])
    ).stdout
  );
  assert.equal(replay.ok, true);
  assert.equal(replay.decision, "diagnostic_only");
  assert.equal(replay.noExecution.graphExecuted, false);
  assert.equal((await readJson(path.join(outputDir, "ledger", "replay-diagnostics.json"))).decision, "diagnostic_only");

  await writeJson(ledgerPath, unsafeLedgerFixture());
  await assert.rejects(
    () => runValidator(["ledger-inspect", ledgerPath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assertFindings(failedReport, [
        "non-monotonic-event",
        "missing-terminal-state",
        "unredacted-log",
        "unbounded-log",
        "secret-payload-forbidden",
        "runtime-claim-forbidden"
      ]);
      assert.equal(JSON.stringify(failedReport).includes("token=example"), false);
      return true;
    }
  );
});

test("artifact scanner validates metadata without opening fetching or executing artifacts", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-artifact-"));
  const artifactPath = path.join(tempDir, "artifact.json");
  await writeJson(artifactPath, artifactFixture());

  const { stdout } = await runValidator(["artifact-scan", artifactPath, "--schemas-dir", schemasDir, "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.scanState, "passed");
  assert.equal(report.safety.opensArtifactBytes, false);
  assert.equal(report.safety.fetchesRemoteArtifacts, false);
  assert.equal(report.safety.executesArtifacts, false);

  await writeJson(artifactPath, unsafeArtifactFixture());
  await assert.rejects(
    () => runValidator(["artifact-scan", artifactPath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assertFindings(failedReport, [
        "local-path-leak",
        "traversal-forbidden",
        "unscanned-content",
        "oversized-artifact",
        "unsafe-mime",
        "sensitive-url"
      ]);
      assert.equal(JSON.stringify(failedReport).includes("token=example"), false);
      assert.equal(JSON.stringify(failedReport).includes(tempDir), false);
      return true;
    }
  );
});

test("api drift gate compares approved snapshots without service start or code generation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-api-drift-"));
  const driftPath = path.join(tempDir, "api-drift.json");
  await writeJson(driftPath, apiDriftFixture());

  const { stdout } = await runValidator(["api-drift", driftPath, "--schemas-dir", schemasDir, "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.status, "current");
  assert.equal(report.safety.noServiceStart, true);
  assert.equal(report.safety.noCodeGeneration, true);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await writeJson(driftPath, unsafeApiDriftFixture());
  await assert.rejects(
    () => runValidator(["api-drift", driftPath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assertFindings(failedReport, [
        "snapshot-digest-mismatch",
        "mock-coverage-incomplete",
        "private-field-forbidden",
        "internal-path-forbidden",
        "service-start-forbidden",
        "code-generation-forbidden"
      ]);
      assert.equal(JSON.stringify(failedReport).includes("C:\\Users"), false);
      return true;
    }
  );
});

async function runValidator(args, options = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: packageDir,
    maxBuffer: 1024 * 1024,
    ...options
  });
}

function assertSchemaPasses(ajv, schemaFile, value) {
  const validate = ajv.getSchema(`https://schemas.agentique.io/${schemaFile}`);
  assert.equal(validate(value), true, `${schemaFile} should pass: ${JSON.stringify(validate.errors)}`);
}

function assertSchemaFails(ajv, schemaFile, value) {
  const validate = ajv.getSchema(`https://schemas.agentique.io/${schemaFile}`);
  assert.equal(validate(value), false, `${schemaFile} should fail`);
}

function assertFindings(report, expectedCodes) {
  const codes = new Set(report.findings.map((finding) => finding.code));
  for (const code of expectedCodes) {
    assert.equal(codes.has(code), true, `expected finding ${code}, got ${[...codes].join(", ")}`);
  }
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(filePath, "utf8"));
}

function noExecution() {
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

function noOverclaim() {
  return {
    localRunnerAvailable: false,
    schedulerAvailable: false,
    webhookExecutionAvailable: false,
    credentialValuesAvailable: false,
    automaticInstallAvailable: false,
    externalServiceCertified: false
  };
}

function graphBundleFixture(overrides = {}) {
  return {
    contractVersion: "agentique.graphBlockBundle.v1",
    bundleId: "bundle:review-flow",
    graph: {
      contractVersion: "agentique.agentGraphRuntime.v1",
      graphId: "graph:review-flow",
      title: "Review flow",
      summary: "Descriptor-only graph metadata for public review.",
      version: "1.0.0",
      compatibility: "compatible",
      blocks: [
        {
          id: "block:input",
          manifestRef: "manifest:input",
          name: "Input block",
          version: "1.0.0",
          categories: ["input"],
          compatibility: "compatible",
          blockedReasons: [],
          ports: [
            {
              id: "prompt",
              name: "Prompt",
              direction: "output",
              schemaRef: { kind: "json-schema", ref: "schema:prompt", required: true },
              credentialReferenceOnly: false
            }
          ]
        },
        {
          id: "block:review",
          manifestRef: "manifest:review",
          name: "Review block",
          version: "1.0.0",
          categories: ["transform"],
          compatibility: "compatible",
          blockedReasons: [],
          ports: [
            {
              id: "prompt",
              name: "Prompt",
              direction: "input",
              schemaRef: { kind: "json-schema", ref: "schema:prompt", required: true },
              credentialReferenceOnly: false
            },
            {
              id: "result",
              name: "Result",
              direction: "output",
              schemaRef: { kind: "json-schema", ref: "schema:result", required: true },
              credentialReferenceOnly: false
            }
          ]
        }
      ],
      nodes: [
        {
          id: "node:input",
          blockId: "block:input",
          label: "Input",
          inputPorts: [],
          outputPorts: ["prompt"],
          inputSchemaRefs: [],
          outputSchemaRefs: [{ kind: "json-schema", ref: "schema:prompt", required: true }],
          credentialReferences: [],
          compatibility: "compatible"
        },
        {
          id: "node:review",
          blockId: "block:review",
          label: "Review",
          inputPorts: ["prompt"],
          outputPorts: ["result"],
          inputSchemaRefs: [{ kind: "json-schema", ref: "schema:prompt", required: true }],
          outputSchemaRefs: [{ kind: "json-schema", ref: "schema:result", required: true }],
          credentialReferences: [
            {
              referenceId: "credential:provider",
              provider: "agentique-vault",
              scopeRefs: ["scope:model-read"],
              valueIncluded: false
            }
          ],
          compatibility: "compatible"
        }
      ],
      edges: [
        {
          id: "edge:input-review",
          from: { nodeId: "node:input", portId: "prompt" },
          to: { nodeId: "node:review", portId: "prompt" },
          label: "prompt"
        }
      ],
      publicProjection: {
        allowedPublicFields: ["graphId", "title", "blocks.id", "nodes.id", "edges.id"],
        forbiddenPublicFields: ["rawCommands", "credentialValues", "localAbsolutePaths", "runtimeAvailabilityClaims"],
        noExecutionDisclosureRequired: true,
        unsupportedRuntimeClaimsForbidden: true
      },
      noExecution: noExecution(),
      noOverclaim: noOverclaim()
    },
    blockManifests: [blockManifestFixture()],
    lifecycle: {
      transferKind: "import",
      lifecycleState: "pending-import",
      noAutomaticInstall: true,
      noAutomaticExecution: true,
      rollbackReadback: {
        rollbackAvailable: true,
        readbackStatus: "verified",
        readbackDigest: "sha256:abcdef123456"
      }
    },
    diagnostics: {
      healthState: "healthy",
      readinessState: "ready",
      redacted: true,
      noPrivateTelemetryLeakage: true
    },
    safety: {
      noExecution: true,
      noInstall: true,
      noNetwork: true,
      noArchiveExtraction: true,
      noUserConfigMutation: true,
      noRuntimeClaim: true,
      descriptorOnly: true
    },
    ...overrides
  };
}

function unsafeGraphBundleFixture() {
  const fixture = graphBundleFixture();
  fixture.graph.title = "ready to run graph";
  fixture.graph.summary = "Read C:\\Users\\operator\\private and token=example";
  fixture.graph.blocks[0].name = "npm install package";
  fixture.graph.noExecution.graphExecuted = true;
  fixture.graph.noOverclaim.localRunnerAvailable = true;
  fixture.safety.noExecution = false;
  fixture.safety.noInstall = false;
  return fixture;
}

function blockManifestFixture(overrides = {}) {
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
    },
    ...overrides
  };
}

function ledgerFixture(overrides = {}) {
  return {
    contractVersion: "agentique.executionLedger.v1",
    ledgerId: "ledger:review-flow",
    graphId: "graph:review-flow",
    graphExecutionId: "execution:review-flow",
    state: "completed",
    replayDiagnosticOnly: true,
    noExecution: noExecution(),
    events: [
      ledgerEvent({ eventId: "event:graph-started", entityKind: "graph", entityId: "graph:review-flow", state: "started", sequence: 1 }),
      ledgerEvent({
        eventId: "event:node-running",
        parentEventId: "event:graph-started",
        entityKind: "node",
        entityId: "node:review",
        state: "running",
        sequence: 2,
        boundedLog: { text: "redacted node state", redacted: true, maxBytes: 256, truncated: false }
      }),
      ledgerEvent({
        eventId: "event:node-completed",
        parentEventId: "event:node-running",
        entityKind: "node",
        entityId: "node:review",
        state: "completed",
        sequence: 3
      }),
      ledgerEvent({
        eventId: "event:graph-completed",
        parentEventId: "event:graph-started",
        entityKind: "graph",
        entityId: "graph:review-flow",
        state: "completed",
        sequence: 4
      })
    ],
    ...overrides
  };
}

function ledgerEvent(overrides = {}) {
  return {
    eventId: "event:base",
    executionId: "execution:review-flow",
    entityKind: "graph",
    entityId: "graph:review-flow",
    state: "started",
    timestamp: `2026-06-18T00:00:0${overrides.sequence ?? 1}.000Z`,
    sequence: 1,
    message: "Execution metadata recorded.",
    publicSummary: "Metadata recorded.",
    artifactRefs: [],
    replaySafe: true,
    ...overrides
  };
}

function unsafeLedgerFixture() {
  return ledgerFixture({
    state: "running",
    replayDiagnosticOnly: false,
    events: [
      {
        ...ledgerEvent({ eventId: "event:late", sequence: 2, state: "running" }),
        parentEventId: "event:missing",
        boundedLog: { text: "token=example", redacted: false, maxBytes: 2, truncated: false },
        message: "local runner available now"
      },
      ledgerEvent({ eventId: "event:early", sequence: 1, state: "started" })
    ],
    noExecution: { ...noExecution(), graphExecuted: true }
  });
}

function artifactFixture(overrides = {}) {
  return {
    contractVersion: "agentique.workspaceArtifact.v1",
    artifactId: "artifact:review-result",
    scope: "persistent-workspace-artifact",
    uri: { kind: "virtual-uri", value: "agentique://workspace/artifact:review-result" },
    checksum: "sha256:abcdef123456",
    mimeType: "application/json",
    sizeBytes: 4096,
    scanState: "passed",
    retentionState: "active",
    signedDownload: {
      signed: true,
      host: "downloads.agentique.local",
      expiresAt: "2026-06-18T01:00:00.000Z",
      queryMaterialRedacted: true
    },
    softDeleted: false,
    ...overrides
  };
}

function unsafeArtifactFixture() {
  return artifactFixture({
    uri: { kind: "http-url", value: "http://downloads.example.invalid/../media.png?token=example" },
    mimeType: "application/x-msdownload",
    sizeBytes: 99 * 1024 * 1024,
    scanState: "unscanned",
    signedDownload: {
      signed: false,
      host: "C:\\Users\\operator\\downloads",
      expiresAt: "not-a-date",
      queryMaterialRedacted: false
    }
  });
}

function apiDriftFixture(overrides = {}) {
  return {
    contractVersion: "agentique.apiDrift.v1",
    snapshot: {
      openapiDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      schemaDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      publicSchemaVersions: {
        "graph-block-bundle": "1.0"
      }
    },
    generated: {
      openapiDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      schemaDigest: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb",
      clientDigest: "sha256:cccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccccc",
      mockDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      generatorVersion: "static-review-v1",
      generatedAt: "2026-06-18T00:00:00.000Z"
    },
    mockCoverage: {
      requiredStatuses: ["200", "400", "500"],
      coveredStatuses: ["200", "400", "500"]
    },
    forbiddenPrivateFields: [],
    publicProjection: {
      redacted: true,
      internalPathsIncluded: false,
      secretsIncluded: false
    },
    safety: {
      noServiceStart: true,
      noCodeGeneration: true,
      noNetwork: true
    },
    ...overrides
  };
}

function unsafeApiDriftFixture() {
  return apiDriftFixture({
    generated: {
      ...apiDriftFixture().generated,
      openapiDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      generatedPath: "C:\\Users\\operator\\client.ts"
    },
    mockCoverage: {
      requiredStatuses: ["200", "400", "500"],
      coveredStatuses: ["200"]
    },
    forbiddenPrivateFields: ["credentialValue"],
    publicProjection: {
      redacted: false,
      internalPathsIncluded: true,
      secretsIncluded: true
    },
    safety: {
      noServiceStart: false,
      noCodeGeneration: false,
      noNetwork: false
    }
  });
}

function generatedFixtureManifestFixture() {
  return {
    contractVersion: "agentique.generatedBlockFixtures.v1",
    generator: {
      name: "agentique-block-fixture-generator",
      version: "0.1.0",
      generatedAt: "2026-06-18T00:00:00.000Z",
      noExecution: true
    },
    files: [
      {
        path: "fixtures/block-manifest.valid.json",
        role: "valid-fixture",
        bytes: 512,
        sha256: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa"
      },
      {
        path: "fixtures/block-manifest.invalid.json",
        role: "invalid-fixture",
        bytes: 512,
        sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    ],
    safety: {
      noExecution: true,
      importsRuntimeCode: false,
      executesBlockTests: false,
      referenceExecution: false
    }
  };
}
