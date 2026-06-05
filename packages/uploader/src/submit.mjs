import { createHash } from "node:crypto";
import { resolveAuthMaterial } from "./auth.mjs";
import { createUploadPlan } from "./plan.mjs";

const DEFAULT_API_URL = "https://www.agentique.io";
const SUBMIT_SCHEMA_VERSION = "agentique.uploader.submit.v1";
const STATUS_SCHEMA_VERSION = "agentique.uploader.status.v1";

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
    return submitFailure("upload.submit.invalid_api_url", "API URL must be HTTPS.", { auth });
  }

  const plan = await createUploadPlan({ packageDir, schemasDir, cwd });
  if (!plan.ok) {
    return {
      schemaVersion: SUBMIT_SCHEMA_VERSION,
      ok: false,
      code: "upload.submit.plan_failed",
      command: "upload submit",
      reviewOnly: true,
      auth: safeAuth(auth),
      plan
    };
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
    return statusFailure("upload.status.invalid_api_url", "API URL must be HTTPS.", { auth, submissionId });
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
  const body = JSON.stringify({
    schemaVersion: "agentique.uploader.transfer.v1",
    reviewOnly: true,
    plan
  });
  const payloadDigest = digest(body);
  // SECURITY: storage transfers use only server-provided transfer headers; never forward bearer auth.
  const headers = {
    "content-type": "application/json",
    ...(session.transfer.headers ?? {})
  };

  let attempts = 0;
  for (const attempt of [1, 2]) {
    attempts = attempt;
    const response = await fetchImpl(session.transfer.url, {
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
    noExecution: plan.noExecution === true
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
    return { ok: url.protocol === "https:", url };
  } catch {
    return { ok: false, url: null };
  }
}

function digest(value) {
  return `sha256:${createHash("sha256").update(value).digest("hex")}`;
}
