import { DomainError } from "./errors";

export type LocationCapture =
  | {
      status: "available";
      capturedAt: number;
      lat: number;
      lng: number;
      accuracy: number;
    }
  | {
      status: "unavailable";
      capturedAt: number;
      reason:
        | "permission_denied"
        | "gps_disabled"
        | "timeout"
        | "unavailable"
        | "background"
        | "cancelled";
    };
export type LocationEventKind = "checkin" | "checkout" | "qr_verified";
export type LocationEvent = {
  id: string;
  uid: string;
  sessionId: string;
  kind: LocationEventKind;
  occurredAt: number;
  capture: LocationCapture;
  workId?: string;
  equipmentId?: string;
};
export const LOCATION_EVENT_LABELS: Record<LocationEventKind, string> = {
  checkin: "Pontare",
  checkout: "Depontare",
  qr_verified: "Verificare QR",
};
export const LOCATION_MISSING_WARNING = "Acțiune confirmată fără locație";
export function assertLocationCapture(
  value: unknown,
  occurredAt: number,
): asserts value is LocationCapture {
  const v = value as LocationCapture;
  if (
    !v ||
    !Number.isFinite(occurredAt) ||
    !Number.isFinite(v.capturedAt) ||
    Math.abs(v.capturedAt - occurredAt) > 300000
  )
    throw new DomainError("Momentul localizării este invalid.");
  if (v.status === "available") {
    if (
      ![v.lat, v.lng, v.accuracy].every(
        (x) => typeof x === "number" && Number.isFinite(x),
      ) ||
      Math.abs(v.lat) > 90 ||
      Math.abs(v.lng) > 180 ||
      v.accuracy < 0 ||
      v.accuracy > 10000
    )
      throw new DomainError("Coordonatele localizării sunt invalide.");
  } else if (
    v.status !== "unavailable" ||
    ![
      "permission_denied",
      "gps_disabled",
      "timeout",
      "unavailable",
      "background",
      "cancelled",
    ].includes(v.reason)
  ) {
    throw new DomainError("Rezultatul localizării este invalid.");
  }
}
