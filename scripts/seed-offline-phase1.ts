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
    uid = "offline-tech";
  try {
    await auth.createUser({
      uid,
      email: "offline@fom.test",
      password: "FomTest123!",
      displayName: "Tehnician Offline",
    });
  } catch (e: any) {
    if (e.code !== "auth/uid-already-exists") throw e;
  }
  await db
    .doc(`users/${uid}`)
    .set({
      uid,
      email: "offline@fom.test",
      role: "tehnician",
      displayName: "Tehnician Offline",
    });
  await db
    .doc("users/offline-manager")
    .set({ role: "dispecer", displayName: "Dispecer Offline" });
  await db
    .doc("clienti/offline-client")
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
    .doc("attendance/offline-session")
    .set({
      userId: uid,
      status: "active",
      sessionStart: Timestamp.now(),
      mode: "field",
      employeeId: "offline-employee",
    });
  await db
    .doc("hrEmployees/offline-employee")
    .set({
      userUid: uid,
      nume: "Offline",
      prenume: "Tehnician",
      programLucru: { start: "08:00", end: "17:00" },
    });
  const work = {
    clientId: "offline-client",
    locationId: "loc",
    client: "Client Offline",
    locatie: "Atelier Offline",
    equipmentIds: ["eq"],
    echipamentId: "eq",
    echipamentCod: "OFFLINE-QR",
    equipmentId: "eq",
    echipament: "Pompa test",
    technicianIds: [uid],
    tehnicieni: ["Tehnician Offline"],
    statusLucrare: "În lucru",
    dataInterventie: new Date().toISOString().slice(0, 10),
    equipmentVerified: true,
    timpSosire: new Date().toISOString(),
    updatedAt: Timestamp.now(),
    nrLucrare: "OFFLINE-I",
    persoanaContact: "Beneficiar Test",
  };
  await db
    .doc("lucrari/offline-intervention")
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
    .doc("lucrari/offline-revision")
    .set({
      ...work,
      nrLucrare: "OFFLINE-R",
      tipLucrare: "Revizie",
      revision: {
        equipmentStatus: { eq: "in_progress" },
        equipment: [
          {
            equipmentId: "eq",
            equipmentName: "Pompa test",
            equipmentCode: "OFFLINE-QR",
          },
        ],
      },
      revisionEquipmentTimes: {
        eq: {
          verifiedAt: new Date().toISOString(),
          startIso: new Date().toISOString(),
        },
      },
    });
  await db
    .doc("lucrari/offline-revision/revisions/eq")
    .set({
      equipmentId: "eq",
      sections,
      photos: [],
      finalObservations: "",
      status: "draft",
    });
  const service = installationService(db),
    old = await db.doc("meta/offline-installation-fixture").get();
  let installation = old.data();
  if (!installation) {
    const w = await service.create(
      { uid: "offline-manager", role: "dispecer" },
      {
        clientId: "offline-client",
        locationId: "loc",
        client: "Client Offline",
        locatie: "Atelier Offline",
        contactId: "c",
        persoanaContact: "Beneficiar Test",
        telefon: "0700000000",
        persoanaContactEmail: "test@example.invalid",
        equipmentIds: ["eq"],
        tehnicieni: ["Tehnician Offline"],
        nrLucrare: "OFFLINE-S",
        dataEmiterii: "24.10.2026 10:00",
        dataInterventie: "24.10.2026 10:00",
      },
      randomUUID(),
    );
    const result = await service.start({ uid, role: "tehnician" }, w.id, {
      equipmentId: "eq",
      qrRaw: "OFFLINE-QR",
      requestId: randomUUID(),
    });
    installation = { workId: w.id, sheetId: result.sheet.id };
    await db.doc("meta/offline-installation-fixture").set(installation);
  }
  await db
    .doc(`mobileDraftAccess/${uid}`)
    .set({
      sessionId: "offline-session",
      confirmedAt: Date.now(),
      expiresAt: Date.now() + 86400000,
      workIds: [
        "offline-intervention",
        "offline-revision",
        installation.workId,
      ],
    });
  console.log(
    JSON.stringify({ uid, ...installation, email: "offline@fom.test" }),
  );
  await deleteApp(app);
}
main().catch((e) => {
  console.error(e);
  process.exitCode = 1;
});
