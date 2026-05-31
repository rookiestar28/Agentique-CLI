import assert from "node:assert/strict";
import { mkdir, mkdtemp, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import {
  collectStarterSourceUrlFindings,
  isPlaceholderSourceUrl
} from "../lib/starter-source-policy.mjs";

test("allows placeholder starter source URLs while release is blocked", async () => {
  const repoRoot = await createRepoWithStarter("https://github.com/agentique-examples/example-starter");
  const findings = collectStarterSourceUrlFindings({
    repoRoot,
    inventory: { releaseBlocked: true },
    requirePublicUrls: false
  });

  assert.deepEqual(findings, []);
});

test("blocks placeholder starter source URLs for release-ready checks", async () => {
  const repoRoot = await createRepoWithStarter("https://github.com/agentique-examples/example-starter");
  const findings = collectStarterSourceUrlFindings({
    repoRoot,
    inventory: { releaseBlocked: false },
    requirePublicUrls: false
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /unresolved placeholder source URL/);
});

test("require-public-urls mode blocks placeholders even when release remains blocked", async () => {
  const repoRoot = await createRepoWithStarter("https://example.com/agentique-tool-listing");
  const findings = collectStarterSourceUrlFindings({
    repoRoot,
    inventory: { releaseBlocked: true },
    requirePublicUrls: true
  });

  assert.equal(findings.length, 1);
  assert.match(findings[0], /unresolved placeholder source URL/);
});

test("accepts final HTTPS starter source URLs for release-ready checks", async () => {
  const repoRoot = await createRepoWithStarter("https://github.com/agentique/starter-example");
  const findings = collectStarterSourceUrlFindings({
    repoRoot,
    inventory: { releaseBlocked: false },
    requirePublicUrls: false
  });

  assert.deepEqual(findings, []);
});

test("detects placeholder source URL families", () => {
  assert.equal(isPlaceholderSourceUrl("https://example.com/agentique-tool-listing"), true);
  assert.equal(isPlaceholderSourceUrl("https://docs.example.com/agentique-tool-listing"), true);
  assert.equal(isPlaceholderSourceUrl("https://github.com/agentique-examples/example-starter"), true);
  assert.equal(isPlaceholderSourceUrl("https://github.com/agentique/starter-example"), false);
});

async function createRepoWithStarter(sourceUrl) {
  const repoRoot = await mkdtemp(path.join(os.tmpdir(), "agentique-starter-policy-"));
  const starterDir = path.join(repoRoot, "starters", "example-starter");
  await mkdir(starterDir, { recursive: true });
  await writeFile(
    path.join(starterDir, "manifest.json"),
    `${JSON.stringify(
      {
        formatVersion: "1.0",
        name: "example-starter",
        summary: "A static starter manifest used by policy tests.",
        source: {
          type: "git",
          url: sourceUrl
        },
        distribution: {
          mode: "package_download",
          notes: "Prepared for platform upload review before publication."
        },
        package: {
          formatVersion: "1.0",
          files: ["README.md"],
          hashes: {
            "README.md": "sha256:0000000000000000000000000000000000000000000000000000000000000000"
          }
        }
      },
      null,
      2
    )}\n`,
    "utf8"
  );
  return repoRoot;
}
