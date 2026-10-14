import { test } from "node:test";
import assert from "node:assert/strict";
import {
  ticketPresentation,
  ticketClientLocation,
} from "./ticket-presentation";
const work = {
  id: "w",
  clientId: "client",
  client: "Client",
  locationId: "loc",
  locatie: "Sediu",
  equipmentId: "eq",
  echipamentCod: "QR",
  tipLucrare: "Intervenție",
  statusLucrare: "Atribuită",
};
const client = {
  id: "client",
  nume: "Client",
  telefon: "office",
  email: "office@test.ro",
  cui: "123",
  reprezentantFirma: "Reprezentant",
  regCom: "private-reg",
  locatii: [
    {
      id: "loc",
      nume: "Sediu",
      adresa: "Adresă",
      persoaneContact: [
        {
          id: "contact",
          nume: "Contact",
          telefon: "contact-phone",
          email: "contact@test.ro",
        },
      ],
      echipamente: [
        {
          id: "eq",
          cod: "QR",
          denumire: "Unitate",
          model: "Model X",
          producator: "Nice",
          documentationFolderId: "folder",
          documentationSubfolderId: "sub",
          documentationFileIds: ["allowed"],
        },
        { id: "foreign", cod: "FOREIGN" },
      ],
    },
  ],
};
const record = (id: string) => ({
  id,
  data: () => ({
    folderId: "folder",
    subfolderId: "sub",
    name: id,
    downloadUrl: `https://example.test/${id}.pdf`,
    uploadedBy: "private-person",
    uploadedAt: new Date("2026-01-28T12:00:00Z"),
  }),
});
test("presentation limits equipment and docs to the ticket, and exports the web technician identity only", async () => {
  const queries: unknown[] = [];
  const query = {
    where: (...args: unknown[]) => {
      queries.push(args);
      return query;
    },
    get: async () => ({ docs: [record("allowed"), record("not-selected")] }),
  };
  const db = {
    collection: (name: string) => {
      assert.equal(name, "documentatii_files");
      return query;
    },
  };
  const data = await ticketPresentation(
    db as any,
    { ...work, contactId: "contact" },
    client,
  );
  assert.equal(data.mobileClient.phone, "office");
  assert.equal(data.mobileClient.cui, "123");
  assert.equal(data.mobileContact.address, "Adresă");
  assert.equal(data.mobileContact.phone, "contact-phone");
  assert.equal(data.mobileEquipment.length, 1);
  assert.equal(data.mobileEquipment[0].model, "Model X");
  assert.equal(data.mobileEquipment[0].producator, "Nice");
  assert.equal(data.mobileEquipment[0].documentationAssociated, true);
  assert.equal(data.mobileEquipment[0].documentation?.[0].uploadedAt,"2026-01-28T12:00:00.000Z");
  assert.deepEqual(
    data.mobileEquipment[0].documentation?.map((doc) => doc.id),
    ["allowed"],
  );
  assert.deepEqual(queries, [
    ["folderId", "==", "folder"],
    ["subfolderId", "==", "sub"],
  ]);
  assert(!JSON.stringify(data).includes("private-reg"));
  assert(!JSON.stringify(data).includes("private-person"));
});
test("missing client uses snapshots; failed docs query is different from no associated docs", async () => {
  const data = await ticketPresentation({} as any, {
    ...work,
    clientInfo: { telefon: "snapshot" },
    echipamentModel: "Legacy",
  });
  assert.equal(data.mobileClientUnavailable, true);
  assert.equal(data.mobileClient.phone, "snapshot");
  assert.equal(data.mobileEquipment[0].model, "Legacy");
  assert.deepEqual(data.mobileEquipment[0].documentation, []);
  assert.equal(data.mobileEquipment[0].documentationAssociated, false);
  const query = {
    where: () => query,
    get: async () => {
      throw new Error("Unavailable");
    },
  };
  const unavailable = await ticketPresentation(
    { collection: () => query } as any,
    work,
    client,
  );
  assert.equal(unavailable.mobileEquipment[0].documentationUnavailable, true);
});

test("legacy client equipment keeps cod/denumire fields and omits unrelated equipment and contacts", () => {
  const location = ticketClientLocation(
    {
      ...work,
      mobileContact: { location: "Sediu", address: "Adresă" },
      mobileEquipment: [{ id: "eq", code: "QR", name: "Unitate" }],
    },
    client,
  );
  assert.equal(location.echipamente.length, 1);
  assert.equal(location.echipamente[0].cod, "QR");
  assert.equal(location.echipamente[0].denumire, "Unitate");
  assert.deepEqual(location.echipamente[0].documentationFileIds, ["allowed"]);
  assert(!JSON.stringify(location).includes("FOREIGN"));
  assert(!JSON.stringify(location).includes("contact-phone"));
});

test("warranty display is a read projection using the web calculator, not a work migration", async () => {
  const source = structuredClone(client);
  Object.assign(source.locatii[0].echipamente[0], {dataInstalarii:"14.10.2025",garantieLuni:24,documentationFolderId:""});
  const before = JSON.stringify(source);
  const result = await ticketPresentation({} as any,{...work,tipLucrare:"Intervenție în garanție"},source);
  assert.equal(result.mobileEquipment[0].warranty?.installationDate,"14.10.2025");
  assert.equal(result.mobileEquipment[0].warranty?.warrantyExpires,"14.10.2027");
  assert.equal(result.mobileEquipment[0].warranty?.statusText,"În garanție");
  assert.equal(JSON.stringify(source),before);
  const other = await ticketPresentation({} as any,work,source);
  assert.equal(other.mobileEquipment[0].warranty,undefined);
});
