import type { LocationEvent } from "@/packages/fom-domain/location-events";
import { createHash } from "node:crypto";
import { FieldValue, type Firestore } from "firebase-admin/firestore";
import { timestampMillis } from "@/packages/fom-domain";
import {
  TRACKING_BATCH_SIZE,
  TRACKING_RETENTION_MS,
  TRACKING_STALE_MS,
  trackingDayBounds,
  trackingRoute,
  validTrackingPoint,
  type TrackingPoint,
  type TrackingState,
} from "@/packages/fom-domain/tracking";
export class TrackingError extends Error {
  constructor(
    message: string,
    public status = 400,
  ) {
    super(message);
  }
}
const millis = (v: unknown) => timestampMillis(v) || 0;
const requireId = (id: unknown): string => {
  if (typeof id !== "string" || !/^[A-Za-z0-9_-]{1,200}$/.test(id))
    throw new TrackingError("Identificator invalid.");
  return id;
};
const pointRefId = (uid: string, sid: string, id: string) =>
  createHash("sha256").update(`${uid}/${sid}/${id}`).digest("hex");
export function trackingService(db: Firestore, clock = Date.now) {
  async function role(uid: string, allowed: string[]) {
    const profile = (await db.doc(`users/${requireId(uid)}`).get()).data();
    if (!profile || !allowed.includes(profile.role))
      throw new TrackingError("Nu ai acces la tracking.", 403);
    return profile;
  }
  async function ingest(
    uid: string,
    input: {
      sessionId: string;
      points: TrackingPoint[];
      state?: TrackingState;
    },
  ) {
    await role(uid, ["tehnician"]);
    const sid = requireId(input?.sessionId),
      now = clock();
    if (
      !Array.isArray(input.points) ||
      input.points.length > TRACKING_BATCH_SIZE
    )
      throw new TrackingError("Lot GPS invalid.");
    if (
      input.state &&
      !["active", "gps_unavailable", "permission_denied", "stopped"].includes(
        input.state,
      )
    )
      throw new TrackingError("Stare GPS invalidă.");
    const raw = input.points;
    if (
      raw.some(
        (p) =>
          !p ||
          typeof p.id !== "string" ||
          !/^[A-Za-z0-9_.:-]{1,128}$/.test(p.id),
      )
    )
      throw new TrackingError("Identificator punct invalid.");
    if (new Set(raw.map((p) => p.id)).size !== raw.length)
      throw new TrackingError("Identificatori repetați în lot.");
    return db.runTransaction(async (tx) => {
      const sessionRef = db.doc(`attendance/${sid}`),
        latestRef = db.doc(`trackingLatest/${uid}`);
      const [sessionSnap, latestSnap] = await Promise.all([
        tx.get(sessionRef),
        tx.get(latestRef),
      ]);
      const session = sessionSnap.data();
      if (!session || session.userId !== uid)
        throw new TrackingError("Sesiunea nu îți aparține.", 403);
      const start = millis(session.sessionStart),
        end = session.sessionEnd ? millis(session.sessionEnd) : now;
      const acceptedIds: string[] = [],
        rejectedIds: string[] = [];
      const points = raw
        .filter((p) => {
          if (
            !validTrackingPoint(p, now) ||
            p.sessionId !== sid ||
            p.capturedAt < start ||
            p.capturedAt > end
          ) {
            rejectedIds.push(p.id);
            return false;
          }
          return true;
        })
        .map((p) => ({
          id: p.id,
          sessionId: sid,
          capturedAt: p.capturedAt,
          lat: p.lat,
          lng: p.lng,
          accuracy: p.accuracy,
        }));
      const refs = points.map((p) =>
        db.doc(`trackingPoints/${pointRefId(uid, sid, p.id)}`),
      );
      const existing = refs.length ? await tx.getAll(...refs) : [];
      for (let i = 0; i < points.length; i++) {
        const p = points[i],
          old = existing[i].data();
        if (
          old &&
          ["capturedAt", "lat", "lng", "accuracy", "sessionId"].some(
            (key) => old[key] !== p[key as keyof typeof p],
          )
        )
          throw new TrackingError(
            "Identificator GPS reutilizat cu alte date.",
            409,
          );
        if (!old)
          tx.create(refs[i], {
            ...p,
            uid,
            receivedAt: now,
            expiresAt: p.capturedAt + TRACKING_RETENTION_MS,
          });
        acceptedIds.push(p.id);
      }
      const newest = points
        .filter((p) => p.accuracy <= 100)
        .sort((a, b) => b.capturedAt - a.capturedAt)[0];
      const latest = latestSnap.data(),
        live = session.status === "active" && !session.sessionEnd;
      const update: Record<string, unknown> = {};
      if (latest?.point?.capturedAt < now - TRACKING_RETENTION_MS)
        update.point = FieldValue.delete();
      if (
        newest &&
        latest?.mode !== "events" &&
        (!latest?.point || newest.capturedAt > latest.point.capturedAt)
      ) {
        update.point = newest;
        update.expiresAt = newest.capturedAt + TRACKING_RETENTION_MS;
      }
      // Delayed batches from an old session never overwrite a newer session's health.
      if (
        latest?.mode !== "events" &&
        (live || latest?.sessionId === sid || !latest)
      ) {
        update.sessionId = sid;
        update.state = live ? input.state || "active" : "stopped";
        update.statusAt = now;
        update.expiresAt = now + TRACKING_RETENTION_MS;
      }
      if (Object.keys(update).length)
        tx.set(latestRef, { ...update, uid }, { merge: true });
      return {
        acceptedIds,
        rejectedIds,
        sessionActive: live,
        sessionEnd: session.sessionEnd ? end : null,
      };
    });
  }
  async function live(uid: string) {
    await role(uid, ["admin", "dispecer"]);
    const now = clock();
    const [users, active, latest] = await Promise.all([
      db.collection("users").where("role", "==", "tehnician").get(),
      db.collection("attendance").where("status", "==", "active").get(),
      db.collection("trackingLatest").get(),
    ]);
    const states = new Map(latest.docs.map((d) => [d.id, d.data()]));
    return users.docs.map((user) => {
      const sessions = active.docs
        .filter((s) => s.data().userId === user.id && !s.data().sessionEnd)
        .sort(
          (a, b) =>
            millis(b.data().sessionStart) - millis(a.data().sessionStart),
        );
      const session = sessions[0],
        data = states.get(user.id),
        candidate = data?.point;
      const point =
        candidate && candidate.capturedAt >= now - TRACKING_RETENTION_MS
          ? (candidate as TrackingPoint)
          : null;
      return {
        uid: user.id,
        name: String(user.data().displayName || "Tehnician"),
        sessionId: session?.id || null,
        mode: data?.mode || "legacy",
        lastEvent:
          data?.lastEvent?.occurredAt >= now - TRACKING_RETENTION_MS
            ? data?.lastEvent
            : null,
        point,
        state: session
          ? data?.sessionId === session.id
            ? data?.state
            : "unavailable"
          : "stopped",
        stale:
          data?.mode === "events"
            ? false
            : !point || now - point.capturedAt > TRACKING_STALE_MS,
      };
    });
  }
  async function history(uid: string, technician: string, day: string) {
    await role(uid, ["admin", "dispecer"]);
    requireId(technician);
    let bounds: ReturnType<typeof trackingDayBounds>;
    try {
      bounds = trackingDayBounds(day);
    } catch {
      throw new TrackingError("Data este invalidă.");
    }
    const { start, end } = bounds,
      now = clock();
    const floor = Math.max(start, now - TRACKING_RETENTION_MS);
    if (floor >= end)
      return {
        points: [],
        events: [],
        segments: [],
        stops: [],
        truncated: false,
      };
    const snapshot = await db
      .collection("trackingPoints")
      .where("uid", "==", technician)
      .where("capturedAt", ">=", floor)
      .where("capturedAt", "<", Math.min(end, now + 1))
      .orderBy("capturedAt")
      .limit(10001)
      .get();
    const eventSnapshot = await db
      .collection("trackingEvents")
      .where("uid", "==", technician)
      .where("occurredAt", ">=", floor)
      .where("occurredAt", "<", Math.min(end, now + 1))
      .orderBy("occurredAt")
      .limit(10001)
      .get();
    const events = eventSnapshot.docs
      .slice(0, 10000)
      .map((d) => d.data() as LocationEvent);
    const eventIds = new Set(events.map((event) => event.id));
    const raw = snapshot.docs
      .slice(0, 10000)
      .map((d) => d.data() as TrackingPoint)
      .filter((point) => !point.eventKind || eventIds.has(point.id));
    // A capture reused by QR/autocheckin can precede midnight. The marker belongs
    // with the confirmed event, while its actual measurement time stays visible.
    const pointIds = new Set(raw.map((point) => point.id));
    for (const event of events) {
      if (event.capture.status !== "available" || pointIds.has(event.id))
        continue;
      raw.push({
        id: event.id,
        sessionId: event.sessionId,
        eventKind: event.kind,
        capturedAt: event.capture.capturedAt,
        lat: event.capture.lat,
        lng: event.capture.lng,
        accuracy: event.capture.accuracy,
        ...(event.workId ? { workId: event.workId } : {}),
        ...(event.equipmentId ? { equipmentId: event.equipmentId } : {}),
      });
    }
    const sids = [...new Set([...raw, ...events].map((p) => p.sessionId))];
    const sessions = sids.length
      ? await db.getAll(
          ...sids.map((id) => db.doc(`attendance/${requireId(id)}`)),
        )
      : [];
    const validSessions = new Map(sessions.map((s) => [s.id, s.data()]));
    const points = raw.filter((p) => {
      const s = validSessions.get(p.sessionId);
      return (
        s?.userId === technician &&
        (p.eventKind ||
          (p.capturedAt >= millis(s.sessionStart) &&
            (!s.sessionEnd || p.capturedAt <= millis(s.sessionEnd))))
      );
    });
    return {
      points: points.sort((a, b) => a.capturedAt - b.capturedAt),
      events: events.filter(
        (e) => validSessions.get(e.sessionId)?.userId === technician,
      ),
      ...trackingRoute(points),
      truncated: snapshot.size > 10000 || eventSnapshot.size > 10000,
    };
  }
  async function deleteHistory(uid: string, technician: string, day: string) {
    await role(uid, ["admin"]);
    requireId(technician);
    let bounds: ReturnType<typeof trackingDayBounds>;
    try {
      bounds = trackingDayBounds(day);
    } catch {
      throw new TrackingError("Data este invalidă.");
    }
    const technicianRef = db.doc(`users/${technician}`);
    const technicianSnap = await technicianRef.get();
    if (technicianSnap.data()?.role !== "tehnician")
      throw new TrackingError("Tehnicianul selectat nu există.", 404);

    const now = clock();
    const upperBound = Math.min(bounds.end, now + 1);
    if (bounds.start >= upperBound) return { deletedCount: 0 };

    let deletedCount = 0;
    for (const [collection, timeField] of [
      ["trackingPoints", "capturedAt"],
      ["trackingEvents", "occurredAt"],
    ]) {
      const batchSize = collection === "trackingEvents" ? 200 : 400;
      let cursor: FirebaseFirestore.QueryDocumentSnapshot | undefined;
      while (true) {
        let query = db
          .collection(collection)
          .where("uid", "==", technician)
          .where(timeField, ">=", bounds.start)
          .where(timeField, "<", upperBound)
          .orderBy(timeField)
          .limit(batchSize);
        if (cursor) query = query.startAfter(cursor);
        const snapshot = await query.get();
        if (snapshot.empty) break;

        const associatedPoints =
          collection === "trackingEvents"
            ? await db.getAll(
                ...snapshot.docs.map((doc) =>
                  db.doc(`trackingPoints/${doc.id}`),
                ),
              )
            : [];
        const batch = db.batch();
        snapshot.docs.forEach((doc) => batch.delete(doc.ref));
        associatedPoints
          .filter((doc) => doc.exists)
          .forEach((doc) => batch.delete(doc.ref));
        await batch.commit();
        deletedCount +=
          snapshot.size + associatedPoints.filter((doc) => doc.exists).length;
        cursor = snapshot.docs[snapshot.docs.length - 1];
        if (snapshot.size < batchSize) break;
      }
    }
    return { deletedCount };
  }
  return { ingest, live, history, deleteHistory };
}
