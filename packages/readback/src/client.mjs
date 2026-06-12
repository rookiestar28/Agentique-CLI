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

const PUBLIC_PRIVATE_TERM_KEYS = new Set(["privatemcpboundary", "credentialreferencekind", "credentialvaluespresent"]);

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

  const source = unwrapResourceCollection(normalized);
  const sourceItems = Array.isArray(source.items) ? source.items : [];
  const pageSource = isRecord(source.pageInfo) ? source.pageInfo : normalized.pageInfo;
  const observedSource = source.observedAt ?? source.updatedAt ?? normalized.observedAt ?? normalized.updatedAt;

  return Object.freeze({
    items: Object.freeze(sourceItems.filter(isRecord).map(projectResourceListItem)),
    pageInfo: projectPageInfo(pageSource),
    observedAt: stringOrNull(observedSource)
  });
}

export function normalizeResourceDetail(value) {
  const normalized = normalizePublicReadback(value);
  const detail = unwrapResourceDetail(normalized);
  if (!isRecord(detail)) {
    return Object.freeze({
      resourceId: null,
      slug: null,
      title: null,
      summary: null,
      type: null,
      status: "unavailable",
      platformUrl: null,
      downloadAvailability: "unknown",
      updatedAt: null
    });
  }

  return Object.freeze({
    ...detail,
    resourceId: stringOrNull(detail.resourceId ?? detail.id),
    slug: stringOrNull(detail.slug),
    title: stringOrNull(detail.title ?? detail.name),
    summary: stringOrNull(detail.summary ?? detail.description),
    type: stringOrNull(detail.type ?? detail.resourceType),
    status: normalizePublicState(detail.status ?? detail.state ?? detail.publicationStatus ?? detail.publicationState),
    platformUrl: stringOrNull(detail.platformUrl ?? detail.resourceUrl ?? detail.url),
    downloadAvailability: normalizePublicState(detail.downloadAvailability ?? detail.download?.availability),
    updatedAt: stringOrNull(detail.updatedAt ?? detail.observedAt)
  });
}

