import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildStaticPackageDryRun, createSourceNoGoReport, validateUploadCandidate } from "../src/resource-upload.mjs";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.resolve(repoDir, "..", "..");
const schemasDir = path.resolve(packageDir, "schemas");
const cliPath = path.join(repoDir, "src", "cli.mjs");
const execFileAsync = promisify(execFile);

test("upload candidate validator accepts static skill metadata and writes an explicit report", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-valid-"));
  const candidatePath = path.join(tempDir, "skill-source-package.json");
  const outputPath = path.join(tempDir, "reports", "candidate-report.json");
  await writeJson(candidatePath, skillCandidate());

  const report = await validateUploadCandidate({ sourcePath: candidatePath, outputPath, schemasDir });
  const writtenReport = JSON.parse(await fs.readFile(outputPath, "utf8"));

  assert.equal(report.ok, true);
  assert.equal(report.decision, "review_candidate");
  assert.equal(report.summary.candidateId, "skill-source:engineering-skills");
  assert.equal(report.summary.itemCount, 1);
  assert.equal(report.safety.noExecution, true);
  assert.equal(report.safety.noUpload, true);
  assert.equal(report.files[0].path, "candidate-report.json");
  assert.equal(writtenReport.ok, true);
  assert.equal(JSON.stringify(report).includes(tempDir), false);
});

test("upload candidate validator accepts role plugin metadata without connector activation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-role-"));
  const candidatePath = path.join(tempDir, "role-plugin-pack.json");
  const outputPath = path.join(tempDir, "reports", "role-report.json");
  await writeJson(candidatePath, rolePluginCandidate());

  const report = await validateUploadCandidate({ sourcePath: candidatePath, outputPath, schemasDir });

  assert.equal(report.ok, true);
  assert.equal(report.candidateType, "role-plugin-pack");
  assert.equal(report.summary.candidateId, "role-pack:data-analysis");
  assert.equal(report.safety.noNetwork, true);
  assert.equal(report.findings.length, 0);
});

test("upload candidate validator fails closed for runtime deferred and noncommercial sources", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-deferred-"));
  const runtimePath = path.join(tempDir, "runtime.json");
  const runtimeOutput = path.join(tempDir, "runtime-report.json");
  await writeJson(
    runtimePath,
    skillCandidate({
      gate: gate({
        disposition: "runtime-deferred",
        sourceKind: "runtime-source",
        staticScanState: "review-required",
        runtimeClass: "memory-store",
        requiresRuntime: true,
        capabilities: ["memory-store", "local-db"],
        qualityStatus: "needs-review",
        gateStatus: "deferred",
        reasons: ["runtime-sandbox-required", "memory-privacy-review-required"]
      }),
      packagePlan: {
        ...skillCandidate().packagePlan,
        packageKind: "runtime-backed-source"
      },
      skills: [
        {
          ...skillCandidate().skills[0],
          contentMode: "runtime-backed"
        }
      ]
    })
  );

  const runtimeReport = await validateUploadCandidate({ sourcePath: runtimePath, outputPath: runtimeOutput, schemasDir });
  assert.equal(runtimeReport.ok, false);
  assertFindings(runtimeReport, ["runtime-deferred", "scanner-review-required", "runtime-sandbox-required", "skill-content-mode-blocked"]);

  const blockedPath = path.join(tempDir, "noncommercial.json");
  await writeJson(
    blockedPath,
    rolePluginCandidate({
      gate: gate({
        disposition: "reference-only-blocked",
        policy: "noncommercial-blocked",
        licenseExpression: "PolyForm-Noncommercial-1.0.0",
        sourceKind: "reference-source",
        runtimeClass: "repository-graph",
        gateStatus: "blocked",
        reasons: ["noncommercial-license", "reference-only"]
      }),
      packagePlan: {
        ...rolePluginCandidate().packagePlan,
        packageKind: "reference-only-record"
      }
    })
  );
  const blockedReport = await validateUploadCandidate({
    sourcePath: blockedPath,
    outputPath: path.join(tempDir, "blocked-report.json"),
    schemasDir
  });
  assert.equal(blockedReport.ok, false);
  assertFindings(blockedReport, ["source-disposition-blocked", "license-noncommercial"]);
});

