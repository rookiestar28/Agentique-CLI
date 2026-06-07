import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import { test } from "node:test";
import { executeUploaderCli, EXIT_CODES, parseArgs } from "../src/cli-core.mjs";
import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_BOUNDARY } from "../src/index.mjs";
import { REQUIRED_CREATOR_CHECKPOINTS, evaluateUploadCheckpointEvidence } from "../src/plan.mjs";

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
    draftKind: null,
    q: null,
    type: null,
    status: null,
    limit: null,
    cursor: null,
    outputPath: null,
    force: false,
    maxBytes: null,
    allowedRedirectOrigins: [],
    tokens: ["upload", "plan", "pkg"]
  });

  assert.deepEqual(
    parseArgs([
      "catalog",
      "list",
      "--q",
      "assistant",
      "--type",
      "skill",
      "--status",
      "published",
      "--limit",
      "25",
      "--cursor",
      "next-page",
      "--api-url",
      "https://agentique.example",
      "--json"
    ]),
    {
      json: true,
      help: false,
      version: false,
      token: null,
      schemasDir: null,
      apiUrl: "https://agentique.example",
      draftKind: null,
      q: "assistant",
      type: "skill",
      status: "published",
      limit: "25",
      cursor: "next-page",
      outputPath: null,
      force: false,
      maxBytes: null,
      allowedRedirectOrigins: [],
      tokens: ["catalog", "list"]
    }
  );

  assert.equal(parseArgs(["upload", "plan", "--token"]).error, "--token requires a value.");
  assert.equal(parseArgs(["upload", "plan", "--api-url"]).error, "--api-url requires a value.");
  assert.equal(parseArgs(["upload", "draft", "pkg", "--draft-kind"]).error, "--draft-kind requires a value.");
  assert.equal(parseArgs(["upload", "draft", "pkg", "--draft-kind", "page"]).error, "--draft-kind must be card or manifest.");
  assert.equal(parseArgs(["catalog", "list", "--q"]).error, "--q requires a value.");
  assert.equal(parseArgs(["catalog", "list", "--type"]).error, "--type requires a value.");
  assert.equal(parseArgs(["catalog", "list", "--status"]).error, "--status requires a value.");
  assert.equal(parseArgs(["catalog", "list", "--limit"]).error, "--limit requires a value.");
  assert.equal(parseArgs(["catalog", "list", "--cursor"]).error, "--cursor requires a value.");
  assert.equal(parseArgs(["download", "agent-1", "--output"]).error, "--output requires a value.");
  assert.equal(parseArgs(["download", "agent-1", "--max-bytes"]).error, "--max-bytes requires a value.");
  assert.equal(
    parseArgs(["download", "agent-1", "--allow-redirect-origin"]).error,
    "--allow-redirect-origin requires a value."
  );
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
  assert.match(help.stdout, /agentique upload import-plan/);
  assert.match(help.stdout, /agentique upload variant-plan/);
  assert.match(help.stdout, /agentique catalog list/);
  assert.match(help.stdout, /agentique catalog get/);
  assert.match(help.stdout, /agentique catalog download-metadata/);
  assert.match(help.stdout, /agentique download <resource-id> --output/);
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
  const wrongSurfaceToken = await executeUploaderCli(
    ["auth", "status", "--token", "session=browser_state_value;csrf=csrf_state_value", "--json"]
  );
  const configError = await executeUploaderCli(["auth", "status", "--json"], {
    env: {
      AGENTIQUE_CONFIG: path.join(os.homedir(), "missing-agentique-config.json")
    }
  });

  assert.equal(invalidToken.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(invalidToken.stdout).code, "auth.invalid_token");
  assert.equal(wrongSurfaceToken.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(wrongSurfaceToken.stdout).code, "auth.wrong_surface_credential");
  assert.equal(configError.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(configError.stdout).code, "auth.config_error");
  assert.doesNotMatch(
    invalidToken.stdout + wrongSurfaceToken.stdout + configError.stdout + configError.stderr,
    forbiddenLocalOutputPattern(["short", "browser_state_value", "csrf_state_value", "missing-agentique-config"])
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

test("catalog list reads public resources without uploader auth or secret forwarding", async () => {
  const calls = [];
  const result = await executeUploaderCli(
    [
      "catalog",
      "list",
      "--q",
      "assistant",
      "--type",
      "skill",
      "--status",
      "published",
      "--limit",
      "25",
      "--cursor",
      "next-page",
      "--api-url",
      "https://agentique.example/base",
      "--token",
      "flag-token-value",
      "--json"
    ],
    {
      fetchImpl: async (url, init = {}) => {
        calls.push({ url: String(url), init });
        assert.equal(init.method, "GET");
        assert.equal(headerValue(init.headers, "accept"), "application/json");
        assert.equal(headerValue(init.headers, "authorization"), null);
        assert.equal(headerValue(init.headers, "cookie"), null);
        return jsonResponse({
          data: [
            {
              id: "agent-1",
              slug: "agent-one",
              name: "Agent One",
              description: "Visible public summary.",
              resourceType: "skill",
              state: "published",
              download: { availability: "source-only" },
              privateReviewNotes: "hidden"
            }
          ],
          pageInfo: {
            nextCursor: "cursor-2",
            hasNextPage: true
          }
        });
      }
    }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.code, "catalog.list.read");
  assert.equal(status.data.items[0].resourceId, "agent-1");
  assert.equal(status.data.items[0].title, "Agent One");
  assert.equal(status.data.items[0].downloadAvailability, "source-only");
  assert.equal(status.data.pageInfo.nextCursor, "cursor-2");
  assert.equal(
    calls[0].url,
    "https://agentique.example/base/api/public/v1/resources?q=assistant&type=skill&cursor=next-page&limit=25&status=published"
  );
  assert.doesNotMatch(result.stdout, /flag-token-value|hidden/i);
});

test("catalog get and download-metadata return stable public readback envelopes", async () => {
  const calls = [];
  const fetchImpl = async (url, init = {}) => {
    calls.push({ url: String(url), init });
    assert.equal(init.method, "GET");
    assert.equal(headerValue(init.headers, "authorization"), null);

    if (String(url).endsWith("/download")) {
      return jsonResponse({
        availability: "available",
        data: {
          resourceId: "agent-1",
          method: "POST",
          downloadEndpoint: "/api/agents/agent-1/download?ignored=true",
          files: [
            {
              filename: "agent-1.zip",
              mediaType: "application/zip",
              sizeBytes: 42,
              digest: `sha256:${"a".repeat(64)}`,
              objectPath: "hidden"
            }
          ]
        }
      });
    }

    return jsonResponse({
      data: {
        resourceId: "agent-1",
        title: "Agent One",
        state: "published",
        storageKey: "hidden"
      }
    });
  };

  const resource = await executeUploaderCli(["catalog", "get", "agent 1", "--api-url", "https://agentique.example", "--json"], {
    fetchImpl
  });
  const metadata = await executeUploaderCli(
    ["catalog", "download-metadata", "agent 1", "--api-url", "https://agentique.example", "--json"],
    { fetchImpl }
  );
  const resourceStatus = JSON.parse(resource.stdout);
  const metadataStatus = JSON.parse(metadata.stdout);

  assert.equal(resource.exitCode, EXIT_CODES.success);
  assert.equal(resourceStatus.code, "catalog.get.read");
  assert.equal(resourceStatus.data.resourceId, "agent-1");
  assert.equal(metadata.exitCode, EXIT_CODES.success);
  assert.equal(metadataStatus.code, "catalog.download_metadata.read");
  assert.equal(metadataStatus.data.availability, "available");
  assert.equal(metadataStatus.data.downloadKind, "ticket");
  assert.equal(metadataStatus.data.method, "POST");
  assert.equal(metadataStatus.data.ticketEndpoint, "/api/agents/agent-1/download");
  assert.equal(metadataStatus.data.filename, "agent-1.zip");
  assert.equal(metadataStatus.data.digest.value, "a".repeat(64));
  assert.deepEqual(
    calls.map((call) => call.url),
    [
      "https://agentique.example/api/public/v1/resources/agent%201",
      "https://agentique.example/api/public/v1/resources/agent%201/download"
    ]
  );
  assert.doesNotMatch(resource.stdout + metadata.stdout, /storageKey|objectPath|hidden/i);
});

test("catalog human output is stable and concise", async () => {
  const list = await executeUploaderCli(["catalog", "list", "--api-url", "https://agentique.example"], {
    fetchImpl: async () =>
      jsonResponse({
        items: [{ id: "agent-1", title: "Agent One" }],
        pageInfo: { nextCursor: "cursor-2", hasNextPage: true }
      })
  });
  const metadata = await executeUploaderCli(["catalog", "download-metadata", "agent-1", "--api-url", "https://agentique.example"], {
    fetchImpl: async () =>
      jsonResponse({
        resourceId: "agent-1",
        download: {
          availability: "source-only",
          filename: "agent-1.zip",
          url: "https://downloads.agentique.example/agent-1.zip?sig=metadata"
        }
      })
  });

  assert.equal(list.exitCode, EXIT_CODES.success);
  assert.equal(list.stderr, "");
  assert.match(list.stdout, /^Catalog list read 1 resource\. Next cursor: cursor-2\.\n$/);
  assert.equal(metadata.exitCode, EXIT_CODES.success);
  assert.equal(metadata.stderr, "");
  assert.match(metadata.stdout, /^Catalog download metadata read\. Availability: source-only\. Kind: unavailable\. Filename: agent-1\.zip\.\n$/);
  assert.doesNotMatch(list.stdout + metadata.stdout, /https:\/\/downloads|sig=metadata/i);
});

test("catalog commands fail closed with typed redacted errors", async () => {
  let invalidLimitCalls = 0;
  const invalidLimit = await executeUploaderCli(["catalog", "list", "--limit", "0", "--api-url", "https://agentique.example", "--json"], {
    fetchImpl: async () => {
      invalidLimitCalls += 1;
      throw new Error("unexpected network call");
    }
  });
  const unsafeBaseUrl = await executeUploaderCli(["catalog", "list", "--api-url", "http://agentique.example", "--json"], {
    fetchImpl: async () => {
      throw new Error("unexpected network call");
    }
  });
  const missing = await executeUploaderCli(["catalog", "get", "missing-agent", "--api-url", "https://agentique.example", "--json"], {
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 404 })
  });
  const unavailable = await executeUploaderCli(["catalog", "download-metadata", "agent-1", "--api-url", "https://agentique.example", "--json"], {
    fetchImpl: async () => jsonResponse({}, { ok: false, status: 503 })
  });

  assert.equal(invalidLimit.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(invalidLimit.stdout).code, "catalog.list.invalid-list-limit");
  assert.equal(invalidLimitCalls, 0);
  assert.equal(unsafeBaseUrl.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(unsafeBaseUrl.stdout).code, "catalog.list.unsafe-base-url");
  assert.equal(missing.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(missing.stdout).code, "catalog.get.not-found");
  assert.equal(unavailable.exitCode, EXIT_CODES.unavailable);
  assert.equal(JSON.parse(unavailable.stdout).code, "catalog.download-metadata.unavailable");
  assert.doesNotMatch(
    invalidLimit.stdout + unsafeBaseUrl.stdout + missing.stdout + unavailable.stdout,
    /http:\/\/agentique\.example|flag-token-value|sig=|private|hidden/i
  );
});

