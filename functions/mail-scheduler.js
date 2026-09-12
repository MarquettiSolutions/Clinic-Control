"use strict";
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { defineSecret } = require("firebase-functions/params");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { createMailer } = require("./mail-engine");
const user = defineSecret("GMAIL_USER");
const password = defineSecret("GMAIL_APP_PASSWORD");
exports.sendBirthdayEmails = onSchedule({ schedule: "*/15 * * * *", timeZone: "America/Chicago", region: "us-central1", timeoutSeconds: 540, maxInstances: 1, concurrency: 1, retryCount: 0, secrets: [user, password] }, async () => {
  const transport = require("nodemailer").createTransport({ service: "gmail", auth: { user: user.value(), pass: password.value().replaceAll(" ", "") }, connectionTimeout: 15000, socketTimeout: 30000 });
  const report = await createMailer({ db: getFirestore(), auth: getAuth(), transport, sender: user.value(), timestamp: () => FieldValue.serverTimestamp() }).run();
  console.log("email-automation", report);
  if (report.failed) throw new Error("Email deliveries require review; see emailLogs status, without resending uncertain deliveries.");
});
