import { createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { createHash } from "node:crypto";
import path from "node:path";
import { Readable, Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { ReadbackError, normalizeDownloadMetadata } from "./client.mjs";

const DEFAULT_MAX_REDIRECTS = 3;
const LOOPBACK_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);
const WINDOWS_RESERVED_NAMES = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;
const UNSAFE_FILENAME_PATTERN = /[<>:"/\\|?*\x00-\x1f]/;

export async function downloadResourceArtifact(options = {}) {
  if (!options || typeof options !== "object" || Array.isArray(options)) {
    throw new ReadbackError("Download options are required.", { code: "invalid-download-options" });
  }

  const metadata = await resolveMetadata(options);
  const normalized = isNormalizedDownloadMetadata(metadata) ? metadata : normalizeDownloadMetadata(metadata);

  if (normalized.availability !== "available") {
    throw new ReadbackError("Download is not available for this resource.", {
      code: "download-unavailable"
    });
  }
  if (!normalized.url) {
    throw new ReadbackError("Download metadata is missing a public URL.", {
      code: "missing-download-url"
    });
  }
  if (normalized.digestPresent && !normalized.digestValid) {
    throw new ReadbackError("Download metadata includes an invalid digest.", {
      code: "invalid-download-digest"
    });
  }

  const maxBytes = normalizeMaxBytes(options.maxBytes);
  if (maxBytes !== null && normalized.sizeBytes !== null && normalized.sizeBytes > maxBytes) {
    throw new ReadbackError("Download exceeds the configured maximum byte count.", {
      code: "download-too-large"
    });
  }

  const initialUrl = parseSafeDownloadUrl(normalized.url);
  const target = await resolveOutputTarget({
    cwd: options.cwd,
    outputPath: options.outputPath,
    filename: normalized.filename,
    url: initialUrl,
    force: options.force === true
  });

  let tempPath = target.tempPath;
  try {
    const fetchImpl = options.fetchImpl ?? globalThis.fetch;
    if (typeof fetchImpl !== "function") {
      throw new ReadbackError("A fetch implementation is required.", { code: "missing-fetch" });
    }

    const { response } = await fetchWithSafeRedirects(initialUrl, {
      fetchImpl,
      allowedRedirectOrigins: options.allowedRedirectOrigins,
      maxRedirects: options.maxRedirects
    });

    if (!response.ok) {
      throw new ReadbackError("Download request failed.", {
        code: "download-http-error",
        status: response.status
      });
    }

    validateContentLength(response.headers?.get?.("content-length") ?? null, {
      expectedSize: normalized.sizeBytes,
      maxBytes
    });

    const digest = prepareDigest(normalized.digest);
    const result = await streamResponseToTempFile(response, tempPath, {
      digest,
      maxBytes
    });

    if (normalized.sizeBytes !== null && result.bytesWritten !== normalized.sizeBytes) {
      throw new ReadbackError("Downloaded byte count does not match metadata.", {
        code: "download-size-mismatch"
      });
    }
    if (digest && result.digestValue !== digest.value) {
      throw new ReadbackError("Downloaded digest does not match metadata.", {
        code: "download-digest-mismatch"
      });
    }

    if (!options.force && (await pathExists(target.finalPath))) {
      throw new ReadbackError("Output file already exists.", { code: "output-exists" });
    }

    await rename(tempPath, target.finalPath);
    tempPath = null;

    return Object.freeze({
      ok: true,
      resourceId: normalized.resourceId,
      outputPath: target.finalPath,
      filename: target.filename,
      bytesWritten: result.bytesWritten,
      digest: digest ? Object.freeze({ algorithm: digest.algorithm, value: result.digestValue }) : null,
      mediaType: normalized.mediaType
    });
  } catch (error) {
    if (tempPath) {
      await rm(tempPath, { force: true });
    }
    if (error instanceof ReadbackError) {
      throw error;
    }
    throw new ReadbackError("Download failed.", {
      code: "download-failed",
      cause: error
    });
  }
}

async function resolveMetadata(options) {
  if (options.metadata) {
    return options.metadata;
  }
  if (!options.client || typeof options.client.getDownloadMetadata !== "function") {
    throw new ReadbackError("Download metadata or a readback client is required.", {
      code: "missing-download-metadata"
    });
  }
  if (typeof options.resourceId !== "string" || options.resourceId.trim() === "") {
    throw new ReadbackError("Resource id is required.", { code: "missing-resource-id" });
  }
  return options.client.getDownloadMetadata(options.resourceId);
}

function isNormalizedDownloadMetadata(value) {
  return Boolean(
    value &&
      typeof value === "object" &&
      !Array.isArray(value) &&
      typeof value.availability === "string" &&
      Object.hasOwn(value, "digestPresent") &&
      Object.hasOwn(value, "digestValid")
  );
}

function normalizeMaxBytes(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const numeric = typeof value === "number" ? value : typeof value === "string" && value.trim() !== "" ? Number(value) : NaN;
  if (!Number.isSafeInteger(numeric) || numeric < 1) {
    throw new ReadbackError("maxBytes must be a positive safe integer.", {
      code: "invalid-max-bytes"
    });
  }
  return numeric;
}

function parseSafeDownloadUrl(value) {
  let parsed;
  try {
    parsed = new URL(value);
  } catch (error) {
    throw new ReadbackError("Download URL is invalid.", {
      code: "unsafe-download-url",
      cause: error
    });
  }

  if (parsed.protocol === "https:" || (parsed.protocol === "http:" && LOOPBACK_HOSTS.has(parsed.hostname))) {
    parsed.hash = "";
    return parsed;
  }

  throw new ReadbackError("Download URL must use HTTPS outside loopback development.", {
    code: "unsafe-download-url"
  });
}

async function resolveOutputTarget({ cwd, outputPath, filename, url, force }) {
  if (typeof outputPath !== "string" || outputPath.trim() === "") {
    throw new ReadbackError("An output path is required.", { code: "missing-output-path" });
  }
  if (hasParentPathSegment(outputPath)) {
    throw new ReadbackError("Output path must not contain parent-directory traversal.", {
      code: "unsafe-output-path"
    });
  }

  const baseCwd = cwd ? path.resolve(cwd) : process.cwd();
  const resolvedOutput = path.resolve(baseCwd, outputPath);
  const directoryMode = outputPath.endsWith("/") || outputPath.endsWith("\\") || (await isDirectory(resolvedOutput));
  const finalPath = directoryMode
    ? path.resolve(resolvedOutput, validateSafeFilename(filename || filenameFromUrl(url)))
    : resolvedOutput;
  const outputRoot = directoryMode ? resolvedOutput : path.dirname(finalPath);
  const finalName = path.basename(finalPath);

  validateSafeFilename(finalName);
  assertPathInside(outputRoot, finalPath);
  await mkdir(path.dirname(finalPath), { recursive: true });

  if (!force && (await pathExists(finalPath))) {
    throw new ReadbackError("Output file already exists.", { code: "output-exists" });
  }

  const tempPath = path.join(path.dirname(finalPath), `.${finalName}.${process.pid}.${Date.now()}.tmp`);
  return { finalPath, tempPath, filename: finalName };
}

async function isDirectory(value) {
  try {
    return (await stat(value)).isDirectory();
  } catch {
    return false;
  }
}

async function pathExists(value) {
  try {
    await stat(value);
    return true;
  } catch {
    return false;
  }
}

function validateSafeFilename(value) {
  if (
    typeof value !== "string" ||
    value.trim() === "" ||
    value === "." ||
    value === ".." ||
    value.includes("/") ||
    value.includes("\\") ||
    UNSAFE_FILENAME_PATTERN.test(value) ||
    WINDOWS_RESERVED_NAMES.test(value)
  ) {
    throw new ReadbackError("Download filename is unsafe.", { code: "unsafe-output-filename" });
  }
  return value;
}

function filenameFromUrl(url) {
  const name = path.basename(decodeURIComponent(url.pathname));
  if (!name || name === "/" || name === ".") {
    throw new ReadbackError("Download metadata is missing a safe filename.", {
      code: "missing-download-filename"
    });
  }
  return name;
}

function assertPathInside(root, target) {
  const relative = path.relative(path.resolve(root), path.resolve(target));
  if (relative === "" || (!relative.startsWith("..") && !path.isAbsolute(relative))) {
    return;
  }
  throw new ReadbackError("Output path escapes the selected output directory.", {
    code: "unsafe-output-path"
  });
}

function hasParentPathSegment(value) {
  return String(value)
    .split(/[\\/]+/)
    .some((segment) => segment === "..");
}

async function fetchWithSafeRedirects(initialUrl, { fetchImpl, allowedRedirectOrigins, maxRedirects }) {
  const allowedOrigins = new Set([initialUrl.origin, ...(Array.isArray(allowedRedirectOrigins) ? allowedRedirectOrigins : [])]);
  const redirectLimit = maxRedirects === undefined ? DEFAULT_MAX_REDIRECTS : normalizeRedirectLimit(maxRedirects);
  let current = initialUrl;

  for (let redirectCount = 0; redirectCount <= redirectLimit; redirectCount += 1) {
    const response = await fetchImpl(current, {
      method: "GET",
      redirect: "manual"
    });

    if (!isRedirect(response.status)) {
      return { response, url: current };
    }

    const location = response.headers?.get?.("location");
    if (!location) {
      throw new ReadbackError("Download redirect is missing a location.", {
        code: "unsafe-download-redirect"
      });
    }
    if (redirectCount === redirectLimit) {
      throw new ReadbackError("Download redirect limit exceeded.", {
        code: "download-redirect-limit"
      });
    }

    const next = parseSafeDownloadUrl(new URL(location, current).href);
    if (!allowedOrigins.has(next.origin)) {
      throw new ReadbackError("Download redirect target is not allowed.", {
        code: "unsafe-download-redirect"
      });
    }
    current = next;
  }

  throw new ReadbackError("Download redirect limit exceeded.", {
    code: "download-redirect-limit"
  });
}

function normalizeRedirectLimit(value) {
  if (!Number.isInteger(value) || value < 0 || value > 10) {
    throw new ReadbackError("maxRedirects must be an integer from 0 to 10.", {
      code: "invalid-redirect-limit"
    });
  }
  return value;
}

function isRedirect(status) {
  return [301, 302, 303, 307, 308].includes(status);
}

function validateContentLength(value, { expectedSize, maxBytes }) {
  if (value === null || value === "") {
    return;
  }
  const contentLength = Number(value);
  if (!Number.isSafeInteger(contentLength) || contentLength < 0) {
    throw new ReadbackError("Download response has an invalid content length.", {
      code: "download-size-mismatch"
    });
  }
  if (expectedSize !== null && contentLength !== expectedSize) {
    throw new ReadbackError("Download content length does not match metadata.", {
      code: "download-size-mismatch"
    });
  }
  if (maxBytes !== null && contentLength > maxBytes) {
    throw new ReadbackError("Download exceeds the configured maximum byte count.", {
      code: "download-too-large"
    });
  }
}

function prepareDigest(value) {
  if (!value) {
    return null;
  }
  const algorithm = value.algorithm === "sha-256" ? "sha256" : value.algorithm;
  try {
    createHash(algorithm);
  } catch (error) {
    throw new ReadbackError("Download digest algorithm is not supported.", {
      code: "unsupported-download-digest",
      cause: error
    });
  }
  return { algorithm, value: value.value };
}

async function streamResponseToTempFile(response, tempPath, { digest, maxBytes }) {
  if (!response.body) {
    throw new ReadbackError("Download response is missing a body.", {
      code: "download-empty-body"
    });
  }

  let bytesWritten = 0;
  const hash = digest ? createHash(digest.algorithm) : null;
  const counter = new Transform({
    transform(chunk, _encoding, callback) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      bytesWritten += buffer.length;
      if (maxBytes !== null && bytesWritten > maxBytes) {
        callback(
          new ReadbackError("Download exceeds the configured maximum byte count.", {
            code: "download-too-large"
          })
        );
        return;
      }
      hash?.update(buffer);
      callback(null, buffer);
    }
  });

  const readable = typeof response.body.getReader === "function" ? Readable.fromWeb(response.body) : response.body;
  await pipeline(readable, counter, createWriteStream(tempPath, { flags: "wx" }));

  return {
    bytesWritten,
    digestValue: hash ? hash.digest("hex") : null
  };
}
