export function collectPublicUrlInventoryFindings(inventory, { requirePublicUrls = false } = {}) {
  const failures = new Set();
  const addFailure = (message) => failures.add(message);

  if (!Array.isArray(inventory.entries) || inventory.entries.length === 0) {
    addFailure("inventory must contain URL entries");
  }

  for (const entry of inventory.entries ?? []) {
    if (!entry.id || !entry.label) {
      addFailure("each URL entry needs id and label");
      continue;
    }

    if (entry.advertise === true && entry.status !== "approved") {
      addFailure(`${entry.id}: advertised URL must be approved`);
    }

    if (entry.status === "approved" && (typeof entry.url !== "string" || entry.url.length === 0)) {
      addFailure(`${entry.id}: approved entry must have a URL`);
    }

    if (entry.url !== null && typeof entry.url !== "string") {
      addFailure(`${entry.id}: URL must be null or string`);
    }

    if (typeof entry.url === "string" && entry.url.length > 0) {
      for (const failure of validateHttpsUrl(entry.id, entry.url)) {
        addFailure(failure);
      }
    }
  }

  if (requirePublicUrls) {
    if (inventory.releaseBlocked === true) {
      addFailure("releaseBlocked must be false when public URLs are required");
    }
    for (const entry of inventory.entries ?? []) {
      if (entry.status !== "approved" || entry.advertise !== true) {
        addFailure(`${entry.id}: public URL required but entry is not approved and advertised`);
      }
    }
  }

  return [...failures];
}

function validateHttpsUrl(id, value) {
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") {
      return [`${id}: URL must use HTTPS`];
    }
    return [];
  } catch {
    return [`${id}: URL is invalid`];
  }
}
