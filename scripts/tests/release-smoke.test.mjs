import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectReleaseDecisionFailures
} from "../check-release-go-no-go.mjs";
import {
  evaluateRegistryReadback,
  REGISTRY_EXPECTATIONS
} from "../registry-readback.mjs";
import {
  collectCatalogDownloadPackageSurfaceFailures,
  collectParserVariantPackageSurfaceFailures,
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

test("release go/no-go accepts scoped parser variant publication no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      parserVariantPublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["hosted release check for the pushed parser variant package candidate is missing"]
      }
    }),
    []
  );
});

test("release go/no-go accepts scoped catalog download publication no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      catalogDownloadPublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["current live endpoint evidence for catalog and download availability is missing"]
      }
    }),
    []
  );
});

test("release go/no-go rejects scoped parser variant no-go without blockers", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      parserVariantPublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: []
      }
    }),
    ["parserVariantPublicationDecision: no_go decision requires explicit blockers"]
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

test("install smoke covers parser variant package surface", () => {
  assert.deepEqual(
    collectParserVariantPackageSurfaceFailures({
      parserVariantSchemaExists: true,
      hasParserVariantReadbackExport: true,
      uploaderHelpText: "agentique upload import-plan ./pkg\nagentique upload variant-plan ./pkg"
    }),
    []
  );

  assert.deepEqual(
    collectParserVariantPackageSurfaceFailures({
      parserVariantSchemaExists: false,
      hasParserVariantReadbackExport: false,
      uploaderHelpText: "agentique upload plan ./pkg"
    }),
    [
      "schemas package missing parser-variant.schema.json",
      "readback package missing normalizeParserVariantReadback export",
      "uploader help missing upload import-plan command",
      "uploader help missing upload variant-plan command"
    ]
  );
});

test("install smoke covers catalog and direct download package surface", () => {
  assert.deepEqual(
    collectCatalogDownloadPackageSurfaceFailures({
      hasDownloadResourceArtifactExport: true,
      hasNormalizeResourceListExport: true,
      hasNormalizeDownloadMetadataExport: true,
      uploaderHelpText: [
        "agentique catalog list",
        "agentique catalog get",
        "agentique catalog download-metadata",
        "agentique download <resource-id> --output <file-or-dir>"
      ].join("\n")
    }),
    []
  );

  assert.deepEqual(
    collectCatalogDownloadPackageSurfaceFailures({
      hasDownloadResourceArtifactExport: false,
      hasNormalizeResourceListExport: false,
      hasNormalizeDownloadMetadataExport: false,
      uploaderHelpText: "agentique upload plan ./pkg"
    }),
    [
      "readback package missing downloadResourceArtifact export",
      "readback package missing normalizeResourceList export",
      "readback package missing normalizeDownloadMetadata export",
      "uploader help missing catalog list command",
      "uploader help missing catalog get command",
      "uploader help missing catalog download-metadata command",
      "uploader help missing direct download command"
    ]
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