test("upload candidate validator fails closed for unknown license provenance gaps and source digest mismatch", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-provenance-"));
  const unknownPath = path.join(tempDir, "unknown-license.json");
  await writeJson(
    unknownPath,
    skillCandidate({
      gate: gate({
        policy: "unknown-blocked",
        licenseExpression: "NOASSERTION",
        provenanceReviewed: false,
        perFileLicenseInventory: false,
        reasons: ["unknown-license"]
      })
    })
  );

  const unknownReport = await validateUploadCandidate({
    sourcePath: unknownPath,
    outputPath: path.join(tempDir, "unknown-report.json"),
    schemasDir
  });
  assert.equal(unknownReport.ok, false);
  assertFindings(unknownReport, ["license-unknown", "provenance-incomplete", "per-file-license-incomplete", "attribution-review-required"]);

  const derivedPath = path.join(tempDir, "derived-source.json");
  await writeJson(
    derivedPath,
    skillCandidate({
      gate: gate({
        policy: "needs-review",
        licenseExpression: "MIT",
        derivedSourceNotices: ["Translated source notice requires human review."],
        reasons: ["derived-source-review-required"]
      })
    })
  );
  const derivedReport = await validateUploadCandidate({
    sourcePath: derivedPath,
    outputPath: path.join(tempDir, "derived-report.json"),
    schemasDir
  });
  assert.equal(derivedReport.ok, false);
  assertFindings(derivedReport, ["license-review-required", "derived-source-review-required"]);

  const mismatchPath = path.join(tempDir, "digest-mismatch.json");
  await writeJson(
    mismatchPath,
    skillCandidate({
      gate: gate({
        snapshotDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee"
      })
    })
  );
  const mismatchReport = await validateUploadCandidate({
    sourcePath: mismatchPath,
    outputPath: path.join(tempDir, "mismatch-report.json"),
    schemasDir
  });
  assert.equal(mismatchReport.ok, false);
  assertFindings(mismatchReport, ["source-digest-mismatch"]);
});

test("package dry-run refuses provenance blocked candidates before descriptor output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-provenance-blocked-"));
  const candidatePath = path.join(tempDir, "candidate.json");
  const outputDir = path.join(tempDir, "out");
  await writeJson(
    candidatePath,
    skillCandidate({
      gate: gate({
        policy: "unknown-blocked",
        licenseExpression: "NOASSERTION",
        provenanceReviewed: false,
        perFileLicenseInventory: false,
        reasons: ["unknown-license"]
      })
    })
  );

  const report = await buildStaticPackageDryRun({ sourcePath: candidatePath, outputDir, schemasDir });

  assert.equal(report.ok, false);
  assertFindings(report, ["license-unknown", "provenance-incomplete", "per-file-license-incomplete"]);
  assert.equal(await fileExists(path.join(outputDir, "package", "descriptors", "test-driven-development.json")), false);
});

test("source no-go maps unknown license and provenance blockers to review prerequisites", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-source-no-go-provenance-"));
  const candidatePath = path.join(tempDir, "candidate.json");
  await writeJson(
    candidatePath,
    runtimeSkillCandidate({
      sourceKind: "reference-source",
      disposition: "reference-only-blocked",
      policy: "unknown-blocked",
      licenseExpression: "NOASSERTION",
      provenanceReviewed: false,
      perFileLicenseInventory: false,
      runtimeClass: "repository-graph",
      capabilities: ["repository-graph"],
      gateStatus: "blocked",
      reasons: ["unknown-license", "derived-source-review-required", "reference-only"]
    })
  );

  const report = await createSourceNoGoReport({
    sourcePath: candidatePath,
    outputPath: path.join(tempDir, "source-no-go-report.json"),
    schemasDir
  });

  assert.equal(report.ok, true);
  assert.equal(report.decision, "license_blocked");
  assert.equal(report.prerequisites.includes("unknown-license-review"), true);
  assert.equal(report.prerequisites.includes("source-provenance-review"), true);
  assert.equal(report.prerequisites.includes("repository-graph-review"), true);
});

