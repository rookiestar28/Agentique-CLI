import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const PACKAGE_PATHS = Object.freeze([
  "schemas",
  "packages/validator",
  "packages/action",
  "packages/readback",
  "packages/uploader"
]);

export const PACKAGE_NAMES = Object.freeze([
  "@agentique.io/schemas",
  "@agentique.io/validator",
  "@agentique.io/action",
  "@agentique.io/readback",
  "@agentique.io/uploader"
]);

const FORBIDDEN_PACKED_FILE_PATTERN = /(^|\/)(node_modules|coverage|\.git|\.env|\.cache)(\/|$)|\.(tgz|log)$/i;

export function collectForbiddenPackedFiles(files) {
  return files.filter((file) => FORBIDDEN_PACKED_FILE_PATTERN.test(file));
}

export function summarizePackResult(result) {
  const files = Array.isArray(result?.files) ? result.files.map((entry) => entry.path).sort() : [];
  return {
    name: result?.name ?? "unknown",
    version: result?.version ?? "unknown",
    filename: result?.filename ?? null,
    files,
    forbidden: collectForbiddenPackedFiles(files)
  };
}

export function collectParserVariantPackageSurfaceFailures({
  parserVariantSchemaExists,
  hasParserVariantReadbackExport,
  uploaderHelpText
}) {
  const failures = [];

  if (!parserVariantSchemaExists) {
    failures.push("schemas package missing parser-variant.schema.json");
  }
  if (!hasParserVariantReadbackExport) {
    failures.push("readback package missing normalizeParserVariantReadback export");
  }
  if (!/\bupload import-plan\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing upload import-plan command");
  }
  if (!/\bupload variant-plan\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing upload variant-plan command");
  }

  return failures;
}

export function collectAgentNativePackageSurfaceFailures({
  agentNativeSchemaExists,
  hasNormalizeAgentNativeReadbackExport,
  uploaderHelpText
}) {
  const failures = [];

  if (!agentNativeSchemaExists) {
    failures.push("schemas package missing agent-native.schema.json");
  }
  if (!hasNormalizeAgentNativeReadbackExport) {
    failures.push("readback package missing normalizeAgentNativeReadback export");
  }
  if (!/\bupload agent-native-plan\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing upload agent-native-plan command");
  }

  return failures;
}

export function collectCatalogDownloadPackageSurfaceFailures({
  hasDownloadResourceArtifactExport,
  hasNormalizeResourceListExport,
  hasNormalizeDownloadMetadataExport,
  uploaderHelpText
}) {
  const failures = [];

  if (!hasDownloadResourceArtifactExport) {
    failures.push("readback package missing downloadResourceArtifact export");
  }
  if (!hasNormalizeResourceListExport) {
    failures.push("readback package missing normalizeResourceList export");
  }
  if (!hasNormalizeDownloadMetadataExport) {
    failures.push("readback package missing normalizeDownloadMetadata export");
  }
  if (!/\bcatalog list\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing catalog list command");
  }
  if (!/\bcatalog get\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing catalog get command");
  }
  if (!/\bcatalog download-metadata\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing catalog download-metadata command");
  }
  if (!/\bdownload <resource-id> --output\b/.test(uploaderHelpText ?? "")) {
    failures.push("uploader help missing direct download command");
  }

  return failures;
}

export function collectPortableProfilePackageSurfaceFailures({
  portableProfileSchemaExists,
  generatedAdapterManifestSchemaExists,
  validatorHelpText
}) {
  const failures = [];

  if (!portableProfileSchemaExists) {
    failures.push("schemas package missing portable-profile.schema.json");
  }
  if (!generatedAdapterManifestSchemaExists) {
    failures.push("schemas package missing generated-adapter-manifest.schema.json");
  }
  if (!/\bportable-generate\b/.test(validatorHelpText ?? "")) {
    failures.push("validator help missing portable-generate command");
  }
  if (!/\bportable-drift\b/.test(validatorHelpText ?? "")) {
    failures.push("validator help missing portable-drift command");
  }
  if (!/\bportable-parity\b/.test(validatorHelpText ?? "")) {
    failures.push("validator help missing portable-parity command");
  }
  if (!/\bdebt-ledger\b/.test(validatorHelpText ?? "")) {
    failures.push("validator help missing debt-ledger command");
  }
  if (!/\bportable-eval\b/.test(validatorHelpText ?? "")) {
    failures.push("validator help missing portable-eval command");
  }

  return failures;
}

