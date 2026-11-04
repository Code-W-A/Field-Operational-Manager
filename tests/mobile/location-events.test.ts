import { test, after } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore, Timestamp } from "firebase-admin/firestore";
import { mobileService } from "../../lib/mobile/service";
import { trackingService } from "../../lib/tracking/service";
import { attendanceDay, versionOf } from "../../packages/fom-domain";
import { prepareLocationEvent } from "../../lib/tracking/location-event";
import { trackingRoute } from "../../packages/fom-domain/tracking";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Emulator required");
const app = initializeApp(
    { projectId: "demo-fom-mobile-auth" },
    "location-events",
  ),
  db = getFirestore(app),
  svc = mobileService(db);
after(() => deleteApp(app));
const prefix = "events-" + randomUUID(),
  uid = prefix + "-tech",
  admin = prefix + "-admin",
  sid = prefix + "-attendance";
const capture = () => ({
  status: "available" as const,
  capturedAt: Date.now(),
  lat: 44.4,
  lng: 26.1,
  accuracy: 12,
});
const command = (
  action: string,
  entityId: string,
  payload: any,
  extra: any = {},
) => ({
  mutationId: randomUUID(),
  action,
  entityId,
  payload,
  occurredAt: new Date().toISOString(),
  baseVersion: null,
  ...extra,
});
test("confirmed attendance + intervention/revision QR, atomic rollback, retry and map without GPS", async () => {
  await db
    .doc(`users/${uid}`)
    .set({ uid, displayName: prefix, role: "tehnician" });
  await db.doc(`users/${admin}`).set({ role: "admin" });
  await db.doc(`clienti/${prefix}`).set({
    nume: "Fixture",
    locatii: [
      {
        id: "loc",
        nume: "Test",
        echipamente: [{ id: "eq", cod: "QR", denumire: "Test" }],
      },
    ],
  });
  const firstCapture = { ...capture(), capturedAt: Date.now() - 120000 };
  const start = command(
    "attendance.start",
    sid,
    { locationCapture: firstCapture, specialDayConfirmed: true },
    { occurredAt: new Date(firstCapture.capturedAt).toISOString() },
  );
  const started = await svc.command(uid, start as any);
  await svc.command(uid, start as any);
  assert.equal(started.locationEvent.kind, "checkin");
  for (const type of ["Intervenție", "Revizie"]) {
    const workId =
      prefix + "-" + (type === "Revizie" ? "revision" : "intervention");
    await db.doc(`lucrari/${workId}`).set({
      client: "Fixture",
      clientId: prefix,
      locationId: "loc",
      locatie: "Test",
      equipmentId: "eq",
      echipamentCod: "QR",
      echipament: "Test",
      tipLucrare: type,
      ...(type === "Revizie"
        ? {
            equipmentIds: ["eq"],
            revision: {
              equipmentStatus: { eq: "pending" },
              equipment: [{ equipmentId: "eq", equipmentCode: "QR" }],
            },
          }
        : {}),
      statusLucrare: "Atribuită",
      tehnicieni: [prefix],
      updatedAt: Timestamp.now(),
    });
    const version = versionOf(
      (await db.doc(`lucrari/${workId}`).get()).data()!,
    );
    const wrong = command(
      "verify",
      workId,
      { equipmentId: "eq", code: "WRONG", locationCapture: firstCapture },
      { attendanceId: sid, baseVersion: version },
    );
    const count = async () =>
      (await db.collection("trackingEvents").where("uid", "==", uid).get())
        .size;
    const before = await count();
    await assert.rejects(() => svc.command(uid, wrong as any));
    assert.equal(await count(), before);
    const qr = command(
      "verify",
      workId,
      { equipmentId: "eq", code: "QR", locationCapture: firstCapture },
      { attendanceId: sid, baseVersion: version },
    );
    const result = await svc.command(uid, qr as any);
    await svc.command(uid, qr as any);
    assert.equal(result.locationEvent.kind, "qr_verified");
    assert.equal(
      result.locationEvent.capture.capturedAt,
      firstCapture.capturedAt,
    );
    assert.equal(result.locationEvent.capture.lat, undefined);
    assert.deepEqual(
      (await db.doc(`trackingEvents/${result.locationEvent.id}`).get()).data()!
        .capture,
      firstCapture,
    );
    assert.equal(await count(), before + 1);
    await assert.rejects(
      () =>
        svc.command(uid, {
          ...qr,
          payload: { ...qr.payload, locationCapture: capture() },
        } as any),
      /reutilizat/,
    );
  }
  const lastPoint = (await db.doc(`trackingLatest/${uid}`).get()).data()!.point;
  const stop = command("attendance.stop", sid, {
    locationCapture: {
      status: "unavailable",
      capturedAt: Date.now(),
      reason: "gps_disabled",
    },
  });
  await svc.command(uid, stop as any);
  await svc.command(uid, stop as any);
  const map = trackingService(db);
  const live = (await map.live(admin)).find((t) => t.uid === uid)!;
  assert.equal(live.sessionId, null);
  assert.deepEqual(live.point, lastPoint);
  assert.equal(live.lastEvent.kind, "checkout");
  assert.equal(live.lastEvent.capture.reason, "gps_disabled");
  const history = await map.history(admin, uid, attendanceDay(Date.now()));
  assert.equal(history.events.length, 4);
  assert.equal(history.points.length, 3);
  assert.equal(history.segments.length, 0);
  assert.equal(history.stops.length, 0);
  await assert.rejects(() => map.live(uid), /acces/);
  await assert.rejects(
    () => map.history(uid, uid, attendanceDay(Date.now())),
    /acces/,
  );
  // A later missing event must preserve even yesterday's valid position.
  await db
    .doc(`trackingLatest/${uid}`)
    .update({ "point.capturedAt": Date.now() - 86400000 });
  assert.equal(
    (await map.live(admin)).find((t) => t.uid === uid)!.point!.capturedAt > 0,
    true,
  );
});
test("projection is rolled back with failed transaction and mixed history never connects event points", async () => {
  const id = prefix + "-rollback";
  await assert.rejects(() =>
    db.runTransaction(async (tx) => {
      const event = await prepareLocationEvent(db, tx, {
        uid: id,
        mutationId: "rollback",
        sessionId: sid,
        kind: "checkin",
        occurredAt: Date.now(),
        capture: capture(),
      });
      event!.commit();
      throw Error("reject business action");
    }),
  );
  assert.equal(
    (await db.collection("trackingEvents").where("uid", "==", id).get()).size,
    0,
  );
  const p = {
    id: "a",
    sessionId: sid,
    capturedAt: Date.now(),
    lat: 44,
    lng: 26,
    accuracy: 10,
  };
  const route = trackingRoute([
    p,
    {
      ...p,
      id: "b",
      capturedAt: p.capturedAt + 1000,
      eventKind: "qr_verified",
    },
    { ...p, id: "c", capturedAt: p.capturedAt + 2000 },
  ]);
  assert.equal(route.segments.length, 2);
  assert.equal(route.stops.length, 0);
});

