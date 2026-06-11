import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReadbackError,
  assertReadOnlyClientSurface,
  createBadgeMarkdown,
  createBadgeState,
  createReadbackClient,
  listBadgeStates,
  normalizeAgentNativeReadback,
  normalizeDownloadMetadata,
  normalizeParserVariantReadback,
  normalizePublicReadback,
  normalizeResourceDetail,
  normalizeResourceList,
  normalizeTrustReadback
} from "../src/index.mjs";

function jsonResponse(payload, options = {}) {
  const headers = new Map(Object.entries(options.headers ?? {}));
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get(name) {
        return headers.get(name.toLowerCase()) ?? null;
      }
    },
    async json() {
      return payload;
    }
  };
}

function invalidJsonResponse(options = {}) {
  return {
    ok: options.ok ?? true,
    status: options.status ?? 200,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      throw new SyntaxError("Unexpected token");
    }
  };
}

describe("read-only client", () => {
  it("exposes only readback methods", () => {
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => jsonResponse({})
    });

    assert.deepEqual(assertReadOnlyClientSurface(client), [
      "getStatus",
      "listResources",
      "getResource",
      "getDownloadMetadata",
      "getReadback",
      "getContextBundle",
      "getSelectionReadback"
    ]);
  });

  it("uses GET requests and local query allowlist", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example/base/",
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return jsonResponse({ items: [] });
      }
    });

    await client.listResources({ q: "agent", limit: 10, token: "ignored" });

    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].url, "https://agentique.example/base/api/public/v1/resources?q=agent&limit=10");
  });

  it("uses the full resource list query allowlist and validates limits before network access", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example/base/",
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return jsonResponse({ items: [] });
      }
    });

    await client.listResources({
      q: "assistant",
      type: "skill",
      cursor: "next-page",
      limit: "25",
      status: "published",
      token: "ignored"
    });

    assert.equal(calls[0].options.method, "GET");
    assert.equal(
      calls[0].url,
      "https://agentique.example/base/api/public/v1/resources?q=assistant&type=skill&cursor=next-page&limit=25&status=published"
    );

    assert.throws(
      () => client.listResources({ limit: 0 }),
      (error) => error instanceof ReadbackError && error.code === "invalid-list-limit"
    );
    assert.equal(calls.length, 1);
  });

  it("omits empty resource list query params before request construction", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({ items: [] });
      }
    });

    await client.listResources({ q: "", type: null, status: undefined, cursor: "", limit: null });

    assert.deepEqual(calls, ["https://agentique.example/api/public/v1/resources"]);
  });

  it("uses versioned public resource paths for every method", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example/base/",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({});
      }
    });

    await client.getStatus("agent 1");
    await client.listResources();
    await client.getResource("agent 1");
    await client.getDownloadMetadata("agent 1");
    await client.getReadback("agent 1");
    await client.getContextBundle("agent 1");
    await client.getSelectionReadback("agent 1");

    assert.deepEqual(calls, [
      "https://agentique.example/base/api/public/v1/resources/agent%201/status",
      "https://agentique.example/base/api/public/v1/resources",
      "https://agentique.example/base/api/public/v1/resources/agent%201",
      "https://agentique.example/base/api/public/v1/resources/agent%201/download",
      "https://agentique.example/base/api/public/v1/resources/agent%201/readback",
      "https://agentique.example/base/api/public/v1/resources/agent%201/context-bundle",
      "https://agentique.example/base/api/public/v1/resources/agent%201/selection-readback"
    ]);

    for (const url of calls) {
      assert.doesNotMatch(url, /\/api\/public\/resources(?:\/|\?|$)/);
    }
  });

  it("preserves the base URL host when the base path is root", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async (url) => {
        calls.push(String(url));
        return jsonResponse({ items: [] });
      }
    });

    await client.listResources();
    await client.getResource("agent-1");

    assert.deepEqual(calls, [
      "https://agentique.example/api/public/v1/resources",
      "https://agentique.example/api/public/v1/resources/agent-1"
    ]);
  });

  it("uses GET requests and query allowlists for context and selection helpers", async () => {
    const calls = [];
    const client = createReadbackClient({
      baseUrl: "https://agentique.example/base/",
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return jsonResponse({ items: [] });
      }
    });

    await client.getContextBundle("agent-1", {
      intent: "research",
      audience: "agent",
      limit: 2,
      token: "ignored",
      scannerThreshold: "ignored"
    });
    await client.getSelectionReadback("agent-1", {
      intent: "research",
      audience: "agent",
      limit: 2,
      cursor: "next",
      token: "ignored"
    });

    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[1].options.method, "GET");
    assert.equal(
      calls[0].url,
      "https://agentique.example/base/api/public/v1/resources/agent-1/context-bundle?intent=research&audience=agent&limit=2"
    );
    assert.equal(
      calls[1].url,
      "https://agentique.example/base/api/public/v1/resources/agent-1/selection-readback?intent=research&audience=agent&limit=2&cursor=next"
    );
  });

  it("normalizes public readback and filters private projection fields", async () => {
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () =>
        jsonResponse({
          id: "agent-1",
          status: "published",
          storageKey: "hidden",
          nested: {
            privateReviewNotes: "hidden",
            title: "Visible"
          }
        })
    });

    const payload = await client.getReadback("agent-1");

    assert.deepEqual(payload, {
      id: "agent-1",
      status: "published",
      nested: {
        title: "Visible"
      }
    });
  });

  it("normalizes context bundle and selection readback projections", async () => {
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async (url) => {
        if (String(url).endsWith("/context-bundle")) {
          return jsonResponse({
            bundleId: "bundle-1",
            items: [
              {
                title: "Visible",
                privateReviewNotes: "hidden"
              }
            ],
            rawScanResults: "hidden"
          });
        }
        return jsonResponse({
          resourceId: "agent-1",
          selectionReason: "Visible public reason.",
          ["secret" + "Value"]: "hidden",
          nested: {
            credential: "hidden",
            title: "Visible"
          }
        });
      }
    });

    assert.deepEqual(await client.getContextBundle("agent-1"), {
      bundleId: "bundle-1",
      items: [
        {
          title: "Visible"
        }
      ]
    });
    assert.deepEqual(await client.getSelectionReadback("agent-1"), {
      resourceId: "agent-1",
      selectionReason: "Visible public reason.",
      nested: {
        title: "Visible"
      }
    });
  });

  it("wraps invalid JSON responses in typed readback errors", async () => {
    const client = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => invalidJsonResponse({ status: 200 })
    });

    await assert.rejects(
      () => client.getReadback("agent-1"),
      (error) => error instanceof ReadbackError && error.code === "invalid-json" && error.status === 200
    );
  });

  it("rejects unsafe non-loopback base URLs", () => {
    assert.throws(
      () => createReadbackClient({ baseUrl: "http://agentique.example", fetchImpl: async () => jsonResponse({}) }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-base-url"
    );
  });

  it("reports rate limit and unavailable failures", async () => {
    const rateLimited = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => jsonResponse({}, { ok: false, status: 429, headers: { "retry-after": "30" } })
    });

    await assert.rejects(
      () => rateLimited.getStatus("agent-1"),
      (error) => error instanceof ReadbackError && error.code === "rate-limited" && error.retryAfter === "30"
    );

    const notFound = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => jsonResponse({}, { ok: false, status: 404 })
    });

    await assert.rejects(
      () => notFound.getDownloadMetadata("missing-agent"),
      (error) => error instanceof ReadbackError && error.code === "not-found" && error.status === 404
    );

    const serverUnavailable = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => jsonResponse({}, { ok: false, status: 503, headers: { "retry-after": "60" } })
    });

    await assert.rejects(
      () => serverUnavailable.listResources(),
      (error) =>
        error instanceof ReadbackError &&
        error.code === "unavailable" &&
        error.status === 503 &&
        error.retryAfter === "60"
    );

    const unavailable = createReadbackClient({
      baseUrl: "https://agentique.example",
      fetchImpl: async () => {
        throw new Error("network");
      }
    });

    await assert.rejects(
      () => unavailable.getStatus("agent-1"),
      (error) => error instanceof ReadbackError && error.code === "unavailable"
    );
  });
});

