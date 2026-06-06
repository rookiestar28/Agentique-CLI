import { createHash } from "node:crypto";
import { resolveAuthMaterial } from "./auth.mjs";
import { createUploadPlan } from "./plan.mjs";

const DEFAULT_API_URL = "https://www.agentique.io";
const SUBMIT_SCHEMA_VERSION = "agentique.uploader.submit.v1";
const STATUS_SCHEMA_VERSION = "agentique.uploader.status.v1";
const ERROR_SCHEMA_VERSION = "agentique.uploader.error.v1";
const ALLOWED_API_HOSTS = new Set(["agentique.io", "www.agentique.io", "api.agentique.io"]);
const SENSITIVE_TRANSFER_HEADERS = new Set(["authorization", "cookie", "x-api-key", "x-agentique-token"]);

export async function submitReviewOnlyUpload({
  packageDir,
  schemasDir = null,
  apiUrl = DEFAULT_API_URL,
  tokenOption = null,
  env = process.env,
  readFile,
  cwd = process.cwd(),
  fetchImpl = globalThis.fetch
}) {
  const auth = resolveAuthMaterial({ tokenOption, env, readFile });
  if (!auth.ok) {
    return submitFailure(auth.code, "Uploader auth is required before review-only submit.", { auth });
  }

  const baseUrl = parseApiUrl(apiUrl);
  if (!baseUrl.ok) {
    return submitFailure("upload.submit.invalid_api_url", "API URL must be an Agentique HTTPS API origin.", { auth });
  }

  const plan = await createUploadPlan({ packageDir, schemasDir, cwd });
  if (!plan.ok) {
    return submitFailure("upload.submit.plan_failed", "Upload plan has validation findings.", { auth, plan });
  }

  if (plan.checkpoints?.readyForReviewSubmit !== true) {
    return submitFailure("upload.submit.checkpoints_required", "Review-only submit requires completed creator checkpoint evidence.", {
      auth,
      plan
    });
  }

  try {
    const session = await createSession({ baseUrl: baseUrl.url, token: auth.token, plan, fetchImpl });
    const transfer = await transferEvidence({ session, plan, fetchImpl });
    const completion = await completeSession({ baseUrl: baseUrl.url, token: auth.token, session, plan, transfer, fetchImpl });

    if (completion.verified !== true) {
      return submitFailure("upload.submit.completion_unverified", "Upload completion was not server verified.", { auth, plan });
    }

    return {
      schemaVersion: SUBMIT_SCHEMA_VERSION,
      ok: true,
      code: "upload.submit.review_created",
      command: "upload submit",
      reviewOnly: true,
      auth: safeAuth(auth),
      plan: safePlanSummary(plan),
      session: {
        id: session.sessionId,
        completed: true,
        serverVerified: true
      },
      transfer: {
        uploaded: true,
        attempts: transfer.attempts,
        authorizationForwarded: false,
        payloadDigest: transfer.payloadDigest
      },
      submission: {
        id: completion.submissionId ?? null,
        status: completion.status ?? "review_required"
      }
    };
  } catch {
    return submitFailure("upload.submit.request_failed", "Review-only submit request failed.", { auth, plan });
  }
}

export async function readUploadStatus({
  submissionId,
  apiUrl = DEFAULT_API_URL,
  tokenOption = null,
  env = process.env,
  readFile,
  fetchImpl = globalThis.fetch
}) {
  const auth = resolveAuthMaterial({ tokenOption, env, readFile });
  if (!auth.ok) {
    return statusFailure(auth.code, "Uploader auth is required before status readback.", { auth, submissionId });
  }

  const baseUrl = parseApiUrl(apiUrl);
  if (!baseUrl.ok) {
    return statusFailure("upload.status.invalid_api_url", "API URL must be an Agentique HTTPS API origin.", { auth, submissionId });
  }

  try {
    const response = await fetchImpl(new URL(`/api/cli/v1/upload-submissions/${encodeURIComponent(submissionId)}`, baseUrl.url), {
      method: "GET",
      headers: apiHeaders(auth.token)
    });
    if (!response.ok) {
      return statusFailure("upload.status.request_failed", "Upload status request failed.", { auth, submissionId });
    }
    const payload = await response.json();
    return {
      schemaVersion: STATUS_SCHEMA_VERSION,
      ok: true,
      code: "upload.status.read",
      command: "upload status",
      reviewOnly: true,
      auth: safeAuth(auth),
      submission: {
        id: payload.submissionId ?? submissionId,
        status: payload.status ?? "unknown",
        reviewOnly: payload.reviewOnly !== false
      }
    };
  } catch {
    return statusFailure("upload.status.request_failed", "Upload status request failed.", { auth, submissionId });
  }
}

async function createSession({ baseUrl, token, plan, fetchImpl }) {
  const response = await fetchImpl(new URL("/api/cli/v1/upload-sessions", baseUrl), {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({ reviewOnly: true, plan })
  });
  if (!response.ok) {
    throw new Error("session_create_failed");
  }
  const payload = await response.json();
  if (!payload?.sessionId || !payload?.transfer?.url) {
    throw new Error("session_payload_invalid");
  }
  return payload;
}

