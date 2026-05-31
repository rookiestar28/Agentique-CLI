import { readFileSync } from "node:fs";

const decision = JSON.parse(readFileSync("docs/release-go-no-go.json", "utf8"));
const failures = [];

if (!["go", "no_go"].includes(decision.decision)) {
  failures.push("decision must be go or no_go");
}

const localChecks = decision.localChecks ?? {};
for (const [key, value] of Object.entries(localChecks)) {
  if (value !== true) {
    failures.push(`local check is not complete: ${key}`);
  }
}

const externalEvidence = decision.externalEvidence ?? {};
const missingExternal = Object.entries(externalEvidence)
  .filter(([, value]) => value !== true)
  .map(([key]) => key);

if (decision.decision === "go") {
  if (decision.releaseBlocked !== false) {
    failures.push("go decision requires releaseBlocked=false");
  }
  for (const key of missingExternal) {
    failures.push(`go decision missing external evidence: ${key}`);
  }
}

if (decision.decision === "no_go") {
  if (decision.releaseBlocked !== true) {
    failures.push("no_go decision requires releaseBlocked=true");
  }
  if (!Array.isArray(decision.blockers) || decision.blockers.length === 0) {
    failures.push("no_go decision requires explicit blockers");
  }
}

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
}
