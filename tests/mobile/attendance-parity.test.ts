import type { CommandAction } from "../../packages/fom-domain";
import { test, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { mobileService } from "../../lib/mobile/service";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Requires local emulator");
const app = initializeApp(
  { projectId: "demo-fom-mobile-auth" },
  "attendance-parity",
);
const db = getFirestore(app),
  service = mobileService(db),
  prefix = `parity-${Date.now()}`;
let serial = 0;
const at = (time: string, day = "2026-10-08") => `${day}T${time}:00+03:00`;
async function actor(suffix: string, employee = true) {
  const uid = `${prefix}-${suffix}`;
  await db
    .doc(`users/${uid}`)
    .set({ uid, role: "tehnician", displayName: uid });
  if (employee)
    await db
      .doc(`hrEmployees/${uid}`)
      .set({
        userUid: uid,
        programLucruStart: "08:00",
        programLucruEnd: "16:30",
        pauzaStart: "12:00",
        pauzaEnd: "12:30",
      });
  return uid;
}
const cmd = (
  action: CommandAction,
  id: string,
  time: string,
  payload: any = {},
  day?: string,
) => ({
  action,
  entityId: id,
  occurredAt: at(time, day),
  payload,
  mutationId: `${prefix}-${++serial}`,
  baseVersion: null,
});
test("web and mobile produce the same session, routes, break calculation and timesheet", async () => {
  const outcomes = [];
  for (const channel of ["web", "mobile"] as const) {
    const uid = await actor(channel),
      id = `${uid}-session`;
    const start = cmd("attendance.start", id, "07:30", {
      mode: "field",
      location: { lat: 44, lng: 26 },
      checkInSelfieStatus: "missing",
    });
    const started = await service.command(uid, start, channel);
    assert.deepEqual(await service.command(uid, start, channel), started);
    await assert.rejects(
      () =>
        service.command(
          uid,
          cmd("attendance.start", `${id}-duplicate`, "07:31"),
          channel,
        ),
      /deja/,
    );
    await assert.rejects(
      () => service.command(uid, cmd("attendance.stop", id, "07:30"), channel),
      /secunde/,
    );
    await service.command(
      uid,
      cmd("attendance.extra", id, "07:30", {
        type: "to_client",
        operation: "start",
      }),
      channel,
    );
    const client = await service.command(
      uid,
      cmd("attendance.extra", id, "08:30", {
        type: "to_client",
        operation: "end",
      }),
      channel,
    );
    assert.equal(client.minutesEligible, 30);
    await assert.rejects(
      () =>
        service.command(
          uid,
          cmd("attendance.extra", id, "07:50", {
            type: "to_client",
            operation: "start",
          }),
          channel,
        ),
      /deja/,
    );
    const stop = await service.command(
      uid,
      cmd("attendance.stop", id, "16:30", {
        mode: "field",
        location: { lat: 44.1, lng: 26.1 },
        checkOutSelfieStatus: "error",
      }),
      channel,
    );
    assert.equal(stop.session.status, "completed");
    assert.equal(stop.timesheetSync.synced, true);
    await service.command(
      uid,
      cmd("attendance.extra", id, "17:00", {
        type: "to_home",
        operation: "start",
      }),
      channel,
    );
    const home = await service.command(
      uid,
      cmd("attendance.extra", id, "18:00", {
        type: "to_home",
        operation: "end",
      }),
      channel,
    );
    assert.equal(home.minutesEligible, 30);
    assert.equal(home.timesheetSync.synced, true);
    const timesheet = (
      await db.doc(`hrTimesheets/${uid}_2026-10`).get()
    ).data();
    outcomes.push({
      logs: home.session.extraTimeLogs,
      hours: timesheet?.days?.["8"]?.hours,
      startLocation: stop.session.location,
      endLocation: stop.session.checkOutLocation,
      pause: stop.session.pauzaStart,
    });
  }
  assert.deepEqual(outcomes[0], outcomes[1]);
  assert.ok(outcomes[0].hours > 0);
});
test("weekend requires confirmation; first QR does not restart a completed day", async () => {
  const uid = await actor("qr"),
    id = `${uid}-session`;
  await assert.rejects(
    () =>
      service.command(
        uid,
        cmd(
          "attendance.start",
          id,
          "09:00",
          { checkInAuto: true, checkInAutoReason: "first_qr" },
          "2026-10-04",
        ),
      ),
    /ziua specială/,
  );
  await service.command(
    uid,
    cmd(
      "attendance.start",
      id,
      "09:00",
      {
        checkInAuto: true,
        checkInAutoReason: "first_qr",
        specialDayConfirmed: true,
      },
      "2026-10-04",
    ),
  );
  await service.command(
    uid,
    cmd("attendance.stop", id, "10:00", {}, "2026-10-04"),
  );
  await assert.rejects(
    () =>
      service.command(
        uid,
        cmd(
          "attendance.start",
          `${id}-again`,
          "11:00",
          {
            checkInAuto: true,
            checkInAutoReason: "first_qr",
            specialDayConfirmed: true,
          },
          "2026-10-04",
        ),
      ),
    /deja/,
  );
});
test("protected timesheet is preserved while checkout commits; missing HR is explicit", async () => {
  const uid = await actor("protected"),
    id = `${uid}-session`;
  await service.command(uid, cmd("attendance.start", id, "08:00"));
  await db
    .doc(`hrTimesheets/${uid}_2026-10`)
    .set({
      employeeId: uid,
      monthKey: "2026-10",
      days: { "8": { code: "CO", hours: 8 } },
    });
  const stopped = await service.command(
    uid,
    cmd("attendance.stop", id, "16:30"),
  );
  assert.equal(stopped.session.status, "completed");
  assert.equal(stopped.timesheetSync.reason, "protected_day");
  assert.equal(
    (await db.doc(`hrTimesheets/${uid}_2026-10`).get()).data()?.days["8"].code,
    "CO",
  );
  const other = await actor("no-hr", false);
  await service.command(other, cmd("attendance.start", other, "08:00"));
  assert.equal(
    (await service.command(other, cmd("attendance.stop", other, "16:30")))
      .timesheetSync.reason,
    "no_employee",
  );
});
test("selfie paths cannot point to another user's image", async () => {
  const uid = await actor("selfie");
  await assert.rejects(
    () =>
      service.command(
        uid,
        cmd("attendance.start", uid, "08:00", {
          checkInSelfieStatus: "ok",
          checkInSelfiePath: "attendance/selfies/other/private.jpg",
        }),
      ),
    /inaccesibil/,
  );
});
after(async () => {
  for (const collection of [
    "users",
    "hrEmployees",
    "attendance",
    "attendanceActiveSessions",
    "hrTimesheets",
    "mobileCommands",
  ]) {
    const docs = await db.collection(collection).get();
    for (const doc of docs.docs)
      if (doc.id.startsWith(prefix)) await doc.ref.delete();
  }
  await deleteApp(app);
});
