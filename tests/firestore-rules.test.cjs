const fs = require("fs");
const {
  initializeTestEnvironment,
  assertFails,
  assertSucceeds
} = require("@firebase/rules-unit-testing");
const { doc, getDoc, setDoc, updateDoc, deleteDoc } = require("firebase/firestore");

const projectId = "clinic-control-rules-test";
const clinicId = "clinic-owner";
const otherClinicId = "other-clinic";

async function main() {
  const env = await initializeTestEnvironment({
    projectId,
    firestore: { rules: fs.readFileSync("firestore.rules", "utf8") }
  });

  try {
    await env.withSecurityRulesDisabled(async (context) => {
      const db = context.firestore();
      const profiles = [
        ["reception-user", "reception"],
        ["clinical-user", "clinical"],
        ["accounting-user", "accounting"]
      ];
      for (const [uid, role] of profiles) {
        const profile = {
          uid,
          clinicId,
          name: `${role} test`,
          email: `${role}@clinic.test`,
          role,
          status: "active"
        };
        await setDoc(doc(db, "userProfiles", uid), profile);
        await setDoc(doc(db, "clinics", clinicId, "members", uid), profile);
      }
      await setDoc(doc(db, "clinics", clinicId, "patients", "patient-1"), { name: "Paciente ficticio" });
      await setDoc(doc(db, "clinics", clinicId, "visits", "visit-1"), { patientId: "patient-1" });
    });

    const owner = env.authenticatedContext(clinicId).firestore();
    const platformOwner = env.authenticatedContext("platform-owner", { platformAdmin: true }).firestore();
    await assertFails(setDoc(doc(owner, "platformClinics", clinicId), { status: "paid" }));
    await assertFails(setDoc(doc(platformOwner, "platformClinics", clinicId), { status: "paid" }));
    await assertFails(getDoc(doc(platformOwner, "clinics", clinicId, "patients", "patient-1")));
    const reception = env.authenticatedContext("reception-user").firestore();
    const clinical = env.authenticatedContext("clinical-user").firestore();
    const accounting = env.authenticatedContext("accounting-user").firestore();

    await assertSucceeds(setDoc(doc(owner, "clinics", clinicId, "settings", "clinic"), { clinicName: "Test" }));
    await assertFails(setDoc(doc(reception, "clinics", clinicId, "settings", "clinic"), { clinicName: "No permitido" }));

    await assertSucceeds(setDoc(doc(reception, "clinics", clinicId, "patients", "patient-2"), { name: "Paciente de recepción" }));
    await assertSucceeds(setDoc(doc(reception, "clinics", clinicId, "appointments", "appointment-1"), { patientId: "patient-1" }));
    await assertFails(setDoc(doc(reception, "clinics", clinicId, "visits", "visit-2"), { patientId: "patient-1" }));
    await assertFails(setDoc(doc(reception, "clinics", clinicId, "payments", "payment-1"), { amount: 10 }));

    await assertSucceeds(setDoc(doc(clinical, "clinics", clinicId, "visits", "visit-2"), { patientId: "patient-1" }));
    await assertSucceeds(getDoc(doc(clinical, "clinics", clinicId, "documents", "document-1")));
    await assertFails(setDoc(doc(clinical, "clinics", clinicId, "payments", "payment-2"), { amount: 10 }));
    await assertFails(setDoc(doc(clinical, "clinics", clinicId, "settings", "clinic"), { clinicName: "No permitido" }));

    await assertSucceeds(getDoc(doc(accounting, "clinics", clinicId, "visits", "visit-1")));
    await assertSucceeds(setDoc(doc(accounting, "clinics", clinicId, "payments", "payment-3"), { amount: 25 }));
    await assertSucceeds(setDoc(doc(accounting, "clinics", clinicId, "expenses", "expense-1"), { amount: 5 }));
    await assertFails(setDoc(doc(accounting, "clinics", clinicId, "patients", "patient-3"), { name: "No permitido" }));
    await assertFails(getDoc(doc(accounting, "clinics", clinicId, "clinicalRecords", "record-1")));

    await assertFails(getDoc(doc(reception, "clinics", otherClinicId, "patients", "patient-x")));
    await assertFails(setDoc(doc(accounting, "clinics", otherClinicId, "payments", "payment-x"), { amount: 99 }));

    await assertSucceeds(updateDoc(doc(owner, "userProfiles", "reception-user"), { role: "clinical", updatedAt: new Date().toISOString() }));
    await assertFails(updateDoc(doc(owner, "userProfiles", "reception-user"), { clinicId: otherClinicId, updatedAt: new Date().toISOString() }));
    await assertFails(updateDoc(doc(owner, "userProfiles", "reception-user"), { role: "superadmin", updatedAt: new Date().toISOString() }));
    await assertFails(deleteDoc(doc(owner, "userProfiles", "reception-user")));

    console.log("Firestore role tests passed: admin, reception, clinical, accounting, tenant isolation, and immutable profiles.");
  } finally {
    await env.cleanup();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
