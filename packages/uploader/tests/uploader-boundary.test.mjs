import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { promisify } from "node:util";
import { test } from "node:test";
import { executeUploaderCli, EXIT_CODES, parseArgs } from "../src/cli-core.mjs";
import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_BOUNDARY } from "../src/index.mjs";

const execFileAsync = promisify(execFile);

test("declares the uploader as the only review-only mutation package boundary", () => {
  assert.equal(UPLOADER_PACKAGE_BOUNDARY.packageName, "@agentique.io/uploader");
  assert.equal(UPLOADER_PACKAGE_BOUNDARY.commandName, "agentique");
  assert.equal(UPLOADER_PACKAGE_BOUNDARY.submissionMode, "review-only");
  assert.equal(UPLOADER_PACKAGE_BOUNDARY.mutatingPackage, true);
  assert.equal(UPLOADER_PACKAGE_BOUNDARY.liveUploadAvailable, false);
});

test("boundary status is fail-closed and omits forbidden claims", () => {
  const status = createUploaderBoundaryStatus();
  const serialized = JSON.stringify(status).toLowerCase();

  assert.equal(status.ok, false);
  assert.equal(status.code, "uploader.boundary_only");
  assert.equal(status.boundary.liveUploadAvailable, false);
  for (const claim of UPLOADER_PACKAGE_BOUNDARY.forbiddenClaims) {
    assert.doesNotMatch(serialized, new RegExp(`\\b${claim}\\b`, "i"));
  }
});

test("parser handles global flags and rejects unknown options", () => {
  assert.deepEqual(parseArgs(["upload", "plan", "pkg", "--json"]), {
    json: true,
    help: false,
    version: false,
    token: null,
    tokens: ["upload", "plan", "pkg"]
  });

  assert.equal(parseArgs(["upload", "plan", "--token"]).error, "--token requires a value.");
  assert.equal(parseArgs(["upload", "plan", "--unknown"]).error, "Unknown option: --unknown");
});

test("cli returns help and version without treating them as errors", async () => {
  const help = await execFileAsync(process.execPath, ["src/cli.mjs", "--help"], {
    cwd: new URL("..", import.meta.url)
  });
  const version = await execFileAsync(process.execPath, ["src/cli.mjs", "--version"], {
    cwd: new URL("..", import.meta.url)
  });

  assert.match(help.stdout, /agentique upload submit/);
  assert.equal(help.stderr, "");
  assert.equal(version.stdout, `${UPLOADER_PACKAGE_BOUNDARY.version}\n`);
  assert.equal(version.stderr, "");
});

test("auth status skeleton is stable and redacted", () => {
  const result = executeUploaderCli(["auth", "status", "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(result.stderr, "");
  assert.equal(status.ok, false);
  assert.equal(status.code, "auth.not_configured");
  assert.equal(status.data.configured, false);
  assert.equal(status.data.redacted, true);
});

test("auth status honors token precedence without leaking tokens or config paths", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-uploader-auth-"));
  const configPath = path.join(tempDir, "config.json");
  await writeFile(configPath, JSON.stringify({ token: "config-token-value" }), "utf8");

  const result = executeUploaderCli(["auth", "status", "--token", "flag-token-value", "--json"], {
    env: {
      AGENTIQUE_TOKEN: "env-token-value",
      AGENTIQUE_CONFIG: configPath
    }
  });
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "auth.configured");
  assert.equal(status.data.source, "flag");
  assert.match(status.data.tokenFingerprint, /^sha256:[a-f0-9]{12}$/);
  assert.doesNotMatch(result.stdout, /flag-token-value|env-token-value|config-token-value|config\.json/i);
});

test("auth status falls back from env to config", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-uploader-config-"));
  const configPath = path.join(tempDir, "config.json");
  await writeFile(configPath, JSON.stringify({ auth: { token: "config-token-value" } }), "utf8");

  const envResult = executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_TOKEN: "env-token-value",
      AGENTIQUE_CONFIG: configPath
    }
  });
  const configResult = executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_CONFIG: configPath
    }
  });

  assert.equal(JSON.parse(envResult.stdout).data.source, "env");
  assert.equal(JSON.parse(configResult.stdout).data.source, "config");
  assert.doesNotMatch(envResult.stdout + configResult.stdout, /env-token-value|config-token-value|config\.json/i);
});

test("auth status fails closed for invalid token and config errors", () => {
  const invalidToken = executeUploaderCli(["auth", "status", "--token", "short", "--json"]);
  const configError = executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_CONFIG: "C:\\Users\\Ray\\missing-agentique-config.json"
    }
  });

  assert.equal(invalidToken.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(invalidToken.stdout).code, "auth.invalid_token");
  assert.equal(configError.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(configError.stdout).code, "auth.config_error");
  assert.doesNotMatch(invalidToken.stdout + configError.stdout + configError.stderr, /short|missing-agentique-config|Users|Ray/i);
});

test("missing token value is a usage error", () => {
  const result = executeUploaderCli(["auth", "status", "--token", "--json"]);

  assert.equal(result.exitCode, EXIT_CODES.usage);
  assert.equal(JSON.parse(result.stdout).code, "cli.usage_error");
});

test("upload command skeletons fail closed without echoing operands", () => {
  for (const command of ["plan", "submit", "status"]) {
    const result = executeUploaderCli(["upload", command, "C:\\Users\\Ray\\private-package", "--json"]);
    const status = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_CODES.unavailable);
    assert.equal(result.stderr, "");
    assert.equal(status.ok, false);
    assert.equal(status.command, `upload ${command}`);
    assert.equal(status.data.operandAccepted, true);
    assert.doesNotMatch(result.stdout, /Users|private-package|Ray/i);
  }
});

test("usage errors are deterministic", () => {
  const missingCommand = executeUploaderCli(["--json"]);
  const unknownCommand = executeUploaderCli(["unknown", "--json"]);
  const unknownOption = executeUploaderCli(["upload", "plan", "pkg", "--token", "--json"]);

  assert.equal(JSON.parse(missingCommand.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(unknownCommand.stdout).code, "cli.unknown_command");
  assert.equal(JSON.parse(unknownOption.stdout).code, "cli.usage_error");
  assert.equal(missingCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownOption.exitCode, EXIT_CODES.usage);
});

test("cli upload submit emits stable json on request", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs", "upload", "submit", "pkg", "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  assert.equal(status.ok, false);
  assert.equal(status.code, "upload.submit.not_enabled");
  assert.equal(status.boundary.commandName, "agentique");
});

test("cli human upload output stays explicit about disabled live behavior", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs", "upload", "submit", "pkg"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /not enabled in this release/i);
});

async function execFileExpectFailure(command, args) {
  try {
    const result = await execFileAsync(command, args, { cwd: new URL("..", import.meta.url) });
    return { code: 0, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      code: error.code,
      stdout: error.stdout ?? "",
      stderr: error.stderr ?? ""
    };
  }
}