async function transferEvidence({ session, plan, fetchImpl }) {
  const transferUrl = parseTransferUrl(session.transfer.url);
  if (!transferUrl.ok) {
    throw new Error("transfer_url_invalid");
  }
  const body = JSON.stringify({
    schemaVersion: "agentique.uploader.transfer.v1",
    reviewOnly: true,
    plan
  });
  const payloadDigest = digest(body);
  // SECURITY: storage transfers use only server-provided transfer headers; never forward bearer auth.
  const headers = safeTransferHeaders(session.transfer.headers);

  let attempts = 0;
  for (const attempt of [1, 2]) {
    attempts = attempt;
    const response = await fetchImpl(transferUrl.url, {
      method: session.transfer.method ?? "PUT",
      headers,
      body
    });
    if (response.ok) {
      return { attempts, payloadDigest };
    }
    if (attempt === 2 || ![408, 429, 500, 502, 503, 504].includes(response.status)) {
      throw new Error("transfer_failed");
    }
  }

  throw new Error("transfer_failed");
}

async function completeSession({ baseUrl, token, session, plan, transfer, fetchImpl }) {
  const response = await fetchImpl(new URL(`/api/cli/v1/upload-sessions/${encodeURIComponent(session.sessionId)}/complete`, baseUrl), {
    method: "POST",
    headers: apiHeaders(token),
    body: JSON.stringify({
      sessionId: session.sessionId,
      reviewOnly: true,
      inventoryDigest: plan.evidence.inventoryDigest,
      checkpointDigest: digest(JSON.stringify(plan.checkpoints ?? null)),
      payloadDigest: transfer.payloadDigest
    })
  });
  if (!response.ok) {
    throw new Error("completion_failed");
  }
  return response.json();
}

function submitFailure(code, message, { auth, plan = null }) {
  return {
    schemaVersion: SUBMIT_SCHEMA_VERSION,
    ok: false,
    code,
    command: "upload submit",
    message,
    error: publicSafeError(code, message),
    reviewOnly: true,
    auth: safeAuth(auth),
    ...(plan ? { plan: safePlanSummary(plan) } : {})
  };
}

function statusFailure(code, message, { auth, submissionId }) {
  return {
    schemaVersion: STATUS_SCHEMA_VERSION,
    ok: false,
    code,
    command: "upload status",
    message,
    error: publicSafeError(code, message),
    reviewOnly: true,
    auth: safeAuth(auth),
    submission: {
      id: submissionId,
      status: "unknown"
    }
  };
}

function safeAuth(auth) {
  return {
    configured: auth.configured,
    source: auth.source,
    redacted: true,
    ...(auth.tokenFingerprint ? { tokenFingerprint: auth.tokenFingerprint } : {})
  };
}

function safePlanSummary(plan) {
  return {
    ok: plan.ok,
    code: plan.code,
    package: plan.package,
    inventoryDigest: plan.evidence?.inventoryDigest ?? null,
    findingCount: plan.evidence?.findingCount ?? 0,
    noExecution: plan.noExecution === true,
    checkpoints: plan.checkpoints
      ? {
          readyForReviewSubmit: plan.checkpoints.readyForReviewSubmit === true,
          missing: plan.checkpoints.missing ?? [],
          packageContextReady: plan.checkpoints.packageContextReady === true,
          reasons: plan.checkpoints.reasons ?? []
        }
      : null
  };
}

function apiHeaders(token) {
  return {
    authorization: `Bearer ${token}`,
    "content-type": "application/json"
  };
}

function parseApiUrl(value) {
  try {
    const url = new URL(value);
    return { ok: url.protocol === "https:" && isAllowedApiHost(url.hostname), url };
  } catch {
    return { ok: false, url: null };
  }
}

function parseTransferUrl(value) {
  try {
    const url = new URL(value);
    return { ok: url.protocol === "https:", url };
  } catch {
    return { ok: false, url: null };
  }
}

function isAllowedApiHost(hostname) {
  const normalized = hostname.toLowerCase();
  return ALLOWED_API_HOSTS.has(normalized) || normalized === "agentique.test" || normalized.endsWith(".agentique.test");
}

function safeTransferHeaders(headers) {
  const safe = { "content-type": "application/json" };
  if (!headers || typeof headers !== "object" || typeof headers[Symbol.iterator] === "function") {
    return safe;
  }

  for (const [name, value] of Object.entries(headers)) {
    const lowered = name.toLowerCase();
    if (SENSITIVE_TRANSFER_HEADERS.has(lowered)) {
      continue;
    }
    safe[name] = value;
  }

  return safe;
}

function publicSafeError(code, message) {
  return {
    schemaVersion: ERROR_SCHEMA_VERSION,
    code,
    message,
    redacted: true
  };
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