test("upload candidate validator redacts unsafe path secret and overclaim material", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-unsafe-"));
  const candidatePath = path.join(tempDir, "unsafe.json");
  const outputPath = path.join(tempDir, "unsafe-report.json");
  const secret = ["sk-", "a".repeat(24)].join("");
  await writeJson(
    candidatePath,
    skillCandidate({
      summary: "This candidate is approved and ready to run for every workspace.",
      skills: [
        {
          ...skillCandidate().skills[0],
          setupRequirements: [`Read C:\\Users\\operator\\private-notes first with ${secret}`]
        }
      ]
    })
  );

  const report = await validateUploadCandidate({ sourcePath: candidatePath, outputPath, schemasDir });
  const serialized = JSON.stringify(report);

  assert.equal(report.ok, false);
  assertFindings(report, ["internal-path-forbidden", "secret-value-forbidden", "overclaim-forbidden"]);
  assert.equal(serialized.includes(secret), false);
  assert.equal(serialized.includes("C:\\Users"), false);
  assert.equal(serialized.includes(tempDir), false);
});

test("upload candidate CLI emits stable json and requires explicit output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-upload-candidate-cli-"));
  const candidatePath = path.join(tempDir, "candidate.json");
  const outputPath = path.join(tempDir, "candidate-report.json");
  await writeJson(candidatePath, skillCandidate());

  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "upload-candidate",
    candidatePath,
    "--output",
    outputPath,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.command, "upload-candidate");
  assert.equal(report.output, "candidate-report.json");
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "upload-candidate", candidatePath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /requires --output <file>/);
      return true;
    }
  );
});

test("package dry-run builder writes deterministic static skill review descriptors", async () => {
  const firstDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-dry-run-skill-a-"));
  const secondDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-dry-run-skill-b-"));
  const candidatePath = path.join(firstDir, "candidate.json");
  await writeJson(candidatePath, skillCandidate());

  const first = await buildStaticPackageDryRun({ sourcePath: candidatePath, outputDir: firstDir, schemasDir });
  const second = await buildStaticPackageDryRun({ sourcePath: candidatePath, outputDir: secondDir, schemasDir });
  const manifestPath = path.join(firstDir, "package", "static-package-dry-run.json");
  const descriptorPath = path.join(firstDir, "package", "descriptors", "test-driven-development.json");
  const previewPath = path.join(firstDir, "package", "resource-manifest.preview.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));

  assert.equal(first.ok, true);
  assert.equal(first.decision, "review_candidate");
  assert.equal(first.manifest.packageId, "skill-source:engineering-skills");
  assert.equal(manifest.package.descriptorOnly, true);
  assert.equal(manifest.safety.noExecution, true);
  assert.equal(manifest.safety.noUpload, true);
  assert.equal(manifest.resourceManifestPreview.package.files.length, 1);
  assert.equal(first.files.some((file) => file.path === "package/static-package-dry-run.json"), true);
  assert.equal(JSON.stringify(first).includes(firstDir), false);
  assert.equal(JSON.stringify(first).includes(secondDir), false);
  assert.deepEqual(
    first.files.map((file) => [file.path, file.sha256]).sort(),
    second.files.map((file) => [file.path, file.sha256]).sort()
  );
  assert.equal(Boolean(await fileExists(descriptorPath)), true);
  assert.equal(Boolean(await fileExists(previewPath)), true);
});

test("package dry-run builder writes role plugin descriptors without connector activation", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-dry-run-role-"));
  const candidatePath = path.join(tempDir, "role-plugin-pack.json");
  await writeJson(candidatePath, rolePluginCandidate());

  const report = await buildStaticPackageDryRun({ sourcePath: candidatePath, outputDir: tempDir, schemasDir });
  const descriptor = JSON.parse(await fs.readFile(path.join(tempDir, "package", "descriptors", "role-plugin-pack.json"), "utf8"));

  assert.equal(report.ok, true);
  assert.equal(report.candidateType, "role-plugin-pack");
  assert.equal(report.summary.candidateId, "role-pack:data-analysis");
  assert.equal(descriptor.safety.noConnectorActivation, true);
  assert.equal(descriptor.connectorRequirements[0].credentialValuesIncluded, false);
  assert.equal(descriptor.connectorRequirements[0].activationIncluded, false);
});

