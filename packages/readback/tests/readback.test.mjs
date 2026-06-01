import assert from "node:assert/strict";
import { describe, it } from "node:test";
import {
  ReadbackError,
  assertReadOnlyClientSurface,
  createBadgeMarkdown,
  createBadgeState,
  createReadbackClient,
  listBadgeStates,
  normalizePublicReadback
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
      "published",
      "review-required",
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

  it("does not use strong safety or approval wording in badge output", () => {
    const states = [
      createBadgeState({ status: "published" }),
      createBadgeState({ status: "review required" }),
      createBadgeState({ status: "blocked" }),
      createBadgeState(null),
      createBadgeState({ code: "rate-limited" })
    ];
    const text = JSON.stringify(states) + createBadgeMarkdown({ status: "published" });

    assert.doesNotMatch(text, /certified|approved|guarantee/i);
  });
});

describe("normalizer", () => {
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
