import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";

export const AUTH_ENV_VAR = "AGENTIQUE_TOKEN";
export const CONFIG_ENV_VAR = "AGENTIQUE_CONFIG";

export function resolveAuthState({ tokenOption = null, env = process.env, readFile = readFileSync } = {}) {
  const configCandidate = readConfigToken({ env, readFile });
  const sources = [
    { source: "flag", token: tokenOption },
    { source: "env", token: env[AUTH_ENV_VAR] },
    { source: "config", ...configCandidate }
  ];

  const selected = sources.find((candidate) => candidate.token !== null && candidate.token !== undefined && candidate.token !== "");
  if (!selected) {
    if (configCandidate.configError) {
      return {
        ok: false,
        code: "auth.config_error",
        configured: false,
        source: "config",
        redacted: true
      };
    }

    return {
      ok: false,
      code: "auth.not_configured",
      configured: false,
      source: "none",
      redacted: true
    };
  }

  const validation = validateToken(selected.token);
  if (!validation.ok) {
    return {
      ok: false,
      code: validation.code,
      configured: false,
      source: selected.source,
      redacted: true
    };
  }

  return {
    ok: true,
    code: "auth.configured",
    configured: true,
    source: selected.source,
    tokenFingerprint: fingerprintToken(selected.token),
    redacted: true
  };
}

export function validateToken(token) {
  if (typeof token !== "string") {
    return { ok: false, code: "auth.invalid_token" };
  }

  const trimmed = token.trim();
  if (trimmed.length < 8 || /\s/.test(trimmed)) {
    return { ok: false, code: "auth.invalid_token" };
  }

  return { ok: true };
}

export function fingerprintToken(token) {
  return `sha256:${createHash("sha256").update(token).digest("hex").slice(0, 12)}`;
}

function readConfigToken({ env, readFile }) {
  const configPath = env[CONFIG_ENV_VAR];
  if (!configPath) {
    return { token: null };
  }

  try {
    const parsed = JSON.parse(readFile(configPath, "utf8"));
    const token = parsed?.auth?.token ?? parsed?.token ?? null;
    return { token };
  } catch {
    return { token: null, configError: true };
  }
}