test("package dry-run builder fails closed before descriptors for deferred or blocked candidates", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-dry-run-blocked-"));
  const runtimePath = path.join(tempDir, "runtime.json");
  await writeJson(
    runtimePath,
    skillCandidate({
      gate: gate({
        disposition: "runtime-deferred",
        sourceKind: "runtime-source",
        staticScanState: "review-required",
        runtimeClass: "memory-store",
        requiresRuntime: true,
        capabilities: ["memory-store"],
        qualityStatus: "needs-review",
        gateStatus: "deferred",
        reasons: ["runtime-sandbox-required"]
      }),
      packagePlan: {
        ...skillCandidate().packagePlan,
        packageKind: "runtime-backed-source"
      },
      skills: [
        {
          ...skillCandidate().skills[0],
          contentMode: "runtime-backed"
        }
      ]
    })
  );

  const runtimeReport = await buildStaticPackageDryRun({
    sourcePath: runtimePath,
    outputDir: path.join(tempDir, "runtime-out"),
    schemasDir
  });

  assert.equal(runtimeReport.ok, false);
  assertFindings(runtimeReport, ["runtime-deferred", "scanner-review-required", "runtime-sandbox-required", "skill-content-mode-blocked"]);
  assert.equal(await fileExists(path.join(tempDir, "runtime-out", "package", "descriptors", "test-driven-development.json")), false);

  const blockedPath = path.join(tempDir, "noncommercial.json");
  await writeJson(
    blockedPath,
    rolePluginCandidate({
      gate: gate({
        disposition: "reference-only-blocked",
        policy: "noncommercial-blocked",
        licenseExpression: "PolyForm-Noncommercial-1.0.0",
        sourceKind: "reference-source",
        runtimeClass: "repository-graph",
        gateStatus: "blocked",
        reasons: ["noncommercial-license", "reference-only"]
      }),
      packagePlan: {
        ...rolePluginCandidate().packagePlan,
        packageKind: "reference-only-record"
      }
    })
  );
  const blockedReport = await buildStaticPackageDryRun({
    sourcePath: blockedPath,
    outputDir: path.join(tempDir, "blocked-out"),
    schemasDir
  });

  assert.equal(blockedReport.ok, false);
  assertFindings(blockedReport, ["source-disposition-blocked", "license-noncommercial"]);
  assert.equal(await fileExists(path.join(tempDir, "blocked-out", "package", "descriptors", "role-plugin-pack.json")), false);
});

test("package dry-run CLI emits stable json and requires explicit output directory", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-package-dry-run-cli-"));
  const candidatePath = path.join(tempDir, "candidate.json");
  const outputDir = path.join(tempDir, "out");
  await writeJson(candidatePath, skillCandidate());

  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "package-dry-run",
    candidatePath,
    "--output-dir",
    outputDir,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.command, "package-dry-run");
  assert.equal(report.output, "out");
  assert.equal(report.files.some((file) => file.path === "package/static-package-dry-run.json"), true);
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "package-dry-run", candidatePath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /requires --output-dir <dir>/);
      return true;
    }
  );
});

