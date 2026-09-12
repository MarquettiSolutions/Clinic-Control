"use strict";
// Runs only on the trusted GitHub runner. Never print secret values or CLI output.
const { spawnSync } = require("node:child_process");
const base = ["--yes", "firebase-tools@15.30.0"];
const project = ["--project", "clinic-control-6ff25", "--non-interactive"];
for (const name of ["GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
  const check = spawnSync("npx", [...base, "functions:secrets:get", name, ...project], { encoding: "utf8" });
  if (check.status === 0) { console.log(`${name}: already provisioned`); continue; }
  const value = process.env[name];
  if (!value) throw new Error(`${name}: missing GitHub secret`);
  const result = spawnSync("npx", [...base, "functions:secrets:set", name, "--data-file=-", ...project], { input: value, encoding: "utf8" });
  if (result.status !== 0) {
    const output = `${result.stdout || ""}\n${result.stderr || ""}`;
    const classification = /403|PERMISSION_DENIED|permission|denied/i.test(output) ? "permission-denied" : /ENOENT/i.test(output) ? "invalid-input-file" : /API.*enabled|enable.*API/i.test(output) ? "api-not-enabled" : "cli-error";
    throw new Error(`${name}: provisioning failed (${classification}); credentials not logged`);
  }
  console.log(`${name}: provisioned securely`);
}
