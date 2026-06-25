import assert from "node:assert/strict";
import { test } from "node:test";
import {
  collectReleaseDecisionFailures
} from "../check-release-go-no-go.mjs";
import {
  buildRegistryExpectations,
  evaluateRegistryReadback,
} from "../registry-readback.mjs";
import {
  collectAgentNativePackageSurfaceFailures,
  collectCatalogDownloadPackageSurfaceFailures,
  collectGraphBlockPackageSurfaceFailures,
  collectParserVariantPackageSurfaceFailures,
  collectPortableProfilePackageSurfaceFailures,
  collectUploadPreparationPackageSurfaceFailures,
  collectForbiddenPackedFiles,
  PACKAGE_PATHS,
  summarizePackResult
} from "../package-install-smoke.mjs";

test("registry readback policy accepts published companion packages", () => {
  const expectations = buildRegistryExpectations({ mode: "published", targetVersion: "0.2.0" });
  const uploader = expectations.find((item) => item.name === "@agentique.io/uploader");
  const validator = expectations.find((item) => item.name === "@agentique.io/validator");

  assert.equal(evaluateRegistryReadback({ status: "published", version: "0.2.0" }, validator), null);
  assert.equal(evaluateRegistryReadback({ status: "published", version: "0.2.0" }, uploader), null);
  assert.match(
    evaluateRegistryReadback({ status: "not_found", version: null }, uploader),
    /expected published/
  );
});

test("registry readback policy accepts prepublish target absence", () => {
  const expectations = buildRegistryExpectations({ mode: "prepublish", targetVersion: "0.2.0" });
  const uploader = expectations.find((item) => item.name === "@agentique.io/uploader");

  assert.equal(evaluateRegistryReadback({ status: "not_found", version: null }, uploader), null);
  assert.match(
    evaluateRegistryReadback({ status: "published", version: "0.2.0" }, uploader),
    /expected pending not-found/
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

test("release go/no-go accepts scoped agent-native publication no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      agentNativePublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["agent-native patch candidate has no owner-approved package publication"]
      }
    }),
    []
  );
});

test("release go/no-go accepts scoped portable profile publication no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      portableProfilePublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["portable profile source changes need hosted release and registry readback before publication claims"]
      }
    }),
    []
  );
});

test("release go/no-go accepts scoped graph block publication no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      graphBlockPublicationDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["graph block source changes need hosted release and registry readback before publication claims"]
      }
    }),
    []
  );
});

