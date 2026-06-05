import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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

  const actionModule = pathToFileURL(
    path.join(consumerDir, "node_modules", "@agentique.io", "action", "src", "action.mjs")
  ).href;
  const uploaderCli = path.join(consumerDir, "node_modules", "@agentique.io", "uploader", "src", "cli.mjs");
  const validatorCli = path.join(consumerDir, "node_modules", "@agentique.io", "validator", "src", "cli.mjs");

  execFileSync(process.execPath, ["-e", "import('@agentique.io/readback').then((m)=>{if(!m.createReadbackClient)process.exit(1)})"], {
    cwd: consumerDir,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"]
  });
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
}

export async function main() {
  const tempRoot = mkdtempSync(path.join(os.tmpdir(), "agentique-install-smoke-"));
  const tarballDir = path.join(tempRoot, "tarballs");
  const consumerDir = path.join(tempRoot, "consumer");

  try {
    mkdirSync(tarballDir, { recursive: true });
    mkdirSync(consumerDir, { recursive: true });
    const packed = [];
    for (const packagePath of PACKAGE_PATHS) {
      const summary = packPackage(packagePath, tarballDir);
      packed.push(summary);
      console.log(`PASS pack ${packagePath}: ${summary.name}@${summary.version} (${summary.files.length} files)`);
    }

    writeFileSync(path.join(consumerDir, "package.json"), JSON.stringify({ private: true, type: "module" }), "utf8");
    installTarballs(consumerDir, packed.map((item) => item.tarballPath));
    runInstalledSmoke(consumerDir);
    console.log("PASS install smoke: tarballs install with lifecycle scripts disabled");
  } finally {
    rmSync(tempRoot, { recursive: true, force: true });
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main().catch((error) => {
    console.error("Package install smoke failed:");
    console.error(`- ${error instanceof Error ? error.message : "unknown error"}`);
    process.exitCode = 1;
  });
}
