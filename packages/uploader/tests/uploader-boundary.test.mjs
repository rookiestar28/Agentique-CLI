import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { executeUploaderCli, EXIT_CODES, parseArgs } from "../src/cli-core.mjs";
import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_BOUNDARY } from "../src/index.mjs";

const execFileAsync = promisify(execFile);
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..", "..");

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
    schemasDir: null,
    apiUrl: null,
    tokens: ["upload", "plan", "pkg"]
  });

  assert.equal(parseArgs(["upload", "plan", "--token"]).error, "--token requires a value.");
  assert.equal(parseArgs(["upload", "plan", "--api-url"]).error, "--api-url requires a value.");
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

test("auth status skeleton is stable and redacted", async () => {
  const result = await executeUploaderCli(["auth", "status", "--json"]);
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

  const result = await executeUploaderCli(["auth", "status", "--token", "flag-token-value", "--json"], {
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

  const envResult = await executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_TOKEN: "env-token-value",
      AGENTIQUE_CONFIG: configPath
    }
  });
  const configResult = await executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_CONFIG: configPath
    }
  });

  assert.equal(JSON.parse(envResult.stdout).data.source, "env");
  assert.equal(JSON.parse(configResult.stdout).data.source, "config");
  assert.doesNotMatch(envResult.stdout + configResult.stdout, /env-token-value|config-token-value|config\.json/i);
});

test("auth status fails closed for invalid token and config errors", async () => {
  const invalidToken = await executeUploaderCli(["auth", "status", "--token", "short", "--json"]);
  const configError = await executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_CONFIG: path.join(os.homedir(), "missing-agentique-config.json")
    }
  });

  assert.equal(invalidToken.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(invalidToken.stdout).code, "auth.invalid_token");
  assert.equal(configError.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(configError.stdout).code, "auth.config_error");
  assert.doesNotMatch(
    invalidToken.stdout + configError.stdout + configError.stderr,
    forbiddenLocalOutputPattern(["short", "missing-agentique-config"])
  );
});

test("missing token value is a usage error", async () => {
  const result = await executeUploaderCli(["auth", "status", "--token", "--json"]);

  assert.equal(result.exitCode, EXIT_CODES.usage);
  assert.equal(JSON.parse(result.stdout).code, "cli.usage_error");
});

test("upload submit and status require auth before network access", async () => {
  let calls = 0;
  const fetchImpl = async () => {
    calls += 1;
    throw new Error("unexpected network call");
  };
  const localOperand = path.join(os.homedir(), "agentique-redaction-fixture");

  const submit = await executeUploaderCli(["upload", "submit", localOperand, "--json"], { fetchImpl });
  const status = await executeUploaderCli(["upload", "status", "sub_test_123", "--json"], { fetchImpl });
  const submitBody = JSON.parse(submit.stdout);
  const statusBody = JSON.parse(status.stdout);

  assert.equal(submit.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.exitCode, EXIT_CODES.unavailable);
  assert.equal(submitBody.code, "auth.not_configured");
  assert.equal(statusBody.code, "auth.not_configured");
  assert.equal(calls, 0);
  assert.doesNotMatch(submit.stdout + submit.stderr, forbiddenLocalOutputPattern(["agentique-redaction-fixture"]));
});

test("upload plan emits validator evidence for a valid starter", async () => {
  const result = await executeUploaderCli(
    ["upload", "plan", "starters/agent-assistant", "--schemas-dir", "schemas", "--json"],
    { cwd: repoRoot }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.plan.ready");
  assert.equal(status.data.schemaVersion, "agentique.uploader.plan.v1");
  assert.equal(status.data.reviewOnly, true);
  assert.equal(status.data.noExecution, true);
  assert.equal(status.data.package.name, "agent-assistant");
  assert.equal(status.data.evidence.inventory.length, 2);
  assert.match(status.data.evidence.inventoryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern());
});

test("upload plan fails closed for invalid packages without absolute path leakage", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-uploader-plan-invalid-"));
  const result = await executeUploaderCli(["upload", "plan", tempDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.ok, false);
  assert.equal(status.code, "upload.plan.validation_failed");
  assert.ok(status.data.evidence.findingCount > 0);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern(["uploader-plan-invalid"]));
});

