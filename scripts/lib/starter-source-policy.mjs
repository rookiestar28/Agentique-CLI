import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

const PLACEHOLDER_HOSTS = new Set(["example.com", "www.example.com"]);
const PLACEHOLDER_GITHUB_OWNERS = new Set(["agentique-examples"]);

export function collectStarterSourceUrlFindings({ repoRoot, inventory, requirePublicUrls = false }) {
  const findings = [];
  const startersDir = join(repoRoot, "starters");
  const releaseReady = inventory?.releaseBlocked !== true || requirePublicUrls;

  if (!existsSync(startersDir)) {
    return findings;
  }

  for (const starterName of listStarterNames(startersDir)) {
    const manifestPath = join(startersDir, starterName, "manifest.json");
    let manifest;

    try {
      manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
    } catch {
      findings.push(`starter ${starterName}: manifest.json must be readable JSON`);
      continue;
    }

    const sourceUrl = manifest?.source?.url;
    if (typeof sourceUrl !== "string" || sourceUrl.trim() === "") {
      findings.push(`starter ${starterName}: source.url is required`);
      continue;
    }

    let parsed;
    try {
      parsed = new URL(sourceUrl);
    } catch {
      findings.push(`starter ${starterName}: source.url must be a valid URL`);
      continue;
    }

    if (parsed.protocol !== "https:") {
      findings.push(`starter ${starterName}: source.url must use HTTPS`);
    }

    if (releaseReady && isPlaceholderSourceUrl(parsed)) {
      findings.push(
        `starter ${starterName}: unresolved placeholder source URL is not allowed for release-ready checks`
      );
    }
  }

  return findings;
}

export function isPlaceholderSourceUrl(url) {
  const parsed = typeof url === "string" ? new URL(url) : url;
  const hostname = parsed.hostname.toLowerCase();

  if (PLACEHOLDER_HOSTS.has(hostname) || hostname.endsWith(".example.com")) {
    return true;
  }

  if (hostname === "github.com") {
    const owner = parsed.pathname.split("/").filter(Boolean)[0]?.toLowerCase();
    return PLACEHOLDER_GITHUB_OWNERS.has(owner);
  }

  return false;
}

function listStarterNames(startersDir) {
  return readdirSync(startersDir, { withFileTypes: true })
    .filter((entry) => entry.isDirectory())
    .map((entry) => entry.name)
    .sort();
}
