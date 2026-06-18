import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
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

test("portable schemas accept public-safe profile and generated adapter fixtures", async () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const schemaFile of ["portable-profile.schema.json", "generated-adapter-manifest.schema.json"]) {
    ajv.addSchema(JSON.parse(await fs.readFile(path.join(schemasDir, schemaFile), "utf8")));
  }

  const validateProfile = ajv.getSchema("https://schemas.agentique.io/portable-profile.schema.json");
  const validateManifest = ajv.getSchema("https://schemas.agentique.io/generated-adapter-manifest.schema.json");

  const profile = portableProfileFixture();
  assert.equal(validateProfile(profile), true, JSON.stringify(validateProfile.errors));
  assert.equal(
    validateProfile({
      ...profile,
      targetHosts: [
        {
          ...profile.targetHosts[0],
          lifecycleHooksTrusted: true,
          writesUserConfig: true,
          noExecution: false
        }
      ],
      publicProjection: {
        ...profile.publicProjection,
        platformApprovalClaim: true
      }
    }),
    false
  );

  const manifest = generatedManifestFixture();
  assert.equal(validateManifest(manifest), true, JSON.stringify(validateManifest.errors));
  assert.equal(
    validateManifest({
      ...manifest,
      safety: {
        ...manifest.safety,
        noExecution: false,
        installsDependencies: true
      }
    }),
    false
  );
});

test("portable generator writes static target outputs and a provenance manifest", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portability-generate-"));
  const sourcePath = path.join(tempDir, "portable-profile.json");
  const outputDir = path.join(tempDir, "generated");
  await writeJson(sourcePath, portableProfileFixture());

  const { stdout } = await runValidator([
    "portable-generate",
    sourcePath,
    "--target",
    "codex-skill",
    "--output",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.targetId, "codex-skill");
  assert.equal(report.files.some((item) => item.path === "codex-skill/SKILL.md"), true);
  assert.equal(report.files.some((item) => item.path === "portable/generated-adapter-manifest.json"), true);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  const generatedSkill = await fs.readFile(path.join(outputDir, "codex-skill", "SKILL.md"), "utf8");
  assert.match(generatedSkill, /do not install or execute/i);
  assert.match(generatedSkill, /summarize-public-source/);

  const manifest = JSON.parse(
    await fs.readFile(path.join(outputDir, "portable", "generated-adapter-manifest.json"), "utf8")
  );
  assert.equal(manifest.source.sourceDigest, sha256Json(portableProfileFixture()));
  assert.equal(manifest.target.targetId, "codex-skill");
  assert.equal(manifest.safety.noExecution, true);
  assert.equal(manifest.safety.installsDependencies, false);
  assert.equal(manifest.safety.writesUserConfig, false);
});

test("portable generator requires explicit safe output and supported targets", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portability-reject-"));
  const sourcePath = path.join(tempDir, "portable-profile.json");
  await writeJson(sourcePath, portableProfileFixture());

  await assert.rejects(
    () =>
      runValidator([
        "portable-generate",
        sourcePath,
        "--target",
        "codex-skill",
        "--schemas-dir",
        schemasDir,
        "--json"
      ]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(`${error.stdout}\n${error.stderr}`, /output/i);
      return true;
    }
  );

  await assert.rejects(
    () =>
      runValidator([
        "portable-generate",
        sourcePath,
        "--target",
        "runtime-agent",
        "--output",
        path.join(tempDir, "generated"),
        "--schemas-dir",
        schemasDir,
        "--json"
      ]),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assertFindings(report, ["target-unsupported"]);
      assert.equal(JSON.stringify(report).includes(tempDir), false);
      return true;
    }
  );
});

