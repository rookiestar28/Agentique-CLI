import assert from "node:assert/strict";
import { test } from "node:test";
import {
  evaluateRegistryReadback,
  REGISTRY_EXPECTATIONS
} from "../registry-readback.mjs";
import {
  collectForbiddenPackedFiles,
  PACKAGE_PATHS,
  summarizePackResult
} from "../package-install-smoke.mjs";

test("registry readback policy accepts published companion packages", () => {
  const uploader = REGISTRY_EXPECTATIONS.find((item) => item.name === "@agentique.io/uploader");
  const validator = REGISTRY_EXPECTATIONS.find((item) => item.name === "@agentique.io/validator");

  assert.equal(evaluateRegistryReadback({ status: "published", version: "0.1.0" }, validator), null);
  assert.equal(evaluateRegistryReadback({ status: "published", version: "0.1.0" }, uploader), null);
  assert.match(
    evaluateRegistryReadback({ status: "not_found", version: null }, uploader),
    /expected published/
  );
});

test("release package set includes uploader as a smoke target", () => {
  assert.deepEqual(PACKAGE_PATHS, [
    "schemas",
    "packages/validator",
    "packages/action",
    "packages/readback",
    "packages/uploader"
  ]);
});

test("install smoke rejects generated and runtime artifacts from packed files", () => {
  assert.deepEqual(
    collectForbiddenPackedFiles([
      "package.json",
      "README.md",
      "src/index.mjs",
      "node_modules/example/index.js",
      ".env",
      "package.tgz"
    ]),
    ["node_modules/example/index.js", ".env", "package.tgz"]
  );
});

test("pack result summary is stable and hides tarball internals", () => {
  const summary = summarizePackResult({
    name: "@agentique.io/uploader",
    version: "0.1.0",
    filename: "agentique.io-uploader-0.1.0.tgz",
    files: [{ path: "package.json" }, { path: "src/cli.mjs" }]
  });

  assert.equal(summary.name, "@agentique.io/uploader");
  assert.equal(summary.version, "0.1.0");
  assert.equal(summary.filename, "agentique.io-uploader-0.1.0.tgz");
  assert.deepEqual(summary.files, ["package.json", "src/cli.mjs"]);
  assert.deepEqual(summary.forbidden, []);
});