describe("badge states", () => {
  it("covers expected state names", () => {
    assert.deepEqual(listBadgeStates(), [
      "parsed",
      "partial",
      "unsupported",
      "variant-available",
      "agent-native-ready",
      "agent-native-review-required",
      "agent-native-private-denied",
      "agent-native-ambiguous",
      "published",
      "review-required",
      "rescan-required",
      "blocked",
      "stale",
      "unavailable",
      "rate-limited"
    ]);
  });

  it("maps published, review-required, and blocked states", () => {
    assert.equal(createBadgeState({ status: "published" }).state, "published");
    assert.equal(createBadgeState({ status: "review required" }).state, "review-required");
    assert.equal(createBadgeState({ status: "quarantined" }).state, "blocked");
    assert.equal(createBadgeState({ platformProjection: { publicationState: "published" } }).state, "published");
    assert.equal(createBadgeState({ desiredState: { readbackState: "review-required" } }).state, "review-required");
    assert.equal(createBadgeState({ trustPanel: { state: "blocked" } }).state, "blocked");
  });

  it("maps trust projection rescan and review eligibility states", () => {
    assert.equal(createBadgeState({ desiredState: { readbackState: "rescan-required" } }).state, "rescan-required");
    assert.equal(createBadgeState({ scannerPolicy: { freshness: "rescan-required" } }).state, "rescan-required");
    assert.equal(createBadgeState({ reviewEligibility: { state: "needs-evidence" } }).state, "review-required");
  });

  it("maps stale, unavailable, and rate-limited states", () => {
    assert.equal(
      createBadgeState(
        { status: "published", observedAt: "2026-05-28T07:00:00.000Z" },
        { now: "2026-05-28T07:30:01.000Z", staleAfterSeconds: 1800 }
      ).state,
      "stale"
    );
    assert.equal(createBadgeState(null).state, "unavailable");
    assert.equal(createBadgeState({ code: "rate-limited", retryAfter: "60" }).state, "rate-limited");
  });

  it("maps parser and variant projection states", () => {
    assert.equal(createBadgeState({ parserVariant: parserVariantReadback({ platformVariants: [] }) }).state, "parsed");
    assert.equal(createBadgeState({ parserVariant: parserVariantReadback() }).state, "variant-available");
    assert.equal(
      createBadgeState({
        parserVariant: parserVariantReadback({
          parseStatus: "partial",
          compatibilityStatus: "partial"
        })
      }).state,
      "partial"
    );
    assert.equal(
      createBadgeState({
        parserVariant: parserVariantReadback({
          parseStatus: "unsupported",
          compatibilityStatus: "unsupported",
          platformVariants: [platformVariantReadback({ state: "unsupported", downloadAvailability: "unavailable" })]
        })
      }).state,
      "unsupported"
    );
    assert.equal(
      createBadgeState({
        parserVariant: parserVariantReadback({
          parseStatus: "blocked",
          compatibilityStatus: "blocked",
          platformVariants: [platformVariantReadback({ state: "blocked", downloadAvailability: "blocked" })]
        })
      }).state,
      "blocked"
    );
    assert.equal(
      createBadgeState({
        parserVariant: parserVariantReadback({
          platformVariants: [platformVariantReadback({ state: "stale", validationState: "stale" })]
        })
      }).state,
      "stale"
    );
  });

  it("maps agent-native projection states", () => {
    assert.equal(
      createBadgeState({
        agentNative: agentNativeReadback({
          checkpoints: [
            {
              kind: "namespace",
              state: "passed",
              reasons: []
            },
            {
              kind: "download",
              state: "passed",
              reasons: ["source-only"]
            }
          ]
        })
      }).state,
      "agent-native-ready"
    );
    assert.equal(
      createBadgeState({
        agentNative: agentNativeReadback({
          provenanceState: "stale",
          resolverState: "review-required",
          ambiguity: "manual-review-required"
        })
      }).state,
      "agent-native-review-required"
    );
    assert.equal(
      createBadgeState({
        agentNative: agentNativeReadback({
          privateAvailability: "private-denied",
          privateVisibility: "private-denied",
          resolverState: "matched",
          ambiguity: "none"
        })
      }).state,
      "agent-native-private-denied"
    );
    assert.equal(
      createBadgeState({
        agentNative: agentNativeReadback({
          resolverState: "ambiguous",
          ambiguity: "alternatives-available",
          privateAvailability: "not-available",
          checkpoints: [
            {
              kind: "namespace",
              state: "passed",
              reasons: []
            },
            {
              kind: "ambiguity",
              state: "passed",
              reasons: ["alternatives-visible"]
            }
          ]
        })
      }).state,
      "agent-native-ambiguous"
    );
  });

  it("does not use strong safety or approval wording in badge output", () => {
    const states = [
      createBadgeState({ parserVariant: parserVariantReadback() }),
      createBadgeState({ parserVariant: parserVariantReadback({ parseStatus: "partial" }) }),
      createBadgeState({ parserVariant: parserVariantReadback({ parseStatus: "unsupported" }) }),
      createBadgeState({ agentNative: agentNativeReadback() }),
      createBadgeState({ agentNative: agentNativeReadback({ resolverState: "ambiguous", ambiguity: "alternatives-available" }) }),
      createBadgeState({
        agentNative: agentNativeReadback({ privateAvailability: "private-denied", privateVisibility: "private-denied" })
      }),
      createBadgeState({ status: "published" }),
      createBadgeState({ status: "review required" }),
      createBadgeState({ scannerPolicy: { freshness: "rescan-required" } }),
      createBadgeState({ status: "blocked" }),
      createBadgeState(null),
      createBadgeState({ code: "rate-limited" })
    ];
    const text = JSON.stringify(states) + createBadgeMarkdown({ status: "published" });

    assert.doesNotMatch(text, /certified|approved|guarantee/i);
  });
});

