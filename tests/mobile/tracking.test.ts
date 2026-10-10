import { test, after } from "node:test";
import assert from "node:assert/strict";
import { initializeApp, deleteApp } from "firebase-admin/app";
import { getFirestore } from "firebase-admin/firestore";
import { trackingService } from "../../lib/tracking/service";
import {
  TRACKING_RETENTION_MS,
  trackingRoute,
  trackingDayBounds,
  type TrackingPoint,
} from "../../packages/fom-domain/tracking";
if (process.env.FIRESTORE_EMULATOR_HOST !== "127.0.0.1:8189")
  throw Error("Local Emulator required");
const app = initializeApp(
    { projectId: "demo-fom-mobile-auth" },
    "tracking-test",
  ),
  db = getFirestore(app);
const prefix = `tracking-${Date.now()}`,
  tech = `${prefix}-tech`,
  admin = `${prefix}-admin`,
  dispatcher = `${prefix}-dispatcher`,
  sid = `${prefix}-session`;
const now = Date.parse("2026-10-10T10:00:00+03:00"),
  service = trackingService(db, () => now);
const point = (
  id: string,
  minutes: number,
  extra: Partial<TrackingPoint> = {},
): TrackingPoint => ({
  id,
  sessionId: sid,
  capturedAt: now - minutes * 60000,
  lat: 44.42,
  lng: 26.1,
  accuracy: 10,
  ...extra,
});
test("tracking endpoints service enforces role, ownership, interval and stable point IDs", async () => {
  await Promise.all([
    db.doc(`users/${tech}`).set({ role: "tehnician", displayName: "Fixture" }),
    db.doc(`users/${admin}`).set({ role: "admin" }),
    db.doc(`users/${dispatcher}`).set({ role: "dispecer" }),
    db
      .doc(`attendance/${sid}`)
      .set({ userId: tech, status: "active", sessionStart: now - 60 * 60000 }),
  ]);
  await assert.rejects(() => service.live(tech), /acces/);
  await assert.rejects(
    () => service.ingest(admin, { sessionId: sid, points: [] }),
    /acces/,
  );
  await db
    .doc(`attendance/${prefix}-foreign`)
    .set({ userId: admin, status: "active", sessionStart: now - 60 * 60000 });
  await assert.rejects(
    () => service.ingest(tech, { sessionId: `${prefix}-foreign`, points: [] }),
    /aparține/,
  );
  const first = point("first", 10),
    latest = point("latest", 1);
  const result = await service.ingest(tech, {
    sessionId: sid,
    points: [
      first,
      latest,
      point("before", 61),
      point("future", -1),
      point("bad", 5, { lat: 100 }),
    ],
    state: "active",
  });
  assert.deepEqual(result.acceptedIds, ["first", "latest"]);
  assert.deepEqual(result.rejectedIds, ["before", "future", "bad"]);
  await service.ingest(tech, { sessionId: sid, points: [latest] });
  await service.ingest(tech, { sessionId: sid, points: [point("older", 15)] });
  assert.equal(
    (await db.collection("trackingPoints").where("uid", "==", tech).get()).size,
    3,
  );
  assert.equal(
    (await service.live(dispatcher)).find((t) => t.uid === tech)?.point?.id,
    "latest",
  );
  await assert.rejects(
    () =>
      service.ingest(tech, {
        sessionId: sid,
        points: [{ ...latest, lat: 45 }],
      }),
    /reutilizat/,
  );
  await db
    .doc(`attendance/${sid}`)
    .update({ status: "completed", sessionEnd: now - 5 * 60000 });
  const late = await service.ingest(tech, {
    sessionId: sid,
    points: [point("offline", 7), point("after", 2)],
  });
  assert.equal(late.sessionActive, false);
  assert.deepEqual(late.acceptedIds, ["offline"]);
  assert.deepEqual(late.rejectedIds, ["after"]);
  const history = await service.history(admin, tech, "2026-10-10");
  assert(
    !history.points.some((p) => p.id === "latest"),
    "points collected before learning of remote checkout are excluded",
  );
  assert(history.points.some((p) => p.id === "offline"));
  await assert.rejects(
    () => service.history(tech, tech, "2026-10-10"),
    /acces/,
  );
  await db
    .doc(`trackingPoints/${prefix}-expired`)
    .set({
      ...point("expired", 1),
      uid: tech,
      capturedAt: now - TRACKING_RETENTION_MS - 1,
      expiresAt: now - 1,
    });
  assert.equal(
    (await service.history(admin, tech, "2026-07-01")).points.length,
    0,
  );
});
test("GPS stops use duration and radius; gaps, sessions and poor accuracy break stops", () => {
  const points = [
    point("a", 20),
    point("b", 18),
    point("c", 16),
    point("d", 8),
    point("e", 6),
    point("f", 4, { accuracy: 150 }),
    point("g", 2),
  ];
  const route = trackingRoute(points.reverse());
  assert.equal(route.stops.length, 1);
  assert.equal(route.stops[0].minutes, 4);
  assert.equal(route.segments.length, 3);
  assert.equal(
    trackingRoute([point("a", 10), point("b", 6, { lat: 45 })]).stops.length,
    0,
  );
  assert.equal(
    trackingRoute([point("a", 10), point("b", 6, { sessionId: "other" })]).stops
      .length,
    0,
  );
  assert.equal(
    trackingDayBounds("2026-10-25").end - trackingDayBounds("2026-10-25").start,
    25 * 3600000,
  );
});
after(async () => {
  const batch = db.batch();
  for (const name of ["users", "attendance"]) {
    const snapshots = await db.collection(name).get();
    snapshots.docs
      .filter((d) => d.id.startsWith(prefix))
      .forEach((d) => batch.delete(d.ref));
  }
  for (const name of ["trackingPoints", "trackingLatest"]) {
    const snapshots = await db.collection(name).where("uid", "==", tech).get();
    snapshots.docs.forEach((d) => batch.delete(d.ref));
  }
  await batch.commit();
  await deleteApp(app);
});