export function normalizeDownloadMetadata(value) {
  const normalized = normalizePublicReadback(value);
  if (!isRecord(normalized)) {
    return emptyDownloadMetadata();
  }

  const body = unwrapDownloadMetadataEnvelope(normalized);
  const download = isRecord(body.download) ? body.download : {};
  const file = firstRecord(download.file, body.file, download.files?.[0], body.files?.[0], body.sourcePackage);
  const endpointValue = firstString(
    download.ticketEndpoint,
    body.ticketEndpoint,
    download.downloadEndpoint,
    body.downloadEndpoint,
    download.endpoint,
    body.endpoint,
    download.path,
    body.path
  );
  const rawUrl = firstString(download.url, body.downloadUrl, body.url, file?.url, file?.downloadUrl);
  const projectedUrl = projectPublicDownloadUrl(rawUrl);
  const ticketEndpoint = projectTicketEndpoint(endpointValue);
  const digestValue = firstString(download.digest, body.digest, file?.digest, download.sha256, body.sha256, file?.sha256);
  const digest = projectDigest(digestValue);
  const availability = normalizePublicState(
    download.availability ?? body.availability ?? file?.availability ?? body.status ?? normalized.availability ?? normalized.status ?? normalized.state
  );
  const method = normalizeDownloadMethod(download.method ?? body.method ?? (ticketEndpoint ? "POST" : null));
  const downloadKind = projectDownloadKind({
    availability,
    url: projectedUrl,
    ticketEndpoint,
    method
  });

  return Object.freeze({
    resourceId: stringOrNull(body.resourceId ?? body.id ?? normalized.resourceId ?? normalized.id),
    platformId: stringOrNull(download.platformId ?? body.platformId ?? body.selectedPlatform ?? normalized.platformId),
    artifactKind: stringOrNull(download.artifactKind ?? body.artifactKind ?? file?.artifactKind ?? normalized.artifactKind),
    availability,
    downloadKind,
    method,
    ticketEndpoint,
    url: projectedUrl,
    urlRedacted: typeof rawUrl === "string" && projectedUrl === null,
    filename: stringOrNull(download.filename ?? download.fileName ?? body.filename ?? body.fileName ?? file?.filename ?? file?.fileName),
    mediaType: stringOrNull(
      download.mediaType ?? body.mediaType ?? file?.mediaType ?? download.contentType ?? body.contentType ?? file?.contentType
    ),
    sizeBytes: numberOrNull(
      download.sizeBytes ?? download.size ?? body.sizeBytes ?? body.size ?? file?.sizeBytes ?? file?.size ?? body.contentLength
    ),
    digest,
    digestPresent: typeof digestValue === "string",
    digestValid: typeof digestValue !== "string" || digest !== null,
    reasons: arrayOfStrings(download.reasons ?? body.reasons ?? file?.reasons ?? normalized.reasons),
    unavailableReason: stringOrNull(
      firstString(download.unavailableReason, body.unavailableReason, file?.unavailableReason, download.reason, body.reason)
    ),
    observedAt: stringOrNull(download.observedAt ?? body.observedAt ?? file?.observedAt ?? normalized.observedAt ?? normalized.updatedAt),
    expiresAt: stringOrNull(download.expiresAt ?? body.expiresAt ?? file?.expiresAt ?? normalized.expiresAt)
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

export function normalizeAgentNativeReadback(value) {
  const normalized = normalizePublicReadback(value);
  const agentNative = isRecord(normalized?.agentNative) ? normalized.agentNative : normalized;

  if (!isRecord(agentNative) || !hasAgentNativeReadbackFields(agentNative)) {
    return emptyAgentNativeSummary();
  }

  const namespace = isRecord(agentNative.namespace) ? agentNative.namespace : null;
  const latestPointer = isRecord(namespace?.latestPointer) ? namespace.latestPointer : null;
  const provenanceTrust = isRecord(agentNative.provenanceTrust) ? agentNative.provenanceTrust : null;
  const installGuidance = Array.isArray(agentNative.installGuidance) ? agentNative.installGuidance.filter(isRecord) : [];
  const privateMcpBoundary = isRecord(agentNative.privateMcpBoundary) ? agentNative.privateMcpBoundary : null;
  const resolverResult = isRecord(agentNative.resolverResult) ? agentNative.resolverResult : null;
  const checkpoints = Array.isArray(resolverResult?.checkpoints) ? resolverResult.checkpoints.filter(isRecord) : [];

  return Object.freeze({
    namespace: namespace
      ? Object.freeze({
          namespaceId: stringOrNull(namespace.namespaceId),
          namespaceSlug: stringOrNull(namespace.namespaceSlug),
          resourceCoordinate: stringOrNull(namespace.resourceCoordinate),
          version: stringOrNull(namespace.version),
          latestPointer: latestPointer
            ? Object.freeze({
                state: normalizePublicState(latestPointer.state),
                managedBy: stringOrNull(latestPointer.managedBy),
                version: stringOrNull(latestPointer.version),
                observedAt: stringOrNull(latestPointer.observedAt),
                reasons: arrayOfStrings(latestPointer.reasons)
              })
            : null
        })
      : null,
    provenanceTrust: provenanceTrust
      ? Object.freeze({
          state: normalizePublicState(provenanceTrust.state),
          evidenceTier: normalizePublicState(provenanceTrust.evidenceTier),
          sourceKinds: arrayOfStrings(provenanceTrust.sourceKinds),
          digestPresent: provenanceTrust.digestPresent === true || typeof provenanceTrust.digest === "string",
          nonCertifying: provenanceTrust.nonCertifying === true,
          observedAt: stringOrNull(provenanceTrust.observedAt),
          reasons: arrayOfStrings(provenanceTrust.reasons)
        })
      : null,
    installGuidance: Object.freeze(
      installGuidance.map((target) =>
        Object.freeze({
          targetId: stringOrNull(target.targetId),
          state: normalizePublicState(target.state),
          artifactKind: stringOrNull(target.artifactKind),
          downloadAvailability: normalizePublicState(target.downloadAvailability),
          noExecution: target.noExecution === true,
          observedAt: stringOrNull(target.observedAt),
          reasons: arrayOfStrings(target.reasons)
        })
      )
    ),
    privateMcpBoundary: privateMcpBoundary
      ? Object.freeze({
          availability: normalizePublicState(privateMcpBoundary.availability),
          visibility: normalizePublicState(privateMcpBoundary.visibility),
          credentialReferenceKind: stringOrNull(privateMcpBoundary.credentialReferenceKind),
          credentialValuesPresent: false,
          toolResponseIsolation: privateMcpBoundary.toolResponseIsolation === true,
          observedAt: stringOrNull(privateMcpBoundary.observedAt),
          reasons: arrayOfStrings(privateMcpBoundary.reasons)
        })
      : null,
    resolverResult: resolverResult
      ? Object.freeze({
          state: normalizePublicState(resolverResult.state),
          resourceId: stringOrNull(resolverResult.resourceId),
          confidence: normalizePublicState(resolverResult.confidence),
          relevance: normalizePublicState(resolverResult.relevance),
          ambiguity: normalizePublicState(resolverResult.ambiguity),
          platformUrl: stringOrNull(resolverResult.platformUrl),
          downloadAvailability: normalizePublicState(resolverResult.downloadAvailability),
          checkpointCount: checkpoints.length,
          checkpoints: Object.freeze(
            checkpoints.map((checkpoint) =>
              Object.freeze({
                kind: stringOrNull(checkpoint.kind),
                state: normalizePublicState(checkpoint.state),
                reasons: arrayOfStrings(checkpoint.reasons)
              })
            )
          ),
          nonCertifying: resolverResult.nonCertifying === true,
          observedAt: stringOrNull(resolverResult.observedAt)
        })
      : null,
    observedAt: stringOrNull(agentNative.observedAt ?? normalized?.observedAt ?? normalized?.updatedAt)
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

function emptyAgentNativeSummary() {
  return Object.freeze({
    namespace: null,
    provenanceTrust: null,
    installGuidance: Object.freeze([]),
    privateMcpBoundary: null,
    resolverResult: null,
    observedAt: null
  });
}

function hasAgentNativeReadbackFields(value) {
  return [
    "namespace",
    "provenanceTrust",
    "installGuidance",
    "privateMcpBoundary",
    "resolverResult",
    "observedAt"
  ].some((key) => Object.hasOwn(value, key));
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
    downloadKind: "unavailable",
    method: null,
    ticketEndpoint: null,
    url: null,
    urlRedacted: false,
    filename: null,
    mediaType: null,
    sizeBytes: null,
    digest: null,
    digestPresent: false,
    digestValid: true,
    reasons: Object.freeze([]),
    unavailableReason: null,
    observedAt: null,
    expiresAt: null
  });
}

function unwrapDownloadMetadataEnvelope(normalized) {
  if (!isRecord(normalized)) {
    return normalized;
  }
  const data = normalized.data;
  if (isRecord(data) && !Array.isArray(data)) {
    return { ...data, availability: data.availability ?? normalized.availability };
  }
  return normalized;
}

function firstRecord(...values) {
  return values.find(isRecord) ?? {};
}

function normalizeDownloadMethod(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const method = value.trim().toUpperCase();
  return /^[A-Z]+$/.test(method) ? method : null;
}

function projectDownloadKind({ availability, url, ticketEndpoint, method }) {
  if (availability !== "available") {
    return "unavailable";
  }
  if (url) {
    return "direct";
  }
  if (ticketEndpoint && method) {
    return "ticket";
  }
  return "unknown";
}

function projectPublicDownloadUrl(value) {
  if (typeof value !== "string") {
    return null;
  }
  let parsed;
  try {
    parsed = new URL(value);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
    return null;
  }
  if (hasSensitiveQuery(parsed)) {
    return null;
  }
  parsed.hash = "";
  return parsed.href;
}

function projectTicketEndpoint(value) {
  if (typeof value !== "string" || value.trim() === "") {
    return null;
  }
  const trimmed = value.trim();
  if (trimmed.startsWith("/")) {
    return trimmed.split("#")[0].split("?")[0];
  }
  let parsed;
  try {
    parsed = new URL(trimmed);
  } catch {
    return null;
  }
  if (parsed.protocol !== "https:" && !(parsed.protocol === "http:" && isLoopbackHost(parsed.hostname))) {
    return null;
  }
  if (hasSensitiveQuery(parsed)) {
    return null;
  }
  parsed.search = "";
  parsed.hash = "";
  return parsed.href;
}

function hasSensitiveQuery(url) {
  for (const key of url.searchParams.keys()) {
    if (/^(sig|signature|token|expires|x-amz-|x-goog-|authorization|credential|policy)/i.test(key)) {
      return true;
    }
  }
  return false;
}

function isLoopbackHost(hostname) {
  return hostname === "localhost" || hostname === "127.0.0.1" || hostname === "[::1]";
}

function unwrapResourceCollection(normalized) {
  if (Array.isArray(normalized)) {
    return { items: normalized, pageInfo: null, observedAt: null, updatedAt: null };
  }
  if (!isRecord(normalized)) {
    return { items: [], pageInfo: null, observedAt: null, updatedAt: null };
  }
  if (Array.isArray(normalized.items)) {
    return normalized;
  }
  if (Array.isArray(normalized.resources)) {
    return { ...normalized, items: normalized.resources };
  }
  const data = normalized.data;
  if (Array.isArray(data)) {
    return { ...normalized, items: data };
  }
  if (isRecord(data)) {
    if (Array.isArray(data.items)) {
      return { ...data, items: data.items, pageInfo: data.pageInfo ?? normalized.pageInfo };
    }
    if (Array.isArray(data.resources)) {
      return { ...data, items: data.resources, pageInfo: data.pageInfo ?? normalized.pageInfo };
    }
  }
  return { ...normalized, items: [] };
}

function unwrapResourceDetail(normalized) {
  if (!isRecord(normalized)) {
    return normalized;
  }
  const data = normalized.data;
  if (isRecord(data) && !Array.isArray(data)) {
    return data;
  }
  return normalized;
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
  // These exact schema keys are public labels; broad filtering still drops actual credential values.
  if (PUBLIC_PRIVATE_TERM_KEYS.has(normalized)) {
    return false;
  }

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