describe("normalizer", () => {
  it("normalizes resource list payloads into a stable catalog summary", () => {
    assert.deepEqual(
      normalizeResourceList({
        items: [
          {
            id: "agent-1",
            slug: "agent-one",
            title: "Agent One",
            description: "Visible summary.",
            type: "skill",
            state: "published",
            resourceUrl: "https://agentique.io/resources/agent-one",
            download: {
              availability: "source-only"
            },
            storageKey: "hidden",
            updatedAt: "2026-06-07T01:00:00.000Z"
          }
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          total: 60,
          cursor: "cursor-1",
          nextCursor: "cursor-2",
          hasNextPage: true
        },
        privateReviewNotes: "hidden",
        observedAt: "2026-06-07T01:01:00.000Z"
      }),
      {
        items: [
          {
            resourceId: "agent-1",
            slug: "agent-one",
            title: "Agent One",
            summary: "Visible summary.",
            type: "skill",
            status: "published",
            platformUrl: "https://agentique.io/resources/agent-one",
            downloadAvailability: "source-only",
            updatedAt: "2026-06-07T01:00:00.000Z"
          }
        ],
        pageInfo: {
          page: 1,
          pageSize: 1,
          total: 60,
          cursor: "cursor-1",
          nextCursor: "cursor-2",
          hasNextPage: true
        },
        observedAt: "2026-06-07T01:01:00.000Z"
      }
    );
  });

  it("unwraps live top-level data array resource lists", () => {
    assert.deepEqual(
      normalizeResourceList({
        ok: true,
        version: "public-v1",
        data: [
          {
            id: "resource-1",
            title: "Resource One",
            summary: "Visible summary.",
            resourceType: "agent",
            status: "published",
            privateReviewNotes: "hidden",
            observedAt: "2026-06-07T01:03:00.000Z"
          }
        ],
        pageInfo: {
          page: 1,
          pageSize: 3,
          total: 84,
          nextCursor: "cursor-next",
          hasNextPage: true
        },
        observedAt: "2026-06-07T01:04:00.000Z"
      }),
      {
        items: [
          {
            resourceId: "resource-1",
            slug: null,
            title: "Resource One",
            summary: "Visible summary.",
            type: "agent",
            status: "published",
            platformUrl: null,
            downloadAvailability: "unknown",
            updatedAt: "2026-06-07T01:03:00.000Z"
          }
        ],
        pageInfo: {
          page: 1,
          pageSize: 3,
          total: 84,
          cursor: null,
          nextCursor: "cursor-next",
          hasNextPage: true
        },
        observedAt: "2026-06-07T01:04:00.000Z"
      }
    );
  });

  it("unwraps nested data.items and data.resources resource lists", () => {
    assert.equal(
      normalizeResourceList({
        data: {
          items: [{ id: "item-1", title: "Item One", status: "published" }]
        }
      }).items[0].resourceId,
      "item-1"
    );
    assert.equal(
      normalizeResourceList({
        data: {
          resources: [{ resourceId: "resource-2", name: "Resource Two", state: "published" }]
        }
      }).items[0].title,
      "Resource Two"
    );
  });

  it("unwraps live top-level data object resource details without leaking private fields", () => {
    const detail = normalizeResourceDetail({
      ok: true,
      data: {
        id: "resource-detail",
        title: "Resource Detail",
        summary: "Visible detail.",
        resourceType: "agent",
        publicationStatus: "published",
        platformUrl: "https://agentique.example/resources/resource-detail",
        storageKey: "hidden",
        nested: {
          credential: "hidden",
          visible: true
        },
        observedAt: "2026-06-07T01:05:00.000Z"
      },
      privateReviewNotes: "hidden"
    });

    assert.equal(detail.resourceId, "resource-detail");
    assert.equal(detail.title, "Resource Detail");
    assert.equal(detail.type, "agent");
    assert.equal(detail.status, "published");
    assert.equal(detail.platformUrl, "https://agentique.example/resources/resource-detail");
    assert.deepEqual(detail.nested, { visible: true });
    assert.equal(JSON.stringify(detail).includes("hidden"), false);
  });

  it("returns fail-closed resource summaries for malformed live envelopes", () => {
    assert.deepEqual(normalizeResourceList({ data: { unexpected: true } }), {
      items: [],
      pageInfo: {
        page: null,
        pageSize: null,
        total: null,
        cursor: null,
        nextCursor: null,
        hasNextPage: false
      },
      observedAt: null
    });
    assert.equal(normalizeResourceDetail({ data: [] }).status, "unknown");
  });

  it("normalizes download metadata without leaking private storage fields", () => {
    const normalized = normalizeDownloadMetadata({
      resourceId: "agent-1",
      platformId: "codex",
      artifactKind: "skill",
      download: {
        availability: "available",
        url: "https://agentique.io/downloads/agent-1.zip",
        filename: "agent-1.zip",
        mediaType: "application/zip",
        sizeBytes: 42,
        digest: `sha256:${"a".repeat(64)}`,
        reasons: ["published"],
        objectPath: "hidden",
        observedAt: "2026-06-07T01:02:00.000Z",
        expiresAt: "2026-06-07T02:02:00.000Z"
      },
      privateUrl: "hidden"
    });

    assert.deepEqual(normalized, {
      resourceId: "agent-1",
      platformId: "codex",
      artifactKind: "skill",
      availability: "available",
      downloadKind: "direct",
      method: null,
      ticketEndpoint: null,
      url: "https://agentique.io/downloads/agent-1.zip",
      urlRedacted: false,
      filename: "agent-1.zip",
      mediaType: "application/zip",
      sizeBytes: 42,
      digest: {
        algorithm: "sha256",
        value: "a".repeat(64)
      },
      digestPresent: true,
      digestValid: true,
      reasons: ["published"],
      unavailableReason: null,
      observedAt: "2026-06-07T01:02:00.000Z",
      expiresAt: "2026-06-07T02:02:00.000Z"
    });
    assert.equal(JSON.stringify(normalized).includes("hidden"), false);
  });

  it("normalizes live ticket download metadata without exposing raw URLs", () => {
    const normalized = normalizeDownloadMetadata({
      ok: true,
      availability: "available",
      data: {
        resourceId: "agent-ticket",
        selectedPlatform: "source-package",
        status: "published",
        method: "POST",
        downloadEndpoint: "/api/agents/agent-ticket/download?ignored=true",
        files: [
          {
            filename: "agent-ticket.zip",
            mediaType: "application/zip",
            sizeBytes: 64,
            digest: `sha256:${"b".repeat(64)}`,
            privateUrl: "hidden"
          }
        ],
        sourcePackage: {
          objectPath: "hidden"
        }
      }
    });

    assert.deepEqual(normalized, {
      resourceId: "agent-ticket",
      platformId: "source-package",
      artifactKind: null,
      availability: "available",
      downloadKind: "ticket",
      method: "POST",
      ticketEndpoint: "/api/agents/agent-ticket/download",
      url: null,
      urlRedacted: false,
      filename: "agent-ticket.zip",
      mediaType: "application/zip",
      sizeBytes: 64,
      digest: {
        algorithm: "sha256",
        value: "b".repeat(64)
      },
      digestPresent: true,
      digestValid: true,
      reasons: [],
      unavailableReason: null,
      observedAt: null,
      expiresAt: null
    });
    assert.equal(JSON.stringify(normalized).includes("hidden"), false);
  });

  it("redacts signed direct URLs from metadata projection", () => {
    const normalized = normalizeDownloadMetadata({
      resourceId: "agent-signed",
      download: {
        availability: "available",
        url: "https://storage.agentique.example/files/agent.zip?sig=private",
        filename: "agent.zip"
      }
    });

    assert.equal(normalized.downloadKind, "unknown");
    assert.equal(normalized.url, null);
    assert.equal(normalized.urlRedacted, true);
    assert.equal(normalized.filename, "agent.zip");
    assert.doesNotMatch(JSON.stringify(normalized), /sig=private|storage\.agentique/i);
  });

  it("normalizes unavailable and malformed download metadata as fail-closed summaries", () => {
    assert.deepEqual(normalizeDownloadMetadata({ download: { availability: "unavailable", digest: "bad-digest" } }), {
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
      digestPresent: true,
      digestValid: false,
      reasons: [],
      unavailableReason: null,
      observedAt: null,
      expiresAt: null
    });
  });

  it("normalizes public trust readback fields into a stable summary", () => {
    assert.deepEqual(
      normalizeTrustReadback({
        platformProjection: {
          publicationState: "published"
        },
        desiredState: {
          fingerprint: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          readbackState: "unchanged",
          reasons: ["current"]
        },
        scannerPolicy: {
          policyVersion: "policy-v1",
          freshness: "current",
          rawScanResults: "hidden"
        },
        reviewEligibility: {
          state: "eligible",
          evidenceTypes: ["download"],
          privateReviewNotes: "hidden"
        },
        trustPanel: {
          state: "current",
          messages: ["Public readback shows current platform state."],
          versionHistoryUrl: "https://agentique.io/resources/example-resource/versions",
          privateOperatorNote: "hidden"
        },
        versionHistory: [
          {
            version: "1.0.0",
            observedAt: "2026-06-06T00:00:00.000Z",
            state: "current",
            desiredStateFingerprint: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
            storageKey: "hidden"
          }
        ],
        reportActionState: "available"
      }),
      {
        platformState: "published",
        desiredState: {
          state: "unchanged",
          fingerprintPresent: true,
          reasons: ["current"]
        },
        scannerPolicy: {
          policyVersion: "policy-v1",
          freshness: "current"
        },
        trustPanel: {
          state: "current",
          messages: ["Public readback shows current platform state."],
          versionHistoryUrl: "https://agentique.io/resources/example-resource/versions"
        },
        reviewEligibility: {
          state: "eligible",
          evidenceTypes: ["download"],
          reasons: []
        },
        reportActionState: "available",
        versionHistory: [
          {
            version: "1.0.0",
            observedAt: "2026-06-06T00:00:00.000Z",
            state: "current",
            desiredStateFingerprintPresent: true
          }
        ]
      }
    );
  });

  it("keeps legacy trust readback payloads compatible", () => {
    assert.deepEqual(normalizeTrustReadback({ status: "review required" }), {
      platformState: "review-required",
      desiredState: null,
      scannerPolicy: null,
      trustPanel: null,
      reviewEligibility: null,
      reportActionState: null,
      versionHistory: []
    });
  });

  it("normalizes parser variant readback without exposing raw evidence", () => {
    const normalized = normalizeParserVariantReadback({
      resourceId: "example-resource",
      updatedAt: "2026-06-07T00:00:00.000Z",
      parserVariant: {
        observedAt: "2026-06-07T00:01:00.000Z",
        parserEvidence: {
          sourceEcosystem: "mcp",
          sourceFormat: "json",
          parseStatus: "parsed",
          parseConfidence: "high",
          sanitizerStatus: "passed",
          noExecution: true,
          inputDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111",
          outputDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222",
          privateReviewNotes: "hidden"
        },
        resourceGraphSummary: {
          sanitized: true,
          nodeCount: 2,
          edgeCount: 1,
          capabilityCount: 1,
          sourceFileCount: 1,
          summaryDigest: "sha256:3333333333333333333333333333333333333333333333333333333333333333",
          storageKey: "hidden"
        },
        compatibility: {
          status: "compatible",
          reasons: ["static-contract"]
        },
        platformVariants: [
          {
            platformId: "mcp",
            artifactKind: "metadata",
            state: "available",
            validationState: "not-run",
            variantDigest: "sha256:4444444444444444444444444444444444444444444444444444444444444444",
            download: {
              availability: "source-only",
              url: "https://agentique.io/resources/example-resource/download",
              digest: "sha256:5555555555555555555555555555555555555555555555555555555555555555",
              objectPath: "hidden"
            },
            reasons: ["source-only"],
            observedAt: "2026-06-07T00:02:00.000Z"
          }
        ],
        __proto__: {
          polluted: true
        }
      }
    });

    assert.deepEqual(normalized, {
      parserEvidence: {
        sourceEcosystem: "mcp",
        sourceFormat: "json",
        parseStatus: "parsed",
        parseConfidence: "high",
        sanitizerStatus: "passed",
        noExecution: true,
        inputDigestPresent: true,
        outputDigestPresent: true,
        issueCount: 0
      },
      resourceGraphSummary: {
        sanitized: true,
        nodeCount: 2,
        edgeCount: 1,
        capabilityCount: 1,
        sourceFileCount: 1,
        summaryDigestPresent: true
      },
      compatibility: {
        status: "compatible",
        reasons: ["static-contract"]
      },
      platformVariants: [
        {
          platformId: "mcp",
          artifactKind: "metadata",
          state: "available",
          validationState: "not-run",
          downloadAvailability: "source-only",
          downloadUrl: "https://agentique.io/resources/example-resource/download",
          variantDigestPresent: true,
          downloadDigestPresent: true,
          reasons: ["source-only"],
          observedAt: "2026-06-07T00:02:00.000Z"
        }
      ],
      observedAt: "2026-06-07T00:01:00.000Z"
    });
    assert.equal(JSON.stringify(normalized).includes("sha256:"), false);
    assert.equal(JSON.stringify(normalized).includes("hidden"), false);
    assert.equal({}.polluted, undefined);
  });

  it("normalizes direct parser variant objects and unavailable parser variants", () => {
    assert.equal(
      normalizeParserVariantReadback(parserVariantReadback({ sourceEcosystem: "dify", sourceFormat: "yaml" })).parserEvidence
        .sourceEcosystem,
      "dify"
    );
    assert.deepEqual(normalizeParserVariantReadback({ status: "published" }), {
      parserEvidence: null,
      resourceGraphSummary: null,
      compatibility: null,
      platformVariants: [],
      observedAt: null
    });
  });

  it("normalizes agent-native readback without exposing raw evidence or credentials", () => {
    const normalized = normalizeAgentNativeReadback({
      resourceId: "example-resource",
      updatedAt: "2026-06-11T00:08:00.000Z",
      agentNative: {
        ...agentNativeReadback(),
        provenanceTrust: {
          ...agentNativeReadback().provenanceTrust,
          digest: "sha256:9999999999999999999999999999999999999999999999999999999999999999"
        },
        privateMcpBoundary: {
          ...agentNativeReadback().privateMcpBoundary,
          credentialReferenceValue: "hidden-secret"
        },
        resolverResult: {
          ...agentNativeReadback().resolverResult,
          rawRankingEvidence: "hidden"
        },
        privateReviewNotes: "hidden"
      }
    });

    assert.deepEqual(normalized, {
      namespace: {
        namespaceId: "agentique.examples",
        namespaceSlug: "agentique-examples",
        resourceCoordinate: "agentique.examples/source-reviewer",
        version: "1.0.0",
        latestPointer: {
          state: "current",
          managedBy: "platform",
          version: "1.0.0",
          observedAt: "2026-06-11T00:02:00.000Z",
          reasons: []
        }
      },
      provenanceTrust: {
        state: "current",
        evidenceTier: "sbom-present",
        sourceKinds: ["source-url", "sbom"],
        digestPresent: true,
        nonCertifying: true,
        observedAt: "2026-06-11T00:03:00.000Z",
        reasons: ["public-evidence-present"]
      },
      installGuidance: [
        {
          targetId: "codex",
          state: "source-only",
          artifactKind: "skill",
          downloadAvailability: "source-only",
          noExecution: true,
          observedAt: "2026-06-11T00:04:00.000Z",
          reasons: ["manual-review-required"]
        }
      ],
      privateMcpBoundary: {
        availability: "not-available",
        visibility: "public-metadata-only",
        credentialReferenceKind: "none",
        credentialValuesPresent: false,
        toolResponseIsolation: true,
        observedAt: "2026-06-11T00:05:00.000Z",
        reasons: ["no-public-credential-values"]
      },
      resolverResult: {
        state: "matched",
        resourceId: "example-resource",
        confidence: "medium",
        relevance: "medium",
        ambiguity: "none",
        platformUrl: "https://agentique.io/resources/example-resource",
        downloadAvailability: "source-only",
        checkpointCount: 2,
        checkpoints: [
          {
            kind: "namespace",
            state: "passed",
            reasons: []
          },
          {
            kind: "download",
            state: "review-required",
            reasons: ["source-only"]
          }
        ],
        nonCertifying: true,
        observedAt: "2026-06-11T00:06:00.000Z"
      },
      observedAt: "2026-06-11T00:07:00.000Z"
    });
    assert.equal(JSON.stringify(normalized).includes("sha256:"), false);
    assert.equal(JSON.stringify(normalized).includes("hidden"), false);
  });

  it("normalizes direct agent-native objects and unavailable agent-native readback", () => {
    assert.equal(normalizeAgentNativeReadback(agentNativeReadback()).namespace.namespaceId, "agentique.examples");
    assert.deepEqual(normalizeAgentNativeReadback({ status: "published" }), {
      namespace: null,
      provenanceTrust: null,
      installGuidance: [],
      privateMcpBoundary: null,
      resolverResult: null,
      observedAt: null
    });
  });

  it("preserves public projection keys that contain formerly ambiguous terms", () => {
    assert.deepEqual(
      normalizePublicReadback({
        internalId: "public-internal-stable-id",
        storageUsage: {
          bytes: 1024,
          files: 2
        },
        deploymentDate: "2026-05-31T00:00:00.000Z",
        tokenCount: 128,
        objectType: "skill",
        storageMode: "metadata_view"
      }),
      {
        internalId: "public-internal-stable-id",
        storageUsage: {
          bytes: 1024,
          files: 2
        },
        deploymentDate: "2026-05-31T00:00:00.000Z",
        tokenCount: 128,
        objectType: "skill",
        storageMode: "metadata_view"
      }
    );
  });

  it("filters private projection fields recursively", () => {
    assert.deepEqual(
      normalizePublicReadback({
        visible: true,
        objectPath: "hidden",
        accessToken: "hidden",
        items: [
          {
            title: "Visible",
            ["secret" + "Value"]: "hidden",
            storageMode: "metadata_view"
          }
        ]
      }),
      {
        visible: true,
        items: [
          {
            title: "Visible",
            storageMode: "metadata_view"
          }
        ]
      }
    );
  });

  it("filters prototype pollution keys recursively", () => {
    const payload = JSON.parse(
      [
        "{",
        '"visible":true,',
        '"__proto__":{"polluted":true},',
        '"constructor":{"prototype":{"polluted":true}},',
        '"prototype":{"polluted":true},',
        '"nested":{"title":"Visible","__proto__":{"polluted":true},"prototype":{"polluted":true}}',
        "}"
      ].join("")
    );

    const normalized = normalizePublicReadback(payload);

    assert.deepEqual(normalized, {
      visible: true,
      nested: {
        title: "Visible"
      }
    });
    assert.equal(Object.hasOwn(normalized, "__proto__"), false);
    assert.equal(Object.hasOwn(normalized, "constructor"), false);
    assert.equal(Object.hasOwn(normalized, "prototype"), false);
    assert.equal(Object.hasOwn(normalized.nested, "__proto__"), false);
    assert.equal(Object.hasOwn(normalized.nested, "prototype"), false);
    assert.equal({}.polluted, undefined);
    assert.equal(Object.prototype.polluted, undefined);
  });
});

