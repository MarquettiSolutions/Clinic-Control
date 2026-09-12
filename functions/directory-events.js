"use strict";
const { onDocumentWritten } = require("firebase-functions/v2/firestore");
const { onSchedule } = require("firebase-functions/v2/scheduler");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getAuth } = require("firebase-admin/auth");
const { createDirectorySync } = require("./directory-sync");
const service = () => createDirectorySync({ db: getFirestore(), auth: getAuth(), timestamp: () => FieldValue.serverTimestamp() });
// The daily reconciliation recovers transient failures without continuous event retries.
exports.syncClinicDirectory = onDocumentWritten({ document: "clinics/{clinicId}/settings/clinic", region: "us-central1", retry: false }, async event => {
  // Deleting settings must never delete a business account or its historical owner notes.
  if (!event.data?.after.exists) return;
  await service().syncClinic(event.params.clinicId);
});
exports.reconcileClinicDirectory = onSchedule({ schedule: "every day 04:00", timeZone: "America/Chicago", region: "us-central1", timeoutSeconds: 540 }, async () => {
  const report = await service().reconcile();
  console.log("directory-reconciliation", report);
  if (report.failed) throw new Error("Directory reconciliation incomplete; inspect failure counts.");
});