test("release go/no-go accepts scoped upload preparation source no-go", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      localChecks: { tests: true },
      externalEvidence: { ownerApproval: true },
      uploadPreparationSourceDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: ["upload-preparation source changes need hosted release and registry readback before publication claims"]
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

test("release go/no-go rejects scoped upload preparation no-go without blockers", () => {
  assert.deepEqual(
    collectReleaseDecisionFailures({
      decision: "go",
      releaseBlocked: false,
      uploadPreparationSourceDecision: {
        decision: "no_go",
        releaseBlocked: true,
        blockers: []
      }
    }),
    ["uploadPreparationSourceDecision: no_go decision requires explicit blockers"]
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

test("install smoke covers agent-native package surface", () => {
  assert.deepEqual(
    collectAgentNativePackageSurfaceFailures({
      agentNativeSchemaExists: true,
      hasNormalizeAgentNativeReadbackExport: true,
      uploaderHelpText: "agentique upload agent-native-plan ./pkg"
    }),
    []
  );

  assert.deepEqual(
    collectAgentNativePackageSurfaceFailures({
      agentNativeSchemaExists: false,
      hasNormalizeAgentNativeReadbackExport: false,
      uploaderHelpText: "agentique upload plan ./pkg"
    }),
    [
      "schemas package missing agent-native.schema.json",
      "readback package missing normalizeAgentNativeReadback export",
      "uploader help missing upload agent-native-plan command"
    ]
  );
});

test("install smoke covers portable profile package surface", () => {
  assert.deepEqual(
    collectPortableProfilePackageSurfaceFailures({
      portableProfileSchemaExists: true,
      generatedAdapterManifestSchemaExists: true,
      validatorHelpText: [
        "agentique-validator portable-generate",
        "agentique-validator portable-drift",
        "agentique-validator portable-parity",
        "agentique-validator debt-ledger",
        "agentique-validator portable-eval"
      ].join("\n")
    }),
    []
  );

  assert.deepEqual(
    collectPortableProfilePackageSurfaceFailures({
      portableProfileSchemaExists: false,
      generatedAdapterManifestSchemaExists: false,
      validatorHelpText: "agentique-validator validate ./pkg"
    }),
    [
      "schemas package missing portable-profile.schema.json",
      "schemas package missing generated-adapter-manifest.schema.json",
      "validator help missing portable-generate command",
      "validator help missing portable-drift command",
      "validator help missing portable-parity command",
      "validator help missing debt-ledger command",
      "validator help missing portable-eval command"
    ]
  );
});

test("install smoke covers graph block package surface", () => {
  assert.deepEqual(
    collectGraphBlockPackageSurfaceFailures({
      graphBlockBundleSchemaExists: true,
      blockManifestSchemaExists: true,
      executionLedgerSchemaExists: true,
      workspaceArtifactSchemaExists: true,
      apiDriftSchemaExists: true,
      generatedBlockFixturesManifestSchemaExists: true,
      validatorHelpText: [
        "agentique-validator bundle-validate",
        "agentique-validator bundle-import-plan",
        "agentique-validator bundle-export-plan",
        "agentique-validator block-fixtures-generate",
        "agentique-validator ledger-inspect",
        "agentique-validator ledger-replay-diagnostics",
        "agentique-validator artifact-scan",
        "agentique-validator api-drift"
      ].join("\n")
    }),
    []
  );

  assert.deepEqual(
    collectGraphBlockPackageSurfaceFailures({
      graphBlockBundleSchemaExists: false,
      blockManifestSchemaExists: false,
      executionLedgerSchemaExists: false,
      workspaceArtifactSchemaExists: false,
      apiDriftSchemaExists: false,
      generatedBlockFixturesManifestSchemaExists: false,
      validatorHelpText: "agentique-validator validate ./pkg"
    }),
    [
      "schemas package missing graph-block-bundle.schema.json",
      "schemas package missing block-manifest.schema.json",
      "schemas package missing execution-ledger.schema.json",
      "schemas package missing workspace-artifact.schema.json",
      "schemas package missing api-drift.schema.json",
      "schemas package missing generated-block-fixtures-manifest.schema.json",
      "validator help missing bundle-validate command",
      "validator help missing bundle-import-plan command",
      "validator help missing bundle-export-plan command",
      "validator help missing block-fixtures-generate command",
      "validator help missing ledger-inspect command",
      "validator help missing ledger-replay-diagnostics command",
      "validator help missing artifact-scan command",
      "validator help missing api-drift command"
    ]
  );
});

test("install smoke covers upload preparation package surface", () => {
  assert.deepEqual(
    collectUploadPreparationPackageSurfaceFailures({
      uploadCandidateGateSchemaExists: true,
      skillSourcePackageSchemaExists: true,
      rolePluginPackSchemaExists: true,
      sourceNoGoSchemaExists: true,
      staticPackageDryRunSchemaExists: true,
      validatorHelpText: [
        "agentique-validator upload-candidate",
        "agentique-validator package-dry-run",
        "agentique-validator source-no-go"
      ].join("\n")
    }),
    []
  );

  assert.deepEqual(
    collectUploadPreparationPackageSurfaceFailures({
      uploadCandidateGateSchemaExists: false,
      skillSourcePackageSchemaExists: false,
      rolePluginPackSchemaExists: false,
      sourceNoGoSchemaExists: false,
      staticPackageDryRunSchemaExists: false,
      validatorHelpText: "agentique-validator validate ./pkg"
    }),
    [
      "schemas package missing upload-candidate-gate.schema.json",
      "schemas package missing skill-source-package.schema.json",
      "schemas package missing role-plugin-pack.schema.json",
      "schemas package missing source-no-go.schema.json",
      "schemas package missing static-package-dry-run.schema.json",
      "validator help missing upload-candidate command",
      "validator help missing package-dry-run command",
      "validator help missing source-no-go command"
    ]
  );
});

test("pack result summary is stable and hides tarball internals", () => {
  const summary = summarizePackResult({
    name: "@agentique.io/uploader",
    version: "0.2.0",
    filename: "agentique.io-uploader-0.2.0.tgz",
    files: [{ path: "package.json" }, { path: "src/cli.mjs" }]
  });

  assert.equal(summary.name, "@agentique.io/uploader");
  assert.equal(summary.version, "0.2.0");
  assert.equal(summary.filename, "agentique.io-uploader-0.2.0.tgz");
  assert.deepEqual(summary.files, ["package.json", "src/cli.mjs"]);
  assert.deepEqual(summary.forbidden, []);
});
