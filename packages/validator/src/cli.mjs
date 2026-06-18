#!/usr/bin/env node
import { scanExternalIntake } from "./intake/scanner.mjs";
import { fileURLToPath } from "node:url";
import {
  collectDeferredRiskLedger,
  evaluatePortableProfile,
  formatPortabilityHuman,
  generatePortableAdapter,
  validatePortableDrift,
  validatePortableParity
} from "./portability.mjs";
import { defaultSchemasDir, validatePackage } from "./validator.mjs";

const usage = `Usage:
  agentique-validator validate <package-dir> [--schemas-dir <dir>] [--json]
  agentique-validator upload-prep <package-dir> [--schemas-dir <dir>] [--json]
  agentique-validator external-intake <repo-or-dir> [--json] [--max-files <n>] [--max-bytes <n>]
  agentique-validator portable-generate <portable-profile.json> --target <target> --output <dir> [--schemas-dir <dir>] [--json]
  agentique-validator portable-drift <portable-profile.json> --manifest <generated-adapter-manifest.json> --output-dir <dir> [--schemas-dir <dir>] [--json]
  agentique-validator portable-parity <portable-profile.json> --manifest <generated-adapter-manifest.json> --output-dir <dir> [--schemas-dir <dir>] [--json]
  agentique-validator debt-ledger <root-dir> [--json]
  agentique-validator portable-eval <portable-profile.json> --output-dir <dir> --sandbox no-exec-temp [--schemas-dir <dir>] [--json]
`;

const portabilityCommands = new Set([
  "portable-generate",
  "portable-drift",
  "portable-parity",
  "debt-ledger",
  "portable-eval"
]);

async function main(argv) {
  const [command, packageDir, ...rest] = argv;
  if (portabilityCommands.has(command)) {
    return runPortabilityCommand(command, packageDir, rest);
  }

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

async function runPortabilityCommand(command, subject, rest) {
  if (!subject) {
    process.stderr.write(usage);
    return 2;
  }

  const flags = parsePortabilityFlags(rest);
  if (flags.error) {
    process.stderr.write(`${flags.error}\n${usage}`);
    return 2;
  }

  const schemasDir = flags.values.schemasDir ?? defaultSourceSchemasDir();
  const json = flags.values.json === true;

  try {
    let report;
    if (command === "portable-generate") {
      if (!flags.values.output) {
        process.stderr.write(`portable-generate requires --output <dir>.\n${usage}`);
        return 2;
      }
      if (!flags.values.target) {
        process.stderr.write(`portable-generate requires --target <target>.\n${usage}`);
        return 2;
      }
      report = await generatePortableAdapter({
        sourcePath: subject,
        targetId: flags.values.target,
        outputDir: flags.values.output,
        schemasDir
      });
    } else if (command === "portable-drift") {
      if (!flags.values.manifest || !flags.values.outputDir) {
        process.stderr.write(`portable-drift requires --manifest <file> and --output-dir <dir>.\n${usage}`);
        return 2;
      }
      report = await validatePortableDrift({
        sourcePath: subject,
        manifestPath: flags.values.manifest,
        outputDir: flags.values.outputDir,
        schemasDir
      });
    } else if (command === "portable-parity") {
      if (!flags.values.manifest || !flags.values.outputDir) {
        process.stderr.write(`portable-parity requires --manifest <file> and --output-dir <dir>.\n${usage}`);
        return 2;
      }
      report = await validatePortableParity({
        sourcePath: subject,
        manifestPath: flags.values.manifest,
        outputDir: flags.values.outputDir,
        schemasDir
      });
    } else if (command === "debt-ledger") {
      report = await collectDeferredRiskLedger({ rootDir: subject });
    } else if (command === "portable-eval") {
      if (!flags.values.outputDir) {
        process.stderr.write(`portable-eval requires --output-dir <dir>.\n${usage}`);
        return 2;
      }
      report = await evaluatePortableProfile({
        sourcePath: subject,
        outputDir: flags.values.outputDir,
        sandbox: flags.values.sandbox,
        schemasDir,
        env: process.env
      });
    } else {
      process.stderr.write(usage);
      return 2;
    }

    if (json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stdout.write(formatPortabilityHuman(report));
    }
    return report.ok ? 0 : 1;
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    const report = {
      ok: false,
      command,
      findings: [{ code: "cli-error", message, location: "cli" }]
    };
    if (json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      process.stderr.write(`CLI error: ${message}\n`);
    }
    return 2;
  }
}

function parsePortabilityFlags(args) {
  const values = {
    json: false,
    manifest: null,
    output: null,
    outputDir: null,
    sandbox: null,
    schemasDir: null,
    target: null
  };

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === "--json") {
      values.json = true;
    } else if (arg === "--manifest") {
      values.manifest = args[index + 1];
      index += 1;
    } else if (arg === "--output") {
      values.output = args[index + 1];
      index += 1;
    } else if (arg === "--output-dir") {
      values.outputDir = args[index + 1];
      index += 1;
    } else if (arg === "--sandbox") {
      values.sandbox = args[index + 1];
      index += 1;
    } else if (arg === "--schemas-dir") {
      values.schemasDir = args[index + 1];
      index += 1;
    } else if (arg === "--target") {
      values.target = args[index + 1];
      index += 1;
    } else {
      return { error: `Unknown argument: ${arg}` };
    }

    if (args[index] === undefined && arg !== "--json") {
      return { error: `${arg} requires a value.` };
    }
  }

  return { values };
}

function defaultSourceSchemasDir() {
  return fileURLToPath(new URL("../../../schemas/", import.meta.url));
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
