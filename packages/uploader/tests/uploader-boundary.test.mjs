import assert from "node:assert/strict";
import { execFile } from "node:child_process";
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
    tokens: ["upload", "plan", "pkg"]
  });

  assert.equal(parseArgs(["upload", "plan", "--token"]).error, "Unknown option: --token");
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
  assert.equal(status.code, "auth.not_enabled");
  assert.equal(status.data.configured, false);
  assert.equal(status.data.redacted, true);
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
