import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { attendanceReceipt } from "./command-receipt";
const fingerprint = JSON.stringify({
  mutationId: "op-1",
  action: "attendance.start",
  payload: { private: "never return" },
});
function db(data: any, documents: Record<string, any> = {}) {
  const paths: string[] = [];
  return {
    paths,
    db: {
      collection: (c: string) => ({
        doc: (id: string) => ({ path: `${c}/${id}` }),
      }),
      runTransaction: async (fn: any) =>
        fn({
          get: async ({ path }: { path: string }) => {
            paths.push(path);
            const value = path.startsWith("mobileCommands/")
              ? data
              : documents[path];
            return { exists: !!value, data: () => value };
          },
        }), // Deliberately no write methods: this API is read-only.
    } as any,
  };
}
test("read-only lookup is scoped to authenticated uid and returns digest only", async () => {
  const f = db({ uid: "alice", fingerprint, result: { secret: "private" } });
  const r = await attendanceReceipt(f.db, "alice", "op-1");
  assert.deepEqual(f.paths, ["mobileCommands/alice_op-1"]);
  assert.equal(r.state, "confirmed");
  assert.equal(
    r.commandDigest,
    createHash("sha256").update(fingerprint).digest("hex"),
  );
  assert.ok(!JSON.stringify(r).includes("private"));
});
test("absent is not rejected; owner mismatch and non-attendance receipts fail closed", async () => {
  assert.equal(
    (await attendanceReceipt(db(null).db, "bob", "op-1")).state,
    "absent",
  );
  await assert.rejects(() =>
    attendanceReceipt(db({ uid: "alice", fingerprint }).db, "bob", "op-1"),
  );
  await assert.rejects(() =>
    attendanceReceipt(
      db({
        uid: "alice",
        fingerprint: JSON.stringify({
          mutationId: "op-1",
          action: "installation",
        }),
      }).db,
      "alice",
      "op-1",
    ),
  );
});
test("invalid IDs and unsupported recovery actions never reach firestore", async () => {
  for (const id of ["", "../alice_op-1", "a/b"]) {
    const f = db(null);
    await assert.rejects(() => attendanceReceipt(f.db, "alice", id));
    assert.equal(f.paths.length, 0);
  }
  for (const context of [
    { action: "attendance.start", attendanceId: "old" },
    { action: "attendance.stop", attendanceId: "../other" },
  ]) {
    const f = db(null);
    await assert.rejects(() =>
      attendanceReceipt(f.db, "alice", "op-1", context),
    );
    assert.equal(f.paths.length, 0);
  }
});
const context = { action: "attendance.stop", attendanceId: "old" };
const closed = {
  userId: "alice",
  status: "completed",
  sessionStart: "2026-11-13T08:00:00Z",
  sessionEnd: "2026-11-13T14:40:00Z",
  checkOutLocation: { lat: 44, lng: 26 },
};
test("13 November completed attendance cannot block a different current session; evidence never claims command success", async () => {
  const docs = {
    "attendance/old": closed,
    "attendanceActiveSessions/alice": {
      userId: "alice",
      activeSessionId: "new",
    },
  };
  const before = structuredClone(docs);
  const f = db(null, docs);
  const result = await attendanceReceipt(f.db, "alice", "op-1", context);
  assert.equal(result.state, "absent");
  assert.equal(result.session?.state, "closed");
  assert.equal(result.session?.activeSessionId, "new");
  assert.equal(
    result.session?.sessionEnd,
    closed.sessionEnd.replace("Z", ".000Z"),
  );
  assert.ok(!JSON.stringify(result).includes("lat"));
  assert.deepEqual(docs, before);
});
test("active, missing and inconsistent sessions never provide closed proof", async () => {
  for (const [session, lock, expected] of [
    [undefined, undefined, "missing"],
    [{ ...closed, status: "active", sessionEnd: null }, undefined, "active"],
    [{ ...closed, sessionEnd: null }, undefined, "inconsistent"],
    [
      { ...closed, sessionEnd: "2026-11-12T10:00:00Z" },
      undefined,
      "inconsistent",
    ],
    [
      { ...closed, sessionEnd: "2999-01-01T10:00:00Z" },
      undefined,
      "inconsistent",
    ],
    [closed, { userId: "alice", activeSessionId: "old" }, "inconsistent"],
    [closed, { userId: "alice" }, "inconsistent"],
  ] as const) {
    const f = db(null, {
      "attendance/old": session,
      "attendanceActiveSessions/alice": lock,
    });
    assert.equal(
      (await attendanceReceipt(f.db, "alice", "op-1", context)).session?.state,
      expected,
    );
  }
});
test("closed session proof checks ownership and requested command target", async () => {
  for (const docs of [
    { "attendance/old": { ...closed, userId: "bob" } },
    {
      "attendance/old": closed,
      "attendanceActiveSessions/alice": {
        userId: "bob",
        activeSessionId: "new",
      },
    },
  ])
    await assert.rejects(() =>
      attendanceReceipt(db(null, docs).db, "alice", "op-1", context),
    );
  await assert.rejects(() =>
    attendanceReceipt(
      db({ uid: "alice", fingerprint }).db,
      "alice",
      "op-1",
      context,
    ),
  );
  const fp = JSON.stringify({
    mutationId: "op-1",
    action: "attendance.stop",
    entityId: "old",
  });
  const f = db({ uid: "alice", fingerprint: fp });
  assert.equal(
    (await attendanceReceipt(f.db, "alice", "op-1", context)).state,
    "confirmed",
  );
  assert.equal(f.paths.length, 1);
});
