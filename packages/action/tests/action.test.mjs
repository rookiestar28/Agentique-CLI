import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { pathToFileURL } from "node:url";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { buildValidatorArgs, resolveOutputPath, runAction, validateOutputFileInput } from "../src/action.mjs";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = path.resolve(repoDir, "..", "..");
const validatorScript = path.join(rootDir, "packages", "validator", "src", "cli.mjs");
const schemasDir = path.join(rootDir, "schemas");
const validPackageDir = path.join(rootDir, "starters", "agent-assistant");
const execFileAsync = promisify(execFile);

test("action metadata uses node20 and avoids secret inputs", async () => {
  const metadata = await fs.readFile(path.join(repoDir, "action.yml"), "utf8");
  assert.match(metadata, /using: node20/);
  assert.doesNotMatch(metadata, /secret/i);
  assert.doesNotMatch(metadata, /shell:/i);
});

test("example workflow is least privilege and avoids privileged pull request triggers", async () => {
  const workflow = await fs.readFile(path.join(rootDir, ".github", "workflows", "release-check.yml"), "utf8");
  assert.match(workflow, /permissions:\s*\r?\n\s+contents: read/);
  assert.match(workflow, /node-version:\s+\$\{\{\s*matrix\.node-version\s*\}\}/);
  assert.match(workflow, /node-version:\s+\["20", "22", "24"\]/);
  assert.match(workflow, /pull_request:/);
  assert.doesNotMatch(workflow, /pull_request_target/);
  assert.doesNotMatch(workflow, /secrets\./);
});

test("validator args are passed as an array without shell composition", () => {
  const args = buildValidatorArgs({
    validatorScript: "validator.mjs",
    packageDir: "pkg; rm -rf .",
    schemasDir: "schemas && echo unsafe"
  });

  assert.deepEqual(args, [
    "validator.mjs",
    "validate",
    "pkg; rm -rf .",
    "--schemas-dir",
    "schemas && echo unsafe",
    "--json"
  ]);
});

test("action runs validator with hyphenated inputs and writes a local-readiness report", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-action-"));
  const outputFile = "report.json";
  const code = await runAction({
    "INPUT_PACKAGE-DIR": validPackageDir,
    "INPUT_SCHEMAS-DIR": schemasDir,
    "INPUT_VALIDATOR-SCRIPT": validatorScript,
    "INPUT_OUTPUT-FILE": outputFile
  }, tempDir);

  assert.equal(code, 0);
  const report = JSON.parse(await fs.readFile(path.join(tempDir, outputFile), "utf8"));
  assert.equal(report.ok, true);
  assert.equal(report.command, "validate");
});

test("action appends report output to GITHUB_OUTPUT", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-action-output-"));
  const outputFile = "report.json";
  const githubOutput = path.join(tempDir, "github-output.txt");

  const code = await runAction({
    "INPUT_PACKAGE-DIR": validPackageDir,
    "INPUT_SCHEMAS-DIR": schemasDir,
    "INPUT_VALIDATOR-SCRIPT": validatorScript,
    "INPUT_OUTPUT-FILE": outputFile,
    GITHUB_OUTPUT: githubOutput
  }, tempDir);

  assert.equal(code, 0);
  assert.equal(await fs.readFile(githubOutput, "utf8"), `report=${outputFile}\n`);
});

test("action rejects output-file control characters before writing GitHub outputs", () => {
  for (const outputFile of [
    "report.json\nmalicious=1",
    "report.json\rmalicious=1",
    "report\u0000.json",
    "report\u001f.json"
  ]) {
    assert.throws(
      () => validateOutputFileInput(outputFile),
      (error) => error instanceof Error && /control characters/.test(error.message)
    );
  }
});

test("action output-file validation preserves valid relative paths", () => {
  assert.equal(validateOutputFileInput("reports/agentique-validation.json"), "reports/agentique-validation.json");
});

test("action report path resolver rejects paths outside the workspace", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-action-path-"));

  for (const outputFile of [
    "../outside.json",
    "reports/../../outside.json",
    path.resolve(tempDir, "absolute.json"),
    "\\absolute\\report.json",
    "C:\\temp\\report.json",
    ".git/config"
  ]) {
    assert.throws(
      () => resolveOutputPath(tempDir, outputFile),
      (error) => error instanceof Error && /output-file/.test(error.message)
    );
  }
});

test("action report path resolver accepts nested paths inside the workspace", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-action-path-"));
  const outputPath = resolveOutputPath(tempDir, "reports/agentique-validation.json");

  assert.equal(outputPath, path.join(tempDir, "reports", "agentique-validation.json"));
});

test("action writes valid nested reports inside the workspace", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-action-nested-"));
  const outputFile = "reports/report.json";

  const code = await runAction({
    "INPUT_PACKAGE-DIR": validPackageDir,
    "INPUT_SCHEMAS-DIR": schemasDir,
    "INPUT_VALIDATOR-SCRIPT": validatorScript,
    "INPUT_OUTPUT-FILE": outputFile
  }, tempDir);

  assert.equal(code, 0);
  const report = JSON.parse(await fs.readFile(path.join(tempDir, outputFile), "utf8"));
  assert.equal(report.ok, true);
});

test("action optional defaults use the documented validator script and output file", async () => {
  const defaultReport = path.join(rootDir, "agentique-validation.json");

  try {
    await fs.rm(defaultReport, { force: true });
    const code = await runAction({
      "INPUT_PACKAGE-DIR": validPackageDir,
      "INPUT_SCHEMAS-DIR": schemasDir
    }, rootDir);

    assert.equal(code, 0);
    const report = JSON.parse(await fs.readFile(defaultReport, "utf8"));
    assert.equal(report.ok, true);
  } finally {
    await fs.rm(defaultReport, { force: true });
  }
});

test("importing the action module does not run the entrypoint", async () => {
  const actionUrl = pathToFileURL(path.join(repoDir, "src", "action.mjs")).href;
  const { stdout, stderr } = await execFileAsync(process.execPath, ["--input-type=module", "--eval", `await import(${JSON.stringify(actionUrl)}); console.log("imported");`]);

  assert.equal(stdout.trim(), "imported");
  assert.equal(stderr, "");
});