test("download writes artifact bytes without uploader auth or signed-url output", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-cli-download-"));
  try {
    const body = "artifact";
    const digest = createHash("sha256").update(body).digest("hex");
    const calls = [];
    const result = await executeUploaderCli(
      [
        "download",
        "agent-1",
        "--output",
        tempDir + path.sep,
        "--api-url",
        "https://agentique.example",
        "--token",
        "flag-token-value",
        "--json"
      ],
      {
        fetchImpl: async (url, init = {}) => {
          calls.push({ url: String(url), init });
          if (String(url).endsWith("/download")) {
            assert.equal(init.method, "GET");
            assert.equal(headerValue(init.headers, "accept"), "application/json");
            assert.equal(headerValue(init.headers, "authorization"), null);
            assert.equal(headerValue(init.headers, "cookie"), null);
            return jsonResponse({
              resourceId: "agent-1",
              download: {
                availability: "available",
                url: "https://storage.agentique.example/files/agent-1.txt",
                filename: "agent-1.txt",
                mediaType: "text/plain",
                sizeBytes: Buffer.byteLength(body),
                digest: `sha256:${digest}`
              }
            });
          }

          assert.equal(String(url), "https://storage.agentique.example/files/agent-1.txt");
          assert.equal(init.method, "GET");
          assert.equal(init.redirect, "manual");
          assert.equal(Object.hasOwn(init, "headers"), false);
          return new Response(body, {
            status: 200,
            headers: { "content-length": String(Buffer.byteLength(body)) }
          });
        }
      }
    );
    const status = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_CODES.success);
    assert.equal(status.code, "download.completed");
    assert.equal(status.data.resourceId, "agent-1");
    assert.equal(status.data.filename, "agent-1.txt");
    assert.equal(status.data.bytesWritten, Buffer.byteLength(body));
    assert.equal(status.data.digest.value, digest);
    assert.equal(status.data.outputWritten, true);
    assert.equal(await readFile(path.join(tempDir, "agent-1.txt"), "utf8"), body);
    assert.equal(calls.length, 2);
    assert.doesNotMatch(
      result.stdout + result.stderr,
        forbiddenLocalOutputPattern(["flag-token-value", "storage.agentique.example", tempDir])
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("download supports public ticket flow without auth forwarding or signed-url output", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-cli-ticket-download-"));
  try {
    const body = "ticket artifact";
    const digest = createHash("sha256").update(body).digest("hex");
    const calls = [];
    const result = await executeUploaderCli(
      [
        "download",
        "agent-ticket",
        "--output",
        tempDir + path.sep,
        "--api-url",
        "https://agentique.example",
        "--token",
        "flag-token-value",
        "--json"
      ],
      {
        fetchImpl: async (url, init = {}) => {
          calls.push({ url: String(url), init });
          if (String(url).endsWith("/api/public/v1/resources/agent-ticket/download")) {
            assert.equal(init.method, "GET");
            assert.equal(headerValue(init.headers, "authorization"), null);
            assert.equal(headerValue(init.headers, "cookie"), null);
            return jsonResponse({
              availability: "available",
              data: {
                resourceId: "agent-ticket",
                method: "POST",
                downloadEndpoint: "/api/agents/agent-ticket/download",
                files: [
                  {
                    filename: "agent-ticket.txt",
                    mediaType: "text/plain",
                    sizeBytes: Buffer.byteLength(body),
                    digest: `sha256:${digest}`
                  }
                ]
              }
            });
          }
          if (String(url) === "https://agentique.example/api/agents/agent-ticket/download") {
            assert.equal(init.method, "POST");
            assert.equal(init.redirect, "manual");
            assert.equal(headerValue(init.headers, "accept"), "application/json");
            assert.equal(headerValue(init.headers, "authorization"), null);
            assert.equal(headerValue(init.headers, "cookie"), null);
            return jsonResponse({
              data: {
                transfer: {
                  url: "https://storage.agentique.example/files/agent-ticket.txt?sig=private"
                }
              }
            });
          }

          assert.equal(String(url), "https://storage.agentique.example/files/agent-ticket.txt?sig=private");
          assert.equal(init.method, "GET");
          assert.equal(init.redirect, "manual");
          assert.equal(Object.hasOwn(init, "headers"), false);
          return new Response(body, {
            status: 200,
            headers: { "content-length": String(Buffer.byteLength(body)) }
          });
        }
      }
    );
    const status = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_CODES.success);
    assert.equal(status.code, "download.completed");
    assert.equal(status.data.resourceId, "agent-ticket");
    assert.equal(status.data.filename, "agent-ticket.txt");
    assert.equal(status.data.bytesWritten, Buffer.byteLength(body));
    assert.equal(status.data.digest.value, digest);
    assert.equal(status.data.outputWritten, true);
    assert.equal(await readFile(path.join(tempDir, "agent-ticket.txt"), "utf8"), body);
    assert.equal(calls.length, 3);
    assert.doesNotMatch(
      result.stdout + result.stderr,
      forbiddenLocalOutputPattern(["flag-token-value", "storage.agentique.example", "sig=private", tempDir])
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("download supports force, max bytes, and explicit redirect allowlists", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-cli-download-redirect-"));
  try {
    const outputPath = path.join(tempDir, "redirect.txt");
    await writeFile(outputPath, "old", "utf8");
    const body = "new";
    const digest = createHash("sha256").update(body).digest("hex");
    const calls = [];
    const result = await executeUploaderCli(
      [
        "download",
        "agent-redirect",
        "--output",
        outputPath,
        "--force",
        "--max-bytes",
        "3",
        "--allow-redirect-origin",
        "https://cdn.agentique.example/downloads",
        "--api-url",
        "https://agentique.example",
        "--json"
      ],
      {
        fetchImpl: async (url, init = {}) => {
          calls.push({ url: String(url), init });
          if (String(url).endsWith("/download")) {
            return jsonResponse({
              resourceId: "agent-redirect",
              download: {
                availability: "available",
                url: "https://agentique.example/files/redirect.txt",
                filename: "redirect.txt",
                sizeBytes: Buffer.byteLength(body),
                digest: `sha256:${digest}`
              }
            });
          }
          if (String(url) === "https://agentique.example/files/redirect.txt") {
            assert.equal(init.redirect, "manual");
            return new Response(null, {
              status: 302,
              headers: { location: "https://cdn.agentique.example/redirect.txt?sig=private" }
            });
          }
          assert.equal(String(url), "https://cdn.agentique.example/redirect.txt?sig=private");
          assert.equal(Object.hasOwn(init, "headers"), false);
          return new Response(body, {
            status: 200,
            headers: { "content-length": String(Buffer.byteLength(body)) }
          });
        }
      }
    );
    const status = JSON.parse(result.stdout);

    assert.equal(result.exitCode, EXIT_CODES.success);
    assert.equal(status.data.filename, "redirect.txt");
    assert.equal(await readFile(outputPath, "utf8"), body);
    assert.equal(calls.length, 3);
    assert.doesNotMatch(result.stdout + result.stderr, forbiddenLocalOutputPattern(["cdn.agentique.example", "sig=private", tempDir]));
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("download fails closed for unsafe options and unavailable metadata before artifact fetch", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-cli-download-fail-"));
  try {
    let calls = 0;
    const missingOutput = await executeUploaderCli(["download", "agent-1", "--api-url", "https://agentique.example", "--json"], {
      fetchImpl: async () => {
        calls += 1;
        throw new Error("unexpected network call");
      }
    });
    const unsafeOutput = await executeUploaderCli(
      ["download", "agent-1", "--output", `out${path.sep}..${path.sep}escape.txt`, "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("unexpected network call");
        }
      }
    );
    const invalidMaxBytes = await executeUploaderCli(
      ["download", "agent-1", "--output", tempDir + path.sep, "--max-bytes", "0", "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("unexpected network call");
        }
      }
    );
    const invalidRedirectOrigin = await executeUploaderCli(
      [
        "download",
        "agent-1",
        "--output",
        tempDir + path.sep,
        "--allow-redirect-origin",
        "http://not-loopback.example",
        "--api-url",
        "https://agentique.example",
        "--json"
      ],
      {
        fetchImpl: async () => {
          calls += 1;
          throw new Error("unexpected network call");
        }
      }
    );
    const unavailable = await executeUploaderCli(
      ["download", "agent-1", "--output", tempDir + path.sep, "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async (url) => {
          calls += 1;
          assert.match(String(url), /\/download$/);
          return jsonResponse({
            resourceId: "agent-1",
            download: {
              availability: "source-only",
              url: "https://storage.agentique.example/files/agent-1.txt?sig=private",
              filename: "agent-1.txt"
            }
          });
        }
      }
    );

    assert.equal(missingOutput.exitCode, EXIT_CODES.usage);
    assert.equal(JSON.parse(missingOutput.stdout).code, "cli.usage_error");
    assert.equal(unsafeOutput.exitCode, EXIT_CODES.usage);
    assert.equal(JSON.parse(unsafeOutput.stdout).code, "cli.usage_error");
    assert.equal(invalidMaxBytes.exitCode, EXIT_CODES.usage);
    assert.equal(JSON.parse(invalidMaxBytes.stdout).code, "cli.usage_error");
    assert.equal(invalidRedirectOrigin.exitCode, EXIT_CODES.usage);
    assert.equal(JSON.parse(invalidRedirectOrigin.stdout).code, "cli.usage_error");
    assert.equal(unavailable.exitCode, EXIT_CODES.unavailable);
    assert.equal(JSON.parse(unavailable.stdout).code, "download.download-unavailable");
    assert.equal(calls, 1);
    assert.deepEqual(await readdir(tempDir), []);
    assert.doesNotMatch(
      missingOutput.stdout + unsafeOutput.stdout + invalidMaxBytes.stdout + invalidRedirectOrigin.stdout + unavailable.stdout,
      forbiddenLocalOutputPattern(["storage.agentique.example", "sig=private", tempDir])
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("download cleans temporary files for existing output, digest mismatch, and redirect denial", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-cli-download-cleanup-"));
  try {
    const existingPath = path.join(tempDir, "existing.txt");
    await writeFile(existingPath, "old", "utf8");

    const existing = await executeUploaderCli(
      ["download", "agent-existing", "--output", existingPath, "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async (url) => {
          assert.match(String(url), /\/download$/);
          return jsonResponse({
            resourceId: "agent-existing",
            download: {
              availability: "available",
              url: "https://storage.agentique.example/files/existing.txt",
              filename: "existing.txt"
            }
          });
        }
      }
    );

    const digestMismatch = await executeUploaderCli(
      ["download", "agent-digest", "--output", tempDir + path.sep, "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async (url) => {
          if (String(url).endsWith("/download")) {
            return jsonResponse({
              resourceId: "agent-digest",
              download: {
                availability: "available",
                url: "https://storage.agentique.example/files/digest.txt",
                filename: "digest.txt",
                sizeBytes: 6,
                digest: `sha256:${"b".repeat(64)}`
              }
            });
          }
          return new Response("digest", { status: 200, headers: { "content-length": "6" } });
        }
      }
    );

    const redirectDenied = await executeUploaderCli(
      ["download", "agent-redirect", "--output", tempDir + path.sep, "--api-url", "https://agentique.example", "--json"],
      {
        fetchImpl: async (url) => {
          if (String(url).endsWith("/download")) {
            return jsonResponse({
              resourceId: "agent-redirect",
              download: {
                availability: "available",
                url: "https://agentique.example/files/redirect.txt",
                filename: "redirect.txt"
              }
            });
          }
          return new Response(null, {
            status: 302,
            headers: { location: "https://cdn.agentique.example/redirect.txt?sig=private" }
          });
        }
      }
    );

    assert.equal(existing.exitCode, EXIT_CODES.unavailable);
    assert.equal(JSON.parse(existing.stdout).code, "download.output-exists");
    assert.equal(await readFile(existingPath, "utf8"), "old");
    assert.equal(digestMismatch.exitCode, EXIT_CODES.unavailable);
    assert.equal(JSON.parse(digestMismatch.stdout).code, "download.download-digest-mismatch");
    assert.equal(redirectDenied.exitCode, EXIT_CODES.unavailable);
    assert.equal(JSON.parse(redirectDenied.stdout).code, "download.unsafe-download-redirect");
    assert.deepEqual((await readdir(tempDir)).sort(), ["existing.txt"]);
    assert.doesNotMatch(
      existing.stdout + digestMismatch.stdout + redirectDenied.stdout,
      forbiddenLocalOutputPattern(["storage.agentique.example", "cdn.agentique.example", "sig=private", tempDir])
    );
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
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
  assert.equal(status.data.checkpoints.readyForReviewSubmit, false);
  assert.deepEqual(status.data.checkpoints.missing, REQUIRED_CREATOR_CHECKPOINTS);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern());
});

test("upload plan reports ready checkpoint evidence for a valid checkpoint package", async () => {
  const packageDir = await createCheckpointPackageFixture();
  const result = await executeUploaderCli(["upload", "plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.data.checkpoints.readyForReviewSubmit, true);
  assert.equal(status.data.checkpoints.packageContextReady, true);
  assert.deepEqual(status.data.checkpoints.missing, []);
  assert.equal(status.data.registryTrust.creatorCheckpointCount, REQUIRED_CREATOR_CHECKPOINTS.length);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload import-plan emits parser evidence dry-run without auth or network", async () => {
  let calls = 0;
  const packageDir = await createCheckpointPackageFixture({
    parserVariant: parserVariantFixture({
      sourceEcosystem: "dify",
      sourceFormat: "yaml",
      platformId: "dify",
      artifactKind: "workflow"
    })
  });
  const result = await executeUploaderCli(
    ["upload", "import-plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    {
      cwd: repoRoot,
      fetchImpl: async () => {
        calls += 1;
        throw new Error("unexpected network call");
      }
    }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.import_plan.ready");
  assert.equal(status.data.reviewOnly, true);
  assert.equal(status.data.dryRunOnly, true);
  assert.equal(status.data.noExecution, true);
  assert.equal(status.data.detected.sourceEcosystem, "dify");
  assert.equal(status.data.detected.sourceFormat, "yaml");
  assert.equal(status.data.detected.parseStatus, "parsed");
  assert.equal(status.data.graph.nodeCount, 2);
  assert.equal(status.data.compatibility.status, "compatible");
  assert.match(status.data.evidence.inventoryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.equal(calls, 0);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
  assert.doesNotMatch(result.stdout, /parser-input-secret|flag-token-value/i);
});

test("upload variant-plan emits platform variant dry-run details", async () => {
  const packageDir = await createCheckpointPackageFixture({
    parserVariant: parserVariantFixture({
      platformId: "codex-skill",
      artifactKind: "skill"
    })
  });
  const result = await executeUploaderCli(
    ["upload", "variant-plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.variant_plan.ready");
  assert.equal(status.data.reviewOnly, true);
  assert.equal(status.data.dryRunOnly, true);
  assert.equal(status.data.noExecution, true);
  assert.equal(status.data.variants[0].platformId, "codex-skill");
  assert.equal(status.data.variants[0].artifactKind, "skill");
  assert.equal(status.data.variants[0].state, "available");
  assert.equal(status.data.variants[0].downloadAvailability, "source-only");
  assert.deepEqual(status.data.variants[0].reasons, ["source-only"]);
  assert.equal(status.data.variants[0].reasonCount, 1);
  assert.equal(status.data.variants[0].readyForDownload, false);
  assert.match(status.data.evidence.inventoryDigest, /^sha256:[a-f0-9]{64}$/);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload variant-plan fails closed for unsupported or stale variants", async () => {
  const packageDir = await createCheckpointPackageFixture({
    parserVariant: parserVariantFixture({
      platformVariants: [
        platformVariantEntry({
          platformId: "flowise",
          artifactKind: "workflow",
          state: "unsupported",
          downloadAvailability: "unavailable",
          reasons: ["unsupported-platform"]
        }),
        platformVariantEntry({
          platformId: "n8n",
          artifactKind: "workflow",
          state: "stale",
          validationState: "stale",
          downloadAvailability: "blocked",
          reasons: ["stale-parser-evidence"]
        })
      ]
    })
  });
  const result = await executeUploaderCli(
    ["upload", "variant-plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const status = JSON.parse(result.stdout);
  const findingCodes = status.data.evidence.findings.map((finding) => finding.code);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.ok, false);
  assert.equal(status.code, "upload.variant_plan.review_required");
  assert.ok(findingCodes.includes("variant-unsupported"));
  assert.ok(findingCodes.includes("variant-stale"));
  assert.deepEqual(status.data.variants.map((variant) => variant.state), ["unsupported", "stale"]);
  assert.deepEqual(status.data.variants[0].reasons, ["unsupported-platform"]);
  assert.deepEqual(status.data.variants[1].reasons, ["stale-parser-evidence"]);
  assert.equal(status.data.variants[0].readyForDownload, false);
  assert.equal(status.data.variants[1].readyForDownload, false);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload import-plan and variant-plan fail closed without parser variant metadata", async () => {
  const packageDir = await createCheckpointPackageFixture();
  const importPlan = await executeUploaderCli(
    ["upload", "import-plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const variantPlan = await executeUploaderCli(
    ["upload", "variant-plan", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const importStatus = JSON.parse(importPlan.stdout);
  const variantStatus = JSON.parse(variantPlan.stdout);

  assert.equal(importPlan.exitCode, EXIT_CODES.unavailable);
  assert.equal(importStatus.code, "upload.import_plan.review_required");
  assert.ok(importStatus.data.evidence.findings.some((finding) => finding.code === "import-plan-parser-evidence-missing"));
  assert.equal(variantPlan.exitCode, EXIT_CODES.unavailable);
  assert.equal(variantStatus.code, "upload.variant_plan.review_required");
  assert.ok(variantStatus.data.evidence.findings.some((finding) => finding.code === "variant-plan-variants-missing"));
  assert.doesNotMatch(importPlan.stdout + variantPlan.stdout, forbiddenLocalOutputPattern([packageDir]));
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

test("upload draft emits local draft-only manifest output", async () => {
  const packageDir = await createCheckpointPackageFixture({
    generatedDraft: {
      draftOnly: true,
      kind: "manifest",
      generatedAt: "2026-06-06T00:00:00.000Z",
      schemaVersion: "draft-v1",
      summary: "Draft-only manifest suggestion prepared for local review."
    }
  });
  const result = await executeUploaderCli(
    ["upload", "draft", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--draft-kind", "manifest", "--json"],
    { cwd: repoRoot }
  );
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.draft.ready");
  assert.equal(status.data.draftOnly, true);
  assert.equal(status.data.submitted, false);
  assert.equal(status.data.requiresUserConfirmation, true);
  assert.equal(status.data.requiresServerValidationBeforeSubmit, true);
  assert.equal(status.data.draft.kind, "manifest");
  assert.equal(status.data.draft.summary, "Draft-only manifest suggestion prepared for local review.");
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload draft rejects overclaim and sensitive generated copy", async () => {
  const packageDir = await createCheckpointPackageFixture({
    generatedDraft: {
      draftOnly: true,
      kind: "card",
      generatedAt: "2026-06-06T00:00:00.000Z",
      schemaVersion: "draft-v1",
      summary: "This draft is approved for hosted execution."
    }
  });
  const result = await executeUploaderCli(["upload", "draft", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"], {
    cwd: repoRoot
  });
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.unavailable);
  assert.equal(status.code, "upload.draft.unsafe_content");
  assert.ok(status.data.issues.some((entry) => entry.code === "draft-overclaim-approval"));
  assert.ok(status.data.issues.some((entry) => entry.code === "draft-overclaim-hosted-execution"));
  assert.doesNotMatch(result.stdout, /approved for hosted execution|flag-token-value/i);
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload patch emits explicit partial update operations", async () => {
  const packageDir = await createCheckpointPackageFixture({
    patchDelta: {
      mode: "patch",
      operations: [
        {
          op: "replace",
          path: "/summary",
          valueSummary: "Updates public summary only."
        }
      ]
    }
  });
  const result = await executeUploaderCli(["upload", "patch", packageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"], {
    cwd: repoRoot
  });
  const status = JSON.parse(result.stdout);

  assert.equal(result.exitCode, EXIT_CODES.success);
  assert.equal(status.ok, true);
  assert.equal(status.code, "upload.patch_delta.ready");
  assert.equal(status.data.partialUpdateOnly, true);
  assert.equal(status.data.submitted, false);
  assert.equal(status.data.patchDelta.mode, "patch");
  assert.equal(status.data.patchDelta.operationCount, 1);
  assert.deepEqual(status.data.patchDelta.operations[0], {
    op: "replace",
    path: "/summary",
    valueSummary: "Updates public summary only."
  });
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern([packageDir]));
});

test("upload patch rejects missing metadata and full snapshot-like operations", async () => {
  const missingPackageDir = await createCheckpointPackageFixture();
  const missing = await executeUploaderCli(
    ["upload", "patch", missingPackageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const missingStatus = JSON.parse(missing.stdout);

  assert.equal(missing.exitCode, EXIT_CODES.unavailable);
  assert.equal(missingStatus.code, "upload.patch_delta.required");

  const snapshotPackageDir = await createCheckpointPackageFixture({
    patchDelta: {
      mode: "patch",
      operations: [
        {
          op: "replace",
          path: "/manifest",
          valueSummary: "Replaces a complete manifest snapshot."
        }
      ]
    }
  });
  const snapshot = await executeUploaderCli(
    ["upload", "patch", snapshotPackageDir, "--schemas-dir", path.join(repoRoot, "schemas"), "--json"],
    { cwd: repoRoot }
  );
  const snapshotStatus = JSON.parse(snapshot.stdout);

  assert.equal(snapshot.exitCode, EXIT_CODES.unavailable);
  assert.equal(snapshotStatus.code, "upload.patch_delta.full_snapshot_forbidden");
  assert.ok(snapshotStatus.data.issues.some((entry) => entry.code === "patch-delta-full-snapshot-forbidden"));
  assert.doesNotMatch(missing.stdout + snapshot.stdout, forbiddenLocalOutputPattern([missingPackageDir, snapshotPackageDir]));
});

test("upload submit completes a review-only session without forwarding bearer auth to storage", async () => {
  const calls = [];
  const packageDir = await createCheckpointPackageFixture();
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
            "x-agentique-transfer": "session",
            authorization: "Bearer storage-header-value",
            cookie: "storage_cookie=value"
          }
        }
      });
    }

    if (calls.length === 2) {
      assert.equal(call.url, "https://storage.agentique.test/upload/sess_test_123?sig=private");
      assert.equal(init.method, "PUT");
      assert.equal(headerValue(init.headers, "authorization"), null);
      assert.equal(headerValue(init.headers, "cookie"), null);
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
    assert.match(init.body, /"checkpointDigest":"sha256:[a-f0-9]{64}"/);
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
      packageDir,
      "--schemas-dir",
      path.join(repoRoot, "schemas"),
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
  assert.doesNotMatch(
    result.stdout,
    forbiddenLocalOutputPattern(["flag-token-value", "storage.agentique.test", "sig=private", packageDir])
  );
});

test("upload submit requires checkpoint evidence before creating a session", async () => {
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
      "https://api.agentique.test",
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
  assert.equal(status.code, "upload.submit.checkpoints_required");
  assert.equal(status.data.plan.checkpoints.readyForReviewSubmit, false);
  assert.equal(status.data.plan.checkpoints.missing.length, REQUIRED_CREATOR_CHECKPOINTS.length);
  assert.equal(calls, 0);
  assert.doesNotMatch(result.stdout, /flag-token-value/i);
});

test("upload submit fails closed when server completion is not verified", async () => {
  let calls = 0;
  const packageDir = await createCheckpointPackageFixture();
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
      packageDir,
      "--schemas-dir",
      path.join(repoRoot, "schemas"),
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
  assert.doesNotMatch(result.stdout, forbiddenLocalOutputPattern(["flag-token-value", "storage.agentique.test", "sig=private", packageDir]));
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

test("upload submit rejects third-party api origins before bearer forwarding", async () => {
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
      "https://example.com",
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
  assert.doesNotMatch(result.stdout, /flag-token-value|example\.com/i);
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
  const invalidDraftKind = await executeUploaderCli(["upload", "draft", "pkg", "--draft-kind", "page", "--json"]);
  const missingCatalogResource = await executeUploaderCli(["catalog", "get", "--json"]);
  const unknownCatalogAction = await executeUploaderCli(["catalog", "publish", "agent-1", "--json"]);

  assert.equal(JSON.parse(missingCommand.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(unknownCommand.stdout).code, "cli.unknown_command");
  assert.equal(JSON.parse(unknownOption.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(missingSchemasDir.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(missingApiUrl.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(invalidDraftKind.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(missingCatalogResource.stdout).code, "cli.usage_error");
  assert.equal(JSON.parse(unknownCatalogAction.stdout).code, "cli.usage_error");
  assert.equal(missingCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownCommand.exitCode, EXIT_CODES.usage);
  assert.equal(unknownOption.exitCode, EXIT_CODES.usage);
  assert.equal(missingSchemasDir.exitCode, EXIT_CODES.usage);
  assert.equal(missingApiUrl.exitCode, EXIT_CODES.usage);
  assert.equal(invalidDraftKind.exitCode, EXIT_CODES.usage);
  assert.equal(missingCatalogResource.exitCode, EXIT_CODES.usage);
  assert.equal(unknownCatalogAction.exitCode, EXIT_CODES.usage);
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

async function createCheckpointPackageFixture({ generatedDraft = null, patchDelta = null, parserVariant = null } = {}) {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-uploader-checkpoints-"));
  const agentsDir = path.join(tempDir, "agents");
  await mkdir(agentsDir, { recursive: true });

  const readme = "# Checkpoint Fixture\n\nA public review-only checkpoint fixture for uploader tests.\n";
  const assistant = "# Research Assistant\n\nSummarizes public sources for reviewer inspection only.\n";
  await writeFile(path.join(tempDir, "README.md"), readme, "utf8");
  await writeFile(path.join(agentsDir, "research-assistant.md"), assistant, "utf8");

  const hashes = {
    "README.md": fingerprint(readme),
    "agents/research-assistant.md": fingerprint(assistant)
  };
  const registryTrust = {
    creatorMetadata: {
      declaredBy: "test-author",
      declaredAt: "2026-06-06T00:00:00.000Z",
      notes: "Creator supplied checkpoint evidence for review-only submission."
    },
    packageContext: {
      packageName: "checkpoint-fixture",
      version: "1.0.0",
      sourceUrl: "https://github.com/rookiestar28/Agentique/tree/main/starters/agent-assistant",
      ownershipEvidenceVersion: "owner-v1",
      packageDigest: fingerprint(JSON.stringify(hashes))
    },
    creatorCheckpoints: REQUIRED_CREATOR_CHECKPOINTS.map((kind, index) => ({
      kind,
      acknowledged: true,
      completedAt: `2026-06-06T00:00:0${index}.000Z`,
      evidenceHash: fingerprint(kind)
    })),
    ...(generatedDraft ? { generatedDraft } : {}),
    ...(patchDelta ? { patchDelta } : {})
  };
  const manifest = {
    formatVersion: "1.0",
    name: "checkpoint-fixture",
    summary: "A static review-only package fixture with completed creator checkpoints.",
    source: {
      type: "git",
      url: "https://github.com/rookiestar28/Agentique/tree/main/starters/agent-assistant"
    },
    distribution: {
      mode: "package_download",
      notes: "Prepared for platform upload review before publication."
    },
    permissionRisk: {
      readOnly: true,
      destructive: false,
      idempotent: true,
      openWorld: false,
      externalNetwork: false,
      credentialed: false,
      approvalRequired: false,
      dataSensitivity: "public",
      capabilities: ["read-public-content"],
      reviewNotes: "Static documentation only; it does not request auth material or mutate state."
    },
    package: {
      formatVersion: "1.0",
      files: ["README.md", "agents/research-assistant.md"],
      hashes
    },
    registryTrust,
    ...(parserVariant ? { parserVariant } : {})
  };
  await writeFile(path.join(tempDir, "manifest.json"), `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  assert.equal(evaluateUploadCheckpointEvidence(manifest.registryTrust).readyForReviewSubmit, true);
  return tempDir;
}

function parserVariantFixture(overrides = {}) {
  return {
    contractVersion: "1.0",
    parserEvidence: {
      sourceEcosystem: overrides.sourceEcosystem ?? "mcp",
      sourceFormat: overrides.sourceFormat ?? "json",
      parserId: "agentique-uploader-test-parser",
      parserVersion: "1.0.0",
      inputDigest: fingerprint("parser-input-secret"),
      outputDigest: fingerprint("parser-output"),
      parseStatus: overrides.parseStatus ?? "parsed",
      parseConfidence: overrides.parseConfidence ?? "high",
      sanitizerStatus: "passed",
      noExecution: true,
      metadataOnly: true,
      observedAt: "2026-06-07T00:00:00.000Z"
    },
    resourceGraphSummary: {
      sanitized: true,
      nodeCount: 2,
      edgeCount: 1,
      capabilityCount: 1,
      sourceFileCount: 1,
      summaryDigest: fingerprint("graph-summary")
    },
    compatibility: {
      status: overrides.compatibilityStatus ?? "compatible",
      reasons: ["static-contract"]
    },
    platformVariants: overrides.platformVariants ?? [
      platformVariantEntry({
        platformId: overrides.platformId ?? "mcp",
        artifactKind: overrides.artifactKind ?? "metadata"
      })
    ]
  };
}

function platformVariantEntry(overrides = {}) {
  return {
    platformId: overrides.platformId ?? "mcp",
    artifactKind: overrides.artifactKind ?? "metadata",
    state: overrides.state ?? "available",
    validationState: overrides.validationState ?? "not-run",
    managedBy: "creator",
    download: {
      availability: overrides.downloadAvailability ?? "source-only"
    },
    reasons: overrides.reasons ?? ["source-only"],
    observedAt: "2026-06-07T00:01:00.000Z"
  };
}

function fingerprint(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
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
