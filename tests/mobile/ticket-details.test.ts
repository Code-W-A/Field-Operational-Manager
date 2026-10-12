import { before, after, test } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { technicianService } from "../../lib/technician/service";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw new Error("Local Emulator only");
const prefix = `details-${Date.now()}`;
const app = initializeApp({ projectId: "demo-fom-mobile-auth" }, prefix);
const db = getFirestore(app),
  service = technicianService(db);
before(async () => {
  await db
    .doc(`users/${prefix}`)
    .set({ role: "tehnician", displayName: prefix });
  await db.doc(`clienti/${prefix}`).set({
    nume: "Client Details",
    telefon: "0700000000",
    cui: "RO123",
    regCom: "PRIVATE-REG",
    privateAccountNotes: "PRIVATE-ACCOUNT",
    locatii: [
      {
        id: "allowed",
        nume: "Sediu",
        adresa: "Adresă",
        echipamente: [
          {
            id: "eq",
            cod: "QR",
            denumire: "Unitate",
            model: "Model",
            documentationFolderId: prefix,
            documentationFileIds: [`${prefix}-selected`],
          },
          { id: "foreign", cod: "PRIVATE-EQUIPMENT" },
        ],
      },
      { id: "foreign", nume: "PRIVATE-LOCATION", echipamente: [] },
    ],
  });
  for (const kind of ["selected", "not-selected"])
    await db
      .doc(`documentatii_files/${prefix}-${kind}`)
      .set({
        folderId: prefix,
        subfolderId: null,
        name: kind,
        downloadUrl: `https://example.test/${kind}`,
      });
  for (const [i, tipLucrare] of [
    "Intervenție",
    "Intervenție în garanție",
    "Revizie",
    "Instalare",
  ].entries())
    await db
      .doc(`lucrari/${prefix}-${i}`)
      .set({
        clientId: prefix,
        client: "Client Details",
        locationId: "allowed",
        locatie: "Sediu",
        equipmentId: "eq",
        echipamentCod: "QR",
        equipmentIds: ["eq"],
        tipLucrare,
        statusLucrare: "Atribuită",
        tehnicieni: [prefix],
        updatedAt: Timestamp.now(),
      });
  await db
    .doc(`lucrari/${prefix}-unassigned`)
    .set({
      clientId: prefix,
      client: "Client Details",
      locationId: "foreign",
      locatie: "PRIVATE-LOCATION",
      tipLucrare: "Intervenție",
      statusLucrare: "Atribuită",
      tehnicieni: ["someone-else"],
    });
});
after(() => deleteApp(app));
test("all ticket types receive read-only details, scoped documentation and client locations", async () => {
  const bundle = await service.bundle(prefix);
  assert.equal(bundle.works.length, 4);
  assert.equal(typeof bundle.dashboardOverdueConfig?.intarziateEnabled, "boolean");
  assert.equal(typeof bundle.dashboardOverdueConfig?.intarziateTodayRequiresAfter18, "boolean");
  for (const work of bundle.works) {
    assert.equal(work.mobileClient?.phone, "0700000000");
    assert.equal(work.mobileEquipment?.[0].model, "Model");
    assert.deepEqual(
      work.mobileEquipment?.[0].documentation?.map((doc) => doc.id),
      [`${prefix}-selected`],
    );
    assert.equal(
      (await db.doc(`lucrari/${work.id}`).get()).data()?.mobileClient,
      undefined,
    );
  }
  const client = bundle.clients.find((c) => c.id === prefix)!;
  assert.equal(client.locatii?.length, 1);
  assert.equal(client.locatii?.[0].echipamente?.length, 1);
  const json = JSON.stringify(bundle);
  assert(!json.includes("PRIVATE-"));
  assert(!json.includes("not-selected"));
});

test("bootstrap reads overdue configuration without exposing setting metadata", async () => {
  const ref = db.doc(
    "predefinedSettings/dashboard_intarziate_include_today_after_18",
  );
  const previous = await ref.get();
  try {
    await ref.set({ value: false, internalNote: "PRIVATE-DASHBOARD-SETTING" });
    const bundle = await service.bundle(prefix);
    assert.equal(
      bundle.dashboardOverdueConfig?.intarziateTodayRequiresAfter18,
      false,
    );
    assert(!JSON.stringify(bundle).includes("PRIVATE-DASHBOARD-SETTING"));
  } finally {
    if (previous.exists) await ref.set(previous.data()!);
    else await ref.delete();
  }
});
