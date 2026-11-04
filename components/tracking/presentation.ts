import type { LocationEvent } from "@/packages/fom-domain/location-events";
import { type TrackingPoint } from "@/packages/fom-domain/tracking";

export type Technician = {
  mode?: "events" | "legacy";
  lastEvent?: LocationEvent | null;
  uid: string;
  name: string;
  sessionId: string | null;
  point: TrackingPoint | null;
  stale: boolean;
  state: string;
};
export type GpsDisplay = {
  label: string;
  tone: "green" | "gray" | "red";
  active: boolean;
};
export function gpsDisplay(technician: Technician, now: number): GpsDisplay {
  return technician.point
    ? {
        label: technician.point.eventKind
          ? "Poziție înregistrată"
          : "Tracking continuu (istoric)",
        tone: "green",
        active: true,
      }
    : { label: "Fără poziție înregistrată", tone: "gray", active: false };
}
export function initials(name: string) {
  return (
    name
      .trim()
      .split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => Array.from(part)[0])
      .join("")
      .toLocaleUpperCase("ro-RO") || "T"
  );
}
export function trackingTime(value: number) {
  return new Date(value).toLocaleTimeString("ro-RO", {
    timeZone: "Europe/Bucharest",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function trackingDateTime(value: number) {
  return new Date(value).toLocaleString("ro-RO", {
    timeZone: "Europe/Bucharest",
    dateStyle: "short",
    timeStyle: "short",
  });
}

export function positionAge(capturedAt: number, now: number) {
  const minutes = Math.max(0, Math.floor((now - capturedAt) / 60000));
  return minutes < 1
    ? "acum"
    : minutes < 60
      ? `acum ${minutes} min`
      : minutes < 1440
        ? `acum ${Math.floor(minutes / 60)} h`
        : `acum ${Math.floor(minutes / 1440)} zile`;
}
