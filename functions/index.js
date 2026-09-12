const { onSchedule } = require("firebase-functions/v2/scheduler");
const { onRequest } = require("firebase-functions/v2/https");
const { logger } = require("firebase-functions");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { getFirestore, FieldValue } = require("firebase-admin/firestore");
const { getStorage } = require("firebase-admin/storage");
const { DocumentProcessorServiceClient } = require("@google-cloud/documentai").v1;
const { PDFDocument, StandardFonts, rgb } = require("pdf-lib");
const crypto = require("crypto");

initializeApp();

const db = getFirestore();
const TIME_ZONE = "America/Chicago";
const FORM_PROCESSOR_NAME = "projects/713626078372/locations/us/processors/4464ec76cb66d404";
const documentAiClient = new DocumentProcessorServiceClient({ apiEndpoint: "us-documentai.googleapis.com" });

function documentText(document, layout) {
  return (layout?.textAnchor?.textSegments || []).map((segment) => document.text.substring(Number(segment.startIndex || 0), Number(segment.endIndex || 0))).join("").trim();
}

function normalizedBox(layout) {
  const vertices = layout?.boundingPoly?.normalizedVertices || [];
  if (!vertices.length) return null;
  const xs = vertices.map((vertex) => Number(vertex.x || 0)); const ys = vertices.map((vertex) => Number(vertex.y || 0));
  return { x: Math.min(...xs), y: Math.min(...ys), width: Math.max(...xs) - Math.min(...xs), height: Math.max(...ys) - Math.min(...ys) };
}

function slicedNormalizedBox(layout, startRatio = 0, endRatio = 1) {
  const box = normalizedBox(layout); if (!box) return null;
  const start = Math.max(0, Math.min(1, startRatio)); const end = Math.max(start, Math.min(1, endRatio));
  return { x: box.x + box.width * start, y: box.y, width: Math.max(0.035, box.width * (end - start)), height: box.height };
}

function inferredFieldType(label, valueType = "") {
  const text = String(label || "").toLowerCase();
  if (String(valueType).toLowerCase().includes("checkbox") || /(?:sí|si|no|acepto|marque|seleccione)/i.test(text)) return "yesno";
  if (/(?:fecha|date|nacimiento)/i.test(text)) return "date";
  if (/(?:cantidad|edad|número|numero|peso|altura)/i.test(text)) return "number";
  if (/(?:comentario|explique|describa|historial|dirección|direccion|motivo|observación|observacion)/i.test(text)) return "textarea";
  return "text";
}

