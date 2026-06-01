import { execFileSync } from "node:child_process";
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, resolve, sep } from "node:path";
import { collectStarterSourceUrlFindings } from "./lib/starter-source-policy.mjs";
import { collectSurfacingContractFixtureFindings } from "./lib/surfacing-contract-fixtures.mjs";
import { collectWorkflowPostureFindings } from "./lib/workflow-posture.mjs";

const root = resolve(process.argv[2] ?? process.cwd());
const manifestPath = join(root, "release-manifest.json");
const publicUrlInventoryPath = join(root, "docs", "public-url-inventory.json");
const requirePublicUrls = process.env.AGENTIQUE_REQUIRE_PUBLIC_URLS === "1";
const requiredFiles = [
  "release-manifest.json",
  "scripts/release-check.mjs",
  "docs/release-checklist.md",
  "docs/contract-evaluation-fixtures.md",
  "scripts/fixtures/surfacing-contract-matrix/matrix.json",
  ".github/workflows/release-check.yml"
];

const requiredChecks = ["public-content-scan", "secret-scan", "manual-review"];

const denyPatterns = buildDenyPatterns();

function main() {
  const manifest = readJson(manifestPath);
  const publicUrlInventory = readJson(publicUrlInventoryPath);
  const files = listTrackedFiles(root);
  const failures = [];

  for (const requiredFile of requiredFiles) {
    if (!existsSync(join(root, requiredFile))) {
      failures.push(`missing required release file: ${requiredFile}`);
    }
  }

  for (const check of requiredChecks) {
    if (!manifest.requiredChecks?.includes(check)) {
      failures.push(`release manifest missing required check: ${check}`);
    }
  }

  for (const file of files) {
    if (!isAllowed(file, manifest.allowedPathPrefixes ?? [])) {
      failures.push(`tracked file is outside release allowlist: ${file}`);
    }
  }

  failures.push(...scanPublicContent(root, files));
  failures.push(...collectWorkflowPostureFindings(root));
  failures.push(...collectSurfacingContractFixtureFindings(root));
  failures.push(...runExternalIntakeSmoke(root));
  failures.push(
    ...collectStarterSourceUrlFindings({
      repoRoot: root,
      inventory: publicUrlInventory,
      requirePublicUrls
    })
  );

  if (failures.length > 0) {
    console.error("Release check failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
    return;
  }

  console.log(`Release check passed for ${manifest.name ?? "companion repository"}.`);
}

function readJson(path) {
  return JSON.parse(readFileSync(path, "utf8"));
}

function listTrackedFiles(repoRoot) {
  try {
    const output = execFileSync("git", ["-C", repoRoot, "ls-files", "--cached", "--others", "--exclude-standard"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return output.split(/\r?\n/).filter(Boolean).sort();
  } catch {
    return walk(repoRoot)
      .map((filePath) => toPosix(relative(repoRoot, filePath)))
      .sort();
  }
}

function walk(directory) {
  const entries = [];
  for (const entry of readdirSync(directory)) {
    if (entry === ".git" || entry === "node_modules") {
      continue;
    }

    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      entries.push(...walk(fullPath));
    } else {
      entries.push(fullPath);
    }
  }
  return entries;
}

function isAllowed(file, allowedPathPrefixes) {
  return allowedPathPrefixes.some((prefix) => {
    if (prefix.endsWith("/")) {
      return file.startsWith(prefix);
    }
    return file === prefix;
  });
}

function scanPublicContent(repoRoot, files) {
  const failures = [];

  for (const file of files) {
    const absolutePath = join(repoRoot, file.split("/").join(sep));
    const content = readTextFileIfSafe(absolutePath);
    if (content === null) {
      continue;
    }

    for (const pattern of denyPatterns) {
      if (pattern.test(content)) {
        failures.push(`public-content scan matched ${pattern.source} in ${file}`);
      }
    }
  }

  return failures;
}

function runExternalIntakeSmoke(repoRoot) {
  const validatorScript = join(repoRoot, "packages", "validator", "src", "cli.mjs");
  const fixtureDir = join(repoRoot, "scripts", "fixtures", "external-intake-safe");
  try {
    const output = execFileSync(process.execPath, [validatorScript, "external-intake", fixtureDir, "--json"], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const report = JSON.parse(output);
    if (report.schemaVersion !== "agentique.externalIntake.v1") {
      return ["external-intake smoke check returned unexpected schema version"];
    }
    if (report.decision !== "passed") {
      return ["external-intake smoke check did not pass"];
    }
    if (!Array.isArray(report.licenses) || !report.licenses.some((item) => item.normalized === "MIT")) {
      return ["external-intake smoke check did not report the fixture license"];
    }
    return [];
  } catch (error) {
    const message = error instanceof Error ? error.message : "unknown error";
    return [`external-intake smoke check failed: ${message}`];
  }
}

function readTextFileIfSafe(path) {
  const stats = statSync(path);
  if (stats.size > 1024 * 1024) {
    return null;
  }
  const bytes = readFileSync(path);
  if (bytes.includes(0)) {
    return null;
  }
  return bytes.toString("utf8");
}

function buildDenyPatterns() {
  const dotNames = ["planning", "sessions"].map((name) => `\\.${name}`);
  const slash = "/";
  const referenceDocs = ["reference", "docs"].join(slash);
  const upperReference = ["REFERENCE", ""].join(slash);
  const localDrive = "B:" + "\\\\";
  const splitTerms = [
    ["deployment", "evidence"],
    ["scanner", "thresholds?"],
    ["operator", "workflows?"],
    ["certified", "safe"],
    ["approved by local", "validator"],
    ["platform approved by", "validator"],
    ["local validation is platform", "approval"],
    ["local checks are platform", "approval"],
    ["local validation is safety", "certification"],
    ["local checks are safety", "certification"]
  ];

  return [
    ...dotNames.map((term) => new RegExp(term, "i")),
    new RegExp(escapeRegExp(referenceDocs), "i"),
    new RegExp(escapeRegExp(upperReference), "i"),
    new RegExp(escapeRegExp(localDrive), "i"),
    /(?:^|[^A-Za-z0-9])OSS[0-9]{3}(?:[^A-Za-z0-9]|$)/,
    /(?:^|[^A-Za-z0-9])R[0-9]{3,4}(?:[^A-Za-z0-9]|$)/,
    ...splitTerms.map((parts) => new RegExp(parts.join(" "), "i"))
  ];
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosix(path) {
  return path.split(sep).join("/");
}

main();