test("source no-go reports security scanner deferred prerequisites without descriptors", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-source-no-go-security-"));
  const candidatePath = path.join(tempDir, "security-scanner.json");
  const outputPath = path.join(tempDir, "source-no-go-report.json");
  await writeJson(
    candidatePath,
    runtimeSkillCandidate({
      packageId: "skill-source:security-scanner",
      sourceId: "security-scanner",
      runtimeClass: "security-scanner",
      capabilities: ["package-lifecycle", "filesystem-read"],
      reasons: ["runtime-sandbox-required", "security-review-required"]
    })
  );

  const report = await createSourceNoGoReport({ sourcePath: candidatePath, outputPath, schemasDir });
  const written = JSON.parse(await fs.readFile(outputPath, "utf8"));

  assert.equal(report.ok, true);
  assert.equal(report.decision, "runtime_deferred");
  assert.equal(report.state, "deferred");
  assert.equal(report.candidate.candidateId, "skill-source:security-scanner");
  assert.equal(report.prerequisites.includes("sandbox-runtime-review"), true);
  assert.equal(report.prerequisites.includes("security-tool-review"), true);
  assert.equal(report.prerequisites.includes("scanner-review"), true);
  assert.equal(report.safety.noExecution, true);
  assert.equal(report.safety.noUpload, true);
  assert.equal(written.command, "source-no-go");
  assert.equal(await fileExists(path.join(tempDir, "package", "descriptors", "security-scanner.json")), false);
  assert.equal(JSON.stringify(report).includes(tempDir), false);
});

test("source no-go maps memory and internet capability prerequisites", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-source-no-go-runtime-"));
  const memoryPath = path.join(tempDir, "memory.json");
  const internetPath = path.join(tempDir, "internet.json");
  await writeJson(
    memoryPath,
    runtimeSkillCandidate({
      packageId: "skill-source:memory-store",
      sourceId: "memory-store",
      runtimeClass: "memory-store",
      capabilities: ["memory-store", "local-db"],
      reasons: ["runtime-sandbox-required", "memory-privacy-review-required"]
    })
  );
  await writeJson(
    internetPath,
    runtimeSkillCandidate({
      packageId: "skill-source:internet-reach",
      sourceId: "internet-reach",
      runtimeClass: "internet-capability",
      capabilities: ["external-network", "browser-state"],
      reasons: ["runtime-sandbox-required"]
    })
  );

  const memoryReport = await createSourceNoGoReport({
    sourcePath: memoryPath,
    outputPath: path.join(tempDir, "memory-report.json"),
    schemasDir
  });
  const internetReport = await createSourceNoGoReport({
    sourcePath: internetPath,
    outputPath: path.join(tempDir, "internet-report.json"),
    schemasDir
  });

  assert.equal(memoryReport.ok, true);
  assert.equal(memoryReport.prerequisites.includes("memory-privacy-review"), true);
  assert.equal(memoryReport.safety.noMemoryStoreRead, true);
  assert.equal(internetReport.ok, true);
  assert.equal(internetReport.prerequisites.includes("internet-capability-review"), true);
  assert.equal(internetReport.prerequisites.includes("browser-session-consent"), true);
  assert.equal(internetReport.safety.noBrowserAccess, true);
  assert.equal(internetReport.safety.noNetwork, true);
});

test("source no-go blocks repository graph and noncommercial reference-only sources", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-source-no-go-reference-"));
  const candidatePath = path.join(tempDir, "repository-graph.json");
  await writeJson(
    candidatePath,
    runtimeSkillCandidate({
      packageId: "skill-source:repository-graph",
      sourceId: "repository-graph",
      sourceKind: "reference-source",
      disposition: "reference-only-blocked",
      policy: "noncommercial-blocked",
      licenseExpression: "PolyForm-Noncommercial-1.0.0",
      runtimeClass: "repository-graph",
      capabilities: ["repository-graph"],
      gateStatus: "blocked",
      reasons: ["noncommercial-license", "reference-only"]
    })
  );

  const report = await createSourceNoGoReport({
    sourcePath: candidatePath,
    outputPath: path.join(tempDir, "reference-report.json"),
    schemasDir
  });

  assert.equal(report.ok, true);
  assert.equal(report.decision, "license_blocked");
  assert.equal(report.state, "blocked");
  assert.equal(report.prerequisites.includes("repository-graph-review"), true);
  assert.equal(report.prerequisites.includes("noncommercial-license-review"), true);
  assert.equal(report.safety.noRepositoryGraphRuntime, true);
  assert.equal(report.safety.noPublication, true);
});

