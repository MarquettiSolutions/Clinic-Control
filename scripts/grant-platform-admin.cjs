"use strict";
// Run only in a trusted administrative environment with Application Default Credentials.
// Dry run by default; neither browser storage nor Firestore profiles can grant this role.
const adminRequire = require("node:module").createRequire(require("node:path").resolve(__dirname, "../functions/package.json"));
const { initializeApp } = adminRequire("firebase-admin/app");
const { getAuth } = adminRequire("firebase-admin/auth");
const email = process.argv.find(arg => arg.startsWith("--email="))?.slice(8);
const projectId = process.argv.find(arg => arg.startsWith("--project="))?.slice(10);
if (!email || !projectId) {
  console.error("Usage: node scripts/grant-platform-admin.cjs --project=PROJECT_ID --email=OWNER_EMAIL [--apply | --revoke]");
  process.exit(1);
}
initializeApp({ projectId });
(async () => {
  const account = await getAuth().getUserByEmail(email);
  if (!account.emailVerified) throw new Error("Verify the account email before granting platform access.");
  console.log({ uid: account.uid, email: account.email, projectId, mode: process.argv.includes("--apply") ? "grant" : process.argv.includes("--revoke") ? "revoke" : "dry-run" });
  if (process.argv.includes("--apply") || process.argv.includes("--revoke")) {
    const claims = { ...account.customClaims };
    if (process.argv.includes("--revoke")) delete claims.platformAdmin;
    else claims.platformAdmin = true;
    await getAuth().setCustomUserClaims(account.uid, claims);
    if (process.argv.includes("--revoke")) await getAuth().revokeRefreshTokens(account.uid);
    console.log("Claims updated. Sign out and sign back in.");
  }
})().catch(error => { console.error(error.message); process.exitCode = 1; });
