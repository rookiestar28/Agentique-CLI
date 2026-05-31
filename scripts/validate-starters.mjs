import { readdir } from "node:fs/promises";
import path from "node:path";
import { validatePackage } from "../packages/validator/src/validator.mjs";

const root = process.cwd();
const startersDir = path.join(root, "starters");
const schemasDir = path.join(root, "schemas");

const entries = await readdir(startersDir, { withFileTypes: true });
const starterNames = entries
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

const failures = [];

for (const name of starterNames) {
  const report = await validatePackage({
    command: "validate",
    packageDir: path.join(startersDir, name),
    schemasDir
  });

  if (report.ok) {
    console.log(`PASS ${name}`);
    continue;
  }

  failures.push({ name, findings: report.findings });
  console.error(`FAIL ${name}`);
  for (const finding of report.findings) {
    console.error(`- ${finding.code} at ${finding.location}: ${finding.message}`);
  }
}

if (failures.length > 0) {
  process.exitCode = 1;
}
