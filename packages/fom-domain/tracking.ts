import { attendanceDay } from "./attendance-policy";
import { attendanceZonedDateTimeToUtcMs } from "./attendance-timezone";
export const TRACKING_RETENTION_MS = 90 * 86400000;
export const TRACKING_GAP_MS = 5 * 60000;
export const TRACKING_STALE_MS = 2 * 60000;
export const TRACKING_BATCH_SIZE = 100;
export type TrackingState =
  "active" | "gps_unavailable" | "permission_denied" | "stopped";
export type TrackingPoint = {
  id: string;
  sessionId: string;
  capturedAt: number;
  lat: number;
  lng: number;
  accuracy: number;
};
export type TrackingStop = {
  lat: number;
  lng: number;
  startedAt: number;
  endedAt: number;
  minutes: number;
  sessionId: string;
};
export function trackingDistance(
  a: Pick<TrackingPoint, "lat" | "lng">,
  b: Pick<TrackingPoint, "lat" | "lng">,
) {
  const rad = Math.PI / 180,
    dLat = (b.lat - a.lat) * rad,
    dLng = (b.lng - a.lng) * rad;
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(a.lat * rad) * Math.cos(b.lat * rad) * Math.sin(dLng / 2) ** 2;
  return 6371000 * 2 * Math.asin(Math.sqrt(Math.min(1, h)));
}
export function validTrackingPoint(p: TrackingPoint, now: number): boolean {
  return (
    !!p &&
    typeof p.id === "string" &&
    /^[A-Za-z0-9_.:-]{1,128}$/.test(p.id) &&
    typeof p.sessionId === "string" &&
    /^[A-Za-z0-9_-]{1,200}$/.test(p.sessionId) &&
    [p.lat, p.lng, p.accuracy, p.capturedAt].every(
      (v) => typeof v === "number" && Number.isFinite(v),
    ) &&
    Math.abs(p.lat) <= 90 &&
    Math.abs(p.lng) <= 180 &&
    p.accuracy >= 0 &&
    p.accuracy <= 10000 &&
    p.capturedAt >= now - TRACKING_RETENTION_MS &&
    p.capturedAt <= now
  );
}
export function trackingDayBounds(day: string) {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) throw Error("Data este invalidă.");
  const [year, month, date] = day.split("-").map(Number);
  const start = attendanceZonedDateTimeToUtcMs({
    year,
    month,
    day: date,
    hour: 0,
    minute: 0,
  });
  if (attendanceDay(start) !== day) throw Error("Data este invalidă.");
  const next = new Date(Date.UTC(year, month - 1, date + 1));
  const end = attendanceZonedDateTimeToUtcMs({
    year: next.getUTCFullYear(),
    month: next.getUTCMonth() + 1,
    day: next.getUTCDate(),
    hour: 0,
    minute: 0,
  });
  return { start, end };
}
export function trackingRoute(points: TrackingPoint[]) {
  const ordered = [...points].sort(
    (a, b) => a.capturedAt - b.capturedAt || a.id.localeCompare(b.id),
  );
  const segments: TrackingPoint[][] = [],
    stops: TrackingStop[] = [];
  let segment: TrackingPoint[] = [],
    cluster: TrackingPoint[] = [];
  const finishStop = () => {
    if (cluster.length > 1) {
      const first = cluster[0],
        last = cluster[cluster.length - 1];
      if (last.capturedAt - first.capturedAt >= 180000)
        stops.push({
          lat: first.lat,
          lng: first.lng,
          startedAt: first.capturedAt,
          endedAt: last.capturedAt,
          minutes: Math.floor((last.capturedAt - first.capturedAt) / 60000),
          sessionId: first.sessionId,
        });
    }
    cluster = [];
  };
  for (const point of ordered) {
    if (point.accuracy > 100) {
      finishStop();
      if (segment.length) segments.push(segment);
      segment = [];
      continue;
    }
    const previous = segment.at(-1);
    if (
      previous &&
      (point.sessionId !== previous.sessionId ||
        point.capturedAt - previous.capturedAt > TRACKING_GAP_MS)
    ) {
      finishStop();
      segments.push(segment);
      segment = [];
    }
    segment.push(point);
    if (cluster.length && trackingDistance(cluster[0], point) > 100)
      finishStop();
    cluster.push(point);
  }
  finishStop();
  if (segment.length) segments.push(segment);
  return { segments, stops };
}
