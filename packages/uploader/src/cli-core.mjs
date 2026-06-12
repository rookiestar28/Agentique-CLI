import {
  ReadbackError,
  createReadbackClient,
  downloadResourceArtifact,
  normalizeDownloadMetadata,
  normalizeResourceDetail,
  normalizeResourceList
} from "@agentique.io/readback";
import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_VERSION } from "./index.mjs";
import { resolveAuthState } from "./auth.mjs";
import { createGeneratedDraftOutput, createPatchDeltaOutput } from "./draft.mjs";
import { createAgentNativePlan, createImportPlan, createUploadPlan, createVariantPlan } from "./plan.mjs";
import { readUploadStatus, submitReviewOnlyUpload } from "./submit.mjs";

export const EXIT_CODES = Object.freeze({
  success: 0,
  unavailable: 1,
  usage: 2
});

export const USAGE = `Usage:
  agentique --help
  agentique --version
  agentique auth status [--json]
  agentique catalog list [--q <query>] [--type <type>] [--status <status>] [--limit <n>] [--cursor <cursor>] [--api-url <url>] [--json]
  agentique catalog get <resource-id> [--api-url <url>] [--json]
  agentique catalog download-metadata <resource-id> [--api-url <url>] [--json]
  agentique download <resource-id> --output <file-or-dir> [--force] [--max-bytes <n>] [--allow-redirect-origin <origin>] [--api-url <url>] [--json]
  agentique upload plan <package-dir> [--json]
  agentique upload import-plan <package-dir> [--json]
  agentique upload variant-plan <package-dir> [--json]
  agentique upload agent-native-plan <package-dir> [--json]
  agentique upload draft <package-dir> [--draft-kind card|manifest] [--json]
  agentique upload patch <package-dir> [--json]
  agentique upload submit <package-dir> [--json]
  agentique upload status <submission-id> [--json]

Current status:
  Catalog commands are read-only public readback requests. They do not require uploader auth and do not write artifact bytes.
  Download writes artifact bytes only to the explicit output path; it does not install, extract, open, execute, approve, or certify content.
  Import-plan, variant-plan, agent-native-plan, draft, and patch commands are local-only. Submit and status commands create review-only sessions; they do not publish packages automatically.
`;

const COMMANDS = new Set(["auth", "catalog", "download", "upload"]);
const CATALOG_COMMANDS = new Set(["list", "get", "download-metadata"]);
const UPLOAD_COMMANDS = new Set(["plan", "import-plan", "variant-plan", "agent-native-plan", "draft", "patch", "submit", "status"]);

export async function executeUploaderCli(argv, options = {}) {
  const parsed = parseArgs(argv);
  if (parsed.error) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: parsed.error,
        command: parsed.command ?? "unknown"
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json
    });
  }

  if (parsed.help) {
    return formatHelp(parsed.json);
  }

  if (parsed.version) {
    return formatVersion(parsed.json);
  }

  if (parsed.tokens.length === 0) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: "A command is required.",
        command: "unknown"
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  const [scope, action, operand] = parsed.tokens;
  if (!COMMANDS.has(scope)) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.unknown_command",
        message: `Unknown command: ${scope}`,
        command: scope
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  if (scope === "auth") {
    return handleAuthCommand(action, parsed, options);
  }

  if (scope === "catalog") {
    return handleCatalogCommand(action, operand, parsed, options);
  }

  if (scope === "download") {
    return handleDownloadCommand(action, parsed, options);
  }

  return handleUploadCommand(action, operand, parsed, options);
}