function detectedRoomFields(document) {
  const fields = [];
  (document.pages || []).forEach((page, pageIndex) => {
    (page.formFields || []).forEach((formField, fieldIndex) => {
      const label = documentText(document, formField.fieldName?.layout).replace(/[:_\s]+$/, "").trim();
      if (!label) return;
      const valueLayout = formField.fieldValue?.layout;
      if (/(?:signature|firma)/i.test(label)) { fields.push({ id: `auto-signature-${pageIndex + 1}-${fieldIndex + 1}`, label: "Firma", type: "signature", hidden: true, required: false, page: pageIndex + 1, box: normalizedBox(valueLayout || formField.fieldName?.layout), placement: "signature", confidence: 0.9 }); return; }
      fields.push({ id: `auto-${pageIndex + 1}-${fieldIndex + 1}`, label: label.slice(0, 180), type: inferredFieldType(label, formField.fieldValue?.valueType), required: false, page: pageIndex + 1, box: normalizedBox(valueLayout || formField.fieldName?.layout), placement: "value", confidence: Number(formField.fieldName?.detectedLanguages?.[0]?.confidence || 0) });
    });

    let checkboxSection = false;
    (page.lines || []).forEach((line, lineIndex) => {
      const raw = documentText(document, line.layout).replace(/\s+/g, " ").trim();
      const text = raw.replace(/^[•·▪◦\-*]\s*/, "").trim();
      if (!text) return;
      if (/(?:patient.{0,30})?(?:signature|firma)(?:\s+of\s+patient)?\s*[:_]/i.test(text)) {
        const signatureStart = Math.max(0, text.search(/(?:signature|firma)/i)); const colon = text.indexOf(":", signatureStart); const dateStart = text.slice(colon + 1).search(/\bdate\s*:/i); const startRatio = Math.min(0.82, (colon + 1) / Math.max(text.length, 1)); const endRatio = dateStart >= 0 ? Math.max(startRatio + 0.08, (colon + 1 + dateStart) / text.length) : 1;
        fields.push({ id: `auto-signature-${pageIndex + 1}-${lineIndex + 1}`, label: "Firma", type: "signature", hidden: true, required: false, page: pageIndex + 1, box: slicedNormalizedBox(line.layout, startRatio, endRatio), placement: "signature", confidence: 0.7 });
      }
      if (/(?:check|select|mark|marque|seleccione).{0,30}(?:apply|correspond)/i.test(text)) { checkboxSection = true; return; }
      if (checkboxSection && /(?:statement|declaration|consentimiento|signature|firma)/i.test(text)) checkboxSection = false;
      if (checkboxSection && text.length <= 90 && !/:$/.test(text)) {
        const lineBox = normalizedBox(line.layout); const checkboxBox = lineBox ? { x: lineBox.x, y: lineBox.y, width: 0.012, height: lineBox.height } : null;
        fields.push({ id: `auto-check-${pageIndex + 1}-${lineIndex + 1}`, label: text.replace(/^[☐□☑✓]\s*/, "").trim(), type: "yesno", required: false, page: pageIndex + 1, box: checkboxBox, placement: "checkbox", confidence: 0.7 });
        return;
      }
      const labeledBlank = /^(.*?):\s*(?:_+|\/?\s*_+|$)/.exec(text);
      if (!labeledBlank) return;
      const label = labeledBlank[1].trim();
      if (!label || label.length > 100 || /^(?:signature|firma)$/i.test(label) || /^(?:I understand that|Entiendo que)$/i.test(label)) return;
      const blankStart = text.indexOf(":") + 1; const nextLabel = text.slice(blankStart).search(/\s+[A-Za-z][A-Za-z '\-/]{1,30}:\s*$/); const end = nextLabel >= 0 ? blankStart + nextLabel : text.length;
      const lineBox = normalizedBox(line.layout); const hasVisibleBlank = /_/.test(text.slice(blankStart)); const targetBox = !hasVisibleBlank && lineBox ? { x: Math.min(0.88, lineBox.x + lineBox.width + 0.006), y: lineBox.y, width: Math.max(0.08, 0.92 - lineBox.x - lineBox.width), height: lineBox.height } : slicedNormalizedBox(line.layout, blankStart / text.length, end / text.length);
      fields.push({ id: `auto-line-${pageIndex + 1}-${lineIndex + 1}`, label, type: inferredFieldType(label), required: false, page: pageIndex + 1, box: targetBox, placement: "blank", confidence: 0.65 });
    });
    const pageCheckboxes = fields.filter((field) => field.page === pageIndex + 1 && field.placement === "checkbox" && field.box);
    if (pageCheckboxes.length) { const checkboxColumn = Math.min(...pageCheckboxes.map((field) => field.box.x)); pageCheckboxes.forEach((field) => { field.box.x = checkboxColumn; }); }
  });
  return fields.filter((field, index) => fields.findIndex((candidate) => candidate.label.toLowerCase() === field.label.toLowerCase() && candidate.page === field.page) === index).slice(0, 100);
}

async function createCompletedPdf({ source, fields, answers, signatureBytes }) {
  const pdf = await PDFDocument.load(source); const font = await pdf.embedFont(StandardFonts.Helvetica); const bold = await pdf.embedFont(StandardFonts.HelveticaBold);
  for (const field of fields || []) {
    if (field.type === "signature") continue;
    const answer = String(answers?.[field.id] || "").trim(); const page = pdf.getPages()[Number(field.page || 1) - 1]; if (!answer || !page || !field.box) continue;
    const { width, height } = page.getSize(); const box = field.box; const x = Math.max(8, box.x * width + 2); const boxWidth = Math.max(16, box.width * width); const boxHeight = Math.max(11, box.height * height); const y = Math.max(8, height - (box.y + box.height) * height + 2);
    if (field.type === "yesno") { if (/^(?:sí|si|yes|true)$/i.test(answer)) { const markSize = Math.max(5, Math.min(9, boxWidth, boxHeight)); const markX = box.x * width; const markY = height - (box.y + box.height) * height + Math.max(0, (boxHeight - markSize) / 2); page.drawLine({ start: { x: markX + 1, y: markY + 1 }, end: { x: markX + markSize - 1, y: markY + markSize - 1 }, thickness: 1.1, color: rgb(0, 0, 0) }); page.drawLine({ start: { x: markX + 1, y: markY + markSize - 1 }, end: { x: markX + markSize - 1, y: markY + 1 }, thickness: 1.1, color: rgb(0, 0, 0) }); } continue; }
    page.drawRectangle({ x: x - 1, y: y - 1, width: boxWidth + 2, height: Math.min(13, boxHeight + 2), color: rgb(1, 1, 1) });
    const printable = answer.slice(0, 180); const naturalWidth = Math.max(1, font.widthOfTextAtSize(printable, 1)); const fontSize = Math.min(9, Math.max(6, boxWidth / naturalWidth));
    page.drawText(printable, { x, y, size: fontSize, font, color: rgb(0, 0, 0) });
  }
  const signatureField = (fields || []).find((field) => field.type === "signature" && field.box); const signature = await pdf.embedPng(signatureBytes);
  if (signatureField) { const signaturePage = pdf.getPages()[Number(signatureField.page || 1) - 1]; if (signaturePage) { const size = signaturePage.getSize(); const box = signatureField.box; const targetWidth = Math.max(90, box.width * size.width); const targetHeight = Math.max(35, box.height * size.height * 2.5); const scale = Math.min(targetWidth / signature.width, targetHeight / signature.height); signaturePage.drawImage(signature, { x: box.x * size.width, y: size.height - (box.y + box.height) * size.height - 4, width: signature.width * scale, height: signature.height * scale }); } }
  else {
    const signaturePage = pdf.addPage([612, 300]);
    signaturePage.drawText("Firma / Signature", { x: 40, y: 250, size: 14, font: bold });
    const scale = Math.min(500 / signature.width, 180 / signature.height);
    signaturePage.drawImage(signature, { x: 40, y: 40, width: signature.width * scale, height: signature.height * scale });
  }
  return Buffer.from(await pdf.save());
}

function datePartsInTimeZone(date = new Date()) {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).formatToParts(date);

  return Object.fromEntries(parts.filter((part) => part.type !== "literal").map((part) => [part.type, part.value]));
}

function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function birthdayMessage(patient, clinicName) {
  const name = patient.name || "";
  const safeName = escapeHtml(name);
  const safeClinic = escapeHtml(clinicName);

  if (patient.language === "Inglés") {
    return {
      subject: `Happy birthday, ${name}!`,
      text: `Happy birthday, ${name}! We hope you have a wonderful day filled with health and happiness. Best wishes from ${clinicName}.`,
      html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2 style="color:#0f766e">Happy birthday, ${safeName}!</h2><p>We hope you have a wonderful day filled with health and happiness.</p><p>Best wishes from <strong>${safeClinic}</strong>.</p></div>`
    };
  }

  return {
    subject: `¡Feliz cumpleaños, ${name}!`,
    text: `¡Feliz cumpleaños, ${name}! Esperamos que disfrutes un día maravilloso lleno de salud y alegría. Con cariño, ${clinicName}.`,
    html: `<div style="font-family:Arial,sans-serif;color:#172033;line-height:1.6"><h2 style="color:#0f766e">¡Feliz cumpleaños, ${safeName}!</h2><p>Esperamos que disfrutes un día maravilloso lleno de salud y alegría.</p><p>Con cariño, <strong>${safeClinic}</strong>.</p></div>`
  };
}

exports.sendBirthdayEmails = onSchedule({
  schedule: "0 9 * * *",
  timeZone: TIME_ZONE,
  region: "us-central1",
  retryCount: 1
}, async () => {
  const { year, month, day } = datePartsInTimeZone();
  const birthdaySuffix = `-${month}-${day}`;
  const patients = await db.collectionGroup("patients").get();
  const clinicSettings = new Map();
  let queued = 0;

  for (const patientDoc of patients.docs) {
    const patient = patientDoc.data();
    if (!patient.emailNotificationsEnabled || !patient.birthdayEmailEnabled || !patient.email || !patient.birthDate?.endsWith(birthdaySuffix)) continue;

    const clinicRef = patientDoc.ref.parent.parent;
    if (!clinicRef) continue;

    if (!clinicSettings.has(clinicRef.id)) {
      const settingsDoc = await clinicRef.collection("settings").doc("clinic").get();
      const settings = settingsDoc.data() || {};
      clinicSettings.set(clinicRef.id, {
        clinicName: settings.clinicName || "Clinic Control",
        senderEmail: settings.senderEmail || settings.clinicEmail || ""
      });
    }

    const mailId = `birthday_${clinicRef.id}_${patientDoc.id}_${year}`;
    const mailRef = db.collection("mail").doc(mailId);
    const clinic = clinicSettings.get(clinicRef.id);
    const message = {
      ...birthdayMessage(patient, clinic.clinicName),
      ...(clinic.senderEmail ? {
        from: `${clinic.clinicName} <${clinic.senderEmail}>`,
        replyTo: clinic.senderEmail
      } : {})
    };

    const created = await db.runTransaction(async (transaction) => {
      if ((await transaction.get(mailRef)).exists) return false;
      transaction.create(mailRef, {
        to: [patient.email],
        message,
        metadata: {
          type: "birthday",
          clinicId: clinicRef.id,
          patientId: patientDoc.id,
          language: patient.language || "Español",
          year
        },
        createdAt: FieldValue.serverTimestamp()
      });
      return true;
    });

    if (created) queued += 1;
  }

  logger.info("Birthday email check completed", { patients: patients.size, queued, date: `${year}-${month}-${day}` });
});

function portalCors(response) {
  response.set("Access-Control-Allow-Origin", "https://marquettisolutions.github.io");
  response.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  response.set("Access-Control-Allow-Methods", "POST, OPTIONS");
}

function portalCode() { return crypto.randomBytes(6).toString("base64url").toUpperCase(); }
function portalKey(code = "") { return crypto.createHash("sha256").update(String(code).trim().toUpperCase()).digest("hex"); }
function portalExpired(session) { return !session || session.status !== "active" || !session.expiresAt || session.expiresAt.toMillis() <= Date.now(); }

async function requireClinicUser(request, clinicId) {
  const bearer = request.headers.authorization || "";
  if (!bearer.startsWith("Bearer ")) throw new Error("unauthenticated");
  const decoded = await getAuth().verifyIdToken(bearer.slice(7));
  if (decoded.uid === clinicId) return decoded;
  const profile = await db.collection("userProfiles").doc(decoded.uid).get();
  const data = profile.data();
  if (!profile.exists || data.clinicId !== clinicId || data.status !== "active" || !["admin", "reception", "clinical"].includes(data.role)) throw new Error("forbidden");
  return decoded;
}

async function loadPortalSession(code, allowCompleted = false) {
  const ref = db.collection("patientPortalSessions").doc(portalKey(code));
  const snap = await ref.get(); const session = snap.data();
  if (allowCompleted && session?.status === "completed" && session.expiresAt?.toMillis() > Date.now()) return { ref, session };
  if (!snap.exists || portalExpired(session)) throw new Error("invalid-session");
  const room = (await db.doc(`clinics/${session.clinicId}/rooms/${session.roomId}`).get()).data();
  if (!room || room.patientId !== session.patientId || room.portalActive !== true || (room.portalSessionKey && room.portalSessionKey !== ref.id)) throw new Error("invalid-session");
  return { ref, session };
}

async function advancePortalSession(ref, expectedIndex, write) {
  return db.runTransaction(async (transaction) => {
    const current = (await transaction.get(ref)).data();
    if (portalExpired(current)) throw new Error("invalid-session");
    if ((current.currentIndex || 0) !== expectedIndex) throw new Error("invalid-activity");
    const room = (await transaction.get(db.doc(`clinics/${current.clinicId}/rooms/${current.roomId}`))).data();
    if (!room || !room.portalActive || room.patientId !== current.patientId || (room.portalSessionKey && room.portalSessionKey !== ref.id)) throw new Error("invalid-session");
    await write(transaction);
    transaction.update(ref, { currentIndex: expectedIndex + 1, updatedAt: FieldValue.serverTimestamp() });
  });
}

exports.patientPortal = onRequest({ region: "us-central1", cors: false, timeoutSeconds: 120, invoker: "public" }, async (request, response) => {
  portalCors(response);
  if (request.method === "OPTIONS") return response.status(204).send("");
  if (request.method !== "POST") return response.status(405).json({ error: "method-not-allowed" });
  try {
    const action = request.body?.action;
    if (action === "create") {
      const { clinicId, roomId, patientId, activities = [], language = "es", completionAction = "ready" } = request.body;
      if (!Array.isArray(activities) || !["ready", "waiting", "nursing"].includes(completionAction)) throw new Error("invalid-activity");
      const user = await requireClinicUser(request, clinicId);
      const [roomSnap, patientSnap] = await Promise.all([db.doc(`clinics/${clinicId}/rooms/${roomId}`).get(), db.doc(`clinics/${clinicId}/patients/${patientId}`).get()]);
      if (!roomSnap.exists || roomSnap.data().patientId !== patientId || !patientSnap.exists) throw new Error("invalid-room");
      const safeActivities = [];
      for (const item of activities.slice(0, 20)) {
        if (item.type === "form") {
          const snap = await db.doc(`clinics/${clinicId}/formResponses/${item.responseId}`).get();
          if (snap.exists && snap.data().patientId === patientId && snap.data().status !== "completed") safeActivities.push({ type: "form", responseId: item.responseId });
        }
        if (item.type === "document") {
          const snap = await db.doc(`clinics/${clinicId}/visits/${item.visitId}`).get(); const doc = (snap.data()?.documents || []).find((entry) => entry.documentId === item.documentId && entry.status !== "signed");
          if (snap.exists && snap.data().patientId === patientId && doc) safeActivities.push({ type: "document", visitId: item.visitId, documentId: item.documentId });
        }
      }
      if (!safeActivities.length) return response.status(400).json({ error: "no-activities" });
      const code = portalCode(); const expiresAt = new Date(Date.now() + 30 * 60 * 1000);
      await db.runTransaction(async (transaction) => {
        const room = (await transaction.get(roomSnap.ref)).data();
        if (!room || room.patientId !== patientId) throw new Error("invalid-room");
        transaction.set(db.collection("patientPortalSessions").doc(portalKey(code)), { clinicId, roomId, patientId, activities: safeActivities, language, completionAction, currentIndex: 0, status: "active", createdBy: user.uid, createdAt: FieldValue.serverTimestamp(), expiresAt });
        transaction.update(roomSnap.ref, { status: room.status === "waiting" ? "nursing" : room.status, portalActive: true, portalSessionKey: portalKey(code), portalExpiresAt: expiresAt, updatedAt: new Date().toISOString() });
      });
      return response.json({ code, expiresAt: expiresAt.toISOString(), portalUrl: `https://marquettisolutions.github.io/Clinic-Control/patient.html?code=${encodeURIComponent(code)}` });
    }

    if (action === "analyzeDocument") {
      const { clinicId, documentId } = request.body;
      await requireClinicUser(request, clinicId);
      const documentRef = db.doc(`clinics/${clinicId}/documents/${documentId}`); const documentSnap = await documentRef.get(); const documentItem = documentSnap.data();
      if (!documentSnap.exists || documentItem.type !== "application/pdf" || !documentItem.path) throw new Error("invalid-document");
      const [pdfBuffer] = await getStorage().bucket().file(documentItem.path).download();
      const [result] = await documentAiClient.processDocument({ name: FORM_PROCESSOR_NAME, rawDocument: { content: pdfBuffer.toString("base64"), mimeType: "application/pdf" } });
      const fields = detectedRoomFields(result.document || {});
      await documentRef.set({ fields, roomReady: true, analysisStatus: fields.length ? "completed" : "signature_only", analyzedAt: new Date().toISOString(), analyzer: "google-document-ai-form-parser" }, { merge: true });
      return response.json({ fields, roomReady: true });
    }

    const { ref, session } = await loadPortalSession(request.body?.code, action === "complete");
    if (action === "complete" && session.status === "completed") return response.json({ ok: true });
    const clinic = db.collection("clinics").doc(session.clinicId);
    if (action === "get") {
      const [patientSnap, settingsSnap, roomSnap] = await Promise.all([clinic.collection("patients").doc(session.patientId).get(), clinic.collection("settings").doc("clinic").get(), clinic.collection("rooms").doc(session.roomId).get()]);
      const activities = [];
      for (const item of session.activities || []) {
        if (item.type === "form") { const snap = await clinic.collection("formResponses").doc(item.responseId).get(); const data = snap.data(); if (snap.exists) activities.push({ type: "form", responseId: item.responseId, title: data.templateName || "Formulario", description: data.description || "", questions: data.questions || [], answers: data.answers || {} }); }
        if (item.type === "document") { const snap = await clinic.collection("visits").doc(item.visitId).get(); const doc = (snap.data()?.documents || []).find((entry) => entry.documentId === item.documentId); if (doc) activities.push({ type: "document", visitId: item.visitId, documentId: item.documentId, title: doc.name || "Documento", url: doc.url || "", fields: (doc.fields || []).filter((field) => !field.hidden && field.type !== "signature"), answers: doc.answers || {} }); }
      }
      if (activities.length !== (session.activities || []).length) throw new Error("invalid-activity");
      return response.json({ clinicName: settingsSnap.data()?.clinicName || "Clinic Control", roomName: roomSnap.data()?.name || "Room", firstName: (patientSnap.data()?.name || "").split(" ")[0], language: session.language, currentIndex: session.currentIndex || 0, activities, expiresAt: session.expiresAt.toDate().toISOString() });
    }
    if (action === "submitForm") {
      const item = (session.activities || [])[session.currentIndex || 0]; if (item?.type !== "form" || item.responseId !== request.body.responseId) throw new Error("invalid-activity");
      const formRef = clinic.collection("formResponses").doc(item.responseId); const snap = await formRef.get(); const form = snap.data();
      if (!form || form.patientId !== session.patientId) throw new Error("invalid-activity");
      const answers = request.body.answers || {}; const missing = (form.questions || []).find((q) => q.required && !String(answers[q.id] || "").trim()); if (missing) return response.status(400).json({ error: "required", label: missing.label });
      await advancePortalSession(ref, session.currentIndex || 0, async (transaction) => {
        transaction.set(formRef, { answers, status: "completed", completedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), completedBy: "patient-portal", roomId: session.roomId }, { merge: true });
      });
      return response.json({ ok: true });
    }
    if (action === "signDocument") {
      const item = (session.activities || [])[session.currentIndex || 0]; if (item?.type !== "document" || item.visitId !== request.body.visitId || item.documentId !== request.body.documentId || request.body.consent !== true) throw new Error("invalid-activity");
      const match = /^data:image\/png;base64,([A-Za-z0-9+/=]+)$/.exec(request.body.signature || ""); if (!match || match[1].length > 2000000) throw new Error("invalid-signature"); const signedBy = String(request.body.signedBy || "").trim().slice(0, 160); if (!signedBy) throw new Error("signer-required");
      const visitRef = clinic.collection("visits").doc(item.visitId); const snap = await visitRef.get(); const visit = snap.data(); const doc = (visit.documents || []).find((entry) => entry.documentId === item.documentId); if (!doc || visit.patientId !== session.patientId) throw new Error("invalid-document");
      const answers = request.body.answers || {}; const missing = (doc.fields || []).find((field) => !field.hidden && field.type !== "signature" && field.required && !String(answers[field.id] ?? "").trim()); if (missing) return response.status(400).json({ error: "required", label: missing.label });
      const token = crypto.randomUUID(); const path = `clinics/${session.clinicId}/signatures/${item.visitId}/${item.documentId}/${token}.png`; const file = getStorage().bucket().file(path); await file.save(Buffer.from(match[1], "base64"), { metadata: { contentType: "image/png", metadata: { firebaseStorageDownloadTokens: token } } });
      const bucket = getStorage().bucket(); const signatureUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(path)}?alt=media&token=${token}`; const signedAt = new Date().toISOString();
      const librarySnap = await clinic.collection("documents").doc(item.documentId).get(); const sourcePath = librarySnap.data()?.path; let completedPdfUrl = ""; let completedPdfPath = ""; let completedFields = doc.fields || [];
      if (sourcePath) {
        try {
          const [source] = await bucket.file(sourcePath).download();
          if (!completedFields.some((field) => field.placement === "signature")) {
            try {
              const [analysis] = await documentAiClient.processDocument({ name: FORM_PROCESSOR_NAME, rawDocument: { content: source.toString("base64"), mimeType: "application/pdf" } });
              completedFields = [...completedFields, ...detectedRoomFields(analysis.document || {}).filter((field) => field.placement === "signature")];
            } catch (analysisError) { logger.warn("Using existing PDF fields", { message: analysisError.message }); }
          }
          const completed = await createCompletedPdf({ source, fields: completedFields, answers, signatureBytes: Buffer.from(match[1], "base64") });
          const completedToken = crypto.randomUUID(); completedPdfPath = `clinics/${session.clinicId}/completed-documents/${item.visitId}/${item.documentId}/${completedToken}.pdf`; await bucket.file(completedPdfPath).save(completed, { metadata: { contentType: "application/pdf", contentDisposition: `inline; filename="${String(doc.name || "documento.pdf").replace(/[^a-zA-Z0-9._ -]/g, "")}"`, metadata: { firebaseStorageDownloadTokens: completedToken } } });
          completedPdfUrl = `https://firebasestorage.googleapis.com/v0/b/${bucket.name}/o/${encodeURIComponent(completedPdfPath)}?alt=media&token=${completedToken}`;
        } catch (pdfError) { logger.error("Could not create completed PDF", { clinicId: session.clinicId, visitId: item.visitId, documentId: item.documentId, message: pdfError.message }); }
      }
      await advancePortalSession(ref, session.currentIndex || 0, async (transaction) => {
        const latest = (await transaction.get(visitRef)).data();
        if (!latest || latest.patientId !== session.patientId || !latest.documents?.some((entry) => entry.documentId === item.documentId)) throw new Error("invalid-document");
        const documents = latest.documents.map((entry) => entry.documentId === item.documentId ? { ...entry, fields: completedFields, answers, status: "signed", signedBy, signedAt, signatureUrl, signaturePath: path, completedPdfUrl, completedPdfPath, consentAccepted: true, signedInRoomId: session.roomId } : entry);
        transaction.update(visitRef, { documents, updatedAt: signedAt });
      });
      return response.json({ ok: true, completedPdfUrl });
    }
    if (action === "complete") {
      await db.runTransaction(async (transaction) => {
        const current = (await transaction.get(ref)).data();
        const roomRef = clinic.collection("rooms").doc(session.roomId);
        const room = (await transaction.get(roomRef)).data();
        if (portalExpired(current) || !room || room.patientId !== session.patientId || (room.portalSessionKey && room.portalSessionKey !== ref.id)) throw new Error("invalid-session");
        if ((current.currentIndex || 0) < current.activities.length) throw new Error("pending-activities");
        transaction.update(ref, { status: "completed", completedAt: FieldValue.serverTimestamp() });
        transaction.update(roomRef, { status: current.completionAction || "ready", portalActive: false, portalExpiresAt: null, updatedAt: new Date().toISOString() });
      });
      return response.json({ ok: true });
    }
    return response.status(400).json({ error: "unknown-action" });
  } catch (error) {
    logger.warn("Patient portal request rejected", { action: request.body?.action, message: error.message });
    const status = ["unauthenticated", "forbidden"].includes(error.message) ? 403 : ["invalid-session"].includes(error.message) ? 410 : 400;
    return response.status(status).json({ error: error.message });
  }
});
