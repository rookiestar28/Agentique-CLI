const DEFAULT_BASE_URL = "https://agentique.io";
const PUBLIC_RESOURCE_API_PREFIX = "/api/public/v1/resources";

const MUTATION_WORDS = [
  "publish",
  "edit",
  "update",
  "delete",
  "admin",
  "moderate",
  "review",
  "scan",
  "report"
];

const PRIVATE_PROJECTION_KEYS = new Set([
  "adminnote",
  "adminnotes",
  "authtoken",
  "bearertoken",
  "credential",
  "credentials",
  "objectkey",
  "objectpath",
  "password",
  "privateendpoint",
  "privatekey",
  "privatereviewnotes",
  "privateuri",
  "privateurl",
  "rawscan",
  "rawscanresult",
  "rawscanresults",
  "refreshtoken",
  "reviewnote",
  "reviewnotes",
  "secret",
  "secrets",
  "secretvalue",
  "sessiontoken",
  "storagekey",
  "storagepath"
]);

const PROTOTYPE_POLLUTION_KEYS = new Set(["__proto__", "constructor", "prototype"]);

export class ReadbackError extends Error {
  constructor(message, options = {}) {
    super(message);
    this.name = "ReadbackError";
    this.code = options.code ?? "readback-error";
    this.status = options.status ?? null;
    this.retryAfter = options.retryAfter ?? null;
    this.cause = options.cause;
  }
}

export function createReadbackClient(options = {}) {
  const baseUrl = normalizeBaseUrl(options.baseUrl ?? DEFAULT_BASE_URL);
  const fetchImpl = options.fetchImpl ?? globalThis.fetch;

  if (typeof fetchImpl !== "function") {
    throw new ReadbackError("A fetch implementation is required.", { code: "missing-fetch" });
  }

  const requestJson = async (path, params) => {
    const url = buildUrl(baseUrl, path, params);
    let response;

    try {
      response = await fetchImpl(url, {
        method: "GET",
        headers: {
          accept: "application/json"
        }
      });
    } catch (error) {
      throw new ReadbackError("Readback endpoint is unavailable.", {
        code: "unavailable",
        cause: error
      });
    }

    if (response.status === 429) {
      throw new ReadbackError("Readback endpoint is rate limited.", {
        code: "rate-limited",
        status: 429,
        retryAfter: response.headers?.get?.("retry-after") ?? null
      });
    }

    if (!response.ok) {
      throw new ReadbackError("Readback request failed.", {
        code: "http-error",
        status: response.status
      });
    }

    let payload;
    try {
      payload = await response.json();
    } catch (error) {
      throw new ReadbackError("Readback endpoint returned invalid JSON.", {
        code: "invalid-json",
        status: response.status,
        cause: error
      });
    }

    return normalizePublicReadback(payload);
  };

  return Object.freeze({
    getStatus(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/status`);
    },
    listResources(params = {}) {
      return requestJson(PUBLIC_RESOURCE_API_PREFIX, pickListParams(params));
    },
    getResource(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}`);
    },
    getDownloadMetadata(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/download`);
    },
    getReadback(resourceId) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/readback`);
    },
    getContextBundle(resourceId, params = {}) {
      return requestJson(`${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/context-bundle`, pickContextBundleParams(params));
    },
    getSelectionReadback(resourceId, params = {}) {
      return requestJson(
        `${PUBLIC_RESOURCE_API_PREFIX}/${encodeSegment(resourceId)}/selection-readback`,
        pickSelectionReadbackParams(params)
      );
    }
  });
}

export function normalizeBaseUrl(value) {
  const parsed = new URL(value);
  const isHttps = parsed.protocol === "https:";
  const isLoopbackHttp =
    parsed.protocol === "http:" &&
    (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1" || parsed.hostname === "[::1]");

  if (!isHttps && !isLoopbackHttp) {
    throw new ReadbackError("Readback base URL must use HTTPS outside loopback development.", {
      code: "unsafe-base-url"
    });
  }

  parsed.pathname = parsed.pathname.replace(/\/+$/, "");
  parsed.search = "";
  parsed.hash = "";
  return parsed;
}

export function normalizePublicReadback(value) {
  if (Array.isArray(value)) {
    return value.map((entry) => normalizePublicReadback(entry));
  }

  if (!value || typeof value !== "object") {
    return value;
  }

  const normalized = {};
  for (const [key, nestedValue] of Object.entries(value)) {
    // Guard before assignment; these keys can mutate prototypes or expose unsafe constructors.
    if (PROTOTYPE_POLLUTION_KEYS.has(key)) {
      continue;
    }

    if (isPrivateProjectionKey(key)) {
      continue;
    }

    normalized[key] = normalizePublicReadback(nestedValue);
  }

  return Object.freeze(normalized);
}

function isPrivateProjectionKey(key) {
  const normalized = key.replace(/[-_\s]/g, "").toLowerCase();
  return (
    PRIVATE_PROJECTION_KEYS.has(normalized) ||
    normalized.startsWith("private") ||
    normalized.includes("secret") ||
    normalized.includes("password") ||
    normalized.includes("credential") ||
    (normalized.endsWith("token") && normalized !== "tokencount")
  );
}

export function assertReadOnlyClientSurface(client) {
  const methodNames = Object.keys(client);
  const violatingMethod = methodNames.find((methodName) =>
    MUTATION_WORDS.some((word) => methodName.toLowerCase().includes(word))
  );

  if (violatingMethod) {
    throw new ReadbackError(`Readback clients must not expose mutation method: ${violatingMethod}`, {
      code: "mutation-method"
    });
  }

  return Object.freeze([...methodNames]);
}

function buildUrl(baseUrl, path, params = {}) {
  const url = new URL(`${baseUrl.pathname}${path}`, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

function pickListParams(params) {
  const allowed = ["q", "type", "cursor", "limit", "status"];
  const picked = {};

  for (const key of allowed) {
    if (Object.hasOwn(params, key)) {
      picked[key] = params[key];
    }
  }

  return picked;
}

function pickContextBundleParams(params) {
  return pickAllowedParams(params, ["intent", "audience", "limit"]);
}

function pickSelectionReadbackParams(params) {
  return pickAllowedParams(params, ["intent", "audience", "limit", "cursor"]);
}

function pickAllowedParams(params, allowed) {
  const picked = {};

  for (const key of allowed) {
    if (Object.hasOwn(params, key)) {
      picked[key] = params[key];
    }
  }

  return picked;
}

function encodeSegment(value) {
  if (typeof value !== "string" || value.trim() === "") {
    throw new ReadbackError("Resource id is required.", { code: "missing-resource-id" });
  }

  return encodeURIComponent(value);
}
