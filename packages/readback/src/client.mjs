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

    if (response.status === 404) {
      throw new ReadbackError("Readback resource was not found.", {
        code: "not-found",
        status: 404
      });
    }

    if (response.status >= 500) {
      throw new ReadbackError("Readback endpoint is unavailable.", {
        code: "unavailable",
        status: response.status,
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

export function normalizeResourceList(value) {
  const normalized = normalizePublicReadback(value);
  if (Array.isArray(normalized)) {
    return Object.freeze({
      items: Object.freeze(normalized.filter(isRecord).map(projectResourceListItem)),
      pageInfo: emptyPageInfo(),
      observedAt: null
    });
  }

  if (!isRecord(normalized)) {
    return emptyResourceList();
  }

  const sourceItems = Array.isArray(normalized.items)
    ? normalized.items
    : Array.isArray(normalized.resources)
      ? normalized.resources
      : [];

  return Object.freeze({
    items: Object.freeze(sourceItems.filter(isRecord).map(projectResourceListItem)),
    pageInfo: projectPageInfo(normalized.pageInfo),
    observedAt: stringOrNull(normalized.observedAt ?? normalized.updatedAt)
  });
}

export function normalizeDownloadMetadata(value) {
  const normalized = normalizePublicReadback(value);
  if (!isRecord(normalized)) {
    return emptyDownloadMetadata();
  }

  const download = isRecord(normalized.download) ? normalized.download : {};
  const digestValue = firstString(download.digest, normalized.digest, download.sha256, normalized.sha256);
  const digest = projectDigest(digestValue);

  return Object.freeze({
    resourceId: stringOrNull(normalized.resourceId ?? normalized.id),
    platformId: stringOrNull(download.platformId ?? normalized.platformId),
    artifactKind: stringOrNull(download.artifactKind ?? normalized.artifactKind),
    availability: normalizePublicState(download.availability ?? normalized.availability ?? normalized.status ?? normalized.state),
    url: stringOrNull(download.url ?? normalized.downloadUrl ?? normalized.url),
    filename: stringOrNull(download.filename ?? download.fileName ?? normalized.filename ?? normalized.fileName),
    mediaType: stringOrNull(download.mediaType ?? normalized.mediaType ?? download.contentType ?? normalized.contentType),
    sizeBytes: numberOrNull(download.sizeBytes ?? download.size ?? normalized.sizeBytes ?? normalized.size ?? normalized.contentLength),
    digest,
    digestPresent: typeof digestValue === "string",
    digestValid: typeof digestValue !== "string" || digest !== null,
    reasons: arrayOfStrings(download.reasons ?? normalized.reasons),
    observedAt: stringOrNull(download.observedAt ?? normalized.observedAt ?? normalized.updatedAt),
    expiresAt: stringOrNull(download.expiresAt ?? normalized.expiresAt)
  });
}

export function normalizeTrustReadback(value) {
  const normalized = normalizePublicReadback(value);
  if (!normalized || typeof normalized !== "object" || Array.isArray(normalized)) {
    return Object.freeze({
      platformState: "unavailable",
      desiredState: null,
      scannerPolicy: null,
      trustPanel: null,
      reviewEligibility: null,
      reportActionState: null,
      versionHistory: []
    });
  }

  const platformProjection = isRecord(normalized.platformProjection) ? normalized.platformProjection : {};
  const desiredState = isRecord(normalized.desiredState) ? normalized.desiredState : null;
  const scannerPolicy = isRecord(normalized.scannerPolicy) ? normalized.scannerPolicy : null;
  const trustPanel = isRecord(normalized.trustPanel) ? normalized.trustPanel : null;
  const reviewEligibility = isRecord(normalized.reviewEligibility) ? normalized.reviewEligibility : null;
  const versionHistory = Array.isArray(normalized.versionHistory) ? normalized.versionHistory.filter(isRecord).map(projectVersion) : [];

  return Object.freeze({
    platformState: normalizePublicState(platformProjection.publicationState ?? normalized.status ?? normalized.state),
    desiredState: desiredState
      ? Object.freeze({
          state: normalizePublicState(desiredState.readbackState),
          fingerprintPresent: typeof desiredState.fingerprint === "string",
          reasons: arrayOfStrings(desiredState.reasons)
        })
      : null,
    scannerPolicy: scannerPolicy
      ? Object.freeze({
          policyVersion: stringOrNull(scannerPolicy.policyVersion),
          freshness: normalizePublicState(scannerPolicy.freshness)
        })
      : null,
    trustPanel: trustPanel
      ? Object.freeze({
          state: normalizePublicState(trustPanel.state),
          messages: arrayOfStrings(trustPanel.messages),
          versionHistoryUrl: stringOrNull(trustPanel.versionHistoryUrl)
        })
      : null,
    reviewEligibility: reviewEligibility
      ? Object.freeze({
          state: normalizePublicState(reviewEligibility.state),
          evidenceTypes: arrayOfStrings(reviewEligibility.evidenceTypes),
          reasons: arrayOfStrings(reviewEligibility.reasons)
        })
      : null,
    reportActionState: stringOrNull(normalized.reportActionState),
    versionHistory: Object.freeze(versionHistory)
  });
}

export function normalizeParserVariantReadback(value) {
  const normalized = normalizePublicReadback(value);
  const parserVariant = isRecord(normalized?.parserVariant) ? normalized.parserVariant : normalized;

  if (!isRecord(parserVariant)) {
    return emptyParserVariantSummary();
  }

  const parserEvidence = isRecord(parserVariant.parserEvidence) ? parserVariant.parserEvidence : null;
  const resourceGraphSummary = isRecord(parserVariant.resourceGraphSummary) ? parserVariant.resourceGraphSummary : null;
  const compatibility = isRecord(parserVariant.compatibility) ? parserVariant.compatibility : null;
  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants.filter(isRecord) : [];

  return Object.freeze({
    parserEvidence: parserEvidence
      ? Object.freeze({
          sourceEcosystem: stringOrNull(parserEvidence.sourceEcosystem),
          sourceFormat: stringOrNull(parserEvidence.sourceFormat),
          parseStatus: normalizePublicState(parserEvidence.parseStatus),
          parseConfidence: normalizePublicState(parserEvidence.parseConfidence),
          sanitizerStatus: normalizePublicState(parserEvidence.sanitizerStatus),
          noExecution: parserEvidence.noExecution === true,
          inputDigestPresent: typeof parserEvidence.inputDigest === "string",
          outputDigestPresent: typeof parserEvidence.outputDigest === "string",
          issueCount: Array.isArray(parserEvidence.issues) ? parserEvidence.issues.filter(isRecord).length : 0
        })
      : null,
    resourceGraphSummary: resourceGraphSummary
      ? Object.freeze({
          sanitized: resourceGraphSummary.sanitized === true,
          nodeCount: numberOrNull(resourceGraphSummary.nodeCount),
          edgeCount: numberOrNull(resourceGraphSummary.edgeCount),
          capabilityCount: numberOrNull(resourceGraphSummary.capabilityCount),
          sourceFileCount: numberOrNull(resourceGraphSummary.sourceFileCount),
          summaryDigestPresent: typeof resourceGraphSummary.summaryDigest === "string"
        })
      : null,
    compatibility: compatibility
      ? Object.freeze({
          status: normalizePublicState(compatibility.status),
          reasons: arrayOfStrings(compatibility.reasons)
        })
      : null,
    platformVariants: Object.freeze(
      platformVariants.map((variant) => {
        const download = isRecord(variant.download) ? variant.download : {};
        return Object.freeze({
          platformId: stringOrNull(variant.platformId),
          artifactKind: stringOrNull(variant.artifactKind),
          state: normalizePublicState(variant.state),
          validationState: normalizePublicState(variant.validationState),
          downloadAvailability: normalizePublicState(download.availability),
          downloadUrl: stringOrNull(download.url),
          variantDigestPresent: typeof variant.variantDigest === "string",
          downloadDigestPresent: typeof download.digest === "string",
          reasons: arrayOfStrings(variant.reasons),
          observedAt: stringOrNull(variant.observedAt)
        });
      })
    ),
    observedAt: stringOrNull(parserVariant.observedAt ?? normalized?.observedAt ?? normalized?.updatedAt)
  });
}

function emptyParserVariantSummary() {
  return Object.freeze({
    parserEvidence: null,
    resourceGraphSummary: null,
    compatibility: null,
    platformVariants: Object.freeze([]),
    observedAt: null
  });
}

function emptyResourceList() {
  return Object.freeze({
    items: Object.freeze([]),
    pageInfo: emptyPageInfo(),
    observedAt: null
  });
}

function emptyPageInfo() {
  return Object.freeze({
    page: null,
    pageSize: null,
    total: null,
    cursor: null,
    nextCursor: null,
    hasNextPage: false
  });
}

function emptyDownloadMetadata() {
  return Object.freeze({
    resourceId: null,
    platformId: null,
    artifactKind: null,
    availability: "unavailable",
    url: null,
    filename: null,
    mediaType: null,
    sizeBytes: null,
    digest: null,
    digestPresent: false,
    digestValid: true,
    reasons: Object.freeze([]),
    observedAt: null,
    expiresAt: null
  });
}

function projectResourceListItem(item) {
  return Object.freeze({
    resourceId: stringOrNull(item.resourceId ?? item.id),
    slug: stringOrNull(item.slug),
    title: stringOrNull(item.title ?? item.name),
    summary: stringOrNull(item.summary ?? item.description),
    type: stringOrNull(item.type ?? item.resourceType),
    status: normalizePublicState(item.status ?? item.state ?? item.publicationState),
    platformUrl: stringOrNull(item.platformUrl ?? item.resourceUrl ?? item.url),
    downloadAvailability: normalizePublicState(item.downloadAvailability ?? item.download?.availability),
    updatedAt: stringOrNull(item.updatedAt ?? item.observedAt)
  });
}

function projectPageInfo(value) {
  if (!isRecord(value)) {
    return emptyPageInfo();
  }

  return Object.freeze({
    page: numberOrNull(value.page),
    pageSize: numberOrNull(value.pageSize ?? value.limit),
    total: numberOrNull(value.total),
    cursor: stringOrNull(value.cursor),
    nextCursor: stringOrNull(value.nextCursor ?? value.endCursor),
    hasNextPage: value.hasNextPage === true
  });
}

function projectDigest(value) {
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  const prefixed = /^([A-Za-z0-9-]+):([A-Fa-f0-9]+)$/.exec(trimmed);
  if (!prefixed) {
    return null;
  }

  return Object.freeze({
    algorithm: prefixed[1].toLowerCase(),
    value: prefixed[2].toLowerCase()
  });
}

function firstString(...values) {
  return values.find((value) => typeof value === "string");
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

function projectVersion(entry) {
  return Object.freeze({
    version: stringOrNull(entry.version),
    observedAt: stringOrNull(entry.observedAt),
    state: normalizePublicState(entry.state),
    desiredStateFingerprintPresent: typeof entry.desiredStateFingerprint === "string"
  });
}

function arrayOfStrings(value) {
  return Object.freeze(Array.isArray(value) ? value.filter((item) => typeof item === "string") : []);
}

function stringOrNull(value) {
  return typeof value === "string" ? value : null;
}

function numberOrNull(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function normalizePublicState(value) {
  return String(value ?? "unknown")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}

function isRecord(value) {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
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
  const basePath = baseUrl.pathname === "/" ? "" : baseUrl.pathname.replace(/\/+$/, "");
  const endpointPath = path.startsWith("/") ? path : `/${path}`;
  const url = new URL(`${basePath}${endpointPath}`, baseUrl);

  for (const [key, value] of Object.entries(params)) {
    if (value === undefined || value === null || value === "") {
      continue;
    }
    url.searchParams.set(key, String(value));
  }

  return url;
}

function pickListParams(params) {
  if (!isRecord(params)) {
    throw new ReadbackError("List resources params must be an object.", { code: "invalid-list-params" });
  }

  const allowed = ["q", "type", "cursor", "limit", "status"];
  const picked = {};

  for (const key of allowed) {
    if (Object.hasOwn(params, key)) {
      if (key === "limit") {
        if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
          picked[key] = normalizeListLimit(params[key]);
        }
      } else if (params[key] !== undefined && params[key] !== null && params[key] !== "") {
        picked[key] = String(params[key]);
      }
    }
  }

  return picked;
}

function normalizeListLimit(value) {
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;

  if (!Number.isInteger(numeric) || numeric < 1 || numeric > 100) {
    throw new ReadbackError("List resources limit must be an integer from 1 to 100.", {
      code: "invalid-list-limit"
    });
  }

  return numeric;
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
