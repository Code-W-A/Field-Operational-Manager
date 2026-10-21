import test from "node:test";
import assert from "node:assert/strict";
import { installationArchiveReasons } from "./archive";

const work = {
  statusLucrare: "Finalizat",
  preluatDispecer: true,
  statusFacturare: "Nu se facturează",
  motivNefacturare: "Contract",
  installation: { closedReason: "completed", completionDocumentId: "final" },
};
const state = { completionExists: true, openSheets: false, sessions: false };

test("installation archive keeps PV and session requirements even when configurable rules are off", () => {
  const reasons = installationArchiveReasons(
    {
      ...work,
      statusLucrare: "În lucru",
      installation: { activeSheetByEquipment: { e1: "sheet" } },
    },
    { ...state, completionExists: false, sessions: true },
    { requireFinalizedStatus: false },
  );
  assert.deepEqual(reasons, [
    "Finalizează instalarea și semnează PV-ul.",
    "PV-ul final semnat nu este disponibil.",
    "Închide și semnează toate fișele zilnice.",
    "Oprește sesiunile de lucru active.",
  ]);
  assert.deepEqual(installationArchiveReasons(work, state), []);
});

test("archive explains invoicing, required offers, accepted offers and response deadlines concisely", () => {
  assert.deepEqual(
    installationArchiveReasons({ ...work, motivNefacturare: "" }, state),
    ["Completează motivul nefacturării."],
  );
  assert.deepEqual(
    installationArchiveReasons({ ...work, necesitaOferta: true }, state),
    ["Trimite oferta necesară."],
  );
  assert.deepEqual(
    installationArchiveReasons(
      { ...work, offerResponse: { status: "accept" } },
      state,
    ),
    ["Oferta acceptată necesită lansarea reintervenției."],
  );
  assert.deepEqual(
    installationArchiveReasons(
      {
        ...work,
        offerResponse: { status: "accept" },
        reinterventieLansata: true,
      },
      state,
    ),
    [],
  );
  const unanswered = {
    ...work,
    offerSendCount: 1,
    offerActionExpiresAt: new Date(Date.now() + 2 * 86400000).toISOString(),
  };
  assert.match(
    installationArchiveReasons(unanswered, state)[0],
    /^Așteaptă răspunsul la ofertă/,
  );
  assert.deepEqual(
    installationArchiveReasons(unanswered, state, {
      offerWait30DaysWhenNoResponse: false,
    }),
    [],
  );
});

test("canceled and archived installations have a short terminal explanation", () => {
  assert.deepEqual(
    installationArchiveReasons({ ...work, anulat: true }, state),
    ["Tichetul este anulat."],
  );
  assert.deepEqual(
    installationArchiveReasons({ ...work, archivedAt: "2026-10-21" }, state),
    ["Tichetul este deja arhivat."],
  );
});
