#!/usr/bin/env node
import { createUploaderBoundaryStatus } from "./index.mjs";

const args = process.argv.slice(2);
const wantsJson = args.includes("--json");
const status = createUploaderBoundaryStatus();

if (wantsJson) {
  process.stdout.write(`${JSON.stringify(status, null, 2)}\n`);
} else {
  process.stderr.write(`${status.message}\n`);
  process.stderr.write("This command does not publish, approve, certify, host, or moderate resources.\n");
}

process.exitCode = 2;
