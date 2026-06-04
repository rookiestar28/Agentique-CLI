#!/usr/bin/env node
import { executeUploaderCli } from "./cli-core.mjs";

const result = await executeUploaderCli(process.argv.slice(2));

if (result.stdout) {
  process.stdout.write(result.stdout);
}
if (result.stderr) {
  process.stderr.write(result.stderr);
}
process.exitCode = result.exitCode;
