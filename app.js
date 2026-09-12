let state = { settings: {}, patients: [], visits: [], appointments: [], rooms: [], payments: [], documents: [], tasks: [], activities: [], teamMembers: [], formTemplates: [], formResponses: [], communications: [], clinicalRecords: [], leads: [], campaigns: [], waitlist: [], expenses: [], adjustments: [], cashClosings: [] };
let firestore = null;
let auth = null;
let storage = null;
let activeClinicId = null;
let currentAccess = { role: "admin", status: "active", name: "" };
let unsubscribeSettings = null;
let unsubscribePatients = null;
let unsubscribeVisits = null;
let unsubscribeAppointments = null;
let unsubscribeRooms = null;
let unsubscribePayments = null;
let unsubscribeDocuments = null;
let unsubscribeTasks = null;
let unsubscribeActivities = null;
let unsubscribeTeamMembers = null;
let unsubscribeFormTemplates = null;
let unsubscribeFormResponses = null;
let unsubscribeCommunications = null;
let unsubscribeClinicalRecords = null;
let unsubscribeLeads = null;
let unsubscribeCampaigns = null;
let unsubscribeWaitlist = null;
let unsubscribeExpenses = null;
let unsubscribeAdjustments = null;
let unsubscribeCashClosings = null;
let activeInvoiceId = null;
let activeBillingTab = "all";
let activeFinancePatientId = null;
let activePatientRecordId = null;
let activePatientRecordTab = "summary";
let pendingAppointmentId = null;
let activeSignatureVisitId = null;
let activeSignatureDocumentId = null;
let signatureHasInk = false;
let appointmentView = localStorage.getItem("clinicAppointmentView") || "day";
let currentBillingRows = [];
let activePatientFormResponseId = null;
let activeWaitlistId = null;
let activeKioskSession = (() => { try { return JSON.parse(sessionStorage.getItem("clinicKioskSession") || "null"); } catch { return null; } })();
let pendingRoomIpadId = null;
let registrationInProgress = false;
let setupNoticeDismissedFor = null;

function uid() {
  if (window.crypto && crypto.randomUUID) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function patientSearchText(patientItem) {
  return `${patientItem?.name || ""} ${patientItem?.phone || ""} ${patientItem?.email || ""} ${patientItem?.document || ""} ${patientItem?.address || ""}`.toLowerCase();
}

function enablePatientSelectSearch(select, options = {}) {
  if (!select) return;
  const selectedValue = select.value;
  const entries = [...select.options].map((option) => ({
    value: option.value,
    label: option.textContent,
    search: option.value ? patientSearchText(patient(option.dataset.patientId || option.value)) : option.textContent.toLowerCase()
  }));
  select._patientSearchEntries = entries;

  let search = select.previousElementSibling;
  if (!search?.classList.contains("patient-select-search")) {
    search = document.createElement("input");
    search.type = "search";
    search.className = "patient-select-search";
    search.placeholder = options.placeholder || T("Buscar paciente por nombre, teléfono, documento o correo...");
    search.autocomplete = "off";
    search.setAttribute("aria-label", options.ariaLabel || "Buscar paciente");
    select.before(search);
    search.addEventListener("input", () => {
      const query = search.value.toLowerCase().trim();
      const currentValue = select.value;
      const matches = (select._patientSearchEntries || []).filter((entry) => !query || entry.search.includes(query));
      select.innerHTML = matches.length
        ? matches.map((entry) => H`<option value="${escapeHtml(entry.value)}">${escapeHtml(entry.label)}</option>`).join("")
        : H`<option value="">No se encontraron pacientes</option>`;
      if (matches.some((entry) => entry.value === currentValue)) select.value = currentValue;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
  }
  search.value = "";
  if (entries.some((entry) => entry.value === selectedValue)) select.value = selectedValue;
}

function buildSeedState() {
  return {
    settings: {
      clinicName: "",
      clinicAddress: "",
      clinicPhone: "",
      clinicEmail: "",
      clinicLogo: "",
      doctors: [],
      invoicePrefix: "FAC",
      invoiceAccentColor: "#0f766e",
      invoiceLogoPosition: "left",
      invoiceFooter: "Gracias por confiar en nuestra clínica.",
      invoiceShowAddress: true,
      invoiceShowPhone: true,
      invoiceShowEmail: true,
      invoiceShowDoctor: true,
      invoiceShowInsurance: true
    },
    patients: [],
    visits: [],
    appointments: [],
    rooms: [],
    payments: [],
    documents: [],
    tasks: [],
    activities: [],
    teamMembers: [],
    formTemplates: [],
    formResponses: [],
    communications: [],
    clinicalRecords: [],
    leads: [],
    campaigns: [],
    waitlist: [],
    expenses: [],
    adjustments: [],
    cashClosings: []
  };
}

function normalizeState(saved) {
  const seed = buildSeedState();
  return {
    settings: {
      clinicName: saved?.settings?.clinicName || seed.settings.clinicName,
      clinicAddress: saved?.settings?.clinicAddress || seed.settings.clinicAddress,
      clinicPhone: saved?.settings?.clinicPhone || seed.settings.clinicPhone,
      clinicEmail: saved?.settings?.clinicEmail || seed.settings.clinicEmail,
      clinicLogo: saved?.settings?.clinicLogo || seed.settings.clinicLogo,
      doctors: Array.isArray(saved?.settings?.doctors) ? saved.settings.doctors.filter(Boolean) : seed.settings.doctors,
      invoicePrefix: saved?.settings?.invoicePrefix || seed.settings.invoicePrefix,
      invoiceAccentColor: saved?.settings?.invoiceAccentColor || seed.settings.invoiceAccentColor,
      invoiceLogoPosition: saved?.settings?.invoiceLogoPosition || seed.settings.invoiceLogoPosition,
      invoiceFooter: saved?.settings?.invoiceFooter ?? seed.settings.invoiceFooter,
      invoiceShowAddress: saved?.settings?.invoiceShowAddress ?? seed.settings.invoiceShowAddress,
      invoiceShowPhone: saved?.settings?.invoiceShowPhone ?? seed.settings.invoiceShowPhone,
      invoiceShowEmail: saved?.settings?.invoiceShowEmail ?? seed.settings.invoiceShowEmail,
      invoiceShowDoctor: saved?.settings?.invoiceShowDoctor ?? seed.settings.invoiceShowDoctor,
      invoiceShowInsurance: saved?.settings?.invoiceShowInsurance ?? seed.settings.invoiceShowInsurance
    },
    patients: Array.isArray(saved?.patients) ? saved.patients : seed.patients,
    visits: Array.isArray(saved?.visits) ? saved.visits : seed.visits,
    appointments: Array.isArray(saved?.appointments) ? saved.appointments : seed.appointments,
    rooms: Array.isArray(saved?.rooms) ? saved.rooms : seed.rooms,
    payments: Array.isArray(saved?.payments) ? saved.payments : seed.payments,
    documents: Array.isArray(saved?.documents) ? saved.documents : seed.documents,
    tasks: Array.isArray(saved?.tasks) ? saved.tasks : seed.tasks,
    activities: Array.isArray(saved?.activities) ? saved.activities : seed.activities,
    teamMembers: Array.isArray(saved?.teamMembers) ? saved.teamMembers : seed.teamMembers,
    formTemplates: Array.isArray(saved?.formTemplates) ? saved.formTemplates : seed.formTemplates,
    formResponses: Array.isArray(saved?.formResponses) ? saved.formResponses : seed.formResponses,
    communications: Array.isArray(saved?.communications) ? saved.communications : seed.communications,
    clinicalRecords: Array.isArray(saved?.clinicalRecords) ? saved.clinicalRecords : seed.clinicalRecords,
    leads: Array.isArray(saved?.leads) ? saved.leads : seed.leads,
    campaigns: Array.isArray(saved?.campaigns) ? saved.campaigns : seed.campaigns,
    waitlist: Array.isArray(saved?.waitlist) ? saved.waitlist : seed.waitlist,
    expenses: Array.isArray(saved?.expenses) ? saved.expenses : seed.expenses,
    adjustments: Array.isArray(saved?.adjustments) ? saved.adjustments : seed.adjustments,
    cashClosings: Array.isArray(saved?.cashClosings) ? saved.cashClosings : seed.cashClosings
  };
}

function initFirebase() {
  if (!window.firebaseConfig || !window.firebase) {
    throw new Error("Firebase no está configurado.");
  }

  // Evita volver a configurar Firestore en cada intento de acceso.
  if (firestore && auth) {
    return { firestore, auth };
  }

  if (!firebase.apps.length) {
    firebase.initializeApp(window.firebaseConfig);
  }

  firestore = firebase.firestore();
  auth = firebase.auth();

  firestore.enablePersistence({ synchronizeTabs: true }).catch((error) => {
    console.warn("Persistencia offline no disponible:", error);
  });

  storage = firebase.storage();
  return { firestore, auth, storage };
}

function getAuthErrorMessage(error, action = "login") {
  const messages = {
    "auth/email-already-in-use": "Ya existe una cuenta con este correo.",
    "auth/invalid-email": "El correo electrónico no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/operation-not-allowed": "El registro con correo y contraseña no está habilitado en Firebase.",
    "auth/network-request-failed": "No se pudo conectar con Firebase. Revisa tu conexión.",
    "auth/too-many-requests": "Se hicieron demasiados intentos. Espera un momento e inténtalo de nuevo.",
    "auth/invalid-credential": "El correo o la contraseña son incorrectos.",
    "auth/user-disabled": "Esta cuenta está deshabilitada."
  };

  return messages[error?.code]
    || error?.message
    || (action === "register"
      ? "No se pudo crear la cuenta. Revisa los datos."
      : "No se pudo iniciar sesión. Verifica tus datos.");
}

async function ensureAuth() {
  if (!auth) {
    initFirebase();
  }

  if (!auth.currentUser) {
    throw new Error("Usuario no autenticado");
  }
}

function getClinicDocRef() {
  if (!firestore) {
    initFirebase();
  }

  if (!auth || !auth.currentUser) {
    throw new Error("Usuario no autenticado");
  }

  return firestore.collection("clinics").doc(activeClinicId || auth.currentUser.uid);
}

function getCollectionRef(collectionName) {
  return getClinicDocRef().collection(collectionName);
}

function unsubscribeAll() {
  if (unsubscribeSettings) unsubscribeSettings();
  if (unsubscribePatients) unsubscribePatients();
  if (unsubscribeVisits) unsubscribeVisits();
  if (unsubscribeAppointments) unsubscribeAppointments();
  if (unsubscribeRooms) unsubscribeRooms();
  if (unsubscribePayments) unsubscribePayments();
  if (unsubscribeDocuments) unsubscribeDocuments();
  if (unsubscribeTasks) unsubscribeTasks();
  if (unsubscribeActivities) unsubscribeActivities();
  if (unsubscribeTeamMembers) unsubscribeTeamMembers();
  if (unsubscribeFormTemplates) unsubscribeFormTemplates();
  if (unsubscribeFormResponses) unsubscribeFormResponses();
  if (unsubscribeCommunications) unsubscribeCommunications();
  if (unsubscribeClinicalRecords) unsubscribeClinicalRecords();
  if (unsubscribeLeads) unsubscribeLeads();
  if (unsubscribeCampaigns) unsubscribeCampaigns();
  if (unsubscribeWaitlist) unsubscribeWaitlist();
  if (unsubscribeExpenses) unsubscribeExpenses();
  if (unsubscribeAdjustments) unsubscribeAdjustments();
  if (unsubscribeCashClosings) unsubscribeCashClosings();
  unsubscribeSettings = null;
  unsubscribePatients = null;
  unsubscribeVisits = null;
  unsubscribeAppointments = null;
  unsubscribeRooms = null;
  unsubscribePayments = null;
  unsubscribeDocuments = null;
  unsubscribeTasks = null;
  unsubscribeActivities = null;
  unsubscribeTeamMembers = null;
  unsubscribeFormTemplates = null;
  unsubscribeFormResponses = null;
  unsubscribeCommunications = null;
  unsubscribeClinicalRecords = null;
  unsubscribeLeads = null;
  unsubscribeCampaigns = null;
  unsubscribeWaitlist = null;
  unsubscribeExpenses = null;
  unsubscribeAdjustments = null;
  unsubscribeCashClosings = null;
}

function showAuthScreen() {
  $("#authScreen").classList.remove("hidden");
  document.querySelector(".app-shell").classList.add("hidden");
  showAuthForm("login");
}

function showAppScreen() {
  document.body.classList.remove("marketing-mode");
  $("#authScreen").classList.add("hidden");
  document.querySelector(".app-shell").classList.remove("hidden");
}

function clearState() {
  state = { settings: {}, patients: [], visits: [], appointments: [], rooms: [], payments: [], documents: [], tasks: [], activities: [], teamMembers: [], formTemplates: [], formResponses: [], communications: [], clinicalRecords: [], leads: [], campaigns: [], waitlist: [], expenses: [], adjustments: [], cashClosings: [] };
  render();
}

function subscribeToRealtime() {
  unsubscribeAll();

  const settingsRef = getClinicDocRef().collection("settings").doc("clinic");
  const patientsRef = getCollectionRef("patients");
  const visitsRef = getCollectionRef("visits");
  const appointmentsRef = getCollectionRef("appointments");
  const roomsRef = getCollectionRef("rooms");
  const paymentsRef = getCollectionRef("payments");
  const documentsRef = getCollectionRef("documents");
  const tasksRef = getCollectionRef("tasks");
  const activitiesRef = getCollectionRef("activities");
  const teamMembersRef = getCollectionRef("members");
  const formTemplatesRef = getCollectionRef("formTemplates");
  const formResponsesRef = getCollectionRef("formResponses");
  const communicationsRef = getCollectionRef("communications");
  const clinicalRecordsRef = getCollectionRef("clinicalRecords");
  const leadsRef = getCollectionRef("leads");
  const campaignsRef = getCollectionRef("campaigns");
  const waitlistRef = getCollectionRef("waitlist");
  const expensesRef = getCollectionRef("expenses");
  const adjustmentsRef = getCollectionRef("adjustments");
  const cashClosingsRef = getCollectionRef("cashClosings");

  unsubscribeSettings = settingsRef.onSnapshot((doc) => {
    if (doc.exists) {
      state.settings = doc.data() || {};
      render();
    }
  });

  unsubscribePatients = patientsRef.onSnapshot((snapshot) => {
    state.patients = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    render();
  });

  if (["admin", "clinical", "accounting"].includes(currentAccess.role)) unsubscribeVisits = visitsRef.onSnapshot((snapshot) => {
      state.visits = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      if ($("#visitDialog")?.classList.contains("active") && $("#visitId")?.value) renderVisitPaymentPanel(state.visits.find((visit) => visit.id === $("#visitId").value));
    });
  if (["admin", "reception", "clinical"].includes(currentAccess.role)) unsubscribeAppointments = appointmentsRef.onSnapshot((snapshot) => {
      state.appointments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
    });
  if (["admin", "reception", "clinical"].includes(currentAccess.role)) unsubscribeRooms = roomsRef.onSnapshot((snapshot) => {
    state.rooms = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderRooms(); renderRoomOptions();
  });
  if (["admin", "accounting"].includes(currentAccess.role)) unsubscribePayments = paymentsRef.onSnapshot((snapshot) => {
      state.payments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      render();
      if ($("#visitDialog")?.classList.contains("active") && $("#visitId")?.value) renderVisitPaymentPanel(state.visits.find((visit) => visit.id === $("#visitId").value));
    });
  if (["admin", "clinical"].includes(currentAccess.role)) unsubscribeDocuments = documentsRef.orderBy("createdAt", "desc").onSnapshot((snapshot) => {
      state.documents = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderSettings();
    });
  if (["admin", "reception", "clinical", "accounting"].includes(currentAccess.role)) unsubscribeTasks = tasksRef.onSnapshot((snapshot) => {
      state.tasks = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
      renderTasks();
      renderTaskNavCount();
      if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
    });
  unsubscribeActivities = activitiesRef.orderBy("createdAt", "desc").limit(250).onSnapshot((snapshot) => {
    state.activities = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderAuditLogPreview();
    if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId && activePatientRecordTab === "timeline") renderPatientRecord();
  });
  unsubscribeTeamMembers = teamMembersRef.onSnapshot((snapshot) => {
    state.teamMembers = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderTeamMembers();
  });
  if (["admin", "clinical", "reception"].includes(currentAccess.role)) unsubscribeFormTemplates = formTemplatesRef.onSnapshot((snapshot) => {
    state.formTemplates = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    renderFormTemplates();
    if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
  });
  if (["admin", "clinical", "reception"].includes(currentAccess.role)) unsubscribeFormResponses = formResponsesRef.onSnapshot((snapshot) => {
    state.formResponses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
    restorePatientKiosk();
  });
  unsubscribeCommunications = communicationsRef.orderBy("createdAt", "desc").limit(500).onSnapshot((snapshot) => {
    state.communications = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
  });
  if (["admin", "clinical"].includes(currentAccess.role)) unsubscribeClinicalRecords = clinicalRecordsRef.onSnapshot((snapshot) => {
    state.clinicalRecords = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() }));
    if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
  });
  if (["admin", "reception"].includes(currentAccess.role)) unsubscribeLeads = leadsRef.onSnapshot((snapshot) => {
    state.leads = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderCrm();
  });
  if (["admin", "reception"].includes(currentAccess.role)) unsubscribeCampaigns = campaignsRef.onSnapshot((snapshot) => {
    state.campaigns = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderCrm();
  });
  if (["admin", "reception", "clinical"].includes(currentAccess.role)) unsubscribeWaitlist = waitlistRef.onSnapshot((snapshot) => {
    state.waitlist = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderWaitlist();
  });
  if (["admin", "accounting"].includes(currentAccess.role)) unsubscribeExpenses = expensesRef.onSnapshot((snapshot) => { state.expenses = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderAdvancedAccounting(); });
  if (["admin", "accounting", "clinical"].includes(currentAccess.role)) unsubscribeAdjustments = adjustmentsRef.onSnapshot((snapshot) => { state.adjustments = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); render(); });
  if (["admin", "accounting"].includes(currentAccess.role)) unsubscribeCashClosings = cashClosingsRef.onSnapshot((snapshot) => { state.cashClosings = snapshot.docs.map((doc) => ({ id: doc.id, ...doc.data() })); renderAdvancedAccounting(); });
}

const roleLabels = ClinicI18n.labels({ admin: "Administrador", reception: "Recepción", clinical: "Profesional clínico", accounting: "Contabilidad" });
const rolePages = {
  admin: ["dashboard", "patients", "crm", "appointments", "rooms", "tasks", "visits", "billing", "invoices", "reports", "settings", "patientRecord", "visitDialog"],
  reception: ["dashboard", "patients", "crm", "appointments", "rooms", "tasks", "patientRecord"],
  clinical: ["dashboard", "patients", "appointments", "rooms", "tasks", "visits", "patientRecord", "visitDialog"],
  accounting: ["dashboard", "patients", "tasks", "billing", "invoices", "reports", "patientRecord"]
};
const patientRecordTabsByRole = {
  admin: ["summary", "visits", "documents", "payments", "clinical", "alerts", "communications", "timeline"],
  reception: ["summary", "documents", "alerts", "communications", "timeline"],
  clinical: ["summary", "visits", "documents", "clinical", "alerts", "communications", "timeline"],
  accounting: ["summary", "visits", "payments", "communications", "timeline"]
};

function canAccessPage(pageId) {
  return (rolePages[currentAccess.role] || rolePages.reception).includes(pageId);
}

async function resolveUserAccess(user) {
  const profileDoc = await firestore.collection("userProfiles").doc(user.uid).get();
  if (profileDoc.exists) {
    const profile = profileDoc.data();
    if (profile.status === "disabled") throw new Error("Esta cuenta fue desactivada por el administrador.");
    activeClinicId = profile.clinicId;
    currentAccess = { role: profile.role || "reception", status: profile.status || "active", name: profile.name || "" };
  } else {
    activeClinicId = user.uid;
    currentAccess = { role: "admin", status: "active", name: user.displayName || "Propietario" };
  }
}

function applyRoleAccess() {
  $$(".nav-item").forEach((item) => item.classList.toggle("role-hidden", !canAccessPage(item.dataset.page)));
  $$('[data-patient-record-tab]').forEach((item) => item.classList.toggle("role-hidden", !(patientRecordTabsByRole[currentAccess.role] || []).includes(item.dataset.patientRecordTab)));
  const settingsForm = $("#settingsForm");
  if (settingsForm) settingsForm.classList.toggle("read-only-role", currentAccess.role !== "admin");
}

async function loadClinicData() {
  await ensureAuth();

  const settingsRef = getClinicDocRef().collection("settings").doc("clinic");
  const patientsRef = getCollectionRef("patients");
  const visitsRef = getCollectionRef("visits");

  const canReadVisits = ["admin", "clinical", "accounting"].includes(currentAccess.role);
  const [settingsDoc, patientsSnap, visitsSnap] = await Promise.all([
    settingsRef.get(),
    patientsRef.get(),
    canReadVisits ? visitsRef.get() : Promise.resolve({ empty: true, docs: [] })
  ]);

  if (!settingsDoc.exists && patientsSnap.empty && visitsSnap.empty) {
    state = buildSeedState();
    subscribeToRealtime();
    render();
    return;
  }

  state = normalizeState({
    settings: settingsDoc.exists ? settingsDoc.data() : {},
    patients: patientsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() })),
    visits: visitsSnap.docs.map((doc) => ({ id: doc.id, ...doc.data() }))
  });

  subscribeToRealtime();
  render();
}

async function save() {
  await ensureAuth();
  await getClinicDocRef().collection("settings").doc("clinic").set(state.settings, { merge: true });
}

async function recordActivity({ action, entityType, entityId = "", patientId = "", visitId = "", title, detail = "", metadata = {} }) {
  if (!auth?.currentUser) return;
  const id = uid();
  await getCollectionRef("activities").doc(id).set({ id, action, entityType, entityId, patientId, visitId, title, detail, metadata, userId: auth.currentUser.uid, userEmail: auth.currentUser.email || "", createdAt: new Date().toISOString() });
}

async function savePatient(data) {
  await ensureAuth();
  const exists = state.patients.some((item) => item.id === data.id);
  await getCollectionRef("patients").doc(data.id).set({ ...data }, { merge: true });
  recordActivity({ action: exists ? "updated" : "created", entityType: "patient", entityId: data.id, patientId: data.id, title: exists ? "Paciente actualizado" : "Paciente registrado", detail: data.name || patient(data.id)?.name || "Paciente" }).catch(console.error);
}

async function saveVisit(data) {
  await ensureAuth();
  const existing = state.visits.find((item) => item.id === data.id);
  await getCollectionRef("visits").doc(data.id).set({ ...data }, { merge: true });
  recordActivity({ action: existing ? "updated" : "created", entityType: "visit", entityId: data.id, patientId: data.patientId || existing?.patientId || "", visitId: data.id, title: existing ? "Consulta actualizada" : "Consulta registrada", detail: data.reason || existing?.reason || "" }).catch(console.error);
}

async function saveAppointment(data) {
  await ensureAuth();
  const exists = state.appointments.some((item) => item.id === data.id);
  await getCollectionRef("appointments").doc(data.id).set({ ...data }, { merge: true });
  recordActivity({ action: exists ? "updated" : "created", entityType: "appointment", entityId: data.id, patientId: data.patientId || "", title: exists ? "Cita actualizada" : "Cita programada", detail: data.reason || "" }).catch(console.error);
}

async function deleteAppointmentEntry(id) {
  await ensureAuth();
  const appointment = state.appointments.find((item) => item.id === id);
  await getCollectionRef("appointments").doc(id).delete();
  if (appointment) recordActivity({ action: "deleted", entityType: "appointment", entityId: id, patientId: appointment.patientId || "", title: "Cita eliminada", detail: appointment.reason || "" }).catch(console.error);
}

async function registerPayment(data, visit) {
  await ensureAuth();
  const sourceField = data.source === "insurance" ? "insurancePaid" : "patientPaid";
  const currentPatientPaid = visit.patientPaid !== undefined ? Number(visit.patientPaid || 0) : (paymentType(visit) === "cash" ? Number(visit.paid || 0) : 0);
  const currentInsurancePaid = visit.insurancePaid !== undefined ? Number(visit.insurancePaid || 0) : (paymentType(visit) === "insurance" ? Number(visit.paid || 0) : 0);
  const updatedPatientPaid = sourceField === "patientPaid" ? currentPatientPaid + data.amount : currentPatientPaid;
  const updatedInsurancePaid = sourceField === "insurancePaid" ? currentInsurancePaid + data.amount : currentInsurancePaid;
  const batch = firestore.batch();
  batch.set(getCollectionRef("payments").doc(data.id), data);
  batch.set(getCollectionRef("visits").doc(visit.id), {
    patientPaid: updatedPatientPaid,
    insurancePaid: updatedInsurancePaid,
    paid: updatedPatientPaid + updatedInsurancePaid
  }, { merge: true });
  await batch.commit();
  recordActivity({ action: "payment", entityType: "payment", entityId: data.id, patientId: visit.patientId, visitId: visit.id, title: "Pago registrado", detail: `${money(data.amount)} · ${paymentMethodLabel(data.method)}`, metadata: { amount: data.amount, source: data.source } }).catch(console.error);
}

async function saveSettings() {
  await ensureAuth();
  await getClinicDocRef().collection("settings").doc("clinic").set(state.settings, { merge: true });
  recordActivity({ action: "updated", entityType: "system", entityId: "clinic-settings", title: "Configuración actualizada", detail: "Se guardaron los ajustes de la clínica." }).catch(console.error);
}

async function saveTask(data) {
  await ensureAuth();
  const existing = state.tasks.find((item) => item.id === data.id);
  await getCollectionRef("tasks").doc(data.id).set(data, { merge: true });
  recordActivity({ action: data.status === "completed" ? "completed" : existing ? "updated" : "created", entityType: "task", entityId: data.id, patientId: data.patientId || existing?.patientId || "", title: data.status === "completed" ? "Tarea completada" : existing ? "Tarea actualizada" : "Tarea creada", detail: data.title || existing?.title || "" }).catch(console.error);
}

async function deleteTaskEntry(id) {
  await ensureAuth();
  const task = state.tasks.find((item) => item.id === id);
  await getCollectionRef("tasks").doc(id).delete();
  if (task) recordActivity({ action: "deleted", entityType: "task", entityId: id, patientId: task.patientId || "", title: "Tarea eliminada", detail: task.title || "" }).catch(console.error);
}

async function uploadClinicDocument(file) {
  await ensureAuth();
  if (!file) return;
  const allowed = ["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "image/png", "image/jpeg"];
  if (!allowed.includes(file.type)) throw new Error(`${file.name}: formato no permitido.`);
  if (file.size > 10 * 1024 * 1024) throw new Error(`${file.name}: supera el máximo de 10 MB.`);
  const id = uid();
  const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, "_");
  const path = `clinics/${activeClinicId}/documents/${id}/${safeName}`;
  const ref = storage.ref(path);
  await ref.put(file, { contentType: file.type });
  const url = await ref.getDownloadURL();
  const data = { id, name: file.name, type: file.type, size: file.size, path, url, createdAt: new Date().toISOString() };
  await getCollectionRef("documents").doc(id).set(data);
  recordActivity({ action: "uploaded", entityType: "document", entityId: id, title: "Documento cargado", detail: file.name }).catch(console.error);
  if (file.type === "application/pdf") {
    state.documents = [...state.documents.filter((item) => item.id !== id), data];
    toast(S`Analizando automáticamente ${file.name}...`);
    try { await analyzeClinicDocument(id, false); } catch (error) { console.error(error); toast(S`${file.name} se cargó, pero necesita revisión manual.`); }
  }
}

async function analyzeClinicDocument(id, openReview = true) {
  const documentItem = state.documents.find((item) => item.id === id); if (!documentItem) return;
  const endpoint = `https://us-central1-${window.firebaseConfig.projectId}.cloudfunctions.net/patientPortal`;
  const idToken = await auth.currentUser.getIdToken();
  const response = await fetch(endpoint, { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "analyzeDocument", clinicId: activeClinicId, documentId: id }) });
  const result = await response.json().catch(() => ({})); if (!response.ok) throw new Error(result.error || "document-analysis-failed");
  documentItem.fields = result.fields || []; documentItem.roomReady = Boolean(result.roomReady); documentItem.analysisStatus = result.fields?.length ? "completed" : "signature_only";
  renderClinicDocuments();
  toast(result.fields?.length ? `${result.fields.length} campo(s) detectados automáticamente.` : T("Documento listo para Room: no requiere campos, solo revisión y firma."));
}