export function collectGraphBlockPackageSurfaceFailures({
  graphBlockBundleSchemaExists,
  blockManifestSchemaExists,
  executionLedgerSchemaExists,
  workspaceArtifactSchemaExists,
  apiDriftSchemaExists,
  generatedBlockFixturesManifestSchemaExists,
  validatorHelpText
}) {
  const failures = [];

  if (!graphBlockBundleSchemaExists) {
    failures.push("schemas package missing graph-block-bundle.schema.json");
  }
  if (!blockManifestSchemaExists) {
    failures.push("schemas package missing block-manifest.schema.json");
  }
  if (!executionLedgerSchemaExists) {
    failures.push("schemas package missing execution-ledger.schema.json");
  }
  if (!workspaceArtifactSchemaExists) {
    failures.push("schemas package missing workspace-artifact.schema.json");
  }
  if (!apiDriftSchemaExists) {
    failures.push("schemas package missing api-drift.schema.json");
  }
  if (!generatedBlockFixturesManifestSchemaExists) {
    failures.push("schemas package missing generated-block-fixtures-manifest.schema.json");
  }
  for (const command of [
    "bundle-validate",
    "bundle-import-plan",
    "bundle-export-plan",
    "block-fixtures-generate",
    "ledger-inspect",
    "ledger-replay-diagnostics",
    "artifact-scan",
    "api-drift"
  ]) {
    if (!new RegExp(`\\b${command}\\b`).test(validatorHelpText ?? "")) {
      failures.push(`validator help missing ${command} command`);
    }
  }

  return failures;
}

export function collectUploadPreparationPackageSurfaceFailures({
  uploadCandidateGateSchemaExists,
  skillSourcePackageSchemaExists,
  rolePluginPackSchemaExists,
  sourceNoGoSchemaExists,
  staticPackageDryRunSchemaExists,
  validatorHelpText
}) {
  const failures = [];

  if (!uploadCandidateGateSchemaExists) {
    failures.push("schemas package missing upload-candidate-gate.schema.json");
  }
  if (!skillSourcePackageSchemaExists) {
    failures.push("schemas package missing skill-source-package.schema.json");
  }
  if (!rolePluginPackSchemaExists) {
    failures.push("schemas package missing role-plugin-pack.schema.json");
  }
  if (!sourceNoGoSchemaExists) {
    failures.push("schemas package missing source-no-go.schema.json");
  }
  if (!staticPackageDryRunSchemaExists) {
    failures.push("schemas package missing static-package-dry-run.schema.json");
  }
  for (const command of ["upload-candidate", "package-dry-run", "source-no-go"]) {
    if (!new RegExp(`\\b${command}\\b`).test(validatorHelpText ?? "")) {
      failures.push(`validator help missing ${command} command`);
    }
  }

  return failures;
}

