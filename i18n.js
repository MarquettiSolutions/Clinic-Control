/* Explicit, local localization. No remote translation and no patient-text scanning. */
(function(root) {
  const catalog = root.CLINIC_TRANSLATIONS || {};
  let language = "en";
  const storageKey = root.location?.pathname.endsWith("patient.html") ? "clinicPortalLanguage" : "clinicLanguage";
  try { language = localStorage.getItem(storageKey) === "es" ? "es" : "en"; } catch { /* Private browsing defaults to English. */ }
  const bindings = [];
  const normalize = value => String(value ?? "").replace(/\s+/g, " ").trim();
  function translate(value) {
    const source = String(value ?? "");
    if (language === "es") return source;
    const key = normalize(source);
    if (Object.prototype.hasOwnProperty.call(catalog, key)) return source.replace(source.trim(), catalog[key]);
    // Punctuation belongs to the system label, not to the interpolated data.
    const match = /^(.+?)([:.])$/.exec(key);
    if (match && catalog[match[1]]) return source.replace(source.trim(), catalog[match[1]] + match[2]);
    return source;
  }
  const encode = value => String(value).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  function authoredText(source) {
    const slots = [];
    const key = source.replace(/\uE000\d+\uE001/g, value => `{${slots.push(value) - 1}}`);
    if (catalog[normalize(key)]) return translate(key).replace(/\{(\d+)\}/g, (_, index) => slots[index]);
    return source.split(/(\uE000\d+\uE001)/).map(part => part.includes("\uE000") ? part : translate(part)).join("");
  }
  function html(strings, ...values) {
    const chunks = typeof strings === "string" ? [strings] : strings;
    // Translate only authored fragments. Runtime values (names, notes, amounts,
    // URLs, answers) are substituted AFTER translation, never inspected.
    let source = chunks.map((chunk, i) => chunk + (i < values.length ? `\uE000${i}\uE001` : "")).join("");
    source = source.replace(/<option\b([^>]*)>([^<>]*)<\/option>/g, (all, attrs, label) => /\bvalue\s*=/.test(attrs) || /\uE000/.test(label) ? all : `<option${attrs} value="${encode(label)}">${label}</option>`);
    source = source.replace(/<(span|small|strong|label|h[1-6]|p|button|option|th|dt|a)\b([^>]*)>([^<>]*)<\/\1>/g, (all, tag, attrs, copy) => {
      if (copy.includes("\uE000") || !catalog[normalize(copy)] || attrs.includes("data-system-copy")) return all;
      return `<${tag}${attrs} data-system-copy="${encode(copy)}">${copy}</${tag}>`;
    });
    source = source.replace(/>([^<>]+)</g, (all, text) => {
      if (!text.includes("\uE000")) return `>${translate(text)}<`;
      // Static parts on either side of an interpolation are also authored text.
      return `>${authoredText(text)}<`;
    });
    source = source.replace(/\b(placeholder|aria-label|title)="([^"\uE000]*)"/g, (_, attr, value) => `${attr}="${encode(translate(value))}"${catalog[normalize(value)] ? ` data-system-${attr}="${encode(value)}"` : ""}`);
    return source.replace(/\uE000(\d+)\uE001/g, (_, i) => String(values[Number(i)] ?? ""));
  }
  function sentence(strings, ...values) {
    if (typeof strings === "string") return translate(strings);
    const source = strings.map((part, i) => part + (i < values.length ? `\uE000${i}\uE001` : "")).join("");
    return authoredText(source).replace(/\uE000(\d+)\uE001/g, (_, i) => String(values[Number(i)] ?? ""));
  }
  function labels(source) {
    return new Proxy(source, { get(target, key) {
      const value = target[key];
      return typeof value === "string" ? translate(value) : value;
    } });
  }
  function refreshSystemText(node) {
    if (!node) return;
    const copy = node.textContent;
    const original = Object.keys(catalog).find(key => key === copy || catalog[key] === copy);
    if (original) node.textContent = translate(original);
  }
  function bindStatic() {
    if (!root.document) return;
    // Called exactly once before the app renders data. Only static source nodes
    // are bound; later patient records are never added to this collection.
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const node = walker.currentNode;
      if (node.parentElement?.closest("script,style,textarea,[translate=no],[data-language]")) continue;
      if (catalog[normalize(node.nodeValue)]) {
        if (node.parentElement.tagName === "OPTION" && !node.parentElement.hasAttribute("value")) node.parentElement.setAttribute("value", node.parentElement.textContent);
        bindings.push({ node, source: node.nodeValue });
      }
    }
    document.querySelectorAll("[placeholder],[title],[aria-label]").forEach(node => {
      for (const attr of ["placeholder", "title", "aria-label"]) {
        const source = node.getAttribute(attr);
        if (source && catalog[normalize(source)]) bindings.push({ node, attr, source });
      }
    });
  }
  function applyStatic() {
    document.documentElement.lang = language;
    document.title = storageKey === "clinicPortalLanguage" ? translate("Portal de Room") : language === "es" ? "Clinic Control | Tu clínica, conectada" : "Clinic Control | Your connected practice";
    for (const { node, attr, source } of bindings) {
      if (!node.isConnected) continue;
      if (attr) node.setAttribute(attr, translate(source));
      else node.nodeValue = translate(source);
    }
    document.querySelectorAll("[data-system-copy]").forEach(node => node.textContent = translate(node.dataset.systemCopy));
    for (const attr of ["placeholder", "title", "aria-label"]) document.querySelectorAll(`[data-system-${attr}]`).forEach(node => node.setAttribute(attr, translate(node.getAttribute(`data-system-${attr}`))));
    document.querySelectorAll("[data-language]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
  }
  function setLanguage(next) {
    if (!["en", "es"].includes(next)) return;
    language = next;
    try { localStorage.setItem(storageKey, language); } catch { /* Still switch this session. */ }
    applyStatic();
    root.dispatchEvent(new CustomEvent("clinic-language-change", { detail: { language } }));
    document.querySelectorAll("[data-language]").forEach(button => button.setAttribute("aria-pressed", String(button.dataset.language === language)));
  }
  root.ClinicI18n = { get language() { return language; }, get locale() { return language === "es" ? "es-US" : "en-US"; }, t: translate, html, sentence, labels, refreshSystemText, setLanguage, applyStatic };
  root.T = translate;
  root.H = html;
  root.S = sentence;
  bindStatic();
  applyStatic();
  document.addEventListener("invalid", event => {
    const input = event.target;
    if (typeof input.setCustomValidity !== "function") return;
    input.setCustomValidity("");
    const es = language === "es";
    if (input.validity.valueMissing) input.setCustomValidity(es ? "Completa este campo para continuar." : "Please complete this field to continue.");
    else if (input.validity.typeMismatch && input.type === "email") input.setCustomValidity(es ? "Escribe un correo electrónico válido." : "Please enter a valid email address.");
    else if (input.validity.tooShort) input.setCustomValidity(es ? `Usa al menos ${input.minLength} caracteres.` : `Use at least ${input.minLength} characters.`);
    else if (input.validity.rangeUnderflow) input.setCustomValidity(es ? `El mínimo permitido es ${input.min}.` : `The minimum allowed is ${input.min}.`);
    else if (input.validity.rangeOverflow) input.setCustomValidity(es ? `El máximo permitido es ${input.max}.` : `The maximum allowed is ${input.max}.`);
    else if (!input.validity.valid) input.setCustomValidity(es ? "Revisa el valor de este campo." : "Please check the value in this field.");
  }, true);
  document.addEventListener("input", event => event.target.setCustomValidity?.(""));
})(window);
