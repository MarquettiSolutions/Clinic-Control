const ENDPOINT = "https://us-central1-clinic-control-6ff25.cloudfunctions.net/patientPortal";
let code = ""; let session = null; let requestPending = false;
const $ = (selector) => document.querySelector(selector);
const esc = (value = "") => String(value).replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" }[char]));
function say(message) { const notice = $("#notice"); notice.textContent = message; notice.classList.add("show"); setTimeout(() => notice.classList.remove("show"), 3000); }
function text(es, en) { return session?.language === "en" ? en : es; }
async function api(action, payload = {}) {
  if (requestPending) throw new Error(text("Espera a que termine el envío.", "Please wait for the current request."));
  requestPending = true;
  const buttons = [...document.querySelectorAll('button[type="submit"], button.submit')];
  buttons.forEach((button) => { button.disabled = true; });
  try {
    const response = await fetch(ENDPOINT, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, code, ...payload }) });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error === "invalid-session" ? "Este código venció o ya fue utilizado. Solicita un enlace nuevo." : data.label ? `${text("Completa", "Complete")}: ${data.label}` : "No se pudo guardar. Intenta nuevamente.");
    return data;
  } catch (error) {
    if (error instanceof TypeError) throw new Error("No hay conexión con el portal. Revisa internet e intenta nuevamente.");
    throw error;
  } finally {
    requestPending = false;
    buttons.forEach((button) => { button.disabled = false; });
  }
}
function questionHtml(q, index, value = "") { const required = q.required ? "required" : ""; const label = `${index + 1}. ${esc(q.label)}${q.required ? " *" : ""}`; if (q.type === "textarea") return `<label class="question"><span>${label}</span><textarea data-answer="${esc(q.id)}" ${required}>${esc(value)}</textarea></label>`; if (q.type === "select") return `<label class="question"><span>${label}</span><select data-answer="${esc(q.id)}" ${required}><option value="">—</option>${(q.options || []).map((option) => `<option ${option === value ? "selected" : ""}>${esc(option)}</option>`).join("")}</select></label>`; if (q.type === "yesno") return `<label class="question"><span>${label}</span><select data-answer="${esc(q.id)}" ${required}><option value="">—</option><option value="Sí" ${value === "Sí" ? "selected" : ""}>${text("Sí", "Yes")}</option><option value="No" ${value === "No" ? "selected" : ""}>No</option></select></label>`; return `<label class="question"><span>${label}</span><input data-answer="${esc(q.id)}" type="${q.type === "date" ? "date" : q.type === "number" ? "number" : "text"}" value="${esc(value)}" ${required}/></label>`; }
function render() { $("#clinicName").textContent = session.clinicName; $("#roomName").textContent = session.roomName; $("#activation").classList.add("hidden"); $("#workspace").classList.remove("hidden"); $("#lockBtn").classList.remove("hidden"); const total = session.activities.length; const index = session.currentIndex || 0; $("#progressText").textContent = `${text("Actividad", "Activity")} ${Math.min(index + 1, total)} ${text("de", "of")} ${total}`; $("#progressBar").style.width = total ? `${Math.min((index + 1) / total * 100, 100)}%` : "100%"; const item = session.activities[index]; if (!item) return finish(); if (item.type === "form") { $("#content").innerHTML = `<form id="form"><div class="welcome"><small>${text("Hola", "Hello")}</small><h1>${esc(session.firstName)}</h1><h2>${esc(item.title)}</h2><p>${esc(item.description || text("Contesta las siguientes preguntas.", "Please answer the following questions."))}</p></div><div class="questions">${item.questions.map((q, i) => questionHtml(q, i, item.answers?.[q.id] || "")).join("")}</div><button class="submit" type="submit">${text("Guardar y continuar", "Save and continue")}</button></form>`; $("#form").addEventListener("submit", submitForm); return; } renderDocument(item); }
async function activate(event) { event.preventDefault(); code = $("#accessCode").value.trim().toUpperCase(); try { session = await api("get"); sessionStorage.setItem("roomPortalCode", code); render(); } catch (error) { say(error.message); } }
async function submitForm(event) { event.preventDefault(); const item = session.activities[session.currentIndex]; const answers = Object.fromEntries(Array.from(document.querySelectorAll("[data-answer]")).map((input) => [input.dataset.answer, input.value.trim()])); try { await api("submitForm", { responseId: item.responseId, answers }); session.currentIndex += 1; render(); } catch (error) { say(error.message); } }
function renderDocument(item) { $("#content").innerHTML = `<form id="signatureForm"><div class="welcome"><small>${text("Documento digital", "Digital document")}</small><h1>${esc(item.title)}</h1><p>${text("Revisa el PDF, completa los campos y firma.", "Review the PDF, complete the fields, and sign.")}</p>${item.url ? `<a href="${esc(item.url)}" target="_blank" rel="noopener">${text("Abrir PDF", "Open PDF")}</a>` : ""}</div>${item.url ? `<iframe class="document-preview" src="${esc(item.url)}" title="${esc(item.title)}"></iframe>` : ""}<div class="questions">${(item.fields || []).map((field, index) => questionHtml(field, index, item.answers?.[field.id] || "")).join("")}</div><label class="question"><span>${text("Nombre de quien firma", "Signer name")} *</span><input id="signer" value="${esc(session.firstName)}" required /></label><div class="signature"><div><strong>${text("Firma con el dedo o Apple Pencil", "Sign with your finger or Apple Pencil")}</strong><button id="clear" type="button">${text("Limpiar", "Clear")}</button></div><canvas id="canvas"></canvas></div><label class="consent"><input id="consent" type="checkbox" required/><span>${text("Acepto usar esta firma electrónica.", "I agree to use this electronic signature.")}</span></label><button class="submit" type="submit">${text("Guardar y firmar", "Save and sign")}</button></form>`; initCanvas(); $("#signatureForm").addEventListener("submit", submitSignature); }
function initCanvas() { const canvas = $("#canvas"); canvas.width = Math.max(600, canvas.clientWidth * 2); canvas.height = 320; const ctx = canvas.getContext("2d"); ctx.scale(2, 2); ctx.lineWidth = 2.5; ctx.lineCap = "round"; let drawing = false; canvas.dataset.ink = "false"; const point = (e) => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; }; canvas.onpointerdown = (e) => { drawing = true; const p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); }; canvas.onpointermove = (e) => { if (!drawing) return; const p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke(); canvas.dataset.ink = "true"; }; canvas.onpointerup = canvas.onpointercancel = () => drawing = false; $("#clear").onclick = () => { ctx.clearRect(0, 0, canvas.width, canvas.height); canvas.dataset.ink = "false"; }; }
async function submitSignature(event) { event.preventDefault(); const item = session.activities[session.currentIndex]; const canvas = $("#canvas"); if (canvas.dataset.ink !== "true") return say(text("Dibuja la firma.", "Draw the signature.")); const answers = Object.fromEntries(Array.from(document.querySelectorAll("[data-answer]")).map((input) => [input.dataset.answer, input.value.trim()])); try { await api("signDocument", { visitId: item.visitId, documentId: item.documentId, answers, signedBy: $("#signer").value.trim(), consent: $("#consent").checked, signature: canvas.toDataURL("image/png") }); session.currentIndex += 1; render(); } catch (error) { say(error.message); } }
async function finish() {
  try { await api("complete"); }
  catch (error) {
    say(error.message);
    $("#content").innerHTML = `<p>${text("Falta confirmar el cierre con la clínica.", "The clinic has not confirmed completion yet.")}</p><button id="retryFinish" type="button">${text("Reintentar", "Retry")}</button>`;
    $("#retryFinish").addEventListener("click", finish);
    return;
  }
  sessionStorage.removeItem("roomPortalCode");
  history.replaceState(null, "", window.location.pathname);
  $("#progress").classList.add("hidden");
  $("#content").innerHTML = `<div class="done"><span>✓</span><h1>${text("¡Gracias!", "Thank you!")}</h1><p>${text("Todo quedó guardado. Entrega el iPad al personal.", "Everything has been saved. Return the iPad to staff.")}</p></div>`;
}
function lock() { code = ""; session = null; sessionStorage.removeItem("roomPortalCode"); history.replaceState(null, "", window.location.pathname); $("#content").innerHTML = ""; $("#progress").classList.remove("hidden"); $("#workspace").classList.add("hidden"); $("#activation").classList.remove("hidden"); $("#lockBtn").classList.add("hidden"); $("#accessCode").value = ""; }
$("#activationForm").addEventListener("submit", activate); $("#lockBtn").addEventListener("click", lock);
const linkCode = new URLSearchParams(window.location.search).get("code")?.trim().toUpperCase(); const savedCode = sessionStorage.getItem("roomPortalCode"); const startupCode = linkCode || savedCode;
if (startupCode) { code = startupCode; sessionStorage.setItem("roomPortalCode", code); api("get").then((data) => { session = data; render(); }).catch((error) => { lock(); say(error.message); }); }
