"use strict";
const { cert, initializeApp } = require("firebase-admin/app");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const nodemailer = require("nodemailer");
const { createMailer } = require("../functions/mail-engine");
async function main() {
  for (const name of ["FIREBASE_SERVICE_ACCOUNT_B64", "GMAIL_USER", "GMAIL_APP_PASSWORD"]) {
    if (!process.env[name]) throw new Error("missing-mail-configuration");
  }
  initializeApp({ credential: cert(JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_B64, "base64").toString("utf8"))) });
  const db = getFirestore(), dryRun = process.env.DRY_RUN === "true";
  await require("./sms-reminders")(db);
  const health = (await db.doc("platformOperations/email").get()).data();
  if (!dryRun && health?.runner === "firebase" && health.lastRunAt?.toMillis() > Date.now() - 45*60000) {
    console.log("Firebase email scheduler is healthy; backup skipped.");
    return;
  }
  const transport = nodemailer.createTransport({ service: "gmail", auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD.replaceAll(" ", "") }, connectionTimeout: 15000, socketTimeout: 30000 });
  const report = await createMailer({ db, auth: getAuth(), transport, sender: process.env.GMAIL_USER, timestamp: () => FieldValue.serverTimestamp(), dryRun, runner: "github-backup" }).run();
  console.log(JSON.stringify({ dryRun, runner: "github-backup", ...report }));
  if (report.failed) throw new Error("email-deliveries-require-review");
}
main().catch(error => { console.error("email-automation-failed", { code: error.code || "check-failed" }); process.exitCode = 1; });
