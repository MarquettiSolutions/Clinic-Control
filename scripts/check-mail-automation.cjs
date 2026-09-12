"use strict";
// Read-only production check: authenticates SMTP and counts eligible messages;
// never sends mail, creates a delivery claim or prints recipient information.
const { createRequire } = require("node:module");
const path = require("node:path");
const req = createRequire(path.resolve(__dirname, "../functions/package.json"));
const { initializeApp, applicationDefault } = req("firebase-admin/app");
const { getFirestore, FieldValue } = req("firebase-admin/firestore");
const { getAuth } = req("firebase-admin/auth");
const { createMailer } = require("../functions/mail-engine");
async function main() {
  initializeApp({ projectId: "clinic-control-6ff25", credential: applicationDefault() });
  if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) throw new Error("missing-mail-credentials");
  const transport = req("nodemailer").createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replaceAll(" ", "") }, connectionTimeout: 15000, socketTimeout: 30000 });
  await transport.verify();
  const report = await createMailer({ db: getFirestore(), auth: getAuth(), transport, sender: process.env.GMAIL_USER, timestamp: () => FieldValue.serverTimestamp(), dryRun: true }).run();
  console.log(JSON.stringify({ smtpAuthenticated: true, dryRun: true, ...report }));
}
main().catch(error => { console.error("mail-check-failed", { code: error.code || "check-failed" }); process.exitCode = 1; });
