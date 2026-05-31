import assert from "node:assert/strict";
import { test } from "node:test";
import { collectPublicUrlInventoryFindings } from "../lib/public-url-inventory-policy.mjs";

test("deduplicates URL validation findings", () => {
  const findings = collectPublicUrlInventoryFindings({
    releaseBlocked: false,
    entries: [
      {
        id: "docs-url",
        label: "Docs URL",
        url: "http://docs.example.com",
        status: "approved",
        advertise: true
      }
    ]
  });

  assert.deepEqual(findings, ["docs-url: URL must use HTTPS"]);
});

test("requires approved advertised URLs when public URLs are required", () => {
  const findings = collectPublicUrlInventoryFindings(
    {
      releaseBlocked: true,
      entries: [
        {
          id: "docs-url",
          label: "Docs URL",
          url: null,
          status: "pending_owner_approval",
          advertise: false
        }
      ]
    },
    { requirePublicUrls: true }
  );

  assert.deepEqual(findings, [
    "releaseBlocked must be false when public URLs are required",
    "docs-url: public URL required but entry is not approved and advertised"
  ]);
});