test("portable drift validation catches stale files with redacted output", async () => {
  const { tempDir, sourcePath, outputDir, manifestPath } = await generatePortableAdapter();

  const { stdout } = await runValidator([
    "portable-drift",
    sourcePath,
    "--manifest",
    manifestPath,
    "--output-dir",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const passReport = JSON.parse(stdout);
  assert.equal(passReport.ok, true);
  assert.equal(passReport.status, "current");

  await fs.appendFile(path.join(outputDir, "codex-skill", "SKILL.md"), "\nStale local edit.\n", "utf8");

  await assert.rejects(
    () =>
      runValidator([
        "portable-drift",
        sourcePath,
        "--manifest",
        manifestPath,
        "--output-dir",
        outputDir,
        "--schemas-dir",
        schemasDir,
        "--json"
      ]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assert.equal(failedReport.ok, false);
      assertFindings(failedReport, ["file-digest-mismatch"]);
      assert.equal(JSON.stringify(failedReport).includes(tempDir), false);
      return true;
    }
  );
});

test("portable parity validation catches missing generated command mappings", async () => {
  const { sourcePath, outputDir, manifestPath } = await generatePortableAdapter();

  const { stdout } = await runValidator([
    "portable-parity",
    sourcePath,
    "--manifest",
    manifestPath,
    "--output-dir",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const passReport = JSON.parse(stdout);
  assert.equal(passReport.ok, true);
  assert.equal(passReport.summary.commandMappings, 1);
  assert.equal(passReport.summary.instructionOnlyTargets, 1);

  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.commandMappings[0].path = "codex-skill/missing-command.md";
  await writeJson(manifestPath, manifest);

  await assert.rejects(
    () =>
      runValidator([
        "portable-parity",
        sourcePath,
        "--manifest",
        manifestPath,
        "--output-dir",
        outputDir,
        "--schemas-dir",
        schemasDir,
        "--json"
      ]),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assertFindings(report, ["command-file-missing"]);
      return true;
    }
  );
});

test("deferred risk ledger reports ceilings and redacts marker values", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portability-debt-"));
  await fs.mkdir(path.join(tempDir, "src"), { recursive: true });
  await fs.mkdir(path.join(tempDir, "node_modules", "ignored"), { recursive: true });
  await fs.writeFile(
    path.join(tempDir, "src", "notes.md"),
    [
      "AGENTIQUE_DEFERRED_RISK ceiling=medium trigger=public-package-release status=open note=placeholder-token-should-not-appear",
      "AGENTIQUE_DEFERRED_RISK ceiling=low trigger=schema-major-update status=monitoring"
    ].join("\n"),
    "utf8"
  );
  await fs.writeFile(
    path.join(tempDir, "node_modules", "ignored", "notes.md"),
    "AGENTIQUE_DEFERRED_RISK ceiling=high status=open\n",
    "utf8"
  );

  const { stdout } = await runValidator(["debt-ledger", tempDir, "--json"]);
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.summary.markers, 2);
  assert.equal(report.summary.maxCeiling, "medium");
  assert.equal(JSON.stringify(report).includes("placeholder-token-should-not-appear"), false);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await fs.writeFile(
    path.join(tempDir, "src", "missing-trigger.md"),
    "AGENTIQUE_DEFERRED_RISK ceiling=high status=open\n",
    "utf8"
  );

  await assert.rejects(
    () => runValidator(["debt-ledger", tempDir, "--json"]),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assertFindings(failedReport, ["deferred-risk-trigger-missing"]);
      assert.equal(JSON.stringify(failedReport).includes(tempDir), false);
      return true;
    }
  );
});

test("portable evaluation harness is opt-in sandboxed and redacts credential evidence", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portability-eval-"));
  const sourcePath = path.join(tempDir, "portable-profile.json");
  const outputDir = path.join(tempDir, "reports");
  await writeJson(sourcePath, portableProfileFixture());

  await assert.rejects(
    () =>
      runValidator([
        "portable-eval",
        sourcePath,
        "--output-dir",
        outputDir,
        "--schemas-dir",
        schemasDir,
        "--json"
      ]),
    (error) => {
      assert.equal(error.code, 1);
      const report = JSON.parse(error.stdout);
      assert.equal(report.decision, "no_go");
      assertFindings(report, ["sandbox-required"]);
      assert.equal(JSON.stringify(report).includes(tempDir), false);
      return true;
    }
  );

  const { stdout } = await runValidator(
    [
      "portable-eval",
      sourcePath,
      "--output-dir",
      outputDir,
      "--sandbox",
      "no-exec-temp",
      "--schemas-dir",
      schemasDir,
      "--json"
    ],
    { env: minimalEnv() }
  );
  const report = JSON.parse(stdout);
  assert.equal(report.ok, true);
  assert.equal(report.decision, "measurement_only");
  assert.equal(report.correctnessGate, "not_claimed");
  assert.equal(report.sandbox.networkAccess, false);
  assert.equal(report.sandbox.referenceExecution, false);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await assert.rejects(
    () =>
      runValidator(
        [
          "portable-eval",
          sourcePath,
          "--output-dir",
          outputDir,
          "--sandbox",
          "no-exec-temp",
          "--schemas-dir",
          schemasDir,
          "--json"
        ],
        { env: { ...minimalEnv(), AGENTIQUE_PORTABILITY_TEST_TOKEN: "secret-value-that-must-not-appear" } }
      ),
    (error) => {
      assert.equal(error.code, 1);
      const failedReport = JSON.parse(error.stdout);
      assert.equal(failedReport.decision, "no_go");
      assertFindings(failedReport, ["credential-env-detected"]);
      assert.equal(JSON.stringify(failedReport).includes("secret-value-that-must-not-appear"), false);
      return true;
    }
  );
});