export function parseArgs(argv) {
  const tokens = [];
  let json = false;
  let help = false;
  let version = false;
  let token = null;
  let schemasDir = null;
  let apiUrl = null;
  let draftKind = null;
  let q = null;
  let type = null;
  let status = null;
  let limit = null;
  let cursor = null;
  let outputPath = null;
  let force = false;
  let maxBytes = null;
  const allowedRedirectOrigins = [];

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
    } else if (arg === "--token") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--token requires a value."
        };
      }
      token = value;
      index += 1;
    } else if (arg === "--schemas-dir") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--schemas-dir requires a value."
        };
      }
      schemasDir = value;
      index += 1;
    } else if (arg === "--api-url") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--api-url requires a value."
        };
      }
      apiUrl = value;
      index += 1;
    } else if (arg === "--draft-kind") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--draft-kind requires a value."
        };
      }
      if (!["card", "manifest"].includes(value)) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--draft-kind must be card or manifest."
        };
      }
      draftKind = value;
      index += 1;
    } else if (arg === "--q") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--q requires a value."
        };
      }
      q = value;
      index += 1;
    } else if (arg === "--type") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--type requires a value."
        };
      }
      type = value;
      index += 1;
    } else if (arg === "--status") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--status requires a value."
        };
      }
      status = value;
      index += 1;
    } else if (arg === "--limit") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--limit requires a value."
        };
      }
      limit = value;
      index += 1;
    } else if (arg === "--cursor") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--cursor requires a value."
        };
      }
      cursor = value;
      index += 1;
    } else if (arg === "--output" || arg === "-o") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--output requires a value."
        };
      }
      outputPath = value;
      index += 1;
    } else if (arg === "--force") {
      force = true;
    } else if (arg === "--max-bytes") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--max-bytes requires a value."
        };
      }
      maxBytes = value;
      index += 1;
    } else if (arg === "--allow-redirect-origin") {
      const value = argv[index + 1];
      if (!value || value.startsWith("-")) {
        return {
          json: json || argv.includes("--json"),
          command: tokens.join(" ") || "unknown",
          error: "--allow-redirect-origin requires a value."
        };
      }
      allowedRedirectOrigins.push(value);
      index += 1;
    } else if (arg.startsWith("-")) {
      return {
        json: json || argv.includes("--json"),
        command: tokens.join(" ") || "unknown",
        error: `Unknown option: ${arg}`
      };
    } else {
      tokens.push(arg);
    }
  }

  return {
    json,
    help,
    version,
    token,
    schemasDir,
    apiUrl,
    draftKind,
    q,
    type,
    status,
    limit,
    cursor,
    outputPath,
    force,
    maxBytes,
    allowedRedirectOrigins,
    tokens
  };
}

function handleAuthCommand(action, parsed, options) {
  if (action !== "status" || parsed.tokens.length !== 2) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: "Expected command: auth status",
        command: "auth"
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  const auth = resolveAuthState({
    tokenOption: parsed.token,
    env: options.env,
    readFile: options.readFile
  });

  return formatResult({
    result: createResult({
      ok: auth.ok,
      code: auth.code,
      message: authMessage(auth),
      command: "auth status",
      data: {
        configured: auth.configured,
        source: auth.source,
        redacted: auth.redacted,
        ...(auth.tokenFingerprint ? { tokenFingerprint: auth.tokenFingerprint } : {})
      }
    }),
    exitCode: auth.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
    json: parsed.json
  });
}

function authMessage(auth) {
  if (auth.ok) {
    return "Uploader auth is configured.";
  }
  if (auth.code === "auth.config_error") {
    return "Uploader auth config could not be read.";
  }
  if (auth.code === "auth.invalid_token") {
    return "Uploader auth token is invalid.";
  }
  if (auth.code === "auth.wrong_surface_credential") {
    return "Uploader auth must use a scoped CLI token.";
  }
  return "Uploader auth is not configured.";
}

