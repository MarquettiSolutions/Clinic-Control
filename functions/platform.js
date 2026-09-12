"use strict";
const { onRequest } = require("firebase-functions/v2/https");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");

// Billing is intentionally gated off. Enabling it requires a separately tested
// Stripe integration, verified webhooks and an approved production hostname.
const BILLING_ENABLED = false;
const allowedOrigins = new Set(["https://marquettisolutions.github.io"]);
if (process.env.FUNCTIONS_EMULATOR === "true") {
  allowedOrigins.add("http://localhost:3000");
  allowedOrigins.add("http://127.0.0.1:3000");
}

function publicClinic(id, data = {}) {
  return { id, name: data.name || "", ownerEmail: data.ownerEmail || "", status: data.status || "pilot", createdAt: data.createdAt?.toDate?.().toISOString() || null, pilotEndsAt: data.pilotEndsAt || null, ownerNote: data.ownerNote || "" };
}

exports.platformApi = onRequest({ region: "us-central1", cors: false, invoker: "public", timeoutSeconds: 30 }, async (req, res) => {
  const origin = req.headers.origin;
  if (origin && !allowedOrigins.has(origin)) return res.status(403).json({ error: "forbidden-origin" });
  if (origin) res.set("Access-Control-Allow-Origin", origin);
  res.set("Vary", "Origin");
  res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
  res.set("Cache-Control", "no-store");
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ error: "method-not-allowed" });
  let user;
  try {
    const token = /^Bearer (.+)$/.exec(req.headers.authorization || "")?.[1];
    if (!token) return res.status(401).json({ error: "unauthenticated" });
    user = await getAuth().verifyIdToken(token, true);
  } catch { return res.status(401).json({ error: "unauthenticated" }); }
  const db = getFirestore();
  const action = req.body?.action;
  try {
    if (["ownerDetails", "extendPilot", "saveOwnerNote"].includes(action)) {
      if (user.platformAdmin !== true) return res.status(403).json({ error: "platform-access-required" });
      const { clinicId, requestId, days, reason, note } = req.body;
      if (typeof clinicId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clinicId)) return res.status(400).json({ error: "invalid-request" });
      const ref = db.collection("platformClinics").doc(clinicId);
      if (action === "ownerDetails") {
        const snapshot = await ref.get();
        if (!snapshot.exists) return res.status(404).json({ error: "not-found" });
        const history = await ref.collection("history").orderBy("createdAt", "desc").limit(50).get();
        return res.json({ clinic: publicClinic(clinicId, snapshot.data()), history: history.docs.map(doc => {
          const item = doc.data();
          return { id: doc.id, action: item.action, actorUid: item.actorUid, reason: item.reason || "", previousEnd: item.previousEnd || null, pilotEndsAt: item.pilotEndsAt || null, status: item.status || null, days: item.days || null, createdAt: item.createdAt?.toDate?.().toISOString() || null };
        }) });
      }
      if (typeof requestId !== "string" || !/^[A-Za-z0-9_-]{16,80}$/.test(requestId)) return res.status(400).json({ error: "invalid-request" });
      if (action === "extendPilot" && (![7,14,30].includes(days) || typeof reason !== "string" || !reason.trim() || reason.length > 500)) return res.status(400).json({ error: "invalid-request" });
      if (action === "saveOwnerNote" && (typeof note !== "string" || note.length > 2000)) return res.status(400).json({ error: "invalid-request" });
      const eventRef = ref.collection("history").doc(requestId);
      await db.runTransaction(async tx => {
        const snapshot = await tx.get(ref);
        const previousEvent = await tx.get(eventRef);
        if (!snapshot.exists) throw new Error("not-found");
        // A retried request must not add the same days twice.
        if (previousEvent.exists) return;
        const data = snapshot.data();
        const update = { updatedAt: FieldValue.serverTimestamp() };
        const event = { actorUid: user.uid, clinicId, action, createdAt: FieldValue.serverTimestamp() };
        if (action === "extendPilot") {
          const today = new Date().toISOString().slice(0,10);
          const base = data.pilotEndsAt && data.pilotEndsAt > today ? data.pilotEndsAt : today;
          const date = new Date(`${base}T00:00:00Z`);
          date.setUTCDate(date.getUTCDate() + days);
          update.pilotEndsAt = date.toISOString().slice(0,10);
          update.status = "pilot";
          Object.assign(event, { previousEnd: data.pilotEndsAt || null, pilotEndsAt: update.pilotEndsAt, days, reason: reason.trim() });
        } else update.ownerNote = note.trim();
        tx.update(ref, update);
        tx.create(eventRef, event);
        tx.create(db.collection("platformAudit").doc(), event);
      });
      return res.json({ saved: true, clinic: publicClinic(clinicId, (await ref.get()).data()) });
    }
    if (action === "ownerOverview") {
      // A trusted administrator grants this claim through Admin SDK only.
      if (user.platformAdmin !== true) return res.status(403).json({ error: "platform-access-required" });
      const cursor = req.body.cursor;
      if (cursor && (typeof cursor !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(cursor))) return res.status(400).json({ error: "invalid-request" });
      let query = db.collection("platformClinics").orderBy("__name__").limit(51);
      if (cursor) query = query.startAfter(cursor);
      const snapshot = await query.get();
      const docs = snapshot.docs.slice(0, 50);
      return res.json({ clinics: docs.map(doc => publicClinic(doc.id, doc.data())), nextCursor: snapshot.size > 50 ? docs.at(-1).id : null, billingEnabled: BILLING_ENABLED });
    }
    if (action === "updatePilot") {
      if (user.platformAdmin !== true) return res.status(403).json({ error: "platform-access-required" });
      const { clinicId, status, pilotEndsAt } = req.body;
      if (typeof clinicId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clinicId) || !["pilot", "contact_requested", "archived"].includes(status) || (pilotEndsAt !== null && (typeof pilotEndsAt !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(pilotEndsAt) || !Number.isFinite(Date.parse(pilotEndsAt))))) return res.status(400).json({ error: "invalid-request" });
      if (pilotEndsAt && new Date(`${pilotEndsAt}T00:00:00Z`).toISOString().slice(0, 10) !== pilotEndsAt) return res.status(400).json({ error: "invalid-request" });
      const ref = db.collection("platformClinics").doc(clinicId);
      await db.runTransaction(async tx => {
        const previous = await tx.get(ref);
        if (!previous.exists) throw new Error("not-found");
        tx.update(ref, { status, pilotEndsAt, updatedAt: FieldValue.serverTimestamp() });
        const event = { actorUid: user.uid, clinicId, action: "updatePilot", status, previousEnd: previous.data().pilotEndsAt || null, pilotEndsAt, createdAt: FieldValue.serverTimestamp() };
        tx.create(db.collection("platformAudit").doc(), event);
        tx.create(ref.collection("history").doc(), event);
      });
      return res.json({ saved: true });
    }
    const clinicId = req.body?.clinicId;
    if (typeof clinicId !== "string" || !/^[A-Za-z0-9_-]{1,128}$/.test(clinicId)) return res.status(400).json({ error: "invalid-request" });
    const profile = user.uid === clinicId ? null : (await db.doc(`userProfiles/${user.uid}`).get()).data();
    if (user.uid !== clinicId && !(profile?.clinicId === clinicId && profile?.status === "active" && profile?.role === "admin")) return res.status(403).json({ error: "clinic-admin-required" });
    if (action === "syncClinic") {
      const settings = (await db.doc(`clinics/${clinicId}/settings/clinic`).get()).data();
      if (!settings) return res.status(409).json({ error: "clinic-setup-required" });
      const owner = await getAuth().getUser(clinicId);
      const ref = db.collection("platformClinics").doc(clinicId);
      await db.runTransaction(async tx => {
        const exists = (await tx.get(ref)).exists;
        tx.set(ref, { name: String(settings.clinicName || "").slice(0, 160), ownerEmail: owner.email || "", updatedAt: FieldValue.serverTimestamp(), ...(!exists ? { status: "pilot", pilotEndsAt: null, createdAt: FieldValue.serverTimestamp() } : {}) }, { merge: true });
      });
      return res.json({ synced: true });
    }
    if (["subscription", "checkout", "billingPortal"].includes(action)) {
      return res.status(action === "subscription" ? 200 : 503).json({ status: "pilot", billingEnabled: false, error: action === "subscription" ? null : "billing-not-configured" });
    }
    return res.status(400).json({ error: "unknown-action" });
  } catch (error) {
    console.error("platform-api", { action, code: error.code || error.message });
    return res.status(error.message === "not-found" ? 404 : 500).json({ error: error.message === "not-found" ? "not-found" : "service-unavailable" });
  }
});