export function packPackage(packagePath, tarballDir, { npmCli = process.env.npm_execpath } = {}) {
  if (!npmCli) {
    throw new Error("npm_execpath is unavailable; run through npm run install:smoke");
  }

  const output = execFileSync(
    process.execPath,
    [npmCli, "pack", "--json", "--ignore-scripts", "--pack-destination", tarballDir],
    {
      cwd: packagePath,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
  const summary = summarizePackResult(JSON.parse(output)[0]);
  if (!summary.filename) {
    throw new Error(`${packagePath}: npm pack did not return a tarball filename`);
  }
  if (summary.forbidden.length > 0) {
    throw new Error(`${packagePath}: forbidden packed files: ${summary.forbidden.join(", ")}`);
  }
  return {
    ...summary,
    tarballPath: path.join(tarballDir, summary.filename)
  };
}

export function installTarballs(consumerDir, tarballPaths, { npmCli = process.env.npm_execpath } = {}) {
  if (!npmCli) {
    throw new Error("npm_execpath is unavailable; run through npm run install:smoke");
  }

  execFileSync(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--save=false",
      ...tarballPaths
    ],
    {
      cwd: consumerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

export function installRegistryPackages(consumerDir, packageSpecs, { npmCli = process.env.npm_execpath } = {}) {
  if (!npmCli) {
    throw new Error("npm_execpath is unavailable; run through npm run install:smoke");
  }

  execFileSync(
    process.execPath,
    [
      npmCli,
      "install",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--save=false",
      ...packageSpecs
    ],
    {
      cwd: consumerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    }
  );
}

export function runInstalledSmoke(consumerDir) {
  const schemasFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "resource-manifest.schema.json"
  );
  if (!existsSync(schemasFile)) {
    throw new Error("schemas package smoke failed");
  }

  const parserVariantSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "parser-variant.schema.json"
  );
  const agentNativeSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "agent-native.schema.json"
  );
  const portableProfileSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "portable-profile.schema.json"
  );
  const generatedAdapterManifestSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "generated-adapter-manifest.schema.json"
  );
  const graphBlockBundleSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "graph-block-bundle.schema.json"
  );
  const blockManifestSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "block-manifest.schema.json"
  );
  const executionLedgerSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "execution-ledger.schema.json"
  );
  const workspaceArtifactSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "workspace-artifact.schema.json"
  );
  const apiDriftSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "api-drift.schema.json"
  );
  const generatedBlockFixturesManifestSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "generated-block-fixtures-manifest.schema.json"
  );
  const uploadCandidateGateSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "upload-candidate-gate.schema.json"
  );
  const skillSourcePackageSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "skill-source-package.schema.json"
  );
  const rolePluginPackSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "role-plugin-pack.schema.json"
  );
  const sourceNoGoSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "source-no-go.schema.json"
  );
  const staticPackageDryRunSchemaFile = path.join(
    consumerDir,
    "node_modules",
    "@agentique.io",
    "schemas",
    "static-package-dry-run.schema.json"
  );
  const actionModule = pathToFileURL(
    path.join(consumerDir, "node_modules", "@agentique.io", "action", "src", "action.mjs")
  ).href;
  const uploaderCli = path.join(consumerDir, "node_modules", "@agentique.io", "uploader", "src", "cli.mjs");
  const validatorCli = path.join(consumerDir, "node_modules", "@agentique.io", "validator", "src", "cli.mjs");
  const readbackExports = readInstalledReadbackExportStatus(consumerDir);

  if (!readbackExports.createReadbackClient) {
    throw new Error("readback package smoke failed");
  }
  execFileSync(process.execPath, ["-e", `import(${JSON.stringify(actionModule)}).then((m)=>{if(!m.runAction)process.exit(1)})`], {
    cwd: consumerDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  execFileSync(process.execPath, [uploaderCli, "--version"], {
    cwd: consumerDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
  const uploaderHelpText = execFileSync(process.execPath, [uploaderCli, "--help"], {
    cwd: consumerDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });

  const parserVariantFailures = collectParserVariantPackageSurfaceFailures({
    parserVariantSchemaExists: existsSync(parserVariantSchemaFile),
    hasParserVariantReadbackExport: readbackExports.normalizeParserVariantReadback,
    uploaderHelpText
  });
  if (parserVariantFailures.length > 0) {
    throw new Error(`parser/variant package smoke failed: ${parserVariantFailures.join("; ")}`);
  }

  const agentNativeFailures = collectAgentNativePackageSurfaceFailures({
    agentNativeSchemaExists: existsSync(agentNativeSchemaFile),
    hasNormalizeAgentNativeReadbackExport: readbackExports.normalizeAgentNativeReadback,
    uploaderHelpText
  });
  if (agentNativeFailures.length > 0) {
    throw new Error(`agent-native package smoke failed: ${agentNativeFailures.join("; ")}`);
  }

  const catalogDownloadFailures = collectCatalogDownloadPackageSurfaceFailures({
    hasDownloadResourceArtifactExport: readbackExports.downloadResourceArtifact,
    hasNormalizeResourceListExport: readbackExports.normalizeResourceList,
    hasNormalizeDownloadMetadataExport: readbackExports.normalizeDownloadMetadata,
    uploaderHelpText
  });
  if (catalogDownloadFailures.length > 0) {
    throw new Error(`catalog/download package smoke failed: ${catalogDownloadFailures.join("; ")}`);
  }

  try {
    execFileSync(process.execPath, [validatorCli], {
      cwd: consumerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    throw new Error("validator CLI smoke unexpectedly succeeded without arguments");
  } catch (error) {
    if (error.status !== 2 || !/agentique-validator validate/.test(error.stderr ?? "")) {
      throw error;
    }
  }

  let validatorHelpText = "";
  try {
    execFileSync(process.execPath, [validatorCli], {
      cwd: consumerDir,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
  } catch (error) {
    validatorHelpText = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
  }
  const portableProfileFailures = collectPortableProfilePackageSurfaceFailures({
    portableProfileSchemaExists: existsSync(portableProfileSchemaFile),
    generatedAdapterManifestSchemaExists: existsSync(generatedAdapterManifestSchemaFile),
    validatorHelpText
  });
  if (portableProfileFailures.length > 0) {
    throw new Error(`portable profile package smoke failed: ${portableProfileFailures.join("; ")}`);
  }

  const graphBlockFailures = collectGraphBlockPackageSurfaceFailures({
    graphBlockBundleSchemaExists: existsSync(graphBlockBundleSchemaFile),
    blockManifestSchemaExists: existsSync(blockManifestSchemaFile),
    executionLedgerSchemaExists: existsSync(executionLedgerSchemaFile),
    workspaceArtifactSchemaExists: existsSync(workspaceArtifactSchemaFile),
    apiDriftSchemaExists: existsSync(apiDriftSchemaFile),
    generatedBlockFixturesManifestSchemaExists: existsSync(generatedBlockFixturesManifestSchemaFile),
    validatorHelpText
  });
  if (graphBlockFailures.length > 0) {
    throw new Error(`graph/block package smoke failed: ${graphBlockFailures.join("; ")}`);
  }

  const uploadPreparationFailures = collectUploadPreparationPackageSurfaceFailures({
    uploadCandidateGateSchemaExists: existsSync(uploadCandidateGateSchemaFile),
    skillSourcePackageSchemaExists: existsSync(skillSourcePackageSchemaFile),
    rolePluginPackSchemaExists: existsSync(rolePluginPackSchemaFile),
    sourceNoGoSchemaExists: existsSync(sourceNoGoSchemaFile),
    staticPackageDryRunSchemaExists: existsSync(staticPackageDryRunSchemaFile),
    validatorHelpText
  });
  if (uploadPreparationFailures.length > 0) {
    throw new Error(`upload-preparation package smoke failed: ${uploadPreparationFailures.join("; ")}`);
  }
}

function readInstalledReadbackExportStatus(consumerDir) {
  try {
    const output = execFileSync(
      process.execPath,
      [
        "-e",
        [
          "import('@agentique.io/readback').then((m)=>{",
          "const names=['createReadbackClient','normalizeParserVariantReadback','normalizeAgentNativeReadback','downloadResourceArtifact','normalizeResourceList','normalizeDownloadMetadata'];",
          "console.log(JSON.stringify(Object.fromEntries(names.map((name)=>[name, typeof m[name] === 'function']))));",
          "})"
        ].join("")
      ],
      {
        cwd: consumerDir,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      }
    );
    return JSON.parse(output);
  } catch {
    return {
      createReadbackClient: false,
      normalizeParserVariantReadback: false,
      normalizeAgentNativeReadback: false,
      downloadResourceArtifact: false,
      normalizeResourceList: false,
      normalizeDownloadMetadata: false
    };
  }
}

export async function main() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "agentique-install-smoke-"));
  const consumerDir = path.join(tempRoot, "consumer");
  const mode = process.env.AGENTIQUE_INSTALL_SMOKE_MODE ?? "local";

  try {
    mkdirSync(consumerDir, { recursive: true });
    writeFileSync(path.join(consumerDir, "package.json"), JSON.stringify({ private: true, type: "module" }), "utf8");

    if (mode === "local") {
      const tarballDir = path.join(tempRoot, "tarballs");
      mkdirSync(tarballDir, { recursive: true });
      const packed = [];
      for (const packagePath of PACKAGE_PATHS) {
        const summary = packPackage(packagePath, tarballDir);
        packed.push(summary);
        console.log(`PASS pack ${packagePath}: ${summary.name}@${summary.version} (${summary.files.length} files)`);
      }
      installTarballs(consumerDir, packed.map((item) => item.tarballPath));
    } else if (mode === "registry") {
      const version = process.env.AGENTIQUE_PACKAGE_VERSION ?? readRootPackageVersion();
      const packageSpecs = PACKAGE_NAMES.map((name) => `${name}@${version}`);
      installRegistryPackages(consumerDir, packageSpecs);
      for (const spec of packageSpecs) {
        console.log(`PASS registry install ${spec}`);
      }
    } else {
      throw new Error(`Unsupported AGENTIQUE_INSTALL_SMOKE_MODE: ${mode}`);
    }

    runInstalledSmoke(consumerDir);
    console.log(
      mode === "registry"
        ? "PASS install smoke: registry packages install with lifecycle scripts disabled"
        : "PASS install smoke: tarballs install with lifecycle scripts disabled"
    );
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

function readRootPackageVersion() {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  if (typeof rootPackage.version !== "string" || !rootPackage.version.trim()) {
    throw new Error("package.json is missing a version");
  }
  return rootPackage.version;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main().catch((error) => {
    console.error("Package install smoke failed:");
    console.error(`- ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
