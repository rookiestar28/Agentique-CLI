const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

const BADGE_STATES = Object.freeze({
  parsed: {
    state: "parsed",
    label: "Parsed",
    color: "0969da",
    description: "Public readback includes parsed parser metadata."
  },
  partial: {
    state: "partial",
    label: "Parser partial",
    color: "bf8700",
    description: "Public readback shows parser metadata that needs review."
  },
  unsupported: {
    state: "unsupported",
    label: "Parser unsupported",
    color: "6e7781",
    description: "Public readback marks the parser or variant target as unsupported."
  },
  "variant-available": {
    state: "variant-available",
    label: "Variant available",
    color: "0969da",
    description: "Public readback includes a platform variant projection."
  },
  published: {
    state: "published",
    label: "Published",
    color: "2ea44f",
    description: "The platform readback currently marks this resource as published."
  },
  "review-required": {
    state: "review-required",
    label: "Review required",
    color: "bf8700",
    description: "The platform readback requires review before normal public use."
  },
  "rescan-required": {
    state: "rescan-required",
    label: "Rescan required",
    color: "9a6700",
    description: "The platform readback indicates local content should be scanned again before normal public use."
  },
  blocked: {
    state: "blocked",
    label: "Blocked",
    color: "cf222e",
    description: "The platform readback currently blocks normal public use."
  },
  stale: {
    state: "stale",
    label: "Status stale",
    color: "6e7781",
    description: "The last readback is older than the configured freshness window."
  },
  unavailable: {
    state: "unavailable",
    label: "Status unavailable",
    color: "6e7781",
    description: "The readback endpoint could not provide a current status."
  },
  "rate-limited": {
    state: "rate-limited",
    label: "Rate limited",
    color: "8250df",
    description: "The readback endpoint asked the client to retry later."
  }
});

export function createBadgeState(readback, options = {}) {
  if (readback?.code === "rate-limited" || readback?.status === 429) {
    return badge("rate-limited", { retryAfter: readback.retryAfter ?? null });
  }

  if (!readback || readback.code === "unavailable") {
    return badge("unavailable");
  }

  const now = toDate(options.now ?? new Date());
  const staleAfterSeconds = options.staleAfterSeconds ?? DEFAULT_STALE_AFTER_SECONDS;
  const observedAt = readback.observedAt ?? readback.checkedAt ?? readback.updatedAt ?? null;

  if (observedAt && isStale(observedAt, now, staleAfterSeconds)) {
    return badge("stale", { observedAt });
  }

  const parserVariantState = parserVariantBadgeState(readback);
  if (parserVariantState) {
    return badge(parserVariantState, { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }

  const trustState = trustBadgeState(readback);
  if (trustState) {
    return badge(trustState, { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }

  const status = normalizeStatus(readback.status ?? readback.publicationStatus ?? readback.state);

  if (status === "published") {
    return badge("published", { platformUrl: readback.platformUrl ?? readback.url ?? null });
  }

  if (status === "review-required" || status === "review_required" || status === "pending-review") {
    return badge("review-required");
  }

  if (status === "blocked" || status === "quarantined" || status === "rejected") {
    return badge("blocked");
  }

  return badge("unavailable");
}

export function createBadgeMarkdown(readback, options = {}) {
  const state = createBadgeState(readback, options);
  const label = encodeURIComponent(`Agentique-${state.label}`);
  const color = encodeURIComponent(state.color);
  const imageUrl = `https://img.shields.io/badge/${label}-${color}`;
  const targetUrl = state.platformUrl ?? options.platformUrl ?? "https://agentique.io";

  return `[![Agentique readback](${imageUrl})](${targetUrl})`;
}

export function listBadgeStates() {
  return Object.freeze(Object.keys(BADGE_STATES));
}

function badge(state, extras = {}) {
  return Object.freeze({
    ...BADGE_STATES[state],
    ...extras
  });
}

function trustBadgeState(readback) {
  const desiredState = normalizeStatus(readback.desiredState?.readbackState);
  const scannerFreshness = normalizeStatus(readback.scannerPolicy?.freshness);
  const trustPanelState = normalizeStatus(readback.trustPanel?.state);
  const reviewState = normalizeStatus(readback.reviewEligibility?.state);
  const platformState = normalizeStatus(readback.platformProjection?.publicationState);

  if ([trustPanelState, platformState].some((state) => ["blocked", "quarantined", "rejected"].includes(state))) {
    return "blocked";
  }

  if ([desiredState, scannerFreshness, trustPanelState].includes("rescan-required")) {
    return "rescan-required";
  }

  if (
    [desiredState, trustPanelState, platformState].includes("review-required") ||
    reviewState === "needs-evidence" ||
    reviewState === "creator-blocked"
  ) {
    return "review-required";
  }

  if (platformState === "published" || trustPanelState === "current") {
    return "published";
  }

  if ([desiredState, scannerFreshness, trustPanelState, platformState].includes("stale")) {
    return "stale";
  }

  return null;
}

function parserVariantBadgeState(readback) {
  const parserVariant = readback?.parserVariant;
  if (!parserVariant || typeof parserVariant !== "object" || Array.isArray(parserVariant)) {
    return null;
  }

  const parserStatus = normalizeStatus(parserVariant.parserEvidence?.parseStatus);
  const compatibilityStatus = normalizeStatus(parserVariant.compatibility?.status);
  const platformVariants = Array.isArray(parserVariant.platformVariants) ? parserVariant.platformVariants : [];
  const variantStates = platformVariants.map((variant) => normalizeStatus(variant?.state));
  const validationStates = platformVariants.map((variant) => normalizeStatus(variant?.validationState));
  const downloadStates = platformVariants.map((variant) => normalizeStatus(variant?.download?.availability));

  if (
    ["blocked", "failed"].includes(parserStatus) ||
    compatibilityStatus === "blocked" ||
    variantStates.includes("blocked")
  ) {
    return "blocked";
  }

  if (variantStates.includes("stale") || validationStates.includes("stale")) {
    return "stale";
  }

  if (parserStatus === "unsupported" || compatibilityStatus === "unsupported" || variantStates.includes("unsupported")) {
    return "unsupported";
  }

  if (parserStatus === "partial" || compatibilityStatus === "partial" || variantStates.includes("review-required")) {
    return "partial";
  }

  if (
    variantStates.includes("available") ||
    downloadStates.includes("available") ||
    downloadStates.includes("source-only")
  ) {
    return "variant-available";
  }

  if (parserStatus === "parsed") {
    return "parsed";
  }

  return null;
}

function isStale(value, now, staleAfterSeconds) {
  const observedAt = toDate(value);
  const ageMs = now.getTime() - observedAt.getTime();
  return Number.isFinite(ageMs) && ageMs > staleAfterSeconds * 1000;
}

function toDate(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(date.getTime())) {
    return new Date(0);
  }
  return date;
}

function normalizeStatus(value) {
  return String(value ?? "")
    .trim()
    .toLowerCase()
    .replace(/_/g, "-")
    .replace(/\s+/g, "-");
}
