import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { attendanceReceipt } from "./command-receipt";

test("real Firestore read-only recovery uses the old closed session without touching current attendance or receipts", async () => {
  assert.match(
    process.env.FIRESTORE_EMULATOR_HOST || "",
    /^(127\.0\.0\.1|localhost):\d+$/,
  );
  const app = initializeApp(
    { projectId: "demo-fom-attendance-recovery" },
    `receipt-${randomUUID()}`,
  );
  const db = getFirestore(app),
    uid = `test-${randomUUID()}`,
    oldId = `old-${uid}`,
    newId = `new-${uid}`;
  const old = db.doc(`attendance/${oldId}`),
    current = db.doc(`attendance/${newId}`),
    lock = db.doc(`attendanceActiveSessions/${uid}`);
  try {
    await old.set({
      userId: uid,
      status: "completed",
      sessionStart: Timestamp.fromDate(new Date("2026-11-13T08:00:00Z")),
      sessionEnd: Timestamp.fromDate(new Date("2026-11-13T14:40:00Z")),
    });
    await current.set({
      userId: uid,
      status: "active",
      sessionStart: Timestamp.fromDate(new Date("2026-11-17T08:00:00Z")),
    });
    await lock.set({ userId: uid, activeSessionId: newId });
    const before = await Promise.all([old.get(), current.get(), lock.get()]);
    const results = await Promise.all(
      Array.from({ length: 3 }, () =>
        attendanceReceipt(db, uid, "lost-stop", {
          action: "attendance.stop",
          attendanceId: oldId,
        }),
      ),
    );
    for (const r of results) {
      assert.equal(r.state, "absent");
      assert.equal(r.session?.state, "closed");
      assert.equal(r.session?.activeSessionId, newId);
      assert.equal(r.session?.sessionEnd, "2026-11-13T14:40:00.000Z");
    }
    const after = await Promise.all([old.get(), current.get(), lock.get()]);
    after.forEach((r, i) =>
      assert.equal(r.updateTime?.toMillis(), before[i].updateTime?.toMillis()),
    );
    assert.equal(
      (await db.doc(`mobileCommands/${uid}_lost-stop`).get()).exists,
      false,
    );
    const unknown = await attendanceReceipt(db, uid, "another", {
      action: "attendance.stop",
      attendanceId: `missing-${uid}`,
    });
    assert.equal(unknown.session?.state, "missing");
    await assert.rejects(() =>
      attendanceReceipt(db, `other-${uid}`, "lost-stop", {
        action: "attendance.stop",
        attendanceId: oldId,
      }),
    );
  } finally {
    await Promise.all([old.delete(), current.delete(), lock.delete()]);
    await deleteApp(app);
  }
});
