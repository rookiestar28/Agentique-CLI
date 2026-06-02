import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  collectWorkflowPostureFindings,
  hasOidcWritePermission,
  hasReadOnlyContentsPermission,
  listWorkflowFiles,
  stripYamlComments
} from "../lib/workflow-posture.mjs";

test("missing workflow directory returns no files or findings", async () => {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agentique-workflow-missing-"));

  assert.deepEqual(listWorkflowFiles(path.join(repoRoot, ".github", "workflows")), []);
  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
});

test("checks both yml and yaml workflow files with shared logic", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": safeWorkflow(),
    "nightly.yaml": safeWorkflow()
  });

  assert.equal(listWorkflowFiles(path.join(repoRoot, ".github", "workflows")).length, 2);
  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
});

test("ignores comment-only publish and secrets text", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": `${safeWorkflow()}\n# npm publish\n# secrets.TOKEN\n`
  });

  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
  assert.doesNotMatch(stripYamlComments("# npm publish\n# secrets.TOKEN\n"), /npm publish|secrets\./);
});

test("rejects active publish, secrets, privileged trigger, and missing permissions", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": [
      "name: Unsafe",
      "on:",
      "  pull_request_target:",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: npm publish",
      "      - run: echo ${{ secrets.TOKEN }}"
    ].join("\n")
  });

  const findings = collectWorkflowPostureFindings(repoRoot).join("\n");

  assert.match(findings, /privileged pull request trigger/);
  assert.match(findings, /repository secrets/);
  assert.match(findings, /publishes packages/);
  assert.match(findings, /read-only contents permission/);
});

test("accepts only the trusted manual OIDC publish workflow", async () => {
  const repoRoot = await createWorkflowRepo({
    "publish-packages.yml": trustedPublishWorkflow()
  });

  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
});

test("rejects trusted publish workflows with automatic triggers or disabled provenance", async () => {
  const repoRoot = await createWorkflowRepo({
    "publish-packages.yml": trustedPublishWorkflow()
      .replace("  workflow_dispatch:", "  workflow_dispatch:\n  push:")
      .replace("npm publish --access public", "NPM_CONFIG_PROVENANCE=false npm publish --access public")
  });

  const findings = collectWorkflowPostureFindings(repoRoot).join("\n");

  assert.match(findings, /trusted publish workflow must be manual-only/);
  assert.match(findings, /trusted publish workflow must not disable provenance/);
  assert.match(findings, /publishes packages/);
});

test("rejects lifecycle-enabled npm installs in pull request workflows", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": [
      "name: Unsafe install",
      "on:",
      "  pull_request:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: npm install",
      "      - run: npm --prefix packages/action ci"
    ].join("\n")
  });

  const findings = collectWorkflowPostureFindings(repoRoot).join("\n");

  assert.match(findings, /lifecycle-enabled npm install/);
  assert.match(findings, /npm ci without --ignore-scripts/);
});

test("accepts lockfile-backed lifecycle-disabled npm installs", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": [
      "name: Safe install",
      "on:",
      "  pull_request:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: npm ci --ignore-scripts",
      "      - run: npm --prefix packages/action ci --ignore-scripts"
    ].join("\n")
  });

  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
});

test("rejects unbounded detect-secrets workflow installs", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": [
      "name: Unsafe secret scan install",
      "on:",
      "  pull_request:",
      "permissions:",
      "  contents: read",
      "jobs:",
      "  test:",
      "    runs-on: ubuntu-latest",
      "    steps:",
      "      - run: python -m pip install --upgrade detect-secrets"
    ].join("\n")
  });

  assert.match(collectWorkflowPostureFindings(repoRoot).join("\n"), /unpinned detect-secrets install/);
});

test("rejects detect-secrets requirements without an exact pin", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": pinnedSecretScanInstallWorkflow()
  });
  await writeFile(path.join(repoRoot, ".github", "requirements-ci.txt"), "detect-secrets\n", "utf8");

  assert.match(collectWorkflowPostureFindings(repoRoot).join("\n"), /requirements file must pin detect-secrets/);
});

test("accepts detect-secrets installation from an exact pinned requirements file", async () => {
  const repoRoot = await createWorkflowRepo({
    "release-check.yml": pinnedSecretScanInstallWorkflow()
  });
  await writeFile(path.join(repoRoot, ".github", "requirements-ci.txt"), "detect-secrets==1.5.0\n", "utf8");

  assert.deepEqual(collectWorkflowPostureFindings(repoRoot), []);
});

test("permission helper accepts only contents read posture", () => {
  assert.equal(hasReadOnlyContentsPermission(safeWorkflow()), true);
  assert.equal(hasReadOnlyContentsPermission("permissions:\n  contents: write\n"), false);
  assert.equal(hasReadOnlyContentsPermission("jobs:\n  test:\n    runs-on: ubuntu-latest\n"), false);
  assert.equal(hasOidcWritePermission("permissions:\n  contents: read\n  id-token: write\n"), true);
  assert.equal(hasOidcWritePermission("permissions:\n  contents: read\n  id-token: read\n"), false);
});

function safeWorkflow() {
  return [
    "name: Safe",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: npm test"
  ].join("\n");
}

function pinnedSecretScanInstallWorkflow() {
  return [
    "name: Safe secret scan install",
    "on:",
    "  pull_request:",
    "permissions:",
    "  contents: read",
    "jobs:",
    "  test:",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: python -m pip install --requirement .github/requirements-ci.txt"
  ].join("\n");
}

function trustedPublishWorkflow() {
  return [
    "name: Publish Packages",
    "on:",
    "  workflow_dispatch:",
    "permissions:",
    "  contents: read",
    "  id-token: write",
    "jobs:",
    "  publish:",
    "    if: ${{ github.ref == 'refs/heads/main' }}",
    "    runs-on: ubuntu-latest",
    "    steps:",
    "      - run: npm ci --ignore-scripts",
    "      - run: npm publish --access public"
  ].join("\n");
}

async function createWorkflowRepo(files) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agentique-workflow-"));
  const workflowDir = path.join(repoRoot, ".github", "workflows");
  await mkdir(workflowDir, { recursive: true });

  for (const [fileName, content] of Object.entries(files)) {
    await writeFile(path.join(workflowDir, fileName), `${content}\n`, "utf8");
  }

  return repoRoot;
}
