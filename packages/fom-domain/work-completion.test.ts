import test from "node:test";
import assert from "node:assert/strict";
import { visibleWork, hasTicketCompletionDocument } from "./index";
import { groupDashboardTickets } from "./ticket-dashboard";
import { activeNotificationWork } from "./notifications";
const actor = { uid: "tech", displayName: "Tehnician", role: "tehnician" };
const installation = {
  id: "installation",
  statusLucrare: "Finalizat",
  technicianIds: [actor.uid],
  preluatDispecer: true,
  raportGenerat: false,
  installation: {
    schemaVersion: 1,
    closedReason: "completed",
    completionDocumentId: "final",
  },
};

test("picked installation leaves the server work list and every dashboard group without raportGenerat", () => {
  const before = JSON.stringify(installation);
  assert(hasTicketCompletionDocument(installation));
  assert.equal(visibleWork(installation, actor), false);
  assert.deepEqual(groupDashboardTickets([installation]), {
    current: [],
    overdue: [],
    future: [],
  });
  assert.equal(activeNotificationWork(installation), false);
  assert.equal(JSON.stringify(installation), before);
});
test("signed installation remains consultable until dispatcher pickup", () => {
  const pending = { ...installation, preluatDispecer: false };
  assert.equal(visibleWork(pending, actor), true);
  assert.equal(groupDashboardTickets([pending]).current[0].work.id, pending.id);
  assert.equal(
    visibleWork({ ...pending, technicianIds: ["other"] }, actor),
    false,
  );
});
test("incomplete or continued installations do not masquerade as completed service reports", () => {
  for (const metadata of [
    { schemaVersion: 1 },
    { schemaVersion: 1, closedReason: "continuation" },
    { schemaVersion: 1, closedReason: "completed" },
  ]) {
    const work = {
      ...installation,
      raportGenerat: true,
      installation: metadata,
    };
    assert.equal(hasTicketCompletionDocument(work), false);
    assert.equal(visibleWork(work, actor), true);
    assert.equal(groupDashboardTickets([work]).current.length, 1);
  }
});
test("ordinary report, legacy installation and postponed pickup retain their visibility policy", () => {
  for (const tipLucrare of [
    "Intervenție contra cost",
    "Revizie",
    "Instalare",
  ]) {
    const work = {
      id: tipLucrare,
      tipLucrare,
      technicianIds: [actor.uid],
      preluatDispecer: true,
      raportGenerat: true,
    };
    assert.equal(visibleWork(work, actor), false);
    assert.equal(groupDashboardTickets([work]).current.length, 0);
    assert.equal(visibleWork({ ...work, preluatDispecer: false }, actor), true);
  }
  assert.equal(
    visibleWork(
      {
        id: "postponed",
        technicianIds: [actor.uid],
        statusLucrare: "Amânată",
        preluatDispecer: true,
      },
      actor,
    ),
    false,
  );
});
