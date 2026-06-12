import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

const TRUSTED_PUBLISH_PACKAGE_DIRS = Object.freeze([
  "schemas",
  "packages/validator",
  "packages/action",
  "packages/readback",
  "packages/uploader"
]);

export function collectWorkflowPostureFindings(repoRoot) {
  const failures = [];
  const workflowFiles = listWorkflowFiles(join(repoRoot, ".github", "workflows"));

  for (const workflowFile of workflowFiles) {
    const relativePath = toPosix(relative(repoRoot, workflowFile));
    const content = stripYamlComments(readFileSync(workflowFile, "utf8"));

    if (/pull_request_target\s*:/i.test(content)) {
      failures.push(`workflow uses privileged pull request trigger: ${relativePath}`);
    }
    if (/secrets\./i.test(content)) {
      failures.push(`workflow references repository secrets: ${relativePath}`);
    }
    if (/\bnpm\s+publish\b/i.test(content) && !isTrustedPublishWorkflow(relativePath, content)) {
      failures.push(`workflow publishes packages during release check: ${relativePath}`);
    }
    if (relativePath === "github/workflows/publish-packages.yml" || relativePath === ".github/workflows/publish-packages.yml") {
      failures.push(...collectTrustedPublishWorkflowFindings(content, relativePath));
    }
    failures.push(...collectNpmInstallPostureFindings(content, relativePath));
    failures.push(...collectSecretScannerInstallFindings(repoRoot, content, relativePath));
    if (!hasReadOnlyContentsPermission(content)) {
      failures.push(`workflow must declare read-only contents permission: ${relativePath}`);
    }
  }

  return failures;
}

export function listWorkflowFiles(directory) {
  if (!existsSync(directory)) {
    return [];
  }

  const entries = [];
  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);
    if (stats.isDirectory()) {
      entries.push(...listWorkflowFiles(fullPath));
    } else if (/\.(ya?ml)$/i.test(entry)) {
      entries.push(fullPath);
    }
  }
  return entries.sort();
}

export function stripYamlComments(content) {
  return content
    .split(/\r?\n/)
    .filter((line) => !/^\s*#/.test(line))
    .join("\n");
}

export function hasReadOnlyContentsPermission(content) {
  const lines = content.split(/\r?\n/);
  const permissionsIndex = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (permissionsIndex === -1) {
    return false;
  }

  for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && line.trim() !== "") {
      return false;
    }
    if (/^\s+contents:\s+read\s*$/.test(line)) {
      return true;
    }
  }

  return false;
}

export function hasOidcWritePermission(content) {
  const lines = content.split(/\r?\n/);
  const permissionsIndex = lines.findIndex((line) => /^permissions:\s*$/.test(line));
  if (permissionsIndex === -1) {
    return false;
  }

  for (let index = permissionsIndex + 1; index < lines.length; index += 1) {
    const line = lines[index];
    if (/^\S/.test(line) && line.trim() !== "") {
      return false;
    }
    if (/^\s+id-token:\s+write\s*$/.test(line)) {
      return true;
    }
  }
  return false;
}

function isTrustedPublishWorkflow(relativePath, content) {
  return (
    relativePath === ".github/workflows/publish-packages.yml" &&
    hasWorkflowDispatchOnlyTrigger(content) &&
    hasReadOnlyContentsPermission(content) &&
    hasOidcWritePermission(content) &&
    !/secrets\./i.test(content) &&
    hasExplicitProvenancePublishCommands(content) &&
    hasIsolatedTrustedPublishSteps(content) &&
    !/NPM_CONFIG_PROVENANCE\s*=\s*false|--provenance\s*=?\s*false|provenance\s*=\s*false/i.test(content)
  );
}

function collectTrustedPublishWorkflowFindings(content, relativePath) {
  const failures = [];

  if (!hasWorkflowDispatchOnlyTrigger(content)) {
    failures.push(`trusted publish workflow must be manual-only: ${relativePath}`);
  }
  if (!hasOidcWritePermission(content)) {
    failures.push(`trusted publish workflow must declare id-token write permission: ${relativePath}`);
  }
  if (/secrets\./i.test(content)) {
    failures.push(`trusted publish workflow must not reference repository secrets: ${relativePath}`);
  }
  if (!hasExplicitProvenancePublishCommands(content)) {
    failures.push(`trusted publish workflow must pass explicit provenance for every npm publish command: ${relativePath}`);
  }
  if (!hasIsolatedTrustedPublishSteps(content)) {
    failures.push(`trusted publish workflow must publish packages in isolated steps: ${relativePath}`);
  }
  if (/NPM_CONFIG_PROVENANCE\s*=\s*false|--provenance\s*=?\s*false|provenance\s*=\s*false/i.test(content)) {
    failures.push(`trusted publish workflow must not disable provenance: ${relativePath}`);
  }

  return failures;
}

