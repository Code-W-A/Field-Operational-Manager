/** Phase 2 is opt-in through a server-issued grant. No generic offline commands. */
export type OfflineWorkEvent = {
  sessionId: string;
  grantId: string;
  deviceId: string;
  event: "start" | "stop";
  clockDriftMs: number;
};
export const OFFLINE_CLOCK_TOLERANCE_MS = 5 * 60 * 1000;
export function assertOfflineWorkEvent(
  value: any,
): asserts value is OfflineWorkEvent {
  if (
    !value ||
    Object.keys(value).sort().join(",") !==
      "clockDriftMs,deviceId,event,grantId,sessionId" ||
    ![value.sessionId, value.grantId, value.deviceId].every(
      (v) => typeof v === "string" && /^[\w-]{8,120}$/.test(v),
    ) ||
    !["start", "stop"].includes(value.event) ||
    !Number.isFinite(value.clockDriftMs)
  )
    throw new Error("Eveniment offline invalid.");
}
export function assertOfflineTime(
  start: number,
  end: number | null,
  grant: { confirmedAt: number; expiresAt: number },
  now: number,
  drift: number,
) {
  if (
    ![start, now, drift, grant.confirmedAt, grant.expiresAt].every(
      Number.isFinite,
    ) ||
    grant.expiresAt <= grant.confirmedAt ||
    grant.expiresAt - grant.confirmedAt > 86400000 ||
    (end !== null && !Number.isFinite(end)) ||
    start < grant.confirmedAt ||
    start >= grant.expiresAt ||
    start > now + OFFLINE_CLOCK_TOLERANCE_MS ||
    (end !== null &&
      (end < start ||
        end >= grant.expiresAt ||
        end > now + OFFLINE_CLOCK_TOLERANCE_MS)) ||
    Math.abs(drift) > OFFLINE_CLOCK_TOLERANCE_MS
  )
    throw new Error("Intervalul sau ora telefonului necesită verificare.");
}
export function soleTechnician(
  work: Record<string, any>,
  uid: string,
  name: string,
): boolean {
  const ids = [...new Set(work.technicianIds || [])];
  const names = [...new Set(work.tehnicieni || [])];
  return (
    (ids.length === 1 &&
      ids[0] === uid &&
      (!names.length || (names.length === 1 && names[0] === name))) ||
    (!ids.length && names.length === 1 && !!name && names[0] === name)
  );
}
export function stableDocument(value: unknown): string {
  return JSON.stringify(value, (key, v) =>
    v && typeof v === "object" && !Array.isArray(v)
      ? Object.fromEntries(
          Object.entries(v)
            .filter(([, x]) => x !== undefined)
            .sort(([a], [b]) => a.localeCompare(b)),
        )
      : v,
  );
}
/** Vector strokes are data, never executable SVG/XML. */
export function signaturePaths(value: unknown): string[] {
  if (
    !Array.isArray(value) ||
    value.length > 150 ||
    value.some(
      (p) =>
        typeof p !== "string" ||
        p.length > 20000 ||
        !/^M [\d. -]+(?: L [\d. -]+)+$/.test(p),
    ) ||
    JSON.stringify(value).length > 60000
  )
    throw new Error("Semnătură invalidă sau prea mare.");
  return value;
}

export function offlineDuration(seconds: number) {
  const minutes = Math.round(Math.max(0, seconds) / 60);
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}
