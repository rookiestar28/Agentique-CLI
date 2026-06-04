import { createUploaderBoundaryStatus, UPLOADER_PACKAGE_VERSION } from "./index.mjs";

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
  Live upload commands are not enabled in this package release.
`;

const COMMANDS = new Set(["auth", "upload"]);
const UPLOAD_COMMANDS = new Set(["plan", "submit", "status"]);

export function executeUploaderCli(argv) {
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
    return handleAuthCommand(action, parsed);
  }

  return handleUploadCommand(action, operand, parsed);
}

export function parseArgs(argv) {
  const tokens = [];
  let json = false;
  let help = false;
  let version = false;

  for (const arg of argv) {
    if (arg === "--json") {
      json = true;
    } else if (arg === "--help" || arg === "-h") {
      help = true;
    } else if (arg === "--version" || arg === "-v") {
      version = true;
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

  return { json, help, version, tokens };
}

function handleAuthCommand(action, parsed) {
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

  return formatResult({
    result: createResult({
      ok: false,
      code: "auth.not_enabled",
      message: "Auth status is reserved for the uploader auth contract and is not enabled in this release.",
      command: "auth status",
      data: {
        configured: false,
        redacted: true
      }
    }),
    exitCode: EXIT_CODES.unavailable,
    json: parsed.json
  });
}

function handleUploadCommand(action, operand, parsed) {
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
