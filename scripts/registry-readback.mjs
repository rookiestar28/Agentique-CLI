import { execFileSync } from "node:child_process";
import { pathToFileURL } from "node:url";

export const REGISTRY_EXPECTATIONS = Object.freeze([
  { name: "@agentique.io/schemas", version: "0.1.0", state: "published" },
  { name: "@agentique.io/validator", version: "0.1.0", state: "published" },
  { name: "@agentique.io/action", version: "0.1.0", state: "published" },
  { name: "@agentique.io/readback", version: "0.1.0", state: "published" },
  { name: "@agentique.io/uploader", version: "0.1.0", state: "published" }
]);

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
    return actual.status === "not_found" ? null : `${expectation.name}: expected pending not-found state, got ${actual.status}`;
  }

  return `${expectation.name}: unsupported expected registry state ${expectedState}`;
}

export function readRegistryVersion(packageName, { npmCli = process.env.npm_execpath } = {}) {
  if (!npmCli) {
    return { status: "unavailable", version: null };
  }

  try {
    const output = execFileSync(process.execPath, [npmCli, "view", packageName, "version", "--json"], {
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

export async function main() {
  const failures = [];

  for (const expectation of REGISTRY_EXPECTATIONS) {
    const actual = readRegistryVersion(expectation.name);
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