async function deleteClinicDocument(id) {
  const documentItem = state.documents.find((item) => item.id === id);
  if (!documentItem || !confirm(S`¿Eliminar ${documentItem.name}?`)) return;
  try {
    if (documentItem.path) await storage.ref(documentItem.path).delete().catch((error) => {
      if (error.code !== "storage/object-not-found") throw error;
    });
    await getCollectionRef("documents").doc(id).delete();
    recordActivity({ action: "deleted", entityType: "document", entityId: id, title: "Documento eliminado", detail: documentItem.name }).catch(console.error);
    toast(T("Documento eliminado"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo eliminar el documento"));
  }
}

async function deletePatientEntry(id) {
  await ensureAuth();
  const patientEntry = patient(id);
  const visitSnap = await getCollectionRef("visits").where("patientId", "==", id).get();
  const appointmentSnap = await getCollectionRef("appointments").where("patientId", "==", id).get();
  const paymentSnap = await getCollectionRef("payments").where("patientId", "==", id).get();
  const taskSnap = await getCollectionRef("tasks").where("patientId", "==", id).get();
  const batch = firestore.batch();
  batch.delete(getCollectionRef("patients").doc(id));
  visitSnap.docs.forEach((doc) => batch.delete(getCollectionRef("visits").doc(doc.id)));
  appointmentSnap.docs.forEach((doc) => batch.delete(doc.ref));
  paymentSnap.docs.forEach((doc) => batch.delete(doc.ref));
  taskSnap.docs.forEach((doc) => batch.delete(doc.ref));
  await batch.commit();
  recordActivity({ action: "deleted", entityType: "patient", entityId: id, title: "Paciente eliminado", detail: patientEntry?.name || "Paciente" }).catch(console.error);
}

async function deleteVisitEntry(id) {
  await ensureAuth();
  const visit = state.visits.find((item) => item.id === id);
  await getCollectionRef("visits").doc(id).delete();
  if (visit) recordActivity({ action: "deleted", entityType: "visit", entityId: id, patientId: visit.patientId || "", visitId: id, title: "Consulta eliminada", detail: visit.reason || "" }).catch(console.error);
}

const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => document.querySelectorAll(selector);

function money(value) {
  return Number(value || 0).toLocaleString(ClinicI18n.locale, {
    style: "currency",
    currency: "USD"
  });
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function invoiceNumber(visit) {
  const prefix = state.settings.invoicePrefix || "FAC";
  return visit.invoiceNumber || `${prefix}-${String(visit.id || "").slice(0, 8).toUpperCase()}`;
}

function readLogoFile(file) {
  return new Promise((resolve, reject) => {
    if (!file) return resolve("");
    if (!["image/png", "image/jpeg", "image/webp"].includes(file.type)) return reject(new Error("Formato de logo no válido."));
    if (file.size > 350 * 1024) return reject(new Error("El logo debe pesar 350 KB o menos."));
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = () => reject(new Error("No se pudo leer el logo."));
    reader.readAsDataURL(file);
  });
}

function invoiceFooterCopy(value) {
  return value === "Gracias por confiar en nuestra clínica." ? T(value) : value;
}

function invoiceSettings() {
  return {
    accent: state.settings.invoiceAccentColor || "#0f766e",
    logoPosition: state.settings.invoiceLogoPosition || "left",
    footer: state.settings.invoiceFooter || "",
    showAddress: state.settings.invoiceShowAddress !== false,
    showPhone: state.settings.invoiceShowPhone !== false,
    showEmail: state.settings.invoiceShowEmail !== false,
    showDoctor: state.settings.invoiceShowDoctor !== false,
    showInsurance: state.settings.invoiceShowInsurance !== false
  };
}

function visitItems(visit) {
  if (Array.isArray(visit?.lineItems) && visit.lineItems.length) return visit.lineItems.map((item) => ({
    ...item,
    quantity: Number(item.quantity || 1),
    unitPrice: Number(item.unitPrice ?? item.price ?? 0),
    price: Number(item.price ?? (Number(item.quantity || 1) * Number(item.unitPrice || 0)))
  }));
  if (Number(visit?.total || 0) > 0) {
    return [{ id: uid(), description: visit.reason || "Consulta", quantity: 1, unitPrice: Number(visit.total), price: Number(visit.total) }];
  }
  return [];
}

function payerLabel(p) {
  return p?.payerType === "insurance"
    ? `${T("Seguro médico")}${p.insuranceCompany ? ` · ${p.insuranceCompany}` : ""}`
    : T("Pago propio");
}

function updateUserInfo() {
  const user = auth.currentUser;
  if (user) {
    $("#userInfo").textContent = S`${currentAccess.name === "Propietario" ? T("Propietario") : currentAccess.name || user.email || user.uid} · ${roleLabels[currentAccess.role] || currentAccess.role}`;
  } else {
    $("#userInfo").textContent = "";
  }
}

function fmtDate(value) {
  if (!value) return "-";
  return new Date(value).toLocaleString(ClinicI18n.locale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit"
  });
}

function fmtBirthDate(value) {
  if (!value) return "-";
  return new Date(`${value}T00:00:00`).toLocaleDateString(ClinicI18n.locale, {
    month: "2-digit",
    day: "2-digit",
    year: "numeric"
  });
}

function ageFromBirthDate(value) {
  if (!value) return "";
  const birth = new Date(`${value}T00:00:00`);
  const now = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  const beforeBirthday = now.getMonth() < birth.getMonth()
    || (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate());
  if (beforeBirthday) age -= 1;
  return age;
}

function today() {
  return new Date().toISOString().slice(0, 10);
}

function onlyDate(value) {
  return new Date(value).toISOString().slice(0, 10);
}

function patient(id) {
  return state.patients.find((item) => item.id === id);
}

function visitAdjustments(visitId) { return state.adjustments.filter((item) => item.visitId === visitId); }
function adjustmentAmount(visitId, types) { return visitAdjustments(visitId).filter((item) => types.includes(item.type)).reduce((sum, item) => sum + Number(item.amount || 0), 0); }
function effectiveVisitTotal(visit) { return Math.max(0, Number(visit.total || 0) - adjustmentAmount(visit.id, ["discount", "writeoff"])); }

function balance(visit) {
  return Math.max(0, effectiveVisitTotal(visit) - totalPaid(visit));
}

function totalPaid(visit) {
  const refunds = adjustmentAmount(visit.id, ["refund"]);
  if (visit.patientPaid !== undefined || visit.insurancePaid !== undefined) {
    return Math.max(0, Number(visit.patientPaid || 0) + Number(visit.insurancePaid || 0) - refunds);
  }
  return Math.max(0, Number(visit.paid || 0) - refunds);
}

function paymentType(visit) {
  return visit.paymentType || (patient(visit.patientId)?.payerType === "insurance" ? "insurance" : "cash");
}

function financialStatus(visit) {
  if (visit.claimStatus === "rejected") return { key: "rejected", label: T("Rechazada"), color: "red" };
  const paid = totalPaid(visit);
  if (balance(visit) <= 0) return { key: "paid", label: T("Pagado"), color: "green" };
  if (paid > 0) return { key: "partial", label: T("Pago parcial"), color: "blue" };
  return { key: "pending", label: T("Pendiente"), color: "red" };
}

const appointmentStatuses = {
  scheduled: { get label() { return T("Programada"); }, color: "blue" },
  confirmed: { get label() { return T("Confirmada"); }, color: "green" },
  arrived: { get label() { return T("En espera"); }, color: "orange" },
  completed: { get label() { return T("Atendida"); }, color: "green" },
  cancelled: { get label() { return T("Cancelada"); }, color: "red" },
  no_show: { get label() { return T("No asistió"); }, color: "red" }
};

function appointmentStatus(value) {
  return appointmentStatuses[value] || appointmentStatuses.scheduled;
}

function localDateValue(date = new Date()) {
  const offset = date.getTimezoneOffset() * 60000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 10);
}

function totals(visits = state.visits) {
  return visits.reduce((acc, visit) => {
    acc.billed += effectiveVisitTotal(visit);
    acc.paid += totalPaid(visit);
    acc.debt += balance(visit);
    return acc;
  }, { billed: 0, paid: 0, debt: 0 });
}

function toast(message) {
  const node = $("#toast");
  clearTimeout(node._hideTimer);
  node.textContent = T(message);
  node.classList.add("show");
  if (typeof node.showPopover === "function") {
    requestAnimationFrame(() => {
      try { if (node.matches(":popover-open")) node.hidePopover(); } catch { /* Ignore stale popover state. */ }
      try { node.showPopover(); } catch { /* The page may be closing. */ }
    });
  } else {
    const openDialog = [...document.querySelectorAll("dialog[open]")].at(-1);
    if (openDialog && node.parentElement !== openDialog) openDialog.append(node);
  }
  node._hideTimer = setTimeout(() => {
    node.classList.remove("show");
    if (typeof node.hidePopover === "function") {
      try { node.hidePopover(); } catch { /* The popover may already be closed. */ }
    } else if (node.parentElement !== document.body) {
      document.body.append(node);
    }
  }, 2600);
}

function showPage(pageId) {
  if (!canAccessPage(pageId)) {
    toast(T("Tu rol no tiene permiso para abrir este módulo."));
    pageId = "dashboard";
  }
  $$(".page").forEach((page) => page.classList.toggle("active", page.id === pageId));
  $$(".nav-item").forEach((item) => item.classList.toggle("active", item.dataset.page === (pageId === "visitDialog" ? "visits" : pageId === "patientRecord" ? "patients" : pageId)));

  const labels = {
    dashboard: "Dashboard",
    patients: "Pacientes",
    crm: "CRM y captación",
    appointments: "Citas",
    rooms: "Rooms",
    tasks: "Tareas y seguimientos",
    visits: "Consultas",
    billing: "Pagos",
    invoices: "Facturas",
    reports: "Reportes",
    settings: "Ajustes"
  };

  $("#pageTitle").textContent = pageId === "visitDialog" ? T("Expediente de consulta") : pageId === "patientRecord" ? T("Expediente del paciente") : T(labels[pageId] || "Clinic Control");
  render();
}

function render() {
  $("#clinicSetupNotice").classList.toggle("hidden", currentAccess.role !== "admin" || !activeClinicId || setupNoticeDismissedFor === activeClinicId || Boolean(state.settings.clinicAddress && state.settings.clinicPhone && state.settings.clinicLogo));
  renderDashboard();
  renderPatients();
  renderAppointments();
  renderRooms();
  renderRoomOptions();
  renderVisitOptions();
  renderVisits();
  renderBilling();
  renderAdvancedAccounting();
  renderInvoicePatientOptions();
  renderInvoices();
  renderReports();
  renderSettings();
  renderTasks();
  renderTaskNavCount();
  renderCrm();
  if ($("#patientRecord")?.classList.contains("active") && activePatientRecordId) renderPatientRecord();
}

function renderDashboard() {
  const dayVisits = state.visits.filter((visit) => onlyDate(visit.date) === today());
  const allTotals = totals();
  const dayTotals = totals(dayVisits);
  const balancePatients = debtRows();

  $("#kpiPatients").textContent = state.patients.length;
  $("#kpiPatientsHint").textContent = S`${state.patients.length} registros activos`;
  $("#kpiTodayVisits").textContent = dayVisits.length;
  $("#kpiTodayPaid").textContent = money(dayTotals.paid);
  $("#kpiBalance").textContent = money(allTotals.debt);
  $("#kpiBalanceHint").textContent = S`${balancePatients.length} paciente(s) con deuda`;

  const presencial = dayVisits.filter((visit) => visit.type === "Presencial").length;
  const tele = dayVisits.filter((visit) => visit.type === "Teleconsulta").length;
  $("#kpiVisitMix").textContent = S`${presencial} presenciales · ${tele} teleconsulta`;

  renderTimeline();
  renderMiniDebts();
  renderFinanceBars(allTotals);
}


function renderTimeline() {
  const visits = [...state.visits].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 6);
  const box = $("#activityTimeline");

  if (!visits.length) {
    box.innerHTML = H`<div class="empty">No hay actividad registrada.</div>`;
    return;
  }

  box.innerHTML = visits.map((visit) => {
    const p = patient(visit.patientId);
    const isPaid = balance(visit) <= 0;
    return H`
      <div class="timeline-item">
        <div class="timeline-icon">${visit.type === "Teleconsulta" ? "T" : "P"}</div>
        <div>
          <strong>${p?.name || T("Paciente eliminado")}</strong>
          <span>${visit.reason || T("Consulta")} · ${fmtDate(visit.date)}</span>
          <div class="timeline-meta">
            <span class="payment-status ${isPaid ? "" : "pending"}">${isPaid ? T("Pagado") : T("Pago pendiente")}</span>
            <span>${visit.type || T("Presencial")}${visit.doctor ? ` · ${visit.doctor}` : ""}</span>
          </div>
        </div>
        <div class="amount">${money(visit.total)}</div>
      </div>
    `;
  }).join("");
}

function debtRows() {
  const map = new Map();

  state.visits.forEach((visit) => {
    const due = balance(visit);
    if (due <= 0) return;

    const p = patient(visit.patientId);
    if (!p) return;

    const row = map.get(p.id) || {
      patient: p,
      debt: 0,
      visits: []
    };

    row.debt += due;
    row.visits.push(visit);
    map.set(p.id, row);
  });

  return [...map.values()].sort((a, b) => b.debt - a.debt);
}

function renderMiniDebts() {
  const rows = debtRows().slice(0, 5);
  const box = $("#balanceMiniList");

  if (!rows.length) {
    box.innerHTML = H`<div class="empty">Sin balances pendientes.</div>`;
    return;
  }

  box.innerHTML = rows.map((row) => H`
    <div class="mini-row">
      <div>
        <strong>${row.patient.name}</strong>
        <span>${row.visits.length} consulta(s)</span>
      </div>
      <strong>${money(row.debt)}</strong>
    </div>
  `).join("");
}

function renderFinanceBars(data) {
  const max = Math.max(data.billed, data.paid, data.debt, 1);

  $("#financeBilled").textContent = money(data.billed);
  $("#financePaid").textContent = money(data.paid);
  $("#financeDebt").textContent = money(data.debt);

  $("#barBilled").style.width = `${Math.max(4, (data.billed / max) * 100)}%`;
  $("#barPaid").style.width = `${Math.max(4, (data.paid / max) * 100)}%`;
  $("#barDebt").style.width = `${Math.max(4, (data.debt / max) * 100)}%`;
}

function renderPatients() {
  const query = ($("#patientSearch")?.value || "").toLowerCase().trim();
  const rows = state.patients.filter((p) => `${p.name} ${p.phone} ${p.email || ""} ${p.address || ""} ${p.document} ${p.language || ""} ${p.notes || ""} ${p.source || ""} ${p.lifecycle || ""} ${p.patientAlertMessage || ""} ${p.insuranceCompany || ""} ${p.insuranceMemberId || ""} ${p.insuranceGroup || ""}`.toLowerCase().includes(query));

  $("#patientsTable").innerHTML = rows.length ? rows.map((p) => H`
    <tr class="${patientHasAlert(p) ? "patient-alert-row" : ""}">
      <td><button class="patient-name-link" onclick="openPatientRecord('${p.id}')">${escapeHtml(p.name)}</button>${patientHasAlert(p) ? H`<div class="patient-alert-chip">📌 ${escapeHtml(p.patientAlertMessage)} <small>${patientAlertDateLabel(p)}</small></div>` : H`<br><small>${p.notes || T("Sin notas")}</small>`}<br><span class="badge ${p.payerType === "insurance" ? "blue" : "green"}">${escapeHtml(payerLabel(p))}</span></td>
      <td>${p.phone || "-"}<br><small>${p.email || T("Sin correo")}</small></td>
      <td>${fmtBirthDate(p.birthDate)}<br><small>${p.age !== "" && p.age != null ? S`${p.age} años` : T("Edad no indicada")}</small></td>
      <td><span class="badge blue">${escapeHtml(T(p.language || "No indicado"))}</span></td>
      <td>${p.document || "-"}</td>
      <td>${fmtDate(p.createdAt)}</td>
      <td>
        <div class="row-actions">
          ${["admin", "reception", "clinical"].includes(currentAccess.role) ? H`<button class="icon-btn" onclick="editPatient('${p.id}')" title="Editar">✎</button>` : ""}
          ${["admin", "accounting"].includes(currentAccess.role) ? H`<button class="icon-btn finance-patient-btn" onclick="openPatientFinance('${p.id}')" title="Ver cuenta">$</button>` : ""}
          ${currentAccess.role === "admin" ? H`<button class="icon-btn" onclick="deletePatient('${p.id}')" title="Eliminar">⌫</button>` : ""}
        </div>
      </td>
    </tr>
  `).join("") : H`<tr><td class="empty" colspan="7">No se encontraron pacientes.</td></tr>`;
}

const taskTypes = ClinicI18n.labels({ payment: "Cobro", document: "Documento", call: "Llamada", insurance: "Seguro", follow_up: "Seguimiento", other: "Otro" });
function taskIsOverdue(task) { return task.status !== "completed" && task.dueDate && new Date(task.dueDate) < new Date(); }
function renderTaskNavCount() {
  const node = $("#taskNavCount"); if (!node) return;
  const count = state.tasks.filter((task) => task.status !== "completed").length;
  node.textContent = count > 99 ? "99+" : count;
  node.classList.toggle("hidden", count === 0);
}
function renderTasks() {
  const board = $("#taskBoard"); if (!board) return;
  const query = ($("#taskSearch")?.value || "").toLowerCase().trim();
  const status = $("#taskStatusFilter")?.value || "open";
  const type = $("#taskTypeFilter")?.value || "";
  const rows = [...state.tasks].filter((task) => {
    const p = patient(task.patientId);
    if (type && task.type !== type) return false;
    if (status === "open" && task.status === "completed") return false;
    if (status === "completed" && task.status !== "completed") return false;
    if (status === "overdue" && !taskIsOverdue(task)) return false;
    return `${task.title} ${task.description || ""} ${p?.name || ""}`.toLowerCase().includes(query);
  }).sort((a, b) => (taskIsOverdue(b) - taskIsOverdue(a)) || new Date(a.dueDate || "9999-12-31") - new Date(b.dueDate || "9999-12-31"));
  const open = state.tasks.filter((task) => task.status !== "completed").length, overdue = state.tasks.filter(taskIsOverdue).length, done = state.tasks.filter((task) => task.status === "completed").length;
  $("#taskSummary").innerHTML = H`<div><small>Pendientes</small><strong>${open}</strong></div><div class="overdue"><small>Vencidas</small><strong>${overdue}</strong></div><div><small>Completadas</small><strong>${done}</strong></div>`;
  board.innerHTML = rows.length ? rows.map((task) => { const p = patient(task.patientId); return H`<article class="task-card priority-${task.priority || "normal"} ${taskIsOverdue(task) ? "is-overdue" : ""} ${task.status === "completed" ? "is-completed" : ""}"><button class="task-check" onclick="toggleTask('${task.id}')" title="${task.status === "completed" ? "Reabrir" : T("Completar")}">${task.status === "completed" ? "✓" : ""}</button><div><div class="task-card-meta"><span class="badge blue">${taskTypes[task.type] || "Tarea"}</span>${taskIsOverdue(task) ? H`<span class="badge red">Vencida</span>` : ""}<span>${task.priority === "urgent" ? T("Urgente") : task.priority === "high" ? T("Alta") : T("Normal")}</span></div><h3>${escapeHtml(task.title)}</h3><p>${escapeHtml(task.description || T("Sin descripción"))}</p><small>${p ? H`<button onclick="openPatientRecord('${p.id}')">${escapeHtml(p.name)}</button> · ` : ""}${task.dueDate ? S`Vence ${new Date(task.dueDate).toLocaleString(ClinicI18n.locale)}` : T("Sin fecha límite")}</small></div><div class="row-actions"><button class="icon-btn" onclick="openTaskDialog('${task.id}')">✎</button><button class="icon-btn" onclick="deleteTask('${task.id}')">⌫</button></div></article>`; }).join("") : H`<div class="empty">No hay tareas que coincidan con los filtros.</div>`;
}
function openTaskDialog(id = "", patientId = "") {
  const task = state.tasks.find((item) => item.id === id);
  $("#taskDialogTitle").textContent = task ? T("Editar tarea") : T("Nueva tarea");
  $("#taskId").value = task?.id || "";
  $("#taskPatient").innerHTML = H`<option value="">Sin paciente</option>${state.patients.map((p) => H`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("")}`;
  $("#taskPatient").value = task?.patientId || patientId || "";
  enablePatientSelectSearch($("#taskPatient"));
  $("#taskTitle").value = task?.title || ""; $("#taskType").value = task?.type || "follow_up"; $("#taskDueDate").value = task?.dueDate || ""; $("#taskPriority").value = task?.priority || "normal"; $("#taskDescription").value = task?.description || "";
  $("#taskDialog").showModal(); requestAnimationFrame(() => $("#taskTitle").focus());
}
async function toggleTask(id) { const task = state.tasks.find((item) => item.id === id); if (!task) return; await saveTask({ id, status: task.status === "completed" ? "open" : "completed", completedAt: task.status === "completed" ? "" : new Date().toISOString(), updatedAt: new Date().toISOString() }); }
async function deleteTask(id) { if (!confirm(T("¿Eliminar esta tarea?"))) return; try { await deleteTaskEntry(id); toast(T("Tarea eliminada")); } catch (error) { console.error(error); toast(T("No se pudo eliminar la tarea")); } }

function renderVisitOptions() {
  const selectedVisitPatient = $("#visitPatient").value;
  const selectedAppointmentPatient = $("#appointmentPatient")?.value;
  $("#visitPatient").innerHTML = state.patients.map((p) => H`<option value="${p.id}">${p.name}</option>`).join("");
  if ($("#appointmentPatient")) $("#appointmentPatient").innerHTML = state.patients.map((p) => H`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join("");
  if (state.patients.some((p) => p.id === selectedVisitPatient)) $("#visitPatient").value = selectedVisitPatient;
  if (selectedAppointmentPatient && state.patients.some((p) => p.id === selectedAppointmentPatient)) $("#appointmentPatient").value = selectedAppointmentPatient;
  enablePatientSelectSearch($("#visitPatient"));
  enablePatientSelectSearch($("#appointmentPatient"));
  renderAppointmentDoctorOptions();
}

function patientHasAlert(p) {
  return Boolean(p?.patientAlertActive && String(p.patientAlertMessage || "").trim());
}

function patientAlertDateLabel(p) {
  if (!p?.patientAlertDate) return "Sin fecha";
  const overdue = p.patientAlertDate < localDateValue();
  return S`${overdue ? "Vencida · " : "Seguimiento · "}${new Date(`${p.patientAlertDate}T12:00:00`).toLocaleDateString(ClinicI18n.locale)}`;
}

