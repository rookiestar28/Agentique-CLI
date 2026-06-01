import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";
import { test } from "node:test";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";
import Ajv from "ajv/dist/2020.js";
import addFormats from "ajv-formats";
import { scanExternalIntake } from "../src/intake/scanner.mjs";
import { validatePackage } from "../src/validator.mjs";

const repoDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const packageDir = path.resolve(repoDir, "..", "..");
const fixturesDir = path.join(repoDir, "tests", "fixtures");
const schemasDir = path.resolve(packageDir, "schemas");
const execFileAsync = promisify(execFile);
const schemaFiles = [
  "distribution-mode.schema.json",
  "package-manifest.schema.json",
  "public-readback.schema.json",
  "resource-manifest.schema.json",
  "skill-metadata.schema.json",
  "workflow-metadata.schema.json"
];

test("accepts a valid static package and emits inventory hashes", async () => {
  const report = await validatePackage({
    command: "validate",
    packageDir: path.join(fixturesDir, "valid-package"),
    schemasDir
  });

  assert.equal(report.ok, true);
  assert.equal(report.manifest.name, "valid-starter");
  assert.deepEqual(
    report.inventory.map((item) => item.path).sort(),
    ["README.md", "notes.md"]
  );
  assert.equal(report.findings.length, 0);
});

test("validates schema fixture catalog for every public schema", async () => {
  const ajv = new Ajv({ allErrors: true, strict: true });
  addFormats(ajv);

  for (const schemaFile of schemaFiles) {
    const schema = JSON.parse(await fs.readFile(path.join(schemasDir, schemaFile), "utf8"));
    ajv.addSchema(schema);
  }

  const fixtureCatalog = JSON.parse(
    await fs.readFile(path.join(schemasDir, "fixtures", "schema-fixtures.json"), "utf8")
  );

  assert.deepEqual(Object.keys(fixtureCatalog).sort(), [...schemaFiles].sort());

  for (const schemaFile of schemaFiles) {
    const validate = ajv.getSchema(`https://schemas.agentique.io/${schemaFile}`);
    const fixtures = fixtureCatalog[schemaFile];

    assert.equal(validate(fixtures.valid), true, `${schemaFile} valid fixture should pass`);
    assert.deepEqual(Object.keys(fixtures.invalid).sort(), ["boundary", "extra-property", "missing-required"]);

    for (const [caseName, value] of Object.entries(fixtures.invalid)) {
      assert.equal(validate(value), false, `${schemaFile} ${caseName} fixture should fail`);
    }
  }
});

test("rejects traversal and local path entries", async () => {
  const report = await validatePackage({
    command: "validate",
    packageDir: path.join(fixturesDir, "invalid-path"),
    schemasDir
  });

  assert.equal(report.ok, false);
  assertFindings(report, ["schema", "unsafe-path"]);
});

test("rejects sensitive and unsafe package path variants", async () => {
  const cases = [
    ["private/README.md", "sensitive-path"],
    ["nested/private/README.md", "sensitive-path"],
    [".env", "sensitive-path"],
    ["config/.env", "sensitive-path"],
    [".git/config", "sensitive-path"],
    ["build/.cache/state.json", "sensitive-path"],
    ["node_modules/pkg/index.js", "sensitive-path"],
    ["/tmp/README.md", "unsafe-path"],
    ["C:/tmp/README.md", "unsafe-path"],
    ["notes\\README.md", "unsafe-path"],
    ["../README.md", "unsafe-path"],
    ["nested/../README.md", "unsafe-path"]
  ];

  for (const [packagePath, expectedCode] of cases) {
    const tempDir = await copyFixture("valid-package");
    await setSinglePackagePath(tempDir, packagePath);

    const report = await validatePackage({ command: "validate", packageDir: tempDir, schemasDir });

    assert.equal(report.ok, false, `expected ${packagePath} to fail`);
    assertFindings(report, [expectedCode]);
  }
});

test("rejects hash mismatches", async () => {
  const report = await validatePackage({
    command: "validate",
    packageDir: path.join(fixturesDir, "invalid-hash"),
    schemasDir
  });

  assert.equal(report.ok, false);
  assertFindings(report, ["hash-mismatch"]);
});

