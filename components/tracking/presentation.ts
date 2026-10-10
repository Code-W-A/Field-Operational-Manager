import {
  TRACKING_STALE_MS,
  type TrackingPoint,
} from "@/packages/fom-domain/tracking";

export type Technician = {
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
  if (!technician.sessionId)
    return { label: "Tracking oprit", tone: "gray", active: false };
  if (technician.state === "permission_denied")
    return { label: "Permisiune GPS lipsă", tone: "red", active: false };
  if (technician.state === "gps_unavailable")
    return { label: "GPS indisponibil", tone: "red", active: false };
  if (!technician.point)
    return { label: "Fără poziție GPS", tone: "gray", active: false };
  if (now - technician.point.capturedAt > TRACKING_STALE_MS)
    return { label: "Neactualizată", tone: "gray", active: false };
  if (technician.state !== "active")
    return { label: "Tracking indisponibil", tone: "gray", active: false };
  return { label: "GPS activ", tone: "green", active: true };
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
