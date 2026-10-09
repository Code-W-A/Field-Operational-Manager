import assert from "node:assert/strict";
import { loadEnvConfig } from "@next/env";
async function main() {
  loadEnvConfig(process.cwd());
  assert.equal(process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID, "field-operational-manager");
  assert.notEqual(process.env.NEXT_PUBLIC_USE_FIREBASE_EMULATORS, "true");
  assert(!process.env.FIRESTORE_EMULATOR_HOST && !process.env.FIREBASE_AUTH_EMULATOR_HOST);
  assert(process.env.E2E_TECH_EMAIL, "Contul tehnician E2E lipsește.");
  const { adminDb, adminAuth, adminApp } = await import("../lib/firebase/admin");
  const { technicianService } = await import("../lib/technician/service");
  const { assertBundle, visibleWork } = await import("../packages/fom-domain");
  const { deleteApp } = await import("firebase-admin/app");
  try {
    const identity = await adminAuth.getUserByEmail(process.env.E2E_TECH_EMAIL);
    const service = technicianService(adminDb);
    const actor = await service.actor(identity.uid);
    const bundle = await service.bundle(identity.uid);
    assertBundle(bundle);
    const [byUid, byName] = await Promise.all([
      adminDb.collection("lucrari").where("technicianIds", "array-contains", identity.uid).get(),
      actor.displayName ? adminDb.collection("lucrari").where("tehnicieni", "array-contains", actor.displayName).get() : Promise.resolve({ docs: [] }),
    ]);
    const expected = [...new Map([...byUid.docs, ...byName.docs].map(d => [d.id, { ...d.data(), id: d.id }])).values()].filter(w => visibleWork(w, actor));
    assert.deepEqual(bundle.works.map(w => w.id).sort(), expected.map(w => w.id).sort());
    console.log(JSON.stringify({ projectId: adminApp.options.projectId, profileRole: actor.role,
      realWorks: bundle.works.length, matchesFirestore: true, employeeAssociationError: bundle.employeeAssociationError || null }));
  } finally { await deleteApp(adminApp); }
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