test("upload submit completes a review-only session without forwarding bearer auth to storage", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    const call = { url: String(url), init };
    calls.push(call);

    if (calls.length === 1) {
      assert.equal(call.url, "https://api.agentique.test/api/cli/v1/upload-sessions");
      assert.equal(init.method, "POST");
      assert.equal(headerValue(init.headers, "authorization"), "Bearer flag-token-value");
      assert.match(init.body, /"reviewOnly":true/);
      return jsonResponse({
        sessionId: "sess_test_123",
        transfer: {
          url: "https://storage.agentique.test/upload/sess_test_123?sig=private",
          method: "PUT",
          headers: {
            "x-agentique-transfer": "session"
          }
        }
      });
    }

    if (calls.length === 2) {
      assert.equal(call.url, "https://storage.agentique.test/upload/sess_test_123?sig=private");
      assert.equal(init.method, "PUT");
      assert.equal(headerValue(init.headers, "authorization"), null);
      assert.equal(headerValue(init.headers, "x-agentique-transfer"), "session");
      return { ok: false, status: 503 };
    }

    if (calls.length === 3) {
      assert.equal(call.url, "https://storage.agentique.test/upload/sess_test_123?sig=private");
      assert.equal(headerValue(init.headers, "authorization"), null);
      return jsonResponse({ uploaded: true });
    }

    assert.equal(call.url, "https://api.agentique.test/api/cli/v1/upload-sessions/sess_test_123/complete");
    assert.equal(init.method, "POST");
    assert.equal(headerValue(init.headers, "authorization"), "Bearer flag-token-value");
    assert.match(init.body, /"payloadDigest":"sha256:[a-f0-9]{64}"/);
    return jsonResponse({
      verified: true,
      submissionId: "sub_test_123",
      status: "review_required"
    });
  };

  const result = await executeUploaderCli(
    [
      "upload",
      "submit",
      "starters/agent-assistant",
      "--schemas-dir",
      "schemas",
      "--token",
      "flag-token-value",
      "--api-url",
      "https://api.agentique.test",
      "--json"
    ],
    { cwd: repoRoot, fetchImpl }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(result.stderr, "");
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.submit.review_created");
  assert.equal(status.data.reviewOnly, true);
  assert.equal(status.data.session.id, "sess_test_123");
  assert.equal(status.data.submission.id, "sub_test_123");
  assert.equal(status.data.transfer.attempts, 2);
  assert.equal(status.data.transfer.authorizationForwarded, false);
  assert.match(status.data.transfer.payloadDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(calls.length, 4);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern(["flag-token-value", "storage.agentique.test", "sig=private"]));
});

test("upload submit fails closed when server completion is not verified", async () => {
  let calls = 0;
  const fetchImpl = async (url) => {
    calls += 1;
    if (calls === 1) {
      return jsonResponse({
        sessionId: "sess_test_456",
        transfer: {
          url: "https://storage.agentique.test/upload/sess_test_456?sig=private",
          method: "PUT"
        }
      });
    }
    if (calls === 2) {
      return jsonResponse({ uploaded: true });
    }
    assert.equal(String(url), "https://api.agentique.test/api/cli/v1/upload-sessions/sess_test_456/complete");
    return jsonResponse({
      verified: false,
      submissionId: "sub_test_456",
      status: "pending"
    });
  };

  const result = await executeUploaderCli(
    [
      "upload",
      "submit",
      "starters/agent-assistant",
      "--schemas-dir",
      "schemas",
      "--token",
      "flag-token-value",
      "--api-url",
      "https://api.agentique.test",
      "--json"
    ],
    { cwd: repoRoot, fetchImpl }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.code, "upload.submit.completion_unverified");
  assert.equal(calls, 3);
  assert.doesNotMatch(result.stdout, /flag-token-value|storage\.agentique\.test|sig=private/i);
});

