"use strict";
// Preserve the existing optional SMS workflow; Gmail migration does not enable Twilio.
const { FieldValue } = require("firebase-admin/firestore");
const TIME_ZONE = process.env.CLINIC_TIME_ZONE || "America/Chicago";
module.exports = async db => {
const dryRun = process.env.DRY_RUN === "true";
const smsConfigured = Boolean(process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN && process.env.TWILIO_PHONE_NUMBER);
if (!smsConfigured) return;
function escapeHtml(value = "") {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}
function formatAppointment(date, language) {
  return new Intl.DateTimeFormat(/^(en|english|inglés)$/i.test(String(language || "")) ? "en-US" : "es-US", {
    timeZone: TIME_ZONE,
    weekday: "long",
    month: "long",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit"
  }).format(date);
}
function appointmentMessage(patient, clinicName, visitDate, reminderLabel) {
  const name = patient.name || "";
  const formattedDate = formatAppointment(visitDate, patient.language);
  if (/^(en|english|inglés)$/i.test(String(patient.language || ""))) {
    return {
      subject: `Appointment reminder · ${clinicName}`,
      text: `Hello ${name}. ${reminderLabel}: you have an appointment on ${formattedDate} at ${clinicName}. Please contact us if you need to reschedule.`,
      html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2 style="color:#0f766e">Appointment reminder</h2><p>Hello ${escapeHtml(name)},</p><p>${escapeHtml(reminderLabel)}: you have an appointment on <strong>${escapeHtml(formattedDate)}</strong> at <strong>${escapeHtml(clinicName)}</strong>.</p><p>Please contact us if you need to reschedule.</p></div>`
    };
  }
  return {
    subject: `Recordatorio de cita · ${clinicName}`,
    text: `Hola ${name}. ${reminderLabel}: tienes una cita el ${formattedDate} en ${clinicName}. Comunícate con nosotros si necesitas cambiarla.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033"><h2 style="color:#0f766e">Recordatorio de cita</h2><p>Hola ${escapeHtml(name)},</p><p>${escapeHtml(reminderLabel)}: tienes una cita el <strong>${escapeHtml(formattedDate)}</strong> en <strong>${escapeHtml(clinicName)}</strong>.</p><p>Comunícate con nosotros si necesitas cambiarla.</p></div>`
  };
}
async function clinicSettingsFor(clinicRef, cache) {
  if (!cache.has(clinicRef.id)) {
    const settings = await clinicRef.collection("settings").doc("clinic").get();
    const data = settings.data() || {};
    cache.set(clinicRef.id, {
      clinicName: data.clinicName || "Clinic Control",
      senderEmail: data.senderEmail || data.clinicEmail || process.env.GMAIL_USER
    });
  }
  return cache.get(clinicRef.id);
}
function normalizePhone(value = "") {
  const trimmed = String(value).trim();
  if (trimmed.startsWith("+")) return `+${trimmed.slice(1).replace(/\D/g, "")}`;
  const digits = trimmed.replace(/\D/g, "");
  return digits.length === 10 ? `+1${digits}` : (digits ? `+${digits}` : "");
}
async function sendSmsOnce({ id, to, body, metadata }) {
  const logRef = db.collection("notificationLogs").doc(id);
  if ((await logRef.get()).exists) return false;
  if (!smsConfigured) {
    console.warn("SMS not configured");
    return false;
  }
  if (dryRun) {
    console.log("SMS preview: eligible message");
    return true;
  }
  const params = new URLSearchParams({ To: to, From: process.env.TWILIO_PHONE_NUMBER, Body: body });
  const authHeader = Buffer.from(`${process.env.TWILIO_ACCOUNT_SID}:${process.env.TWILIO_AUTH_TOKEN}`).toString("base64");
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${process.env.TWILIO_ACCOUNT_SID}/Messages.json`, {
    method: "POST",
    headers: { Authorization: `Basic ${authHeader}`, "Content-Type": "application/x-www-form-urlencoded" },
    body: params
  });
  const result = await response.json();
  if (!response.ok) throw new Error("sms-delivery-failed");
  await logRef.create({ ...metadata, channel: "sms", recipient: to, messageId: result.sid, sentAt: FieldValue.serverTimestamp() });
  return true;
}
async function sendAppointmentReminders(clinicNames) {
  const now = new Date();
  const reminders = [
    { key: "3d", offsetMs: 72 * 60 * 60 * 1000, es: "Recordatorio de 3 días", en: "3-day reminder" },
    { key: "2d", offsetMs: 48 * 60 * 60 * 1000, es: "Recordatorio de 2 días", en: "2-day reminder" },
    { key: "3h", offsetMs: 3 * 60 * 60 * 1000, es: "Recordatorio de 3 horas", en: "3-hour reminder" }
  ];
  // Ventana amplia para tolerar retrasos del programador; los IDs por etapa evitan duplicados.
  const toleranceMs = 70 * 60 * 1000;
  const [appointments, visits] = await Promise.all([
    db.collectionGroup("appointments").get(),
    db.collectionGroup("visits").get()
  ]);
  const records = [
    ...appointments.docs.map((doc) => ({ doc, data: doc.data(), isAppointment: true })),
    ...visits.docs.map((doc) => ({ doc, data: doc.data(), isAppointment: false }))
  ];
  let emailsSent = 0;
  let smsSent = 0;

  for (const record of records) {
    const { doc, data, isAppointment } = record;
    const eligibleStatus = isAppointment ? ["scheduled", "confirmed"].includes(data.status) : data.status === "Programada";
    if (!eligibleStatus || !data.reminderEnabled || !data.date) continue;
    const appointmentDate = new Date(data.date);
    if (Number.isNaN(appointmentDate.getTime())) continue;
    const remainingMs = appointmentDate.getTime() - now.getTime();
    const reminder = reminders.find((item) => Math.abs(remainingMs - item.offsetMs) <= toleranceMs);
    if (!reminder) continue;

    const clinicRef = doc.ref.parent.parent;
    if (!clinicRef || !data.patientId) continue;
    const patientDoc = await clinicRef.collection("patients").doc(data.patientId).get();
    const patient = patientDoc.data();
    if (!patient) continue;
    const clinic = await clinicSettingsFor(clinicRef, clinicNames);
    const reminderLabel = /^(en|english|inglés)$/i.test(String(patient.language || "")) ? reminder.en : reminder.es;
    const message = appointmentMessage(patient, clinic.clinicName, appointmentDate, reminderLabel);
    const recordMetadata = { type: "appointment", reminder: reminder.key, clinicId: clinicRef.id, patientId: patientDoc.id, [isAppointment ? "appointmentId" : "visitId"]: doc.id };


    const phone = normalizePhone(patient.phone);
    if (phone && patient.smsNotificationsEnabled && await sendSmsOnce({
      id: `appointment_sms_${clinicRef.id}_${doc.id}_${reminder.key}`,
      to: phone,
      body: message.text,
      metadata: recordMetadata
    })) smsSent += 1;
  }
  return { emailsSent, smsSent };
}
const result = await sendAppointmentReminders(new Map());
console.log(JSON.stringify({ smsSent: result.smsSent, dryRun }));
};
