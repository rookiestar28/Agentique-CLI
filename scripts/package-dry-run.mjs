import { execFileSync } from "node:child_process";

const npmCli = process.env.npm_execpath;
const packages = [
  "schemas",
  "packages/validator",
  "packages/action",
  "packages/readback",
  "packages/uploader"
];

const failures = [];

if (!npmCli) {
  console.error("Package dry-run check failed:");
  console.error("- npm_execpath is unavailable; run through npm run pack:dry-run");
  process.exitCode = 1;
} else {
  for (const packagePath of packages) {
    try {
      const output = execFileSync(process.execPath, [npmCli, "pack", "--dry-run", "--json"], {
        cwd: packagePath,
        encoding: "utf8",
        stdio: ["ignore", "pipe", "pipe"]
      });
      const result = JSON.parse(output)[0];
      const files = Array.isArray(result?.files) ? result.files.map((entry) => entry.path).sort() : [];
      const forbidden = files.filter((file) =>
        /(^|\/)(node_modules|coverage|\.git|\.env|\.cache)(\/|$)|\.(tgz|log)$/i.test(file)
      );

      if (forbidden.length > 0) {
        failures.push(`${packagePath}: forbidden packed files: ${forbidden.join(", ")}`);
        continue;
      }

      console.log(`PASS ${packagePath}: ${result.name}@${result.version} (${files.length} files)`);
    } catch (error) {
      failures.push(`${packagePath}: ${error instanceof Error ? error.message : "dry-run failed"}`);
    }
  }

  if (failures.length > 0) {
    console.error("Package dry-run check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}
