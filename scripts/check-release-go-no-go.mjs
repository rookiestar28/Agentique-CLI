import { readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const SCOPED_DECISION_KEYS = Object.freeze([
  "uploaderPublicationDecision",
  "parserVariantPublicationDecision",
  "catalogDownloadPublicationDecision",
  "agentNativePublicationDecision"
]);

export function collectReleaseDecisionFailures(decision) {
  const failures = [];

  failures.push(...collectDecisionFailures(decision, { scope: "root", includeScope: false }));

  for (const key of SCOPED_DECISION_KEYS) {
    if (decision[key]) {
      failures.push(...collectDecisionFailures(decision[key], { scope: key, includeScope: true }));
    }
  }

  return failures;
}

function collectDecisionFailures(decision, { scope, includeScope }) {
  const failures = [];
  const prefix = includeScope ? `${scope}: ` : "";

  if (!["go", "no_go"].includes(decision.decision)) {
    failures.push(`${prefix}decision must be go or no_go`);
  }

  const localChecks = decision.localChecks ?? {};
  for (const [key, value] of Object.entries(localChecks)) {
    if (value !== true) {
      failures.push(`${prefix}local check is not complete: ${key}`);
    }
  }

  const externalEvidence = decision.externalEvidence ?? {};
  const missingExternal = Object.entries(externalEvidence)
    .filter(([, value]) => value !== true)
    .map(([key]) => key);

  if (decision.decision === "go") {
    if (decision.releaseBlocked !== false) {
      failures.push(`${prefix}go decision requires releaseBlocked=false`);
    }
    for (const key of missingExternal) {
      failures.push(`${prefix}go decision missing external evidence: ${key}`);
    }
  }

  if (decision.decision === "no_go") {
    if (decision.releaseBlocked !== true) {
      failures.push(`${prefix}no_go decision requires releaseBlocked=true`);
    }
    if (!Array.isArray(decision.blockers) || decision.blockers.length === 0) {
      failures.push(`${prefix}no_go decision requires explicit blockers`);
    }
  }

  return failures;
}

export function main() {
  const decision = JSON.parse(readFileSync("docs/release-go-no-go.json", "utf8"));
  const failures = collectReleaseDecisionFailures(decision);

  if (failures.length > 0) {
    console.error("Release go/no-go check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  } else {
    console.log(
      decision.decision === "go"
        ? "Release go/no-go check passed: GO."
        : "Release go/no-go check passed: NO-GO with explicit blockers."
    );
    for (const key of SCOPED_DECISION_KEYS) {
      if (!decision[key]) {
        continue;
      }
      console.log(
        decision[key].decision === "go"
          ? `Scoped ${key} check passed: GO.`
          : `Scoped ${key} check passed: NO-GO with explicit blockers.`
      );
    }
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  main();
}