function hasExplicitProvenancePublishCommands(content) {
  const publishCommands = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*run:\s*/i, "").trim())
    .filter((line) => /\bnpm\s+publish\b/i.test(line));

  return publishCommands.length > 0 && publishCommands.every((line) => /\s--provenance(?:\s|$)/i.test(line));
}

function hasIsolatedTrustedPublishSteps(content) {
  if (/^\s+cd\s+\S+/im.test(content)) {
    return false;
  }

  const publishCommands = content
    .split(/\r?\n/)
    .map((line) => line.replace(/^\s*-\s*run:\s*/i, "").trim())
    .filter((line) => /\bnpm\s+publish\b/i.test(line));
  if (publishCommands.length !== TRUSTED_PUBLISH_PACKAGE_DIRS.length) {
    return false;
  }

  return TRUSTED_PUBLISH_PACKAGE_DIRS.every((directory) => {
    const pattern = new RegExp(
      `working-directory:\\s*["']?${escapeRegExp(directory)}["']?[\\s\\S]{0,200}\\brun:\\s*npm\\s+publish\\b[^\\n]*\\s--provenance(?:\\s|$)`,
      "i"
    );
    return pattern.test(content);
  });
}

function hasWorkflowDispatchOnlyTrigger(content) {
  if (!/\bworkflow_dispatch\s*:/i.test(content)) {
    return false;
  }
  return !/\bpull_request(?:_target)?\s*:|\bpush\s*:/i.test(content);
}

function collectNpmInstallPostureFindings(content, relativePath) {
  const failures = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const command = line.replace(/^\s*-\s*run:\s*/i, "").trim();
    if (!/\bnpm\b/i.test(command)) {
      continue;
    }

    if (/\bnpm(?:\s+--prefix\s+\S+)?\s+install\b/i.test(command) && !/\s--ignore-scripts(?:\s|$)/i.test(command)) {
      failures.push(`workflow uses lifecycle-enabled npm install: ${relativePath}`);
      continue;
    }

    if (/\bnpm(?:\s+--prefix\s+\S+)?\s+ci\b/i.test(command) && !/\s--ignore-scripts(?:\s|$)/i.test(command)) {
      failures.push(`workflow uses npm ci without --ignore-scripts: ${relativePath}`);
    }
  }

  return failures;
}

function collectSecretScannerInstallFindings(repoRoot, content, relativePath) {
  const failures = [];
  const lines = content.split(/\r?\n/);

  for (const line of lines) {
    const command = line.replace(/^\s*-\s*run:\s*/i, "").trim();
    if (!/\bpip\s+install\b/i.test(command)) {
      continue;
    }

    if (/\bdetect-secrets\b/i.test(command)) {
      if (/--upgrade\b/i.test(command) || !/\bdetect-secrets==[^\s]+/i.test(command)) {
        failures.push(`workflow uses unpinned detect-secrets install: ${relativePath}`);
      }
      continue;
    }

    const requirementsPath = extractRequirementPath(command);
    if (!requirementsPath) {
      continue;
    }

    const fullPath = join(repoRoot, requirementsPath);
    if (!existsSync(fullPath)) {
      failures.push(`workflow references missing Python requirements file: ${requirementsPath}`);
      continue;
    }

    const requirements = readFileSync(fullPath, "utf8");
    if (!/^\s*detect-secrets==[^\s#]+/im.test(requirements)) {
      failures.push(`workflow requirements file must pin detect-secrets exactly: ${requirementsPath}`);
    }
  }

  return failures;
}

function extractRequirementPath(command) {
  const tokens = command.split(/\s+/);
  for (let index = 0; index < tokens.length; index += 1) {
    const token = tokens[index];
    if ((token === "--requirement" || token === "-r") && tokens[index + 1]) {
      return tokens[index + 1].replace(/^['"]|['"]$/g, "");
    }
  }
  return null;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function toPosix(path) {
  return path.split(sep).join("/");
}