async function generatePortableAdapter() {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-portability-roundtrip-"));
  const sourcePath = path.join(tempDir, "portable-profile.json");
  const outputDir = path.join(tempDir, "generated");
  await writeJson(sourcePath, portableProfileFixture());
  await runValidator([
    "portable-generate",
    sourcePath,
    "--target",
    "codex-skill",
    "--output",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  return {
    tempDir,
    sourcePath,
    outputDir,
    manifestPath: path.join(outputDir, "portable", "generated-adapter-manifest.json")
  };
}

function portableProfileFixture(overrides = {}) {
  return {
    contractVersion: "1.0",
    profileId: "source-reviewer",
    displayName: "Source Reviewer",
    summary: "Reviews public source notes and produces a bounded summary.",
    canonicalSource: {
      sourceId: "source-reviewer-skill",
      sourceType: "markdown",
      sourceDigest: "sha256:aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa",
      license: "Apache-2.0",
      provenance: {
        sourceUrl: "https://github.com/agentique/examples",
        declaredBy: "example-creator",
        declaredAt: "2026-06-18T00:00:00.000Z"
      },
      noExecution: true,
      lifecycleHooksTrusted: false
    },
    profiles: [
      {
        profileId: "review",
        modes: ["summarize"],
        aliases: ["summary"],
        defaultMode: "summarize"
      }
    ],
    commands: [
      {
        commandId: "summarize-public-source",
        profileId: "review",
        mode: "summarize",
        aliases: ["summarize"],
        summary: "Summarizes public source notes with no execution.",
        instruction: "Read the provided public notes and produce a concise summary with open questions."
      }
    ],
    targetHosts: [
      {
        targetId: "codex-skill",
        support: "instruction-only",
        artifactKind: "skill",
        noExecution: true,
        writesUserConfig: false,
        lifecycleHooksTrusted: false,
        reasons: ["static-adapter"]
      }
    ],
    blockedStates: [
      {
        code: "lifecycle-hooks",
        reason: "Lifecycle hooks are not trusted by local tooling."
      }
    ],
    publicProjection: {
      nonCertifying: true,
      noRuntimeClaim: true,
      noApprovalClaim: true,
      redaction: {
        secrets: true,
        privatePaths: true,
        internalPlanning: true
      }
    },
    deferredRisks: [
      {
        marker: "adapter-hand-tuning",
        ceiling: "low",
        upgradeTrigger: "new-target-family",
        status: "monitoring"
      }
    ],
    ...overrides
  };
}

function generatedManifestFixture() {
  return {
    contractVersion: "1.0",
    generator: {
      name: "agentique-portable-adapter-generator",
      version: "0.1.0",
      generatedAt: "2026-06-18T00:00:00.000Z"
    },
    source: {
      profileId: "source-reviewer",
      sourceDigest: sha256Json(portableProfileFixture()),
      schemaId: "https://schemas.agentique.io/portable-profile.schema.json"
    },
    target: {
      targetId: "codex-skill",
      support: "instruction-only",
      artifactKind: "skill",
      noExecution: true
    },
    files: [
      {
        path: "codex-skill/SKILL.md",
        role: "descriptor",
        bytes: 256,
        sha256: "sha256:bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb"
      }
    ],
    commandMappings: [
      {
        commandId: "summarize-public-source",
        profileId: "review",
        mode: "summarize",
        path: "codex-skill/SKILL.md",
        invariantPhrases: ["do not install or execute"]
      }
    ],
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
      checkedAt: "2026-06-18T00:00:00.000Z"
    }
  };
}

async function runValidator(args, options = {}) {
  return execFileAsync(process.execPath, [cliPath, ...args], {
    cwd: packageDir,
    maxBuffer: 1024 * 1024,
    ...options
  });
}

function minimalEnv() {
  return {
    PATH: process.env.PATH ?? "",
    SystemRoot: process.env.SystemRoot ?? process.env.SYSTEMROOT ?? "",
    TEMP: os.tmpdir(),
    TMP: os.tmpdir()
  };
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function sha256Json(value) {
  return `sha256:${createHash("sha256").update(`${JSON.stringify(value, null, 2)}\n`).digest("hex")}`;
}

function assertFindings(report, expectedCodes) {
  const codes = new Set(report.findings.map((finding) => finding.code));
  for (const code of expectedCodes) {
    assert.equal(codes.has(code), true, `expected finding ${code}, got ${[...codes].join(", ")}`);
  }
}
