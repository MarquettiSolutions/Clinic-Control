const assert = require('node:assert/strict');
const { initializeApp, deleteApp } = require('firebase/app');
const { getAuth, connectAuthEmulator, createUserWithEmailAndPassword, signOut, signInWithEmailAndPassword } = require('firebase/auth');
const { getFirestore, connectFirestoreEmulator, doc, setDoc, getDoc, terminate } = require('firebase/firestore');
const { initializeTestEnvironment } = require('@firebase/rules-unit-testing');
const fs = require('node:fs');

async function main() {
  assert.ok(process.env.FIREBASE_AUTH_EMULATOR_HOST && process.env.FIRESTORE_EMULATOR_HOST, 'This test requires local emulators; never run against production');
  const projectId = 'clinic-control-registration-test';
  const env = await initializeTestEnvironment({ projectId, firestore: { rules: fs.readFileSync('firestore.rules', 'utf8') } });
  const app = initializeApp({ projectId, apiKey: 'emulator-only' }, 'registration-test');
  const auth = getAuth(app);
  connectAuthEmulator(auth, `http://${process.env.FIREBASE_AUTH_EMULATOR_HOST}`, { disableWarnings: true });
  const db = getFirestore(app);
  const [host, port] = process.env.FIRESTORE_EMULATOR_HOST.split(':');
  connectFirestoreEmulator(db, host, Number(port));
  const email = `registration-${Date.now()}@example.test`;
  const password = 'Test-only-12345';
  try {
    const { user } = await createUserWithEmailAndPassword(auth, email, password);
    const settingsRef = doc(db, 'clinics', user.uid, 'settings', 'clinic');
    await setDoc(settingsRef, { clinicName: 'Clínica ficticia', clinicEmail: email, clinicLogo: '', clinicAddress: '', clinicPhone: '' });
    assert.equal((await getDoc(settingsRef)).data().clinicName, 'Clínica ficticia');
    await assert.rejects(setDoc(doc(db, 'clinics', 'other-clinic', 'settings', 'clinic'), { clinicName: 'Not allowed' }));
    await signOut(auth);
    await signInWithEmailAndPassword(auth, email, password);
    assert.equal(auth.currentUser.uid, user.uid);
    assert.equal((await getDoc(settingsRef)).data().clinicEmail, email);
    await assert.rejects(createUserWithEmailAndPassword(auth, email, password), (error) => error.code === 'auth/email-already-in-use');
    console.log('Registration integration passed: signup, own clinic creation, tenant isolation, sign-out, sign-in, and duplicate email.');
  } finally {
    await terminate(db);
    await deleteApp(app);
    await env.cleanup();
  }
}
main().catch((error) => { console.error(error); process.exitCode = 1; });