test("rejects blocked executable payload extensions without executing them", async () => {
  const report = await validatePackage({
    command: "validate",
    packageDir: path.join(fixturesDir, "invalid-executable"),
    schemasDir
  });

  assert.equal(report.ok, false);
  assertFindings(report, ["blocked-extension"]);
});

test("rejects secret-like values with redacted findings", async () => {
  const tempDir = await copyFixture("valid-package");
  const fixtureValue = ["api_key", " = ", '"example-secret-value"', "\n"].join("");
  await fs.writeFile(path.join(tempDir, "notes.md"), fixtureValue, "utf8");
  const manifestPath = path.join(tempDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.package.hashes["notes.md"] = await sha256ManifestValue(path.join(tempDir, "notes.md"));
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const report = await validatePackage({ command: "validate", packageDir: tempDir, schemasDir });

  assert.equal(report.ok, false);
  assertFindings(report, ["assignment-secret"]);
  assert.equal(JSON.stringify(report).includes("example-secret-value"), false);
});

test("rejects provider tokens, credential URLs, database URLs, and private keys with redacted findings", async () => {
  const cases = [
    ["aws-access-key", ["AWS key ", "AKIA", "1234", "5678", "90AB", "CDEF"].join("")],
    ["bearer-token", ["Authorization: Bearer ", "aaaa", "aaaa", "aaaa", "aaaa", "aaaa"].join("")],
    ["assignment-secret", ["api_token", " = ", '"example-token-value"'].join("")],
    ["database-url", ["postgres", "://", "user", ":", "pass", "@localhost:5432/app"].join("")],
    ["credential-url", ["https", "://", "user", ":", "pass", "@example.com/private"].join("")],
    ["private-key", ["-----BEGIN ", "PRIVATE KEY-----\nabc\n-----END ", "PRIVATE KEY-----"].join("")],
    ["openai-key", ["sk-", "aaaa", "bbbb", "cccc", "dddd", "eeee"].join("")],
    ["github-token", ["ghp_", "aaaa", "bbbb", "cccc", "dddd", "eeee"].join("")]
  ];

  for (const [expectedCode, secretText] of cases) {
    const tempDir = await copyFixture("valid-package");
    await replaceNotes(tempDir, `${secretText}\n`);

    const report = await validatePackage({ command: "validate", packageDir: tempDir, schemasDir });

    assert.equal(report.ok, false, `expected ${expectedCode} to fail`);
    assertFindings(report, [expectedCode]);
    assert.equal(JSON.stringify(report).includes(secretText), false);
  }
});

test("allows public text that resembles scanner keywords without secret context", async () => {
  const tempDir = await copyFixture("valid-package");
  await replaceNotes(
    tempDir,
    [
      "tokenCount is a public readback metric.",
      "A bearer is a person or component that carries something.",
      "Public docs may link to https://github.com/sponsors/example.",
      "Storage mode and object type are public projection fields."
    ].join("\n")
  );

  const report = await validatePackage({ command: "validate", packageDir: tempDir, schemasDir });

  assert.equal(report.ok, true);
  assert.equal(report.findings.length, 0);
});

test("rejects unsupported distribution modes through schema validation", async () => {
  const tempDir = await copyFixture("valid-package");
  const manifestPath = path.join(tempDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.distribution.mode = "direct_execution";
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");

  const report = await validatePackage({ command: "validate", packageDir: tempDir, schemasDir });

  assert.equal(report.ok, false);
  assertFindings(report, ["schema"]);
});

test("upload-prep uses the same no-side-effect inventory contract", async () => {
  const report = await validatePackage({
    command: "upload-prep",
    packageDir: path.join(fixturesDir, "valid-package"),
    schemasDir
  });

  assert.equal(report.ok, true);
  assert.equal(report.command, "upload-prep");
  assert.equal(report.inventory.length, 2);
});

test("schema loader errors include failing schema filename", async () => {
  const tempSchemasDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-schemas-missing-"));
  await assert.rejects(
    () =>
      validatePackage({
        command: "validate",
        packageDir: path.join(fixturesDir, "valid-package"),
        schemasDir: tempSchemasDir
      }),
    /Unable to load schema distribution-mode\.schema\.json/
  );
});

test("CLI reports clear missing schemas-dir errors", async () => {
  const missingSchemasDir = path.join(os.tmpdir(), `agentique-missing-schemas-${Date.now()}`);
  const cliPath = path.join(repoDir, "src", "cli.mjs");

  await assert.rejects(
    () =>
      execFileAsync(process.execPath, [
        cliPath,
        "validate",
        path.join(fixturesDir, "valid-package"),
        "--schemas-dir",
        missingSchemasDir
      ]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /CLI error: Unable to load schema distribution-mode\.schema\.json/);
      return true;
    }
  );
});

test("external intake emits a v1 relative-path report without executing files", async () => {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-intake-"));
  const markerPath = path.join(tempDir, "would-run.txt");
  await fs.mkdir(path.join(tempDir, "nested"), { recursive: true });
  await fs.writeFile(path.join(tempDir, "README.md"), "Public candidate notes.\n", "utf8");
  await fs.writeFile(
    path.join(tempDir, "nested", "run-if-executed.js"),
    `import { writeFileSync } from "node:fs"; writeFileSync(${JSON.stringify(markerPath)}, "executed");\n`,
    "utf8"
  );

  const report = await scanExternalIntake({ sourceDir: tempDir });

  assert.equal(report.schemaVersion, "agentique.externalIntake.v1");
  assert.equal(report.command, "external-intake");
  assert.equal(report.source.label, path.basename(tempDir));
  assert.equal(report.decision, "passed");
  assert.deepEqual(
    report.inventory.map((item) => item.path),
    ["README.md", "nested/run-if-executed.js"]
  );
  assert.equal(JSON.stringify(report).includes(tempDir), false);
  await assert.rejects(() => fs.stat(markerPath), /ENOENT/);
});

test("external intake CLI supports json output and usage errors", async () => {
  const cliPath = path.join(repoDir, "src", "cli.mjs");
  const { stdout } = await execFileAsync(process.execPath, [
    cliPath,
    "external-intake",
    path.join(fixturesDir, "valid-package"),
    "--json"
  ]);
  const report = JSON.parse(stdout);

  assert.equal(report.schemaVersion, "agentique.externalIntake.v1");
  assert.equal(report.decision, "passed");
  assert.equal(JSON.stringify(report).includes(fixturesDir), false);

  await assert.rejects(
    () => execFileAsync(process.execPath, [cliPath, "external-intake"]),
    (error) => {
      assert.equal(error.code, 2);
      assert.match(error.stderr, /external-intake <repo-or-dir>/);
      return true;
    }
  );
});

function assertFindings(report, expectedCodes) {
  const codes = new Set(report.findings.map((finding) => finding.code));
  for (const code of expectedCodes) {
    assert.equal(codes.has(code), true, `expected finding ${code}, got ${[...codes].join(", ")}`);
  }
}

async function copyFixture(name) {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "agentique-validator-"));
  await fs.cp(path.join(fixturesDir, name), tempDir, { recursive: true });
  return tempDir;
}

async function sha256ManifestValue(filePath) {
  const { createHash } = await import("node:crypto");
  const bytes = await fs.readFile(filePath);
  return `sha256:${createHash("sha256").update(bytes).digest("hex")}`;
}

async function replaceNotes(packageDir, content) {
  const notesPath = path.join(packageDir, "notes.md");
  await fs.writeFile(notesPath, content, "utf8");
  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.package.hashes["notes.md"] = await sha256ManifestValue(notesPath);
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}

async function setSinglePackagePath(packageDir, packagePath) {
  const manifestPath = path.join(packageDir, "manifest.json");
  const manifest = JSON.parse(await fs.readFile(manifestPath, "utf8"));
  manifest.package.files = [packagePath];
  manifest.package.hashes = {
    [packagePath]: "sha256:0000000000000000000000000000000000000000000000000000000000000000"
  };
  await fs.writeFile(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`, "utf8");
}
