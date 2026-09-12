"use strict";
const crypto = require("node:crypto");
const DAY = 86400000;
const isEnglish = language => !language || /^(en|english)$/i.test(language);
const dateKey = date => new Intl.DateTimeFormat("en-CA", { timeZone: "America/Chicago", year: "numeric", month: "2-digit", day: "2-digit" }).format(date);
const digest = value => crypto.createHash("sha256").update(value).digest("hex").slice(0,24);

// Choose only the nearest due stage: downtime must not cause three reminders at once.
function reminderStage(date, now) {
  const remaining = new Date(date).getTime() - now.getTime();
  if (!Number.isFinite(remaining) || remaining <= 0 || remaining > 3 * DAY) return null;
  if (remaining <= 3 * 3600000) return "3h";
  if (remaining <= 2 * DAY) return "2d";
  return "3d";
}

function createMailer({ db, auth, transport, sender, now = () => new Date(), timestamp, dryRun = false, runner = "firebase" }) {
  const report = { sent: 0, skipped: 0, failed: 0, preview: 0 };
  async function send({ id, to, subject, text, replyTo, legacyIds = [] }) {
    if (typeof to !== "string" || to.length > 320 || !/^[^\s@,;<>]+@[^\s@,;<>]+\.[^\s@,;<>]+$/.test(to)) { report.skipped++; return; }
    const ref = db.collection("emailLogs").doc(id);
    const claimed = await db.runTransaction(async tx => {
      const snaps = await Promise.all([ref, ...legacyIds.map(key => db.collection("emailLogs").doc(key))].map(r => tx.get(r)));
      // Preserve historical logs and uncertain deliveries. Never automatically resend an
      // SMTP message whose acceptance is unknown after a crash or timeout.
      if (snaps.some(s => s.exists)) return false;
      if (!dryRun) tx.create(ref, { status: "sending", recipient: to, createdAt: timestamp() });
      return true;
    });
    if (!claimed) { report.skipped++; return; }
    if (dryRun) { report.preview++; return; }
    try {
      const result = await transport.sendMail({ from: { name: "Clinic Control", address: sender }, to: { address: to }, replyTo: { address: replyTo || sender }, subject, text, disableFileAccess: true, disableUrlAccess: true });
      if (!result.accepted?.length) throw new Error("smtp-not-accepted");
      await ref.set({ status: "sent", sentAt: timestamp(), messageId: result.messageId || null }, { merge: true });
      report.sent++;
    } catch (error) {
      report.failed++;
      await ref.set({ status: "needs_review", errorCode: String(error.code || "delivery-uncertain").slice(0,80), updatedAt: timestamp() }, { merge: true });
      // No recipient, subject, patient information or SMTP responses in public CI logs.
    }
  }
  async function run() {
    if (!dryRun) await transport.verify();
    const current = now(), today = dateKey(current);
    const settings = new Map();
    const clinicInfo = async ref => {
      if (!settings.has(ref.id)) settings.set(ref.id, (await ref.collection("settings").doc("clinic").get()).data() || {});
      return settings.get(ref.id);
    };
    const patients = await db.collectionGroup("patients").get();
    for (const doc of patients.docs) {
      const p = doc.data(), clinicRef = doc.ref.parent.parent;
      if (!clinicRef || !p.emailNotificationsEnabled || !p.birthdayEmailEnabled || !p.birthDate?.endsWith(today.slice(4))) continue;
      const c = await clinicInfo(clinicRef), name = c.clinicName || "Clinic Control", en = isEnglish(p.language);
      await send({ id: `birthday_${clinicRef.id}_${doc.id}_${today.slice(0,4)}`, to: p.email,
        subject: en ? `Happy birthday from ${name}!` : `¡Feliz cumpleaños de parte de ${name}!`,
        text: en ? `Happy birthday, ${p.name || ""}! Wishing you a wonderful day and a healthy year ahead. Best wishes from ${name}.` : `¡Feliz cumpleaños, ${p.name || ""}! Te deseamos un día lleno de alegría y un año de salud y bienestar. Con cariño, ${name}.`, replyTo: c.senderEmail || c.clinicEmail });
    }
    for (const collection of ["appointments", "visits"]) {
      const records = await db.collectionGroup(collection).get();
      for (const doc of records.docs) {
        const a = doc.data(), ref = doc.ref.parent.parent;
        if (!ref || !a.reminderEnabled || !a.patientId || !(collection === "appointments" ? ["scheduled", "confirmed"].includes(a.status) : a.status === "Programada")) continue;
        const stage = reminderStage(a.date, current);
        if (!stage) continue;
        const p = (await ref.collection("patients").doc(a.patientId).get()).data();
        if (!p?.emailNotificationsEnabled) continue;
        const c = await clinicInfo(ref), name = c.clinicName || "Clinic Control", en = isEnglish(p.language);
        const formatted = new Intl.DateTimeFormat(en ? "en-US" : "es-US", { timeZone: "America/Chicago", dateStyle: "full", timeStyle: "short" }).format(new Date(a.date));
        await send({ id: `reminder_${digest(`${ref.id}/${collection}/${doc.id}/${new Date(a.date).toISOString()}`)}_${stage}`,
          legacyIds: [`appointment_email_${ref.id}_${doc.id}_${stage}`], to: p.email,
          subject: en ? `Appointment reminder · ${name}` : `Recordatorio de cita · ${name}`,
          text: en ? `Hello ${p.name || ""}, this is a reminder of your appointment at ${name} on ${formatted}. Please contact the clinic if you need to reschedule.` : `Hola ${p.name || ""}, te recordamos tu cita en ${name} el ${formatted}. Si necesitas cambiarla, comunícate con la clínica.`, replyTo: c.senderEmail || c.clinicEmail });
      }
    }
    const clinics = await db.collection("platformClinics").get();
    for (const doc of clinics.docs) {
      const c = doc.data();
      if (c.status !== "pilot" || !/^\d{4}-\d{2}-\d{2}$/.test(c.pilotEndsAt || "")) continue;
      const days = Math.round((Date.parse(c.pilotEndsAt) - Date.parse(today)) / DAY);
      if (![7,3,1,0].includes(days)) continue;
      let owner;
      try { owner = await auth.getUser(doc.id); } catch (error) { if (error.code === "auth/user-not-found") continue; throw error; }
      if (!owner.emailVerified || owner.disabled) continue;
      const en = isEnglish(c.language);
      await send({ id: `pilot_${doc.id}_${c.pilotEndsAt}_${days}`, to: owner.email,
        subject: en ? "Your Clinic Control pilot date" : "Fecha de tu prueba de Clinic Control",
        text: en ? `Hello, the recorded pilot end date for ${c.name || "your clinic"} is ${c.pilotEndsAt}. This is an administrative reminder only: your access and data remain unchanged, and no charge will be made. Reply to this email to discuss extending your trial.` : `Hola, la fecha registrada de finalización de la prueba de ${c.name || "tu clínica"} es el ${c.pilotEndsAt}. Es solo un aviso administrativo: tu acceso y tus datos no cambian, y no se realizará ningún cobro. Responde a este correo si necesitas ampliar la prueba.` });
    }
    if (!dryRun) {
      const unresolved = await db.collection("emailLogs").where("status", "in", ["sending", "needs_review"]).limit(100).get();
      report.needsReview = unresolved.size;
      await db.doc("platformOperations/email").set({ ...report, runner, lastRunAt: timestamp(), status: report.needsReview ? "needs_review" : "ok" });
    }
    return report;
  }
  return { run, send, report };
}
module.exports = { createMailer, reminderStage, dateKey };
