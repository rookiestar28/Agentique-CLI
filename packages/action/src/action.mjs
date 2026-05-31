#!/usr/bin/env node
import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const defaultInputs = {
  "validator-script": "packages/validator/src/cli.mjs",
  "output-file": "agentique-validation.json"
};

export async function runAction(env = process.env, cwd = process.cwd()) {
  const packageDir = readInput(env, "package-dir", true);
  const schemasDir = readInput(env, "schemas-dir", true);
  const validatorScript = readInput(env, "validator-script", false) || defaultInputs["validator-script"];
  const outputFile = validateOutputFileInput(readInput(env, "output-file", false) || defaultInputs["output-file"]);

  const outputPath = resolveOutputPath(cwd, outputFile);
  const result = await runValidator({
    cwd,
    validatorScript,
    packageDir,
    schemasDir
  });

  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, result.stdout, "utf8");

  if (env.GITHUB_OUTPUT) {
    await fs.appendFile(env.GITHUB_OUTPUT, `report=${outputFile}\n`, "utf8");
  }

  if (result.code !== 0) {
    process.stdout.write(result.stdout);
    process.stderr.write(result.stderr);
    return result.code === 1 ? 1 : 2;
  }

  process.stdout.write("Agentique local validation completed. This is not platform approval or safety certification.\n");
  return 0;
}

export function buildValidatorArgs({ validatorScript, packageDir, schemasDir }) {
  return [validatorScript, "validate", packageDir, "--schemas-dir", schemasDir, "--json"];
}

export function validateOutputFileInput(outputFile) {
  // Guard before writing GitHub outputs; control characters can create extra output keys.
  if (/[\u0000-\u001f\u007f]/u.test(outputFile)) {
    throw new Error("output-file must not contain control characters");
  }

  return outputFile;
}

export function resolveOutputPath(cwd, outputFile) {
  const safeOutputFile = validateOutputFileInput(outputFile);
  const portablePath = safeOutputFile.replace(/\\/g, "/");
  const segments = portablePath.split("/").filter(Boolean);

  if (
    path.isAbsolute(safeOutputFile) ||
    path.posix.isAbsolute(portablePath) ||
    path.win32.isAbsolute(safeOutputFile) ||
    segments.includes("..") ||
    segments[0] === ".git"
  ) {
    throw new Error("output-file must be a safe relative path inside the workspace");
  }

  const outputPath = path.resolve(cwd, safeOutputFile);
  const relativePath = path.relative(cwd, outputPath);
  if (relativePath === "" || relativePath.startsWith("..") || path.isAbsolute(relativePath)) {
    throw new Error("output-file must resolve inside the workspace");
  }

  return outputPath;
}

function runValidator({ cwd, validatorScript, packageDir, schemasDir }) {
  const args = buildValidatorArgs({ validatorScript, packageDir, schemasDir });
  return new Promise((resolve) => {
    const child = spawn(process.execPath, args, {
      cwd,
      shell: false,
      windowsHide: true
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk.toString();
    });
    child.on("close", (code) => {
      resolve({ code: code ?? 2, stdout, stderr });
    });
  });
}

function readInput(env, name, required) {
  const key = `INPUT_${name.toUpperCase()}`;
  const value = env[key]?.trim();
  if (required && !value) {
    throw new Error(`Missing required input: ${name}`);
  }
  return value;
}

const isEntrypoint = process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url);
if (isEntrypoint) {
  runAction().then((code) => {
    process.exitCode = code;
  }).catch((error) => {
    process.stderr.write(`${error instanceof Error ? error.message : "Action failed"}\n`);
    process.exitCode = 2;
  });
}