function openPatientRecord(id, tabName = "summary") {
  if (!patient(id)) return;
  activePatientRecordId = id;
  activePatientRecordTab = tabName;
  showPage("patientRecord");
  renderPatientRecord();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

function renderPatientRecord() {
  const p = patient(activePatientRecordId);
  if (!p) return showPage("patients");
  const allowedTabs = patientRecordTabsByRole[currentAccess.role] || ["summary"];
  if (!allowedTabs.includes(activePatientRecordTab)) activePatientRecordTab = "summary";
  const visits = state.visits.filter((visit) => visit.patientId === p.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const recordedPayments = state.payments.filter((entry) => entry.patientId === p.id);
  const initialPayments = visits.flatMap((visit) => {
    const laterTotal = recordedPayments.filter((entry) => entry.visitId === visit.id).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const amount = Math.max(0, totalPaid(visit) - laterTotal);
    return amount > 0 ? [{ id: `initial-${visit.id}`, visitId: visit.id, patientId: p.id, amount, method: "initial", date: visit.date, reference: "Pago inicial" }] : [];
  });
  const payments = [...recordedPayments, ...initialPayments].sort((a, b) => new Date(b.date) - new Date(a.date));
  const docs = visits.flatMap((visit) => (visit.documents || []).map((doc) => ({ ...doc, visit })));
  const digitalForms = state.formResponses.filter((entry) => entry.patientId === p.id).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt));
  const communications = state.communications.filter((entry) => entry.patientId === p.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const clinicalRecord = state.clinicalRecords.find((entry) => entry.id === p.id || entry.patientId === p.id) || {};
  const latestVitalsVisit = visits.find((visit) => visit.vitals && Object.values(visit.vitals).some(Boolean));
  const patientTasks = state.tasks.filter((task) => task.patientId === p.id).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const historicEvents = [
    { id: `patient-${p.id}`, entityType: "patient", title: "Paciente registrado", detail: "Expediente creado", createdAt: p.createdAt },
    ...visits.map((visit) => ({ id: `visit-${visit.id}`, entityType: "visit", title: "Consulta", detail: visit.reason || "Consulta registrada", createdAt: visit.date })),
    ...payments.map((entry) => ({ id: `payment-${entry.id}`, entityType: "payment", title: entry.method === "initial" ? "Pago inicial" : "Pago recibido", detail: `${money(entry.amount)} · ${paymentMethodLabel(entry.method)}`, createdAt: entry.date })),
    ...patientTasks.map((task) => ({ id: `task-${task.id}`, entityType: "task", title: task.title, detail: task.status === "completed" ? "Tarea completada" : "Tarea creada", createdAt: task.createdAt }))
  ].filter((event) => event.createdAt);
  const patientActivities = state.activities.filter((entry) => entry.patientId === p.id);
  const auditedIds = new Set(patientActivities.map((entry) => `${entry.entityType}-${entry.entityId}`));
  const timeline = [...patientActivities, ...historicEvents.filter((event) => !auditedIds.has(event.id))].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const data = totals(visits);
  const initials = p.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  const canEditPatient = ["admin", "reception", "clinical"].includes(currentAccess.role);
  const canCreateVisit = ["admin", "clinical"].includes(currentAccess.role);
  $("#patientRecordHeader").innerHTML = H`<button class="btn light" onclick="showPage('patients')">← Pacientes</button><div class="patient-record-avatar">${escapeHtml(initials)}</div><div class="patient-record-identity"><small>Expediente del paciente</small><h2>${escapeHtml(p.name)}</h2><span>${escapeHtml([p.document, p.phone, p.email].filter(Boolean).join(" · ") || T("Información de contacto no indicada"))}</span></div><div class="patient-record-actions"><button class="btn light" onclick="openCommunicationDialog('${p.id}')">Comunicar</button>${canEditPatient ? H`<button class="btn light" onclick="editPatient('${p.id}')">Editar</button>` : ""}${canCreateVisit ? H`<button class="btn primary" onclick="openVisitDialog({patientId:'${p.id}'})">Nueva consulta</button>` : ""}</div>`;
  applyRoleAccess();
  $$('[data-patient-record-tab]').forEach((button) => button.classList.toggle("active", button.dataset.patientRecordTab === activePatientRecordTab));
  const summary = H`${patientHasAlert(p) ? H`<div class="patient-finance-alert"><div><strong>📌 ${escapeHtml(p.patientAlertMessage)}</strong><span>${patientAlertDateLabel(p)}</span></div><button class="btn light" onclick="resolvePatientAlert('${p.id}')">Marcar resuelta</button></div>` : ""}<div class="patient-record-metrics"><div><small>Consultas</small><strong>${visits.length}</strong></div><div><small>Facturado</small><strong>${money(data.billed)}</strong></div><div><small>Pagado</small><strong>${money(data.paid)}</strong></div><div><small>Balance</small><strong>${money(data.debt)}</strong></div></div><div class="patient-record-grid"><article><h3>Información</h3><dl><div><dt>Nacimiento</dt><dd>${fmtBirthDate(p.birthDate)}</dd></div><div><dt>Edad</dt><dd>${escapeHtml(p.age || "—")}</dd></div><div><dt>Idioma</dt><dd>${escapeHtml(p.language || "—")}</dd></div><div><dt>Forma de pago</dt><dd>${escapeHtml(payerLabel(p))}</dd></div><div><dt>Seguro</dt><dd>${escapeHtml(p.insuranceCompany || "—")}</dd></div><div><dt>Estado</dt><dd>${escapeHtml({ active: "Activo", new: "Nuevo", inactive: "Inactivo", lost: "No regresó" }[p.lifecycle] || T("Activo"))}</dd></div></dl></article><article><h3>Notas</h3><p>${escapeHtml(p.notes || T("No hay notas generales para este paciente."))}</p></article></div>`;
  const visitHtml = visits.length ? H`<div class="patient-record-list">${visits.map((visit) => H`<div><span><strong>${fmtDate(visit.date)} · ${escapeHtml(visit.reason || T("Consulta"))}</strong><small>${escapeHtml(visit.doctor || T("Sin profesional"))} · ${escapeHtml(visit.roomName || roomById(visit.roomId)?.name || T("Room sin asignar"))} · ${escapeHtml((visit.diagnoses || []).join(", ") || invoiceNumber(visit))}</small></span><span><strong>${money(visit.total)}</strong><small>Balance ${money(balance(visit))}</small></span>${["admin", "clinical"].includes(currentAccess.role) ? H`<button class="btn light" onclick="editVisit('${visit.id}')">Abrir</button>` : ""}</div>`).join("")}</div>` : H`<div class="empty">Este paciente todavía no tiene consultas.</div>`;
  const documentHtml = H`<div class="patient-record-section-head"><h3>Formularios digitales</h3><button class="btn primary" onclick="assignDigitalForm('${p.id}')">+ Asignar formulario</button></div>${digitalForms.length ? H`<div class="patient-record-list">${digitalForms.map((entry) => H`<div><span><strong>${escapeHtml(entry.templateName || T("Formulario"))}</strong><small>${formCategoryLabels[entry.category] || T("Formulario")} · ${fmtDate(entry.updatedAt || entry.createdAt)}</small></span><span class="badge ${entry.status === "completed" ? "green" : "red"}">${entry.status === "completed" ? T("Completado") : T("Pendiente")}</span><button class="btn light" onclick="openPatientDigitalForm('${entry.id}')">${entry.status === "completed" ? T("Ver respuestas") : T("Completar")}</button></div>`).join("")}</div>` : H`<div class="empty">No hay formularios digitales asignados.</div>`}<div class="patient-record-section-head section-spaced"><h3>Documentos y firmas</h3></div>${docs.length ? H`<div class="patient-record-list">${docs.map((doc) => H`<div><span><strong>${escapeHtml(doc.name)}</strong><small>${fmtDate(doc.visit.date)} · ${doc.status === "signed" ? S`Firmado por ${escapeHtml(doc.signedBy)}` : T("Pendiente de firma")}</small></span><span class="badge ${doc.status === "signed" ? "green" : "red"}">${doc.status === "signed" ? "Firmado" : T("Pendiente")}</span>${doc.completedPdfUrl ? H`<a class="btn primary" href="${escapeHtml(doc.completedPdfUrl)}" target="_blank" rel="noopener">PDF completado</a><a class="btn light" href="${escapeHtml(doc.completedPdfUrl)}" download>Descargar</a>` : doc.url ? H`<a class="btn light" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">Ver original</a>` : ""}</div>`).join("")}</div>` : H`<div class="empty">No hay documentos asignados.</div>`}`;
  const paymentHtml = H`<div class="patient-record-metrics"><div><small>Facturado</small><strong>${money(data.billed)}</strong></div><div><small>Pagado</small><strong>${money(data.paid)}</strong></div><div><small>Balance</small><strong>${money(data.debt)}</strong></div></div>${payments.length ? H`<div class="patient-record-list">${payments.map((entry) => H`<div><span><strong>${fmtDate(entry.date)} · ${escapeHtml(paymentMethodDetail(entry))}</strong><small>${escapeHtml(entry.reference || T("Sin referencia"))}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</small></span><strong>${money(entry.amount)}</strong><button class="btn light" onclick="openInvoice('${entry.visitId}')">Factura</button></div>`).join("")}</div>` : H`<div class="empty">No hay abonos posteriores registrados.</div>`}`;
  const alertHtml = H`${patientHasAlert(p) ? H`<div class="patient-alert-detail"><span>📌</span><div><h3>${escapeHtml(p.patientAlertMessage)}</h3><p>${patientAlertDateLabel(p)}</p></div><button class="btn primary" onclick="resolvePatientAlert('${p.id}')">Marcar resuelta</button></div>` : ""}<div class="patient-record-section-head"><h3>Tareas y seguimientos</h3><button class="btn primary" onclick="openTaskDialog('', '${p.id}')">+ Agregar tarea</button></div>${patientTasks.length ? H`<div class="patient-record-list">${patientTasks.map((task) => H`<div><span><strong>${escapeHtml(task.title)}</strong><small>${taskTypes[task.type] || "Tarea"} · ${task.dueDate ? new Date(task.dueDate).toLocaleString(ClinicI18n.locale) : T("Sin fecha")}</small></span><span class="badge ${task.status === "completed" ? "green" : taskIsOverdue(task) ? "red" : "blue"}">${task.status === "completed" ? T("Completada") : taskIsOverdue(task) ? T("Vencida") : T("Pendiente")}</span><button class="btn light" onclick="toggleTask('${task.id}')">${task.status === "completed" ? "Reabrir" : T("Completar")}</button></div>`).join("")}</div>` : H`<div class="empty">No hay tareas para este paciente.</div>`}`;
  const communicationHtml = H`<div class="patient-record-section-head"><h3>Historial de comunicaciones</h3><button class="btn primary" onclick="openCommunicationDialog('${p.id}')">+ Registrar contacto</button></div>${communications.length ? H`<div class="communication-history">${communications.map((entry) => H`<article><span class="communication-channel">${communicationIcons[entry.channel] || "●"}</span><div><strong>${escapeHtml(entry.subject)}</strong><p>${escapeHtml(entry.notes || T("Sin notas"))}</p><small>${entry.direction === "inbound" ? T("Entrante") : T("Saliente")} · ${communicationChannelLabels[entry.channel] || entry.channel} · ${fmtDate(entry.createdAt)} · ${escapeHtml(entry.userEmail || "Equipo")}</small></div>${communicationActionHtml(entry, p)}</article>`).join("")}</div>` : H`<div class="empty">Todavía no se han registrado comunicaciones.</div>`}`;
  const clinicalHtml = H`<div class="patient-record-section-head"><div><h3>Resumen clínico</h3><small>Actualizado ${clinicalRecord.updatedAt ? fmtDate(clinicalRecord.updatedAt) : "—"}</small></div><button class="btn primary" onclick="openClinicalRecordDialog('${p.id}')">Editar resumen</button></div>${(clinicalRecord.allergies || []).length ? H`<div class="clinical-allergy-alert"><strong>⚠ Alergias</strong><span>${escapeHtml(clinicalRecord.allergies.join(" · "))}</span></div>` : H`<div class="clinical-no-allergies">Sin alergias registradas</div>`}${latestVitalsVisit ? H`<div class="latest-vitals"><div><small>Presión</small><strong>${escapeHtml(latestVitalsVisit.vitals.bloodPressure || "—")}</strong></div><div><small>Pulso</small><strong>${escapeHtml(latestVitalsVisit.vitals.pulse || "—")}</strong></div><div><small>Temperatura</small><strong>${latestVitalsVisit.vitals.temperature ? `${escapeHtml(latestVitalsVisit.vitals.temperature)} °F` : "—"}</strong></div><div><small>Peso</small><strong>${latestVitalsVisit.vitals.weight ? `${escapeHtml(latestVitalsVisit.vitals.weight)} lb` : "—"}</strong></div><div><small>SpO₂</small><strong>${latestVitalsVisit.vitals.oxygen ? `${escapeHtml(latestVitalsVisit.vitals.oxygen)}%` : "—"}</strong></div><div><small>Fecha</small><strong>${fmtDate(latestVitalsVisit.date)}</strong></div></div>` : ""}<div class="clinical-summary-grid">${clinicalListCard("Medicamentos activos", clinicalRecord.medications)}${clinicalListCard("Problemas activos", clinicalRecord.conditions)}${clinicalListCard("Cirugías y hospitalizaciones", clinicalRecord.surgeries)}${clinicalListCard("Inmunizaciones", clinicalRecord.immunizations)}<article><h4>Tipo de sangre</h4><p>${escapeHtml(clinicalRecord.bloodType || T("No indicado"))}</p></article><article><h4>Antecedentes familiares</h4><p>${escapeHtml(clinicalRecord.familyHistory || T("No registrados"))}</p></article><article><h4>Historia social</h4><p>${escapeHtml(clinicalRecord.socialHistory || T("No registrada"))}</p></article></div>`;
  const timelineHtml = timeline.length ? H`<div class="patient-timeline">${timeline.map((entry) => H`<div class="timeline-event"><span>${activityIcons[entry.entityType] || "•"}</span><div><strong>${escapeHtml(entry.title)}</strong><p>${escapeHtml(entry.detail || "")}</p><small>${new Date(entry.createdAt).toLocaleString(ClinicI18n.locale)}${entry.userEmail ? ` · ${escapeHtml(entry.userEmail)}` : ""}</small></div></div>`).join("")}</div>` : H`<div class="empty">No hay actividad registrada.</div>`;
  $("#patientRecordContent").innerHTML = { summary, visits: visitHtml, documents: documentHtml, payments: paymentHtml, clinical: clinicalHtml, alerts: alertHtml, communications: communicationHtml, timeline: timelineHtml }[activePatientRecordTab] || summary;
}

function clinicalListCard(title, items = []) {
  return H`<article><h4>${escapeHtml(title)}</h4>${items?.length ? H`<ul>${items.map((item) => H`<li>${escapeHtml(item)}</li>`).join("")}</ul>` : H`<p>No registrado</p>`}</article>`;
}

function linesFromText(value) {
  return String(value || "").split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function openClinicalRecordDialog(patientId) {
  const p = patient(patientId); if (!p) return;
  const record = state.clinicalRecords.find((entry) => entry.id === patientId || entry.patientId === patientId) || {};
  $("#clinicalRecordPatientId").value = patientId; $("#clinicalRecordPatientName").textContent = p.name;
  $("#clinicalBloodType").value = record.bloodType || ""; $("#clinicalAllergies").value = (record.allergies || []).join("\n"); $("#clinicalMedications").value = (record.medications || []).join("\n"); $("#clinicalConditions").value = (record.conditions || []).join("\n"); $("#clinicalSurgeries").value = (record.surgeries || []).join("\n"); $("#clinicalFamilyHistory").value = record.familyHistory || ""; $("#clinicalSocialHistory").value = record.socialHistory || ""; $("#clinicalImmunizations").value = (record.immunizations || []).join("\n");
  $("#clinicalRecordDialog").showModal();
}

async function saveClinicalRecord() {
  const patientId = $("#clinicalRecordPatientId").value;
  const existing = state.clinicalRecords.find((entry) => entry.id === patientId || entry.patientId === patientId);
  const data = { id: patientId, patientId, bloodType: $("#clinicalBloodType").value, allergies: linesFromText($("#clinicalAllergies").value), medications: linesFromText($("#clinicalMedications").value), conditions: linesFromText($("#clinicalConditions").value), surgeries: linesFromText($("#clinicalSurgeries").value), familyHistory: $("#clinicalFamilyHistory").value.trim(), socialHistory: $("#clinicalSocialHistory").value.trim(), immunizations: linesFromText($("#clinicalImmunizations").value), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), updatedBy: auth.currentUser.uid };
  await getCollectionRef("clinicalRecords").doc(patientId).set(data, { merge: true });
  recordActivity({ action: existing ? "updated" : "created", entityType: "clinical", entityId: patientId, patientId, title: "Resumen clínico actualizado", detail: `${data.allergies.length} alergia(s) · ${data.medications.length} medicamento(s) activo(s)` }).catch(console.error);
  $("#clinicalRecordDialog").close(); toast(T("Resumen clínico guardado."));
}

function selectPatientRecordTab(tabName) {
  activePatientRecordTab = tabName;
  renderPatientRecord();
}

async function resolvePatientAlert(id) {
  const p = patient(id);
  if (!p) return;
  try {
    await savePatient({ id, patientAlertActive: false, patientAlertResolvedAt: new Date().toISOString() });
    recordActivity({ action: "resolved", entityType: "alert", entityId: `alert-${id}`, patientId: id, title: "Alerta resuelta", detail: p.patientAlertMessage || "Alerta del paciente" }).catch(console.error);
    p.patientAlertActive = false;
    render();
    if ($("#visitDialog")?.classList.contains("active") && $("#visitPatient")?.value === id) renderVisitPatientBanner();
    if ($("#patientFinanceDialog")?.open) openPatientFinance(id);
    if (activePatientRecordId === id && $("#patientRecord")?.classList.contains("active")) renderPatientRecord();
    toast(T("Alerta marcada como resuelta"));
  } catch (error) { console.error(error); toast(T("No se pudo resolver la alerta")); }
}

function appointmentDoctors() {
  return [...new Set([
    ...(state.settings.doctors || []),
    ...[...state.appointments, ...state.visits].map((item) => String(item.doctor || "").trim())
  ].filter(Boolean))].sort((a, b) => a.localeCompare(b, "es"));
}

function renderAppointmentDoctorOptions() {
  const doctors = appointmentDoctors();
  const configuredDoctors = [...new Set((state.settings.doctors || []).map((name) => String(name).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
  const datalist = $("#appointmentDoctorOptions");
  if (datalist) datalist.innerHTML = configuredDoctors.map((name) => H`<option value="${escapeHtml(name)}"></option>`).join("");
  const filter = $("#appointmentDoctorFilter");
  if (!filter) return;
  const selected = filter.value;
  filter.innerHTML = H`<option value="">Todos los profesionales</option>${doctors.map((name) => H`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  if (doctors.includes(selected)) filter.value = selected;

  [
    ["#appointmentDoctor", "Sin profesional asignado"],
    ["#visitDoctor", "Sin doctor asignado"],
    ["#roomAssignDoctor", "Sin profesional asignado"],
    ["#waitlistDoctor", "Cualquier profesional"]
  ].forEach(([selector, emptyLabel]) => {
    const select = $(selector); if (!select) return;
    const current = select.value;
    select.innerHTML = H`<option value="">${emptyLabel}</option>${configuredDoctors.map((name) => H`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
    if (current && !configuredDoctors.includes(current)) select.insertAdjacentHTML("beforeend", H`<option value="${escapeHtml(current)}">${escapeHtml(current)} (histórico)</option>`);
    select.value = current;
  });
}

function startOfAppointmentWeek(value) {
  const date = new Date(`${value}T12:00:00`);
  const mondayOffset = (date.getDay() + 6) % 7;
  date.setDate(date.getDate() - mondayOffset);
  return date;
}

function addLocalDays(date, days) {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

function appointmentMatchesFilters(item, query, statusFilter, doctorFilter) {
  const p = patient(item.patientId);
  if (statusFilter && item.status !== statusFilter) return false;
  if (doctorFilter && item.doctor !== doctorFilter) return false;
  return `${p?.name || ""} ${item.doctor || ""} ${item.reason || ""}`.toLowerCase().includes(query);
}

function appointmentCardContent(item, compact = false) {
  const p = patient(item.patientId);
  const status = appointmentStatus(item.status);
  const time = new Date(item.date).toLocaleTimeString(ClinicI18n.locale, { hour: "2-digit", minute: "2-digit" });
  if (compact) return H`<button type="button" class="calendar-event status-${item.status}" onclick="event.stopPropagation(); editAppointment('${item.id}')" title="${escapeHtml(`${time} · ${p?.name || T("Paciente")} · ${item.reason || T("Cita")}`)}"><strong>${time} ${escapeHtml(p?.name || T("Paciente"))}</strong><span>${escapeHtml(item.reason || T("Cita"))} · ${item.duration || 30} min</span></button>`;
  return H`<article class="appointment-card status-${item.status}">
    <div class="appointment-time"><strong>${time}</strong><span>${item.duration || 30} min</span></div>
    <div class="appointment-main"><div><h3>${escapeHtml(p?.name || T("Paciente eliminado"))}</h3><p>${escapeHtml(item.reason || T("Sin motivo"))}</p></div><span class="badge ${status.color}">${status.label}</span><div class="appointment-meta"><span>${escapeHtml(item.type || T("Presencial"))}</span><span>${escapeHtml(item.doctor || T("Sin profesional"))}</span><span>${escapeHtml(item.roomName || roomById(item.roomId)?.name || T("Room sin asignar"))}</span><span>${escapeHtml(p?.phone || T("Sin teléfono"))}</span></div></div>
    <div class="appointment-actions">
      ${item.status === "scheduled" ? H`<button class="btn light" onclick="setAppointmentStatus('${item.id}','confirmed')">Confirmar</button>` : ""}
      ${["scheduled", "confirmed"].includes(item.status) ? H`<button class="btn light" onclick="setAppointmentStatus('${item.id}','arrived')">Llegó</button>` : ""}
      ${!["completed", "cancelled", "no_show"].includes(item.status) ? H`<button class="btn primary" onclick="startAppointmentVisit('${item.id}')">Iniciar consulta</button>` : ""}
      <button class="icon-btn" onclick="editAppointment('${item.id}')" title="Editar">✎</button>
      ${!["completed", "cancelled"].includes(item.status) ? H`<button class="icon-btn danger-icon" onclick="cancelAppointment('${item.id}')" title="Cancelar cita">×</button>` : ""}
    </div></article>`;
}

function renderDayCalendar(rows, dateValue) {
  const active = rows.filter((item) => !["cancelled", "no_show"].includes(item.status));
  const openHour = Number((state.settings.scheduleOpenTime || "08:00").split(":")[0]); const closeHour = Number((state.settings.scheduleCloseTime || "18:00").split(":")[0]);
  const hours = Array.from({ length: Math.max(1, closeHour - openHour + 1) }, (_, index) => index + openHour);
  return H`<div class="day-calendar"><div class="calendar-day-title"><strong>${new Date(`${dateValue}T12:00:00`).toLocaleDateString(ClinicI18n.locale, { weekday: "long", day: "numeric", month: "long" })}</strong><span>${active.length} cita(s) activa(s)</span></div>${hours.map((hour) => {
    const slots = [0, 30].map((minute) => {
      const slotItems = rows.filter((item) => { const date = new Date(item.date); return date.getHours() === hour && date.getMinutes() >= minute && date.getMinutes() < minute + 30; });
      const stamp = `${dateValue}T${String(hour).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
      return H`<div class="calendar-slot" onclick="openAppointmentAt('${stamp}')">${slotItems.map((item) => appointmentCardContent(item, true)).join("")}</div>`;
    }).join("");
    return H`<div class="calendar-hour"><time>${new Date(`${dateValue}T${String(hour).padStart(2, "0")}:00`).toLocaleTimeString(ClinicI18n.locale, { hour: "numeric" })}</time><div>${slots}</div></div>`;
  }).join("")}</div>`;
}

function renderWeekCalendar(rows, dateValue) {
  const monday = startOfAppointmentWeek(dateValue);
  const days = Array.from({ length: 7 }, (_, index) => addLocalDays(monday, index));
  return H`<div class="week-calendar">${days.map((date) => {
    const key = localDateValue(date);
    const items = rows.filter((item) => String(item.date || "").slice(0, 10) === key).sort((a, b) => new Date(a.date) - new Date(b.date));
    return H`<section class="week-day ${key === localDateValue() ? "today" : ""}"><button type="button" class="week-day-head" onclick="showAppointmentDay('${key}')"><span>${date.toLocaleDateString(ClinicI18n.locale, { weekday: "short" })}</span><strong>${date.getDate()}</strong></button><div class="week-day-body">${items.length ? items.map((item) => appointmentCardContent(item, true)).join("") : H`<button type="button" class="week-empty" onclick="openAppointmentAt('${key}T09:00')">+ Agregar</button>`}</div></section>`;
  }).join("")}</div>`;
}

function renderAppointments() {
  const agenda = $("#appointmentAgenda");
  if (!agenda) return;
  const dateValue = $("#appointmentDateFilter").value || localDateValue();
  if (!$("#appointmentDateFilter").value) $("#appointmentDateFilter").value = dateValue;
  const query = ($("#appointmentSearch").value || "").toLowerCase().trim();
  const statusFilter = $("#appointmentStatusFilter").value;
  const doctorFilter = $("#appointmentDoctorFilter")?.value || "";
  renderAppointmentDoctorOptions();
  $$('[data-appointment-view]').forEach((button) => button.classList.toggle("active", button.dataset.appointmentView === appointmentView));
  const filteredRows = [...state.appointments].filter((item) => appointmentMatchesFilters(item, query, statusFilter, doctorFilter));
  const dayRows = filteredRows.filter((item) => String(item.date || "").slice(0, 10) === dateValue).sort((a, b) => new Date(a.date) - new Date(b.date));
  const allDay = state.appointments.filter((item) => String(item.date || "").slice(0, 10) === dateValue);
  const countBy = (status) => allDay.filter((item) => item.status === status).length;
  $("#appointmentSummary").innerHTML = H`
    <div><strong>${allDay.length}</strong><span>Total</span></div><div><strong>${countBy("confirmed")}</strong><span>Confirmadas</span></div><div><strong>${countBy("arrived")}</strong><span>En espera</span></div><div><strong>${countBy("completed")}</strong><span>Atendidas</span></div><div><strong>${state.waitlist.filter((entry) => entry.status !== "scheduled").length}</strong><span>Lista de espera</span></div>`;
  if (appointmentView === "day") agenda.innerHTML = renderDayCalendar(dayRows, dateValue);
  else if (appointmentView === "week") agenda.innerHTML = renderWeekCalendar(filteredRows, dateValue);
  else agenda.innerHTML = dayRows.length ? dayRows.map((item) => appointmentCardContent(item)).join("") : H`<div class="empty agenda-empty"><strong>Agenda libre</strong><span>No hay citas para esta fecha y filtros.</span><button class="btn primary" onclick="openAppointmentDialog()">Crear una cita</button></div>`;
}

const roomStatuses = {
  available: { get label() { return T("Disponible"); }, color: "green" },
  preparing: { get label() { return T("Preparándose"); }, color: "blue" },
  waiting: { get label() { return T("Paciente esperando"); }, color: "orange" },
  nursing: { get label() { return T("Enfermería atendiendo"); }, color: "blue" },
  ready: { get label() { return T("Listo para profesional"); }, color: "green" },
  in_visit: { get label() { return T("Consulta en curso"); }, color: "purple" },
  cleaning: { get label() { return T("Requiere limpieza"); }, color: "red" },
  out_of_service: { get label() { return T("Fuera de servicio"); }, color: "gray" }
};

function roomStatus(value) { return roomStatuses[value] || roomStatuses.available; }
function roomById(id) { return state.rooms.find((room) => room.id === id); }
function roomElapsed(room) {
  if (!room.statusChangedAt || ["available", "out_of_service"].includes(room.status)) return "—";
  const minutes = Math.max(0, Math.floor((Date.now() - new Date(room.statusChangedAt).getTime()) / 60000));
  return minutes < 60 ? `${minutes} min` : `${Math.floor(minutes / 60)} h ${minutes % 60} min`;
}

function renderRoomOptions() {
  const options = H`<option value="">Sin room asignado</option>${state.rooms.filter((room) => room.status !== "out_of_service").sort((a, b) => a.name.localeCompare(b.name)).map((room) => H`<option value="${room.id}">${escapeHtml(room.name)} · ${roomStatus(room.status).label}</option>`).join("")}`;
  ["appointmentRoom", "visitRoom"].forEach((id) => { const select = document.getElementById(id); if (!select) return; const selected = select.value; select.innerHTML = options; if ([...select.options].some((option) => option.value === selected)) select.value = selected; });
}

function renderRooms() {
  const board = $("#roomBoard"); if (!board) return;
  const occupied = state.rooms.filter((room) => room.patientId && !["available", "cleaning", "out_of_service"].includes(room.status)).length;
  $("#roomSummary").innerHTML = H`<div><strong>${state.rooms.length}</strong><span>Total rooms</span></div><div><strong>${state.rooms.filter((room) => room.status === "available").length}</strong><span>Disponibles</span></div><div><strong>${occupied}</strong><span>Con pacientes</span></div><div><strong>${state.rooms.filter((room) => room.status === "cleaning").length}</strong><span>Por limpiar</span></div>`;
  board.innerHTML = state.rooms.length ? [...state.rooms].sort((a, b) => a.name.localeCompare(b.name)).map((room) => {
    const status = roomStatus(room.status); const p = patient(room.patientId); const appointment = state.appointments.find((item) => item.id === room.appointmentId);
    return H`<article class="room-card room-${room.status || "available"}"><header><div><small>${escapeHtml(room.type === "lab" ? T("Laboratorio") : room.type === "procedure" ? T("Procedimiento") : T("Consultorio"))}</small><h3>${escapeHtml(room.name)}</h3></div><span class="badge ${status.color}">${status.label}</span></header><div class="room-patient">${p ? H`<strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(appointment?.reason || room.notes || T("Paciente asignado"))}</span><small>${escapeHtml(room.doctor || appointment?.doctor || T("Sin profesional"))} · ${roomElapsed(room)}</small>` : H`<strong>Sin paciente</strong><span>${escapeHtml(room.location || T("Listo para asignar"))}</span>`}</div><div class="room-actions">${room.status === "available" ? H`<button class="btn primary" onclick="openRoomAssignDialog('${room.id}')">Asignar paciente</button>` : ""}${p ? H`<button class="btn light" onclick="advanceRoomStatus('${room.id}')">Siguiente estado</button><button class="btn light" onclick="openIpadLaunch('${room.id}')">Usar iPad</button>` : ""}${room.status === "cleaning" ? H`<button class="btn primary" onclick="releaseRoom('${room.id}')">Marcar limpio</button>` : ""}<button class="icon-btn" onclick="openRoomDialog('${room.id}')" title="Editar room">✎</button></div></article>`;
  }).join("") : H`<div class="empty room-empty"><strong>Configura tus consultorios</strong><span>Crea Room 1, Room 2, laboratorio u otras áreas clínicas.</span><button class="btn primary" onclick="openRoomDialog()">Crear primer room</button></div>`;
}

function openRoomDialog(id = "") {
  const room = roomById(id); $("#roomDialogTitle").textContent = room ? T("Editar room") : T("Nuevo room"); $("#roomId").value = room?.id || ""; $("#roomName").value = room?.name || ""; $("#roomType").value = room?.type || "exam"; $("#roomLocation").value = room?.location || ""; $("#roomDialog").showModal();
}

async function saveRoomFromDialog() {
  const id = $("#roomId").value || uid(); const existing = roomById(id); const name = $("#roomName").value.trim(); if (!name) return toast(T("Escribe el nombre del room."));
  const data = { id, name, type: $("#roomType").value, location: $("#roomLocation").value.trim(), status: existing?.status || "available", patientId: existing?.patientId || "", appointmentId: existing?.appointmentId || "", doctor: existing?.doctor || "", statusChangedAt: existing?.statusChangedAt || new Date().toISOString(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString() };
  await getCollectionRef("rooms").doc(id).set(data, { merge: true }); recordActivity({ action: existing ? "updated" : "created", entityType: "room", entityId: id, title: existing ? "Room actualizado" : "Room creado", detail: name }).catch(console.error); $("#roomDialog").close(); toast(T("Room guardado."));
}

function openRoomAssignDialog(id) {
  const room = roomById(id); if (!room) return; $("#roomAssignId").value = id; $("#roomAssignTitle").textContent = S`Asignar ${room.name}`; $("#roomAssignPatient").innerHTML = state.patients.map((p) => H`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(""); $("#roomAssignPatient").value = room.patientId || state.patients[0]?.id || ""; enablePatientSelectSearch($("#roomAssignPatient")); $("#roomAssignDoctor").value = room.doctor || ""; $("#roomAssignStatus").value = room.status && !["available", "cleaning"].includes(room.status) ? room.status : "waiting"; renderRoomAppointmentChoices(); $("#roomAssignDialog").showModal();
}

function renderRoomAppointmentChoices() {
  const patientId = $("#roomAssignPatient").value; const rows = state.appointments.filter((item) => item.patientId === patientId && !["completed", "cancelled", "no_show"].includes(item.status)).sort((a, b) => new Date(a.date) - new Date(b.date)); $("#roomAssignAppointment").innerHTML = H`<option value="">Sin cita vinculada</option>${rows.map((item) => H`<option value="${item.id}">${fmtDate(item.date)} · ${escapeHtml(item.reason)}</option>`).join("")}`;
}

async function assignRoomFromDialog() {
  const room = roomById($("#roomAssignId").value); if (!room) return; const patientId = $("#roomAssignPatient").value; const appointmentId = $("#roomAssignAppointment").value; const status = $("#roomAssignStatus").value; const doctor = $("#roomAssignDoctor").value.trim();
  const data = { ...room, patientId, appointmentId, doctor, status, portalActive: false, portalSessionKey: null, portalExpiresAt: null, statusChangedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }; await getCollectionRef("rooms").doc(room.id).set(data, { merge: true });
  if (appointmentId) await getCollectionRef("appointments").doc(appointmentId).set({ roomId: room.id, roomName: room.name, status: status === "waiting" ? "arrived" : "confirmed", updatedAt: new Date().toISOString() }, { merge: true });
  recordActivity({ action: "assigned", entityType: "room", entityId: room.id, patientId, title: "Paciente asignado a room", detail: `${room.name} · ${roomStatus(status).label}` }).catch(console.error); $("#roomAssignDialog").close(); toast(S`Paciente asignado a ${room.name}.`);
}

async function updateRoomStatus(id, status) { const room = roomById(id); if (!room) return; await getCollectionRef("rooms").doc(id).set({ status, statusChangedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); recordActivity({ action: "status", entityType: "room", entityId: id, patientId: room.patientId || "", title: `Room: ${roomStatus(status).label}`, detail: room.name }).catch(console.error); }
function advanceRoomStatus(id) { const room = roomById(id); if (!room) return; const next = { waiting: "nursing", nursing: "ready", ready: "in_visit", in_visit: "cleaning", preparing: "available" }[room.status] || "cleaning"; updateRoomStatus(id, next).catch((error) => { console.error(error); toast(T("No se pudo cambiar el estado.")); }); }
async function releaseRoom(id) { const room = roomById(id); if (!room) return; await getCollectionRef("rooms").doc(id).set({ status: "available", patientId: "", appointmentId: "", doctor: "", portalActive: false, portalSessionKey: null, portalExpiresAt: null, statusChangedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); toast(S`${room.name} está disponible.`); }

function openIpadLaunch(id) {
  const room = roomById(id); const p = patient(room?.patientId); if (!room || !p) return toast(T("Asigna primero un paciente al room."));
  const pending = state.formResponses.filter((item) => item.patientId === p.id && item.status !== "completed");
  const documents = state.visits.filter((visit) => visit.patientId === p.id).flatMap((visit) => (visit.documents || []).filter((doc) => doc.status !== "signed").map((doc) => ({ ...doc, visitId: visit.id })));
  const assignedDocumentIds = new Set(documents.map((doc) => doc.documentId));
  const roomDocuments = state.documents.filter((doc) => doc.type === "application/pdf" && doc.roomReady && !assignedDocumentIds.has(doc.id));
  $("#ipadRoomId").value = id; $("#ipadLaunchContext").innerHTML = H`<div><small>Room</small><strong>${escapeHtml(room.name)}</strong></div><div><small>Paciente</small><strong>${escapeHtml(p.name)}</strong></div>`;
  $("#ipadActivityList").innerHTML = H`${pending.length ? H`<div class="ipad-activity-group"><strong>Pendientes del paciente</strong>${pending.map((form) => ipadActivityChoice("response", form.id, "☷", form.templateName, "Continuar formulario pendiente", true)).join("")}</div>` : ""}<div class="ipad-activity-group"><strong>Biblioteca de formularios</strong>${state.formTemplates.length ? state.formTemplates.map((template) => ipadActivityChoice("template", template.id, "＋", template.name, S`${(template.questions || []).length} pregunta(s)`, false)).join("") : H`<small>No hay plantillas digitales.</small>`}</div>${documents.length ? H`<div class="ipad-activity-group"><strong>Documentos pendientes</strong>${documents.map((doc) => ipadActivityChoice("document", `${doc.visitId}|${doc.documentId}`, "✍", doc.name, "Asignado y pendiente de firma", true)).join("")}</div>` : ""}<div class="ipad-activity-group"><strong>PDF convertidos para Room</strong>${roomDocuments.length ? roomDocuments.map((doc) => ipadActivityChoice("library-document", doc.id, "PDF", doc.name, `${(doc.fields || []).length ? S`${doc.fields.length} campo(s) digitales` : T("Revisión y firma")}`, false)).join("") : H`<small>No hay otros PDF convertidos disponibles.</small>`}</div>`;
  $("#ipadCreateTemplateBtn").classList.toggle("hidden", currentAccess.role !== "admin");
  $("#ipadLanguage").value = ["English", "Inglés", "en"].includes(p.language) ? "en" : "es"; $("#ipadCompletionAction").value = "ready"; $("#ipadQuickQuestion").value = ""; $("#ipadLaunchDialog").showModal();
}

function ipadActivityChoice(kind, id, icon, title, detail, checked) { return H`<label class="ipad-activity-choice"><input type="checkbox" data-ipad-kind="${kind}" data-ipad-id="${escapeHtml(id)}" ${checked ? "checked" : ""}/><span>${icon}</span><div><strong>${escapeHtml(title)}</strong><small>${escapeHtml(detail)}</small></div></label>`; }

async function createKioskResponse(template, patientId, roomId, quickQuestion = "") {
  const id = uid(); const questions = quickQuestion ? [{ id: uid(), label: quickQuestion, type: "textarea", required: true }] : (template.questions || []); const name = quickQuestion ? "Pregunta del profesional" : template.name;
  const response = { id, templateId: quickQuestion ? "quick-room-question" : template.id, templateName: name, category: quickQuestion ? "other" : template.category, description: quickQuestion ? "Esta pregunta fue preparada para tu consulta de hoy." : (template.description || ""), questions, answers: {}, patientId, roomId, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: auth.currentUser.uid };
  await getCollectionRef("formResponses").doc(id).set(response); state.formResponses.push(response); return response;
}

async function assignRoomLibraryDocument(documentId, room, patientItem) {
  const documentItem = state.documents.find((item) => item.id === documentId && item.roomReady); if (!documentItem) return null;
  const appointment = state.appointments.find((item) => item.id === room.appointmentId);
  let visit = state.visits.find((item) => item.id === appointment?.visitId)
    || [...state.visits].filter((item) => item.patientId === patientItem.id && item.roomId === room.id && item.status !== "Cancelada").sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0))[0];
  if ((visit?.documents || []).some((item) => item.documentId === documentId && item.status === "signed")) visit = null;
  if (!visit) {
    const id = uid(); const now = new Date().toISOString();
    visit = { id, patientId: patientItem.id, type: "Presencial", date: now, doctor: room.doctor || appointment?.doctor || "", roomId: room.id, roomName: room.name, status: "Programada", reason: appointment?.reason || "Documentos de Room", notes: "", lineItems: [], total: 0, paid: 0, patientPaid: 0, insurancePaid: 0, documents: [], appointmentId: appointment?.id || "", createdAt: now, updatedAt: now };
  }
  const existingDocuments = visit.documents || [];
  if (!existingDocuments.some((item) => item.documentId === documentId)) {
    visit = { ...visit, documents: [...existingDocuments, { documentId, name: documentItem.name, url: documentItem.url || "", fields: documentItem.fields || [], answers: {}, status: "pending" }], updatedAt: new Date().toISOString() };
    await saveVisit(visit);
    const index = state.visits.findIndex((item) => item.id === visit.id); if (index >= 0) state.visits[index] = visit; else state.visits.push(visit);
  }
  return { type: "document", visitId: visit.id, documentId };
}

async function startPatientKiosk() {
  const room = roomById($("#ipadRoomId").value); const p = patient(room?.patientId); if (!room || !p) return toast(T("Asigna primero un paciente al room."));
  const selected = Array.from($$("#ipadActivityList [data-ipad-kind]:checked")); const activities = [];
  for (const input of selected) {
    if (input.dataset.ipadKind === "response") activities.push({ type: "form", responseId: input.dataset.ipadId });
    if (input.dataset.ipadKind === "template") { const template = state.formTemplates.find((item) => item.id === input.dataset.ipadId); if (template) activities.push({ type: "form", responseId: (await createKioskResponse(template, p.id, room.id)).id }); }
    if (input.dataset.ipadKind === "document") { const [visitId, documentId] = input.dataset.ipadId.split("|"); activities.push({ type: "document", visitId, documentId }); }
    if (input.dataset.ipadKind === "library-document") { const activity = await assignRoomLibraryDocument(input.dataset.ipadId, room, p); if (activity) activities.push(activity); }
  }
  const quickQuestion = $("#ipadQuickQuestion").value.trim(); if (quickQuestion) activities.push({ type: "form", responseId: (await createKioskResponse({}, p.id, room.id, quickQuestion)).id });
  if (!activities.length) return toast(T("Selecciona al menos un formulario o PDF para el iPad."));
  const endpoint = `https://us-central1-${window.firebaseConfig.projectId}.cloudfunctions.net/patientPortal`; const idToken = await auth.currentUser.getIdToken(); const response = await fetch(endpoint, { method: "POST", headers: { "Authorization": `Bearer ${idToken}`, "Content-Type": "application/json" }, body: JSON.stringify({ action: "create", clinicId: activeClinicId, roomId: room.id, patientId: p.id, activities, language: $("#ipadLanguage").value, completionAction: $("#ipadCompletionAction").value }) }); const data = await response.json().catch(() => ({})); if (!response.ok) throw new Error(data.error || "portal-session-failed");
  $("#ipadLaunchDialog").close(); $("#patientPortalCode").textContent = data.code; $("#patientPortalUrl").value = data.portalUrl; $("#patientPortalDialog").showModal(); toast(T("Acceso temporal del iPad creado."));
}

function restorePatientKiosk() {
  if (!activeKioskSession) return; const room = roomById(activeKioskSession.roomId); const p = patient(activeKioskSession.patientId); if (!room || !p) return;
  document.body.classList.add("kiosk-active"); $("#patientKiosk").classList.remove("hidden"); $("#kioskClinicName").textContent = state.settings.clinicName || "Clinic Control"; $("#kioskRoomName").textContent = room.name; renderCurrentKioskActivity();
}

function kioskText(es, en) { return activeKioskSession?.language === "en" ? en : es; }
function currentKioskActivity() { return activeKioskSession?.activities?.[activeKioskSession.currentIndex]; }
function updateKioskProgress() { const total = activeKioskSession?.activities?.length || 0; const current = Math.min((activeKioskSession?.currentIndex || 0) + 1, total); $("#kioskProgress").classList.toggle("hidden", !total); $("#kioskProgressText").textContent = total ? S`${kioskText("Actividad", "Activity")} ${current} ${kioskText("de", "of")} ${total}` : ""; $("#kioskProgressBar").style.width = total ? `${current / total * 100}%` : "0"; }

function renderCurrentKioskActivity() {
  const p = patient(activeKioskSession?.patientId); const activity = currentKioskActivity(); updateKioskProgress();
  if (!p) return;
  if (!activity) return finishKioskActivities(p);
  if (activity.type === "form") { const response = state.formResponses.find((item) => item.id === activity.responseId); if (!response) return advanceKioskActivity(); $("#kioskContent").innerHTML = H`<form id="kioskForm" class="kiosk-form"><div class="kiosk-welcome"><small>${kioskText("Hola", "Hello")}</small><h1>${escapeHtml(p.name.split(" ")[0])}</h1><h2>${escapeHtml(response.templateName || T("Formulario"))}</h2><p>${escapeHtml(response.description || kioskText("Contesta las siguientes preguntas.", "Please answer the following questions."))}</p></div><div class="kiosk-questions">${(response.questions || []).map((q, i) => digitalQuestionHtml(q, response.answers?.[q.id] || "", i)).join("")}</div><button class="kiosk-submit" type="submit">${kioskText("Guardar y continuar", "Save and continue")}</button></form>`; document.getElementById("kioskForm")?.addEventListener("submit", saveKioskForm); return; }
  renderKioskDocument(activity, p);
}

function renderKioskDocument(activity, p) {
  const visit = state.visits.find((item) => item.id === activity.visitId); const doc = visit?.documents?.find((item) => item.documentId === activity.documentId); if (!visit || !doc) return advanceKioskActivity();
  const visibleFields = (doc.fields || []).filter((field) => !field.hidden && field.type !== "signature");
  $("#kioskContent").innerHTML = H`<form id="kioskSignatureForm" class="kiosk-form"><div class="kiosk-welcome"><small>${kioskText("Documento digital", "Digital document")}</small><h1>${escapeHtml(doc.name)}</h1><p>${kioskText("Revisa el PDF, completa los campos y firma.", "Review the PDF, complete the fields, and sign.")}</p>${doc.url ? H`<a class="btn primary" href="${escapeHtml(doc.url)}" target="_blank" rel="noopener">${kioskText("Abrir PDF", "Open PDF")}</a>` : ""}</div>${doc.url ? H`<iframe class="kiosk-document-preview" src="${escapeHtml(doc.url)}" title="${escapeHtml(doc.name)}"></iframe>` : ""}${visibleFields.length ? H`<div class="kiosk-questions">${visibleFields.map((field, index) => digitalQuestionHtml(field, doc.answers?.[field.id] || "", index)).join("")}</div>` : ""}<label class="digital-question"><span>${kioskText("Nombre de quien firma", "Signer name")} *</span><input id="kioskSignerName" value="${escapeHtml(p.name)}" required /></label><div class="kiosk-signature"><div><strong>${kioskText("Firma con el dedo o Apple Pencil", "Sign with your finger or Apple Pencil")}</strong><button id="kioskClearSignature" type="button">${kioskText("Limpiar", "Clear")}</button></div><canvas id="kioskSignatureCanvas"></canvas></div><label class="consent-field"><input id="kioskSignatureConsent" type="checkbox" required/><span><strong>${kioskText("Acepto usar esta firma electrónica", "I agree to use this electronic signature")}</strong></span></label><button class="kiosk-submit" type="submit">${kioskText("Guardar y firmar", "Save and sign")}</button></form>`;
  initKioskSignatureCanvas(); document.getElementById("kioskSignatureForm")?.addEventListener("submit", saveKioskSignature);
}

function initKioskSignatureCanvas() { const canvas = document.getElementById("kioskSignatureCanvas"); canvas.width = Math.max(600, Math.floor(canvas.getBoundingClientRect().width * 2)); canvas.height = 280; const ctx = canvas.getContext("2d"); ctx.scale(2, 2); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#0f172a"; let drawing = false; canvas.dataset.hasInk = "false"; const point = (event) => { const rect = canvas.getBoundingClientRect(); return { x: event.clientX - rect.left, y: event.clientY - rect.top }; }; canvas.onpointerdown = (event) => { drawing = true; const p = point(event); ctx.beginPath(); ctx.moveTo(p.x, p.y); canvas.setPointerCapture(event.pointerId); }; canvas.onpointermove = (event) => { if (!drawing) return; const p = point(event); ctx.lineTo(p.x, p.y); ctx.stroke(); canvas.dataset.hasInk = "true"; }; canvas.onpointerup = canvas.onpointercancel = () => { drawing = false; }; document.getElementById("kioskClearSignature").onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.dataset.hasInk = "false"; }; }

async function saveKioskForm(event) { event.preventDefault(); const activity = currentKioskActivity(); const response = state.formResponses.find((item) => item.id === activity?.responseId); if (!response) return advanceKioskActivity(); const answers = Object.fromEntries(Array.from($$("#kioskContent [data-answer-id]")).map((input) => [input.dataset.answerId, input.value.trim()])); const missing = (response.questions || []).find((q) => q.required && !answers[q.id]); if (missing) return toast(S`${kioskText("Completa", "Complete")}: ${missing.label}`); await getCollectionRef("formResponses").doc(response.id).set({ answers, status: "completed", updatedAt: new Date().toISOString(), completedAt: new Date().toISOString(), completedBy: "patient-kiosk", roomId: activeKioskSession.roomId }, { merge: true }); recordActivity({ action: "completed", entityType: "form", entityId: response.id, patientId: response.patientId, title: "Formulario completado en iPad", detail: `${response.templateName} · ${roomById(activeKioskSession.roomId)?.name || "Room"}` }).catch(console.error); advanceKioskActivity(); }

async function saveKioskSignature(event) { event.preventDefault(); const activity = currentKioskActivity(); const visit = state.visits.find((item) => item.id === activity?.visitId); const doc = visit?.documents?.find((item) => item.documentId === activity?.documentId); const canvas = document.getElementById("kioskSignatureCanvas"); const signedBy = document.getElementById("kioskSignerName").value.trim(); if (!visit || !doc) return advanceKioskActivity(); const answers = Object.fromEntries(Array.from($$("#kioskContent [data-answer-id]")).map((input) => [input.dataset.answerId, input.value.trim()])); const missing = (doc.fields || []).find((field) => field.required && !answers[field.id]); if (missing) return toast(S`${kioskText("Completa", "Complete")}: ${missing.label}`); if (!signedBy || canvas.dataset.hasInk !== "true") return toast(kioskText("Escribe el nombre y dibuja la firma.", "Enter the name and draw the signature.")); if (!document.getElementById("kioskSignatureConsent").checked) return toast(kioskText("Confirma la aceptación de la firma.", "Confirm signature acceptance.")); const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png")); const path = `clinics/${activeClinicId}/signatures/${visit.id}/${doc.documentId}/${uid()}.png`; const ref = storage.ref(path); await ref.put(blob, { contentType: "image/png" }); const signatureUrl = await ref.getDownloadURL(); const signedAt = new Date().toISOString(); const documents = visit.documents.map((item) => item.documentId === doc.documentId ? { ...item, answers, status: "signed", signedBy, signedAt, signatureUrl, signaturePath: path, consentAccepted: true, signedByUserId: auth.currentUser.uid, signedInRoomId: activeKioskSession.roomId } : item); await saveVisit({ id: visit.id, documents }); visit.documents = documents; recordActivity({ action: "signed", entityType: "signature", entityId: doc.documentId, patientId: visit.patientId, visitId: visit.id, title: "Documento digital completado y firmado en iPad", detail: `${doc.name} · ${roomById(activeKioskSession.roomId)?.name || "Room"}` }).catch(console.error); advanceKioskActivity(); }

function advanceKioskActivity() { activeKioskSession.currentIndex += 1; sessionStorage.setItem("clinicKioskSession", JSON.stringify(activeKioskSession)); renderCurrentKioskActivity(); }
function finishKioskActivities(p) { $("#kioskProgress").classList.add("hidden"); $("#kioskContent").innerHTML = H`<div class="kiosk-done"><span>✓</span><h1>${kioskText("¡Gracias!", "Thank you!")}</h1><p>${kioskText("Todo quedó guardado. Avise al personal o entregue el iPad.", "Everything has been saved. Please notify staff or return the iPad.")}</p></div>`; if (!activeKioskSession.finishedAt) { activeKioskSession.finishedAt = Date.now(); sessionStorage.setItem("clinicKioskSession", JSON.stringify(activeKioskSession)); updateRoomStatus(activeKioskSession.roomId, activeKioskSession.completionAction || "ready").catch(console.error); recordActivity({ action: "completed", entityType: "room", entityId: activeKioskSession.roomId, patientId: p.id, title: "Paciente terminó actividades en iPad", detail: roomById(activeKioskSession.roomId)?.name || "Room" }).catch(console.error); } }

function exitPatientKiosk() { if (!activeKioskSession) return; const value = prompt(T("PIN del personal para salir del modo paciente:")); if (value !== activeKioskSession.pin) return toast(T("PIN incorrecto.")); activeKioskSession = null; sessionStorage.removeItem("clinicKioskSession"); document.body.classList.remove("kiosk-active"); $("#patientKiosk").classList.add("hidden"); if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); showPage("rooms"); }

function renderVisits() {
  const query = ($("#visitSearch")?.value || "").toLowerCase().trim();

  const rows = [...state.visits]
    .filter((visit) => {
      const p = patient(visit.patientId);
      return `${p?.name || ""} ${visit.reason} ${visit.doctor} ${visit.type}`.toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  $("#visitsTable").innerHTML = rows.length ? rows.map((visit) => {
    const p = patient(visit.patientId);
    const due = balance(visit);
    const visitDocuments = visit.documents || [];
    const pendingDocuments = visitDocuments.filter((item) => item.status !== "signed").length;
    return H`
      <tr>
        <td>${fmtDate(visit.date)}</td>
        <td><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong><br><small>${escapeHtml(visit.doctor || T("Sin doctor asignado"))} · ${escapeHtml(visit.roomName || roomById(visit.roomId)?.name || T("Room sin asignar"))}</small></td>
        <td><span class="badge ${visit.type === "Teleconsulta" ? "blue" : "green"}">${escapeHtml(T(visit.type))}</span><br><small>${escapeHtml(T(visit.status || "Completada"))}</small></td>
        <td>${escapeHtml(visit.reason)}</td>
        <td>${money(visit.total)}</td>
        <td>${money(totalPaid(visit))}</td>
        <td><span class="badge ${due > 0 ? "red" : "green"}">${money(due)}</span></td>
        <td>
          <div class="row-actions">
            ${visitDocuments.length && ["admin", "clinical"].includes(currentAccess.role) ? H`<button class="icon-btn signature-action ${pendingDocuments ? "has-pending" : "all-signed"}" onclick="openSignatureDialog('${visit.id}')" title="${pendingDocuments ? S`${pendingDocuments} documento(s) pendiente(s) de firma` : T("Documentos firmados")}">✍</button>` : ""}
            ${["admin", "clinical"].includes(currentAccess.role) ? H`<button class="icon-btn" onclick="editVisit('${visit.id}')" title="Editar">✎</button>` : ""}
            ${currentAccess.role === "admin" ? H`<button class="icon-btn" onclick="deleteVisit('${visit.id}')" title="Eliminar">⌫</button>` : ""}
          </div>
        </td>
      </tr>
    `;
  }).join("") : H`<tr><td class="empty" colspan="8">No hay consultas registradas.</td></tr>`;
}

function billingVisitAmounts(visit) {
  const type = paymentType(visit);
  const total = effectiveVisitTotal(visit);
  const refunds = adjustmentAmount(visit.id, ["refund"]);
  const rawPatientPaid = visit.patientPaid !== undefined ? Number(visit.patientPaid || 0) : (type === "cash" ? Number(visit.paid || 0) : 0);
  const patientPaid = type === "cash" ? Math.max(0, rawPatientPaid - refunds) : rawPatientPaid;
  const insurancePaid = type === "insurance" ? Math.max(0, Number(visit.insurancePaid || 0) - refunds) : Number(visit.insurancePaid || 0);
  const patientExpected = type === "cash" ? total : Math.min(total, Math.max(Number(visit.copay || 0), patientPaid));
  const insuranceExpected = type === "insurance" ? Math.max(0, total - patientExpected) : 0;
  return {
    type, total, patientPaid, insurancePaid, patientExpected, insuranceExpected,
    patientPending: Math.max(0, patientExpected - patientPaid),
    insurancePending: Math.max(0, insuranceExpected - insurancePaid)
  };
}

function billingSummaryCard(label, amount, hint, tone = "") {
  return H`<article class="kpi-card billing-kpi ${tone}"><span class="kpi-label">${T(label)}</span><strong>${money(amount)}</strong><small>${T(hint)}</small></article>`;
}

function billingTotals(visits) {
  return visits.reduce((acc, visit) => {
    const value = billingVisitAmounts(visit);
    acc.billed += value.total;
    if (value.type === "cash") acc.cashBilled += value.total;
    else acc.insuranceBilled += value.total;
    acc.patientPaid += value.patientPaid;
    acc.insurancePaid += value.insurancePaid;
    acc.patientPending += value.patientPending;
    acc.insurancePending += value.insurancePending;
    return acc;
  }, { billed: 0, cashBilled: 0, insuranceBilled: 0, patientPaid: 0, insurancePaid: 0, patientPending: 0, insurancePending: 0 });
}

function renderBillingSummary(visits) {
  const totals = billingTotals(visits);
  const pending = totals.patientPending + totals.insurancePending;
  let cards = "";
  if (activeBillingTab === "cash") {
    cards = billingSummaryCard("Facturado Cash", totals.cashBilled, "Responsabilidad de pacientes", "tone-cash")
      + billingSummaryCard("Cobrado Cash", totals.patientPaid, "Efectivo, tarjeta y copagos", "tone-paid")
      + billingSummaryCard("Balance de pacientes", totals.patientPending, "Pendiente por cobrar", "tone-pending");
  } else if (activeBillingTab === "insurance") {
    cards = billingSummaryCard("Facturado a seguros", totals.insuranceBilled, "Consultas con cobertura", "tone-insurance")
      + billingSummaryCard("Pagado por seguros", totals.insurancePaid, "Reclamaciones cobradas", "tone-paid")
      + billingSummaryCard("Copagos cobrados", totals.patientPaid, "Pagos del paciente", "tone-cash")
      + billingSummaryCard("Balance de seguros", totals.insurancePending, "Pendiente de aseguradoras", "tone-pending");
  } else if (activeBillingTab === "pending") {
    cards = billingSummaryCard("Balance total", pending, "Todo lo pendiente", "tone-pending")
      + billingSummaryCard("Deben pacientes", totals.patientPending, "Cash y copagos pendientes", "tone-cash")
      + billingSummaryCard("Deben seguros", totals.insurancePending, "Reclamaciones pendientes", "tone-insurance");
  } else {
    cards = billingSummaryCard("Total facturado", totals.billed, "Cash y seguros", "tone-all")
      + billingSummaryCard("Facturado Cash", totals.cashBilled, "Pacientes de pago propio", "tone-cash")
      + billingSummaryCard("Cash cobrado", totals.patientPaid, "Incluye copagos", "tone-paid")
      + billingSummaryCard("Facturado a seguros", totals.insuranceBilled, "Consultas aseguradas", "tone-insurance")
      + billingSummaryCard("Seguros cobrados", totals.insurancePaid, "Pagos recibidos", "tone-paid")
      + billingSummaryCard("Balance total", pending, S`Pacientes ${money(totals.patientPending)} · Seguros ${money(totals.insurancePending)}`, "tone-pending");
  }
  $("#billingSummary").className = `kpi-grid billing-summary summary-${activeBillingTab}`;
  $("#billingSummary").innerHTML = cards;
}

function renderBilling() {
  const insuranceSelect = $("#billingInsuranceFilter");
  const selectedInsurance = insuranceSelect.value;
  const insuranceCompanies = [...new Set(state.patients.map((p) => p.insuranceCompany).filter(Boolean))].sort();
  insuranceSelect.innerHTML = H`<option value="">Todos los seguros</option>${insuranceCompanies.map((name) => H`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`;
  if (insuranceCompanies.includes(selectedInsurance)) insuranceSelect.value = selectedInsurance;
  const query = ($("#billingSearch")?.value || "").toLowerCase().trim();
  const statusFilter = $("#billingStatusFilter")?.value || "";
  const dateFrom = $("#billingDateFrom")?.value || "";
  const dateTo = $("#billingDateTo")?.value || "";
  const insuranceFilter = $("#billingInsuranceFilter")?.value || "";
  const filteredVisits = [...state.visits].filter((visit) => {
    const p = patient(visit.patientId);
    const status = financialStatus(visit);
    if (statusFilter && status.key !== statusFilter) return false;
    const visitDate = String(visit.date || "").slice(0, 10);
    if (dateFrom && visitDate < dateFrom) return false;
    if (dateTo && visitDate > dateTo) return false;
    if (insuranceFilter && p?.insuranceCompany !== insuranceFilter) return false;
    const searchable = `${p?.name || ""} ${p?.insuranceCompany || ""} ${invoiceNumber(visit)} ${visitItems(visit).map((item) => item.description).join(" ")}`.toLowerCase();
    return searchable.includes(query);
  });
  const rows = filteredVisits.filter((visit) => {
    const type = paymentType(visit);
    if (activeBillingTab === "cash" && type !== "cash") return false;
    if (activeBillingTab === "insurance" && type !== "insurance") return false;
    if (activeBillingTab === "pending" && balance(visit) <= 0) return false;
    return true;
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  currentBillingRows = rows;
  renderBillingSummary(rows);

  $("#billingTable").innerHTML = rows.length ? rows.map((visit) => {
    const p = patient(visit.patientId);
    const type = paymentType(visit);
    const status = financialStatus(visit);
    const value = billingVisitAmounts(visit); const adjustmentTotal = adjustmentAmount(visit.id, ["discount", "writeoff", "refund"]);
    return H`<tr><td data-label="Fecha / Factura">${fmtDate(visit.date)}<br><small>${escapeHtml(invoiceNumber(visit))}</small></td><td data-label="Paciente"><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong><br><small>${escapeHtml(type === "insurance" ? (p?.insuranceCompany || T("Seguro no indicado")) : T("Pago propio"))}</small></td><td data-label="Servicios">${visitItems(visit).length} servicio(s)<br><small>${escapeHtml(visitItems(visit).map((item) => item.description).join(", "))}${adjustmentTotal ? S` · Ajustes ${money(adjustmentTotal)}` : ""}</small></td><td data-label="Tipo"><span class="badge ${type === "insurance" ? "blue" : "green"}">${type === "insurance" ? T("Seguro") : T("Cash")}</span></td><td data-label="Facturado">${money(value.total)}</td><td data-label="Paciente">${money(value.patientPaid)}</td><td data-label="Seguro">${money(value.insurancePaid)}</td><td data-label="Balance"><strong>${money(balance(visit))}</strong></td><td data-label="Estado"><span class="badge ${status.color}">${status.label}</span></td><td><div class="row-actions"><button class="btn light invoice-view" onclick="openPaymentDialog('${visit.id}')">Pago</button><button class="btn light" onclick="openAdjustmentDialog('${visit.id}')">Ajuste</button></div></td></tr>`;
  }).join("") : H`<tr><td class="empty" colspan="10">No hay pagos que coincidan con los filtros.</td></tr>`;
  renderPaymentHistory();
  renderAdvancedAccounting();
}

function billingReportTitle() {
  return T({ all: "Resumen completo", cash: "Pagos Cash", insurance: "Pagos de seguros", pending: "Balances pendientes" }[activeBillingTab] || "Resumen completo");
}

function billingReportHtml() {
  const totals = billingTotals(currentBillingRows);
  const totalPending = totals.patientPending + totals.insurancePending;
  const filters = [$("#billingDateFrom").value ? `Desde ${$("#billingDateFrom").value}` : "", $("#billingDateTo").value ? `Hasta ${$("#billingDateTo").value}` : "", $("#billingInsuranceFilter").value, $("#billingSearch").value].filter(Boolean).join(" · ");
  return H`<article class="billing-print-sheet"><header><div class="billing-print-brand">${state.settings.clinicLogo ? H`<img src="${state.settings.clinicLogo}" alt="Logo de la clínica" />` : ""}<div><h2>${escapeHtml(state.settings.clinicName || "Clinic Control")}</h2><p>${escapeHtml([state.settings.clinicAddress, state.settings.clinicPhone, state.settings.clinicEmail].filter(Boolean).join(" · "))}</p></div></div><div><strong>REPORTE DE PAGOS</strong><span>${new Date().toLocaleDateString(ClinicI18n.locale)}</span></div></header><div class="billing-print-context"><strong>${billingReportTitle()}</strong><span>${escapeHtml(filters || T("Sin filtros adicionales"))}</span></div><div class="billing-print-summary"><div><span>Total facturado</span><strong>${money(totals.billed)}</strong></div><div><span>Facturado Cash</span><strong>${money(totals.cashBilled)}</strong></div><div><span>Cobrado pacientes</span><strong>${money(totals.patientPaid)}</strong></div><div><span>Facturado seguros</span><strong>${money(totals.insuranceBilled)}</strong></div><div><span>Cobrado seguros</span><strong>${money(totals.insurancePaid)}</strong></div><div><span>Balance total</span><strong>${money(totalPending)}</strong><small>Pacientes ${money(totals.patientPending)} · Seguros ${money(totals.insurancePending)}</small></div></div><table><colgroup><col class="print-date" /><col class="print-patient" /><col class="print-type" /><col span="4" class="print-amount" /></colgroup><thead><tr><th>Fecha / Factura</th><th>Paciente / Servicio</th><th>Tipo</th><th>Facturado</th><th>Paciente</th><th>Seguro</th><th>Balance</th></tr></thead><tbody>${currentBillingRows.map((visit) => { const p = patient(visit.patientId); const value = billingVisitAmounts(visit); return H`<tr><td>${new Date(visit.date).toLocaleDateString(ClinicI18n.locale)}<small>${escapeHtml(invoiceNumber(visit))}</small></td><td><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong><small>${escapeHtml(visitItems(visit).map((item) => item.description).join(", ") || visit.reason || T("Consulta"))}</small></td><td>${value.type === "insurance" ? T("Seguro") : T("Cash")}</td><td>${money(value.total)}</td><td>${money(value.patientPaid)}</td><td>${money(value.insurancePaid)}</td><td>${money(value.patientPending + value.insurancePending)}</td></tr>`; }).join("") || H`<tr><td colspan="7">No hay información para los filtros seleccionados.</td></tr>`}</tbody></table><footer>${currentBillingRows.length} registro(s) · Generado el ${new Date().toLocaleString(ClinicI18n.locale)}</footer></article>`;
}

function printBillingReport() {
  $("#billingReportPrint").innerHTML = billingReportHtml();
  $("#billingReportDialog").showModal();
  setTimeout(() => window.print(), 100);
}

function addClinicLogoToPdf(pdf, x, y, maxWidth = 52, maxHeight = 36) {
  if (!state.settings.clinicLogo) return 0;
  try {
    const properties = pdf.getImageProperties(state.settings.clinicLogo);
    const ratio = Math.min(maxWidth / properties.width, maxHeight / properties.height);
    const width = properties.width * ratio;
    const height = properties.height * ratio;
    pdf.addImage(state.settings.clinicLogo, properties.fileType || undefined, x, y, width, height, undefined, "FAST");
    return width + 10;
  } catch (error) {
    console.warn("El logo no pudo agregarse al PDF.", error);
    return 0;
  }
}

function downloadBillingPdf() {
  if (!window.jspdf?.jsPDF) { toast(T("No se pudo cargar el generador de PDF.")); return; }
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter", orientation: "landscape" });
  const totals = billingTotals(currentBillingRows);
  const margin = 38;
  const pageWidth = 792;
  const right = pageWidth - margin;
  let y = 38;
  const logoOffset = addClinicLogoToPdf(pdf, margin, 20, 54, 38);
  pdf.setTextColor(15, 118, 110); pdf.setFont("helvetica", "bold"); pdf.setFontSize(18); pdf.text(state.settings.clinicName || "Clinic Control", margin + logoOffset, y);
  pdf.setTextColor(23, 32, 51); pdf.setFontSize(15); pdf.text(T("REPORTE DE PAGOS"), right, y, { align: "right" });
  y += 18; pdf.setFont("helvetica", "normal"); pdf.setFontSize(8.5); pdf.setTextColor(80, 95, 115);
  pdf.text(S`${billingReportTitle()} - ${new Date().toLocaleDateString(ClinicI18n.locale)}`, margin + logoOffset, y);
  pdf.text([state.settings.clinicPhone, state.settings.clinicEmail].filter(Boolean).join(" - "), right, y, { align: "right" });
  y += 20; pdf.setDrawColor(15, 118, 110); pdf.setLineWidth(1.5); pdf.line(margin, y, right, y); y += 13;
  const cards = [
    ["TOTAL FACTURADO", totals.billed, [23, 32, 51]],
    ["CASH FACTURADO", totals.cashBilled, [5, 150, 105]],
    ["CASH COBRADO", totals.patientPaid, [13, 148, 136]],
    ["SEGUROS COBRADOS", totals.insurancePaid, [37, 99, 235]],
    ["BALANCE TOTAL", totals.patientPending + totals.insurancePending, [234, 88, 12]]
  ];
  const cardGap = 8;
  const cardWidth = (right - margin - cardGap * (cards.length - 1)) / cards.length;
  cards.forEach(([label, amount, color], index) => {
    const x = margin + index * (cardWidth + cardGap);
    pdf.setFillColor(248, 250, 252); pdf.setDrawColor(...color); pdf.setLineWidth(1); pdf.roundedRect(x, y, cardWidth, 46, 4, 4, "FD");
    pdf.setTextColor(80, 95, 115); pdf.setFont("helvetica", "bold"); pdf.setFontSize(6.5); pdf.text(T(label), x + 8, y + 13);
    pdf.setTextColor(...color); pdf.setFontSize(13); pdf.text(money(amount), x + 8, y + 33);
  });
  y += 60;
  pdf.setTextColor(80, 95, 115); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.5);
  pdf.text(S`Balances separados: pacientes ${money(totals.patientPending)} - seguros ${money(totals.insurancePending)}`, margin, y); y += 16;
  const columns = [
    { label: T("FECHA / FACTURA"), x: margin, width: 92, align: "left" },
    { label: T("PACIENTE / SERVICIO"), x: margin + 92, width: 236, align: "left" },
    { label: T("TIPO"), x: margin + 328, width: 58, align: "left" },
    { label: T("FACTURADO"), x: margin + 386, width: 82, align: "right" },
    { label: T("PACIENTE"), x: margin + 468, width: 82, align: "right" },
    { label: T("SEGURO"), x: margin + 550, width: 82, align: "right" },
    { label: T("BALANCE"), x: margin + 632, width: 84, align: "right" }
  ];
  const drawHeader = () => {
    pdf.setFillColor(226, 232, 240); pdf.rect(margin, y, right - margin, 24, "F");
    pdf.setTextColor(23, 32, 51); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.2);
    columns.forEach((column) => pdf.text(T(column.label), column.align === "right" ? column.x + column.width - 6 : column.x + 6, y + 15, { align: column.align }));
    y += 24;
  };
  drawHeader();
  currentBillingRows.forEach((visit) => {
    const p = patient(visit.patientId); const value = billingVisitAmounts(visit);
    const service = visitItems(visit).map((item) => item.description).join(", ") || visit.reason || "Consulta";
    const patientNameLines = pdf.splitTextToSize(p?.name || T("Paciente"), columns[1].width - 12);
    const serviceLines = pdf.splitTextToSize(service, columns[1].width - 12);
    const contentLines = patientNameLines.length + serviceLines.length;
    const rowHeight = Math.max(34, contentLines * 8 + 12);
    if (y + rowHeight > 566) { pdf.addPage(); y = 34; pdf.setTextColor(15, 118, 110); pdf.setFont("helvetica", "bold"); pdf.setFontSize(10); pdf.text(S`${state.settings.clinicName || "Clinic Control"} - Reporte de pagos`, margin, y); y += 14; drawHeader(); }
    const rowTop = y;
    const visitDate = new Date(visit.date).toLocaleDateString(ClinicI18n.locale);
    pdf.setTextColor(23, 32, 51); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7.4);
    pdf.text(visitDate, columns[0].x + 6, rowTop + 12); pdf.setTextColor(80, 95, 115); pdf.setFontSize(6.7); pdf.text(invoiceNumber(visit), columns[0].x + 6, rowTop + 23);
    pdf.setTextColor(23, 32, 51); pdf.setFont("helvetica", "bold"); pdf.setFontSize(7.5); pdf.text(patientNameLines, columns[1].x + 6, rowTop + 11);
    const serviceY = rowTop + 11 + patientNameLines.length * 8; pdf.setTextColor(80, 95, 115); pdf.setFont("helvetica", "normal"); pdf.setFontSize(6.8); pdf.text(serviceLines, columns[1].x + 6, serviceY);
    pdf.setTextColor(23, 32, 51); pdf.setFontSize(7.4); pdf.text(value.type === "insurance" ? T("Seguro") : T("Cash"), columns[2].x + 6, rowTop + 15);
    const amountY = rowTop + 15; [value.total, value.patientPaid, value.insurancePaid, value.patientPending + value.insurancePending].forEach((amount, index) => { const column = columns[index + 3]; pdf.text(money(amount), column.x + column.width - 6, amountY, { align: "right" }); });
    y += rowHeight; pdf.setDrawColor(226, 232, 240); pdf.line(margin, y, right, y);
  });
  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page += 1) { pdf.setPage(page); pdf.setTextColor(100, 116, 139); pdf.setFont("helvetica", "normal"); pdf.setFontSize(7); pdf.text(S`Pagina ${page} de ${pages}`, right, 594, { align: "right" }); }
  pdf.save(`reporte-pagos-${activeBillingTab}-${localDateValue()}.pdf`);
}

function renderPaymentHistory() {
  const box = $("#paymentHistory");
  if (!box) return;
  const query = ($("#billingSearch")?.value || "").toLowerCase().trim();
  const dateFrom = $("#billingDateFrom")?.value || "";
  const dateTo = $("#billingDateTo")?.value || "";
  const insuranceFilter = $("#billingInsuranceFilter")?.value || "";
  const statusFilter = $("#billingStatusFilter")?.value || "";
  const recordedPayments = [...state.payments];
  const initialPayments = state.visits.flatMap((visit) => {
    const laterTotal = recordedPayments.filter((entry) => entry.visitId === visit.id).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
    const initialAmount = Math.max(0, totalPaid(visit) - laterTotal);
    if (initialAmount <= 0) return [];
    return [{ id: `initial-${visit.id}`, visitId: visit.id, patientId: visit.patientId, source: paymentType(visit) === "insurance" ? "insurance" : "patient", amount: initialAmount, method: "initial", date: visit.date, reference: "Pago inicial", note: "Registrado con la consulta", initial: true }];
  });
  const payments = [...recordedPayments, ...initialPayments].filter((entry) => {
    const p = patient(entry.patientId);
    const visit = state.visits.find((item) => item.id === entry.visitId);
    const entryDate = String(entry.date || "").slice(0, 10);
    if (dateFrom && entryDate < dateFrom) return false;
    if (dateTo && entryDate > dateTo) return false;
    if (insuranceFilter && p?.insuranceCompany !== insuranceFilter) return false;
    if (statusFilter && financialStatus(visit || {}).key !== statusFilter) return false;
    if (activeBillingTab === "cash" && paymentType(visit || {}) !== "cash") return false;
    if (activeBillingTab === "insurance" && paymentType(visit || {}) !== "insurance") return false;
    if (activeBillingTab === "pending" && balance(visit || {}) <= 0) return false;
    const searchable = `${p?.name || ""} ${p?.document || ""} ${invoiceNumber(visit || { id: entry.visitId })} ${entry.reference || ""} ${entry.note || ""} ${paymentMethodDetail(entry)}`.toLowerCase();
    return searchable.includes(query);
  }).sort((a, b) => new Date(b.date) - new Date(a.date));
  box.innerHTML = payments.length ? payments.map((entry) => {
    const p = patient(entry.patientId);
    const visit = state.visits.find((item) => item.id === entry.visitId);
    return H`<div class="payment-history-row"><div class="payment-source-icon ${entry.source}">${entry.source === "insurance" ? "S" : "$"}</div><div><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong><span>${fmtDate(entry.date)} · ${entry.initial ? T("Pago inicial") : escapeHtml(paymentMethodDetail(entry))}${entry.reference && !entry.initial ? ` · ${escapeHtml(entry.reference)}` : ""}</span><small>${escapeHtml(invoiceNumber(visit || { id: entry.visitId }))}${entry.note ? ` · ${escapeHtml(entry.note)}` : ""}</small></div><strong>${money(entry.amount)}</strong></div>`;
  }).join("") : H`<div class="empty">No hay pagos que coincidan con el cliente y las fechas seleccionadas.</div>`;
}

function paymentMethodLabel(method) {
  return T({ cash: "Efectivo", card: "Tarjeta", check: "Cheque", transfer: "Transferencia", insurance_eft: "EFT de seguro", other: "Otro" }[method] || method || "Pago");
}

function cardTypeLabel(type) {
  return T({ visa: "Visa", mastercard: "Mastercard", amex: "American Express", discover: "Discover", other: "Otra" }[type] || "Tarjeta");
}

function paymentMethodDetail(entry) {
  if (entry?.method !== "card") return paymentMethodLabel(entry?.method);
  const last4 = String(entry.cardLast4 || "").replace(/\D/g, "").slice(-4);
  return `${cardTypeLabel(entry.cardType)}${last4 ? ` •••• ${last4}` : ""}`;
}

function togglePaymentCardFields() {
  const isCard = $("#paymentMethod").value === "card";
  $("#paymentCardFields").classList.toggle("hidden", !isCard);
  $("#paymentCardType").required = isCard;
  $("#paymentCardLast4").required = isCard;
  if (!isCard) {
    $("#paymentCardType").value = "";
    $("#paymentCardLast4").value = "";
    setFieldError($("#paymentCardLast4"), $("#paymentCardLast4Error"), "");
  }
}

function renderVisitPaymentPanel(visit = null) {
  const box = $("#visitPaymentPanel");
  if (!box) return;
  if (!visit?.id) {
    box.innerHTML = H`<div class="visit-payment-unsaved"><strong>Guarda primero la consulta</strong><span>Después podrás registrar pagos en cualquier fecha y mantener aquí el historial completo.</span></div>`;
    return;
  }
  const entries = state.payments.filter((entry) => entry.visitId === visit.id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const laterPaymentsTotal = entries.reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const initialPayment = Math.max(0, totalPaid(visit) - laterPaymentsTotal);
  const currentBalance = balance(visit);
  box.innerHTML = H`
    <div class="visit-payment-summary">
      <div><small>Total facturado</small><strong>${money(visit.total)}</strong></div>
      <div><small>Total recibido</small><strong>${money(totalPaid(visit))}</strong></div>
      <div class="${currentBalance > 0 ? "pending" : "paid"}"><small>Balance pendiente</small><strong>${money(currentBalance)}</strong></div>
      <button type="button" class="btn primary" onclick="openPaymentDialog('${visit.id}')" ${currentBalance <= 0 ? "disabled" : ""}>+ Registrar otro pago</button>
    </div>
    <div class="visit-payment-history">
      ${entries.map((entry) => H`<div class="visit-payment-entry"><div><strong>${fmtDate(entry.date)}</strong><small>${escapeHtml(paymentMethodDetail(entry))}${entry.reference ? ` · ${escapeHtml(entry.reference)}` : ""}</small>${entry.note ? H`<span>${escapeHtml(entry.note)}</span>` : ""}</div><span class="badge ${entry.source === "insurance" ? "blue" : "green"}">${entry.source === "insurance" ? T("Seguro") : T("Paciente")}</span><strong>${money(entry.amount)}</strong></div>`).join("")}
      ${initialPayment > 0 ? H`<div class="visit-payment-entry initial-payment"><div><strong>${fmtDate(visit.date)}</strong><small>Pago registrado al crear la consulta</small></div><span class="badge green">Inicial</span><strong>${money(initialPayment)}</strong></div>` : ""}
      ${!entries.length && initialPayment <= 0 ? H`<div class="empty document-empty">Todavía no hay pagos registrados para esta consulta.</div>` : ""}
    </div>`;
}

function renderInvoices() {
  const table = $("#invoicesTable");
  if (!table) return;
  const query = ($("#invoiceSearch")?.value || "").toLowerCase().trim();
  const patientId = $("#invoicePatientFilter")?.value || "";
  const rows = [...state.visits]
    .filter((visit) => {
      if (patientId && visit.patientId !== patientId) return false;
      const p = patient(visit.patientId);
      const services = visitItems(visit).map((item) => item.description).join(" ");
      return `${invoiceNumber(visit)} ${p?.name || ""} ${services}`.toLowerCase().includes(query);
    })
    .sort((a, b) => new Date(b.date) - new Date(a.date));

  table.innerHTML = rows.length ? rows.map((visit) => {
    const p = patient(visit.patientId);
    const items = visitItems(visit);
    const due = balance(visit);
    return H`
      <tr>
        <td><strong>${escapeHtml(invoiceNumber(visit))}</strong></td>
        <td>${fmtDate(visit.date)}</td>
        <td><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong></td>
        <td>${items.length} concepto(s)<br><small>${escapeHtml(items.map((item) => item.description).join(", ") || T("Sin detalle"))}</small></td>
        <td>${money(visit.total)}</td>
        <td>${money(totalPaid(visit))}</td>
        <td><span class="badge ${due > 0 ? "red" : "green"}">${money(due)}</span></td>
        <td><button class="btn light invoice-view" onclick="openInvoice('${visit.id}')">Ver factura</button></td>
      </tr>
    `;
  }).join("") : H`<tr><td class="empty" colspan="8">No hay facturas registradas.</td></tr>`;
}

function renderInvoicePatientOptions() {
  const select = $("#invoicePatientFilter");
  if (!select) return;
  const selected = select.value;
  const patientIdsWithVisits = new Set(state.visits.map((visit) => visit.patientId));
  const options = state.patients
    .filter((item) => patientIdsWithVisits.has(item.id))
    .sort((a, b) => a.name.localeCompare(b.name, "es"));
  select.innerHTML = H`<option value="">Todos los clientes</option>${options.map((item) => H`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`;
  if (options.some((item) => item.id === selected)) select.value = selected;
  enablePatientSelectSearch(select, { placeholder: "Buscar cliente...", ariaLabel: "Buscar cliente para filtrar facturas" });
}

function openInvoice(id) {
  const visit = state.visits.find((item) => item.id === id);
  if (!visit) return;
  const p = patient(visit.patientId);
  const items = visitItems(visit);
  const adjustments = visitAdjustments(visit.id);
  const invoiceValue = billingVisitAmounts(visit);
  const due = balance(visit);
  const design = invoiceSettings();
  const clinicContacts = [
    design.showAddress ? state.settings.clinicAddress : "",
    design.showPhone ? state.settings.clinicPhone : "",
    design.showEmail ? state.settings.clinicEmail : ""
  ].filter(Boolean).join(" · ");
  activeInvoiceId = id;
  $("#invoiceDialogTitle").textContent = invoiceNumber(visit);
  $("#invoiceDetail").innerHTML = H`
    <article class="invoice-sheet logo-${design.logoPosition}" style="--invoice-accent:${escapeHtml(design.accent)}">
      <header>
        <div class="invoice-clinic-brand">${state.settings.clinicLogo ? H`<img src="${state.settings.clinicLogo}" alt="Logo" />` : ""}<div><h2>${escapeHtml(state.settings.clinicName || "Clinic Control")}</h2><p>${escapeHtml(clinicContacts)}</p></div></div>
        <div class="invoice-heading"><strong>FACTURA</strong><span>${escapeHtml(invoiceNumber(visit))}</span></div>
      </header>
      <div class="invoice-meta">
        <div><small>Paciente</small><strong>${escapeHtml(p?.name || T("Paciente eliminado"))}</strong><span>${escapeHtml(p?.address || T("Dirección no indicada"))}</span><span>${escapeHtml(p?.phone || "")}</span><span>${escapeHtml(payerLabel(p))}</span></div>
        <div><small>Fecha y hora</small><strong>${fmtDate(visit.date)}</strong><span>Doctor: ${escapeHtml(visit.doctor || T("Sin doctor asignado"))}</span>${design.showInsurance ? H`<span>${escapeHtml(payerLabel(p))}</span>` : ""}</div>
      </div>
      <table class="invoice-items">
        <thead><tr><th>Descripción del servicio</th><th>Cantidad</th><th>Precio</th><th>Total</th></tr></thead>
        <tbody>${items.map((item) => H`<tr><td>${escapeHtml(item.description)}</td><td>${item.quantity}</td><td>${money(item.unitPrice)}</td><td>${money(item.price)}</td></tr>`).join("")}${adjustments.filter((item) => item.type !== "refund").map((item) => H`<tr class="invoice-adjustment"><td>${item.type === "discount" ? T("Descuento") : T("Anulación de saldo")}: ${escapeHtml(item.reason)}</td><td>1</td><td>-${money(item.amount)}</td><td>-${money(item.amount)}</td></tr>`).join("")}</tbody>
      </table>
      <div class="invoice-summary">
        <div><span>Total ajustado</span><strong>${money(invoiceValue.total)}</strong></div>
        <div><span>Pagado por paciente</span><strong>${money(invoiceValue.patientPaid)}</strong></div>
        ${paymentType(visit) === "insurance" ? H`<div><span>Pagado por seguro</span><strong>${money(invoiceValue.insurancePaid)}</strong></div><div><span>Copago esperado</span><strong>${money(visit.copay)}</strong></div>` : ""}
        ${adjustmentAmount(visit.id, ["refund"]) ? H`<div><span>Reembolsos</span><strong>-${money(adjustmentAmount(visit.id, ["refund"]))}</strong></div>` : ""}
        <div class="invoice-balance"><span>Balance</span><strong>${money(due)}</strong></div>
      </div>
      ${paymentType(visit) === "insurance" ? H`<div class="invoice-claim"><div><small>Reclamación</small><strong>${escapeHtml(visit.claimNumber || T("Sin número"))}</strong></div><div><small>Estado</small><strong>${escapeHtml({draft:"Preparada",submitted:"Enviada",processing:"En proceso",paid:"Pagada",partial:"Pago parcial",rejected:"Rechazada"}[visit.claimStatus] || T("No indicado"))}</strong></div></div>` : ""}
      ${visit.notes ? H`<div class="invoice-notes"><strong>Notas</strong><p>${escapeHtml(visit.notes)}</p></div>` : ""}
      ${design.footer ? H`<footer class="invoice-footer">${escapeHtml(design.footer === "Gracias por confiar en nuestra clínica." ? T(design.footer) : design.footer)}</footer>` : ""}
    </article>`;
  $("#invoiceDialog").showModal();
}

function downloadInvoicePdf(id = activeInvoiceId) {
  const visit = state.visits.find((item) => item.id === id);
  if (!visit) return;
  if (!window.jspdf?.jsPDF) {
    toast(T("No se pudo cargar el generador de PDF."));
    return;
  }

  const p = patient(visit.patientId);
  const items = visitItems(visit);
  const design = invoiceSettings();
  const { jsPDF } = window.jspdf;
  const pdf = new jsPDF({ unit: "pt", format: "letter" });
  const left = 48;
  const right = 564;
  let y = 52;

  const accentRgb = design.accent.match(/[a-f\d]{2}/gi)?.map((part) => parseInt(part, 16)) || [15, 118, 110];
  pdf.setTextColor(...accentRgb);
  pdf.setFontSize(20);
  pdf.setFont("helvetica", "bold");
  let clinicNameX = left;
  if (design.logoPosition === "left") clinicNameX += addClinicLogoToPdf(pdf, left, 20, 46, 32);
  else if (design.logoPosition === "center") addClinicLogoToPdf(pdf, 278, 18, 46, 32);
  else addClinicLogoToPdf(pdf, 466, 18, 46, 32);
  pdf.text(state.settings.clinicName || "Clinic Control", clinicNameX, y);
  pdf.setFontSize(17);
  pdf.text(T("FACTURA"), right, y, { align: "right" });
  y += 22;
  pdf.setTextColor(80, 95, 115);
  pdf.setFontSize(10);
  pdf.setFont("helvetica", "normal");
  const pdfContacts = [design.showAddress ? state.settings.clinicAddress : "", design.showPhone ? state.settings.clinicPhone : "", design.showEmail ? state.settings.clinicEmail : ""].filter(Boolean).join(" · ");
  pdf.text(pdfContacts, left, y);
  pdf.text(invoiceNumber(visit), right, y, { align: "right" });
  y += 24;
  pdf.setDrawColor(...accentRgb);
  pdf.line(left, y, right, y);
  y += 28;

  pdf.setTextColor(23, 32, 51);
  pdf.setFont("helvetica", "bold");
  pdf.text(S`Cliente: ${p?.name || T("Paciente eliminado")}`, left, y);
  pdf.text(S`Fecha: ${fmtDate(visit.date)}`, 320, y);
  y += 17;
  pdf.setFont("helvetica", "normal");
  pdf.text(S`Teléfono: ${p?.phone || T("No indicado")}`, left, y);
  pdf.text(S`Doctor: ${visit.doctor || T("No indicado")}`, 320, y);
  y += 17;
  const patientAddressLines = pdf.splitTextToSize(S`Dirección: ${p?.address || T("No indicada")}`, 250);
  pdf.text(patientAddressLines, left, y);
  y += Math.max(17, patientAddressLines.length * 12);
  if (design.showInsurance) pdf.text(S`Responsable de pago: ${payerLabel(p)}`, left, y);
  if (design.showInsurance && p?.payerType === "insurance" && p.insuranceMemberId) pdf.text(S`ID de miembro: ${p.insuranceMemberId}`, 320, y);
  y += 32;

  pdf.setFillColor(241, 245, 249);
  pdf.rect(left, y - 14, right - left, 24, "F");
  pdf.setFont("helvetica", "bold");
  pdf.text(T("Descripción del servicio"), left + 8, y);
  pdf.text(T("Cant."), 390, y, { align: "right" });
  pdf.text(T("Precio"), 470, y, { align: "right" });
  pdf.text(T("Total"), right - 8, y, { align: "right" });
  y += 26;

  pdf.setFont("helvetica", "normal");
  items.forEach((item) => {
    const lines = pdf.splitTextToSize(item.description || T("Servicio"), 280);
    const rowHeight = Math.max(22, lines.length * 13 + 8);
    if (y + rowHeight > 700) {
      pdf.addPage();
      y = 52;
    }
    pdf.text(lines, left + 8, y);
    pdf.text(String(item.quantity || 1), 390, y, { align: "right" });
    pdf.text(money(item.unitPrice), 470, y, { align: "right" });
    pdf.text(money(item.price), right - 8, y, { align: "right" });
    y += rowHeight;
    pdf.setDrawColor(226, 232, 240);
    pdf.line(left, y - 8, right, y - 8);
  });

  y += 8;
  pdf.setFont("helvetica", "bold");
  const invoiceAdjustments = visitAdjustments(visit.id);
  if (invoiceAdjustments.length) { pdf.setFont("helvetica", "normal"); pdf.text(S`Ajustes: ${money(invoiceAdjustments.reduce((sum, item) => sum + Number(item.amount || 0), 0))}`, right, y, { align: "right" }); y += 18; pdf.setFont("helvetica", "bold"); }
  pdf.text(S`Total ajustado: ${money(effectiveVisitTotal(visit))}`, right, y, { align: "right" });
  y += 18;
  pdf.text(S`Pagado: ${money(totalPaid(visit))}`, right, y, { align: "right" });
  y += 18;
  pdf.setTextColor(balance(visit) > 0 ? 185 : 4, balance(visit) > 0 ? 28 : 120, balance(visit) > 0 ? 28 : 87);
  pdf.text(S`Balance: ${money(balance(visit))}`, right, y, { align: "right" });
  if (design.footer) {
    pdf.setTextColor(80, 95, 115);
    pdf.setFont("helvetica", "normal");
    pdf.setFontSize(9);
    pdf.text(design.footer === "Gracias por confiar en nuestra clínica." ? T(design.footer) : design.footer, 306, 750, { align: "center", maxWidth: 500 });
  }

  pdf.save(`${invoiceNumber(visit)}-${(p?.name || "cliente").replace(/[^a-z0-9áéíóúñ]+/gi, "-")}.pdf`);
}

function renderReports() {
  const now = new Date(); const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  if (!$("#reportDateFrom").value) $("#reportDateFrom").value = localDateValue(monthStart);
  if (!$("#reportDateTo").value) $("#reportDateTo").value = localDateValue(now);
  const from = $("#reportDateFrom").value; const to = $("#reportDateTo").value; const doctor = $("#reportDoctorFilter").value;
  const inRange = (value) => { const date = String(value || "").slice(0, 10); return (!from || date >= from) && (!to || date <= to); };
  const doctors = appointmentDoctors(); const doctorSelect = $("#reportDoctorFilter"); const selectedDoctor = doctorSelect.value; doctorSelect.innerHTML = H`<option value="">Todos los profesionales</option>${doctors.map((name) => H`<option value="${escapeHtml(name)}">${escapeHtml(name)}</option>`).join("")}`; doctorSelect.value = doctors.includes(selectedDoctor) ? selectedDoctor : "";
  const visits = state.visits.filter((visit) => inRange(visit.date) && (!doctor || visit.doctor === doctor)); const appointments = state.appointments.filter((item) => inRange(item.date) && (!doctor || item.doctor === doctor)); const financial = totals(visits);
  const expenses = state.expenses.filter((item) => inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0); const receipts = accountingReceipts(from, to); const profit = receipts - expenses;
  const completedAppointments = appointments.filter((item) => item.status === "completed").length; const noShows = appointments.filter((item) => item.status === "no_show").length; const cancelled = appointments.filter((item) => item.status === "cancelled").length; const attendanceBase = completedAppointments + noShows; const noShowRate = attendanceBase ? noShows / attendanceBase * 100 : 0;
  const newPatients = state.patients.filter((p) => inRange(p.createdAt)).length; const pendingForms = state.formResponses.filter((entry) => entry.status !== "completed").length; const overdueTasks = state.tasks.filter(taskIsOverdue).length;
  const aging = { "0–30 días": 0, "31–60 días": 0, "61–90 días": 0, "+90 días": 0 }; const todayTime = new Date(`${localDateValue()}T12:00:00`).getTime(); state.visits.forEach((visit) => { const due = balance(visit); if (!due) return; const age = Math.floor((todayTime - new Date(visit.date).getTime()) / 86400000); aging[age <= 30 ? "0–30 días" : age <= 60 ? "31–60 días" : age <= 90 ? "61–90 días" : "+90 días"] += due; });
  const providerRows = doctors.map((name) => { const providerVisits = visits.filter((visit) => visit.doctor === name); const providerAppointments = appointments.filter((item) => item.doctor === name); return { name, visits: providerVisits.length, billed: totals(providerVisits).billed, noShows: providerAppointments.filter((item) => item.status === "no_show").length }; }).filter((row) => row.visits || row.noShows).sort((a, b) => b.visits - a.visits);
  const monthlyRevenue = analyticsMonthlySeries(visits);
  $("#reportCard").innerHTML = H`<div class="analytics-heading"><div><h2>${escapeHtml(state.settings.clinicName || "Clinic Control")}</h2><p>${S`${from} a ${to}`}${doctor ? ` · ${escapeHtml(doctor)}` : ""}</p></div><small>Generado ${new Date().toLocaleString(ClinicI18n.locale)}</small></div><div class="analytics-kpis">${analyticsKpi(T("Consultas"), visits.length, S`${newPatients} pacientes nuevos`)}${analyticsKpi(T("Facturado"), money(financial.billed), S`Cobrado ${money(receipts)}`)}${analyticsKpi(T("Utilidad"), money(profit), S`Gastos ${money(expenses)}`, profit < 0 ? "danger" : "success")}${analyticsKpi(T("No asistió"), S`${noShowRate.toFixed(1)}%`, S`${noShows} ausencia(s)`)}${analyticsKpi(T("Pendientes"), pendingForms + overdueTasks, S`${pendingForms} formularios · ${overdueTasks} tareas`)}</div><div class="analytics-grid"><article class="analytics-card span-2"><h3>Facturación por mes</h3>${analyticsBarChart(monthlyRevenue)}</article><article class="analytics-card"><h3>Cuentas por cobrar</h3>${analyticsBarChart(Object.entries(aging).map(([label, value]) => ({ label: T(label), value })), true)}</article><article class="analytics-card"><h3>Agenda</h3><div class="analytics-stat-list"><div><span>Atendidas</span><strong>${completedAppointments}</strong></div><div><span>Canceladas</span><strong>${cancelled}</strong></div><div><span>No asistió</span><strong>${noShows}</strong></div></div></article><article class="analytics-card"><h3>Productividad por profesional</h3>${providerRows.length ? H`<div class="analytics-table">${providerRows.map((row) => H`<div><span>${escapeHtml(row.name)}</span><strong>${row.visits} consultas</strong><small>${money(row.billed)} · ${row.noShows} ausencias</small></div>`).join("")}</div>` : H`<div class="empty">Sin actividad profesional.</div>`}</article></div>`;
}

function analyticsKpi(label, value, hint, tone = "") { return H`<div class="analytics-kpi ${tone}"><small>${label}</small><strong>${value}</strong><span>${hint}</span></div>`; }
function analyticsMonthlySeries(visits) { const months = new Map(); visits.forEach((visit) => { const key = String(visit.date).slice(0, 7); months.set(key, (months.get(key) || 0) + effectiveVisitTotal(visit)); }); return [...months.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([label, value]) => ({ label, value })); }
function analyticsBarChart(rows, currency = false) { const max = Math.max(...rows.map((row) => Number(row.value || 0)), 1); return rows.length ? H`<div class="analytics-bars">${rows.map((row) => H`<div><span>${escapeHtml(row.label)}</span><i><b style="width:${Math.max(2, Number(row.value || 0) / max * 100)}%"></b></i><strong>${currency ? money(row.value) : money(row.value)}</strong></div>`).join("")}</div>` : H`<div class="empty">Sin datos para este período.</div>`; }

function exportAnalyticsCsv() {
  const from = $("#reportDateFrom").value; const to = $("#reportDateTo").value; const doctor = $("#reportDoctorFilter").value; const rows = [["Fecha", "Paciente", "Profesional", "Servicio", "Facturado", "Pagado", "Balance"].map(T)];
  state.visits.filter((visit) => { const date = String(visit.date).slice(0, 10); return (!from || date >= from) && (!to || date <= to) && (!doctor || visit.doctor === doctor); }).forEach((visit) => rows.push([visit.date, patient(visit.patientId)?.name || "", visit.doctor || "", visit.reason || "", effectiveVisitTotal(visit), totalPaid(visit), balance(visit)]));
  const csv = rows.map((row) => row.map((value) => `"${String(value ?? "").replaceAll('"', '""')}"`).join(",")).join("\r\n"); const blob = new Blob(["\ufeff", csv], { type: "text/csv;charset=utf-8" }); const url = URL.createObjectURL(blob); const link = document.createElement("a"); link.href = url; link.download = `clinic-control-analytics-${from || "inicio"}-${to || "hoy"}.csv`; link.click(); URL.revokeObjectURL(url);
}

const formCategoryLabels = ClinicI18n.labels({ intake: "Admisión", medical: "Historial clínico", consent: "Consentimiento", followup: "Seguimiento", other: "Otro" });
const communicationChannelLabels = ClinicI18n.labels({ phone: "Llamada", email: "Correo", sms: "SMS", whatsapp: "WhatsApp", in_person: "En persona" });
const communicationIcons = { phone: "☎", email: "✉", sms: "▣", whatsapp: "◉", in_person: "●" };

function renderFormTemplates() {
  const box = $("#formTemplatesList"); if (!box) return;
  box.innerHTML = state.formTemplates.length ? state.formTemplates.map((template) => H`<div class="form-template-row"><span><strong>${escapeHtml(template.name)}</strong><small>${formCategoryLabels[template.category] || T("Formulario")} · ${(template.questions || []).length} pregunta(s)</small></span><button class="btn light" type="button" onclick="openFormTemplateDialog('${template.id}')">Editar</button><button class="btn light" type="button" onclick="deleteFormTemplate('${template.id}')">Eliminar</button></div>`).join("") : H`<div class="empty">Todavía no hay plantillas digitales.</div>`;
}

function openFormTemplateDialog(id = "") {
  const template = state.formTemplates.find((item) => item.id === id);
  $("#formTemplateId").value = template?.id || ""; $("#formTemplateName").value = template?.name || ""; $("#formTemplateCategory").value = template?.category || "intake"; $("#formTemplateDescription").value = template?.description || ""; $("#formQuestionsBuilder").innerHTML = "";
  (template?.questions?.length ? template.questions : [{ id: uid(), label: "", type: "text", required: false }]).forEach(addFormQuestionRow);
  $("#formTemplateDialog").showModal();
}

function addFormQuestionRow(question = {}) {
  const row = document.createElement("div"); row.className = "form-question-row"; row.dataset.questionId = question.id || uid();
  row.innerHTML = H`<input class="question-label" placeholder="Escribe la pregunta" value="${escapeHtml(question.label || "")}" /><select class="question-type"><option value="text" ${question.type === "text" ? "selected" : ""}>Texto corto</option><option value="textarea" ${question.type === "textarea" ? "selected" : ""}>Texto largo</option><option value="yesno" ${question.type === "yesno" ? "selected" : ""}>Sí / No</option><option value="date" ${question.type === "date" ? "selected" : ""}>Fecha</option><option value="number" ${question.type === "number" ? "selected" : ""}>Número</option></select><label><input class="question-required" type="checkbox" ${question.required ? "checked" : ""} /> Obligatoria</label><button type="button" class="icon-btn" title="Eliminar pregunta" onclick="this.closest('.form-question-row').remove()">⌫</button>`;
  $("#formQuestionsBuilder").append(row);
}

async function saveFormTemplateFromDialog() {
  const id = $("#formTemplateId").value || uid();
  const questions = Array.from($$("#formQuestionsBuilder .form-question-row")).map((row) => ({ id: row.dataset.questionId, label: row.querySelector(".question-label").value.trim(), type: row.querySelector(".question-type").value, required: row.querySelector(".question-required").checked })).filter((question) => question.label);
  if (!$("#formTemplateName").value.trim() || !questions.length) return toast(T("Agrega un nombre y por lo menos una pregunta."));
  const existing = state.formTemplates.find((item) => item.id === id);
  const data = { id, name: $("#formTemplateName").value.trim(), category: $("#formTemplateCategory").value, description: $("#formTemplateDescription").value.trim(), questions, createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: existing?.createdBy || auth.currentUser.uid };
  await getCollectionRef("formTemplates").doc(id).set(data, { merge: true });
  state.formTemplates = [...state.formTemplates.filter((item) => item.id !== id), data];
  recordActivity({ action: existing ? "updated" : "created", entityType: "form", entityId: id, title: existing ? "Plantilla actualizada" : "Plantilla creada", detail: data.name }).catch(console.error);
  $("#formTemplateDialog").close(); toast(T("Plantilla guardada.")); if (pendingRoomIpadId) { const roomId = pendingRoomIpadId; pendingRoomIpadId = null; openIpadLaunch(roomId); }
}

async function deleteFormTemplate(id) {
  const template = state.formTemplates.find((item) => item.id === id);
  if (!template || !confirm(S`¿Eliminar la plantilla ${template.name}? Las respuestas ya guardadas se conservarán.`)) return;
  await getCollectionRef("formTemplates").doc(id).delete();
  recordActivity({ action: "deleted", entityType: "form", entityId: id, title: "Plantilla eliminada", detail: template.name }).catch(console.error); toast(T("Plantilla eliminada."));
}

function assignDigitalForm(patientId) {
  if (!state.formTemplates.length) return toast(T("Crea primero una plantilla desde Ajustes."));
  activePatientFormResponseId = null; $("#patientDigitalForm").dataset.mode = "assign"; $("#patientFormTitle").textContent = T("Asignar formulario");
  $("#patientFormBody").innerHTML = H`<div class="form-assignment-list">${state.formTemplates.map((template) => H`<button type="button" onclick="createPatientFormResponse('${template.id}','${patientId}')"><strong>${escapeHtml(template.name)}</strong><small>${formCategoryLabels[template.category] || T("Formulario")} · ${(template.questions || []).length} preguntas</small></button>`).join("")}</div>`;
  $("#patientDigitalForm button[type='submit']").classList.add("hidden"); $("#patientFormDialog").showModal();
}

async function createPatientFormResponse(templateId, patientId) {
  const template = state.formTemplates.find((item) => item.id === templateId); if (!template) return;
  const id = uid(); const response = { id, templateId, templateName: template.name, category: template.category, description: template.description || "", questions: template.questions || [], answers: {}, patientId, status: "pending", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: auth.currentUser.uid };
  await getCollectionRef("formResponses").doc(id).set(response); recordActivity({ action: "assigned", entityType: "form", entityId: id, patientId, title: "Formulario asignado", detail: template.name }).catch(console.error); state.formResponses.push(response); openPatientDigitalForm(id);
}

function openPatientDigitalForm(id) {
  const response = state.formResponses.find((item) => item.id === id); if (!response) return;
  activePatientFormResponseId = id; $("#patientDigitalForm").dataset.mode = "response"; $("#patientDigitalForm button[type='submit']").classList.remove("hidden"); $("#patientFormTitle").textContent = response.templateName || T("Formulario");
  $("#patientFormBody").innerHTML = H`${response.description ? H`<p class="digital-form-description">${escapeHtml(response.description)}</p>` : ""}<div class="digital-question-list">${(response.questions || []).map((question, index) => digitalQuestionHtml(question, response.answers?.[question.id] || "", index)).join("")}</div>`;
  if (!$("#patientFormDialog").open) $("#patientFormDialog").showModal();
}

function digitalQuestionHtml(question, value, index) {
  const label = H`<span>${index + 1}. ${escapeHtml(question.label)}${question.required ? " *" : ""}</span>`;
  if (question.type === "textarea") return H`<label class="digital-question">${label}<textarea data-answer-id="${question.id}" rows="3">${escapeHtml(value)}</textarea></label>`;
  if (question.type === "yesno") return H`<label class="digital-question">${label}<select data-answer-id="${question.id}"><option value="">Seleccionar</option><option value="Sí" ${value === "Sí" ? "selected" : ""}>Sí</option><option value="No" ${value === "No" ? "selected" : ""}>No</option></select></label>`;
  return H`<label class="digital-question">${label}<input data-answer-id="${question.id}" type="${question.type === "date" ? "date" : question.type === "number" ? "number" : "text"}" value="${escapeHtml(value)}" /></label>`;
}

async function savePatientDigitalForm() {
  const response = state.formResponses.find((item) => item.id === activePatientFormResponseId); if (!response) return;
  const answers = Object.fromEntries(Array.from($$("#patientFormBody [data-answer-id]")).map((input) => [input.dataset.answerId, input.value.trim()]));
  const complete = (response.questions || []).filter((question) => question.required).every((question) => answers[question.id]);
  const data = { answers, status: complete ? "completed" : "pending", updatedAt: new Date().toISOString(), completedAt: complete ? new Date().toISOString() : null, completedBy: complete ? auth.currentUser.uid : null };
  await getCollectionRef("formResponses").doc(response.id).set(data, { merge: true }); recordActivity({ action: complete ? "completed" : "updated", entityType: "form", entityId: response.id, patientId: response.patientId, title: complete ? "Formulario completado" : "Formulario guardado", detail: response.templateName }).catch(console.error); $("#patientFormDialog").close(); toast(complete ? T("Formulario completado.") : T("Respuestas guardadas; faltan campos obligatorios."));
}

function openCommunicationDialog(patientId) {
  const p = patient(patientId); if (!p) return;
  $("#communicationPatientId").value = patientId; $("#communicationPatientName").textContent = p.name; $("#communicationChannel").value = "phone"; $("#communicationDirection").value = "outbound"; $("#communicationSubject").value = ""; $("#communicationNotes").value = ""; $("#communicationFollowUp").value = ""; $("#communicationDialog").showModal();
}

async function saveCommunication() {
  const patientId = $("#communicationPatientId").value;
  const data = { id: uid(), patientId, channel: $("#communicationChannel").value, direction: $("#communicationDirection").value, subject: $("#communicationSubject").value.trim(), notes: $("#communicationNotes").value.trim(), followUpAt: $("#communicationFollowUp").value, createdAt: new Date().toISOString(), userId: auth.currentUser.uid, userEmail: auth.currentUser.email || "" };
  await getCollectionRef("communications").doc(data.id).set(data);
  if (data.followUpAt) await saveTask({ id: uid(), title: `Seguimiento: ${data.subject}`, patientId, type: "follow_up", dueDate: data.followUpAt, priority: "normal", description: data.notes, status: "open", createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid, updatedAt: new Date().toISOString() });
  recordActivity({ action: "logged", entityType: "communication", entityId: data.id, patientId, title: "Comunicación registrada", detail: `${communicationChannelLabels[data.channel]} · ${data.subject}` }).catch(console.error); $("#communicationDialog").close(); toast(T("Comunicación registrada."));
}

function communicationActionHtml(entry, p) {
  const subject = encodeURIComponent(entry.subject || ""); const body = encodeURIComponent(entry.notes || "");
  if (entry.channel === "email" && p.email) return H`<a class="btn light" href="mailto:${escapeHtml(p.email)}?subject=${subject}&body=${body}">Abrir correo</a>`;
  const digits = String(p.phone || "").replace(/\D/g, "");
  if (entry.channel === "whatsapp" && digits) return H`<a class="btn light" href="https://wa.me/${digits.length === 10 ? `1${digits}` : digits}?text=${body}" target="_blank" rel="noopener">Abrir WhatsApp</a>`;
  if (entry.channel === "sms" && digits) return H`<a class="btn light" href="sms:${digits}?body=${body}">Abrir SMS</a>`;
  return "";
}

const leadStages = ClinicI18n.labels({ new: "Nuevos", contacted: "Contactados", scheduled: "Cita programada", won: "Convertidos", lost: "Perdidos" });

function crmOwners() {
  const owner = { id: activeClinicId, name: "Propietario" };
  return [owner, ...state.teamMembers.filter((member) => member.status !== "disabled").map((member) => ({ id: member.id, name: member.name || member.email }))].filter((item, index, list) => list.findIndex((other) => other.id === item.id) === index);
}

function renderCrm() {
  const pipeline = $("#crmPipeline"); if (!pipeline) return;
  const query = ($("#leadSearch")?.value || "").toLowerCase().trim(); const source = $("#leadSourceFilter")?.value || ""; const owner = $("#leadOwnerFilter")?.value || "";
  const rows = state.leads.filter((lead) => (!query || `${lead.name} ${lead.phone} ${lead.email} ${lead.interest} ${lead.notes}`.toLowerCase().includes(query)) && (!source || lead.source === source) && (!owner || lead.ownerId === owner));
  const won = state.leads.filter((lead) => lead.stage === "won"); const open = state.leads.filter((lead) => !["won", "lost"].includes(lead.stage)); const pipelineValue = open.reduce((sum, lead) => sum + Number(lead.estimatedValue || 0), 0); const conversion = state.leads.length ? (won.length / state.leads.length) * 100 : 0;
  $("#crmMetrics").innerHTML = H`<div><small>Prospectos abiertos</small><strong>${open.length}</strong></div><div><small>Valor del embudo</small><strong>${money(pipelineValue)}</strong></div><div><small>Convertidos</small><strong>${won.length}</strong></div><div><small>Conversión</small><strong>${conversion.toFixed(1)}%</strong></div>`;
  pipeline.innerHTML = Object.entries(leadStages).map(([stage, label]) => { const stageRows = rows.filter((lead) => lead.stage === stage).sort((a, b) => new Date(b.updatedAt || b.createdAt) - new Date(a.updatedAt || a.createdAt)); return H`<section class="pipeline-column stage-${stage}"><header><strong>${label}</strong><span>${stageRows.length}</span></header><div>${stageRows.map(leadCardHtml).join("") || H`<p class="pipeline-empty">Sin prospectos</p>`}</div></section>`; }).join("");
  const ownerSelect = $("#leadOwnerFilter"); if (ownerSelect) { const selected = ownerSelect.value; ownerSelect.innerHTML = H`<option value="">Todos los responsables</option>${crmOwners().map((item) => H`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`; ownerSelect.value = selected; }
  renderCampaigns();
}

function leadCardHtml(lead) {
  const campaign = state.campaigns.find((item) => item.id === lead.campaignId); const followUpOverdue = lead.nextFollowUp && new Date(lead.nextFollowUp) < new Date() && !["won", "lost"].includes(lead.stage);
  return H`<article class="lead-card ${followUpOverdue ? "followup-overdue" : ""}"><div class="lead-card-head"><button onclick="openLeadDialog('${lead.id}')">${escapeHtml(lead.name)}</button><strong>${money(lead.estimatedValue)}</strong></div><p>${escapeHtml(lead.interest || T("Interés no indicado"))}</p><small>${escapeHtml(lead.source || T("Sin fuente"))}${campaign ? ` · ${escapeHtml(campaign.name)}` : ""}</small>${lead.nextFollowUp ? H`<small class="lead-followup">${followUpOverdue ? "⚠ " : ""}Próximo: ${fmtDate(lead.nextFollowUp)}</small>` : ""}<div class="lead-actions"><select aria-label="Etapa" onchange="moveLead('${lead.id}',this.value)">${Object.entries(leadStages).map(([value, label]) => H`<option value="${value}" ${lead.stage === value ? "selected" : ""}>${label}</option>`).join("")}</select>${lead.stage !== "won" ? H`<button class="btn light" onclick="convertLead('${lead.id}')">Convertir</button>` : lead.patientId ? H`<button class="btn light" onclick="openPatientRecord('${lead.patientId}')">Paciente</button>` : ""}</div></article>`;
}

function openLeadDialog(id = "") {
  const lead = state.leads.find((item) => item.id === id); $("#leadDialogTitle").textContent = lead ? T("Editar prospecto") : T("Nuevo prospecto"); $("#leadId").value = lead?.id || ""; $("#leadName").value = lead?.name || ""; $("#leadPhone").value = lead?.phone || ""; $("#leadEmail").value = lead?.email || ""; $("#leadSource").value = lead?.source || "Google"; $("#leadStage").value = lead?.stage || "new"; $("#leadInterest").value = lead?.interest || ""; $("#leadValue").value = lead?.estimatedValue || ""; $("#leadNextFollowUp").value = lead?.nextFollowUp || ""; $("#leadNotes").value = lead?.notes || "";
  $("#leadOwner").innerHTML = crmOwners().map((item) => H`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join(""); $("#leadOwner").value = lead?.ownerId || auth.currentUser.uid;
  $("#leadCampaign").innerHTML = H`<option value="">Sin campaña</option>${state.campaigns.map((item) => H`<option value="${item.id}">${escapeHtml(item.name)}</option>`).join("")}`; $("#leadCampaign").value = lead?.campaignId || ""; $("#leadDialog").showModal();
}

async function saveLead() {
  const id = $("#leadId").value || uid(); const existing = state.leads.find((item) => item.id === id);
  const data = { id, name: $("#leadName").value.trim(), phone: $("#leadPhone").value.trim(), email: $("#leadEmail").value.trim().toLowerCase(), source: $("#leadSource").value, stage: $("#leadStage").value, ownerId: $("#leadOwner").value, campaignId: $("#leadCampaign").value, interest: $("#leadInterest").value.trim(), estimatedValue: Number($("#leadValue").value || 0), nextFollowUp: $("#leadNextFollowUp").value, notes: $("#leadNotes").value.trim(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: existing?.createdBy || auth.currentUser.uid, patientId: existing?.patientId || "" };
  await getCollectionRef("leads").doc(id).set(data, { merge: true });
  if (data.nextFollowUp && data.nextFollowUp !== existing?.nextFollowUp) await saveTask({ id: uid(), title: `Contactar prospecto: ${data.name}`, patientId: "", type: "follow_up", dueDate: data.nextFollowUp, priority: "normal", description: `${data.interest}${data.phone ? ` · ${data.phone}` : ""}`, status: "open", createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid, updatedAt: new Date().toISOString(), leadId: id });
  recordActivity({ action: existing ? "updated" : "created", entityType: "lead", entityId: id, title: existing ? "Prospecto actualizado" : "Prospecto creado", detail: `${data.name} · ${leadStages[data.stage]}` }).catch(console.error); $("#leadDialog").close(); toast(T("Prospecto guardado."));
}

async function moveLead(id, stage) {
  const lead = state.leads.find((item) => item.id === id); if (!lead) return;
  await getCollectionRef("leads").doc(id).set({ stage, updatedAt: new Date().toISOString(), stageChangedAt: new Date().toISOString() }, { merge: true }); recordActivity({ action: "stage_changed", entityType: "lead", entityId: id, title: "Etapa de prospecto actualizada", detail: `${lead.name} · ${leadStages[stage]}` }).catch(console.error); toast(T("Etapa actualizada."));
}

async function convertLead(id) {
  const lead = state.leads.find((item) => item.id === id); if (!lead || !confirm(S`¿Convertir a ${lead.name} en paciente?`)) return;
  const patientId = lead.patientId || uid();
  if (!lead.patientId) await savePatient({ id: patientId, name: lead.name, phone: lead.phone || "", email: lead.email || "", age: "", birthDate: "", language: "Español", payerType: "self_pay", insuranceCompany: "", insuranceMemberId: "", insuranceGroup: "", emailNotificationsEnabled: false, smsNotificationsEnabled: false, birthdayEmailEnabled: false, document: "", notes: lead.notes || "", source: lead.source || "", lifecycle: "new", patientAlertMessage: "", patientAlertDate: "", patientAlertActive: false, createdAt: new Date().toISOString(), leadId: id });
  await getCollectionRef("leads").doc(id).set({ stage: "won", patientId, convertedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }, { merge: true }); recordActivity({ action: "converted", entityType: "lead", entityId: id, patientId, title: "Prospecto convertido en paciente", detail: lead.name }).catch(console.error); toast(T("Prospecto convertido en paciente."));
}

function renderCampaigns() {
  const box = $("#campaignList"); if (!box) return;
  box.innerHTML = state.campaigns.length ? state.campaigns.map((campaign) => { const leads = state.leads.filter((lead) => lead.campaignId === campaign.id); const won = leads.filter((lead) => lead.stage === "won"); const cost = Number(campaign.budget || 0); return H`<article class="campaign-card"><div><span class="badge ${campaign.status === "active" ? "green" : "blue"}">${campaign.status === "active" ? T("Activa") : campaign.status === "completed" ? T("Finalizada") : campaign.status === "paused" ? T("Pausada") : T("Planificada")}</span><h4>${escapeHtml(campaign.name)}</h4><small>${escapeHtml(campaign.channel)} · ${campaign.startDate || T("Sin inicio")}</small></div><div><small>Prospectos</small><strong>${leads.length}</strong></div><div><small>Convertidos</small><strong>${won.length}</strong></div><div><small>Costo / conversión</small><strong>${won.length ? money(cost / won.length) : "—"}</strong></div><button class="btn light" onclick="openCampaignDialog('${campaign.id}')">Editar</button></article>`; }).join("") : H`<div class="empty">No hay campañas registradas.</div>`;
}

function openCampaignDialog(id = "") {
  const campaign = state.campaigns.find((item) => item.id === id); $("#campaignDialogTitle").textContent = campaign ? T("Editar campaña") : T("Nueva campaña"); $("#campaignId").value = campaign?.id || ""; $("#campaignName").value = campaign?.name || ""; $("#campaignChannel").value = campaign?.channel || "Google"; $("#campaignStatus").value = campaign?.status || "planned"; $("#campaignStart").value = campaign?.startDate || ""; $("#campaignEnd").value = campaign?.endDate || ""; $("#campaignBudget").value = campaign?.budget || ""; $("#campaignNotes").value = campaign?.notes || ""; $("#campaignDialog").showModal();
}

async function saveCampaign() {
  const id = $("#campaignId").value || uid(); const existing = state.campaigns.find((item) => item.id === id); const data = { id, name: $("#campaignName").value.trim(), channel: $("#campaignChannel").value, status: $("#campaignStatus").value, startDate: $("#campaignStart").value, endDate: $("#campaignEnd").value, budget: Number($("#campaignBudget").value || 0), notes: $("#campaignNotes").value.trim(), createdAt: existing?.createdAt || new Date().toISOString(), updatedAt: new Date().toISOString(), createdBy: existing?.createdBy || auth.currentUser.uid };
  await getCollectionRef("campaigns").doc(id).set(data, { merge: true }); recordActivity({ action: existing ? "updated" : "created", entityType: "campaign", entityId: id, title: existing ? "Campaña actualizada" : "Campaña creada", detail: data.name }).catch(console.error); $("#campaignDialog").close(); toast(T("Campaña guardada."));
}

function accountingReceipts(dateFrom = "", dateTo = "", method = "") {
  const inRange = (value) => { const date = String(value || "").slice(0, 10); return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); };
  const later = state.payments.filter((entry) => inRange(entry.date) && (!method || entry.method === method)).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  const initial = state.visits.filter((visit) => inRange(visit.date)).reduce((sum, visit) => {
    if (method && method !== "cash") return sum;
    const relatedLater = state.payments.filter((entry) => entry.visitId === visit.id).reduce((value, entry) => value + Number(entry.amount || 0), 0);
    const rawPaid = visit.patientPaid !== undefined || visit.insurancePaid !== undefined
      ? Number(visit.patientPaid || 0) + Number(visit.insurancePaid || 0)
      : Number(visit.paid || 0);
    if (method === "cash" && paymentType(visit) !== "cash") return sum;
    return sum + Math.max(0, rawPaid - relatedLater);
  }, 0);
  const refunds = state.adjustments.filter((entry) => entry.type === "refund" && inRange(entry.date) && (!method || (method === "cash" && paymentType(state.visits.find((visit) => visit.id === entry.visitId) || {}) === "cash"))).reduce((sum, entry) => sum + Number(entry.amount || 0), 0);
  return Math.max(0, later + initial - refunds);
}

function renderAdvancedAccounting() {
  const summary = $("#profitabilitySummary"); if (!summary) return;
  const dateFrom = $("#billingDateFrom")?.value || ""; const dateTo = $("#billingDateTo")?.value || ""; const inRange = (value) => { const date = String(value || "").slice(0, 10); return (!dateFrom || date >= dateFrom) && (!dateTo || date <= dateTo); };
  const revenue = accountingReceipts(dateFrom, dateTo); const expenses = state.expenses.filter((item) => inRange(item.date)).reduce((sum, item) => sum + Number(item.amount || 0), 0); const profit = revenue - expenses; const margin = revenue ? (profit / revenue) * 100 : 0;
  summary.innerHTML = H`<div><small>Ingresos cobrados</small><strong>${money(revenue)}</strong></div><div><small>Gastos</small><strong>${money(expenses)}</strong></div><div class="${profit < 0 ? "negative" : "positive"}"><small>Utilidad neta</small><strong>${money(profit)}</strong></div><div><small>Margen</small><strong>${margin.toFixed(1)}%</strong></div>`;
  $("#expenseList").innerHTML = state.expenses.filter((item) => inRange(item.date)).sort((a, b) => new Date(b.date) - new Date(a.date)).map((item) => H`<div><span><strong>${escapeHtml(item.vendor)}</strong><small>${fmtDate(item.date)} · ${escapeHtml(item.category)} · ${escapeHtml(item.method)}</small></span><strong>${money(item.amount)}</strong><button class="icon-btn" onclick="deleteExpense('${item.id}')">⌫</button></div>`).join("") || H`<div class="empty">No hay gastos en este período.</div>`;
  $("#cashClosingList").innerHTML = state.cashClosings.sort((a, b) => String(b.date).localeCompare(String(a.date))).slice(0, 20).map((item) => H`<div><span><strong>${new Date(`${item.date}T12:00:00`).toLocaleDateString(ClinicI18n.locale)}</strong><small>Esperado ${money(item.expected)} · Contado ${money(item.counted)}</small></span><strong class="${Number(item.difference) ? "accounting-difference" : ""}">${money(item.difference)}</strong></div>`).join("") || H`<div class="empty">No hay cierres registrados.</div>`;
}

function openExpenseDialog() { $("#expenseId").value = ""; $("#expenseDate").value = localDateTimeValue(new Date()); $("#expenseCategory").value = "Insumos médicos"; $("#expenseVendor").value = ""; $("#expenseAmount").value = ""; $("#expenseMethod").value = "card"; $("#expenseReference").value = ""; $("#expenseNotes").value = ""; $("#expenseDialog").showModal(); }
async function saveExpense() { const id = $("#expenseId").value || uid(); const data = { id, date: $("#expenseDate").value, category: $("#expenseCategory").value, vendor: $("#expenseVendor").value.trim(), amount: Number($("#expenseAmount").value || 0), method: $("#expenseMethod").value, reference: $("#expenseReference").value.trim(), notes: $("#expenseNotes").value.trim(), createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid }; await getCollectionRef("expenses").doc(id).set(data, { merge: true }); recordActivity({ action: "created", entityType: "expense", entityId: id, title: "Gasto registrado", detail: `${data.vendor} · ${money(data.amount)}` }).catch(console.error); $("#expenseDialog").close(); toast(T("Gasto registrado.")); }
async function deleteExpense(id) { const item = state.expenses.find((entry) => entry.id === id); if (!item || !confirm(S`¿Eliminar el gasto de ${item.vendor}?`)) return; await getCollectionRef("expenses").doc(id).delete(); recordActivity({ action: "deleted", entityType: "expense", entityId: id, title: "Gasto eliminado", detail: `${item.vendor} · ${money(item.amount)}` }).catch(console.error); toast(T("Gasto eliminado.")); }

function openAdjustmentDialog(visitId) { const visit = state.visits.find((item) => item.id === visitId); if (!visit) return; const p = patient(visit.patientId); $("#adjustmentVisitId").value = visitId; $("#adjustmentTitle").textContent = invoiceNumber(visit); $("#adjustmentContext").innerHTML = H`<div><small>Paciente</small><strong>${escapeHtml(p?.name || T("Paciente"))}</strong></div><div><small>Balance</small><strong>${money(balance(visit))}</strong></div><div><small>Pagado neto</small><strong>${money(totalPaid(visit))}</strong></div>`; $("#adjustmentType").value = "discount"; $("#adjustmentAmount").value = ""; $("#adjustmentReason").value = ""; $("#adjustmentNotes").value = ""; $("#adjustmentDialog").showModal(); }
async function saveAdjustment() { const visit = state.visits.find((item) => item.id === $("#adjustmentVisitId").value); if (!visit) return; const type = $("#adjustmentType").value; const amount = Number($("#adjustmentAmount").value || 0); if (amount <= 0) return toast(T("Indica un monto válido.")); if (["discount", "writeoff"].includes(type) && amount > balance(visit)) return toast(T("El ajuste no puede superar el balance.")); if (type === "refund" && amount > totalPaid(visit)) return toast(T("El reembolso no puede superar lo pagado.")); const id = uid(); const data = { id, visitId: visit.id, patientId: visit.patientId, type, amount, reason: $("#adjustmentReason").value.trim(), notes: $("#adjustmentNotes").value.trim(), date: new Date().toISOString(), createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid }; await getCollectionRef("adjustments").doc(id).set(data); recordActivity({ action: "created", entityType: "adjustment", entityId: id, patientId: visit.patientId, visitId: visit.id, title: type === "refund" ? "Reembolso registrado" : type === "writeoff" ? "Saldo anulado" : "Descuento aplicado", detail: `${money(amount)} · ${data.reason}` }).catch(console.error); $("#adjustmentDialog").close(); toast(T("Ajuste aplicado.")); }

function expectedCashForDate(date) { const cashReceipts = accountingReceipts(date, date, "cash"); const cashExpenses = state.expenses.filter((item) => String(item.date).slice(0, 10) === date && item.method === "cash").reduce((sum, item) => sum + Number(item.amount || 0), 0); return cashReceipts - cashExpenses; }
function updateCashClosingDifference() { const expected = expectedCashForDate($("#cashClosingDate").value); const counted = Number($("#cashCounted").value || 0); $("#cashExpected").value = expected.toFixed(2); $("#cashDifference").value = (counted - expected).toFixed(2); }
function openCashClosingDialog() { $("#cashClosingDate").value = localDateValue(); $("#cashCounted").value = ""; $("#cashClosingNotes").value = ""; updateCashClosingDifference(); $("#cashClosingDialog").showModal(); }
async function saveCashClosing() { const date = $("#cashClosingDate").value; const id = date; const data = { id, date, expected: Number($("#cashExpected").value || 0), counted: Number($("#cashCounted").value || 0), difference: Number($("#cashDifference").value || 0), notes: $("#cashClosingNotes").value.trim(), closedAt: new Date().toISOString(), closedBy: auth.currentUser.uid }; await getCollectionRef("cashClosings").doc(id).set(data, { merge: true }); recordActivity({ action: "closed", entityType: "cash", entityId: id, title: "Cierre de caja registrado", detail: `${date} · Diferencia ${money(data.difference)}` }).catch(console.error); $("#cashClosingDialog").close(); toast(T("Cierre de caja guardado.")); }

function renderSettings() {
  const clinicName = state.settings.clinicName || "Clinic Control";
  $("#clinicBrandName").textContent = clinicName;
  $("#clinicBrandLogo").classList.toggle("has-clinic-logo", Boolean(state.settings.clinicLogo));
  $("#clinicBrandLogo").innerHTML = state.settings.clinicLogo ? H`<img src="${state.settings.clinicLogo}" alt="" />` : H`<span></span>`;
  $("#heroClinicTitle").textContent = state.settings.clinicName
    ? S`Control diario de ${state.settings.clinicName}`
    : T("Control diario de la clínica");
  document.title = S`${clinicName} · Clinic Control`;
  $("#clinicName").value = state.settings.clinicName || "";
  $("#clinicAddress").value = state.settings.clinicAddress || "";
  $("#clinicPhone").value = state.settings.clinicPhone || "";
  $("#clinicEmail").value = state.settings.clinicEmail || "";
  $("#invoicePrefix").value = state.settings.invoicePrefix || "FAC";
  $("#invoiceAccentColor").value = state.settings.invoiceAccentColor || "#0f766e";
  $("#invoiceLogoPosition").value = state.settings.invoiceLogoPosition || "left";
  $("#invoiceFooter").value = state.settings.invoiceFooter ?? "Gracias por confiar en nuestra clínica.";
  $("#invoiceShowAddress").checked = state.settings.invoiceShowAddress !== false;
  $("#invoiceShowPhone").checked = state.settings.invoiceShowPhone !== false;
  $("#invoiceShowEmail").checked = state.settings.invoiceShowEmail !== false;
  $("#invoiceShowDoctor").checked = state.settings.invoiceShowDoctor !== false;
  $("#invoiceShowInsurance").checked = state.settings.invoiceShowInsurance !== false;
  $("#scheduleOpenTime").value = state.settings.scheduleOpenTime || "08:00";
  $("#scheduleCloseTime").value = state.settings.scheduleCloseTime || "18:00";
  $("#scheduleBuffer").value = String(state.settings.scheduleBuffer || 0);
  const scheduleDays = state.settings.scheduleDays || [1, 2, 3, 4, 5];
  $$('[data-schedule-day]').forEach((input) => { input.checked = scheduleDays.includes(Number(input.dataset.scheduleDay)); });
  $("#clinicLogoPreview").innerHTML = state.settings.clinicLogo
    ? H`<img src="${state.settings.clinicLogo}" alt="Logo de la clínica" />`
    : H`<span>Sin logo</span>`;
  renderInvoiceStylePreview();
  renderDoctorSettings();
  renderAppointmentDoctorOptions();
  renderClinicDocuments();
  renderAuditLogPreview();
  renderTeamMembers();
  renderFormTemplates();
  applyRoleAccess();
}

function renderDoctorSettings() {
  const container = $("#doctorSettingsList");
  if (!container) return;
  const doctors = [...new Set((state.settings.doctors || []).map((name) => String(name).trim()).filter(Boolean))]
    .sort((a, b) => a.localeCompare(b, "es"));
  state.settings.doctors = doctors;
  container.innerHTML = doctors.length
    ? doctors.map((name) => H`<div class="doctor-setting-row"><span>${escapeHtml(name)}</span><button class="icon-btn" type="button" data-remove-doctor="${escapeHtml(name)}" title="Quitar médico">⌫</button></div>`).join("")
    : H`<div class="empty">Todavía no hay médicos configurados.</div>`;
}

function addConfiguredDoctor() {
  const input = $("#doctorNameInput");
  const name = input.value.trim();
  if (!name) return toast(T("Escribe el nombre del médico."));
  const doctors = state.settings.doctors || [];
  if (doctors.some((item) => item.toLowerCase() === name.toLowerCase())) return toast(T("Este médico ya está en la lista."));
  state.settings.doctors = [...doctors, name];
  input.value = "";
  renderDoctorSettings();
  renderAppointmentDoctorOptions();
  toast(T("Médico agregado. Guarda los cambios para confirmar."));
}

function removeConfiguredDoctor(name) {
  state.settings.doctors = (state.settings.doctors || []).filter((item) => item !== name);
  renderDoctorSettings();
  renderAppointmentDoctorOptions();
}

function renderTeamMembers() {
  const container = $("#teamMembersList");
  if (!container) return;
  if (currentAccess.role !== "admin") {
    container.innerHTML = H`<div class="empty">Solo los administradores pueden gestionar usuarios.</div>`;
    return;
  }
  const owner = { id: activeClinicId, name: "Propietario de la clínica", email: state.settings.clinicEmail || auth?.currentUser?.email || "", role: "admin", status: "active", owner: true };
  const members = [owner, ...state.teamMembers.filter((member) => member.id !== activeClinicId)];
  container.innerHTML = members.map((member) => H`<div class="team-member-row"><div class="team-member-avatar">${escapeHtml((member.name || member.email || "U").slice(0, 1).toUpperCase())}</div><span><strong>${escapeHtml(member.name || "Usuario")}</strong><small>${escapeHtml(member.email || "")}${member.owner ? T(" · Propietario") : ""}</small></span><select aria-label="Rol" onchange="updateTeamMember('${member.id}', {role:this.value})" ${member.owner ? "disabled" : ""}>${Object.entries(roleLabels).map(([value, label]) => H`<option value="${value}" ${member.role === value ? "selected" : ""}>${label}</option>`).join("")}</select>${member.owner ? H`<span class="badge green">Activo</span>` : H`<button class="btn light" type="button" onclick="updateTeamMember('${member.id}', {status:'${member.status === "disabled" ? "active" : "disabled"}'})">${member.status === "disabled" ? T("Activar") : T("Desactivar")}</button>`}</div>`).join("");
}

async function createTeamMember() {
  if (currentAccess.role !== "admin") return toast(T("Solo un administrador puede agregar usuarios."));
  const name = $("#teamMemberName").value.trim();
  const email = $("#teamMemberEmail").value.trim().toLowerCase();
  const password = $("#teamMemberPassword").value;
  const role = $("#teamMemberRole").value;
  if (!name || !email || password.length < 6) return toast(T("Completa nombre, correo y una contraseña temporal de 6 caracteres."));
  let secondaryApp;
  try {
    secondaryApp = firebase.apps.find((app) => app.name === "team-member-creator") || firebase.initializeApp(window.firebaseConfig, "team-member-creator");
    const credential = await secondaryApp.auth().createUserWithEmailAndPassword(email, password);
    const profile = { uid: credential.user.uid, clinicId: activeClinicId, name, email, role, status: "active", createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid };
    const batch = firestore.batch();
    batch.set(firestore.collection("userProfiles").doc(credential.user.uid), profile);
    batch.set(getCollectionRef("members").doc(credential.user.uid), profile);
    await batch.commit();
    await secondaryApp.auth().signOut();
    $("#teamMemberName").value = ""; $("#teamMemberEmail").value = ""; $("#teamMemberPassword").value = "";
    recordActivity({ action: "created", entityType: "system", entityId: credential.user.uid, title: "Usuario agregado", detail: `${name} · ${roleLabels[role]}` }).catch(console.error);
    toast(T("Usuario agregado correctamente."));
  } catch (error) {
    console.error(error);
    toast(getAuthErrorMessage(error, "register"));
  }
}

async function updateTeamMember(memberId, changes) {
  if (currentAccess.role !== "admin" || memberId === activeClinicId) return;
  try {
    const batch = firestore.batch();
    batch.set(getCollectionRef("members").doc(memberId), { ...changes, updatedAt: new Date().toISOString() }, { merge: true });
    batch.set(firestore.collection("userProfiles").doc(memberId), { ...changes, updatedAt: new Date().toISOString() }, { merge: true });
    await batch.commit();
    recordActivity({ action: "updated", entityType: "system", entityId: memberId, title: "Acceso de usuario actualizado", detail: changes.role ? roleLabels[changes.role] : changes.status === "disabled" ? "Usuario desactivado" : "Usuario activado" }).catch(console.error);
    toast(T("Permisos actualizados."));
  } catch (error) { console.error(error); toast(T("No se pudieron actualizar los permisos.")); }
}

const activityIcons = { patient: "●", visit: "◆", appointment: "▦", payment: "$", document: "▤", signature: "✍", task: "✓", alert: "📌", form: "☷", communication: "☎", clinical: "✚", lead: "◇", campaign: "◎", expense: "−", adjustment: "±", cash: "$", system: "•" };
function renderAuditLogPreview() {
  const box = $("#auditLogPreview"); if (!box) return;
  const rows = state.activities.slice(0, 20);
  box.innerHTML = rows.length ? rows.map((entry) => H`<div class="audit-row"><span>${activityIcons[entry.entityType] || "•"}</span><div><strong>${escapeHtml(entry.title)}</strong><small>${escapeHtml(entry.detail || "")} · ${new Date(entry.createdAt).toLocaleString(ClinicI18n.locale)}</small><small>${escapeHtml(entry.userEmail || T("Usuario de la clínica"))}</small></div></div>`).join("") : H`<div class="empty document-empty">Las acciones nuevas aparecerán aquí.</div>`;
}

function formatFileSize(bytes) {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.ceil(bytes / 1024)} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

function renderClinicDocuments() {
  const box = $("#clinicDocumentsList");
  if (!box) return;
  box.innerHTML = state.documents.length ? state.documents.map((item) => H`
    <div class="document-row">
      <span class="document-icon">${item.type === "application/pdf" ? "PDF" : "DOC"}</span>
      <div><strong>${escapeHtml(item.name)}</strong><small>${formatFileSize(item.size)} · ${(item.fields || []).length ? S`${item.fields.length} campo(s) digitales · Listo para Room` : item.roomReady ? T("Listo para Room · Revisión y firma") : T("Disponible para firma")}</small></div>
      <a class="btn light" href="${escapeHtml(item.url)}" target="_blank" rel="noopener">Abrir</a>
      ${item.type === "application/pdf" ? H`<button class="btn light" type="button" onclick="${(item.fields || []).length ? S`openDocumentFieldsDialog('${item.id}')` : S`analyzeClinicDocument('${item.id}')`}">${(item.fields || []).length ? T("Revisar campos") : item.roomReady ? T("Reanalizar") : T("Convertir automáticamente")}</button>` : ""}
      <button class="btn light document-delete" type="button" onclick="deleteClinicDocument('${item.id}')">Eliminar</button>
    </div>`).join("") : H`<div class="empty document-empty">Todavía no hay documentos cargados.</div>`;
}

function renderVisitDocuments(selectedDocuments = []) {
  const box = $("#visitDocuments");
  const prior = new Map((selectedDocuments || []).map((item) => [item.documentId, item]));
  const available = state.documents.map((item) => ({ ...item, ...(prior.get(item.id) || {}) }));
  const archivedSigned = (selectedDocuments || []).filter((item) => item.status === "signed" && !state.documents.some((documentItem) => documentItem.id === item.documentId));
  const choices = [...available, ...archivedSigned.map((item) => ({ id: item.documentId, ...item, archived: true }))];
  box.innerHTML = choices.length ? choices.map((item) => H`
    <label class="document-choice">
      <input type="checkbox" value="${item.id}" ${prior.has(item.id) || item.status === "signed" ? "checked" : ""} ${item.status === "signed" ? "disabled" : ""} />
      <span><strong>${escapeHtml(item.name)}</strong><small>${item.status === "signed" ? S`Firmado por ${escapeHtml(item.signedBy)}` : T("Quedará pendiente de firma")}${item.archived ? T(" · Archivado") : ""}</small></span>
      ${item.url ? H`<a href="${escapeHtml(item.url)}" target="_blank" rel="noopener" onclick="event.stopPropagation()">Ver</a>` : ""}
    </label>`).join("") : H`<div class="empty document-empty">No hay documentos disponibles. Súbelos primero desde Ajustes.</div>`;
}

function collectVisitDocuments(existing = []) {
  const prior = new Map((existing || []).map((item) => [item.documentId, item]));
  return [...$("#visitDocuments").querySelectorAll('input[type="checkbox"]:checked')].map((input) => {
    const item = state.documents.find((documentItem) => documentItem.id === input.value);
    const previous = prior.get(input.value) || {};
    return { ...previous, documentId: input.value, name: item?.name || previous.name || "Documento", url: item?.url || previous.url || "", fields: item?.fields || previous.fields || [], answers: previous.answers || {}, status: previous.status || "pending" };
  });
}

function openDocumentFieldsDialog(id) {
  const documentItem = state.documents.find((item) => item.id === id); if (!documentItem) return;
  $("#documentFieldsId").value = id;
  $("#documentFieldsTitle").textContent = documentItem.name;
  $("#documentFieldsBuilder").innerHTML = "";
  const editableFields = (documentItem.fields || []).filter((field) => !field.hidden && field.type !== "signature");
  (editableFields.length ? editableFields : [{ id: uid(), label: "", type: "text", required: false }]).forEach(addDocumentFieldRow);
  $("#documentFieldsDialog").showModal();
}

function addDocumentFieldRow(field = {}) {
  const row = document.createElement("div"); row.className = "form-question-row"; row.dataset.fieldId = field.id || uid();
  row.innerHTML = H`<input class="question-label" placeholder="Nombre del campo" value="${escapeHtml(field.label || "")}" /><select class="question-type"><option value="text" ${field.type === "text" ? "selected" : ""}>Texto corto</option><option value="textarea" ${field.type === "textarea" ? "selected" : ""}>Texto largo</option><option value="yesno" ${field.type === "yesno" ? "selected" : ""}>Sí / No</option><option value="date" ${field.type === "date" ? "selected" : ""}>Fecha</option><option value="number" ${field.type === "number" ? "selected" : ""}>Número</option></select><label><input class="question-required" type="checkbox" ${field.required ? "checked" : ""} /> Obligatorio</label><button type="button" class="icon-btn" title="Eliminar campo" onclick="this.closest('.form-question-row').remove()">⌫</button>`;
  $("#documentFieldsBuilder").append(row);
}

async function saveDocumentFields() {
  const id = $("#documentFieldsId").value; const documentItem = state.documents.find((item) => item.id === id); if (!documentItem) return;
  const preservedHiddenFields = (documentItem.fields || []).filter((field) => field.hidden || field.type === "signature");
  const fields = [...Array.from($$("#documentFieldsBuilder .form-question-row")).map((row) => ({ id: row.dataset.fieldId, label: row.querySelector(".question-label").value.trim(), type: row.querySelector(".question-type").value, required: row.querySelector(".question-required").checked })).filter((field) => field.label), ...preservedHiddenFields];
  if (!fields.length) return toast(T("Agrega por lo menos un campo digital."));
  await getCollectionRef("documents").doc(id).set({ fields, roomReady: true, updatedAt: new Date().toISOString() }, { merge: true });
  documentItem.fields = fields; documentItem.roomReady = true;
  recordActivity({ action: "updated", entityType: "document", entityId: id, title: "Documento preparado para Room", detail: `${documentItem.name} · ${fields.length} campo(s)` }).catch(console.error);
  $("#documentFieldsDialog").close(); renderClinicDocuments(); toast(T("Versión Room guardada."));
}

function currentSignatureVisit() {
  return state.visits.find((visit) => visit.id === activeSignatureVisitId);
}

function currentSignatureDocument() {
  return currentSignatureVisit()?.documents?.find((item) => item.documentId === activeSignatureDocumentId);
}

function openSignatureDialog(visitId) {
  const visit = state.visits.find((item) => item.id === visitId);
  if (!visit?.documents?.length) return toast(T("Esta consulta no tiene documentos asignados."));
  activeSignatureVisitId = visitId;
  activeSignatureDocumentId = visit.documents.find((item) => item.status !== "signed")?.documentId || visit.documents[0].documentId;
  const p = patient(visit.patientId);
  $("#signatureDialogTitle").textContent = p?.name || T("Firma del paciente");
  $("#signatureSignerName").value = p?.name || "";
  $("#signatureConsent").checked = false;
  $("#signatureDialog").showModal();
  renderSignatureDialog();
}

function selectSignatureDocument(documentId) {
  activeSignatureDocumentId = documentId;
  $("#signatureConsent").checked = false;
  renderSignatureDialog();
}

function renderSignatureDialog() {
  const visit = currentSignatureVisit();
  const documentItem = currentSignatureDocument();
  if (!visit || !documentItem) return;
  $("#signatureDocumentList").innerHTML = visit.documents.map((item) => H`
    <button type="button" class="signature-document-item ${item.documentId === activeSignatureDocumentId ? "active" : ""}" onclick="selectSignatureDocument('${item.documentId}')">
      <span>${item.status === "signed" ? "✓" : "○"}</span><div><strong>${escapeHtml(item.name)}</strong><small>${item.status === "signed" ? S`Firmado ${fmtDate(item.signedAt)}` : T("Pendiente de firma")}</small></div>
    </button>`).join("");
  const completedFields = (documentItem.fields || []).filter((field) => documentItem.answers?.[field.id]);
  $("#signatureDocumentContext").innerHTML = H`<div><small>Documento seleccionado</small><strong>${escapeHtml(documentItem.name)}</strong></div>${documentItem.url ? H`<a class="btn light" href="${escapeHtml(documentItem.url)}" target="_blank" rel="noopener">Abrir documento</a>` : ""}${completedFields.length ? H`<div class="document-answer-summary">${completedFields.map((field) => H`<span><small>${escapeHtml(field.label)}</small><strong>${escapeHtml(documentItem.answers[field.id])}</strong></span>`).join("")}</div>` : ""}`;
  const preview = $("#savedSignaturePreview");
  preview.classList.toggle("hidden", documentItem.status !== "signed");
  preview.innerHTML = documentItem.status === "signed" ? H`<small>Firma guardada</small><img src="${escapeHtml(documentItem.signatureUrl)}" alt="Firma de ${escapeHtml(documentItem.signedBy)}" /><strong>${escapeHtml(documentItem.signedBy)}</strong><span>${new Date(documentItem.signedAt).toLocaleString(ClinicI18n.locale)}</span>` : "";
  $("#saveSignatureBtn").textContent = documentItem.status === "signed" ? T("Reemplazar firma") : T("Guardar firma");
  requestAnimationFrame(setupSignatureCanvas);
}

function setupSignatureCanvas() {
  const canvas = $("#signatureCanvas");
  const width = Math.max(280, canvas.parentElement.clientWidth - 2);
  const height = 210;
  const ratio = window.devicePixelRatio || 1;
  canvas.width = width * ratio;
  canvas.height = height * ratio;
  canvas.style.width = `${width}px`;
  canvas.style.height = `${height}px`;
  const context = canvas.getContext("2d");
  context.scale(ratio, ratio);
  context.lineCap = "round";
  context.lineJoin = "round";
  context.lineWidth = 2.4;
  context.strokeStyle = "#172033";
  signatureHasInk = false;
}

function clearSignatureCanvas() {
  setupSignatureCanvas();
}

async function saveCurrentSignature() {
  const visit = currentSignatureVisit();
  const documentItem = currentSignatureDocument();
  const signedBy = $("#signatureSignerName").value.trim();
  if (!signedBy) return toast(T("Escribe el nombre de quien firma."));
  if (!signatureHasInk) return toast(T("Dibuja la firma antes de guardarla."));
  if (!$("#signatureConsent").checked) return toast(T("Confirma la aceptación de la firma electrónica."));
  const button = $("#saveSignatureBtn");
  try {
    button.disabled = true;
    const canvas = $("#signatureCanvas");
    const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    const signatureId = uid();
    const path = `clinics/${activeClinicId}/signatures/${visit.id}/${documentItem.documentId}/${signatureId}.png`;
    const ref = storage.ref(path);
    await ref.put(blob, { contentType: "image/png" });
    const signatureUrl = await ref.getDownloadURL();
    const signedAt = new Date().toISOString();
    const documents = visit.documents.map((item) => item.documentId === documentItem.documentId ? { ...item, status: "signed", signedBy, signedAt, signatureUrl, signaturePath: path, consentAccepted: true, signedByUserId: auth.currentUser.uid } : item);
    await saveVisit({ id: visit.id, documents });
    recordActivity({ action: "signed", entityType: "signature", entityId: documentItem.documentId, patientId: visit.patientId, visitId: visit.id, title: "Documento firmado", detail: `${documentItem.name} · ${signedBy}` }).catch(console.error);
    if (documentItem.signaturePath && documentItem.signaturePath !== path) storage.ref(documentItem.signaturePath).delete().catch(() => {});
    visit.documents = documents;
    renderSignatureDialog();
    renderVisits();
    toast(T("Firma guardada correctamente"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo guardar la firma"));
  } finally {
    button.disabled = false;
  }
}

function renderInvoiceStylePreview() {
  const preview = $("#invoiceStylePreview");
  if (!preview) return;
  const color = $("#invoiceAccentColor")?.value || "#0f766e";
  const position = $("#invoiceLogoPosition")?.value || "left";
  preview.style.setProperty("--preview-accent", color);
  preview.className = `invoice-preview full logo-${position}`;
  preview.innerHTML = H`
    <div class="preview-brand">${state.settings.clinicLogo ? H`<img src="${state.settings.clinicLogo}" alt="" />` : H`<span class="preview-logo-placeholder">LOGO</span>`}<strong>${escapeHtml($("#clinicName")?.value || T("Nombre de la clínica"))}</strong></div>
    <div><b>FACTURA</b><small>${escapeHtml($("#invoicePrefix")?.value || "FAC")}-000001</small></div>
    <p>${escapeHtml(invoiceFooterCopy($("#invoiceFooter")?.value || ""))}</p>`;
}

function openAppointmentDialog(item = null) {
  if (!state.patients.length) { toast(T("Primero registra un paciente.")); openPatientDialog(); return; }
  renderVisitOptions();
  $("#appointmentDialogTitle").textContent = item ? T("Editar cita") : T("Nueva cita");
  $("#appointmentId").value = item?.id || "";
  $("#appointmentPatient").value = item?.patientId || state.patients[0].id;
  const defaultDate = `${$("#appointmentDateFilter")?.value || localDateValue()}T09:00`;
  $("#appointmentDate").value = item?.date || defaultDate;
  $("#appointmentDuration").value = String(item?.duration || 30);
  $("#appointmentType").value = item?.type || "Presencial";
  $("#appointmentDoctor").value = item?.doctor || "";
  renderRoomOptions();
  $("#appointmentRoom").value = item?.roomId || "";
  $("#appointmentStatus").value = item?.status || "scheduled";
  $("#appointmentReason").value = item?.reason || "";
  $("#appointmentReminder").checked = item ? Boolean(item.reminderEnabled) : true;
  $("#appointmentNotes").value = item?.notes || "";
  $("#appointmentRecurrence").value = "none";
  $("#appointmentRecurrenceCount").value = "4";
  $("#appointmentRecurrence").disabled = Boolean(item?.id);
  $("#appointmentRecurrenceCount").disabled = Boolean(item?.id);
  activeWaitlistId = item?.waitlistId || null;
  $("#appointmentDialog").showModal();
  requestAnimationFrame(() => $("#appointmentPatient").focus());
}

function openAppointmentAt(date) {
  openAppointmentDialog();
  $("#appointmentDate").value = date;
  const selectedDoctor = $("#appointmentDoctorFilter")?.value;
  if (selectedDoctor) $("#appointmentDoctor").value = selectedDoctor;
}

function showAppointmentDay(date) {
  appointmentView = "day";
  localStorage.setItem("clinicAppointmentView", appointmentView);
  $("#appointmentDateFilter").value = date;
  renderAppointments();
}

function editAppointment(id) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (item) openAppointmentDialog(item);
}

async function deleteAppointment(id) {
  if (!confirm(T("¿Eliminar esta cita?"))) return;
  try { await deleteAppointmentEntry(id); toast(T("Cita eliminada")); } catch (error) { console.error(error); toast(T("No se pudo eliminar la cita")); }
}

async function cancelAppointment(id) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (!item) return;
  const reason = prompt(T("Motivo de cancelación (opcional):"), item.cancellationReason || "");
  if (reason === null) return;
  try {
    await saveAppointment({ ...item, status: "cancelled", cancellationReason: reason.trim(), cancelledAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
    toast(T("Cita cancelada y conservada en el historial"));
  } catch (error) { console.error(error); toast(T("No se pudo cancelar la cita")); }
}

function findAppointmentConflict(candidate) {
  const candidateStart = new Date(candidate.date).getTime();
  const bufferMs = Number(state.settings.scheduleBuffer || 0) * 60000;
  const candidateEnd = candidateStart + candidate.duration * 60000 + bufferMs;
  return state.appointments.find((item) => {
    if (item.id === candidate.id || ["cancelled", "no_show"].includes(item.status)) return false;
    const itemStart = new Date(item.date).getTime();
    const itemEnd = itemStart + Number(item.duration || 30) * 60000 + bufferMs;
    const overlaps = candidateStart < itemEnd && candidateEnd > itemStart;
    if (!overlaps) return false;
    const samePatient = item.patientId === candidate.patientId;
    const sameDoctor = candidate.doctor && item.doctor && candidate.doctor.toLowerCase() === item.doctor.toLowerCase();
    const sameRoom = candidate.roomId && item.roomId && candidate.roomId === item.roomId;
    return samePatient || sameDoctor || sameRoom;
  });
}

function appointmentAvailabilityError(candidate) {
  const date = new Date(candidate.date); const allowedDays = state.settings.scheduleDays || [1, 2, 3, 4, 5];
  if (!allowedDays.includes(date.getDay())) return "La clínica no tiene disponibilidad configurada para ese día.";
  const startMinutes = date.getHours() * 60 + date.getMinutes(); const [openHour, openMinute] = (state.settings.scheduleOpenTime || "08:00").split(":").map(Number); const [closeHour, closeMinute] = (state.settings.scheduleCloseTime || "18:00").split(":").map(Number); const open = openHour * 60 + openMinute; const close = closeHour * 60 + closeMinute;
  if (startMinutes < open || startMinutes + Number(candidate.duration || 30) > close) return S`La cita debe estar entre ${state.settings.scheduleOpenTime || "08:00"} y ${state.settings.scheduleCloseTime || "18:00"}.`;
  return "";
}

function recurringAppointmentDates(startValue, recurrence, count) {
  const start = new Date(startValue); const dates = [];
  for (let index = 0; index < count; index += 1) { const date = new Date(start); if (recurrence === "weekly") date.setDate(start.getDate() + index * 7); if (recurrence === "biweekly") date.setDate(start.getDate() + index * 14); if (recurrence === "monthly") date.setMonth(start.getMonth() + index); dates.push(localDateTimeValue(date)); }
  return dates;
}

function localDateTimeValue(date) {
  const offset = date.getTimezoneOffset() * 60000; return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

function renderWaitlist() {
  const box = $("#waitlistList"); if (!box) return;
  const rows = state.waitlist.filter((entry) => entry.status !== "scheduled").sort((a, b) => new Date(a.dateFrom) - new Date(b.dateFrom));
  box.innerHTML = rows.length ? rows.map((entry) => { const p = patient(entry.patientId); return H`<article><div><strong>${escapeHtml(p?.name || T("Paciente"))}</strong><small>${escapeHtml(entry.notes || T("Sin notas"))} · Desde ${entry.dateFrom}${entry.dateTo ? S` hasta ${entry.dateTo}` : ""}</small></div><span class="badge blue">${entry.timePreference === "morning" ? T("Mañana") : entry.timePreference === "afternoon" ? T("Tarde") : T("Cualquier hora")}</span><button class="btn primary" onclick="bookWaitlist('${entry.id}')">Programar</button><button class="icon-btn" onclick="removeWaitlist('${entry.id}')">⌫</button></article>`; }).join("") : H`<div class="empty">La lista de espera está vacía.</div>`;
}

function openWaitlistDialog() {
  renderVisitOptions(); $("#waitlistPatient").innerHTML = state.patients.map((p) => H`<option value="${p.id}">${escapeHtml(p.name)}</option>`).join(""); enablePatientSelectSearch($("#waitlistPatient")); $("#waitlistId").value = ""; $("#waitlistDateFrom").value = localDateValue(); $("#waitlistDateTo").value = ""; $("#waitlistTimePreference").value = "any"; $("#waitlistDoctor").value = $("#appointmentDoctorFilter").value || ""; $("#waitlistNotes").value = ""; $("#waitlistDialog").showModal();
}

async function saveWaitlist() {
  const id = $("#waitlistId").value || uid(); const data = { id, patientId: $("#waitlistPatient").value, dateFrom: $("#waitlistDateFrom").value, dateTo: $("#waitlistDateTo").value, timePreference: $("#waitlistTimePreference").value, doctor: $("#waitlistDoctor").value.trim(), notes: $("#waitlistNotes").value.trim(), status: "waiting", createdAt: new Date().toISOString(), createdBy: auth.currentUser.uid };
  await getCollectionRef("waitlist").doc(id).set(data, { merge: true }); recordActivity({ action: "created", entityType: "appointment", entityId: id, patientId: data.patientId, title: "Paciente agregado a lista de espera", detail: data.notes || data.dateFrom }).catch(console.error); $("#waitlistDialog").close(); toast(T("Paciente agregado a la lista de espera."));
}

function bookWaitlist(id) {
  const entry = state.waitlist.find((item) => item.id === id); if (!entry) return; activeWaitlistId = id; openAppointmentDialog(); activeWaitlistId = id; $("#appointmentPatient").value = entry.patientId; $("#appointmentDoctor").value = entry.doctor || ""; $("#appointmentReason").value = entry.notes || "Cita desde lista de espera"; const hour = entry.timePreference === "afternoon" ? "13:00" : "09:00"; $("#appointmentDate").value = `${entry.dateFrom || localDateValue()}T${hour}`;
}

async function removeWaitlist(id) {
  if (!confirm(T("¿Quitar este paciente de la lista de espera?"))) return; await getCollectionRef("waitlist").doc(id).delete(); toast(T("Paciente retirado de la lista."));
}

async function setAppointmentStatus(id, status) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (!item) return;
  try { await saveAppointment({ ...item, status, updatedAt: new Date().toISOString() }); toast(S`Cita ${appointmentStatus(status).label.toLowerCase()}`); } catch (error) { console.error(error); toast(T("No se pudo actualizar la cita")); }
}

async function startAppointmentVisit(id) {
  const item = state.appointments.find((appointment) => appointment.id === id);
  if (!item) return;
  await setAppointmentStatus(id, "arrived");
  showPage("visits");
  openVisitDialog({ patientId: item.patientId, date: item.date, type: item.type, doctor: item.doctor, roomId: item.roomId || "", roomName: item.roomName || "", reason: item.reason, notes: item.notes, status: "Completada", appointmentId: item.id });
}

function openPaymentDialog(visitId = "", patientId = "") {
  const eligible = state.visits.filter((visit) => balance(visit) > 0 && (!patientId || visit.patientId === patientId));
  if (!eligible.length) { toast(T("No hay facturas con balance pendiente.")); return; }
  $("#paymentVisit").innerHTML = eligible.map((visit) => H`<option value="${visit.id}">${escapeHtml(patient(visit.patientId)?.name || T("Paciente"))} · ${escapeHtml(invoiceNumber(visit))} · ${money(balance(visit))}</option>`).join("");
  $("#paymentVisit").value = eligible.some((visit) => visit.id === visitId) ? visitId : eligible[0].id;
  [...$("#paymentVisit").options].forEach((option) => { option.dataset.patientId = state.visits.find((visit) => visit.id === option.value)?.patientId || ""; });
  enablePatientSelectSearch($("#paymentVisit"), { placeholder: "Buscar paciente o factura...", ariaLabel: "Buscar paciente o factura pendiente" });
  $("#paymentDate").value = localDateTimeValue(new Date());
  $("#paymentAmount").value = "";
  $("#paymentCardType").value = "";
  $("#paymentCardLast4").value = "";
  $("#paymentReference").value = "";
  $("#paymentNote").value = "";
  updatePaymentContext();
  $("#paymentDialog").showModal();
  requestAnimationFrame(() => $("#paymentAmount").focus());
}

function updatePaymentContext() {
  const visit = state.visits.find((item) => item.id === $("#paymentVisit").value);
  if (!visit) return;
  const p = patient(visit.patientId);
  const insured = paymentType(visit) === "insurance";
  $("#paymentSource").value = insured ? "insurance" : "patient";
  $("#paymentMethod").value = insured ? "insurance_eft" : "cash";
  togglePaymentCardFields();
  $("#paymentAmount").max = balance(visit).toFixed(2);
  $("#paymentContext").innerHTML = H`<div><small>Paciente</small><strong>${escapeHtml(p?.name || T("Paciente"))}</strong></div><div><small>Factura</small><strong>${escapeHtml(invoiceNumber(visit))}</strong></div><div><small>Balance actual</small><strong>${money(balance(visit))}</strong></div>`;
}

function openPatientFinance(id) {
  const p = patient(id);
  if (!p) return;
  activeFinancePatientId = id;
  const visits = state.visits.filter((visit) => visit.patientId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const entries = state.payments.filter((entry) => entry.patientId === id).sort((a, b) => new Date(b.date) - new Date(a.date));
  const data = totals(visits);
  $("#patientFinanceTitle").textContent = p.name;
  $("#patientFinanceDetail").innerHTML = H`${patientHasAlert(p) ? H`<div class="patient-finance-alert"><div><strong>📌 ${escapeHtml(p.patientAlertMessage)}</strong><span>${patientAlertDateLabel(p)}</span></div><button type="button" class="btn light" onclick="resolvePatientAlert('${p.id}')">Marcar resuelta</button></div>` : ""}<div class="finance-profile-summary"><div><small>Facturado</small><strong>${money(data.billed)}</strong></div><div><small>Pagado</small><strong>${money(data.paid)}</strong></div><div><small>Balance</small><strong>${money(data.debt)}</strong></div></div>
    <div class="finance-profile-info"><span>${escapeHtml(p.phone || T("Sin teléfono"))}</span><span>${escapeHtml(payerLabel(p))}</span>${p.insuranceMemberId ? H`<span>Póliza: ${escapeHtml(p.insuranceMemberId)}</span>` : ""}</div>
    <h4>Facturas y consultas</h4><div class="finance-profile-list">${visits.length ? visits.map((visit) => H`<div><span>${fmtDate(visit.date)}<small>${escapeHtml(invoiceNumber(visit))} · ${escapeHtml(visit.reason || T("Consulta"))}</small></span><strong>${money(balance(visit))}<small>balance</small></strong><button class="btn light" onclick="openInvoice('${visit.id}')">Factura</button></div>`).join("") : H`<div class="empty">Sin facturas.</div>`}</div>
    <h4>Movimientos</h4><div class="finance-profile-list">${entries.length ? entries.map((entry) => H`<div><span>${fmtDate(entry.date)}<small>${entry.source === "insurance" ? T("Seguro") : T("Paciente")} · ${escapeHtml(entry.reference || entry.method || T("Pago"))}</small></span><strong>${money(entry.amount)}</strong></div>`).join("") : H`<div class="empty">Sin movimientos individuales.</div>`}</div>`;
  $("#patientFinancePaymentBtn").disabled = data.debt <= 0;
  $("#patientFinanceDialog").showModal();
}

function openPatientDialog(p = null) {
  $("#patientDialogTitle").textContent = p ? T("Editar paciente") : T("Nuevo paciente");
  $("#patientSubmitBtn").textContent = p ? T("Guardar cambios") : T("Guardar paciente");
  $("#patientId").value = p?.id || "";
  $("#patientName").value = p?.name || "";
  $("#patientPhone").value = p?.phone || "";
  $("#patientEmail").value = p?.email || "";
  $("#patientAddress").value = p?.address || "";
  $("#patientAge").value = p?.age ?? "";
  $("#patientBirthDate").value = p?.birthDate || "";
  $("#patientBirthDate").max = today();
  $("#patientLanguage").value = p?.language || "Español";
  $("#patientPayerType").value = p?.payerType || "self_pay";
  $("#patientInsuranceCompany").value = p?.insuranceCompany || "";
  $("#patientInsuranceMemberId").value = p?.insuranceMemberId || "";
  $("#patientInsuranceGroup").value = p?.insuranceGroup || "";
  togglePatientInsuranceFields();
  $("#patientEmailNotifications").checked = Boolean(p?.emailNotificationsEnabled);
  $("#patientSmsNotifications").checked = Boolean(p?.smsNotificationsEnabled);
  $("#patientBirthdayEmail").checked = Boolean(p?.birthdayEmailEnabled);
  $("#patientDocument").value = p?.document || "";
  $("#patientNotes").value = p?.notes || "";
  $("#patientSource").value = p?.source || "";
  $("#patientLifecycle").value = p?.lifecycle || "active";
  $("#patientAlertMessage").value = p?.patientAlertMessage || "";
  $("#patientAlertDate").value = p?.patientAlertDate || "";
  $("#patientAlertActive").checked = Boolean(p?.patientAlertActive);
  clearFormErrors($("#patientForm"));
  $("#patientDialog").showModal();
  requestAnimationFrame(() => $("#patientName").focus());
}

function openVisitDialog(visit = null) {
  if (!state.patients.length) {
    toast(T("Primero registra un paciente."));
    openPatientDialog();
    return;
  }

  renderVisitOptions();
  pendingAppointmentId = visit?.appointmentId || null;

  $("#visitDialogTitle").textContent = visit?.id ? T("Editar consulta") : T("Nueva consulta");
  $("#visitId").value = visit?.id || "";
  $("#visitPatient").value = visit?.patientId || state.patients[0].id;
  $("#visitType").value = visit?.type || "Presencial";
  $("#visitDate").value = visit?.date || localDateTimeValue(new Date());
  $("#visitDoctor").value = visit?.doctor || "";
  renderRoomOptions();
  $("#visitRoom").value = visit?.roomId || "";
  $("#visitStatus").value = visit?.status || (visit?.id ? "Completada" : "Programada");
  $("#visitReminderEnabled").checked = visit?.id ? Boolean(visit.reminderEnabled) : false;
  renderVisitLineItems(visitItems(visit));
  const inferredType = visit ? paymentType(visit) : (patient($("#visitPatient").value)?.payerType === "insurance" ? "insurance" : "cash");
  $("#visitPaymentType").value = inferredType;
  $("#visitPaid").value = visit?.patientPaid ?? (inferredType === "cash" ? (visit?.paid ?? 0) : 0);
  $("#visitInsurancePaid").value = visit?.insurancePaid ?? (inferredType === "insurance" ? (visit?.paid ?? 0) : 0);
  $("#visitClaimStatus").value = visit?.claimStatus || "draft";
  $("#visitClaimNumber").value = visit?.claimNumber || "";
  $("#visitCopay").value = visit?.copay ?? 0;
  toggleVisitInsuranceFields();
  $("#visitReason").value = visit?.reason || "";
  $("#visitNotes").value = visit?.notes || "";
  $("#visitBloodPressure").value = visit?.vitals?.bloodPressure || "";
  $("#visitPulse").value = visit?.vitals?.pulse || "";
  $("#visitTemperature").value = visit?.vitals?.temperature || "";
  $("#visitWeight").value = visit?.vitals?.weight || "";
  $("#visitHeight").value = visit?.vitals?.height || "";
  $("#visitOxygen").value = visit?.vitals?.oxygen || "";
  $("#visitSubjective").value = visit?.soap?.subjective || "";
  $("#visitObjective").value = visit?.soap?.objective || "";
  $("#visitAssessment").value = visit?.soap?.assessment || "";
  $("#visitPlan").value = visit?.soap?.plan || "";
  $("#visitDiagnoses").value = (visit?.diagnoses || []).join("\n");
  $("#visitPrescriptions").value = (visit?.prescriptions || []).join("\n");
  renderVisitPaymentPanel(visit);
  renderVisitDocuments(visit?.documents || []);
  renderVisitPatientBanner();
  clearFormErrors($("#visitForm"));
  showPage("visitDialog");
  window.scrollTo({ top: 0, behavior: "smooth" });
  requestAnimationFrame(() => $("#visitPatient").focus());
}

function renderVisitPatientBanner() {
  const p = patient($("#visitPatient").value);
  const clinicalRecord = p ? state.clinicalRecords.find((entry) => entry.id === p.id || entry.patientId === p.id) : null;
  const banner = $("#visitPatientBanner");
  if (!p) {
    banner.innerHTML = H`<div class="patient-avatar">?</div><div><small>Paciente</small><strong>Selecciona un paciente</strong></div>`;
    return;
  }
  const initials = p.name.split(/\s+/).slice(0, 2).map((part) => part[0]).join("").toUpperCase();
  banner.innerHTML = H`
    <div class="patient-avatar">${escapeHtml(initials)}</div>
    <div class="patient-banner-name"><small>Expediente del paciente</small><strong>${escapeHtml(p.name)}</strong><span>${escapeHtml(p.document || T("Sin documento"))}</span></div>
    <div><small>Edad</small><strong>${escapeHtml(p.age || "—")}</strong></div>
    <div><small>Teléfono</small><strong>${escapeHtml(p.phone || "—")}</strong></div>
    <div><small>Seguro</small><strong>${escapeHtml(p.insuranceCompany || (p.payerType === "insurance" ? "Registrado" : T("Pago propio")))}</strong></div>
    ${clinicalRecord?.allergies?.length ? H`<div class="patient-banner-clinical-alert"><small>⚠ Alergias</small><strong>${escapeHtml(clinicalRecord.allergies.join(" · "))}</strong></div>` : ""}
    ${patientHasAlert(p) ? H`<div class="patient-banner-alert"><span>📌</span><div><strong>${escapeHtml(p.patientAlertMessage)}</strong><small>${patientAlertDateLabel(p)}</small></div><button type="button" onclick="resolvePatientAlert('${p.id}')">Marcar resuelta</button></div>` : ""}`;
}

function closeVisitWorkspace() {
  pendingAppointmentId = null;
  showPage("visits");
}

function renderVisitLineItems(items = []) {
  const box = $("#visitLineItems");
  const rows = items.length ? items : [{ id: uid(), description: "", price: "" }];
  box.innerHTML = rows.map((item) => H`
    <div class="service-line" data-line-id="${escapeHtml(item.id || uid())}">
      <label class="field-group"><span class="field-label">Servicio o procedimiento</span>
        <input class="service-description" type="text" value="${escapeHtml(item.description)}" placeholder="Ej. Consulta, tratamiento o producto" />
      </label>
      <label class="field-group service-quantity-field"><span class="field-label">Cantidad</span><input class="service-quantity" type="number" step="1" min="1" value="${item.quantity || 1}" /></label>
      <label class="field-group"><span class="field-label">Precio unitario</span>
        <div class="input-prefix"><span>$</span><input class="service-price" type="number" step="0.01" min="0" value="${item.unitPrice ?? item.price ?? ""}" placeholder="0.00" /></div>
      </label>
      <div class="service-line-total"><small>Total</small><strong>${money(item.price)}</strong></div>
      <button type="button" class="icon-btn service-remove" title="Eliminar servicio">×</button>
    </div>`).join("");

  box.querySelectorAll("input").forEach((input) => input.addEventListener("input", () => {
    updateVisitTotal();
    validateVisitForm();
  }));
  box.querySelectorAll(".service-remove").forEach((button) => button.addEventListener("click", () => {
    if (box.children.length === 1) {
      box.querySelector(".service-description").value = "";
      box.querySelector(".service-price").value = "";
      box.querySelector(".service-quantity").value = "1";
    } else {
      button.closest(".service-line").remove();
    }
    updateVisitTotal();
    validateVisitForm();
  }));
  updateVisitTotal();
}

function collectVisitLineItems() {
  return [...$("#visitLineItems").querySelectorAll(".service-line")].map((row) => ({
    id: row.dataset.lineId || uid(),
    description: row.querySelector(".service-description").value.trim(),
    quantity: Math.max(1, Number(row.querySelector(".service-quantity").value || 1)),
    unitPrice: Number(row.querySelector(".service-price").value || 0),
    price: Math.max(1, Number(row.querySelector(".service-quantity").value || 1)) * Number(row.querySelector(".service-price").value || 0)
  }));
}

function updateVisitTotal() {
  const total = collectVisitLineItems().reduce((sum, item) => sum + item.price, 0);
  $("#visitTotal").value = total.toFixed(2);
  [...$("#visitLineItems").querySelectorAll(".service-line")].forEach((row) => {
    const quantity = Math.max(1, Number(row.querySelector(".service-quantity").value || 1));
    const price = Number(row.querySelector(".service-price").value || 0);
    row.querySelector(".service-line-total strong").textContent = money(quantity * price);
  });
}

function toggleVisitInsuranceFields() {
  $("#visitInsuranceBilling").classList.toggle("hidden", $("#visitPaymentType").value !== "insurance");
}

function setFieldError(input, errorElement, message = "") {
  const field = input.closest(".field-group");
  field?.classList.toggle("has-error", Boolean(message));
  input.setAttribute("aria-invalid", message ? "true" : "false");
  if (errorElement) {
    errorElement.textContent = message;
    errorElement.classList.toggle("visible", Boolean(message));
  }
}

function clearFormErrors(form) {
  form.querySelectorAll(".field-group").forEach((field) => field.classList.remove("has-error"));
  form.querySelectorAll(".field-error").forEach((error) => {
    error.textContent = "";
    error.classList.remove("visible");
  });
  form.querySelectorAll("[aria-invalid]").forEach((input) => input.setAttribute("aria-invalid", "false"));
}

function togglePatientInsuranceFields() {
  const insured = $("#patientPayerType").value === "insurance";
  $("#patientInsuranceFields").classList.toggle("hidden", !insured);
}

function validatePatientForm() {
  const name = $("#patientName");
  const age = $("#patientAge");
  const birthDate = $("#patientBirthDate");
  const phone = $("#patientPhone");
  const email = $("#patientEmail");
  const emailNotificationsEnabled = $("#patientEmailNotifications").checked;
  const smsNotificationsEnabled = $("#patientSmsNotifications").checked;
  const birthdayEmailEnabled = $("#patientBirthdayEmail").checked;
  const insured = $("#patientPayerType").value === "insurance";
  const insuranceCompany = $("#patientInsuranceCompany");
  const insuranceMemberId = $("#patientInsuranceMemberId");
  const trimmedName = name.value.trim();
  const ageNumber = age.value === "" ? null : Number(age.value);
  const birthDateMessage = birthDate.value && birthDate.value > today() ? "La fecha de nacimiento no puede ser futura." : "";
  const emailMessage = (emailNotificationsEnabled || birthdayEmailEnabled) && !email.value.trim()
    ? "Agrega un correo para autorizar las notificaciones."
    : (email.value && !email.validity.valid ? "Escribe un correo electrónico válido." : "");
  const phoneMessage = smsNotificationsEnabled && !phone.value.trim()
    ? "Agrega un teléfono para autorizar los mensajes de texto."
    : "";
  const birthdayMessage = birthdayEmailEnabled && !emailNotificationsEnabled
    ? "Autoriza primero las notificaciones por correo electrónico."
    : "";
  const insuranceCompanyMessage = insured && !insuranceCompany.value.trim() ? "Indica la compañía de seguro." : "";
  const insuranceMemberIdMessage = insured && !insuranceMemberId.value.trim() ? "Indica el ID de miembro o póliza." : "";

  setFieldError(name, $("#patientNameError"), trimmedName.length < 2 ? "Escribe el nombre completo del paciente." : "");
  setFieldError(age, $("#patientAgeError"), ageNumber !== null && (ageNumber < 0 || ageNumber > 120) ? "La edad debe estar entre 0 y 120 años." : "");
  setFieldError(birthDate, $("#patientBirthDateError"), birthDateMessage);
  setFieldError(phone, $("#patientPhoneError"), phoneMessage);
  setFieldError(email, $("#patientEmailError"), emailMessage || birthdayMessage);
  setFieldError(insuranceCompany, $("#patientInsuranceCompanyError"), insuranceCompanyMessage);
  setFieldError(insuranceMemberId, $("#patientInsuranceMemberIdError"), insuranceMemberIdMessage);
  return trimmedName.length >= 2 && !birthDateMessage && !phoneMessage && !emailMessage && !birthdayMessage && !insuranceCompanyMessage && !insuranceMemberIdMessage && (ageNumber === null || (ageNumber >= 0 && ageNumber <= 120));
}

function validateVisitForm() {
  const total = Number($("#visitTotal").value || 0);
  const patientPaid = Number($("#visitPaid").value || 0);
  const insurancePaid = $("#visitPaymentType").value === "insurance" ? Number($("#visitInsurancePaid").value || 0) : 0;
  const reason = $("#visitReason");
  const items = collectVisitLineItems();
  const itemRows = [...$("#visitLineItems").querySelectorAll(".service-line")];
  const invalidItems = items.some((item, index) => {
    const rawPrice = itemRows[index]?.querySelector(".service-price").value;
    return !item.description || rawPrice === "" || !Number.isFinite(item.price) || item.price < 0 || item.quantity < 1;
  });
  const itemsMessage = invalidItems ? "Completa la descripción y el precio de cada servicio." : "";
  const paidMessage = patientPaid + insurancePaid > total ? "Los pagos no pueden ser mayores que el total." : "";
  const reasonMessage = reason.value.trim().length < 3 ? "Describe brevemente el motivo de la consulta." : "";

  setFieldError($("#visitPaid"), $("#visitPaidError"), paidMessage);
  setFieldError(reason, $("#visitReasonError"), reasonMessage);
  $("#visitLineItemsError").textContent = itemsMessage;
  $("#visitLineItemsError").classList.toggle("visible", Boolean(itemsMessage));
  return !paidMessage && !reasonMessage && !itemsMessage;
}

function editPatient(id) {
  const p = state.patients.find((item) => item.id === id);
  if (p) openPatientDialog(p);
}

async function deletePatient(id) {
  if (!confirm(T("¿Eliminar este paciente y sus consultas relacionadas?"))) return;
  try {
    await deletePatientEntry(id);
    render();
    toast(T("Paciente eliminado"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo eliminar el paciente"));
  }
}

function editVisit(id) {
  const visit = state.visits.find((item) => item.id === id);
  if (visit) openVisitDialog(visit);
}

async function deleteVisit(id) {
  if (!confirm(T("¿Eliminar esta consulta?"))) return;
  try {
    await deleteVisitEntry(id);
    render();
    toast(T("Consulta eliminada"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo eliminar la consulta"));
  }
}

window.editPatient = editPatient;
window.deletePatient = deletePatient;
window.editVisit = editVisit;
window.deleteVisit = deleteVisit;
window.openInvoice = openInvoice;
window.downloadInvoicePdf = downloadInvoicePdf;
window.printBillingReport = printBillingReport;
window.downloadBillingPdf = downloadBillingPdf;
window.openAppointmentDialog = openAppointmentDialog;
window.editAppointment = editAppointment;
window.deleteAppointment = deleteAppointment;
window.cancelAppointment = cancelAppointment;
window.openAppointmentAt = openAppointmentAt;
window.showAppointmentDay = showAppointmentDay;
window.setAppointmentStatus = setAppointmentStatus;
window.startAppointmentVisit = startAppointmentVisit;
window.openPaymentDialog = openPaymentDialog;
window.openPatientFinance = openPatientFinance;
window.deleteClinicDocument = deleteClinicDocument;
window.openSignatureDialog = openSignatureDialog;
window.selectSignatureDocument = selectSignatureDocument;
window.closeVisitWorkspace = closeVisitWorkspace;
window.resolvePatientAlert = resolvePatientAlert;
window.openPatientRecord = openPatientRecord;
window.selectPatientRecordTab = selectPatientRecordTab;
window.openTaskDialog = openTaskDialog; window.toggleTask = toggleTask; window.deleteTask = deleteTask;
window.openFormTemplateDialog = openFormTemplateDialog; window.deleteFormTemplate = deleteFormTemplate;
window.openDocumentFieldsDialog = openDocumentFieldsDialog;
window.analyzeClinicDocument = analyzeClinicDocument;
window.assignDigitalForm = assignDigitalForm; window.createPatientFormResponse = createPatientFormResponse; window.openPatientDigitalForm = openPatientDigitalForm;
window.openCommunicationDialog = openCommunicationDialog;
window.openClinicalRecordDialog = openClinicalRecordDialog;
window.openLeadDialog = openLeadDialog; window.moveLead = moveLead; window.convertLead = convertLead; window.openCampaignDialog = openCampaignDialog;
window.bookWaitlist = bookWaitlist; window.removeWaitlist = removeWaitlist;
window.openAdjustmentDialog = openAdjustmentDialog; window.deleteExpense = deleteExpense;
window.openRoomDialog = openRoomDialog; window.openRoomAssignDialog = openRoomAssignDialog; window.advanceRoomStatus = advanceRoomStatus; window.releaseRoom = releaseRoom; window.openIpadLaunch = openIpadLaunch;

// El expediente de consulta vive dentro del área principal, no como ventana emergente.
$(".main").appendChild($("#visitDialog"));

$$(".nav-item").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.page)));
$$("[data-go]").forEach((button) => button.addEventListener("click", () => showPage(button.dataset.go)));
$$("[data-close]").forEach((button) => {
  button.addEventListener("click", () => document.getElementById(button.dataset.close).close());
});

function showAuthForm(name) {
  $$(".auth-tab").forEach((tab) => tab.classList.toggle("active", tab.dataset.authTab === name));
  $("#loginForm").classList.toggle("active", name === "login");
  $("#registerForm").classList.toggle("active", name === "register");
  const firstInput = name === "login" ? $("#loginEmail") : $("#registerEmail");
  requestAnimationFrame(() => firstInput.focus());
}

$$("[data-auth-tab]").forEach((button) => {
  button.addEventListener("click", () => showAuthForm(button.dataset.authTab));
});

$("#quickPatientBtn").addEventListener("click", () => openPatientDialog());
$("#dashNewPatient").addEventListener("click", () => openPatientDialog());
$("#patientCreateBtn").addEventListener("click", () => openPatientDialog());
$("#appointmentCreateBtn").addEventListener("click", () => openAppointmentDialog());
$("#roomCreateBtn").addEventListener("click", () => openRoomDialog());
$("#roomRefreshBtn").addEventListener("click", renderRooms);
$("#roomAssignPatient").addEventListener("change", renderRoomAppointmentChoices);
$("#roomForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveRoomFromDialog(); } catch (error) { console.error(error); toast(T("No se pudo guardar el room.")); } });
$("#roomAssignForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await assignRoomFromDialog(); } catch (error) { console.error(error); toast(T("No se pudo asignar el room.")); } });
$("#ipadLaunchForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const form = event.currentTarget;
  if (form.dataset.sending === "true") return;
  form.dataset.sending = "true";
  const button = form.querySelector('[type="submit"]');
  if (button) button.disabled = true;
  try { await startPatientKiosk(); }
  catch (error) {
    console.error(error);
    const messages = {
      "no-activities": "Las actividades ya fueron completadas. Cierra esta ventana y vuelve a seleccionarlas.",
      "invalid-room": "El paciente asignado al room cambió. Actualiza Rooms y vuelve a intentar.",
      "forbidden": "Tu usuario no tiene permiso para abrir este portal.",
      "unauthenticated": "Tu sesión venció. Vuelve a iniciar sesión."
    };
    toast(messages[error.message] || (error instanceof TypeError ? T("No se pudo conectar al portal. Revisa internet y vuelve a intentar.") : T("No se pudo iniciar la pantalla del paciente. Actualiza Rooms e intenta nuevamente.")));
  } finally { form.dataset.sending = "false"; if (button) button.disabled = false; }
});
$("#ipadCreateTemplateBtn").addEventListener("click", () => { pendingRoomIpadId = $("#ipadRoomId").value; $("#ipadLaunchDialog").close(); openFormTemplateDialog(); });
$("#copyPatientPortalBtn").addEventListener("click", async () => { await navigator.clipboard.writeText($("#patientPortalUrl").value); toast(T("Enlace del Portal de Room copiado.")); });
$("#openPatientPortalBtn").addEventListener("click", () => window.open($("#patientPortalUrl").value, "_blank", "noopener"));
$("#kioskExitBtn").addEventListener("click", exitPatientKiosk);
$("#waitlistCreateBtn").addEventListener("click", openWaitlistDialog);
$("#taskCreateBtn").addEventListener("click", () => openTaskDialog());
$("#taskSearch").addEventListener("input", renderTasks); $("#taskStatusFilter").addEventListener("change", renderTasks); $("#taskTypeFilter").addEventListener("change", renderTasks);

$("#quickVisitBtn").addEventListener("click", () => openVisitDialog());
$("#dashNewAppointment").addEventListener("click", () => openAppointmentDialog());
$("#dashNewVisit").addEventListener("click", () => openVisitDialog());
$("#visitCreateBtn").addEventListener("click", () => openVisitDialog());

$("#patientSearch").addEventListener("input", renderPatients);
$("#visitSearch").addEventListener("input", renderVisits);
$("#invoiceSearch").addEventListener("input", renderInvoices);
$("#invoicePatientFilter").addEventListener("change", renderInvoices);
$("#billingSearch").addEventListener("input", renderBilling);
$("#billingStatusFilter").addEventListener("change", renderBilling);
$("#billingDateFrom").addEventListener("change", renderBilling);
$("#billingDateTo").addEventListener("change", renderBilling);
$("#billingInsuranceFilter").addEventListener("change", renderBilling);
$("#quickPaymentBtn").addEventListener("click", () => openPaymentDialog());
$("#expenseCreateBtn").addEventListener("click", openExpenseDialog); $("#cashClosingCreateBtn").addEventListener("click", openCashClosingDialog);
$("#printBillingBtn").addEventListener("click", printBillingReport);
$("#downloadBillingPdfBtn").addEventListener("click", downloadBillingPdf);
$("#paymentVisit").addEventListener("change", updatePaymentContext);
$("#paymentMethod").addEventListener("change", togglePaymentCardFields);
$("#paymentCardLast4").addEventListener("input", (event) => {
  event.target.value = event.target.value.replace(/\D/g, "").slice(0, 4);
  setFieldError(event.target, $("#paymentCardLast4Error"), "");
});
$("#patientFinancePaymentBtn").addEventListener("click", () => {
  $("#patientFinanceDialog").close();
  openPaymentDialog("", activeFinancePatientId);
});
$$('[data-billing-tab]').forEach((button) => button.addEventListener("click", () => {
  activeBillingTab = button.dataset.billingTab;
  $$('[data-billing-tab]').forEach((tab) => tab.classList.toggle("active", tab === button));
  renderBilling();
}));
$$('[data-patient-record-tab]').forEach((button) => button.addEventListener("click", () => selectPatientRecordTab(button.dataset.patientRecordTab)));
$("#downloadInvoiceBtn").addEventListener("click", () => downloadInvoicePdf());

$("#appointmentSearch").addEventListener("input", renderAppointments);
$("#appointmentStatusFilter").addEventListener("change", renderAppointments);
$("#appointmentDoctorFilter").addEventListener("change", renderAppointments);
$("#appointmentDateFilter").addEventListener("change", renderAppointments);
$$('[data-appointment-view]').forEach((button) => button.addEventListener("click", () => {
  appointmentView = button.dataset.appointmentView;
  localStorage.setItem("clinicAppointmentView", appointmentView);
  renderAppointments();
}));
$("#appointmentToday").addEventListener("click", () => { $("#appointmentDateFilter").value = localDateValue(); renderAppointments(); });
function shiftAppointmentDay(days) {
  const value = $("#appointmentDateFilter").value || localDateValue();
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + (appointmentView === "week" ? days * 7 : days));
  $("#appointmentDateFilter").value = localDateValue(date);
  renderAppointments();
}
$("#appointmentPrevDay").addEventListener("click", () => shiftAppointmentDay(-1));
$("#appointmentNextDay").addEventListener("click", () => shiftAppointmentDay(1));

$("#globalSearch").addEventListener("input", (event) => {
  const value = event.target.value.trim();
  if (!value) return;

  $("#patientSearch").value = value;
  showPage("patients");
});

$("#patientName").addEventListener("input", validatePatientForm);
$("#patientAge").addEventListener("input", validatePatientForm);
$("#patientPhone").addEventListener("input", validatePatientForm);
$("#patientEmail").addEventListener("input", validatePatientForm);
$("#patientEmailNotifications").addEventListener("change", validatePatientForm);
$("#patientSmsNotifications").addEventListener("change", validatePatientForm);
$("#patientBirthdayEmail").addEventListener("change", validatePatientForm);
$("#patientPayerType").addEventListener("change", () => {
  togglePatientInsuranceFields();
  validatePatientForm();
});
$("#patientInsuranceCompany").addEventListener("input", validatePatientForm);
$("#patientInsuranceMemberId").addEventListener("input", validatePatientForm);
$("#patientBirthDate").addEventListener("change", () => {
  const calculatedAge = ageFromBirthDate($("#patientBirthDate").value);
  if (calculatedAge !== "" && calculatedAge >= 0) $("#patientAge").value = calculatedAge;
  validatePatientForm();
});
$("#patientAlertMessage").addEventListener("input", () => {
  if ($("#patientAlertMessage").value.trim()) $("#patientAlertActive").checked = true;
});
$("#visitPaid").addEventListener("input", validateVisitForm);
$("#visitInsurancePaid").addEventListener("input", validateVisitForm);
$("#visitPaymentType").addEventListener("change", () => { toggleVisitInsuranceFields(); validateVisitForm(); });
$("#visitPatient").addEventListener("change", () => {
  if (!$("#visitId").value) {
    $("#visitPaymentType").value = patient($("#visitPatient").value)?.payerType === "insurance" ? "insurance" : "cash";
    toggleVisitInsuranceFields();
  }
  renderVisitPatientBanner();
});
$("#visitTotal").addEventListener("input", validateVisitForm);
$("#visitReason").addEventListener("input", validateVisitForm);
$("#addVisitLineItem").addEventListener("click", () => {
  renderVisitLineItems([...collectVisitLineItems(), { id: uid(), description: "", price: "" }]);
  $("#visitLineItems .service-line:last-child .service-description").focus();
});

$("#appointmentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const id = $("#appointmentId").value || uid();
  const existing = state.appointments.find((item) => item.id === id);
  const data = {
    id,
    patientId: $("#appointmentPatient").value,
    date: $("#appointmentDate").value,
    duration: Number($("#appointmentDuration").value || 30),
    type: $("#appointmentType").value,
    doctor: $("#appointmentDoctor").value.trim(),
    roomId: $("#appointmentRoom").value,
    roomName: roomById($("#appointmentRoom").value)?.name || "",
    status: $("#appointmentStatus").value,
    reason: $("#appointmentReason").value.trim(),
    reminderEnabled: $("#appointmentReminder").checked,
    notes: $("#appointmentNotes").value.trim(),
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    visitId: existing?.visitId || "",
    waitlistId: existing?.waitlistId || activeWaitlistId || ""
  };
  if (!data.patientId || !data.date || data.reason.length < 2) { toast(T("Completa paciente, fecha y motivo.")); return; }
  const recurrence = existing ? "none" : $("#appointmentRecurrence").value; const count = recurrence === "none" ? 1 : Number($("#appointmentRecurrenceCount").value || 2); const seriesId = count > 1 ? uid() : ""; const dates = recurringAppointmentDates(data.date, recurrence, count); const candidates = dates.map((date, index) => ({ ...data, id: index === 0 ? data.id : uid(), date, recurrence, seriesId, seriesIndex: index + 1, seriesCount: count }));
  for (const candidate of candidates) { const availabilityError = appointmentAvailabilityError(candidate); if (availabilityError) { toast(availabilityError); return; } const conflict = findAppointmentConflict(candidate); if (conflict) { const conflictPatient = patient(conflict.patientId); toast(S`Conflicto el ${fmtDate(candidate.date)} con ${conflictPatient?.name || T("otra cita")}.`); return; } }
  try { for (const candidate of candidates) await saveAppointment(candidate); if (data.waitlistId) await getCollectionRef("waitlist").doc(data.waitlistId).set({ status: "scheduled", appointmentId: candidates[0].id, scheduledAt: new Date().toISOString() }, { merge: true }); activeWaitlistId = null; $("#appointmentDialog").close(); $("#appointmentDateFilter").value = data.date.slice(0, 10); renderAppointments(); toast(existing ? T("Cita actualizada") : count > 1 ? `${count} citas recurrentes programadas` : T("Cita programada")); } catch (error) { console.error(error); toast(T("No se pudo guardar la cita")); }
});

$("#paymentForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const visit = state.visits.find((item) => item.id === $("#paymentVisit").value);
  const amount = Number($("#paymentAmount").value || 0);
  const method = $("#paymentMethod").value;
  const cardLast4 = $("#paymentCardLast4").value.replace(/\D/g, "");
  const message = !visit ? "Selecciona una factura." : amount <= 0 ? "Indica un monto mayor que cero." : amount > balance(visit) ? "El pago no puede superar el balance pendiente." : "";
  const cardMessage = method === "card" && cardLast4.length !== 4 ? "Escribe exactamente los últimos 4 dígitos." : "";
  setFieldError($("#paymentAmount"), $("#paymentAmountError"), message);
  setFieldError($("#paymentCardLast4"), $("#paymentCardLast4Error"), cardMessage);
  if (message || cardMessage || (method === "card" && !$("#paymentCardType").value)) return;
  const entry = { id: uid(), visitId: visit.id, patientId: visit.patientId, source: $("#paymentSource").value, amount, method, cardType: method === "card" ? $("#paymentCardType").value : "", cardLast4: method === "card" ? cardLast4 : "", date: $("#paymentDate").value, reference: $("#paymentReference").value.trim(), note: $("#paymentNote").value.trim(), createdAt: new Date().toISOString() };
  try {
    await registerPayment(entry, visit);
    const sourceField = entry.source === "insurance" ? "insurancePaid" : "patientPaid";
    visit[sourceField] = Number(visit[sourceField] || 0) + entry.amount;
    visit.paid = Number(visit.patientPaid || 0) + Number(visit.insurancePaid || 0);
    state.payments = [...state.payments.filter((item) => item.id !== entry.id), entry];
    renderVisitPaymentPanel(visit);
    $("#paymentDialog").close();
    toast(T("Pago aplicado correctamente"));
  } catch (error) { console.error(error); toast(T("No se pudo registrar el pago")); }
});

$("#taskForm").addEventListener("submit", async (event) => {
  event.preventDefault(); const id = $("#taskId").value || uid(); const existing = state.tasks.find((task) => task.id === id);
  const data = { id, title: $("#taskTitle").value.trim(), patientId: $("#taskPatient").value, type: $("#taskType").value, dueDate: $("#taskDueDate").value, priority: $("#taskPriority").value, description: $("#taskDescription").value.trim(), status: existing?.status || "open", createdAt: existing?.createdAt || new Date().toISOString(), createdBy: existing?.createdBy || auth.currentUser.uid, updatedAt: new Date().toISOString() };
  if (!data.title) return toast(T("Escribe el título de la tarea.")); try { await saveTask(data); $("#taskDialog").close(); toast(existing ? T("Tarea actualizada") : T("Tarea creada")); } catch (error) { console.error(error); toast(T("No se pudo guardar la tarea")); }
});

$("#patientForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  if (!validatePatientForm()) return;

  const id = $("#patientId").value;
  const data = {
    id: id || uid(),
    name: $("#patientName").value.trim(),
    phone: $("#patientPhone").value.trim(),
    email: $("#patientEmail").value.trim().toLowerCase(),
    address: $("#patientAddress").value.trim(),
    age: $("#patientAge").value,
    birthDate: $("#patientBirthDate").value,
    language: $("#patientLanguage").value,
    payerType: $("#patientPayerType").value,
    insuranceCompany: $("#patientPayerType").value === "insurance" ? $("#patientInsuranceCompany").value.trim() : "",
    insuranceMemberId: $("#patientPayerType").value === "insurance" ? $("#patientInsuranceMemberId").value.trim() : "",
    insuranceGroup: $("#patientPayerType").value === "insurance" ? $("#patientInsuranceGroup").value.trim() : "",
    emailNotificationsEnabled: $("#patientEmailNotifications").checked,
    smsNotificationsEnabled: $("#patientSmsNotifications").checked,
    birthdayEmailEnabled: $("#patientBirthdayEmail").checked,
    document: $("#patientDocument").value.trim(),
    notes: $("#patientNotes").value.trim(),
    source: $("#patientSource").value,
    lifecycle: $("#patientLifecycle").value,
    patientAlertMessage: $("#patientAlertMessage").value.trim(),
    patientAlertDate: $("#patientAlertMessage").value.trim() ? $("#patientAlertDate").value : "",
    patientAlertActive: Boolean($("#patientAlertMessage").value.trim() && $("#patientAlertActive").checked),
    patientAlertResolvedAt: $("#patientAlertMessage").value.trim() && $("#patientAlertActive").checked ? "" : (id ? state.patients.find((p) => p.id === id)?.patientAlertResolvedAt || "" : ""),
    createdAt: id ? state.patients.find((p) => p.id === id)?.createdAt : new Date().toISOString()
  };

  try {
    await savePatient(data);
    $("#patientDialog").close();
    render();
    toast(id ? T("Paciente actualizado") : T("Paciente registrado"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo guardar el paciente"));
  }
});

$("#visitForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  const total = Number($("#visitTotal").value || 0);
  const patientPaid = Number($("#visitPaid").value || 0);
  const insurancePaid = $("#visitPaymentType").value === "insurance" ? Number($("#visitInsurancePaid").value || 0) : 0;

  if (!validateVisitForm()) return;

  const id = $("#visitId").value;
  const recordId = id || uid();
  const existingVisit = state.visits.find((visit) => visit.id === id);
  const lineItems = collectVisitLineItems();
  const data = {
    id: recordId,
    patientId: $("#visitPatient").value,
    type: $("#visitType").value,
    date: $("#visitDate").value,
    doctor: $("#visitDoctor").value.trim(),
    roomId: $("#visitRoom").value,
    roomName: roomById($("#visitRoom").value)?.name || "",
    status: $("#visitStatus").value,
    reminderEnabled: $("#visitReminderEnabled").checked,
    reason: $("#visitReason").value.trim(),
    notes: $("#visitNotes").value.trim(),
    vitals: { bloodPressure: $("#visitBloodPressure").value.trim(), pulse: $("#visitPulse").value, temperature: $("#visitTemperature").value, weight: $("#visitWeight").value, height: $("#visitHeight").value, oxygen: $("#visitOxygen").value },
    soap: { subjective: $("#visitSubjective").value.trim(), objective: $("#visitObjective").value.trim(), assessment: $("#visitAssessment").value.trim(), plan: $("#visitPlan").value.trim() },
    diagnoses: linesFromText($("#visitDiagnoses").value),
    prescriptions: linesFromText($("#visitPrescriptions").value),
    lineItems,
    invoiceNumber: existingVisit?.invoiceNumber || `${state.settings.invoicePrefix || "FAC"}-${recordId.slice(0, 8).toUpperCase()}`,
    total,
    paid: patientPaid + insurancePaid,
    patientPaid,
    insurancePaid,
    paymentType: $("#visitPaymentType").value,
    claimStatus: $("#visitPaymentType").value === "insurance" ? $("#visitClaimStatus").value : "",
    claimNumber: $("#visitPaymentType").value === "insurance" ? $("#visitClaimNumber").value.trim() : "",
    copay: $("#visitPaymentType").value === "insurance" ? Number($("#visitCopay").value || 0) : 0,
    appointmentId: existingVisit?.appointmentId || pendingAppointmentId || "",
    documents: collectVisitDocuments(existingVisit?.documents)
  };

  try {
    await saveVisit(data);
    if (data.appointmentId) {
      const appointment = state.appointments.find((item) => item.id === data.appointmentId);
      if (appointment) await saveAppointment({ ...appointment, status: "completed", visitId: data.id, roomId: data.roomId || appointment.roomId || "", roomName: data.roomName || appointment.roomName || "", updatedAt: new Date().toISOString() });
    }
    if (data.roomId) await updateRoomStatus(data.roomId, "cleaning");
    pendingAppointmentId = null;
    showPage("visits");
    render();
    toast(id ? T("Consulta actualizada") : T("Consulta registrada"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudo guardar la consulta"));
  }
});

$("#settingsForm").addEventListener("submit", async (event) => {
  event.preventDefault();

  state.settings = {
    ...state.settings,
    clinicName: $("#clinicName").value.trim(),
    clinicAddress: $("#clinicAddress").value.trim(),
    clinicPhone: $("#clinicPhone").value.trim(),
    clinicEmail: $("#clinicEmail").value.trim(),
    invoicePrefix: ($("#invoicePrefix").value.trim().toUpperCase().replace(/[^A-Z0-9-]/g, "") || "FAC"),
    invoiceAccentColor: $("#invoiceAccentColor").value,
    invoiceLogoPosition: $("#invoiceLogoPosition").value,
    invoiceFooter: $("#invoiceFooter").value.trim(),
    invoiceShowAddress: $("#invoiceShowAddress").checked,
    invoiceShowPhone: $("#invoiceShowPhone").checked,
    invoiceShowEmail: $("#invoiceShowEmail").checked,
    invoiceShowDoctor: $("#invoiceShowDoctor").checked,
    invoiceShowInsurance: $("#invoiceShowInsurance").checked,
    scheduleOpenTime: $("#scheduleOpenTime").value || "08:00",
    scheduleCloseTime: $("#scheduleCloseTime").value || "18:00",
    scheduleBuffer: Number($("#scheduleBuffer").value || 0),
    scheduleDays: Array.from($$('[data-schedule-day]:checked')).map((input) => Number(input.dataset.scheduleDay))
  };

  try {
    await saveSettings();
    render();
    toast(T("Ajustes guardados"));
  } catch (error) {
    console.error(error);
    toast(T("No se pudieron guardar los ajustes"));
  }
});

$("#addDoctorBtn").addEventListener("click", addConfiguredDoctor);
$("#doctorNameInput").addEventListener("keydown", (event) => {
  if (event.key !== "Enter") return;
  event.preventDefault();
  addConfiguredDoctor();
});
$("#doctorSettingsList").addEventListener("click", (event) => {
  const button = event.target.closest("[data-remove-doctor]");
  if (button) removeConfiguredDoctor(button.dataset.removeDoctor);
});

$("#clinicLogoInput").addEventListener("change", async (event) => {
  try {
    state.settings.clinicLogo = await readLogoFile(event.target.files[0]);
    renderSettings();
    toast(T("Logo listo. Guarda los cambios para conservarlo."));
  } catch (error) {
    event.target.value = "";
    toast(error.message);
  }
});

$("#clinicDocumentInput").addEventListener("change", async (event) => {
  const files = [...event.target.files];
  if (!files.length) return;
  try {
    event.target.disabled = true;
    for (const file of files) await uploadClinicDocument(file);
    toast(S`${files.length} documento(s) cargado(s)`);
  } catch (error) {
    console.error(error);
    toast(error.message || T("No se pudieron subir los documentos"));
  } finally {
    event.target.disabled = false;
    event.target.value = "";
  }
});

$("#clearSignatureBtn").addEventListener("click", clearSignatureCanvas);
$("#saveSignatureBtn").addEventListener("click", saveCurrentSignature);

(() => {
  const canvas = $("#signatureCanvas");
  let drawing = false;
  const point = (event) => {
    const rect = canvas.getBoundingClientRect();
    return { x: event.clientX - rect.left, y: event.clientY - rect.top };
  };
  canvas.addEventListener("pointerdown", (event) => {
    drawing = true;
    canvas.setPointerCapture(event.pointerId);
    const context = canvas.getContext("2d");
    const current = point(event);
    context.beginPath();
    context.moveTo(current.x, current.y);
    event.preventDefault();
  });
  canvas.addEventListener("pointermove", (event) => {
    if (!drawing) return;
    const current = point(event);
    const context = canvas.getContext("2d");
    context.lineTo(current.x, current.y);
    context.stroke();
    signatureHasInk = true;
    event.preventDefault();
  });
  const stopDrawing = () => { drawing = false; };
  canvas.addEventListener("pointerup", stopDrawing);
  canvas.addEventListener("pointercancel", stopDrawing);
})();

$("#removeClinicLogo").addEventListener("click", () => {
  state.settings.clinicLogo = "";
  $("#clinicLogoInput").value = "";
  renderSettings();
  toast(T("Logo removido. Guarda los cambios."));
});

$("#addTeamMember").addEventListener("click", createTeamMember);
$("#createFormTemplateBtn").addEventListener("click", () => openFormTemplateDialog());
$("#addFormQuestionBtn").addEventListener("click", () => addFormQuestionRow());
$("#formTemplateForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveFormTemplateFromDialog(); } catch (error) { console.error(error); toast(T("No se pudo guardar la plantilla.")); } });
$("#addDocumentFieldBtn").addEventListener("click", () => addDocumentFieldRow());
$("#documentFieldsForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveDocumentFields(); } catch (error) { console.error(error); toast(T("No se pudo guardar la versión Room.")); } });
$("#patientDigitalForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await savePatientDigitalForm(); } catch (error) { console.error(error); toast(T("No se pudieron guardar las respuestas.")); } });
$("#communicationForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCommunication(); } catch (error) { console.error(error); toast(T("No se pudo registrar la comunicación.")); } });
$("#clinicalRecordForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveClinicalRecord(); } catch (error) { console.error(error); toast(T("No se pudo guardar el resumen clínico.")); } });
$("#leadCreateBtn").addEventListener("click", () => openLeadDialog()); $("#campaignCreateBtn").addEventListener("click", () => openCampaignDialog());
$("#leadSearch").addEventListener("input", renderCrm); $("#leadSourceFilter").addEventListener("change", renderCrm); $("#leadOwnerFilter").addEventListener("change", renderCrm);
$("#leadForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveLead(); } catch (error) { console.error(error); toast(T("No se pudo guardar el prospecto.")); } });
$("#campaignForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCampaign(); } catch (error) { console.error(error); toast(T("No se pudo guardar la campaña.")); } });
$("#waitlistForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveWaitlist(); } catch (error) { console.error(error); toast(T("No se pudo guardar la lista de espera.")); } });
$("#expenseForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveExpense(); } catch (error) { console.error(error); toast(T("No se pudo guardar el gasto.")); } });
$("#adjustmentForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveAdjustment(); } catch (error) { console.error(error); toast(T("No se pudo aplicar el ajuste.")); } });
$("#cashClosingForm").addEventListener("submit", async (event) => { event.preventDefault(); try { await saveCashClosing(); } catch (error) { console.error(error); toast(T("No se pudo guardar el cierre.")); } });
$("#cashClosingDate").addEventListener("change", updateCashClosingDifference); $("#cashCounted").addEventListener("input", updateCashClosingDifference);
$("#reportDateFrom").addEventListener("change", renderReports); $("#reportDateTo").addEventListener("change", renderReports); $("#reportDoctorFilter").addEventListener("change", renderReports); $("#exportAnalyticsCsvBtn").addEventListener("click", exportAnalyticsCsv);
$("#reportThisMonth").addEventListener("click", () => { const now = new Date(); $("#reportDateFrom").value = localDateValue(new Date(now.getFullYear(), now.getMonth(), 1)); $("#reportDateTo").value = localDateValue(now); renderReports(); });
$("#reportLast90").addEventListener("click", () => { const now = new Date(); const start = new Date(now); start.setDate(start.getDate() - 89); $("#reportDateFrom").value = localDateValue(start); $("#reportDateTo").value = localDateValue(now); renderReports(); });

["clinicName", "invoicePrefix", "invoiceAccentColor", "invoiceLogoPosition", "invoiceFooter"].forEach((id) => {
  document.getElementById(id).addEventListener("input", renderInvoiceStylePreview);
  document.getElementById(id).addEventListener("change", renderInvoiceStylePreview);
});

$("#exportBtn").addEventListener("click", () => {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `clinic-control-backup-${today()}.json`;
  link.click();
  URL.revokeObjectURL(url);
});

$("#logoutBtn").addEventListener("click", async () => {
  if (!auth) return;
  await auth.signOut();
  unsubscribeAll();
  clearState();
  showAuthScreen();
});

$("#loginForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  const email = $("#loginEmail").value.trim();
  const password = $("#loginPassword").value;

  if (!email || !password) {
    toast(T("Ingresa correo y contraseña."));
    return;
  }

  try {
    initFirebase();
    await auth.signInWithEmailAndPassword(email, password);
    toast(T("Sesión iniciada"));
  } catch (error) {
    console.error(error);
    toast(getAuthErrorMessage(error));
  }
});

$("#registerForm").addEventListener("submit", async (event) => {
  event.preventDefault();
  if (registrationInProgress) return;
  const clinicName = $("#registerClinicName").value.trim();
  const email = $("#registerEmail").value.trim().toLowerCase();
  const password = $("#registerPassword").value;
  const confirm = $("#registerConfirm").value;

  if (!clinicName || !email || !password || !confirm) {
    toast(T("Completa todos los campos de registro."));
    return;
  }

  if (clinicName.length < 2) {
    toast(T("Escribe un nombre válido para la clínica."));
    return;
  }

  if (password !== confirm) {
    toast(T("Las contraseñas no coinciden."));
    return;
  }

  if (password.length < 6) {
    toast(T("La contraseña debe tener al menos 6 caracteres."));
    return;
  }

  registrationInProgress = true;
  const submitButton = event.currentTarget.querySelector('[type="submit"]');
  submitButton.disabled = true;
  let createdUser = null;
  let settingsSaved = false;
  try {
    initFirebase();
    const credential = await auth.createUserWithEmailAndPassword(email, password);
    createdUser = credential.user;
    await firestore.collection("clinics").doc(credential.user.uid).collection("settings").doc("clinic").set({
      clinicName,
      clinicAddress: "",
      clinicPhone: "",
      clinicEmail: email,
      clinicLogo: "",
      invoicePrefix: "FAC",
      invoiceAccentColor: "#0f766e",
      invoiceLogoPosition: "left",
      invoiceFooter: "Gracias por confiar en nuestra clínica.",
      invoiceShowAddress: true,
      invoiceShowPhone: true,
      invoiceShowEmail: true,
      invoiceShowDoctor: true,
      invoiceShowInsurance: true
    }, { merge: true });
    settingsSaved = true;
    $("#registerForm").reset();
  } catch (error) {
    console.error(error);
    if (!createdUser) toast(getAuthErrorMessage(error, "register"));
  } finally {
    registrationInProgress = false;
    submitButton.disabled = false;
  }
  if (createdUser) {
    await handleAuthState(createdUser);
    showPage("dashboard");
    toast(settingsSaved ? T("Cuenta creada. Puedes completar los datos en Ajustes.") : T("Tu cuenta fue creada, pero no se guardaron los datos de la clínica. Complétalos en Ajustes; no necesitas registrarte otra vez."));
  }
});

$("#clinicSetupOpen").addEventListener("click", () => showPage("settings"));
$("#clinicSetupLater").addEventListener("click", () => { setupNoticeDismissedFor = activeClinicId; $("#clinicSetupNotice").classList.add("hidden"); });

$("#loginShowPassword").addEventListener("change", (event) => {
  $("#loginPassword").type = event.target.checked ? "text" : "password";
});

$("#registerShowPassword").addEventListener("change", (event) => {
  const show = event.target.checked;
  $("#registerPassword").type = show ? "text" : "password";
  $("#registerConfirm").type = show ? "text" : "password";
});

window.addEventListener("clinic-language-change", () => {
  // Re-render system copy without dropping an in-progress form or changing data.
  const fields = [...document.querySelectorAll("input[id],select[id],textarea[id]")].filter(node => node.type !== "file").map(node => ({ id: node.id, value: node.value, checked: node.checked }));
  const focused = document.activeElement?.id;
  if (activeClinicId && auth?.currentUser) {
    const pageId = document.querySelector(".page.active")?.id || "dashboard";
    showPage(pageId);
    updateUserInfo();
  }
  for (const field of fields) {
    const node = document.getElementById(field.id);
    if (node) { node.value = field.value; if ("checked" in node) node.checked = field.checked; node.setCustomValidity?.(""); }
  }
  for (const id of ["patientDialogTitle", "patientSubmitBtn", "visitDialogTitle", "appointmentDialogTitle", "taskDialogTitle", "leadDialogTitle", "campaignDialogTitle", "saveSignatureBtn"]) ClinicI18n.refreshSystemText(document.getElementById(id));
  if (focused) document.getElementById(focused)?.focus({ preventScroll: true });
});

async function handleAuthState(user) {
  if (registrationInProgress) return;
  if (user) {
    try {
      await resolveUserAccess(user);
      updateUserInfo();
      applyRoleAccess();
      showAppScreen();
      await loadClinicData();
      await window.ClinicCommerce?.refreshAccess(user);
    } catch (error) {
      console.error(error);
      toast(error.message || T("No se pudo cargar datos de la clínica."));
      if (String(error.message || "").includes("desactivada")) await auth.signOut();
      else showAppScreen();
    }
  } else {
    activeClinicId = null;
    window.ClinicCommerce?.refreshAccess(null);
    currentAccess = { role: "admin", status: "active", name: "" };
    showAuthScreen();
  }
}

(async () => {
  try {
    initFirebase();
    auth.onAuthStateChanged(handleAuthState, (error) => {
      console.error(error);
      toast(T("Error de autenticación."));
    });
  } catch (error) {
    console.error(error);
    toast(T("No se pudo inicializar Firebase"));
  }
})();
