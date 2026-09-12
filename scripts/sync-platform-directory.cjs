"use strict";
const adminRequire = require("node:module").createRequire(require("node:path").resolve(__dirname, "../functions/package.json"));
const { initializeApp } = adminRequire("firebase-admin/app");
const { getAuth } = adminRequire("firebase-admin/auth");
const { getFirestore, FieldValue } = adminRequire("firebase-admin/firestore");
const { createDirectorySync } = require("../functions/directory-sync");
const projectId = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
if (projectId !== "clinic-control-6ff25") throw new Error("Explicit Clinic Control project required.");
initializeApp({ projectId });
const service = createDirectorySync({ db: getFirestore(), auth: getAuth(), timestamp: () => FieldValue.serverTimestamp() });
service.reconcile({ dryRun: !process.argv.includes("--apply") }).then(report => {
  console.log(JSON.stringify(report));
  if (report.failed) process.exitCode = 1;
}).catch(error => { console.error(error.code || error.message); process.exitCode = 1; });
