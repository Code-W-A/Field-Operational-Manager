import { revisionEquipmentIds, offlineDuration, type RecordData } from "@/packages/fom-domain";

/** Report signing must not extend equipment intervals already confirmed by revision.save. */
export function revisionStoppedTime(work: RecordData) {
  if (work.tipLucrare !== "Revizie") return undefined;
  const ids = revisionEquipmentIds(work);
  if (!ids.length) return undefined;
  const times = ids.map(id => work.revisionEquipmentTimes?.[id]);
  if (times.some(t => !t?.startIso || !t.endIso || !Number.isFinite(Date.parse(t.startIso)) || !Number.isFinite(Date.parse(t.endIso)) || Date.parse(t.endIso) < Date.parse(t.startIso))) return undefined;
  return {
    endedAt: new Date(Math.max(...times.map(t => Date.parse(t.endIso)))).toISOString(),
    duration: offlineDuration(times.reduce((sum, t) => sum + (Date.parse(t.endIso) - Date.parse(t.startIso)) / 1000, 0)),
  };
}