function parserVariantReadback(overrides = {}) {
  return {
    observedAt: "2026-06-07T00:01:00.000Z",
    parserEvidence: {
      sourceEcosystem: overrides.sourceEcosystem ?? "mcp",
      sourceFormat: overrides.sourceFormat ?? "json",
      parseStatus: overrides.parseStatus ?? "parsed",
      parseConfidence: overrides.parseConfidence ?? "high",
      sanitizerStatus: "passed",
      noExecution: true,
      inputDigest: "sha256:1111111111111111111111111111111111111111111111111111111111111111"
    },
    resourceGraphSummary: {
      sanitized: true,
      nodeCount: 1,
      edgeCount: 0,
      capabilityCount: 1,
      sourceFileCount: 1,
      summaryDigest: "sha256:2222222222222222222222222222222222222222222222222222222222222222"
    },
    compatibility: {
      status: overrides.compatibilityStatus ?? "compatible",
      reasons: ["static-contract"]
    },
    platformVariants:
      overrides.platformVariants ??
      [
        platformVariantReadback({
          platformId: overrides.platformId ?? "mcp",
          artifactKind: overrides.artifactKind ?? "metadata"
        })
      ]
  };
}

function platformVariantReadback(overrides = {}) {
  return {
    platformId: overrides.platformId ?? "mcp",
    artifactKind: overrides.artifactKind ?? "metadata",
    state: overrides.state ?? "available",
    validationState: overrides.validationState ?? "not-run",
    download: {
      availability: overrides.downloadAvailability ?? "source-only"
    },
    reasons: overrides.reasons ?? ["source-only"],
    observedAt: "2026-06-07T00:02:00.000Z"
  };
}

