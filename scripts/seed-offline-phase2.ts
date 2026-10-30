import { initializeApp, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { MOBILE_TERMS_VERSION } from "../packages/fom-domain";
import { installationService } from "../lib/installations/service";
import { randomUUID } from "node:crypto";
async function main() {
  if (
    process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189" ||
    process.env.FIREBASE_AUTH_EMULATOR_HOST !== "127.0.0.1:9199"
  )
    throw Error("Local only");
  const app = initializeApp({ projectId: "demo-fom-mobile-auth" }),
    db = getFirestore(app),
    auth = getAuth(app),
    uid = "phase2-tech";
  try {
    await auth.createUser({
      uid,
      email: "phase2@fom.test",
      password: "FomTest123!",
      displayName: "Tehnician Faza2",
    });
  } catch (e: any) {
    if (e.code !== "auth/uid-already-exists") throw e;
  }
  await db
    .doc(`users/${uid}`)
    .set({
      uid,
      email: "phase2@fom.test",
      role: "tehnician",
      displayName: "Tehnician Faza2",
    });
  await db
    .doc("users/phase2-manager")
    .set({ role: "dispecer", displayName: "Dispecer Offline" });
  await db
    .doc("clienti/phase2-client")
    .set({
      nume: "Client Offline",
      locatii: [
        {
          id: "loc",
          nume: "Atelier Offline",
          persoaneContact: [
            {
              id: "c",
              nume: "Beneficiar Test",
              telefon: "0700000000",
              email: "test@example.invalid",
            },
          ],
          echipamente: [{ id: "eq", nume: "Pompa test", cod: "OFFLINE-QR" }],
        },
      ],
    });
  await db
    .doc(`mobileTermsAcceptances/${uid}/versions/${MOBILE_TERMS_VERSION}`)
    .set({ uid, version: MOBILE_TERMS_VERSION, acceptedAt: Timestamp.now() });
  await db
    .doc("attendance/phase2-session")
    .set({
      userId: uid,
      status: "active",
      sessionStart: Timestamp.now(),
      mode: "field",
      employeeId: "phase2-employee",
    });
  await db
    .doc("hrEmployees/phase2-employee")
    .set({
      userUid: uid,
      nume: "Offline",
      prenume: "Tehnician",
      programLucru: { start: "08:00", end: "17:00" },
    });
  await db.doc("settings/mobile-offline-phase2").set({enabledUserIds:[uid]});
  const work = {
    clientId: "phase2-client",
    locationId: "loc",
    client: "Client Offline",
    locatie: "Atelier Offline",
    equipmentIds: ["eq"],
    echipamentId: "eq",
    echipamentCod: "OFFLINE-QR",
    equipmentId: "eq",
    echipament: "Pompa test",
    technicianIds: [uid],
    tehnicieni: ["Tehnician Faza2"],
    statusLucrare: "Atribuită",
    dataInterventie: new Date().toISOString().slice(0, 10),
    equipmentVerified: false,

    updatedAt: Timestamp.now(),
    nrLucrare: "PHASE2-I",
    persoanaContact: "Beneficiar Test",
  };
  await db
    .doc("lucrari/phase2-intervention")
    .set({
      ...work,
      tipLucrare: "Intervenție contra cost",
      constatareLaLocatie: "Constatare inițială",
      descriereInterventie: "Operațiuni inițiale",
      statusEchipament: "Funcțional",
      cauzaPrincipalaDefectId: "uzura",
      cauzaPrincipalaDefect: "Uzură",
    });
  const sections = [
    {
      id: "s",
      title: "Control motor",
      items: [{ id: "i", label: "Starea motorului" }],
    },
  ];
  await db
    .doc("lucrari/phase2-revision")
    .set({
      ...work,
      nrLucrare: "PHASE2-R",
      tipLucrare: "Revizie",
      revision: {
        equipmentStatus: { eq: "pending" },
        equipment: [
          {
            equipmentId: "eq",
            equipmentName: "Pompa test",
            equipmentCode: "OFFLINE-QR",
          },
        ],
      },
    });
  await db
    .doc("lucrari/phase2-revision/revisions/eq")
    .set({
      equipmentId: "eq",
      sections,
      photos: [],
      finalObservations: "",
      status: "draft",
    });
  const service = installationService(db),
    old = await db.doc("meta/phase2-installation-fixture").get();
  let installation = old.data();
  if (!installation) {
    const w = await service.create(
      { uid: "phase2-manager", role: "dispecer" },
      {
        clientId: "phase2-client",
        locationId: "loc",
        client: "Client Offline",
        locatie: "Atelier Offline",
        contactId: "c",
        persoanaContact: "Beneficiar Test",
        telefon: "0700000000",
        persoanaContactEmail: "test@example.invalid",
        equipmentIds: ["eq"],
        tehnicieni: ["Tehnician Faza2"],
        nrLucrare: "PHASE2-S",
        dataEmiterii: new Date().toISOString(),
        dataInterventie: new Date().toISOString(),
      },
      randomUUID(),
    );
    installation = { workId: w.id };
    await db.doc("meta/phase2-installation-fixture").set(installation);
  }
  await db
    .doc(`mobileDraftAccess/${uid}`)
    .set({
      sessionId: "phase2-session",
      confirmedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      workIds: [
        "phase2-intervention",
        "phase2-revision",
        installation.workId,
      ],
    });
  console.log(
    JSON.stringify({ uid, ...installation, email: "phase2@fom.test" }),
  );
  await deleteApp(app);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
