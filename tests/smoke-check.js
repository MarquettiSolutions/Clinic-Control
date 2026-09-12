const fs = require("fs");

const html = fs.readFileSync("index.html", "utf8");
const app = fs.readFileSync("app.js", "utf8");
const rules = fs.readFileSync("firestore.rules", "utf8");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((match) => match[1]);
const duplicateIds = [...new Set(ids.filter((id, index) => ids.indexOf(id) !== index))];
const referencedIds = [...app.matchAll(/\$\("#([A-Za-z][\w-]*)"\)/g)].map((match) => match[1]);
const missingIds = [...new Set(referencedIds.filter((id) => !ids.includes(id)))];

const requiredPages = ["dashboard", "patients", "appointments", "rooms", "tasks", "visits", "billing", "invoices", "reports", "settings", "patientRecord"];
const requiredDialogs = ["patientDialog", "appointmentDialog", "paymentDialog", "taskDialog", "signatureDialog", "formTemplateDialog", "patientFormDialog", "communicationDialog", "clinicalRecordDialog", "leadDialog", "campaignDialog", "waitlistDialog", "expenseDialog", "adjustmentDialog", "cashClosingDialog"];
const requiredCollections = ["patients", "visits", "appointments", "rooms", "payments", "documents", "tasks", "activities", "members", "formTemplates", "formResponses", "communications", "clinicalRecords", "leads", "campaigns", "waitlist", "expenses", "adjustments", "cashClosings"];
const requiredFunctions = ["renderCrm", "renderAppointments", "renderAdvancedAccounting", "renderReports", "renderPatientRecord", "recordActivity", "resolveUserAccess", "savePatientDigitalForm", "saveClinicalRecord", "saveAdjustment", "saveCashClosing"];

const missingPages = requiredPages.filter((id) => !ids.includes(id));
const missingDialogs = requiredDialogs.filter((id) => !ids.includes(id));
const missingCollections = requiredCollections.filter((name) => !rules.includes(`/clinics/{clinicId}/${name}/`));
const missingFunctions = requiredFunctions.filter((name) => !app.includes(`function ${name}`) && !app.includes(`async function ${name}`));

const removedPilotUi = ["pilotValidationGrid", "pilotResetBtn", "togglePilotCheck", "renderPilotValidation"].filter(name => html.includes(name) || app.includes(name));
const requiredSecurityRules = [
  "function validRole(role)",
  "function validMemberStatus(status)",
  "request.resource.data.clinicId == resource.data.clinicId",
  "affectedKeys().hasOnly(['name', 'role', 'status', 'updatedAt'])",
  "allow delete: if false;"
];
const missingSecurityRules = requiredSecurityRules.filter((rule) => !rules.includes(rule));
const failures = { duplicateIds, missingIds, missingPages, missingDialogs, missingCollections, missingFunctions, removedPilotUi, missingSecurityRules };
const failed = Object.values(failures).some((items) => items.length);
if (failed) {
  console.error(JSON.stringify(failures, null, 2));
  process.exit(1);
}

console.log(`Smoke check passed: ${requiredPages.length} pages, ${requiredDialogs.length} dialogs, ${requiredCollections.length} secured collections.`);
