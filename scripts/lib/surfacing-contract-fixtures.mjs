import { readFileSync } from "node:fs";
import { join } from "node:path";

export const REQUIRED_SURFACING_FIXTURE_CASES = Object.freeze([
  "overlapping-tools",
  "unsafe-relevant-candidate",
  "stale-resource",
  "off-topic-resource",
  "invalid-output",
  "context-budget-overflow"
]);

export function collectSurfacingContractFixtureFindings(repoRoot) {
  const fixturePath = join(repoRoot, "scripts", "fixtures", "surfacing-contract-matrix", "matrix.json");
  let matrix;

  try {
    matrix = JSON.parse(readFileSync(fixturePath, "utf8"));
  } catch {
    return ["surfacing contract fixture matrix is missing or invalid JSON"];
  }

  const findings = [];
  if (matrix.schemaVersion !== "agentique.surfacingFixtureMatrix.v1") {
    findings.push("surfacing contract fixture matrix has an unexpected schema version");
  }
  if (matrix.publicOnly !== true) {
    findings.push("surfacing contract fixture matrix must be marked publicOnly");
  }
  if (!Array.isArray(matrix.cases)) {
    findings.push("surfacing contract fixture matrix must include cases");
    return findings;
  }

  const caseIds = new Set();
  for (const [index, item] of matrix.cases.entries()) {
    if (!isRecord(item)) {
      findings.push(`surfacing contract fixture case ${index} must be an object`);
      continue;
    }
    if (typeof item.id === "string") {
      caseIds.add(item.id);
    }
    if (typeof item.expectedDisposition !== "string" || item.expectedDisposition.trim() === "") {
      findings.push(`surfacing contract fixture case ${item.id ?? index} is missing expectedDisposition`);
    }
    if (!Array.isArray(item.signals) || item.signals.length === 0) {
      findings.push(`surfacing contract fixture case ${item.id ?? index} is missing signals`);
    }
  }

  for (const requiredCase of REQUIRED_SURFACING_FIXTURE_CASES) {
    if (!caseIds.has(requiredCase)) {
      findings.push(`surfacing contract fixture matrix missing required case: ${requiredCase}`);
    }
  }

  return findings;
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}
