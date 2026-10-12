import { test } from "node:test";
import assert from "node:assert/strict";
import { detectTicketNotifications, notificationRecipients, dueReminder, scheduleInstant, notificationDestination, overdueReminder, scheduleKey } from "./notifications";
const users = [{ uid: "a", role: "tehnician", displayName: "Alex" }, { uid: "b", role: "tehnician", displayName: "Bob" }, { uid: "off", role: "tehnician", displayName: "Off", disabled: true }];
const work = { tehnicieni: ["Alex"], dataInterventie: "12.10.2026 10:00", statusLucrare: "Atribuită", descriere: "Notă", locatie: "Sediu" };
test("assignment, withdrawal, reassignment and simultaneous edits produce one event per recipient", () => {
  assert.deepEqual(detectTicketNotifications(null, work, users).map(x => [x.uid, x.kind]), [["a", "assigned"]]);
  assert.deepEqual(detectTicketNotifications(work, { ...work, tehnicieni: ["Bob"], descriere: "Nouă", locatie: "Alta" }, users).map(x => [x.uid, x.kind]), [["a", "withdrawn"], ["b", "assigned"]]);
  assert.deepEqual(detectTicketNotifications(work, null, users).map(x => x.kind), ["withdrawn"]);
  const event = detectTicketNotifications(work, { ...work, dataInterventie: "13.10.2026 11:00", locatie: "Altă", descriere: "Instrucțiune" }, users);
  assert.equal(event.length, 1); assert.deepEqual(event[0].changes, ["schedule", "location", "instructions"]);
});
test("UID and legacy names are deduplicated and ambiguous or disabled recipients are excluded", () => {
  assert.deepEqual(notificationRecipients({ tehnicieni: ["Alex", "Off"], technicianIds: ["a", "b", "off"] }, users), ["a", "b"]);
  const ambiguous = [...users, { uid: "c", role: "tehnician", displayName: "Alex" }];
  assert.deepEqual(notificationRecipients(work, ambiguous), []);
  assert.deepEqual(notificationRecipients({ ...work, technicianIds: ["a"] }, ambiguous), ["a"]);
});
test("technical updates, technician notes, erased or formatting-only instructions do not notify", () => {
  for (const patch of [{ updatedAt: "new" }, { notificationReadBy: ["a"] }, { notaInternaTehnician: "nouă" }, { descriere: "  Notă  " }, { descriere: "" }]) assert.equal(detectTicketNotifications(work, { ...work, ...patch }, users).length, 0);
  assert.equal(detectTicketNotifications(work, { ...work, dataInterventie: "2026-10-12T10:00:00", descriere: "Notă" }, users).length, 0);
});
test("30 minute boundary, zero hour, missing dates, completion and confirmed scan", () => {
  assert.equal(dueReminder(work, new Date("2026-10-12T06:29:59Z")), false);
  assert.equal(dueReminder(work, new Date("2026-10-12T06:30:00Z")), true);
  assert.equal(dueReminder(work, new Date("2026-10-12T06:32:00Z")), false);
  for (const patch of [{ dataInterventie: "12.10.2026 00:00" }, { dataInterventie: "bad" }, { raportGenerat: true }, { anulat: true }, { archivedAt: "yes" }, { statusLucrare: "Finalizat" }, { preluatDispecer: true, raportGenerat: true }]) assert.equal(dueReminder({ ...work, ...patch }, new Date("2026-10-12T06:30Z")), false);
  const past = { ...work, dataInterventie: "11.10.2026 00:00" };
  assert.equal(overdueReminder(past, {}, new Date("2026-10-12T05:00Z")), true);
  assert.equal(overdueReminder({ ...past, equipmentVerified: true }, {}, new Date("2026-10-12T05:00Z")), false);
  assert.equal(overdueReminder({ ...past, preluatDispecer: true }, {}, new Date("2026-10-12T05:00Z")), false);
  assert.equal(overdueReminder(past, { intarziateEnabled: false }, new Date("2026-10-12T05:00Z")), false);
});
test("Romanian timezone handles summer, winter and nonexistent DST times", () => {
  assert.equal(new Date(scheduleInstant({ dataInterventie: "12.10.2026 10:00" })!).toISOString(), "2026-10-12T07:00:00.000Z");
  assert.equal(new Date(scheduleInstant({ dataInterventie: "12.12.2026 10:00" })!).toISOString(), "2026-12-12T08:00:00.000Z");
  assert.equal(scheduleInstant({ dataInterventie: "29.03.2026 03:30" }), null);
  assert.equal(scheduleKey({ dataInterventie: "2026-10-12T07:00:00Z" }), scheduleKey(work));
});
test("navigation never exposes a withdrawn ticket and respects attendance", () => {
  assert.equal(notificationDestination({ kind: "withdrawn", workId: "w" }, false, false), "withdrawn");
  assert.equal(notificationDestination({ kind: "assigned", workId: "w" }, false, true), "attendance");
  assert.equal(notificationDestination({ kind: "assigned", workId: "w" }, true, false), "withdrawn");
  assert.equal(notificationDestination({ kind: "assigned", workId: "w" }, true, true), "ticket");
  assert.equal(notificationDestination({ kind: "daily_today" }, true, false), "dashboard");
});
