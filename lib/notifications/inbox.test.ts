import { test } from "node:test";
import assert from "node:assert/strict";
import { inboxEvent } from "./inbox";
import { OVERDUE_DEFAULTS } from "@/packages/fom-domain/ticket-dashboard";
import type { TicketNotification } from "@/packages/fom-domain";
const actor = { uid: "tech", displayName: "Tehnician", role: "tehnician" };
const now = new Date("2026-10-21T10:00:00Z");
const event: TicketNotification = {
  id: "event",
  uid: "tech",
  kind: "assigned",
  title: "Tichet",
  body: "Mesaj",
  createdAt: now.toISOString(),
  readAt: null,
  workId: "work",
};
const work = {
  technicianIds: ["tech"],
  nrLucrare: "#002170",
  statusLucrare: "Atribuită",
  dataInterventie: "20.10.2026 00:00",
};
test("only currently assigned unfinished tickets are kept, independently of read state", () => {
  for (const readAt of [null, now.toISOString()]) {
    assert.equal(
      inboxEvent(
        { ...event, readAt },
        actor,
        new Map([["work", work]]),
        {},
        now,
      )?.workNumber,
      "#002170",
    );
    for (const patch of [
      { technicianIds: ["other"] },
      { statusLucrare: "Anulat" },
      { archived: true },
      { statusLucrare: "Finalizat" },
      {
        installation: {
          schemaVersion: 1,
          closedReason: "completed",
          completionDocumentId: "final",
        },
      },
    ]) {
      assert.equal(
        inboxEvent(
          { ...event, readAt },
          actor,
          new Map([["work", { ...work, ...patch }]]),
          {},
          now,
        ),
        null,
      );
    }
  }
  assert.equal(inboxEvent(event, actor, new Map(), {}, now), null);
  assert.equal(
    inboxEvent(
      { ...event, kind: "withdrawn" },
      actor,
      new Map([["work", work]]),
      {},
      now,
    ),
    null,
  );
});
test("overdue summaries update their count and disappear when resolved or from a previous day", () => {
  const summary: TicketNotification = {
    ...event,
    kind: "daily_overdue",
    workId: undefined,
    workIds: ["one", "two"],
  };
  const works = new Map([
    ["one", work],
    ["two", { ...work, statusLucrare: "Finalizat" }],
  ]);
  const result = inboxEvent(summary, actor, works, OVERDUE_DEFAULTS, now);
  assert.deepEqual(result?.workIds, ["one"]);
  assert.match(result!.body, /Ai 1 tichet restant/);
  assert.equal(
    inboxEvent(summary, actor, new Map(), OVERDUE_DEFAULTS, now),
    null,
  );
  assert.equal(
    inboxEvent(
      { ...summary, createdAt: "2026-10-20T10:00:00Z" },
      actor,
      works,
      OVERDUE_DEFAULTS,
      now,
    ),
    null,
  );
});
test("today summaries follow current scheduling in Bucharest", () => {
  const summary: TicketNotification = {
    ...event,
    kind: "daily_today",
    workId: undefined,
    workIds: ["one", "two"],
  };
  const works = new Map([
    ["one", { ...work, dataInterventie: "21.10.2026 00:00" }],
    ["two", { ...work, dataInterventie: "22.10.2026 00:00" }],
  ]);
  assert.deepEqual(inboxEvent(summary, actor, works, {}, now)?.workIds, [
    "one",
  ]);
});
