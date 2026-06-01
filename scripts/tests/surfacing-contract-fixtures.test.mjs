import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  REQUIRED_SURFACING_FIXTURE_CASES,
  collectSurfacingContractFixtureFindings
} from "../lib/surfacing-contract-fixtures.mjs";

test("accepts a complete public surfacing contract fixture matrix", async () => {
  const repoRoot = await createRepoWithMatrix({
    schemaVersion: "agentique.surfacingFixtureMatrix.v1",
    publicOnly: true,
    cases: REQUIRED_SURFACING_FIXTURE_CASES.map((id) => ({
      id,
      description: `Synthetic public fixture for ${id}.`,
      signals: ["public", "bounded"],
      expectedDisposition: "documented-public-fixture"
    }))
  });

  assert.deepEqual(collectSurfacingContractFixtureFindings(repoRoot), []);
});

test("rejects incomplete surfacing contract fixture matrices", async () => {
  const repoRoot = await createRepoWithMatrix({
    schemaVersion: "agentique.surfacingFixtureMatrix.v1",
    publicOnly: true,
    cases: [
      {
        id: "overlapping-tools",
        signals: ["public"],
        expectedDisposition: "documented-public-fixture"
      }
    ]
  });

  const findings = collectSurfacingContractFixtureFindings(repoRoot);

  assert.equal(findings.some((finding) => finding.includes("unsafe-relevant-candidate")), true);
  assert.equal(findings.some((finding) => finding.includes("context-budget-overflow")), true);
});

test("rejects malformed surfacing contract fixture matrices", async () => {
  const repoRoot = await createRepoWithMatrix({
    schemaVersion: "wrong",
    publicOnly: false,
    cases: [{ id: "overlapping-tools" }]
  });

  const findings = collectSurfacingContractFixtureFindings(repoRoot);

  assert.deepEqual(findings, [
    "surfacing contract fixture matrix has an unexpected schema version",
    "surfacing contract fixture matrix must be marked publicOnly",
    "surfacing contract fixture case overlapping-tools is missing expectedDisposition",
    "surfacing contract fixture case overlapping-tools is missing signals",
    "surfacing contract fixture matrix missing required case: unsafe-relevant-candidate",
    "surfacing contract fixture matrix missing required case: stale-resource",
    "surfacing contract fixture matrix missing required case: off-topic-resource",
    "surfacing contract fixture matrix missing required case: invalid-output",
    "surfacing contract fixture matrix missing required case: context-budget-overflow"
  ]);
});

async function createRepoWithMatrix(matrix) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agentique-surfacing-fixtures-"));
  const fixtureDir = path.join(repoRoot, "scripts", "fixtures", "surfacing-contract-matrix");
  await mkdir(fixtureDir, { recursive: true });
  await writeFile(path.join(fixtureDir, "matrix.json"), `${JSON.stringify(matrix, null, 2)}\n`, "utf8");
  return repoRoot;
}
