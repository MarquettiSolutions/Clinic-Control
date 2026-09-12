"use strict";
// Only business settings are read. No patient collection is scanned or changed.
function createDirectorySync({ db, auth, timestamp }) {
  async function syncClinic(clinicId, { dryRun = false } = {}) {
    if (!/^[A-Za-z0-9_-]{1,128}$/.test(clinicId)) return { outcome: "skipped", reason: "invalid-id" };
    const settingsRef = db.doc(`clinics/${clinicId}/settings/clinic`);
    // A missing settings document is not a registered clinic (for example an incomplete signup).
    if (!(await settingsRef.get()).exists) return { outcome: "skipped", reason: "no-settings" };
    let owner;
    try { owner = await auth.getUser(clinicId); }
    catch (error) { if (error.code !== "auth/user-not-found") throw error; }
    const target = db.doc(`platformClinics/${clinicId}`);
    return db.runTransaction(async tx => {
      // Read current settings, not the trigger payload: delayed events cannot restore old names.
      const settings = await tx.get(settingsRef);
      const existing = await tx.get(target);
      if (!settings.exists) return { outcome: "skipped", reason: "no-settings" };
      const source = settings.data(), previous = existing.data() || {};
      const name = String(source.clinicName || "").slice(0,160);
      const ownerEmail = String(owner?.email || previous.ownerEmail || source.clinicEmail || "").slice(0,320);
      if (existing.exists && previous.name === name && previous.ownerEmail === ownerEmail) return { outcome: "unchanged" };
      if (!dryRun) tx.set(target, { name, ownerEmail, updatedAt: timestamp(), ...(!existing.exists ? { status: "pilot", pilotEndsAt: null, createdAt: timestamp() } : {}) }, { merge: true });
      return { outcome: existing.exists ? "updated" : "created" };
    });
  }
  async function reconcile({ dryRun = false } = {}) {
    // listDocuments includes absent parent documents that have settings subcollections.
    // Querying clinics.get() would miss the older registrations in this application.
    const refs = await db.collection("clinics").listDocuments();
    const report = { mode: dryRun ? "preview" : "apply", scanned: refs.length, created: 0, updated: 0, unchanged: 0, skipped: 0, failed: 0 };
    for (let offset = 0; offset < refs.length; offset += 5) {
      await Promise.all(refs.slice(offset, offset + 5).map(async ref => {
        try { const result = await syncClinic(ref.id, { dryRun }); report[result.outcome]++; }
        catch (error) { report.failed++; console.error("directory-sync-failed", { clinicId: ref.id, code: error.code || "unknown" }); }
      }));
    }
    return report;
  }
  return { syncClinic, reconcile };
}
module.exports = { createDirectorySync };