test("checkin and valid QR without GPS succeed with events but no invented coordinate", async () => {
  const actor = prefix + "-no-gps",
    attendance = prefix + "-missing",
    work = prefix + "-missing-work";
  await db.doc(`users/${actor}`).set({ role: "tehnician", displayName: actor });
  await db
    .doc(`lucrari/${work}`)
    .set({
      client: "Fixture",
      clientId: prefix,
      locationId: "loc",
      locatie: "Test",
      equipmentId: "eq",
      echipamentCod: "QR",
      tipLucrare: "Intervenție",
      statusLucrare: "Atribuită",
      tehnicieni: [actor],
      updatedAt: Timestamp.now(),
    });
  const missing = {
    status: "unavailable",
    capturedAt: Date.now(),
    reason: "permission_denied",
  };
  await svc.command(
    actor,
    command("attendance.start", attendance, {
      locationCapture: missing,
      checkInAuto: true,
      checkInAutoReason: "first_qr",
      specialDayConfirmed: true,
    }) as any,
  );
  await svc.command(
    actor,
    command(
      "verify",
      work,
      { equipmentId: "eq", code: "QR", locationCapture: missing },
      {
        attendanceId: attendance,
        baseVersion: versionOf((await db.doc(`lucrari/${work}`).get()).data()!),
      },
    ) as any,
  );
  assert.equal(
    (await db.collection("trackingEvents").where("uid", "==", actor).get())
      .size,
    2,
  );
  assert.equal(
    (await db.collection("trackingPoints").where("uid", "==", actor).get())
      .size,
    0,
  );
  assert.equal(
    (await db.doc(`trackingLatest/${actor}`).get()).data()!.point,
    undefined,
  );
  const history = await trackingService(db).history(
    admin,
    actor,
    attendanceDay(Date.now()),
  );
  assert.equal(history.events.length, 2);
  assert.equal(history.points.length, 0);
});

test("a position captured before midnight remains with the next-day confirmed event", async () => {
  const actor = prefix + "-midnight",
    session = prefix + "-night-session";
  const occurredAt = Date.parse("2026-11-03T00:00:01+02:00"),
    capturedAt = occurredAt - 2000;
  await db.doc(`users/${actor}`).set({ role: "tehnician" });
  await db
    .doc(`attendance/${session}`)
    .set({
      userId: actor,
      status: "completed",
      sessionStart: capturedAt - 1000,
      sessionEnd: occurredAt + 1000,
    });
  await db.runTransaction(async (tx) => {
    const event = await prepareLocationEvent(db, tx, {
      uid: actor,
      sessionId: session,
      mutationId: "midnight",
      kind: "checkout",
      occurredAt,
      capture: { ...capture(), capturedAt },
    });
    event!.commit();
  });
  const map = trackingService(db, () => occurredAt + 10000);
  const day = await map.history(admin, actor, "2026-11-03");
  assert.equal(day.events.length, 1);
  assert.equal(day.points.length, 1);
  assert.equal(day.points[0].capturedAt, capturedAt);
  assert.equal(day.segments.length, 0);
  const previous = await map.history(admin, actor, "2026-11-02");
  assert.equal(previous.events.length, 0);
  assert.equal(previous.points.length, 0);
  await map.deleteHistory(admin, actor, "2026-11-03");
  assert.equal(
    (await db.collection("trackingPoints").where("uid", "==", actor).get())
      .size,
    0,
  );
  assert.equal(
    (await map.history(admin, actor, "2026-11-03")).events.length,
    0,
  );
  assert.ok((await db.doc(`trackingLatest/${actor}`).get()).data()!.point);
});
