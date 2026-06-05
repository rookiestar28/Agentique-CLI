import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_VERSION } from "./index.mjs";
import { resolveAuthState } from "./auth.mjs";
import { createUploadPlan } from "./plan.mjs";
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
  agentique upload plan <package-dir> [--json]
  agentique upload submit <package-dir> [--json]
  agentique upload status <submission-id> [--json]

Current status:
  Submit and status commands create review-only sessions; they do not publish packages automatically.
`;

const COMMANDS = new Set(["auth", "upload"]);
const UPLOAD_COMMANDS = new Set(["plan", "submit", "status"]);

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

  return { json, help, version, token, schemasDir, apiUrl, tokens };
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
  return "Uploader auth is not configured.";
}

async function handleUploadCommand(action, operand, parsed, options) {
  if (!UPLOAD_COMMANDS.has(action)) {
    return formatResult({
      result: createResult({
        ok: false,
        code: "cli.usage_error",
        message: "Expected upload command: plan, submit, or status",
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