test("upload submit rejects non-https api urls before network access", async () => {
  let calls = 0;
  const result = await executeUploaderCli(
    [
      "upload",
      "submit",
      "starters/agent-assistant",
      "--schemas-dir",
      "schemas",
      "--token",
      "flag-token-value",
      "--api-url",
      "http://api.agentique.test",
      "--json"
    ],
    {
      cwd: repoRoot,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("unexpected network call");
      }
    }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.code, "upload.submit.invalid_api_url");
  assert.equal(calls, 0);
  assert.doesNotMatch(result.stdout, /flag-token-value/i);
});

test("upload status reads a review-only submission with redacted auth", async () => {
  let calls = 0;
  const fetchImpl = async (url, init = {}) => {
    calls += 1;
    assert.equal(String(url), "https://api.agentique.test/api/cli/v1/upload-submissions/sub_test_123");
    assert.equal(init.method, "GET");
    assert.equal(headerValue(init.headers, "authorization"), "Bearer flag-token-value");
    return jsonResponse({
      submissionId: "sub_test_123",
      status: "review_required",
      reviewOnly: true
    });
  };

  const result = await executeUploaderCli(
    [
      "upload",
      "status",
      "sub_test_123",
      "--token",
      "flag-token-value",
      "--api-url",
      "https://api.agentique.test",
      "--json"
    ],
    { fetchImpl }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.code, "upload.status.read");
  assert.equal(status.data.submission.id, "sub_test_123");
  assert.equal(status.data.submission.status, "review_required");
  assert.equal(calls, 1);
  assert.doesNotMatch(result.stdout, /flag-token-value/i);
});

test("usage errors are deterministic", async () => {
  const missingCommand = await executeUploaderCli(["--json"]);
  const unknownCommand = await executeUploaderCli(["unknown", "--json"]);
  const unknownOption = await executeUploaderCli(["upload", "plan", "pkg", "--token", "--json"]);
  const missingSchemasDir = await executeUploaderCli(["upload", "plan", "pkg", "--schemas-dir", "--json"]);
  const missingApiUrl = await executeUploaderCli(["upload", "submit", "pkg", "--api-url", "--json"]);

  assert.equal(JSON.parse(missingCommand.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(unknownCommand.stdout).code, "cli.unknown_command");
  assert.equal(JSON.parse(unknownOption.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(missingSchemasDir.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(missingApiUrl.stdout).code, "cli.usage_error");
  assert.equal(missingCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownOption.exitCode, EXIT_CODES.usage);
  assert.equal(missingSchemasDir.exitCode, EXIT_CODES.usage);
  assert.equal(missingApiUrl.exitCode, EXIT_CODES.usage);
});

test("cli upload submit emits stable json and requires auth before live requests", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs", "upload", "submit", "pkg", "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.code, 1);
  assert.equal(result.stderr, "");
  assert.equal(status.ok, false);
  assert.equal(status.code, "auth.not_configured");
  assert.equal(status.boundary.commandName, "agentique");
});

test("cli human upload output stays explicit about auth-gated review-only behavior", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs", "upload", "submit", "pkg"]);

  assert.equal(result.code, 1);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /auth is required/i);
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

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    async json() {
      return payload;
    }
  };
}

function headerValue(headers, name) {
  const lowered = name.toLowerCase();
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowered) {
      return value;
    }
  }
  return null;
}

function forbiddenLocalOutputPattern(extraTerms = []) {
  // IMPORTANT: keep this exact-term based; CI paths contain generic words that are valid public output elsewhere.
  const terms = [
    ...pathOutputVariants(repoRoot),
    ...pathOutputVariants(os.homedir()),
    ...extraTerms
  ].filter(isMeaningfulSensitiveTerm);
  return new RegExp(terms.map(escapeRegExp).join("|"), "i");
}

function pathOutputVariants(value) {
  if (!value) {
    return [];
  }
  const resolved = path.resolve(value);
  const slashVariant = resolved.replaceAll("\\", "/");
  const backslashVariant = resolved.replaceAll("/", "\\");
  const jsonEscapedBackslashVariant = backslashVariant.replaceAll("\\", "\\\\");

  return [...new Set([resolved, slashVariant, backslashVariant, jsonEscapedBackslashVariant])];
}

function isMeaningfulSensitiveTerm(value) {
  return typeof value === "string" && value.length >= 4;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
