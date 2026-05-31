import { readFileSync } from "node:fs";
import { collectPublicUrlInventoryFindings } from "./lib/public-url-inventory-policy.mjs";

const inventory = JSON.parse(readFileSync("docs/public-url-inventory.json", "utf8"));
const requirePublicUrls = process.env.AGENTIQUE_REQUIRE_PUBLIC_URLS === "1";
const failures = collectPublicUrlInventoryFindings(inventory, { requirePublicUrls });

if (failures.length > 0) {
  console.error("Public URL inventory check failed:");
  for (const failure of failures) {
    console.error(`- ${failure}`);
  }
  process.exitCode = 1;
} else {
  console.log(
    inventory.releaseBlocked
      ? "Public URL inventory check passed; public advertising remains blocked."
      : "Public URL inventory check passed."
  );
}
