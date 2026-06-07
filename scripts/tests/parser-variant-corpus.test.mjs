import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { test } from "node:test";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const starterDir = path.join(repoRoot, "starters", "parser-variant-import-review");
const schemaFixturesPath = path.join(repoRoot, "schemas", "fixtures", "schema-fixtures.json");

test("parser variant starter is static no-execution source-only metadata", async () => {
  const manifest = await readJson(path.join(starterDir, "manifest.json"));
  const parserVariant = manifest.parserVariant;

  assert.equal(manifest.name, "parser-variant-import-review");
  assert.equal(parserVariant.parserEvidence.sourceEcosystem, "dify");
  assert.equal(parserVariant.parserEvidence.sourceFormat, "yaml");
  assert.equal(parserVariant.parserEvidence.noExecution, true);
  assert.equal(parserVariant.parserEvidence.metadataOnly, true);
  assert.equal(parserVariant.resourceGraphSummary.redaction.secrets, true);
  assert.equal(parserVariant.resourceGraphSummary.redaction.privatePaths, true);
  assert.equal(parserVariant.resourceGraphSummary.redaction.rawSource, true);
  assert.equal(parserVariant.platformVariants[0].download.availability, "source-only");
  assert.equal(parserVariant.platformVariants[0].managedBy, "creator");
  assert.deepEqual(parserVariant.platformVariants[0].reasons, ["source-only"]);

  await assertPackageHashes(manifest);
  await assertStarterContentIsPublicSafe(manifest.package.files);
});

test("parser variant fixture corpus covers supported blocked stale and readback cases", async () => {
  const fixtures = await readJson(schemaFixturesPath);
  const parserVariantCases = fixtures["parser-variant.schema.json"].validCases;
  const readbackCases = fixtures["public-readback.schema.json"].validCases;

  assert.equal(parserVariantCases["parsed-available"].parserEvidence.parseStatus, "parsed");
  assert.equal(parserVariantCases["parsed-available"].platformVariants[0].download.availability, "source-only");

  assert.equal(parserVariantCases["blocked-source"].parserEvidence.parseStatus, "blocked");
  assert.equal(parserVariantCases["blocked-source"].platformVariants[0].state, "blocked");

  assert.equal(parserVariantCases["unsupported-stale-variant"].compatibility.status, "unsupported");
  assert.equal(parserVariantCases["unsupported-stale-variant"].platformVariants[0].state, "unsupported");
  assert.equal(parserVariantCases["unsupported-stale-variant"].platformVariants[1].state, "stale");
  assert.deepEqual(parserVariantCases["unsupported-stale-variant"].platformVariants[1].reasons, ["source-changed"]);

  assert.equal(readbackCases["parser-variant"].parserVariant.parserEvidence.parseStatus, "partial");
  assert.equal(readbackCases["parser-variant"].parserVariant.platformVariants[0].state, "review-required");
});

async function assertPackageHashes(manifest) {
  for (const relPath of manifest.package.files) {
    const content = await readFile(path.join(starterDir, ...relPath.split("/")));
    const actual = `sha256:${createHash("sha256").update(content).digest("hex")}`;
    assert.equal(manifest.package.hashes[relPath], actual, `${relPath} hash should match manifest`);
  }
}

async function assertStarterContentIsPublicSafe(files) {
  const checked = [
    await readFile(path.join(starterDir, "manifest.json"), "utf8"),
    ...(await Promise.all(files.map((relPath) => readFile(path.join(starterDir, ...relPath.split("/")), "utf8"))))
  ].join("\n");

  assert.doesNotMatch(
    checked,
    new RegExp(
      [
        "OSS[0-9]{3}",
        "R[0-9]{3,4}",
        escapeRegExp([".", "planning"].join("")),
        escapeRegExp(["reference", "docs"].join("/")),
        escapeRegExp(["B:", "\\\\"].join("")),
        "token=",
        "api[_-]?key",
        "password",
        "presigned",
        ["operator", "workflow"].join(" "),
        ["certified", "safe"].join(" "),
        ["approved by local", "validator"].join(" "),
        ["platform approved by", "validator"].join(" ")
      ].join("|"),
      "i"
    )
  );
}

async function readJson(filePath) {
  return JSON.parse(await readFile(filePath, "utf8"));
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
