import { collectWorkflowPostureFindings } from "./lib/workflow-posture.mjs";

const failures = collectWorkflowPostureFindings(process.cwd());

if (failures.length > 0) {
  console.error("Workflow posture check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log("Workflow posture check passed.");
}