async function handleCatalogCommand(action, operand, parsed, options) {
  if (!CATALOG_COMMANDS.has(action)) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: "Expected catalog command: list, get, or download-metadata",
        command: "catalog"
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  if (action === "list" && parsed.tokens.length !== 2) {
    return catalogUsageError(action, parsed.json, "Expected command: catalog list");
  }

  if (action !== "list" && parsed.tokens.length !== 3) {
    return catalogUsageError(action, parsed.json, `Expected one resource id for catalog ${action}.`);
  }

  try {
    const client = createReadbackClient({
      baseUrl: parsed.apiUrl ?? undefined,
      fetchImpl: options.fetchImpl
    });

    if (action === "list") {
      const list = normalizeResourceList(
        await client.listResources({
          q: parsed.q,
          type: parsed.type,
          status: parsed.status,
          limit: parsed.limit,
          cursor: parsed.cursor
        })
      );

      return formatResult({
        result: createResult({
          ok: true,
          code: "catalog.list.read",
          message: catalogListMessage(list),
          command: "catalog list",
          data: list
        }),
        exitCode: EXIT_CODES.success,
        json: parsed.json
      });
    }

    if (action === "get") {
      const resource = normalizeResourceDetail(await client.getResource(operand));

      return formatResult({
        result: createResult({
          ok: true,
          code: "catalog.get.read",
          message: catalogGetMessage(resource),
          command: "catalog get",
          data: resource
        }),
        exitCode: EXIT_CODES.success,
        json: parsed.json
      });
    }

    const metadata = normalizeDownloadMetadata(await client.getDownloadMetadata(operand));

    return formatResult({
      result: createResult({
        ok: true,
        code: "catalog.download_metadata.read",
        message: catalogDownloadMetadataMessage(metadata),
        command: "catalog download-metadata",
        data: metadata
      }),
      exitCode: EXIT_CODES.success,
      json: parsed.json
    });
  } catch (error) {
    return formatResult({
      result: createResult({
        ok: false,
        code: catalogErrorCode(action, error),
        message: catalogErrorMessage(action, error),
        command: `catalog ${action}`,
        data: catalogErrorData(error)
      }),
      exitCode: error instanceof ReadbackError && error.code === "missing-resource-id" ? EXIT_CODES.usage : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }
}

function catalogUsageError(action, json, message) {
  return formatResult({
    result: createResult({
      ok: false,
      code: "cli.usage_error",
      message,
      command: `catalog ${action}`
    }),
    exitCode: EXIT_CODES.usage,
    json,
    includeUsage: true
  });
}

function catalogListMessage(list) {
  const count = list.items.length;
  const suffix = list.pageInfo.hasNextPage && list.pageInfo.nextCursor ? ` Next cursor: ${list.pageInfo.nextCursor}.` : "";
  return `Catalog list read ${count} resource${count === 1 ? "" : "s"}.${suffix}`;
}

function catalogGetMessage(resource) {
  const id = publicString(resource?.resourceId ?? resource?.id);
  return id ? `Catalog resource read: ${id}.` : "Catalog resource read.";
}

function catalogDownloadMetadataMessage(metadata) {
  const availability = metadata.availability ?? "unknown";
  const kind = metadata.downloadKind ? ` Kind: ${metadata.downloadKind}.` : "";
  const method = metadata.method ? ` Method: ${metadata.method}.` : "";
  const filename = metadata.filename ? ` Filename: ${metadata.filename}.` : "";
  return `Catalog download metadata read. Availability: ${availability}.${kind}${method}${filename}`;
}

function catalogErrorCode(action, error) {
  if (error instanceof ReadbackError) {
    return `catalog.${action}.${error.code}`;
  }
  return `catalog.${action}.unavailable`;
}

function catalogErrorMessage(action, error) {
  if (!(error instanceof ReadbackError)) {
    return `Catalog ${action} request failed.`;
  }
  if (error.code === "unsafe-base-url") {
    return "Catalog readback base URL must use HTTPS outside loopback development.";
  }
  if (error.code === "invalid-list-limit") {
    return "Catalog list limit must be an integer from 1 to 100.";
  }
  if (error.code === "not-found") {
    return "Catalog resource was not found.";
  }
  if (error.code === "rate-limited") {
    return "Catalog readback endpoint is rate limited.";
  }
  return "Catalog readback endpoint is unavailable.";
}

function catalogErrorData(error) {
  if (!(error instanceof ReadbackError)) {
    return { retryAfter: null, status: null };
  }
  return {
    status: error.status,
    retryAfter: error.retryAfter
  };
}

async function handleDownloadCommand(resourceId, parsed, options) {
  if (parsed.tokens.length !== 2) {
    return downloadUsageError(parsed.json, "Expected command: download <resource-id> --output <file-or-dir>.");
  }

  const validation = validateDownloadCliOptions(parsed);
  if (!validation.ok) {
    return downloadUsageError(parsed.json, validation.message);
  }

  try {
    const client = createReadbackClient({
      baseUrl: parsed.apiUrl ?? undefined,
      fetchImpl: options.fetchImpl
    });
    const download = await downloadResourceArtifact({
      client,
      resourceId,
      outputPath: validation.outputPath,
      force: parsed.force,
      maxBytes: validation.maxBytes,
      allowedRedirectOrigins: validation.allowedRedirectOrigins,
      cwd: options.cwd,
      baseUrl: parsed.apiUrl ?? "https://agentique.io",
      fetchImpl: options.fetchImpl
    });

    return formatResult({
      result: createResult({
        ok: true,
        code: "download.completed",
        message: downloadSuccessMessage(download),
        command: "download",
        data: projectDownloadResult(download)
      }),
      exitCode: EXIT_CODES.success,
      json: parsed.json
    });
  } catch (error) {
    return formatResult({
      result: createResult({
        ok: false,
        code: downloadErrorCode(error),
        message: downloadErrorMessage(error),
        command: "download",
        data: downloadErrorData(error)
      }),
      exitCode: downloadErrorExitCode(error),
      json: parsed.json
    });
  }
}

function validateDownloadCliOptions(parsed) {
  if (!parsed.outputPath) {
    return { ok: false, message: "Download requires --output <file-or-dir>." };
  }
  if (hasParentPathSegment(parsed.outputPath)) {
    return { ok: false, message: "Download output path must not contain parent-directory traversal." };
  }

  const maxBytes = normalizeCliPositiveSafeInteger(parsed.maxBytes);
  if (maxBytes === false) {
    return { ok: false, message: "Download --max-bytes must be a positive safe integer." };
  }

  const allowedRedirectOrigins = normalizeAllowedRedirectOrigins(parsed.allowedRedirectOrigins);
  if (allowedRedirectOrigins === false) {
    return { ok: false, message: "Download redirect origins must use HTTPS outside loopback development." };
  }

  return {
    ok: true,
    outputPath: parsed.outputPath,
    maxBytes,
    allowedRedirectOrigins
  };
}

function normalizeCliPositiveSafeInteger(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  return Number.isSafeInteger(numeric) && numeric > 0 ? numeric : false;
}

function normalizeAllowedRedirectOrigins(values) {
  const origins = [];
  for (const value of values ?? []) {
    let parsed;
    try {
      parsed = new URL(value);
    } catch {
      return false;
    }
    const isHttps = parsed.protocol === "https:";
    const isLoopbackHttp =
      parsed.protocol === "http:" &&
      (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");
    if (!isHttps && !isLoopbackHttp) {
      return false;
    }
    origins.push(parsed.origin);
  }
  return origins;
}

function hasParentPathSegment(value) {
  return String(value)
    .split(/[\\/]+/)
    .some((segment) => segment === "..");
}

function downloadUsageError(json, message) {
  return formatResult({
    result: createResult({
      ok: false,
      code: "cli.usage_error",
      message,
      command: "download"
    }),
    exitCode: EXIT_CODES.usage,
    json,
    includeUsage: true
  });
}

function downloadSuccessMessage(download) {
  return `Downloaded artifact ${download.filename} (${download.bytesWritten} bytes).`;
}

function projectDownloadResult(download) {
  return Object.freeze({
    resourceId: download.resourceId,
    filename: download.filename,
    bytesWritten: download.bytesWritten,
    digest: download.digest,
    mediaType: download.mediaType,
    outputWritten: true
  });
}

function downloadErrorCode(error) {
  if (error instanceof ReadbackError) {
    return `download.${error.code}`;
  }
  return "download.unavailable";
}

function downloadErrorMessage(error) {
  if (!(error instanceof ReadbackError)) {
    return "Download failed.";
  }
  if (error.code === "not-found") {
    return "Download metadata resource was not found.";
  }
  if (error.code === "download-unavailable") {
    return "Download is not available for this resource.";
  }
  if (error.code === "output-exists") {
    return "Download output already exists. Use --force to replace it.";
  }
  if (error.code === "download-too-large") {
    return "Download exceeds the configured maximum byte count.";
  }
  if (error.code === "download-digest-mismatch") {
    return "Downloaded digest does not match metadata.";
  }
  if (error.code === "download-size-mismatch") {
    return "Downloaded byte count does not match metadata.";
  }
  if (error.code === "unsafe-download-redirect") {
    return "Download redirect target is not allowed.";
  }
  if (error.code === "unsafe-download-url") {
    return "Download URL must use HTTPS outside loopback development.";
  }
  if (error.code === "unsafe-output-filename" || error.code === "unsafe-output-path") {
    return "Download output path or filename is unsafe.";
  }
  return "Download failed.";
}

function downloadErrorData(error) {
  if (!(error instanceof ReadbackError)) {
    return { retryAfter: null, status: null };
  }
  return {
    status: error.status,
    retryAfter: error.retryAfter
  };
}

function downloadErrorExitCode(error) {
  if (
    error instanceof ReadbackError &&
    ["invalid-max-bytes", "invalid-redirect-limit", "missing-output-path", "missing-resource-id"].includes(error.code)
  ) {
    return EXIT_CODES.usage;
  }
  return EXIT_CODES.unavailable;
}

async function handleUploadCommand(action, operand, parsed, options) {
  if (!UPLOAD_COMMANDS.has(action)) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: "Expected upload command: plan, import-plan, variant-plan, agent-native-plan, draft, patch, submit, or status",
        command: "upload"
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  if (parsed.tokens.length !== 3) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: `Expected one operand for upload ${action}.`,
        command: `upload ${action}`
      }),
      exitCode: EXIT_CODES.usage,
      json: parsed.json,
      includeUsage: true
    });
  }

  if (action === "plan") {
    const plan = await createUploadPlan({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: plan.ok,
        code: plan.code,
        message: plan.ok ? "Upload plan is ready for review-only submission." : "Upload plan has validation findings.",
        command: "upload plan",
        data: plan
      }),
      exitCode: plan.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "import-plan") {
    const plan = await createImportPlan({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: plan.ok,
        code: plan.code,
        message: plan.ok ? "Import plan is ready for local review." : "Import plan requires review.",
        command: "upload import-plan",
        data: plan
      }),
      exitCode: plan.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "variant-plan") {
    const plan = await createVariantPlan({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: plan.ok,
        code: plan.code,
        message: plan.ok ? "Variant plan is ready for local review." : "Variant plan requires review.",
        command: "upload variant-plan",
        data: plan
      }),
      exitCode: plan.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "agent-native-plan") {
    const plan = await createAgentNativePlan({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: plan.ok,
        code: plan.code,
        message: plan.ok ? "Agent-native plan is ready for local review." : "Agent-native plan requires review.",
        command: "upload agent-native-plan",
        data: plan
      }),
      exitCode: plan.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "submit") {
    const submission = await submitReviewOnlyUpload({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      apiUrl: parsed.apiUrl ?? undefined,
      tokenOption: parsed.token,
      env: options.env,
      readFile: options.readFile,
      cwd: options.cwd,
      fetchImpl: options.fetchImpl
    });

    return formatResult({
      result: createResult({
        ok: submission.ok,
        code: submission.code,
        message: submission.ok ? "Review-only upload submission created." : submission.message,
        command: "upload submit",
        data: submission
      }),
      exitCode: submission.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "draft") {
    const draft = await createGeneratedDraftOutput({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      kind: parsed.draftKind,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: draft.ok,
        code: draft.code,
        message: draft.ok ? "Generated draft output is ready for local review." : draft.message,
        command: "upload draft",
        data: draft
      }),
      exitCode: draft.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "patch") {
    const patch = await createPatchDeltaOutput({
      packageDir: operand,
      schemasDir: parsed.schemasDir,
      cwd: options.cwd
    });

    return formatResult({
      result: createResult({
        ok: patch.ok,
        code: patch.code,
        message: patch.ok ? "Patch or delta output is ready for local review." : patch.message,
        command: "upload patch",
        data: patch
      }),
      exitCode: patch.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  if (action === "status") {
    const status = await readUploadStatus({
      submissionId: operand,
      apiUrl: parsed.apiUrl ?? undefined,
      tokenOption: parsed.token,
      env: options.env,
      readFile: options.readFile,
      fetchImpl: options.fetchImpl
    });

    return formatResult({
      result: createResult({
        ok: status.ok,
        code: status.code,
        message: status.ok ? "Upload submission status read." : status.message,
        command: "upload status",
        data: status
      }),
      exitCode: status.ok ? EXIT_CODES.success : EXIT_CODES.unavailable,
      json: parsed.json
    });
  }

  return formatResult({
    result: createResult({
      ok: false,
      code: `upload.${action}.not_enabled`,
      message: `Upload ${action} is reserved for review-only submission tooling and is not enabled in this release.`,
      command: `upload ${action}`,
      data: {
        operandAccepted: Boolean(operand),
        liveUploadAvailable: false
      }
    }),
    exitCode: EXIT_CODES.unavailable,
    json: parsed.json
  });
}

function formatHelp(json) {
  if (json) {
    return formatResult({
      result: createResult({
        ok: true,
        code: "cli.help",
        message: "Agentique uploader help.",
        command: "help",
        data: { usage: USAGE }
      }),
      exitCode: EXIT_CODES.success,
      json
    });
  }

  return { exitCode: EXIT_CODES.success, stdout: USAGE, stderr: "" };
}

function formatVersion(json) {
  if (json) {
    return formatResult({
      result: createResult({
        ok: true,
        code: "cli.version",
        message: UPLOADER_PACKAGE_VERSION,
        command: "version",
        data: { version: UPLOADER_PACKAGE_VERSION }
      }),
      exitCode: EXIT_CODES.success,
      json
    });
  }

  return { exitCode: EXIT_CODES.success, stdout: `${UPLOADER_PACKAGE_VERSION}\n`, stderr: "" };
}

function formatResult({ result, exitCode, json, includeUsage = false }) {
  if (json) {
    return {
      exitCode,
      stdout: `${JSON.stringify(result, null, 2)}\n`,
      stderr: ""
    };
  }

  const message = includeUsage ? `${result.message}\n\n${USAGE}` : `${result.message}\n`;
  return {
    exitCode,
    stdout: result.ok ? message : "",
    stderr: result.ok ? "" : message
  };
}

function createResult({ ok, code, message, command, data }) {
  const boundary = createUploaderBoundaryStatus().boundary;
  return {
    ok,
    code,
    message,
    command,
    boundary,
    ...(data ? { data } : {})
  };
}

function publicString(value) {
  return typeof value === "string" && value.trim() !== "" ? value : null;
}
