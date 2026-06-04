import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { test } from "node:test";
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

test("cli fails closed and emits stable json on request", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs", "--json"]);
  const status = JSON.parse(result.stdout);

  assert.equal(result.code, 2);
  assert.equal(result.stderr, "");
  assert.equal(status.ok, false);
  assert.equal(status.code, "uploader.boundary_only");
  assert.equal(status.boundary.commandName, "agentique");
});

test("cli human output stays explicit about disabled live behavior", async () => {
  const result = await execFileExpectFailure(process.execPath, ["src/cli.mjs"]);

  assert.equal(result.code, 2);
  assert.equal(result.stdout, "");
  assert.match(result.stderr, /live upload commands are not enabled/i);
  assert.match(result.stderr, /does not publish, approve, certify, host, or moderate/i);
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
