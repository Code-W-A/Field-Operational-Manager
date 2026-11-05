import { OFFLINE_CLOCK_TOLERANCE_MS, stableDocument } from "./offline-work";
import { revisionEquipmentIds } from "./revision-equipment-ids";

/** A stop of an already official interval. Never authorizes an offline start. */
export type OfflineStopInterval = {
  equipmentId: string;
  startedAt: string;
  uid?: string;
};
export type OfflineStopEvent = {
  grantId: string;
  deviceId: string;
  clockDriftMs: number;
  intervals: OfflineStopInterval[];
};
const instant = (v: unknown): v is string =>
  typeof v === "string" && Number.isFinite(Date.parse(v));
export function assertOfflineStopEvent(v: any): asserts v is OfflineStopEvent {
  if (
    !v ||
    Object.keys(v).sort().join(",") !==
      "clockDriftMs,deviceId,grantId,intervals" ||
    ![v.grantId, v.deviceId].every(
      (x) => typeof x === "string" && /^[\w-]{8,120}$/.test(x),
    ) ||
    !Number.isFinite(v.clockDriftMs) ||
    !Array.isArray(v.intervals) ||
    !v.intervals.length ||
    v.intervals.length > 500 ||
    v.intervals.some(
      (i: any) =>
        !i ||
        Object.keys(i).some(
          (k) => !["equipmentId", "startedAt", "uid"].includes(k),
        ) ||
        typeof i.equipmentId !== "string" ||
        !/^[\w-]{1,160}$/.test(i.equipmentId) ||
        !instant(i.startedAt) ||
        (i.uid !== undefined &&
          (typeof i.uid !== "string" || !/^[\w-]{1,160}$/.test(i.uid))),
    )
  )
    throw new Error("Oprire locală invalidă.");
}
export function stopIntervals(work: any, sheet?: any): OfflineStopInterval[] {
  if (sheet)
    return (sheet.timeIntervals || [])
      .filter((i: any) => !i.endedAt && instant(i.startedAt))
      .map((i: any) => ({
        equipmentId: sheet.equipmentId,
        uid: i.uid,
        startedAt: i.startedAt,
      }));
  if (work.tipLucrare === "Revizie")
    return revisionEquipmentIds(work).flatMap((id) => {
      const t = work.revisionEquipmentTimes?.[id];
      return instant(t?.startIso) && !t.endIso
        ? [{ equipmentId: id, startedAt: t.startIso }]
        : [];
    });
  const id =
    work.equipmentId || work.equipmentIds?.[0] || work.mobileEquipment?.[0]?.id;
  return id &&
    work.equipmentVerified &&
    instant(work.timpSosire) &&
    !work.timpPlecare
    ? [{ equipmentId: String(id), startedAt: work.timpSosire }]
    : [];
}
export function sameStopIntervals(
  a: OfflineStopInterval[],
  b: OfflineStopInterval[],
) {
  const canonical = (v: OfflineStopInterval[]) =>
    v.map((i) => stableDocument(i)).sort();
  return stableDocument(canonical(a)) === stableDocument(canonical(b));
}
export function assertOfflineStopTime(
  event: OfflineStopEvent,
  at: number,
  grant: { confirmedAt: number; expiresAt: number },
  now: number,
) {
  if (
    ![at, now, grant.confirmedAt, grant.expiresAt, event.clockDriftMs].every(
      Number.isFinite,
    ) ||
    grant.expiresAt <= grant.confirmedAt ||
    grant.expiresAt - grant.confirmedAt > 86400000 ||
    at < grant.confirmedAt ||
    at >= grant.expiresAt ||
    at > now + OFFLINE_CLOCK_TOLERANCE_MS ||
    Math.abs(event.clockDriftMs) > OFFLINE_CLOCK_TOLERANCE_MS ||
    event.intervals.some(
      (i) => !instant(i.startedAt) || Date.parse(i.startedAt) > at,
    )
  )
    throw new Error("Intervalul sau ora telefonului necesită verificare.");
}
