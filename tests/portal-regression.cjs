const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const crypto = require('node:crypto');

// Exercise the actual HTTP handler against an isolated in-memory Firestore.
const records = new Map();
function doc(path) {
  return { path, id: path.split('/').pop(), collection: (name) => collection(`${path}/${name}`),
    get: async () => ({ exists: records.has(path), data: () => records.get(path), ref: doc(path) }) };
}
function collection(path) { return { doc: (id) => doc(`${path}/${id}`) }; }
const db = { doc, collection, runTransaction: async (callback) => {
  const pending = [];
  const result = await callback({ get: (ref) => ref.get(),
    set: (ref, data, options) => pending.push(() => records.set(ref.path, options?.merge ? { ...records.get(ref.path), ...data } : data)),
    update: (ref, data) => pending.push(() => records.set(ref.path, { ...records.get(ref.path), ...data })) });
  pending.forEach((write) => write());
  return result;
} };
const modules = {
  './platform': {},
  'firebase-functions/v2/scheduler': { onSchedule: () => {} },
  'firebase-functions/v2/https': { onRequest: (_, handler) => handler },
  'firebase-functions': { logger: { warn() {}, error() {} } },
  'firebase-admin/app': { initializeApp() {} },
  'firebase-admin/auth': { getAuth: () => ({ verifyIdToken: async () => ({ uid: 'clinic' }) }) },
  'firebase-admin/firestore': { getFirestore: () => db, FieldValue: { serverTimestamp: () => 'timestamp' } },
  'firebase-admin/storage': {},
  '@google-cloud/documentai': { v1: { DocumentProcessorServiceClient: class {} } },
  'pdf-lib': {}, crypto
};
const context = vm.createContext({ require: (name) => { assert.ok(name in modules, name); return modules[name]; }, exports: {}, Buffer, Date });
vm.runInContext(fs.readFileSync('functions/index.js', 'utf8'), context);
const key = crypto.createHash('sha256').update('TESTCODE').digest('hex');
const sessionPath = `patientPortalSessions/${key}`;
const roomPath = 'clinics/clinic/rooms/room';
function seed() {
  records.clear();
  records.set(sessionPath, { clinicId: 'clinic', roomId: 'room', patientId: 'patient', status: 'active', currentIndex: 0,
    expiresAt: { toMillis: () => Date.now() + 60000, toDate: () => new Date(Date.now() + 60000) },
    activities: [{ type: 'form', responseId: 'form' }] });
  records.set(roomPath, { patientId: 'patient', portalActive: true, portalSessionKey: key });
  records.set('clinics/clinic/formResponses/form', { patientId: 'patient', questions: [{ id: 'answer', required: true, label: 'Pregunta' }] });
}
async function request(body, method = 'POST', headers = {}) {
  const result = { statusCode: 200, headers: {} };
  const response = { set: (k, v) => { result.headers[k] = v; }, status: (value) => { result.statusCode = value; return response; },
    json: (data) => { result.body = data; }, send() {} };
  await context.exports.patientPortal({ method, body: { code: 'TESTCODE', ...body }, headers }, response);
  return result;
}
async function main() {
  seed();
  assert.equal((await request({}, 'OPTIONS')).headers['Access-Control-Allow-Origin'], 'https://marquettisolutions.github.io');
  assert.equal((await request({ action: 'complete' })).body.error, 'pending-activities');
  assert.equal(records.get(sessionPath).status, 'active');
  assert.equal((await request({ action: 'submitForm', responseId: 'form', answers: {} })).body.error, 'required');
  assert.equal((await request({ action: 'submitForm', responseId: 'form', answers: { answer: 'Sí' } })).body.ok, true);
  assert.equal(records.get(sessionPath).currentIndex, 1);
  assert.equal((await request({ action: 'submitForm', responseId: 'form', answers: { answer: 'duplicate' } })).body.error, 'invalid-activity');
  assert.equal(records.get(sessionPath).currentIndex, 1);
  assert.equal((await request({ action: 'complete' })).body.ok, true);
  assert.equal(records.get(roomPath).portalActive, false);
  assert.equal((await request({ action: 'complete' })).body.ok, true);
  assert.equal((await request({ action: 'get' })).body.error, 'invalid-session');
  seed(); records.get(roomPath).patientId = 'replacement';
  assert.equal((await request({ action: 'get' })).body.error, 'invalid-session');
  seed(); records.get(roomPath).portalSessionKey = 'new-link';
  assert.equal((await request({ action: 'get' })).body.error, 'invalid-session');
  seed(); records.get(sessionPath).expiresAt = { toMillis: () => 0 };
  assert.equal((await request({ action: 'get' })).body.error, 'invalid-session');
  seed(); records.get(sessionPath).currentIndex = 1;
  await assert.rejects(context.advancePortalSession(doc(sessionPath), 0, async () => {}), /invalid-activity/);
  seed(); records.set('clinics/clinic/patients/patient', { name: 'Paciente ficticio' });
  const created = await request({ action: 'create', clinicId: 'clinic', roomId: 'room', patientId: 'patient', activities: [{ type: 'form', responseId: 'form' }] }, 'POST', { authorization: 'Bearer test-token' });
  assert.equal(created.statusCode, 200);
  assert.ok(created.body.portalUrl.startsWith('https://marquettisolutions.github.io/Clinic-Control/patient.html?code='));
  assert.notEqual(records.get(roomPath).portalSessionKey, key);
  assert.equal((await request({ action: 'get' })).body.error, 'invalid-session');

  let drawnSignature = false;
  let addedSignaturePage = false;
  modules['pdf-lib'].StandardFonts = { Helvetica: 'regular', HelveticaBold: 'bold' };
  modules['pdf-lib'].PDFDocument = { load: async () => ({ embedFont: async () => ({}), getPages: () => [],
    embedPng: async () => ({ width: 400, height: 150 }),
    addPage: () => { addedSignaturePage = true; return { drawText() {}, drawImage() { drawnSignature = true; } }; },
    save: async () => new Uint8Array([1]) }) };
  const pdfContext = vm.createContext({ require: (name) => modules[name], exports: {}, Buffer, Date });
  vm.runInContext(fs.readFileSync('functions/index.js', 'utf8'), pdfContext);
  await pdfContext.createCompletedPdf({ source: Buffer.alloc(0), fields: [], answers: {}, signatureBytes: Buffer.alloc(0) });
  assert.ok(addedSignaturePage && drawnSignature, 'PDF without a detected signature field must still contain the signature');

  // Failed completion must keep the access code and offer a retry, never report success.
  const elements = new Map();
  const element = (id) => { if (!elements.has(id)) elements.set(id, { innerHTML: '', textContent: '', value: '', classList: { add() {}, remove() {} }, addEventListener() {} }); return elements.get(id); };
  const saved = new Map();
  const browser = vm.createContext({ T: value => value, ClinicI18n: { language: 'es' }, document: { querySelector: element, querySelectorAll: () => [] },
    sessionStorage: { getItem: (k) => saved.get(k), setItem: (k, v) => saved.set(k, v), removeItem: (k) => saved.delete(k) },
    window: { addEventListener() {}, location: { search: '', pathname: '/Clinic-Control/patient.html' } }, history: { replaceState() {} },
    URLSearchParams, setTimeout() {}, fetch: async () => { throw new TypeError('offline'); }, TypeError });
  vm.runInContext(fs.readFileSync('patient.js', 'utf8'), browser);
  saved.set('roomPortalCode', 'TESTCODE');
  await browser.finish();
  assert.equal(saved.get('roomPortalCode'), 'TESTCODE');
  assert.match(element('#content').innerHTML, /retryFinish/);
  assert.doesNotMatch(element('#content').innerHTML, /Todo quedó guardado/);
  browser.fetch = async () => ({ ok: true, json: async () => ({ ok: true }) });
  await browser.finish();
  assert.equal(saved.has('roomPortalCode'), false);
  assert.match(element('#content').innerHTML, /Todo quedó guardado/);
  console.log('Portal regression checks passed: origin, required fields, duplicate requests, atomic completion, stale links, expiry, and offline retry.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
