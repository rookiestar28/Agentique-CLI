import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, readdir, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { ReadbackError, downloadResourceArtifact } from "../src/index.mjs";

test("downloads available metadata to a safe directory with digest verification", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-"));
  try {
    const body = "hello";
    const digest = sha256(body);
    const calls = [];

    const result = await downloadResourceArtifact({
      metadata: {
        resourceId: "agent-1",
        download: {
          availability: "available",
          url: "https://agentique.example/downloads/agent-1.txt",
          filename: "agent-1.txt",
          mediaType: "text/plain",
          sizeBytes: Buffer.byteLength(body),
          digest: `sha256:${digest}`
        }
      },
      outputPath: tempDir + path.sep,
      fetchImpl: async (url, options) => {
        calls.push({ url: String(url), options });
        return new Response(body, {
          status: 200,
          headers: {
            "content-length": String(Buffer.byteLength(body))
          }
        });
      }
    });

    assert.equal(await readFile(path.join(tempDir, "agent-1.txt"), "utf8"), body);
    assert.equal(result.ok, true);
    assert.equal(result.resourceId, "agent-1");
    assert.equal(result.filename, "agent-1.txt");
    assert.equal(result.bytesWritten, 5);
    assert.deepEqual(result.digest, { algorithm: "sha256", value: digest });
    assert.equal(calls[0].options.method, "GET");
    assert.equal(calls[0].options.redirect, "manual");
    assert.equal(Object.hasOwn(calls[0].options, "headers"), false);
    assert.deepEqual((await readdir(tempDir)).sort(), ["agent-1.txt"]);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("can resolve metadata through a readback client and write to an explicit file", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-client-"));
  try {
    const body = "client metadata";
    const outputPath = path.join(tempDir, "client.txt");
    const client = {
      async getDownloadMetadata(resourceId) {
        assert.equal(resourceId, "agent-client");
        return {
          resourceId,
          download: {
            availability: "available",
            url: "https://agentique.example/downloads/client.txt",
            sizeBytes: Buffer.byteLength(body)
          }
        };
      }
    };

    const result = await downloadResourceArtifact({
      client,
      resourceId: "agent-client",
      outputPath,
      fetchImpl: async () => new Response(body, { status: 200, headers: { "content-length": String(Buffer.byteLength(body)) } })
    });

    assert.equal(await readFile(outputPath, "utf8"), body);
    assert.equal(result.outputPath, outputPath);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("downloads ticket metadata through unauthenticated ticket POST and safe byte GET", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-ticket-"));
  try {
    const body = "ticket artifact";
    const digest = sha256(body);
    const calls = [];

    const result = await downloadResourceArtifact({
      metadata: {
        resourceId: "agent-ticket",
        availability: "available",
        downloadKind: "ticket",
        method: "POST",
        ticketEndpoint: "/api/agents/agent-ticket/download",
        filename: "agent-ticket.txt",
        mediaType: "text/plain",
        sizeBytes: Buffer.byteLength(body),
        digest: `sha256:${digest}`
      },
      baseUrl: "https://agentique.example",
      outputPath: tempDir + path.sep,
      fetchImpl: async (url, options = {}) => {
        calls.push({ url: String(url), options });
        if (String(url) === "https://agentique.example/api/agents/agent-ticket/download") {
          assert.equal(options.method, "POST");
          assert.equal(options.redirect, "manual");
          assert.equal(headerValue(options.headers, "accept"), "application/json");
          assert.equal(headerValue(options.headers, "authorization"), null);
          assert.equal(headerValue(options.headers, "cookie"), null);
          return jsonResponse({
            data: {
              transfer: {
                url: "https://storage.agentique.example/files/agent-ticket.txt?sig=private"
              }
            }
          });
        }

        assert.equal(String(url), "https://storage.agentique.example/files/agent-ticket.txt?sig=private");
        assert.equal(options.method, "GET");
        assert.equal(options.redirect, "manual");
        assert.equal(Object.hasOwn(options, "headers"), false);
        return new Response(body, {
          status: 200,
          headers: {
            "content-length": String(Buffer.byteLength(body))
          }
        });
      }
    });

    assert.equal(result.ok, true);
    assert.equal(result.resourceId, "agent-ticket");
    assert.equal(result.filename, "agent-ticket.txt");
    assert.equal(result.bytesWritten, Buffer.byteLength(body));
    assert.deepEqual(result.digest, { algorithm: "sha256", value: digest });
    assert.equal(JSON.stringify(result).includes("storage.agentique.example"), false);
    assert.equal(await readFile(path.join(tempDir, "agent-ticket.txt"), "utf8"), body);
    assert.equal(calls.length, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ticket metadata fails closed before unsafe or unsupported ticket requests", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-ticket-fail-"));
  try {
    let calls = 0;
    const baseMetadata = {
      availability: "available",
      downloadKind: "ticket",
      method: "POST",
      ticketEndpoint: "/api/agents/agent-ticket/download",
      filename: "agent-ticket.txt"
    };

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: baseMetadata,
          outputPath: tempDir + path.sep,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("unexpected network call");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "missing-ticket-base-url"
    );

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            ...baseMetadata,
            method: "GET"
          },
          baseUrl: "https://agentique.example",
          outputPath: tempDir + path.sep,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("unexpected network call");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "unsupported-ticket-method"
    );

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: baseMetadata,
          baseUrl: "https://agentique.example",
          outputPath: `out${path.sep}..${path.sep}escape.txt`,
          fetchImpl: async () => {
            calls += 1;
            throw new Error("unexpected network call");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-output-path"
    );

    assert.equal(calls, 0);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("ticket endpoint and ticket response failures clean up without writing artifacts", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-ticket-cleanup-"));
  try {
    const baseMetadata = {
      resourceId: "agent-ticket",
      availability: "available",
      downloadKind: "ticket",
      method: "POST",
      ticketEndpoint: "/api/agents/agent-ticket/download",
      filename: "agent-ticket.txt",
      sizeBytes: 6,
      digest: `sha256:${"b".repeat(64)}`
    };

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: baseMetadata,
          baseUrl: "https://agentique.example",
          outputPath: tempDir + path.sep,
          fetchImpl: async () =>
            new Response(null, {
              status: 302,
              headers: {
                location: "https://agentique.example/redirected-ticket"
              }
            })
        }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-ticket-redirect"
    );

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: baseMetadata,
          baseUrl: "https://agentique.example",
          outputPath: tempDir + path.sep,
          fetchImpl: async () => jsonResponse({ data: { transfer: {} } })
        }),
      (error) => error instanceof ReadbackError && error.code === "missing-ticket-download-url"
    );

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: baseMetadata,
          baseUrl: "https://agentique.example",
          outputPath: tempDir + path.sep,
          fetchImpl: async (url) => {
            if (String(url) === "https://agentique.example/api/agents/agent-ticket/download") {
              return jsonResponse({
                downloadUrl: "https://storage.agentique.example/files/digest.txt?sig=private"
              });
            }
            return new Response("digest", { status: 200, headers: { "content-length": "6" } });
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "download-digest-mismatch"
    );

    assert.deepEqual(await readdir(tempDir), []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("rejects unsafe metadata before fetching", async () => {
  let fetched = false;

  await assert.rejects(
    () =>
      downloadResourceArtifact({
        metadata: {
          download: {
            availability: "source-only",
            url: "https://agentique.example/downloads/agent.txt"
          }
        },
        outputPath: "unused.txt",
        fetchImpl: async () => {
          fetched = true;
          return new Response("never");
        }
      }),
    (error) => error instanceof ReadbackError && error.code === "download-unavailable"
  );

  await assert.rejects(
    () =>
      downloadResourceArtifact({
        metadata: {
          download: {
            availability: "available",
            url: "http://evil.example/downloads/agent.txt"
          }
        },
        outputPath: "unused.txt",
        fetchImpl: async () => {
          fetched = true;
          return new Response("never");
        }
      }),
    (error) => error instanceof ReadbackError && error.code === "unsafe-download-url"
  );

  await assert.rejects(
    () =>
      downloadResourceArtifact({
        metadata: {
          download: {
            availability: "available",
            url: "https://agentique.example/downloads/agent.txt",
            digest: "not-a-digest"
          }
        },
        outputPath: "unused.txt",
        fetchImpl: async () => {
          fetched = true;
          return new Response("never");
        }
      }),
    (error) => error instanceof ReadbackError && error.code === "invalid-download-digest"
  );

  assert.equal(fetched, false);
});

test("rejects unsafe filenames and existing outputs before fetching", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-unsafe-"));
  try {
    let fetched = false;
    let traversalFetched = false;
    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/agent.txt",
              filename: "../agent.txt"
            }
          },
          outputPath: tempDir + path.sep,
          fetchImpl: async () => {
            fetched = true;
            return new Response("never");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-output-filename"
    );

    const existingPath = path.join(tempDir, "existing.txt");
    await writeFile(existingPath, "old", "utf8");
    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/existing.txt"
            }
          },
          outputPath: existingPath,
          fetchImpl: async () => {
            fetched = true;
            return new Response("never");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "output-exists"
    );

    const result = await downloadResourceArtifact({
      metadata: {
        download: {
          availability: "available",
          url: "https://agentique.example/downloads/existing.txt",
          sizeBytes: 3
        }
      },
      outputPath: existingPath,
      force: true,
      fetchImpl: async () => {
        fetched = true;
        return new Response("new", { status: 200, headers: { "content-length": "3" } });
      }
    });

    assert.equal(await readFile(existingPath, "utf8"), "new");
    assert.equal(result.bytesWritten, 3);
    assert.equal(fetched, true);

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/escape.txt"
            }
          },
          outputPath: `${tempDir}${path.sep}out${path.sep}..${path.sep}escape.txt`,
          fetchImpl: async () => {
            traversalFetched = true;
            return new Response("never");
          }
        }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-output-path"
    );
    assert.equal(traversalFetched, false);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("cleans temporary files on max byte and digest failures", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-cleanup-"));
  try {
    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/large.txt",
              filename: "large.txt"
            }
          },
          outputPath: tempDir + path.sep,
          maxBytes: 3,
          fetchImpl: async () => new Response("large", { status: 200 })
        }),
      (error) => error instanceof ReadbackError && error.code === "download-too-large"
    );

    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/digest.txt",
              filename: "digest.txt",
              sizeBytes: 6,
              digest: `sha256:${"b".repeat(64)}`
            }
          },
          outputPath: tempDir + path.sep,
          fetchImpl: async () => new Response("digest", { status: 200, headers: { "content-length": "6" } })
        }),
      (error) => error instanceof ReadbackError && error.code === "download-digest-mismatch"
    );

    assert.deepEqual(await readdir(tempDir), []);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("denies unsafe redirects unless the origin is explicitly allowlisted", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-redirect-"));
  try {
    await assert.rejects(
      () =>
        downloadResourceArtifact({
          metadata: {
            download: {
              availability: "available",
              url: "https://agentique.example/downloads/redirect.txt",
              filename: "redirect.txt"
            }
          },
          outputPath: tempDir + path.sep,
          fetchImpl: async () =>
            new Response(null, {
              status: 302,
              headers: { location: "https://cdn.example/redirect.txt" }
            })
        }),
      (error) => error instanceof ReadbackError && error.code === "unsafe-download-redirect"
    );

    let callCount = 0;
    const result = await downloadResourceArtifact({
      metadata: {
        download: {
          availability: "available",
          url: "https://agentique.example/downloads/redirect.txt",
          filename: "redirect.txt",
          sizeBytes: 2
        }
      },
      outputPath: tempDir + path.sep,
      allowedRedirectOrigins: ["https://cdn.example"],
      fetchImpl: async (url) => {
        callCount += 1;
        if (String(url) === "https://agentique.example/downloads/redirect.txt") {
          return new Response(null, {
            status: 302,
            headers: { location: "https://cdn.example/redirect.txt" }
          });
        }
        return new Response("ok", { status: 200, headers: { "content-length": "2" } });
      }
    });

    assert.equal(callCount, 2);
    assert.equal(await readFile(path.join(tempDir, "redirect.txt"), "utf8"), "ok");
    assert.equal(result.bytesWritten, 2);
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

test("allows loopback http for local tests only", async () => {
  const tempDir = await mkdtemp(path.join(os.tmpdir(), "agentique-download-loopback-"));
  try {
    await mkdir(path.join(tempDir, "out"));
    const result = await downloadResourceArtifact({
      metadata: {
        download: {
          availability: "available",
          url: "http://127.0.0.1/downloads/local.txt",
          filename: "local.txt",
          sizeBytes: 2
        }
      },
      outputPath: path.join(tempDir, "out") + path.sep,
      fetchImpl: async () => new Response("ok", { status: 200, headers: { "content-length": "2" } })
    });

    assert.equal(result.filename, "local.txt");
    assert.equal(await readFile(path.join(tempDir, "out", "local.txt"), "utf8"), "ok");
  } finally {
    await rm(tempDir, { recursive: true, force: true });
  }
});

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function jsonResponse(payload, { ok = true, status = 200 } = {}) {
  return {
    ok,
    status,
    headers: {
      get() {
        return null;
      }
    },
    async json() {
      return payload;
    }
  };
}

function headerValue(headers, name) {
  const lowered = name.toLowerCase();
  if (!headers) {
    return null;
  }
  if (typeof headers.get === "function") {
    return headers.get(name);
  }
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === lowered) {
      return value;
    }
  }
  return null;
}