function agentNativeReadback(overrides = {}) {
  return {
    contractVersion: "1.0",
    namespace: {
      namespaceId: "agentique.examples",
      namespaceSlug: "agentique-examples",
      resourceCoordinate: "agentique.examples/source-reviewer",
      version: "1.0.0",
      latestPointer: {
        state: overrides.latestState ?? "current",
        managedBy: "platform",
        version: "1.0.0",
        observedAt: "2026-06-11T00:02:00.000Z",
        reasons: overrides.latestReasons ?? []
      }
    },
    provenanceTrust: {
      state: overrides.provenanceState ?? "current",
      evidenceTier: "sbom-present",
      sourceKinds: ["source-url", "sbom"],
      digestPresent: true,
      nonCertifying: true,
      observedAt: "2026-06-11T00:03:00.000Z",
      reasons: overrides.provenanceReasons ?? ["public-evidence-present"]
    },
    installGuidance: [
      {
        targetId: overrides.targetId ?? "codex",
        state: overrides.installState ?? "source-only",
        artifactKind: overrides.artifactKind ?? "skill",
        downloadAvailability: overrides.downloadAvailability ?? "source-only",
        noExecution: true,
        observedAt: "2026-06-11T00:04:00.000Z",
        reasons: overrides.installReasons ?? ["manual-review-required"]
      }
    ],
    privateMcpBoundary: {
      availability: overrides.privateAvailability ?? "not-available",
      visibility: overrides.privateVisibility ?? "public-metadata-only",
      credentialReferenceKind: "none",
      credentialValuesPresent: false,
      toolResponseIsolation: true,
      observedAt: "2026-06-11T00:05:00.000Z",
      reasons: overrides.privateReasons ?? ["no-public-credential-values"]
    },
    resolverResult: {
      state: overrides.resolverState ?? "matched",
      resourceId: "example-resource",
      confidence: overrides.confidence ?? "medium",
      relevance: overrides.relevance ?? "medium",
      ambiguity: overrides.ambiguity ?? "none",
      platformUrl: "https://agentique.io/resources/example-resource",
      downloadAvailability: overrides.resolverDownloadAvailability ?? "source-only",
      checkpoints: overrides.checkpoints ?? [
        {
          kind: "namespace",
          state: "passed",
          reasons: []
        },
        {
          kind: "download",
          state: "review-required",
          reasons: ["source-only"]
        }
      ],
      nonCertifying: true,
      observedAt: "2026-06-11T00:06:00.000Z"
    },
    observedAt: "2026-06-11T00:07:00.000Z"
  };
}
