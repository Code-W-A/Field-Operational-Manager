import { createHash } from "node:crypto";
import type { Firestore, Transaction } from "firebase-admin/firestore";
import {
  assertLocationCapture,
  type LocationCapture,
  type LocationEvent,
  type LocationEventKind,
} from "@/packages/fom-domain/location-events";
import {
  TRACKING_RETENTION_MS,
  type TrackingPoint,
} from "@/packages/fom-domain/tracking";

/** Read before business writes, commit only after the operation has passed validation. */
export async function prepareLocationEvent(
  db: Firestore,
  tx: Transaction,
  input: {
    uid: string;
    mutationId: string;
    sessionId: string;
    kind: LocationEventKind;
    occurredAt: number;
    capture?: LocationCapture;
    workId?: string;
    equipmentId?: string;
  },
) {
  if (!input.capture) return undefined; // Older clients retain their contract.
  assertLocationCapture(input.capture, input.occurredAt);
  const { uid, sessionId, kind, occurredAt } = input;
  const source = input.capture;
  const capture: LocationCapture =
    source.status === "available"
      ? {
          status: source.status,
          capturedAt: source.capturedAt,
          lat: source.lat,
          lng: source.lng,
          accuracy: source.accuracy,
        }
      : {
          status: source.status,
          capturedAt: source.capturedAt,
          reason: source.reason,
        };
  const id = createHash("sha256")
    .update(`event/${uid}/${input.mutationId}/${kind}`)
    .digest("hex");
  const latestRef = db.doc(`trackingLatest/${uid}`);
  const latest = (await tx.get(latestRef)).data();
  const context = {
    ...(input.workId ? { workId: input.workId } : {}),
    ...(input.equipmentId ? { equipmentId: input.equipmentId } : {}),
  };
  const event: LocationEvent = {
    id,
    uid,
    sessionId,
    kind,
    occurredAt,
    capture,
    ...context,
  };
  const point: TrackingPoint | undefined =
    capture.status === "available"
      ? {
          id,
          sessionId,
          eventKind: kind,
          capturedAt: capture.capturedAt,
          lat: capture.lat,
          lng: capture.lng,
          accuracy: capture.accuracy,
          ...context,
        }
      : undefined;
  return {
    event,
    commit() {
      tx.set(db.doc(`trackingEvents/${id}`), {
        ...event,
        expiresAt: occurredAt + TRACKING_RETENTION_MS,
      });
      if (point)
        tx.set(db.doc(`trackingPoints/${id}`), {
          ...point,
          uid,
          receivedAt: Date.now(),
          expiresAt: point.capturedAt + TRACKING_RETENTION_MS,
        });
      const update: Record<string, unknown> = {};
      if (!latest?.lastEvent || occurredAt >= latest.lastEvent.occurredAt)
        Object.assign(update, {
          mode: "events",
          lastEvent: event,
          sessionId,
          state: kind === "checkout" ? "stopped" : "event",
          statusAt: occurredAt,
          expiresAt: occurredAt + TRACKING_RETENTION_MS,
        });
      if (
        point &&
        (!latest?.point || point.capturedAt >= latest.point.capturedAt)
      )
        update.point = point;
      if (Object.keys(update).length)
        tx.set(latestRef, update, { merge: true });
    },
  };
}

// Keep operation receipts useful for retries without retaining a second GPS history.
export function locationEventReceipt(event: LocationEvent) {
  const { capture, ...metadata } = event;
  return {
    ...metadata,
    capture:
      capture.status === "available"
        ? {
            status: capture.status,
            capturedAt: capture.capturedAt,
            accuracy: capture.accuracy,
          }
        : capture,
  };
}
export function locationCommandFingerprint(command: unknown): string {
  return JSON.stringify(command, (key, value) =>
    key === "locationCapture"
      ? {
          digest: createHash("sha256")
            .update(JSON.stringify(value))
            .digest("hex"),
        }
      : value,
  );
}
