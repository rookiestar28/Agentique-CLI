const DEFAULT_STALE_AFTER_SECONDS = 15 * 60;

const BADGE_STATES = Object.freeze({
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
    .replace(/\s+/g, "-");
}
