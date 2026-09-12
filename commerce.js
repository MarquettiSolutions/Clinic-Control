/* Commercial surfaces are separate from patient billing and clinical permissions. */
(() => {
  const tr = (es, en) => window.ClinicI18n?.language === "es" ? es : en;
  const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  let ownerAccess = false;
  let ownerRows = [];
  let nextCursor = null;
  let busy = false;
  const landing = document.createElement("section");
  landing.id = "commercialHome";
  const dialog = document.createElement("dialog");
  dialog.id = "platformDialog";
  dialog.className = "platform-dialog";
  document.body.prepend(landing);
  document.body.append(dialog);

  function home() {
    landing.innerHTML = `<nav class="commercial-nav"><a href="#home" class="commercial-brand">✚ Clinic Control</a><div><button data-language="en" lang="en">English</button><button data-language="es" lang="es">Español</button><button data-login="login">${tr("Ingresar", "Sign in")}</button></div></nav>
    <div class="commercial-hero"><div><span class="commercial-eyebrow">${tr("PILOTO · DATOS DE DEMOSTRACIÓN", "PILOT · DEMONSTRATION DATA")}</span><h1>${tr("Una clínica organizada.<br>Más tiempo para cuidar.", "A connected practice.<br>More time for care.")}</h1><p>${tr("Coordina pacientes, citas, consultas y pagos desde un solo lugar. Diseñado para equipos que atienden en inglés y español.", "Bring patients, scheduling, visits, and payments together. Built for teams working in English and Spanish.")}</p><div class="commercial-actions"><button class="btn primary" data-login="register">${tr("Empezar el piloto", "Start the pilot")}</button><a class="btn light" href="#productTour">${tr("Conocer el producto", "Explore the product")}</a></div><small>${tr("Sin tarjeta. Los cobros de suscripción todavía no están habilitados.", "No card required. Subscription billing is not enabled yet.")}</small></div><article class="commercial-preview"><span>${tr("EJEMPLO ILUSTRATIVO · NO SON DATOS REALES", "PRODUCT PREVIEW · SAMPLE DATA ONLY")}</span><h2>${tr("Un día bajo control", "Your day, organized")}</h2><div class="commercial-metrics"><div><b>12</b>${tr("Citas", "Appointments")}</div><div><b>3</b>${tr("Salas", "Exam rooms")}</div><div><b>4</b>${tr("Tareas", "Tasks")}</div></div><p>9:30 <strong>${tr("Consulta de seguimiento", "Follow-up visit")}</strong></p><p>10:15 <strong>${tr("Evaluación inicial", "Initial assessment")}</strong></p><p>11:00 <strong>${tr("Control programado", "Scheduled check-in")}</strong></p></article></div>
    <section id="productTour" class="commercial-section"><h2>${tr("Del primer contacto al seguimiento", "From first contact to follow-up")}</h2><div class="commercial-grid">${[
      ["Agenda y recepción", "Scheduling & front desk", "Organiza citas, pacientes y tareas del equipo.", "Keep appointments, patient details, and team tasks in one place."],
      ["Room y formularios", "Exam rooms & digital forms", "Comparte actividades con el paciente mediante un enlace temporal.", "Give patients a temporary link to complete their assigned activities."],
      ["Pagos y reportes", "Payments & reporting", "Registra cobros y consulta balances con claridad.", "Record payments and get a clear view of outstanding balances."]
    ].map(([es,en,descEs,descEn]) => `<article><h3>${tr(es,en)}</h3><p>${tr(descEs,descEn)}</p></article>`).join("")}</div></section>
    <section class="commercial-section commercial-pilot"><div><h2>${tr("Pruébalo con tu equipo", "Try it with your team")}</h2><p>${tr("Esta versión está en validación. Usa datos ficticios; no cargues información clínica real hasta completar la revisión de seguridad y privacidad.", "This version is being validated. Use fictional data; do not upload real patient information before the security and privacy review is complete.")}</p></div><button class="btn primary" data-login="register">${tr("Crear cuenta de prueba", "Create a pilot account")}</button></section>
    <footer class="commercial-footer"><span>© ${new Date().getFullYear()} Clinic Control · ${tr("Versión piloto", "Pilot release")}</span><button data-platform="subscription">${tr("Planes y suscripción", "Plans & subscription")}</button><button data-platform="owner">${tr("Administración de plataforma", "Platform administration")}</button></footer>`;
  }

  function notice(message) {
    const node = dialog.querySelector("[data-platform-notice]");
    if (node) { node.textContent = message; node.hidden = false; }
  }
  function unavailable() {
    return tr("Los cobros aún no están configurados. No se ha realizado ningún cargo ni creado una suscripción. Puedes continuar usando el piloto.", "Billing is not configured yet. You have not been charged and no subscription has been created. You can continue using the pilot.");
  }
  async function api(action, extra = {}) {
    if (!auth?.currentUser) throw new Error("sign-in-required");
    const token = await auth.currentUser.getIdToken();
    const response = await fetch(window.CLINIC_COMMERCE.apiUrl, { method: "POST", headers: { "Content-Type": "application/json", Authorization: `Bearer ${token}` }, body: JSON.stringify({ action, clinicId: activeClinicId, ...extra }) });
    const result = await response.json().catch(() => ({ error: "service-unavailable" }));
    if (!response.ok) throw new Error(result.error || "service-unavailable");
    return result;
  }
  function errorMessage(error) {
    if (error.message === "invalid-request") return tr("Revisa los campos: la fecha y los valores deben ser válidos.", "Check the fields: the date and values must be valid.");
    if (error.message === "not-found") return tr("Esta clínica ya no está disponible. Actualiza el directorio.", "This clinic is no longer available. Refresh the directory.");
    if (error.message === "billing-not-configured") return unavailable();
    if (["platform-access-required", "clinic-admin-required"].includes(error.message)) return tr("Esta cuenta no tiene permiso para realizar esta acción.", "This account does not have permission to perform this action.");
    if (error.message === "sign-in-required" || error.message === "unauthenticated") return tr("Inicia sesión para continuar.", "Please sign in to continue.");
    return tr("No se pudo conectar con la administración de plataforma. Puede faltar el despliegue del servicio. Tus datos de la clínica no se han modificado.", "The platform service could not be reached. The service may still need to be deployed. Your clinic data has not been changed.");
  }
  function shell(title, content) {
    dialog.classList.toggle("owner-console", dialog.dataset.view === "owner");
    dialog.innerHTML = `<div class="platform-header"><h2>${title}</h2><button class="btn light" data-platform-close aria-label="${tr("Cerrar", "Close")}">×</button></div><div class="platform-content">${content}<p data-platform-notice role="status" hidden></p></div>`;
    const headings = [...dialog.querySelectorAll("th")].map(th => th.textContent.trim());
    dialog.querySelectorAll("tbody tr").forEach(row => [...row.cells].forEach((cell, index) => {
      if (headings[index] && !cell.hasAttribute("colspan")) cell.dataset.label = headings[index];
      const select = cell.querySelector("select");
      if (select && headings[index]) select.setAttribute("aria-label", headings[index]);
    }));
    if (!dialog.open) dialog.showModal();
  }
  function subscription() {
    dialog.dataset.view = "subscription";
    shell(tr("Suscripción de Clinic Control", "Clinic Control subscription"), `<span class="commercial-eyebrow">${tr("PILOTO · SIN COBROS", "PILOT · NO CHARGES")}</span><p>${tr("Este apartado corresponde a la mensualidad del software, no a los pagos de tus pacientes.", "This section is for your software subscription, not your patients’ payments.")}</p><h3>${tr("Planes disponibles al lanzamiento", "Paid plans coming at launch")}</h3><p>${tr("El precio y los límites se confirmarán antes de activar cualquier suscripción.", "Pricing and plan limits will be confirmed before any subscription is activated.")}</p><div class="commercial-actions"><button class="btn primary" data-platform-checkout>${tr("Continuar al pago", "Continue to payment")}</button><button class="btn light" data-platform-billing>${tr("Facturas y método de pago", "Invoices & payment method")}</button></div><p>${tr("El piloto no se convierte automáticamente en una suscripción de pago.", "The pilot does not automatically become a paid subscription.")}</p>`);
  }
  async function owner(loadMore = false) {
    dialog.dataset.view = "owner";
    if (!ownerAccess) {
      shell(tr("Administración de plataforma", "Platform administration"), `<p>${tr("Solo está disponible para la cuenta del dueño con autorización administrativa. Ser administrador de una clínica no concede este permiso.", "This area is restricted to an authorized platform owner. Being a clinic administrator does not grant this permission.")}</p><p>${auth?.currentUser ? tr("Tu cuenta aún no tiene habilitado este acceso.", "Platform access has not been enabled for your account.") : tr("Inicia sesión con tu cuenta de dueño.", "Sign in with your owner account.")}</p>${!auth?.currentUser ? `<button class="btn primary" data-login="login">${tr("Ingresar", "Sign in")}</button>` : !auth.currentUser.emailVerified ? `<button class="btn primary" data-verify-email>${tr("Verificar mi correo", "Verify my email")}</button>` : ""}`);
      return;
    }
    shell(tr("Administración de plataforma", "Platform administration"), `<p>${tr("Cargando directorio…", "Loading directory…")}</p>`);
    try {
      const uid = auth.currentUser.uid;
      const result = await api("ownerOverview", loadMore ? { cursor: nextCursor } : {});
      if (!ownerAccess || auth.currentUser?.uid !== uid) return;
      ownerRows = loadMore ? [...ownerRows, ...result.clinics] : result.clinics;
      nextCursor = result.nextCursor;
      window.ClinicOwnerDashboard.show({ shell, api, notice, errorMessage, reload: () => owner() }, ownerRows, Boolean(nextCursor));
    } catch (error) { notice(errorMessage(error)); }
  }
  async function refreshAccess(user) {
    ownerAccess = false;
    document.querySelectorAll("[data-owner-only]").forEach(node => node.hidden = true);
    if (!user) { ownerRows = []; nextCursor = null; window.ClinicOwnerDashboard?.clear(); if (dialog.open) dialog.close(); return; }
    try { ownerAccess = (await user.getIdTokenResult()).claims.platformAdmin === true; }
    catch { /* Deny access when claims cannot be verified. */ }
    document.querySelectorAll("[data-owner-only]").forEach(node => node.hidden = !ownerAccess);
    if (currentAccess.role === "admin") await api("syncClinic").catch(() => {});
    if (location.hash === "#platform") owner();
  }
  function installMenu() {
    const nav = document.querySelector(".sidebar .nav");
    if (!nav) return;
    const group = document.createElement("div");
    group.className = "platform-menu";
    group.innerHTML = `<button class="btn light" data-platform="subscription">${tr("Suscripción", "Subscription")}</button><button class="btn light" data-platform="owner" data-owner-only hidden>${tr("Panel del dueño", "Owner dashboard")}</button>`;
    nav.after(group);
    const language = document.createElement("div");
    language.className = "app-language-switch";
    language.innerHTML = `<button type="button" data-language="en" lang="en">English</button><button type="button" data-language="es" lang="es">Español</button><a href="#home" data-home>Clinic Control</a>`;
    document.body.append(language);
  }
  document.addEventListener("click", async event => {
    const target = event.target.closest("button, a");
    if (!target) return;
    if (target.dataset.language) { window.ClinicI18n?.setLanguage(target.dataset.language); return; }
    if (target.hasAttribute("data-home")) { if (!auth?.currentUser) document.body.classList.add("marketing-mode"); }
    if (target.dataset.login) { if (dialog.open) dialog.close(); document.body.classList.remove("marketing-mode"); showAuthForm(target.dataset.login); }
    if (target.dataset.platform) { if (target.dataset.platform === "owner") { history.replaceState(null, "", "#platform"); owner(); } else subscription(); }
    if (target.hasAttribute("data-platform-close")) { dialog.close(); if(location.hash === "#platform") history.replaceState(null, "", location.pathname + location.search); }
    if (target.hasAttribute("data-platform-checkout") || target.hasAttribute("data-platform-billing")) notice(unavailable());
    if (target.hasAttribute("data-verify-email") && !busy) {
      busy = true; target.disabled = true;
      try { await auth.currentUser.sendEmailVerification(); notice(tr("Te enviamos un enlace para verificar tu correo. Ábrelo y vuelve a iniciar sesión.", "A verification link has been sent to your email. Open it, then sign out and sign in again.")); }
      catch { notice(tr("No se pudo enviar el enlace. Espera un momento e inténtalo de nuevo.", "The verification link could not be sent. Wait a moment and try again.")); }
      finally { busy = false; target.disabled = false; }
    }
    if (target.hasAttribute("data-owner-more")) owner(true);
  });
  window.addEventListener("clinic-language-change", () => {
    home();
    document.querySelectorAll(".platform-menu").forEach(node => node.remove());
    document.querySelectorAll(".app-language-switch").forEach(node => node.remove());
    installMenu();
    document.querySelectorAll("[data-owner-only]").forEach(node => node.hidden = !ownerAccess);
    if (dialog.open) {
      if (dialog.dataset.view === "owner") { if (!window.ClinicOwnerDashboard.relocalize()) owner(); }
      else subscription();
    }
  });
  window.ClinicCommerce = { refreshAccess };
  home(); installMenu();
  if (location.hash === "#platform" && !auth?.currentUser) {
    document.body.classList.remove("marketing-mode");
    showAuthForm("login");
  }
})();