test("source no-go CLI emits stable json and requires explicit output", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-source-no-go-cli-"));
  const candidatePath = path.join(tempDir, "candidate.json");
  const outputPath = path.join(tempDir, "source-no-go-report.json");
  await writeJson(candidatePath, runtimeSkillCandidate());

  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "source-no-go",
    candidatePath,
    "--output",
    outputPath,
    "--schemas-dir",
    schemasDir,
    "--json"
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.ok, true);
  assert.equal(report.command, "source-no-go");
  assert.equal(report.output, undefined);
  assert.equal(report.files[0].path, "source-no-go-report.json");
  assert.equal(JSON.stringify(report).includes(tempDir), false);

  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "source-no-go", candidatePath, "--schemas-dir", schemasDir, "--json"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /requires --output <file>/);
      return true;
    }
  );
});

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

async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

function skillCandidate(overrides = {}) {
  const base = {
    contractVersion: "agentique.skillSourcePackage.v1",
    packageId: "skill-source:engineering-skills",
    title: "Engineering Skills",
    summary: "Static skill metadata prepared for local review-only package planning.",
    source: {
      sourceId: "engineering-skills",
      sourceName: "Engineering Skills",
      sourceUrl: "https://github.com/example/engineering-skills",
      snapshotDigest: "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd",
      licenseExpression: "MIT"
    },
    skills: [
      {
        skillId: "test-driven-development",
        title: "Test Driven Development",
        summary: "Guides a developer through a small test-first implementation workflow.",
        platform: "codex-skill",
        contentMode: "static-instructions",
        files: ["skills/test-driven-development/SKILL.md"],
        licenseExpression: "MIT",
        setupRequirements: ["Inspect existing tests before changing source files."],
        outputKinds: ["plan", "review", "patch-guidance"]
      }
    ],
    packagePlan: {
      packageKind: "static-skill-pack",
      deterministicDryRunOnly: true,
      includesRuntimeCode: false,
      installsDependencies: false,
      executesCandidateCode: false,
      outputManifestPath: "dist/engineering-skills.package.json"
    },
    gate: gate()
  };

  return {
    ...base,
    ...overrides
  };
}

function rolePluginCandidate(overrides = {}) {
  const base = {
    contractVersion: "agentique.rolePluginPack.v1",
    packId: "role-pack:data-analysis",
    title: "Data Analysis Pack",
    summary: "Role-pack metadata prepared for connector-aware local review planning.",
    role: "data-analytics",
    includedSkills: [
      {
        skillId: "dataset-summary",
        title: "Dataset Summary",
        sourcePath: "skills/dataset-summary/SKILL.md",
        connectorRequired: true,
        outputKinds: ["analysis", "report"]
      }
    ],
    connectorRequirements: [
      {
        connectorId: "warehouse",
        requirementState: "placeholder-redacted",
        credentialValuesIncluded: false,
        activationIncluded: false,
        publicSetupNote: "Connectors are described for review and are not activated by this package."
      }
    ],
    pluginManifests: [
      {
        kind: "codex-plugin",
        path: "plugin/plugin.json",
        sanitized: true,
        noCredentialValues: true,
        noRuntimeActivation: true
      }
    ],
    packagePlan: {
      packageKind: "role-plugin-pack",
      deterministicDryRunOnly: true,
      noAutomaticInstall: true,
      directInstallAvailable: false,
      connectorActivationIncluded: false,
      executesPackContent: false
    },
    gate: gate({
      sourceId: "role-plugin-pack",
      sourceKind: "role-plugin-repository",
      sourceUrl: "https://github.com/example/role-plugin-pack",
      snapshotDigest: "sha256:eeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeeee",
      runtimeClass: "connector-required",
      capabilities: ["connector-metadata", "mcp-metadata"],
      reasons: ["static-review-ready", "connector-review-required"]
    })
  };

  return {
    ...base,
    ...overrides
  };
}

