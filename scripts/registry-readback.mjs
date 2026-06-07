import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { pathToFileURL } from "node:url";

export const PACKAGE_NAMES = Object.freeze([
  "@agentique.io/schemas",
  "@agentique.io/validator",
  "@agentique.io/action",
  "@agentique.io/readback",
  "@agentique.io/uploader"
]);

export const REGISTRY_EXPECTATIONS = Object.freeze(buildRegistryExpectations());

export function buildRegistryExpectations({
  mode = process.env.AGENTIQUE_REGISTRY_MODE ?? "auto",
  targetVersion = process.env.AGENTIQUE_PACKAGE_VERSION ?? null,
  decisionPath = "docs/release-go-no-go.json"
} = {}) {
  const publicationState = readPublicationState(decisionPath);

  if (mode === "auto") {
    return PACKAGE_NAMES.map((name) => {
      const pendingVersion = stringOrNull(publicationState.pendingPackages?.[name]);
      if (pendingVersion) {
        return { name, version: pendingVersion, state: "pending_not_found" };
      }

      return {
        name,
        version: requireVersion(publicationState.publishedPackages?.[name], name),
        state: "published"
      };
    });
  }

  if (mode === "prepublish" || mode === "published") {
    const version = targetVersion ?? readRootPackageVersion();
    const state = mode === "prepublish" ? "pending_not_found" : "published";
    return PACKAGE_NAMES.map((name) => ({ name, version, state }));
  }

  throw new Error(`Unsupported AGENTIQUE_REGISTRY_MODE: ${mode}`);
}

export function evaluateRegistryReadback(actual, expectation) {
  const expectedState = expectation.state;

  if (expectedState === "published") {
    if (actual.status !== "published") {
      return `${expectation.name}: expected published ${expectation.version}, got ${actual.status}`;
    }
    if (actual.version !== expectation.version) {
      return `${expectation.name}: expected version ${expectation.version}, got ${actual.version}`;
    }
    return null;
  }

  if (expectedState === "pending_not_found") {
    return actual.status === "not_found"
      ? null
      : `${expectation.name}@${expectation.version}: expected pending not-found state, got ${actual.status}`;
  }

  return `${expectation.name}: unsupported expected registry state ${expectedState}`;
}

export function readRegistryVersion(packageName, { npmCli = process.env.npm_execpath, version = null } = {}) {
  if (!npmCli) {
    return { status: "unavailable", version: null };
  }

  const packageSpec = version ? `${packageName}@${version}` : packageName;

  try {
    const output = execFileSync(process.execPath, [npmCli, "view", packageSpec, "version", "--json"], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"]
    });
    const parsed = JSON.parse(output);
    return typeof parsed === "string"
      ? { status: "published", version: parsed }
      : { status: "unavailable", version: null };
  } catch (error) {
    const text = `${error.stdout ?? ""}\n${error.stderr ?? ""}`;
    if (/E404|not found/i.test(text)) {
      return { status: "not_found", version: null };
    }
    return { status: "unavailable", version: null };
  }
}

function readPublicationState(decisionPath) {
  if (!existsSync(decisionPath)) {
    return { publishedPackages: {}, pendingPackages: {} };
  }

  const decision = JSON.parse(readFileSync(decisionPath, "utf8"));
  return {
    publishedPackages: decision.packagePublicationState?.publishedPackages ?? {},
    pendingPackages: decision.packagePublicationState?.pendingPackages ?? {}
  };
}

function readRootPackageVersion() {
  const rootPackage = JSON.parse(readFileSync("package.json", "utf8"));
  return requireVersion(rootPackage.version, "package.json");
}

function requireVersion(value, label) {
  const version = stringOrNull(value);
  if (!version) {
    throw new Error(`Missing registry version for ${label}`);
  }
  return version;
}

function stringOrNull(value) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export async function main() {
  const failures = [];

  for (const expectation of REGISTRY_EXPECTATIONS) {
    const actual = readRegistryVersion(expectation.name, { version: expectation.version });
    const failure = evaluateRegistryReadback(actual, expectation);
    if (failure) {
      failures.push(failure);
      continue;
    }

    if (actual.status === "published") {
      console.log(`PASS ${expectation.name}: published ${actual.version}`);
    } else {
      console.log(`PASS ${expectation.name}: pending not found`);
    }
  }

  if (failures.length > 0) {
    console.error("Registry readback failed:");
    for (const failure of failures) {
      console.error(`- ${failure}`);
    }
    process.exitCode = 1;
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  await main();
}
