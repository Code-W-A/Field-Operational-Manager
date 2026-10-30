import { test } from "node:test";
import assert from "node:assert/strict";
import {
  draftIdentity,
  ticketDraftContent,
  offlineTicketAccess,
  OFFLINE_ACCESS_MS,
} from "./ticket-drafts";
test("draft identity distinguishes all targets without slash or percent escaping in Storage", () => {
  assert.deepEqual(draftIdentity("w:sheet:s"), {
    draftId: "w~sheet~s",
    workId: "w",
    targetId: "s",
    kind: "installation",
  });
  assert.equal(draftIdentity("w:revision:e")?.kind, "revision");
  assert.equal(draftIdentity("w")?.kind, "intervention");
  assert.equal(draftIdentity("w:completion")?.kind, "completion");
  assert.equal(draftIdentity("../w"), null);
  assert.equal(draftIdentity("w~sheet~s"), null);
});
test("contract retains the editable fields and rejects oversized values without retaining nested signature data", () => {
  const d = ticketDraftContent("revision", {
    sections: [
      {
        id: "s",
        title: "Motor",
        items: [
          {
            id: "i",
            label: "Verificare",
            state: "functional",
            obs: "ok",
            signature: "private",
          },
        ],
        signatures: "private",
      },
    ],
    finalObservations: "test",
    command: "stop",
  });
  assert(!JSON.stringify(d).includes("private"));
  assert(!JSON.stringify(d).includes("command"));
  assert.throws(() =>
    ticketDraftContent("intervention", {
      constatareLaLocatie: "x".repeat(12001),
    }),
  );
  assert.throws(() =>
    ticketDraftContent("intervention", { necesitaOferta: "true" }),
  );
});
test("offline grant has a fixed 24h maximum and cannot survive clock rollback", () => {
  const grant = {
    sessionId: "session",
    confirmedAt: 1000,
    expiresAt: 1000 + OFFLINE_ACCESS_MS,
  };
  assert(offlineTicketAccess(grant, 1000));
  assert(!offlineTicketAccess(grant, 999));
  assert(!offlineTicketAccess(grant, grant.expiresAt));
  assert(
    !offlineTicketAccess({ ...grant, expiresAt: grant.expiresAt + 1 }, 1000),
  );
});