function runtimeSkillCandidate(overrides = {}) {
  return skillCandidate({
    packageId: overrides.packageId ?? "skill-source:runtime-source",
    source: {
      sourceId: overrides.sourceId ?? "runtime-source",
      sourceName: "Runtime Source",
      sourceUrl: "https://github.com/example/runtime-source",
      snapshotDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      licenseExpression: overrides.licenseExpression ?? "MIT"
    },
    skills: [
      {
        ...skillCandidate().skills[0],
        contentMode: "runtime-backed",
        files: ["runtime/SKILL.md"],
        licenseExpression: overrides.licenseExpression ?? "MIT"
      }
    ],
    packagePlan: {
      ...skillCandidate().packagePlan,
      packageKind: "runtime-backed-source"
    },
    gate: gate({
      disposition: overrides.disposition ?? "runtime-deferred",
      sourceId: overrides.sourceId ?? "runtime-source",
      sourceKind: overrides.sourceKind ?? "runtime-source",
      sourceUrl: "https://github.com/example/runtime-source",
      snapshotDigest: "sha256:ffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffffff",
      policy: overrides.policy ?? "allowed",
      licenseExpression: overrides.licenseExpression ?? "MIT",
      provenanceReviewed: overrides.provenanceReviewed ?? true,
      perFileLicenseInventory: overrides.perFileLicenseInventory ?? true,
      attributionRequired: overrides.attributionRequired ?? true,
      derivedSourceNotices: overrides.derivedSourceNotices,
      staticScanState: overrides.staticScanState ?? "review-required",
      runtimeClass: overrides.runtimeClass ?? "local-service",
      requiresRuntime: overrides.requiresRuntime ?? true,
      capabilities: overrides.capabilities ?? ["shell-command"],
      qualityStatus: overrides.qualityStatus ?? "needs-review",
      gateStatus: overrides.gateStatus ?? "deferred",
      reasons: overrides.reasons ?? ["runtime-sandbox-required"]
    })
  });
}

function gate(overrides = {}) {
  return {
    contractVersion: "agentique.uploadCandidateGate.v1",
    disposition: overrides.disposition ?? "static-review-candidate",
    sourceSnapshot: {
      sourceId: overrides.sourceId ?? "engineering-skills",
      sourceKind: overrides.sourceKind ?? "skill-repository",
      sourceUrl: overrides.sourceUrl ?? "https://github.com/example/engineering-skills",
      snapshotDigest: overrides.snapshotDigest ?? "sha256:dddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddddd"
    },
    licenseProvenance: {
      licenseExpression: overrides.licenseExpression ?? "MIT",
      policy: overrides.policy ?? "allowed",
      attributionRequired: overrides.attributionRequired ?? true,
      perFileLicenseInventory: overrides.perFileLicenseInventory ?? true,
      provenanceReviewed: overrides.provenanceReviewed ?? true,
      ...(overrides.derivedSourceNotices ? { derivedSourceNotices: overrides.derivedSourceNotices } : {})
    },
    securityEvidenceSummary: {
      staticScanState: overrides.staticScanState ?? "passed",
      noSecretsDetected: true,
      noInternalMarkers: true,
      findingCategoryCounts: {
        "prompt-injection": 0,
        "supply-chain": 0
      }
    },
    runtimeRisk: {
      runtimeClass: overrides.runtimeClass ?? "static-descriptor",
      requiresRuntime: overrides.requiresRuntime ?? false,
      noExecution: true,
      noRuntimeClaim: true,
      sandboxRequired: overrides.sandboxRequired ?? false,
      capabilities: overrides.capabilities ?? ["static-instructions"]
    },
    qualityRubric: {
      status: overrides.qualityStatus ?? "review-candidate",
      humanReviewRequired: true,
      dimensions: [
        {
          name: "scope-specificity",
          state: "passed"
        }
      ]
    },
    publicProjection: {
      nonCertifying: true,
      noApprovalClaim: true,
      noRuntimeClaim: true,
      noPublicationClaim: true,
      redaction: {
        secrets: true,
        privatePaths: true,
        internalPlanning: true,
        rawFindings: true,
        rawSource: true,
        scannerThresholds: true,
        credentialValues: true,
        signedUrls: true
      }
    },
    gateState: {
      status: overrides.gateStatus ?? "review-candidate",
      reasons: overrides.reasons ?? ["static-review-ready"]
    }
  };
}
