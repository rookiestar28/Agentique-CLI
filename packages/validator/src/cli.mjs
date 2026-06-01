#!/usr/bin/env node
import { scanExternalIntake } from "./intake/scanner.mjs";
import { defaultSchemasDir, validatePackage } from "./validator.mjs";

const usage = `Usage:
  agentique-validator validate <package-dir> [--schemas-dir <dir>] [--json]
  agentique-validator upload-prep <package-dir> [--schemas-dir <dir>] [--json]
  agentique-validator external-intake <repo-or-dir> [--json] [--max-files <n>] [--max-bytes <n>]
`;

async function main(argv) {
  const [command, packageDir, ...rest] = argv;
  if (!["validate", "upload-prep", "external-intake"].includes(command) || !packageDir) {
    process.stderr.write(usage);
    return 2;
  }

  let json = false;
  let schemasDir = null;
  let maxFiles = null;
  let maxBytes = null;
  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--schemas-dir") {
      schemasDir = rest[index + 1];
      index += 1;
    } else if (arg === "--max-files" && command === "external-intake") {
      const parsed = parsePositiveIntegerFlag(arg, rest[index + 1]);
      if (parsed.error) {
        process.stderr.write(`${parsed.error}\n${usage}`);
        return 2;
      }
      maxFiles = parsed.value;
      index += 1;
    } else if (arg === "--max-bytes" && command === "external-intake") {
      const parsed = parsePositiveIntegerFlag(arg, rest[index + 1]);
      if (parsed.error) {
        process.stderr.write(`${parsed.error}\n${usage}`);
        return 2;
      }
      maxBytes = parsed.value;
      index += 1;
    } else {
      process.stderr.write(`Unknown argument: ${arg}\n${usage}`);
      return 2;
    }
  }

  try {
    if (command === "external-intake") {
      const report = await scanExternalIntake({
        command,
        sourceDir: packageDir,
        maxFiles: maxFiles ?? undefined,
        maxBytes: maxBytes ?? undefined
      });

      if (json) {
        process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
      } else {
        process.stdout.write(`${report.decision === "passed" ? "OK" : "FAILED"} ${report.command} ${report.source.label}\n`);
        process.stdout.write(`- files: ${report.summary.files}\n`);
        process.stdout.write(`- bytes: ${report.summary.bytes}\n`);
        process.stdout.write(`- findings: ${report.summary.findings}\n`);
        for (const item of report.findings) {
          process.stdout.write(`- ${item.code} at ${item.path}: ${item.message}\n`);
        }
      }
      return report.decision === "passed" ? 0 : 1;
    }

    const report = await validatePackage({
      command,
      packageDir,
      schemasDir: schemasDir ?? (await defaultSchemasDir()),
    });

    if (json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(`${report.ok ? "OK" : "FAILED"} ${report.command} ${report.packageDir}\n`);
      for (const item of report.findings) {
        process.stdout.write(`- ${item.code} at ${item.location}: ${item.message}\n`);
      }
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    if (json) {
      process.stdout.write(`${JSON.stringify({ ok: false, command, packageDir: "unavailable", findings: [{ code: "cli-error", message, location: "cli" }] }, null, 2)}\n`);
    } else {
      process.stderr.write(`CLI error: ${message}\n`);
    }
    return 2;
  }
}

function parsePositiveIntegerFlag(name, value) {
  if (!/^[1-9]\d*$/.test(value ?? "")) {
    return { error: `${name} requires a positive integer value.` };
  }

  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed)) {
    return { error: `${name} requires a safe integer value.` };
  }

  return { value: parsed };
}

main(process.argv.slice(2)).then((code) => {
  process.exitCode = code;
});
