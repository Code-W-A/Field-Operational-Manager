import test from "node:test";
import assert from "node:assert/strict";
import { arrayUnion, deleteField, serverTimestamp } from "firebase/firestore";
import { installationManagementInput, workArrayUnion } from "./management-client";
import { isInstallationManagementPatch } from "./management";
import { hasTicketCompletionDocument } from "@/lib/utils/work-completion";

test("commercial version appends retain native Firestore semantics and survive the API JSON boundary", () => {
  const version = { savedAt: "2026-10-19T10:00:00Z", products: [{ id: "p", name: "Montaj", quantity: 1, price: 20, total: 20, um: "buc" }] };
  const union = workArrayUnion(version);
  assert(union.isEqual(arrayUnion(version)), "Ordinary tickets keep their native Firestore transform");
  const input = installationManagementInput({ offerVersions: union, offerTotal: 20, ofertaDocument: deleteField(), offerPreparedAt: serverTimestamp() });
  assert.deepEqual(JSON.parse(JSON.stringify(input)), {
    work: { offerTotal: 20 }, append: { offerVersions: [version] }, remove: ["ofertaDocument"], serverTime: ["offerPreparedAt"],
  });
});

test("management routing is limited to commercial fields", () => {
  assert(isInstallationManagementPatch({ preluatDispecer: true }));
  assert(isInstallationManagementPatch({ facturaDocument: {}, statusFacturare: "Facturat" }));
  assert(isInstallationManagementPatch({ devizVersions: workArrayUnion({}) }));
  assert(!isInstallationManagementPatch({ installation: {} }));
  assert(!isInstallationManagementPatch({ preluatDispecer: true, statusLucrare: "Finalizat" }));
  assert(!isInstallationManagementPatch({}));
});

test("installation and intervention pickup use their respective completion document", () => {
  assert(hasTicketCompletionDocument({ raportGenerat: true }));
  assert(!hasTicketCompletionDocument({ raportGenerat: false }));
  assert(hasTicketCompletionDocument({ installation: { schemaVersion: 1, closedReason: "completed", completionDocumentId: "final" } }));
  assert(!hasTicketCompletionDocument({ raportGenerat: true, installation: { schemaVersion: 1 } }));
  assert(!hasTicketCompletionDocument({ installation: { schemaVersion: 1, closedReason: "continuation" } }));
});
