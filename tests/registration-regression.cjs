const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const source = fs.readFileSync('app.js', 'utf8');
const start = source.indexOf('$("#registerForm").addEventListener("submit"');
const end = source.indexOf('\n$("#clinicSetupOpen")', start);
assert.ok(start >= 0 && end > start);
function harness({ failAuth = false, failSettings = false } = {}) {
  const values = { registerClinicName: 'Clínica de prueba', registerEmail: '  TEST@example.test ', registerPassword: 'password-test', registerConfirm: 'password-test' };
  const log = { messages: [], calls: 0, writes: [], ready: 0 };
  const button = { disabled: false };
  let submit;
  const form = { querySelector: () => button, reset() { log.reset = true; }, addEventListener(_, fn) { submit = fn; } };
  const context = vm.createContext({ registrationInProgress: false, console: { error() {} },
    $: (selector) => selector === '#registerForm' ? form : ({ value: values[selector.slice(1)] }),
    toast: (message) => log.messages.push(message), initFirebase() {},
    getAuthErrorMessage: () => 'Error de registro', showPage: (page) => { log.page = page; },
    handleAuthState: async () => { assert.equal(context.registrationInProgress, false); log.ready++; },
    auth: { createUserWithEmailAndPassword: async (email) => {
      log.calls++; assert.equal(email, 'test@example.test'); assert.equal(button.disabled, true);
      await Promise.resolve();
      if (failAuth) throw new Error('auth/email-already-in-use');
      return { user: { uid: 'new-clinic' } };
    } },
    firestore: { collection: (name) => { assert.equal(name, 'clinics'); return { doc: (uid) => {
      assert.equal(uid, 'new-clinic'); return { collection: () => ({ doc: () => ({ set: async (data) => {
        assert.equal(context.registrationInProgress, true);
        if (failSettings) throw new Error('permission-denied');
        log.writes.push(data);
      } }) }) };
    } }; } }
  });
  vm.runInContext(source.slice(start, end), context);
  return { log, values, button, submit: () => submit({ preventDefault() {}, currentTarget: form }) };
}
async function main() {
  let test = harness();
  await Promise.all([test.submit(), test.submit()]);
  assert.equal(test.log.calls, 1);
  assert.equal(test.log.ready, 1);
  assert.equal(test.log.page, 'dashboard');
  assert.equal(test.log.writes[0].clinicName, 'Clínica de prueba');
  assert.equal(test.log.writes[0].clinicAddress, '');
  assert.equal(test.log.writes[0].clinicPhone, '');
  assert.equal(test.log.writes[0].clinicLogo, '');
  assert.equal(test.log.writes[0].senderEmail, undefined);
  assert.equal(test.button.disabled, false);
  for (const values of [{ registerClinicName: ' ' }, { registerPassword: '123', registerConfirm: '123' }, { registerConfirm: 'different' }]) {
    test = harness(); Object.assign(test.values, values); await test.submit();
    assert.equal(test.log.calls, 0);
    assert.equal(test.log.messages.length, 1);
  }
  test = harness({ failAuth: true }); await test.submit();
  assert.equal(test.log.ready, 0); assert.equal(test.log.writes.length, 0); assert.equal(test.button.disabled, false);
  test = harness({ failSettings: true }); await test.submit();
  assert.equal(test.log.ready, 1);
  assert.match(test.log.messages[0], /no necesitas registrarte otra vez/);
  const html = fs.readFileSync('index.html', 'utf8');
  assert.doesNotMatch(html, /id="registerClinic(?:Logo|Address|Phone)"/);
  for (const id of ['clinicLogoInput', 'clinicAddress', 'clinicPhone']) assert.ok(html.includes(`id="${id}"`));
  console.log('Registration checks passed: minimal fields, validation, duplicate clicks, owner settings, auth failure and partial creation recovery.');
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
